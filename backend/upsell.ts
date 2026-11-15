import crypto from 'node:crypto';
import type { Express, Request, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { HttpError, transactionalRoute } from './database';
import { tenantLock } from './catalog';
import { requireFeature, requireIntelligenceOwner } from './intelligence';
import { SETTLED_PIX_SQL } from './analytics';

type Obj=Record<string,unknown>;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function invalid(message='Dados de sugestão inválidos.'):never {throw new HttpError(400,message);}
function object(value:unknown,keys:string[]):Obj {
  if (!value || typeof value!=='object' || Array.isArray(value)) return invalid();
  if (Object.keys(value).some(key=>!keys.includes(key))) return invalid('Campo não permitido.');
  return value as Obj;
}
function uuid(value:unknown):string {if (typeof value!=='string'||!UUID.test(value))return invalid('UUID obrigatório.');return value.toLowerCase();}
function integer(value:unknown,min:number,max:number):number {if(!Number.isInteger(value)||Number(value)<min||Number(value)>max)return invalid('Número inválido.');return Number(value);}
function ids(value:unknown,max=30):string[] {
  if(!Array.isArray(value)||value.length>max||value.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(id))||new Set(value).size!==value.length)return invalid('Lista de identificadores inválida.');
  return value;
}
const ruleKeys=['name','enabled','priority','triggerProductIds','triggerCategoryIds','suggestedProductIds','minSubtotalCents','maxSubtotalCents','weekdays','startTime','endTime','timezone','maxImpressionsPerSession'];
export function upsellRule(value:unknown) {
  const input=object(value,ruleKeys);
  if(typeof input.name!=='string'||!input.name.trim()||input.name.length>120||/[<>\u0000-\u001f]/.test(input.name))invalid('Nome inválido.');
  if(input.enabled!==undefined&&typeof input.enabled!=='boolean')invalid('Status inválido.');
  const timezone=input.timezone??'America/Sao_Paulo';
  if(typeof timezone!=='string'||timezone.length>80)invalid('Fuso inválido.');
  try {new Intl.DateTimeFormat('en',{timeZone:timezone}).format();}catch{invalid('Fuso inválido.');}
  const startTime=input.startTime??'00:00',endTime=input.endTime??'00:00';
  if(typeof startTime!=='string'||typeof endTime!=='string'||![startTime,endTime].every(time=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)))invalid('Horário inválido.');
  const weekdays=input.weekdays??[0,1,2,3,4,5,6];
  if(!Array.isArray(weekdays)||!weekdays.length||weekdays.length>7||weekdays.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(weekdays).size!==weekdays.length)invalid('Dias inválidos.');
  const minSubtotalCents=integer(input.minSubtotalCents??0,0,100000000),maxSubtotalCents=input.maxSubtotalCents===null||input.maxSubtotalCents===undefined?null:integer(input.maxSubtotalCents,minSubtotalCents,100000000);
  const suggestedProductIds=ids(input.suggestedProductIds);
  if(!suggestedProductIds.length)invalid('Inclua produtos sugeridos.');
  return {name:(input.name as string).trim(),enabled:input.enabled===true,priority:integer(input.priority??0,-1000,1000),triggerProductIds:ids(input.triggerProductIds??[]),triggerCategoryIds:ids(input.triggerCategoryIds??[]),suggestedProductIds,minSubtotalCents,maxSubtotalCents,weekdays:weekdays as number[],startTime:startTime as string,endTime:endTime as string,timezone:timezone as string,maxImpressionsPerSession:integer(input.maxImpressionsPerSession??1,1,10)};
}
type Rule=ReturnType<typeof upsellRule>;
export function upsellCart(value:unknown):Array<{productId:string;quantity:number}> {
  let parsed=value;
  if(typeof value==='string') {if(value.length>15000)invalid('Carrinho excessivo.');try{parsed=JSON.parse(value);}catch{invalid('Carrinho inválido.');}}
  if(!Array.isArray(parsed)||parsed.length>100)invalid('Carrinho inválido.');
  const cart=(parsed as unknown[]).map(entry=>{const row=object(entry,['productId','quantity']);return {productId:ids([row.productId],1)[0],quantity:integer(row.quantity,1,99)};});
  if(new Set(cart.map(item=>item.productId)).size!==cart.length)invalid('Produto repetido no carrinho.');
  return cart.sort((a,b)=>a.productId.localeCompare(b.productId));
}
export function upsellSchedule(rule:Pick<Rule,'timezone'|'startTime'|'endTime'|'weekdays'>,now:Date) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:rule.timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=(name:string)=>parts.find(part=>part.type===name)?.value||'';
  const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(get('weekday')),time=`${get('hour')}:${get('minute')}`;
  if(rule.startTime===rule.endTime)return rule.weekdays.includes(weekday);
  if(rule.startTime<rule.endTime)return rule.weekdays.includes(weekday)&&time>=rule.startTime&&time<rule.endTime;
  const startDay=time<rule.endTime?(weekday+6)%7:weekday;
  return rule.weekdays.includes(startDay)&&(time>=rule.startTime||time<rule.endTime);
}
export function upsellEligible(rule:Rule,cart:Array<{productId:string;categoryId:string;priceCents:number;quantity:number}>,now:Date) {
  const subtotal=cart.reduce((sum,item)=>sum+item.priceCents*item.quantity,0);
  return rule.enabled && subtotal>=rule.minSubtotalCents && (rule.maxSubtotalCents===null||subtotal<=rule.maxSubtotalCents) && upsellSchedule(rule,now)
    && (!rule.triggerProductIds.length||cart.some(item=>rule.triggerProductIds.includes(item.productId)))
    && (!rule.triggerCategoryIds.length||cart.some(item=>rule.triggerCategoryIds.includes(item.categoryId)));
}
const actor=(req:Request)=>{const sub=(req as unknown as {user?:{sub:string}}).user?.sub;if(!sub)throw new HttpError(401,'Autor obrigatório.');return sub;};
function view(row:Obj){return {id:row.id,version:row.version,...row.config as Obj,name:row.name,enabled:row.enabled,priority:row.priority};}
async function validateScope(client:PoolClient,slug:string,rule:Rule) {
  const productIds=[...new Set([...rule.triggerProductIds,...rule.suggestedProductIds])];
  const products=await client.query('SELECT id FROM products WHERE tenant_slug=$1 AND id=ANY($2::text[])',[slug,productIds]);
  const categories=await client.query('SELECT id FROM categories WHERE tenant_slug=$1 AND id=ANY($2::text[])',[slug,rule.triggerCategoryIds]);
  if(products.rows.length!==productIds.length||categories.rows.length!==rule.triggerCategoryIds.length)invalid('Regra contém produto ou categoria de outro restaurante.');
}
async function audit(client:PoolClient,slug:string,row:Obj,user:string,action:string) {await client.query('INSERT INTO upsell_rule_audit(tenant_slug,rule_id,version,actor,action,config) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[slug,row.id,row.version,user,action,JSON.stringify(view(row))]);}
// Optional checkout attribution. Invalid/missing client metadata never prevents a sale.
// The caller uses a savepoint so an infrastructure error here also cannot fail checkout.
export async function attributeUpsellOrder(client:PoolClient,slug:string,orderId:string,items:Array<{productId:string}>,attribution:unknown) {
  if(attribution===undefined||attribution===null)return {attributed:0};
  let sessionId:string,checkoutId:string,offerIds:string[];
  try{
    const input=object(attribution,['sessionId','checkoutId','offerIds']);sessionId=uuid(input.sessionId);checkoutId=uuid(input.checkoutId);
    if(!Array.isArray(input.offerIds)||input.offerIds.length>3||new Set(input.offerIds).size!==input.offerIds.length)return {attributed:0};
    offerIds=input.offerIds.map(uuid);
  }catch(error){if(error instanceof HttpError)return {attributed:0};throw error;}
  if(!offerIds.length)return {attributed:0};
  const feature=await client.query("SELECT released,enabled FROM intelligence_features WHERE tenant_slug=$1 AND feature='upsell'",[slug]);
  if(!feature.rows[0]?.released||!feature.rows[0]?.enabled)return {attributed:0};
  const order=await client.query('SELECT items FROM orders WHERE tenant_slug=$1 AND id=$2',[slug,orderId]);
  if(!order.rows.length)return {attributed:0};
  const valid=await client.query(`SELECT o.id,o.product_id FROM upsell_offers o
    WHERE o.tenant_slug=$1 AND o.session_id=$2 AND o.checkout_id=$3 AND o.id=ANY($4::uuid[]) AND o.expires_at>now()
    AND EXISTS(SELECT 1 FROM upsell_events e WHERE e.tenant_slug=o.tenant_slug AND e.offer_id=o.id AND e.kind='add_to_cart')`,[slug,sessionId,checkoutId,offerIds]);
  const productIds=new Set(items.map(item=>item.productId));
  const orderProductIds=new Set((Array.isArray(order.rows[0].items)?order.rows[0].items:[]).map((item:{productId?:string})=>item?.productId));let attributed=0;
  for(const offer of valid.rows){
    if(!productIds.has(offer.product_id)||!orderProductIds.has(offer.product_id))continue;
    const inserted=await client.query('INSERT INTO upsell_order_attributions(tenant_slug,offer_id,order_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING offer_id',[slug,offer.id,orderId]);
    attributed+=inserted.rows.length;
  }
  return {attributed};
}
export function mountUpsell(app:Express,pool:Pool,guard:RequestHandler) {
  const base='/api/v1/tenants/:slug/upsell';
  app.get(`${base}/rules`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'upsell');
    const rows=await client.query('SELECT * FROM upsell_rules WHERE tenant_slug=$1 AND deleted_at IS NULL ORDER BY priority DESC,id',[req.params.slug]);
    res.json({rules:rows.rows.map(view)});
  }));
  app.post(`${base}/rules`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await tenantLock(client,req.params.slug);await requireFeature(client,req.params.slug,'upsell');
    const rule=upsellRule(req.body);await validateScope(client,req.params.slug,rule);
    const count=await client.query('SELECT count(*) FROM upsell_rules WHERE tenant_slug=$1 AND deleted_at IS NULL',[req.params.slug]);
    if(Number(count.rows[0].count)>=100)invalid('Limite de 100 regras atingido.');
    const user=actor(req),row=await client.query('INSERT INTO upsell_rules(id,tenant_slug,name,enabled,priority,config,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$7) RETURNING *',[crypto.randomUUID(),req.params.slug,rule.name,rule.enabled,rule.priority,JSON.stringify(rule),user]);
    await audit(client,req.params.slug,row.rows[0],user,'created');res.status(201).json({rule:view(row.rows[0])});
  }));
  for(const method of ['patch','put','delete'] as const)app[method](`${base}/rules/:id`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await tenantLock(client,req.params.slug);await requireFeature(client,req.params.slug,'upsell');
    const ruleId=uuid(req.params.id),rows=await client.query('SELECT * FROM upsell_rules WHERE tenant_slug=$1 AND id=$2 AND deleted_at IS NULL FOR UPDATE',[req.params.slug,ruleId]);
    if(!rows.rows.length)throw new HttpError(404,'Regra não encontrada.');
    const old=rows.rows[0],input=object(method==='delete'?req.query:req.body,method==='delete'?['version']:['version',...ruleKeys]);
    const version=method==='delete'&&typeof input.version==='string'&&/^\d+$/.test(input.version)?Number(input.version):input.version;
    if(version!==old.version)throw new HttpError(409,'Regra alterada. Recarregue.');
    const user=actor(req);
    if(method==='delete'){
      const result=await client.query('UPDATE upsell_rules SET deleted_at=now(),enabled=false,version=version+1,updated_by=$3,updated_at=now() WHERE tenant_slug=$1 AND id=$2 RETURNING *',[req.params.slug,ruleId,user]);
      await audit(client,req.params.slug,result.rows[0],user,'deleted');res.json({deleted:true});return;
    }
    const {version:_version,...changes}=input;void _version;
    const rule=upsellRule({...old.config,...changes});await validateScope(client,req.params.slug,rule);
    const result=await client.query('UPDATE upsell_rules SET name=$3,enabled=$4,priority=$5,config=$6::jsonb,version=version+1,updated_by=$7,updated_at=now() WHERE tenant_slug=$1 AND id=$2 RETURNING *',[req.params.slug,ruleId,rule.name,rule.enabled,rule.priority,JSON.stringify(rule),user]);
    await audit(client,req.params.slug,result.rows[0],user,'updated');res.json({rule:view(result.rows[0])});
  }));
  app.get(`${base}/suggestions`,transactionalRoute(pool,async(req,res,client)=>{
    await tenantLock(client,req.params.slug);await requireFeature(client,req.params.slug,'upsell');
    const query=object(req.query,['sessionId','requestId','checkoutId','cart']),sessionId=uuid(query.sessionId),requestId=uuid(query.requestId),checkoutId=uuid(query.checkoutId),cart=upsellCart(query.cart??'[]');
    const products=await client.query('SELECT id,category_id,price_cents FROM products WHERE tenant_slug=$1 AND id=ANY($2::text[]) AND is_available=true',[req.params.slug,cart.map(item=>item.productId)]);
    if(products.rows.length!==cart.length)invalid('Carrinho contém produto indisponível ou de outro restaurante.');
    const verified=cart.map(item=>{const product=products.rows.find(row=>row.id===item.productId);return {...item,categoryId:String(product.category_id),priceCents:Number(product.price_cents)};});
    const cartHash=crypto.createHash('sha256').update(JSON.stringify(cart)).digest('hex');
    const existing=await client.query('SELECT * FROM upsell_requests WHERE tenant_slug=$1 AND request_id=$2',[req.params.slug,requestId]);
    if(existing.rows[0]&&(existing.rows[0].cart_hash!==cartHash||existing.rows[0].session_id!==sessionId||existing.rows[0].checkout_id!==checkoutId))throw new HttpError(409,'Chave de sugestão reutilizada.');
    const now=new Date(),expiresAt=existing.rows[0]?.expires_at||new Date(now.getTime()+15*60000);
    if(new Date(expiresAt).getTime()<=now.getTime()){res.json({suggestions:[],checkoutId,expiresAt});return;}
    if(!existing.rows.length){
      const count=await client.query("SELECT count(*) FROM upsell_requests WHERE tenant_slug=$1 AND created_at>=now()-interval '1 day'",[req.params.slug]);
      if(Number(count.rows[0].count)>=10000)throw new HttpError(429,'Limite diário de sugestões atingido.');
      await client.query('INSERT INTO upsell_requests(tenant_slug,request_id,session_id,checkout_id,cart_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[req.params.slug,requestId,sessionId,checkoutId,cartHash,expiresAt]);
      const rules=await client.query('SELECT * FROM upsell_rules WHERE tenant_slug=$1 AND enabled=true AND deleted_at IS NULL ORDER BY priority DESC,id',[req.params.slug]);
      const used=new Set(cart.map(item=>item.productId));let issued=0;
      for(const row of rules.rows){
        const rule=upsellRule(row.config);
        if(!upsellEligible(rule,verified,now))continue;
        const seen=await client.query('SELECT count(*) FROM upsell_offers WHERE tenant_slug=$1 AND session_id=$2 AND rule_id=$3',[req.params.slug,sessionId,row.id]);
        let remaining=rule.maxImpressionsPerSession-Number(seen.rows[0].count);
        if(remaining<=0)continue;
        const suggested=await client.query('SELECT id FROM products WHERE tenant_slug=$1 AND id=ANY($2::text[]) AND is_available=true ORDER BY id',[req.params.slug,rule.suggestedProductIds]);
        for(const product of suggested.rows){
          if(used.has(product.id)||issued>=3||remaining<=0)continue;
          await client.query('INSERT INTO upsell_offers(id,tenant_slug,request_id,rule_id,rule_version,session_id,checkout_id,product_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[crypto.randomUUID(),req.params.slug,requestId,row.id,row.version,sessionId,checkoutId,product.id,expiresAt]);
          used.add(product.id);issued++;remaining--;
        }
        if(issued>=3)break;
      }
    }
    const offers=await client.query(`SELECT o.id AS offer_id,o.rule_id,p.id,p.name,p.description,p.price_cents,p.image_url,p.category_id FROM upsell_offers o
      JOIN products p ON p.id=o.product_id AND p.tenant_slug=o.tenant_slug
      JOIN upsell_rules r ON r.id=o.rule_id AND r.tenant_slug=o.tenant_slug
      WHERE o.tenant_slug=$1 AND o.request_id=$2 AND p.is_available=true AND r.enabled=true AND r.deleted_at IS NULL AND o.rule_version=r.version AND o.expires_at>now()
      ORDER BY r.priority DESC,r.id,p.id`,[req.params.slug,requestId]);
    res.json({suggestions:offers.rows.map(row=>({offerId:row.offer_id,ruleId:row.rule_id,product:{id:row.id,name:row.name,description:row.description,priceCents:row.price_cents,imageUrl:row.image_url,categoryId:row.category_id}})),checkoutId,expiresAt});
  }));
  app.post(`${base}/events`,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'upsell');
    const body=object(req.body,['eventId','offerId','sessionId','kind']),eventId=uuid(body.eventId),offerId=uuid(body.offerId),sessionId=uuid(body.sessionId);
    if(typeof body.kind!=='string'||!['impression','add_to_cart'].includes(body.kind))invalid('Evento de sugestão inválido.');
    const old=await client.query('SELECT offer_id,kind FROM upsell_events WHERE tenant_slug=$1 AND event_id=$2',[req.params.slug,eventId]);
    if(old.rows[0]){
      if(old.rows[0].offer_id!==offerId||old.rows[0].kind!==body.kind)throw new HttpError(409,'Identificador de evento reutilizado.');
      const scope=await client.query('SELECT 1 FROM upsell_offers WHERE tenant_slug=$1 AND id=$2 AND session_id=$3',[req.params.slug,offerId,sessionId]);
      if(!scope.rows.length)invalid('Oferta inválida.');res.json({accepted:true,duplicate:true});return;
    }
    const offers=await client.query('SELECT 1 FROM upsell_offers WHERE tenant_slug=$1 AND id=$2 AND session_id=$3 AND expires_at>now()',[req.params.slug,offerId,sessionId]);
    if(!offers.rows.length)invalid('Oferta expirada ou inválida.');
    const inserted=await client.query('INSERT INTO upsell_events(tenant_slug,event_id,offer_id,kind) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING event_id',[req.params.slug,eventId,offerId,body.kind]);
    if(!inserted.rows.length){
      const collision=await client.query('SELECT offer_id,kind FROM upsell_events WHERE tenant_slug=$1 AND event_id=$2',[req.params.slug,eventId]);
      if(collision.rows[0]&&(collision.rows[0].offer_id!==offerId||collision.rows[0].kind!==body.kind))throw new HttpError(409,'Identificador de evento reutilizado.');
    }
    res.status(202).json({accepted:true,duplicate:!inserted.rows.length});
  }));
  app.get(`${base}/metrics`,guard,requireIntelligenceOwner,transactionalRoute(pool,async(req,res,client)=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await requireFeature(client,req.params.slug,'upsell');
    const query=object(req.query,['days']);
    if(query.days!==undefined&&(typeof query.days!=='string'||!/^\d{1,2}$/.test(query.days)))invalid('Período inválido.');
    const days=query.days===undefined?30:Number(query.days);integer(days,1,93);
    const result=await client.query("SELECT count(*) FILTER(WHERE kind='impression') AS impressions,count(*) FILTER(WHERE kind='add_to_cart') AS additions FROM upsell_events WHERE tenant_slug=$1 AND created_at>=now()-($2::int*interval '1 day')",[req.params.slug,days]);
    const purchases=await client.query(`SELECT count(DISTINCT(a.order_id,a.offer_id)) FILTER(WHERE ${SETTLED_PIX_SQL}) AS conversions,
      count(DISTINCT a.order_id) AS created_orders_attributed,count(DISTINCT a.order_id) FILTER(WHERE ${SETTLED_PIX_SQL}) AS paid_orders_attributed
      FROM upsell_order_attributions a JOIN orders o ON o.id=a.order_id AND o.tenant_slug=a.tenant_slug
      LEFT JOIN pix_transactions p ON p.order_id=o.id AND p.tenant_slug=o.tenant_slug
      WHERE a.tenant_slug=$1 AND a.created_at>=now()-($2::int*interval '1 day')`,[req.params.slug,days]);
    res.json({days,impressions:Number(result.rows[0].impressions),addToCart:Number(result.rows[0].additions),purchaseConversions:Number(purchases.rows[0].conversions),createdOrdersAttributed:Number(purchases.rows[0].created_orders_attributed),paidOrdersAttributed:Number(purchases.rows[0].paid_orders_attributed),attributionNote:'Conversões exigem oferta correlacionada pelo checkout e Pix comprovado. Adições ao carrinho são telemetria.',computedAt:new Date().toISOString()});
  }));
}
