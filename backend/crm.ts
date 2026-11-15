import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { HttpError, transactionalRoute } from './database';
import { requireIntelligenceOwner } from './intelligence';
import { fingerprint, phoneNumber } from './security';

type Customer = { name: string; phone: string; notes: string; marketingConsent: boolean };
const legacyKeys = ['id','name','phone','notes','marketingConsent','ordersCount','totalSpentCents','firstOrderAt','lastOrderAt','tenantSlug','version'];
function record(value: unknown): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new HttpError(400,'Objeto inválido.');
  return value as Record<string, any>;
}
function exactKeys(value: Record<string, any>, keys: string[]) {
  if (Object.keys(value).some(key=>!keys.includes(key))) throw new HttpError(400,'Campo não permitido.');
}
export function normalizeCrmCustomers(value: unknown, slug: string): Customer[] {
  if (!Array.isArray(value) || value.length>2000 || Buffer.byteLength(JSON.stringify(value))>2000000) throw new HttpError(400,'Limite de 2.000 clientes ou 2 MB excedido.');
  const seen=new Set<string>();
  return value.map(raw=>{
    const input=record(raw); exactKeys(input,legacyKeys);
    if(input.tenantSlug!==undefined && input.tenantSlug!==slug) throw new HttpError(400,'Cliente atribuído a outro restaurante.');
    if(typeof input.name!=='string' || !input.name.trim() || input.name.length>120 || typeof input.phone!=='string' || input.phone.length>40 || (input.notes!==undefined && (typeof input.notes!=='string' || input.notes.length>4000)) || (input.marketingConsent!==undefined && typeof input.marketingConsent!=='boolean')) throw new HttpError(400,'Cliente inválido.');
    const phone=phoneNumber(input.phone);
    if(!/^55\d{10,11}$/.test(phone) || seen.has(phone)) throw new HttpError(400,'Telefone inválido ou duplicado após normalização.');
    seen.add(phone);
    return {name:input.name.trim(),phone,notes:input.notes||'',marketingConsent:input.marketingConsent===true};
  }).sort((a,b)=>a.phone.localeCompare(b.phone));
}
function dto(row:any) { return {id:row.id,name:row.name,phone:row.phone,notes:row.notes,marketingConsent:row.marketing_consent,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at}; }
async function tenantLock(client: PoolClient, slug:string) {
  const rows=await client.query('SELECT id,tables_count FROM tenants WHERE slug=$1 FOR UPDATE',[slug]);
  if(!rows.rows[0]) throw new HttpError(404,'Restaurante não encontrado.'); return rows.rows[0];
}
async function customers(client: Pick<PoolClient,'query'>,slug:string) { return (await client.query('SELECT * FROM crm_customers WHERE tenant_slug=$1 ORDER BY phone',[slug])).rows; }
async function cleanup(client:Pick<PoolClient,'query'>,slug:string) {
  await client.query('DELETE FROM crm_migration_previews WHERE tenant_slug=$1 AND expires_at<NOW()',[slug]);
  await client.query('UPDATE crm_migrations SET recovery_snapshot=NULL WHERE tenant_slug=$1 AND expires_at<NOW() AND recovery_snapshot IS NOT NULL',[slug]);
}
async function write(client:PoolClient,slug:string,c:Customer) {
  return client.query(`INSERT INTO crm_customers(id,tenant_slug,name,phone,notes,marketing_consent) VALUES($1,$2,$3,$4,$5,$6)
    ON CONFLICT(tenant_slug,phone) DO UPDATE SET name=$3,notes=$5,marketing_consent=$6,version=crm_customers.version+1,updated_at=NOW() RETURNING *`,[`cust_${crypto.randomUUID()}`,slug,c.name,c.phone,c.notes,c.marketingConsent]);
}
export function mountCrm(app:Express,pool:Pool,guard:RequestHandler) {
  const base='/api/v1/tenants/:slug/customers';
  app.get(base,guard,requireIntelligenceOwner,async(req,res)=>{
    await cleanup(pool,req.params.slug);
    const rows=await customers(pool,req.params.slug);
    const history=await pool.query('SELECT version,result,expires_at AS "expiresAt",created_at AS "createdAt" FROM crm_migrations WHERE tenant_slug=$1 ORDER BY version DESC LIMIT 100',[req.params.slug]);
    res.json({data:rows.map(dto),migrations:history.rows});
  });
  app.put(base,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    const input=record(req.body);exactKeys(input,['customer','expectedVersion']);
    const [customer]=normalizeCrmCustomers([input.customer],req.params.slug);
    await tenantLock(client,req.params.slug);
    const previous=await client.query('SELECT version FROM crm_customers WHERE tenant_slug=$1 AND phone=$2',[req.params.slug,customer.phone]);
    if(!Number.isInteger(input.expectedVersion) || input.expectedVersion!==(previous.rows[0]?.version||0)) throw new HttpError(409,'Cliente alterado. Atualize os dados antes de salvar.');
    res.json({data:dto((await write(client,req.params.slug,customer)).rows[0])});
  }));
  app.post(`${base}/migration-preview`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    const input=record(req.body);exactKeys(input,['sourceTenantSlug','customers','retentionDays']);
    if(input.sourceTenantSlug!==req.params.slug || !Number.isInteger(input.retentionDays) || input.retentionDays<1 || input.retentionDays>90) throw new HttpError(400,'Confirme o restaurante de origem e prazo de recuperação entre 1 e 90 dias.');
    const normalized=normalizeCrmCustomers(input.customers,req.params.slug);
    await tenantLock(client,req.params.slug);await cleanup(client,req.params.slug);
    const baseline=await customers(client,req.params.slug);
    const baselineHash=fingerprint(baseline.map(dto));
    const differences=normalized.map(c=>{const before=baseline.find(row=>row.phone===c.phone);const original=input.customers.find((row:any)=>phoneNumber(row.phone)===c.phone);return {phone:c.phone,originalPhone:original.phone,phoneNormalized:original.phone!==c.phone,previous:before?dto(before):null,incoming:c,changes:['name','notes','marketingConsent'].filter(key=>!before || dto(before)[key as keyof ReturnType<typeof dto>]!==c[key as keyof Customer])};});
    const actor=(req as any).user.sub;
    const previewHash=fingerprint({nonce:crypto.randomUUID(),slug:req.params.slug,actor,normalized,baselineHash,retentionDays:input.retentionDays});
    const result=await client.query(`INSERT INTO crm_migration_previews(tenant_slug,preview_hash,actor,source_tenant_slug,retention_days,payload,baseline_hash) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING expires_at`,[req.params.slug,previewHash,actor,input.sourceTenantSlug,input.retentionDays,JSON.stringify(normalized),baselineHash]);
    res.json({previewHash,differences,summary:{total:normalized.length,created:differences.filter(d=>!d.previous).length,updated:differences.filter(d=>d.previous&&d.changes.length).length},expiresAt:result.rows[0].expires_at});
  }));
  app.post(`${base}/migrate`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    const input=record(req.body);exactKeys(input,['previewHash','confirmed','sourceTenantSlug','retentionDays']);
    if(input.confirmed!==true || input.sourceTenantSlug!==req.params.slug || !/^[a-f0-9]{64}$/.test(input.previewHash||'')) throw new HttpError(400,'Confirmação explícita da migração necessária.');
    await tenantLock(client,req.params.slug);
    const done=await client.query('SELECT actor,result,version FROM crm_migrations WHERE tenant_slug=$1 AND preview_hash=$2',[req.params.slug,input.previewHash]);
    if(done.rows[0]) {if(done.rows[0].actor!==(req as any).user.sub) throw new HttpError(403,'Prévia pertence a outro usuário.');if(done.rows[0].result.retentionDays!==input.retentionDays) throw new HttpError(409,'Prazo de recuperação divergente.');res.json({duplicate:true,...done.rows[0].result,version:done.rows[0].version});return;}
    const preview=(await client.query('SELECT * FROM crm_migration_previews WHERE tenant_slug=$1 AND preview_hash=$2 AND expires_at>NOW() FOR UPDATE',[req.params.slug,input.previewHash])).rows[0];
    if(!preview || preview.actor!==(req as any).user.sub || preview.retention_days!==input.retentionDays) throw new HttpError(409,'Prévia expirada ou confirmação divergente. Gere nova prévia.');
    const baseline=await customers(client,req.params.slug);
    if(fingerprint(baseline.map(dto))!==preview.baseline_hash) throw new HttpError(409,'CRM mudou desde a prévia. Revise novamente.');
    for(const customer of preview.payload as Customer[]) await write(client,req.params.slug,customer);
    const version=Number((await client.query('SELECT COALESCE(MAX(version),0)+1 AS version FROM crm_migrations WHERE tenant_slug=$1',[req.params.slug])).rows[0].version);
    const result={success:true,imported:preview.payload.length,sourceTenantSlug:preview.source_tenant_slug,retentionDays:preview.retention_days};
    await client.query(`INSERT INTO crm_migrations(tenant_slug,preview_hash,version,actor,source_tenant_slug,result,recovery_snapshot,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,NOW()+$8*INTERVAL '1 day')`,[req.params.slug,input.previewHash,version,(req as any).user.sub,preview.source_tenant_slug,JSON.stringify(result),JSON.stringify({previous:baseline,legacy:preview.payload}),preview.retention_days]);
    await client.query('DELETE FROM crm_migration_previews WHERE tenant_slug=$1 AND preview_hash=$2',[req.params.slug,input.previewHash]);
    res.json({...result,version});
  }));
  const table='/api/v1/tenants/:slug/tables/:number/state';
  function number(req:any) {const value=Number(req.params.number);if(!Number.isInteger(value)||value<1||value>1000) throw new HttpError(400,'Mesa inválida.');return value;}
  app.get(table,guard,requireIntelligenceOwner,async(req,res)=>{const n=number(req);const row=(await pool.query('SELECT * FROM tenant_table_states WHERE tenant_slug=$1 AND table_number=$2',[req.params.slug,n])).rows[0];res.json({data:row?{tableNumber:n,billRequested:row.bill_requested,servedOrderIds:row.served_order_ids,version:row.version}:{tableNumber:n,billRequested:false,servedOrderIds:[],version:0}});});
  app.patch(table,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    const n=number(req),input=record(req.body);exactKeys(input,['expectedVersion','billRequested','servedOrderIds']);
    if(!Number.isInteger(input.expectedVersion)||input.expectedVersion<0||(input.billRequested!==undefined&&typeof input.billRequested!=='boolean')||(input.servedOrderIds!==undefined&&(!Array.isArray(input.servedOrderIds)||input.servedOrderIds.length>500||input.servedOrderIds.some((id:unknown)=>typeof id!=='string'||!/^ord_[a-f0-9-]{36}$/i.test(id))))) throw new HttpError(400,'Estado de mesa inválido.');
    const tenant=await tenantLock(client,req.params.slug);if(n>tenant.tables_count) throw new HttpError(400,'Mesa fora da configuração do restaurante.');
    const previous=(await client.query('SELECT * FROM tenant_table_states WHERE tenant_slug=$1 AND table_number=$2',[req.params.slug,n])).rows[0];
    if((previous?.version||0)!==input.expectedVersion) throw new HttpError(409,'Mesa alterada. Atualize antes de salvar.');
    const ids=input.servedOrderIds===undefined?(previous?.served_order_ids||[]):[...new Set(input.servedOrderIds)];
    if(ids.length) {const found=await client.query(`SELECT id FROM orders WHERE tenant_slug=$1 AND id=ANY($2::text[]) AND table_number IS NOT NULL AND ltrim(table_number,'0')=$3`,[req.params.slug,ids,String(n)]);if(found.rows.length!==ids.length) throw new HttpError(400,'Pedido não pertence à mesa.');}
    const row=(await client.query(`INSERT INTO tenant_table_states(tenant_slug,table_number,bill_requested,served_order_ids) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_slug,table_number) DO UPDATE SET bill_requested=$3,served_order_ids=$4,version=tenant_table_states.version+1,updated_at=NOW() RETURNING *`,[req.params.slug,n,input.billRequested??previous?.bill_requested??false,JSON.stringify(ids)])).rows[0];
    res.json({data:{tableNumber:n,billRequested:row.bill_requested,servedOrderIds:row.served_order_ids,version:row.version}});
  }));
}
