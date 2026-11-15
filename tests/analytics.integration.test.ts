import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { mountAnalytics } from '../backend/analytics';
import { installAsyncErrors } from '../backend/http';

test('analytics persists isolated aggregates from settled Pix and handles retries, timezone, cancellation and refund',async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  assert.ok(connectionString && new URL(connectionString).pathname.endsWith('_test'),'Banco descartável _test obrigatório.');
  const pool=new pg.Pool({connectionString}),suffix=crypto.randomBytes(5).toString('hex'),slug=`analytics-${suffix}`,other=`analytics-other-${suffix}`;
  const app=express();installAsyncErrors(app);app.use(express.json());
  const guard:express.RequestHandler=(req,res,next)=>{if(req.headers['x-test-tenant']!==req.params.slug)return void res.status(403).json({error:'scope'});(req as any).user={sub:'analytics-test',role:req.headers['x-test-role']};next();};
  const superGuard:express.RequestHandler=(req,res,next)=>guard(req,res,()=>req.headers['x-test-role']==='SUPER_ADMIN'?next():void res.status(403).json({error:'superadmin'}));
  mountAnalytics(app,pool,guard,superGuard);
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');const host=`http://127.0.0.1:${address.port}`;
  async function request(path:string,body?:unknown,method='POST',role='SUPER_ADMIN',tenant=slug,scope=tenant){const response=await fetch(`${host}/api/v1/tenants/${tenant}/analytics${path}`,{method,headers:{'Content-Type':'application/json','x-test-tenant':scope,'x-test-role':role},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
  const day=new Date(Date.now()-3*86400000).toISOString().slice(0,10),before=new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
  const period={from:day,to:day,timezone:'America/Sao_Paulo'},query=`?from=${day}&to=${day}&timezone=America%2FSao_Paulo`;
  const product=`prod-${suffix}`,foreign=`prod-other-${suffix}`;
  try {
    for(const file of ['easypanel-init.sql','intelligence.sql','analytics.sql'])await pool.query(fs.readFileSync(`database/${file}`,'utf8'));
    for(const tenant of [slug,other]){
      await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$1,$1)',[tenant]);
      await pool.query('INSERT INTO categories(id,tenant_id,tenant_slug,name) VALUES($1,$2,$2,$1)',[`cat-${tenant}`,tenant]);
      await pool.query('INSERT INTO products(id,tenant_id,tenant_slug,category_id,name,price_cents) VALUES($1,$2,$2,$3,$1,1000)',[tenant===slug?product:foreign,tenant,`cat-${tenant}`]);
    }
    assert.equal((await request('/events',{garbage:true})).status,403,'feature checked before parsing');
    for(const tenant of [slug,other])await pool.query("INSERT INTO intelligence_features(tenant_slug,feature,released,enabled) VALUES($1,'analytics',true,true)",[tenant]);
    const sessionId=crypto.randomUUID(),eventId=crypto.randomUUID(),event={eventId,sessionId,kind:'menu_view',channel:'web'};
    assert.equal((await request('/events',event)).status,202);
    assert.equal((await request('/events',event)).body.duplicate,true);
    assert.equal((await request('/events',{...event,channel:'qr'})).status,409);
    assert.equal((await request('/events',{...event,eventId:crypto.randomUUID(),kind:'product_view',productId:foreign})).status,400);
    await pool.query('UPDATE analytics_events SET received_at=$3 WHERE tenant_slug=$1 AND event_id=$2',[slug,eventId,`${day}T02:30:00Z`]);
    const clickId=crypto.randomUUID();
    assert.equal((await request('/events',{...event,eventId:clickId,kind:'product_view',productId:product})).status,202);
    await pool.query('UPDATE analytics_events SET received_at=$3 WHERE tenant_slug=$1 AND event_id=$2',[slug,clickId,`${day}T04:00:00Z`]);
    for(const [key,total,status,pixStatus,created,tenant,prod] of [
      ['verified',1000,'confirmed','PAID',day,slug,product],['static',2000,'confirmed','PENDING',day,slug,product],['cancelled',3000,'cancelled','PAID',day,slug,product],['late',4000,'confirmed','PAID',before,slug,product],['foreign',9000,'confirmed','PAID',day,other,foreign],
    ] as const){
      const id=`ord_${key}_${suffix}`;
      await pool.query(`INSERT INTO orders(id,order_number,tenant_id,tenant_slug,customer_name,customer_phone,items,total_cents,status,payment_status,created_at)
        VALUES($1,1,$2,$2,'Test','5511999999999',$3::jsonb,$4,$5,'paid_online',$6)`,[id,tenant,JSON.stringify([{productId:prod,productName:'Burger',quantity:1,totalCents:total}]),total,status,`${created}T04:00:00Z`]);
      await pool.query(`INSERT INTO pix_transactions(txid,order_id,tenant_slug,amount_cents,pix_copia_e_cola,status,paid_at,end_to_end_id)
        VALUES($1,$2,$3,$4,'static',$5,$6,$7)`,[`pix-${key}-${suffix}`,id,tenant,total,pixStatus,pixStatus==='PAID'?`${day}T05:00:00Z`:null,pixStatus==='PAID'?`e2e-${key}-${suffix}`:null]);
    }
    const initial=await request(`/summary${query}`,undefined,'GET','TENANT_OWNER');
    assert.equal(initial.status,200,JSON.stringify(initial.body));
    assert.equal(initial.body.pending,true);
    assert.equal((await request('/rebuild',period,'POST','TENANT_OWNER')).status,403);
    const rebuilt=await request('/rebuild',period);assert.equal(rebuilt.status,200,JSON.stringify(rebuilt.body));
    const summary=await request(`/summary${query}`,undefined,'GET');assert.equal(summary.status,200);
    assert.equal(summary.body.pending,false);assert.equal(summary.body.metrics.ordersCount,3);assert.equal(summary.body.metrics.cancelledOrdersCount,1);
    assert.equal(summary.body.metrics.totalOrderValueCents,3000);assert.equal(summary.body.metrics.confirmedRevenueCents,5000);assert.equal(summary.body.metrics.paidOrdersCount,2);
    assert.equal(summary.body.metrics.averageTicketCents,2500);assert.equal(summary.body.conversionRate,null);assert.equal(summary.body.isStale,false);assert.equal(typeof summary.body.dataLagSeconds,'number');
    assert.equal(summary.body.previous.menuViews,1,'02:30 UTC belongs to previous São Paulo date');
    assert.equal(summary.body.metrics.menuViews,0);assert.equal(summary.body.metrics.productViews,1);
    const web=await request(`/summary${query}&channel=web`,undefined,'GET');assert.equal(web.body.metrics.confirmedRevenueCents,0);assert.equal(web.body.metrics.productViews,1);
    const unknown=await request(`/summary${query}&channel=unknown`,undefined,'GET');assert.equal(unknown.body.metrics.confirmedRevenueCents,5000);
    const products=await request(`/products${query}`,undefined,'GET');assert.equal(products.body.rows[0].unitsOrdered,2);assert.equal(products.body.rows[0].unitsConfirmed,2);assert.equal(products.body.rows[0].confirmedItemValueCents,5000);
    const csv=await request(`/export${query}`,undefined,'GET');assert.match(csv.body.csv,/confirmedRevenueCents/);assert.ok(!csv.body.csv.includes('5511999999999'));
    assert.equal((await request(`/summary${query}`,undefined,'GET','SUPER_ADMIN',other,slug)).status,403);
    const repeated=await request('/rebuild',period);assert.equal(repeated.status,200);assert.ok(repeated.body.version>rebuilt.body.version);
    assert.deepEqual((await request(`/summary${query}`,undefined,'GET')).body.metrics,summary.body.metrics,'rebuild is idempotent for same facts');
    await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1",[`ord_verified_${suffix}`]);
    await request('/rebuild',period);assert.equal((await request(`/summary${query}`,undefined,'GET')).body.metrics.confirmedRevenueCents,4000);
    await pool.query("UPDATE pix_transactions SET status='REFUNDED' WHERE txid=$1",[`pix-late-${suffix}`]);
    await request('/rebuild',period);assert.equal((await request(`/summary${query}`,undefined,'GET')).body.metrics.confirmedRevenueCents,0);
  } finally {
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const table of ['pix_transactions','orders','products','categories'])await pool.query(`DELETE FROM ${table} WHERE tenant_slug=ANY($1::text[])`,[[slug,other]]);
    await pool.query('DELETE FROM tenants WHERE slug=ANY($1::text[])',[[slug,other]]);await pool.end();
  }
});
