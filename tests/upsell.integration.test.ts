import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';
import { mountUpsell, attributeUpsellOrder } from '../backend/upsell';
import { transaction } from '../backend/database';
import { installAsyncErrors } from '../backend/http';

test('upsell enforces owner/version/scope, caps concurrent offers and attributes only settled orders',async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  assert.ok(connectionString&&new URL(connectionString).pathname.endsWith('_test'),'Banco descartável _test obrigatório.');
  const pool=new pg.Pool({connectionString}),suffix=crypto.randomBytes(5).toString('hex'),slug=`upsell-${suffix}`,other=`upsell-other-${suffix}`;
  const burger=`burger-${suffix}`,drink=`drink-${suffix}`,foreign=`foreign-${suffix}`;
  const app=express();installAsyncErrors(app);app.use(express.json());
  const guard:express.RequestHandler=(req,res,next)=>{if(req.headers['x-test-tenant']!==req.params.slug)return void res.status(403).json({error:'scope'});(req as any).user={sub:'upsell-test',role:req.headers['x-test-role']||'TENANT_OWNER'};next();};
  mountUpsell(app,pool,guard);app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');const host=`http://127.0.0.1:${address.port}`;
  async function request(path:string,body?:unknown,method='POST',role='TENANT_OWNER',tenant=slug){const response=await fetch(`${host}/api/v1/tenants/${tenant}/upsell${path}`,{method,headers:{'Content-Type':'application/json','x-test-tenant':tenant,'x-test-role':role},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
  const sessionId=crypto.randomUUID(),checkoutId=crypto.randomUUID();
  function query(requestId:string,session=sessionId,cart:unknown=[{productId:burger,quantity:1}]){return `/suggestions?${new URLSearchParams({sessionId:session,checkoutId,requestId,cart:JSON.stringify(cart)})}`;}
  const rule={name:'Bebida com lanche',enabled:true,suggestedProductIds:[drink],triggerProductIds:[burger],priority:10};
  try{
    for(const file of ['easypanel-init.sql','intelligence.sql','upsell.sql'])await pool.query(fs.readFileSync(`database/${file}`,'utf8'));
    for(const tenant of [slug,other]){
      await pool.query('INSERT INTO tenants(id,name,slug) VALUES($1,$1,$1)',[tenant]);
      await pool.query('INSERT INTO categories(id,tenant_id,tenant_slug,name) VALUES($1,$2,$2,$1)',[`cat-${tenant}`,tenant]);
    }
    for(const [id,tenant,price] of [[burger,slug,1000],[drink,slug,2000],[foreign,other,9000]] as const)await pool.query('INSERT INTO products(id,tenant_id,tenant_slug,category_id,name,price_cents) VALUES($1,$2,$2,$3,$1,$4)',[id,tenant,`cat-${tenant}`,price]);
    assert.equal((await request('/rules',rule)).status,403);
    for(const tenant of [slug,other])await pool.query("INSERT INTO intelligence_features(tenant_slug,feature,released,enabled) VALUES($1,'upsell',true,true)",[tenant]);
    assert.equal((await request('/rules',rule,'POST','TENANT_STAFF')).status,403);
    assert.equal((await request('/rules',{...rule,suggestedProductIds:[foreign]})).status,400);
    const created=await request('/rules',rule);assert.equal(created.status,201,JSON.stringify(created.body));
    const id=created.body.rule.id;
    assert.equal((await request(`/rules/${id}`,{version:99,name:'stale'},'PATCH')).status,409);
    assert.equal((await request(`/rules/${id}`,{version:1,name:'Bebida revisada'},'PUT')).status,200);
    assert.equal((await request(query(crypto.randomUUID(),sessionId,[{productId:burger,quantity:1,priceCents:1}]),undefined,'GET')).status,400);
    assert.equal((await request(query(crypto.randomUUID(),sessionId,[{productId:foreign,quantity:1}]),undefined,'GET')).status,400);
    const requestIds=[crypto.randomUUID(),crypto.randomUUID()];
    const concurrent=await Promise.all(requestIds.map(id=>request(query(id),undefined,'GET')));
    assert.ok(concurrent.every(result=>result.status===200),JSON.stringify(concurrent));
    assert.deepEqual(concurrent.map(result=>result.body.suggestions.length).sort(),[0,1],'session cap survives concurrent requests');
    const winner=concurrent.findIndex(result=>result.body.suggestions.length===1),suggestion=concurrent[winner].body.suggestions[0];
    assert.equal(suggestion.product.id,drink);assert.equal(suggestion.product.priceCents,2000);
    assert.equal((await request(query(requestIds[winner]),undefined,'GET')).body.suggestions[0].offerId,suggestion.offerId,'idempotent suggestion request');
    await pool.query('UPDATE products SET price_cents=2500 WHERE tenant_slug=$1 AND id=$2',[slug,drink]);
    assert.equal((await request(query(requestIds[winner]),undefined,'GET')).body.suggestions[0].product.priceCents,2500,'price always reread from catalog');
    assert.equal((await request(query(requestIds[winner],crypto.randomUUID()),undefined,'GET')).status,409);
    const impression={eventId:crypto.randomUUID(),sessionId,offerId:suggestion.offerId,kind:'impression'};
    assert.equal((await request('/events',impression)).status,202);assert.equal((await request('/events',impression)).body.duplicate,true);
    assert.equal((await request('/events',{...impression,kind:'purchase'})).status,400);
    assert.equal((await request('/events',{...impression,eventId:crypto.randomUUID(),sessionId:crypto.randomUUID()})).status,400);
    assert.equal((await request('/events',{...impression,eventId:crypto.randomUUID(),kind:'add_to_cart'})).status,202);
    assert.equal((await request('/events',{...impression,eventId:crypto.randomUUID(),kind:'add_to_cart'})).body.duplicate,true);
    const attribution={sessionId,checkoutId,offerIds:[suggestion.offerId]},orderId=`ord_upsell_${suffix}`;
    await pool.query(`INSERT INTO orders(id,order_number,tenant_id,tenant_slug,customer_name,customer_phone,items,total_cents,payment_status)
      VALUES($1,1,$2,$2,'Test','5511999999999',$3::jsonb,2500,'paid_online')`,[orderId,slug,JSON.stringify([{productId:drink,quantity:1,totalCents:2500}])]);
    assert.equal((await transaction(pool,client=>attributeUpsellOrder(client,slug,orderId,[{productId:drink}],{...attribution,sessionId:crypto.randomUUID()}))).attributed,0);
    assert.equal((await transaction(pool,client=>attributeUpsellOrder(client,other,orderId,[{productId:drink}],attribution))).attributed,0);
    assert.equal((await transaction(pool,client=>attributeUpsellOrder(client,slug,orderId,[{productId:burger}],attribution))).attributed,0);
    assert.equal((await transaction(pool,client=>attributeUpsellOrder(client,slug,orderId,[{productId:drink}],attribution))).attributed,1);
    assert.equal((await transaction(pool,client=>attributeUpsellOrder(client,slug,orderId,[{productId:drink}],attribution))).attributed,0);
    let metrics=(await request('/metrics',undefined,'GET')).body;
    assert.equal(metrics.impressions,1);assert.equal(metrics.addToCart,1);assert.equal(metrics.createdOrdersAttributed,1);assert.equal(metrics.purchaseConversions,0,'paid_online flag alone is not settlement proof');
    const txid=`upsell-pix-${suffix}`;
    await pool.query("INSERT INTO pix_transactions(txid,order_id,tenant_slug,amount_cents,pix_copia_e_cola,status) VALUES($1,$2,$3,2500,'static','PENDING')",[txid,orderId,slug]);
    assert.equal((await request('/metrics',undefined,'GET')).body.purchaseConversions,0);
    await pool.query("UPDATE pix_transactions SET status='PAID',paid_at=now(),end_to_end_id=$2 WHERE txid=$1",[txid,`upsell-e2e-${suffix}`]);
    metrics=(await request('/metrics',undefined,'GET')).body;assert.equal(metrics.purchaseConversions,1);assert.equal(metrics.paidOrdersAttributed,1);
    await pool.query("UPDATE orders SET status='cancelled' WHERE id=$1",[orderId]);assert.equal((await request('/metrics',undefined,'GET')).body.purchaseConversions,0);
    await pool.query("UPDATE orders SET status='confirmed' WHERE id=$1",[orderId]);await pool.query("UPDATE pix_transactions SET status='REFUNDED' WHERE txid=$1",[txid]);assert.equal((await request('/metrics',undefined,'GET')).body.purchaseConversions,0);
    assert.equal((await request(`/rules/${id}?version=2`,undefined,'DELETE')).status,200);
    assert.equal((await request(query(requestIds[winner]),undefined,'GET')).body.suggestions.length,0,'archived rule invalidates outstanding display');
    await pool.query("UPDATE intelligence_features SET enabled=false WHERE tenant_slug=$1 AND feature='upsell'",[slug]);
    assert.equal((await transaction(pool,client=>attributeUpsellOrder(client,slug,orderId,[{productId:drink}],attribution))).attributed,0);
  }finally{
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    for(const table of ['pix_transactions','orders','products','categories'])await pool.query(`DELETE FROM ${table} WHERE tenant_slug=ANY($1::text[])`,[[slug,other]]);
    await pool.query('DELETE FROM tenants WHERE slug=ANY($1::text[])',[[slug,other]]);await pool.end();
  }
});
