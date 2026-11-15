import test from 'node:test';
import assert from 'node:assert/strict';
import { decimalPrice, importPrice, normalizeCandidates, parseImportSource, importDiff, mountMenuImport } from '../backend/menuImport';
import type { Express, RequestHandler, Request, Response } from 'express';
import type { Pool } from 'pg';
import * as XLSX from 'xlsx';

const draft={categories:[{id:'cat_a',name:'Lanches'}],products:[{id:'prod_a',name:'Sanduíche',categoryId:'cat_a',priceCents:1250}]};
const upload=(text:string,mimeType='text/csv')=>({filename:'menu.csv',mimeType,contentBase64:Buffer.from(text).toString('base64')});
test('prices never infer ambiguous cents or alternative amounts',()=>{
  for (const value of ['12,50',-1,NaN,Infinity,12.5,10000001,null]) assert.equal(importPrice(value),null);
  assert.equal(importPrice(0),0);
  for (const value of ['12/15','1.234,50','12,5','a partir de 12','-12,00','12 ou 15']) assert.equal(decimalPrice(value),null,value);
  assert.equal(decimalPrice('R$ 12,50'),1250);
  assert.equal(decimalPrice(12.5),1250);
});
test('schema rejects untrusted fields, missing category and duplicate IDs',()=>{
  assert.throws(()=>normalizeCandidates({...draft,tenant_slug:'another'}));
  assert.throws(()=>normalizeCandidates({...draft,categories:[draft.categories[0],draft.categories[0]]}));
  assert.throws(()=>normalizeCandidates({...draft,products:[{...draft.products[0],categoryId:'foreign'}]}));
  assert.throws(()=>normalizeCandidates({...draft,products:[{...draft.products[0],name:'<script>alert(1)</script>'}]}));
  assert.throws(()=>normalizeCandidates({...draft,products:[{...draft.products[0],isAvailable:'false'}]}));
});
test('draft accepts unresolved prices but never silently preserves string cents',()=>{
  const result=normalizeCandidates({...draft,products:[{...draft.products[0],priceCents:'12,50'}]});
  assert.equal(result.products[0].priceCents,null);
  assert.equal(result.products[0].isAvailable,true);
});
test('PDF without an authorized extractor yields persisted manual draft payload',()=>{
  const result=parseImportSource(upload('%PDF-1.7\nmanual menu','application/pdf'));
  assert.deepEqual(result.candidates,{categories:[],products:[]});
  assert.match(result.warnings[0],/indisponível/);
  assert.equal('contentBase64' in result,false);
});
test('upload verifies signatures, limits and active content',()=>{
  assert.throws(()=>parseImportSource(upload('not a PDF','application/pdf')));
  assert.throws(()=>parseImportSource(upload('%PDF-1.7 /JavaScript','application/pdf')));
  assert.throws(()=>parseImportSource({...upload('x'),contentBase64:'%%%'}));
  assert.throws(()=>parseImportSource(upload('x'.repeat(650*1024+1))));
  assert.throws(()=>parseImportSource(upload('GIF89a','image/gif')));
});
test('CSV extraction preserves empty and ambiguous prices as unresolved',()=>{
  const result=parseImportSource(upload('category,name,price\nLanches,Burger,12.50\nLanches,Especial,12/15\nBebidas,Água,\n'));
  assert.equal(result.candidates.categories.length,2);
  assert.deepEqual(result.candidates.products.map(p=>p.priceCents),[1250,null,null]);
});
test('formula injection and oversized ranges are rejected',()=>{
  assert.throws(()=>parseImportSource(upload('category,name,price\nLanches,=HYPERLINK("x"),12.50')));
  assert.throws(()=>parseImportSource(upload('category,name,price\nLanches,@SUM(A1),12.50')));
});
test('XLSX extraction handles explicit cents and rejects workbook formulas',()=>{
  const workbook=XLSX.utils.book_new();
  const sheet=XLSX.utils.aoa_to_sheet([['category','name','priceCents'],['Lanches','Burger',1250]]);
  XLSX.utils.book_append_sheet(workbook,sheet,'Menu');
  const source=()=>({filename:'menu.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',contentBase64:XLSX.write(workbook,{type:'base64',bookType:'xlsx'})});
  assert.equal(parseImportSource(source()).candidates.products[0].priceCents,1250);
  sheet.C2={t:'n',v:1250,f:'SUM(1000,250)'};
  assert.throws(()=>parseImportSource(source()));
});
test('identical source receives stable checksum independently of generated IDs',()=>{
  const first=parseImportSource(upload('category,name,price\nLanches,Burger,12.50'));
  const second=parseImportSource(upload('category,name,price\nLanches,Burger,12.50'));
  assert.equal(first.checksum,second.checksum);
  assert.notEqual(first.candidates.products[0].id,second.candidates.products[0].id);
});
test('diff makes append/update and name collisions explicit without deletion',()=>{
  const candidates=normalizeCandidates(draft);
  const diff=importDiff(candidates,{categories:[{id:'cat_b',name:'LANCHES'}],products:[{id:'prod_a',name:'Old'},{id:'prod_b',name:'Sanduíche'}]});
  assert.equal(diff.categoriesAdded.length,1);
  assert.equal(diff.productsUpdated.length,1);
  assert.equal(diff.productsAdded.length,0);
  assert.equal(diff.duplicates.length,2);
  assert.equal('productsDeleted' in diff,false);
});

async function routeFixture(method:string,path:string,body:unknown,enabled:boolean,job?:Record<string,unknown>) {
  const calls:Array<{sql:string;params:unknown[]}>=[],routes:Array<{method:string;path:string;handlers:RequestHandler[]}>=[];
  const client={query:async(sql:string,params:unknown[]=[])=>{
    calls.push({sql,params});
    if (sql.includes('FROM tenants')) return {rows:[{id:'tenant-a',slug:'a'}]};
    if (sql.includes('FROM intelligence_features')) return {rows:[{released:enabled,enabled}]};
    if (sql.includes('FROM menu_import_jobs')) return {rows:job?[job]:[]};
    return {rows:[]};
  },release:()=>{}};
  const app=Object.fromEntries(['get','post','patch'].map(method=>[method,(path:string,...handlers:RequestHandler[])=>routes.push({method,path,handlers})])) as unknown as Express;
  const guard:RequestHandler=(_req,_res,next)=>next();
  let refreshed=false;
  mountMenuImport(app,{connect:async()=>client} as unknown as Pool,guard,async()=>{refreshed=true;});
  assert.ok(routes.every(route=>route.handlers[0]===guard));
  const route=routes.find(route=>route.method===method && route.path.endsWith(path));
  assert.ok(route);
  const req={params:{slug:'a',id:'foreign-job'},body,user:{sub:'owner-a'}} as unknown as Request;
  let status=200,result:unknown;
  const res={statusCode:200,status(this:Response,code:number){status=code;this.statusCode=code;return this;},json(value:unknown){result=value;return this;}} as unknown as Response;
  let forwarded:unknown;
  await route.handlers[1](req,res,error=>{forwarded=error;});
  if (forwarded) throw forwarded;
  return {calls,status,result,refreshed};
}
test('disabled feature rejects before parsing uploads or writing job data',async()=>{
  const result=await routeFixture('post','menu-imports',{contentBase64:'invalid'},false);
  assert.equal(result.status,403);
  assert.ok(result.calls.some(call=>call.sql==='ROLLBACK'));
  assert.ok(!result.calls.some(call=>call.sql.includes('menu_import_jobs')));
});
test('job lookup binds both tenant slug and job ID and fails closed',async()=>{
  const result=await routeFixture('get','/:id',{},true);
  assert.equal(result.status,404);
  const lookup=result.calls.find(call=>call.sql.includes('FROM menu_import_jobs'));
  assert.deepEqual(lookup?.params,['a','foreign-job']);
  assert.equal(result.refreshed,false);
});
test('stale publication rolls back before touching catalog or refreshing cache',async()=>{
  const result=await routeFixture('post','/:id/publish',{version:1,catalogHash:'stale',diffHash:'stale',confirm:true},true,{id:'job',status:'draft',version:1,candidates:normalizeCandidates(draft)});
  assert.equal(result.status,409);
  assert.ok(result.calls.some(call=>call.sql==='ROLLBACK'));
  assert.ok(!result.calls.some(call=>/^INSERT INTO (products|categories)/.test(call.sql)));
  assert.equal(result.refreshed,false);
});
