import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';
import {mountCrm} from '../backend/crm';
import {installAsyncErrors} from '../backend/http';

test('CRM preview, confirmation, idempotency, retention and table conflicts use real PostgreSQL',async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  assert.ok(connectionString && new URL(connectionString).pathname.endsWith('_test'),'Use banco descartável com sufixo _test.');
  const pool=new pg.Pool({connectionString});
  const slug=`crm-${crypto.randomBytes(5).toString('hex')}`;
  const app=express();installAsyncErrors(app);app.use(express.json());
  // Test-only guard isolates module behavior. Main integration suite exercises signed JWT/session guards.
  mountCrm(app,pool,(req,res,next)=>{if(req.headers['x-test-tenant']!==req.params.slug) return void res.status(403).json({error:'Scope'});(req as any).user={sub:'crm-test-owner',role:req.headers['x-test-role']||'TENANT_OWNER'};next();});
  app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({error:error.message}));
  const server=app.listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base=`http://127.0.0.1:${address.port}/api/v1/tenants/${slug}`;
  async function request(path:string,body?:unknown,method='POST',role='TENANT_OWNER',scope=slug){const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','x-test-role':role,'x-test-tenant':scope},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,body:await response.json()};}
  try {
    await pool.query(fs.readFileSync('database/easypanel-init.sql','utf8'));
    await pool.query(fs.readFileSync('database/crm.sql','utf8'));
    await pool.query('INSERT INTO tenants(id,name,slug,phone,tables_count) VALUES($1,$1,$1,$2,3)',[slug,'5511999999999']);
    assert.equal((await request('/customers',undefined,'GET','KITCHEN_STAFF')).status,403);
    assert.equal((await request('/customers',undefined,'GET','TENANT_OWNER','other-tenant')).status,403);
    const legacy=[{id:'legacy',name:'Ana',phone:'11999999999',notes:'Retirada'}];
    const unchanged=JSON.stringify(legacy);
    const preview=await request('/customers/migration-preview',{sourceTenantSlug:slug,customers:legacy,retentionDays:7});
    assert.equal(preview.status,200);assert.equal(preview.body.differences[0].phoneNormalized,true);
    assert.equal(preview.body.differences[0].incoming.marketingConsent,false);
    assert.equal((await request('/customers',undefined,'GET')).body.data.length,0);
    const confirmation={previewHash:preview.body.previewHash,confirmed:true,sourceTenantSlug:slug,retentionDays:7};
    assert.equal((await request('/customers/migrate',{...confirmation,confirmed:false})).status,400);
    assert.equal((await request('/customers/migrate',{...confirmation,retentionDays:8})).status,409);
    const imported=await request('/customers/migrate',confirmation);assert.equal(imported.status,200);assert.equal(imported.body.version,1);
    assert.equal((await request('/customers/migrate',confirmation)).body.duplicate,true);
    assert.equal(JSON.stringify(legacy),unchanged);
    const rows=(await request('/customers',undefined,'GET')).body.data;
    assert.equal(rows.length,1);assert.equal(rows[0].marketingConsent,false);
    assert.equal((await pool.query('SELECT COUNT(*)::int AS count FROM crm_migrations WHERE tenant_slug=$1',[slug])).rows[0].count,1);
    const stale=await request('/customers/migration-preview',{sourceTenantSlug:slug,customers:[{...legacy[0],notes:'Importada'}],retentionDays:1});
    assert.equal((await request('/customers',{customer:{name:'Ana',phone:'11999999999',notes:'Atualizada',marketingConsent:false},expectedVersion:1},'PUT')).status,200);
    assert.equal((await request('/customers/migrate',{...confirmation,previewHash:stale.body.previewHash,retentionDays:1})).status,409);
    await pool.query("UPDATE crm_migrations SET expires_at=NOW()-INTERVAL '1 minute' WHERE tenant_slug=$1",[slug]);
    await request('/customers',undefined,'GET');
    assert.equal((await pool.query('SELECT recovery_snapshot FROM crm_migrations WHERE tenant_slug=$1',[slug])).rows[0].recovery_snapshot,null);
    assert.equal((await request('/tables/1/state',undefined,'GET')).body.data.version,0);
    assert.equal((await request('/tables/1/state',{expectedVersion:0,billRequested:true},'PATCH')).status,200);
    assert.equal((await request('/tables/1/state',{expectedVersion:0,billRequested:false},'PATCH')).status,409);
    assert.equal((await request('/tables/1/state',undefined,'GET')).body.data.billRequested,true);
    assert.equal((await request('/tables/1/state',{expectedVersion:1,servedOrderIds:[`ord_${crypto.randomUUID()}`]},'PATCH')).status,400);
    assert.equal((await request('/tables/4/state',{expectedVersion:0,billRequested:true},'PATCH')).status,400);
  } finally {
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
    await pool.query('DELETE FROM tenants WHERE slug=$1',[slug]);await pool.end();
  }
});
