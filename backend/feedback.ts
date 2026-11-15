import crypto from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import type {Pool,PoolClient} from 'pg';
import {HttpError,transactionalRoute} from './database';
import {tenantLock} from './catalog';
import {requireFeature,requireIntelligenceOwner} from './intelligence';

type Obj=Record<string,unknown>;
function object(value:unknown,keys:string[]):Obj {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key))) throw new HttpError(400,'Dados de avaliação inválidos.');
  return value as Obj;
}
export function feedbackInput(value:unknown) {
  const input=object(value,['token','rating','comment','publicConsent']);
  if(typeof input.token!=='string'||!/^[a-f0-9]{64}$/.test(input.token)||!Number.isInteger(input.rating)||Number(input.rating)<1||Number(input.rating)>5||(input.comment!==undefined&&(typeof input.comment!=='string'||input.comment.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.comment)))||(input.publicConsent!==undefined&&typeof input.publicConsent!=='boolean')) throw new HttpError(400,'Nota, comentário ou consentimento inválido.');
  return {token:input.token,rating:Number(input.rating),comment:typeof input.comment==='string'?input.comment.trim():'',publicConsent:input.publicConsent===true};
}
export function feedbackTokenHash(token:string) {return crypto.createHash('sha256').update(token).digest('hex');}
function retentionDays() {const value=Number(process.env.FEEDBACK_RETENTION_DAYS||90);if(!Number.isInteger(value)||value<1||value>365) throw new HttpError(503,'Prazo de retenção de avaliações inválido.');return value;}
async function cleanup(client:PoolClient,slug:string) {
  await client.query('DELETE FROM customer_feedback WHERE tenant_slug=$1 AND expires_at<=NOW()',[slug]);
  await client.query('DELETE FROM feedback_moderation_events WHERE tenant_slug=$1 AND expires_at<=NOW()',[slug]);
  await client.query('DELETE FROM feedback_requests r WHERE tenant_slug=$1 AND expires_at<=NOW() AND NOT EXISTS(SELECT 1 FROM customer_feedback f WHERE f.tenant_slug=r.tenant_slug AND f.request_id=r.id)',[slug]);
}
async function audit(client:PoolClient,slug:string,action:string,actor:string|null,feedbackId:string|null=null) {
  await client.query("INSERT INTO feedback_moderation_events(tenant_slug,feedback_id,action,actor,expires_at) VALUES($1,$2,$3,$4,NOW()+$5*INTERVAL '1 day')",[slug,feedbackId,action,actor,retentionDays()]);
}
function dto(row:any) {return {id:row.id,orderId:row.order_id,rating:row.rating,comment:row.comment,publicConsent:row.public_consent,moderation:row.moderation,version:row.version,createdAt:row.created_at,expiresAt:row.expires_at};}
function feedbackId(value:string) {if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw new HttpError(400,'Identificador de avaliação inválido.');return value;}
export function mountFeedback(app:Express,pool:Pool,guard:RequestHandler) {
  const base='/api/v1/tenants/:slug/feedback';
  app.post('/api/v1/tenants/:slug/orders/:id/feedback-invite',guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'feedback');await tenantLock(client,req.params.slug);await cleanup(client,req.params.slug);
    const body=object(req.body||{},['reissue','confirmReissue']);
    if((body.reissue!==undefined&&typeof body.reissue!=='boolean')||(body.confirmReissue!==undefined&&typeof body.confirmReissue!=='boolean')) throw new HttpError(400,'Confirmação de reemissão inválida.');
    const order=(await client.query("SELECT * FROM orders WHERE id=$1 AND tenant_slug=$2 AND status='delivered' AND created_at>NOW()-INTERVAL '30 days' FOR UPDATE",[req.params.id,req.params.slug])).rows[0];
    if(!order||['cancelled','refunded','chargeback'].includes(order.payment_status)) throw new HttpError(409,'Pedido não é elegível para avaliação.');
    if(order.payment_method==='Pix') {const settlement=await client.query("SELECT 1 FROM pix_transactions WHERE order_id=$1 AND tenant_slug=$2 AND status='PAID' AND amount_cents=$3 AND paid_at IS NOT NULL AND end_to_end_id IS NOT NULL",[order.id,req.params.slug,order.total_cents]);if(!settlement.rows.length) throw new HttpError(409,'Pagamento Pix ainda não conciliado.');}
    const previous=(await client.query('SELECT * FROM feedback_requests WHERE tenant_slug=$1 AND order_id=$2 FOR UPDATE',[req.params.slug,order.id])).rows[0];
    if(previous?.used_at) throw new HttpError(409,'Este pedido já recebeu uma avaliação.');
    if(previous&&(body.reissue!==true||body.confirmReissue!==true)) throw new HttpError(409,'Convite já existe. Confirme explicitamente a reemissão para invalidar o link anterior.');
    const token=crypto.randomBytes(32).toString('hex'),id=previous?.id||crypto.randomUUID();
    const invitation=(await client.query("INSERT INTO feedback_requests(id,tenant_slug,order_id,token_hash,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 days') ON CONFLICT(tenant_slug,order_id) DO UPDATE SET token_hash=$4,expires_at=NOW()+INTERVAL '30 days',used_at=NULL RETURNING expires_at",[id,req.params.slug,order.id,feedbackTokenHash(token)])).rows[0];
    await audit(client,req.params.slug,previous?'reissued':'invited',(req as any).user.sub);
    // Token appears only in this response. No audit, database payload or outbound message includes it.
    const appUrl=process.env.APP_URL?.replace(/\/$/,'')||'';
    res.status(previous?200:201).json({inviteId:id,url:`${appUrl}/?feedback=${token}`,expiresAt:invitation.expires_at});
  }));
  app.post('/api/v1/public/feedback',transactionalRoute(pool,async(req,res,client)=>{
    // Resolve opaque token to tenant before checking the feature; rating/comment are validated afterwards.
    const token=(req.body as any)?.token;
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(400,'Convite inválido.');
    const tokenHash=feedbackTokenHash(token);
    const found=(await client.query('SELECT tenant_slug FROM feedback_requests WHERE token_hash=$1',[tokenHash])).rows[0];
    if(!found) throw new HttpError(410,'Convite indisponível ou expirado.');
    await requireFeature(client,found.tenant_slug,'feedback');await tenantLock(client,found.tenant_slug);
    const invitation=(await client.query('SELECT * FROM feedback_requests WHERE tenant_slug=$1 AND token_hash=$2 FOR UPDATE',[found.tenant_slug,tokenHash])).rows[0];
    if(!invitation||invitation.used_at||new Date(invitation.expires_at).getTime()<=Date.now()) throw new HttpError(410,'Convite indisponível ou expirado.');
    const input=feedbackInput(req.body),id=crypto.randomUUID(),days=retentionDays();
    await client.query("INSERT INTO customer_feedback(id,tenant_slug,request_id,rating,comment,public_consent,expires_at) VALUES($1,$2,$3,$4,$5,$6,NOW()+$7*INTERVAL '1 day')",[id,invitation.tenant_slug,invitation.id,input.rating,input.comment,input.publicConsent,days]);
    await client.query('UPDATE feedback_requests SET used_at=NOW(),token_hash=NULL WHERE id=$1 AND tenant_slug=$2',[invitation.id,invitation.tenant_slug]);
    await audit(client,invitation.tenant_slug,'submitted',null,id);
    res.status(201).json({success:true});
  }));
  app.get(`${base}/public`,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'feedback');await cleanup(client,req.params.slug);
    if(Object.keys(req.query).length) throw new HttpError(400,'Parâmetros não permitidos.');
    const rows=await client.query("SELECT rating,comment,created_at AS \"createdAt\" FROM customer_feedback WHERE tenant_slug=$1 AND moderation='approved' AND public_consent=true AND expires_at>NOW() ORDER BY created_at DESC LIMIT 100",[req.params.slug]);
    res.json({data:rows.rows});
  }));
  app.get(base,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'feedback');await cleanup(client,req.params.slug);
    const input=object(req.query,['moderation','limit','offset']),status=input.moderation??null;
    const limit=input.limit===undefined?50:Number(input.limit),offset=input.offset===undefined?0:Number(input.offset);
    if((status!==null&&!['pending','approved','rejected'].includes(String(status)))||!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(offset)||offset<0||offset>10000) throw new HttpError(400,'Filtro inválido.');
    const rows=await client.query('SELECT f.*,r.order_id FROM customer_feedback f JOIN feedback_requests r ON r.id=f.request_id AND r.tenant_slug=f.tenant_slug WHERE f.tenant_slug=$1 AND ($2::text IS NULL OR f.moderation=$2) AND f.expires_at>NOW() ORDER BY f.created_at DESC LIMIT $3 OFFSET $4',[req.params.slug,status,limit,offset]);
    const stats=(await client.query('SELECT COUNT(*)::int AS count,AVG(rating)::float AS average FROM customer_feedback WHERE tenant_slug=$1 AND expires_at>NOW()',[req.params.slug])).rows[0];
    const byRating=(await client.query('SELECT rating,COUNT(*)::int AS count FROM customer_feedback WHERE tenant_slug=$1 AND expires_at>NOW() GROUP BY rating',[req.params.slug])).rows;
    res.json({data:rows.rows.map(dto),metrics:{count:stats.count,averageRating:stats.average,byRating:Object.fromEntries([1,2,3,4,5].map(rating=>[rating,byRating.find(row=>row.rating===rating)?.count||0]))}});
  }));
  app.patch(`${base}/:id/moderation`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'feedback');await tenantLock(client,req.params.slug);await cleanup(client,req.params.slug);
    const input=object(req.body,['status','expectedVersion']);
    if(!['approved','rejected'].includes(String(input.status))||!Number.isInteger(input.expectedVersion)) throw new HttpError(400,'Moderação inválida.');
    const row=(await client.query('SELECT * FROM customer_feedback WHERE tenant_slug=$1 AND id=$2 FOR UPDATE',[req.params.slug,feedbackId(req.params.id)])).rows[0];
    if(!row) throw new HttpError(404,'Avaliação não encontrada.');
    if(row.version!==input.expectedVersion) throw new HttpError(409,'Avaliação alterada. Atualize antes de moderar.');
    if(input.status==='approved'&&!row.public_consent) throw new HttpError(409,'Sem consentimento específico para publicação.');
    const updated=(await client.query('UPDATE customer_feedback SET moderation=$3,version=version+1 WHERE tenant_slug=$1 AND id=$2 RETURNING *',[req.params.slug,row.id,input.status])).rows[0];
    await audit(client,req.params.slug,String(input.status),(req as any).user.sub,row.id);res.json({data:dto(updated)});
  }));
  app.delete(`${base}/:id`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'feedback');await tenantLock(client,req.params.slug);
    const input=object(req.body,['confirm']);if(input.confirm!==true) throw new HttpError(400,'Confirme a exclusão da avaliação.');
    const row=(await client.query('SELECT request_id FROM customer_feedback WHERE tenant_slug=$1 AND id=$2 FOR UPDATE',[req.params.slug,feedbackId(req.params.id)])).rows[0];
    if(!row) throw new HttpError(404,'Avaliação não encontrada.');
    // Cascades remove the feedback text and all linked moderation records. Keep an unlinked deletion audit only.
    await client.query('DELETE FROM feedback_requests WHERE tenant_slug=$1 AND id=$2',[req.params.slug,row.request_id]);
    await audit(client,req.params.slug,'deleted',(req as any).user.sub);res.json({success:true});
  }));
}
