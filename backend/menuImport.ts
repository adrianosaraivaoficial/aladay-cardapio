import crypto from 'node:crypto';
import type { Express, Request, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import * as XLSX from 'xlsx';
import { HttpError, transactionalRoute } from './database';
import { categoryWrite, productWrite, tenantLock } from './catalog';
import { requireFeature } from './intelligence';

type Obj = Record<string, unknown>;
export type ImportCandidates = { categories: Array<{id:string;name:string;order:number}>; products: Array<{
  id:string; name:string; description:string; categoryId:string; priceCents:number|null;
  imageUrl:string; isAvailable:boolean; isFeatured:boolean; optionGroups:unknown[];
}> };
const fail = (message:string):never => { throw new HttpError(400,message); };
function object(value:unknown):Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('Objeto inválido.');
  return value as Obj;
}
function strict(value:Obj, keys:string[]) {
  if (Object.keys(value).some(key=>!keys.includes(key))) fail('Campo não permitido no rascunho.');
}
function string(value:unknown, limit:number, required=false):string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length>limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return fail('Texto inválido.');
  const result=value.trim();
  if (required && !result) return fail('Nome obrigatório.');
  if (/<\s*(?:script|iframe|object|embed)\b|javascript:|ignore\s+(?:all\s+)?(?:previous\s+)?instructions|ignore\s+(?:as\s+)?instru[çc][õo]es/i.test(result)) return fail('Conteúdo suspeito.');
  return result;
}
function identifier(value:unknown,prefix:string):string {
  if (value === undefined) return `${prefix}_${crypto.randomUUID()}`;
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) return fail('Identificador inválido.');
  return value;
}
export function importPrice(value:unknown):number|null {
  if (Number.isSafeInteger(value) && Number(value)>=0 && Number(value)<=10000000) return Number(value);
  return null;
}
export function decimalPrice(value:unknown):number|null {
  if (typeof value === 'number') return Number.isFinite(value) && value>=0 && Number.isSafeInteger(Math.round(value*100)) && Math.abs(value*100-Math.round(value*100))<1e-6 ? importPrice(Math.round(value*100)) : null;
  if (typeof value !== 'string') return null;
  const text=value.trim().replace(/^R\$\s*/, '');
  // Thousands separators and multiple alternatives are deliberately ambiguous.
  if (!/^\d+(?:[.,]\d{2})?$/.test(text)) return null;
  return importPrice(Math.round(Number(text.replace(',','.'))*100));
}
export function normalizeCandidates(value:unknown):ImportCandidates {
  const input=object(value); strict(input,['categories','products']);
  if (!Array.isArray(input.categories) || input.categories.length>1000 || !Array.isArray(input.products) || input.products.length>5000) return fail('Limite de categorias ou produtos excedido.');
  const categories=input.categories.map((entry,index)=>{
    const row=object(entry); strict(row,['id','name','order']);
    if (row.order!==undefined && (!Number.isInteger(row.order) || Number(row.order)<0)) fail('Ordem inválida.');
    return {id:identifier(row.id,'cat'),name:string(row.name,120,true),order:Number(row.order??index+1)};
  });
  const ids=new Set(categories.map(c=>c.id));
  if (ids.size!==categories.length) fail('Identificador de categoria duplicado.');
  const products=input.products.map(entry=>{
    const row=object(entry); strict(row,['id','name','description','categoryId','priceCents','imageUrl','isAvailable','isFeatured','optionGroups']);
    const categoryId=string(row.categoryId,80);
    if (!ids.has(categoryId)) fail('Produto sem categoria válida no rascunho.');
    for (const key of ['isAvailable','isFeatured']) if (row[key]!==undefined && typeof row[key]!=='boolean') fail('Status inválido.');
    const imageUrl=string(row.imageUrl,2000);
    if (imageUrl && !/^https:\/\//.test(imageUrl) && !/^\/(?!\/)/.test(imageUrl)) fail('Imagem inválida.');
    // Add-ons are reviewed through the existing catalog editor after importing.
    if (row.optionGroups!==undefined && (!Array.isArray(row.optionGroups) || row.optionGroups.length)) fail('Adicionais devem ser revisados no catálogo após importar.');
    return {id:identifier(row.id,'prod'),name:string(row.name,150,true),description:string(row.description,2000),categoryId,priceCents:importPrice(row.priceCents),imageUrl,isAvailable:row.isAvailable!==false,isFeatured:row.isFeatured===true,optionGroups:[]};
  });
  if (new Set(products.map(p=>p.id)).size!==products.length) fail('Identificador de produto duplicado.');
  return {categories,products};
}
function zipBound(buffer:Buffer) {
  let entries=0,total=0;
  for (let i=0;i+46<=buffer.length;i++) {
    if (buffer.readUInt32LE(i)!==0x02014b50) continue;
    entries++; total+=buffer.readUInt32LE(i+24);
    const length=buffer.readUInt16LE(i+28),extra=buffer.readUInt16LE(i+30),comment=buffer.readUInt16LE(i+32);
    const name=buffer.subarray(i+46,i+46+length).toString();
    if (/vbaProject|externalLinks|\.\./i.test(name) || entries>1000 || total>20*1024*1024) fail('Planilha compactada insegura ou excessiva.');
    i+=45+length+extra+comment;
  }
  if (!entries) fail('Planilha XLSX inválida.');
}
export function parseImportSource(value:unknown):{candidates:ImportCandidates;warnings:string[];filename:string|null;mimeType:string|null;checksum:string} {
  const input=object(value);
  if ('categories' in input || 'products' in input) {
    strict(input,['categories','products']);
    const checksum=hash(input);
    return {candidates:normalizeCandidates(input),warnings:[],filename:null,mimeType:null,checksum};
  }
  strict(input,['filename','mimeType','contentBase64']);
  const filename=string(input.filename,200,true),mimeType=string(input.mimeType,120,true);
  if (typeof input.contentBase64!=='string' || input.contentBase64.length>900000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(input.contentBase64)) fail('Arquivo base64 inválido ou excessivo.');
  const bytes=Buffer.from(input.contentBase64 as string,'base64');
  if (!bytes.length || bytes.length>650*1024) fail('Arquivo deve ter até 650 KB.');
  const signatures:Record<string,()=>boolean>={
    'application/pdf':()=>bytes.subarray(0,5).toString()==='%PDF-',
    'image/png':()=>bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex')),
    'image/jpeg':()=>bytes[0]===255&&bytes[1]===216&&bytes[2]===255,
    'image/webp':()=>bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP',
    'text/csv':()=>!bytes.includes(0)&&!bytes.toString('utf8').includes('\ufffd'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':()=>bytes.subarray(0,4).equals(Buffer.from('504b0304','hex')),
  };
  if (!signatures[mimeType]?.()) fail('Tipo ou assinatura de arquivo inválido.');
  if (/\/JavaScript|\/JS\b|\/Launch|\/EmbeddedFile|<script|javascript:|ignore\s+(all|previous)\s+instructions/i.test(bytes.toString('latin1'))) fail('Conteúdo ativo ou suspeito.');
  const checksum=hash({mimeType,bytes:bytes.toString('base64')});
  if (mimeType!=='text/csv' && !mimeType.includes('spreadsheetml')) return {candidates:{categories:[],products:[]},warnings:['Extração de PDF/imagem indisponível: nenhum provedor autorizado. Preencha e revise o rascunho manualmente. O arquivo não é armazenado.'],filename,mimeType,checksum};
  if (mimeType.includes('spreadsheetml')) zipBound(bytes);
  let workbook:XLSX.WorkBook;
  try { workbook=XLSX.read(bytes,{type:'buffer',cellFormula:true,raw:true}); } catch { return fail('Planilha inválida.'); }
  const sheet=workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) fail('Planilha vazia.');
  const range=XLSX.utils.decode_range(sheet['!ref']||'A1');
  if (range.e.r>5000 || range.e.c>30) fail('Planilha excede limites.');
  for (const [key,cell] of Object.entries(sheet)) if (!key.startsWith('!') && (cell.f || (typeof cell.v==='string' && /^[=+@]/.test(cell.v.trim())))) fail('Fórmulas não são permitidas.');
  const rows=XLSX.utils.sheet_to_json<Obj>(sheet,{defval:''});
  const categories:ImportCandidates['categories']=[],products:Obj[]=[];
  for (const row of rows) {
    strict(row,['category','name','description','priceCents','price']);
    const categoryName=string(row.category,120,true);
    let category=categories.find(c=>c.name===categoryName);
    if (!category) {category={id:identifier(undefined,'cat'),name:categoryName,order:categories.length+1};categories.push(category);}
    products.push({name:row.name,description:row.description,categoryId:category.id,priceCents:row.priceCents!==undefined ? (/^\d+$/.test(String(row.priceCents)) ? importPrice(Number(row.priceCents)) : null) : decimalPrice(row.price)});
  }
  return {candidates:normalizeCandidates({categories,products}),warnings:['Revise todas as linhas. Preços ambíguos ficam pendentes. Adicionais e imagens não são extraídos.'],filename,mimeType,checksum};
}
function hash(value:unknown) {return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');}
async function snapshot(client:PoolClient,slug:string) {
  const categories=await client.query('SELECT id,name,display_order FROM categories WHERE tenant_slug=$1 ORDER BY id',[slug]);
  const products=await client.query('SELECT id,category_id,name,description,price_cents,image_url,is_available,is_featured,option_groups FROM products WHERE tenant_slug=$1 ORDER BY id',[slug]);
  return {categories:categories.rows,products:products.rows};
}
export function importDiff(candidates:ImportCandidates,current:{categories:Obj[];products:Obj[]}) {
  const categoriesAdded=candidates.categories.filter(c=>!current.categories.some(old=>old.id===c.id));
  const categoriesUpdated=candidates.categories.filter(c=>current.categories.some(old=>old.id===c.id));
  const productsAdded=candidates.products.filter(p=>!current.products.some(old=>old.id===p.id));
  const productsUpdated=candidates.products.filter(p=>current.products.some(old=>old.id===p.id));
  const key=(name:unknown)=>String(name).normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
  const duplicates: Array<{type:string;id:string;name:string}>=[];
  for (const [type,rows,existing] of [['category',candidates.categories,current.categories],['product',candidates.products,current.products]] as const) {
    for (const row of rows) if (existing.some(old=>old.id!==row.id && key(old.name)===key(row.name)) || rows.some(other=>other.id!==row.id && key(other.name)===key(row.name))) duplicates.push({type,id:row.id,name:row.name});
  }
  return {categoriesAdded,categoriesUpdated,productsAdded,productsUpdated,duplicates};
}
function jobView(row:Obj) {return {id:row.id,status:row.status,version:row.version,filename:row.filename,mimeType:row.mime_type,candidates:row.candidates,warnings:row.warnings};}
async function response(client:PoolClient,slug:string,row:Obj) {
  const current=await snapshot(client,slug),catalogHash=hash(current),diff=importDiff(row.candidates as ImportCandidates,current);
  return {job:jobView(row),catalogHash,diff,diffHash:hash({version:row.version,catalogHash,diff})};
}
function actor(req:Request):string {
  const claims=(req as Request & {user?:{sub?:string};auth?:{sub?:string}});
  const value=claims.auth?.sub||claims.user?.sub;
  if (!value) throw new HttpError(401,'Usuário autenticado obrigatório.');
  return value;
}
async function audit(client:PoolClient,slug:string,job:Obj,actorId:string,action:string,detail:unknown) {
  await client.query('INSERT INTO menu_import_audit(job_id,tenant_slug,actor,action,version,detail) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[job.id,slug,actorId,action,job.version,JSON.stringify(detail)]);
}
export function mountMenuImport(app:Express,pool:Pool,guard:RequestHandler,refresh:(slug:string)=>Promise<void>) {
  const base='/api/v1/tenants/:slug/menu-imports';
  app.post(base,guard,transactionalRoute(pool,async(req,res,client)=>{
    await tenantLock(client,req.params.slug); await requireFeature(client,req.params.slug,'menu_import');
    const actorId=actor(req),source=parseImportSource(req.body);
    const prior=await client.query('SELECT * FROM menu_import_jobs WHERE tenant_slug=$1 AND checksum=$2',[req.params.slug,source.checksum]);
    if (prior.rows[0]) {res.json(await response(client,req.params.slug,prior.rows[0]));return;}
    const inserted=await client.query(`INSERT INTO menu_import_jobs(id,tenant_slug,checksum,filename,mime_type,candidates,warnings,created_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8) RETURNING *`,[crypto.randomUUID(),req.params.slug,source.checksum,source.filename,source.mimeType,JSON.stringify(source.candidates),JSON.stringify(source.warnings),actorId]);
    await audit(client,req.params.slug,inserted.rows[0],actorId,'created',{checksum:source.checksum,candidates:source.candidates});
    res.status(201).json(await response(client,req.params.slug,inserted.rows[0]));
  }));
  const load=async(client:PoolClient,slug:string,id:string)=>{
    const result=await client.query('SELECT * FROM menu_import_jobs WHERE tenant_slug=$1 AND id=$2 FOR UPDATE',[slug,id]);
    if (!result.rows[0]) throw new HttpError(404,'Importação não encontrada.');
    return result.rows[0];
  };
  app.get(`${base}/:id`,guard,transactionalRoute(pool,async(req,res,client)=>{
    await tenantLock(client,req.params.slug);await requireFeature(client,req.params.slug,'menu_import');
    res.json(await response(client,req.params.slug,await load(client,req.params.slug,req.params.id)));
  }));
  app.patch(`${base}/:id/candidates`,guard,transactionalRoute(pool,async(req,res,client)=>{
    await tenantLock(client,req.params.slug);await requireFeature(client,req.params.slug,'menu_import');
    const job=await load(client,req.params.slug,req.params.id),body=object(req.body);strict(body,['version','candidates']);
    if (job.status!=='draft' || body.version!==job.version) throw new HttpError(409,'Rascunho alterado ou publicado. Recarregue.');
    const candidates=normalizeCandidates(body.candidates),updated=await client.query('UPDATE menu_import_jobs SET candidates=$1::jsonb,version=version+1,updated_at=now() WHERE id=$2 AND tenant_slug=$3 RETURNING *',[JSON.stringify(candidates),job.id,req.params.slug]);
    await audit(client,req.params.slug,updated.rows[0],actor(req),'reviewed',{candidates});
    res.json(await response(client,req.params.slug,updated.rows[0]));
  }));
  app.post(`${base}/:id/publish`,guard,transactionalRoute(pool,async(req,res,client,afterCommit)=>{
    const tenant=await tenantLock(client,req.params.slug);await requireFeature(client,req.params.slug,'menu_import');
    const job=await load(client,req.params.slug,req.params.id),body=object(req.body);strict(body,['version','catalogHash','diffHash','confirm','confirmDuplicates']);
    if (job.status==='published') {res.json({job:jobView(job),alreadyPublished:true});return;}
    const preview=await response(client,req.params.slug,job);
    if (body.version!==job.version || body.catalogHash!==preview.catalogHash || body.diffHash!==preview.diffHash) throw new HttpError(409,'Catálogo ou rascunho alterado. Revise o diff atualizado.');
    if (body.confirm!==true || (preview.diff.duplicates.length && body.confirmDuplicates!==true)) fail('Confirmação explícita da publicação e duplicidades obrigatória.');
    const candidates=normalizeCandidates(job.candidates);
    if (!candidates.products.length || candidates.products.some(p=>p.priceCents===null)) fail('Revise os preços e inclua pelo menos um produto antes de publicar.');
    // Existing rich product data may never disappear silently through an import.
    const current=await snapshot(client,req.params.slug);
    for (const product of candidates.products) {
      const old=current.products.find(p=>p.id===product.id);
      if (old && Array.isArray(old.option_groups) && old.option_groups.length) fail('Produto com adicionais exige revisão pelo editor do catálogo.');
    }
    for (const category of candidates.categories) await categoryWrite(client,tenant,category);
    for (const product of candidates.products) await productWrite(client,tenant,product);
    const actorId=actor(req),updated=await client.query("UPDATE menu_import_jobs SET status='published',published_by=$1,published_at=now(),updated_at=now() WHERE id=$2 AND tenant_slug=$3 RETURNING *",[actorId,job.id,req.params.slug]);
    await audit(client,req.params.slug,updated.rows[0],actorId,'published',preview.diff);
    afterCommit(()=>{void refresh(req.params.slug).catch(error=>console.error('Menu import cache refresh failed',error));});
    res.json({job:jobView(updated.rows[0]),published:true});
  }));
}
