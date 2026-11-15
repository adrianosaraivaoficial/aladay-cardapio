import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { Pool, PoolClient } from 'pg';
import { HttpError, transactionalRoute } from './database';
import { requireFeature } from './intelligence';
import { tenantLock } from './catalog';

type Input=Record<string,unknown>;
export const ANALYTICS_CHANNELS=['web','whatsapp','qr','unknown'] as const;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value:unknown,keys:string[]):Input {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new HttpError(400,'Objeto inválido.');
  const input=value as Input;
  if (Object.keys(input).some(key=>!keys.includes(key))) throw new HttpError(400,'Campo não permitido.');
  return input;
}
export function analyticsEvent(value:unknown) {
  const input=object(value,['eventId','kind','productId','sessionId','channel']);
  if (JSON.stringify(input).length>1000 || typeof input.eventId!=='string' || typeof input.sessionId!=='string' || typeof input.kind!=='string' || typeof input.channel!=='string' || !UUID.test(input.eventId) || !UUID.test(input.sessionId) || !['menu_view','product_view','product_click','checkout_start'].includes(input.kind) || !ANALYTICS_CHANNELS.includes(input.channel as typeof ANALYTICS_CHANNELS[number])) throw new HttpError(400,'Evento anônimo inválido.');
  const productId=input.productId===undefined?null:input.productId;
  if ((productId!==null && (typeof productId!=='string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(productId))) || (['product_view','product_click'].includes(String(input.kind)) && !productId)) throw new HttpError(400,'Produto obrigatório ou inválido.');
  return {eventId:String(input.eventId).toLowerCase(),sessionId:String(input.sessionId).toLowerCase(),kind:String(input.kind),channel:String(input.channel),productId};
}
const dayString=(date:Date)=>date.toISOString().slice(0,10);
function date(value:unknown):string {
  if (typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400,'Use datas YYYY-MM-DD.');
  const parsed=new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || dayString(parsed)!==value) throw new HttpError(400,'Data inválida.');
  return value;
}
export function analyticsPeriod(value:unknown,now=new Date()) {
  const input=object(value,['from','to','timezone','channel']);
  const timezone=input.timezone===undefined?'America/Sao_Paulo':input.timezone;
  if (typeof timezone!=='string' || timezone.length>80 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(timezone)) throw new HttpError(400,'Fuso horário inválido.');
  try {new Intl.DateTimeFormat('en',{timeZone:timezone}).format(now);} catch {throw new HttpError(400,'Fuso horário inválido.');}
  const localToday=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const to=date(input.to??localToday),from=date(input.from??dayString(new Date(new Date(`${to}T00:00:00Z`).getTime()-29*86400000)));
  const days=(Date.parse(to)-Date.parse(from))/86400000+1;
  if (days<1 || days>93 || to>localToday || from<'2020-01-01') throw new HttpError(400,'Período deve ter de 1 a 93 dias, sem datas futuras.');
  const channel=input.channel===undefined?null:input.channel;
  if (channel!==null && !ANALYTICS_CHANNELS.includes(channel as typeof ANALYTICS_CHANNELS[number])) throw new HttpError(400,'Canal inválido.');
  const previousTo=dayString(new Date(Date.parse(from)-86400000)),previousFrom=dayString(new Date(Date.parse(from)-days*86400000));
  return {from,to,timezone,channel,days,previousFrom,previousTo};
}
type Period=ReturnType<typeof analyticsPeriod>;
const columns={ordersCount:'orders_count',cancelledOrdersCount:'cancelled_orders_count',totalOrderValueCents:'total_order_value_cents',paidOrdersCount:'paid_orders_count',confirmedRevenueCents:'confirmed_revenue_cents',menuViews:'menu_views',productViews:'product_views',productClicks:'product_clicks',checkoutStarts:'checkout_starts'};
function metrics(rows:Input[]) {
  return Object.fromEntries(Object.entries(columns).map(([key,column])=>[key,rows.reduce((sum,row)=>sum+Number(row[column]||0),0)]));
}
function daily(row:Input) {return {date:typeof row.day==='string'?row.day.slice(0,10):dayString(row.day as Date),channel:row.channel,...metrics([row])};}
export function analyticsComparison(current:Record<string,number>,previous:Record<string,number>) {
  return Object.fromEntries(Object.keys(current).map(key=>[key,{delta:current[key]-previous[key],percent:previous[key]===0?null:Math.round((current[key]-previous[key])/previous[key]*10000)/100}]));
}
// Source-of-truth settlement proof: never infer revenue from an order's paid_online flag.
export const SETTLED_PIX_SQL=`p.status='PAID' AND p.paid_at IS NOT NULL AND p.end_to_end_id IS NOT NULL
  AND p.amount_cents=o.total_cents AND o.status NOT IN ('cancelled','refunded')
  AND o.payment_status NOT IN ('refunded','cancelled','chargeback')`;

async function rebuild(client:PoolClient,slug:string,period:Period,actor:string) {
  await tenantLock(client,slug);await requireFeature(client,slug,'analytics');
  const tz=await client.query('SELECT 1 FROM pg_timezone_names WHERE name=$1',[period.timezone]);
  if (!tz.rows.length) throw new HttpError(400,'Fuso não suportado pelo banco.');
  // One rebuild covers current and previous periods; cap source volume before expensive grouping.
  const params=[slug,period.previousFrom,period.to,period.timezone];
  const counts=await client.query(`SELECT
    (SELECT count(*) FROM (SELECT 1 FROM orders WHERE tenant_slug=$1 AND created_at>=($2::date::timestamp AT TIME ZONE $4) AND created_at<(($3::date+1)::timestamp AT TIME ZONE $4) LIMIT 100001) x) AS orders,
    (SELECT count(*) FROM (SELECT 1 FROM pix_transactions WHERE tenant_slug=$1 AND paid_at>=($2::date::timestamp AT TIME ZONE $4) AND paid_at<(($3::date+1)::timestamp AT TIME ZONE $4) LIMIT 100001) x) AS settlements,
    (SELECT count(*) FROM (SELECT 1 FROM analytics_events WHERE tenant_slug=$1 AND received_at>=($2::date::timestamp AT TIME ZONE $4) AND received_at<(($3::date+1)::timestamp AT TIME ZONE $4) LIMIT 200001) x) AS events`,params);
  if (Number(counts.rows[0].orders)>100000 || Number(counts.rows[0].settlements)>100000 || Number(counts.rows[0].events)>200000) throw new HttpError(413,'Volume excessivo; selecione um período menor.');
  const last=await client.query('SELECT COALESCE(max(version),0)+1 AS version FROM analytics_rebuilds WHERE tenant_slug=$1',[slug]);
  const version=Number(last.rows[0].version),jobId=crypto.randomUUID();
  await client.query('DELETE FROM analytics_daily WHERE tenant_slug=$1 AND timezone=$4 AND day BETWEEN $2::date AND $3::date',params);
  await client.query('DELETE FROM analytics_product_daily WHERE tenant_slug=$1 AND timezone=$4 AND day BETWEEN $2::date AND $3::date',params);
  // Dense day/channel grid also proves coverage for days with no facts.
  await client.query(`INSERT INTO analytics_daily(tenant_slug,timezone,day,channel,version)
    SELECT $1,$4,day::date,channel,$5 FROM generate_series($2::date,$3::date,'1 day'::interval) day
    CROSS JOIN unnest(ARRAY['web','whatsapp','qr','unknown']) channel`,[...params,version]);
  await client.query(`WITH grouped AS (
    SELECT (created_at AT TIME ZONE $4)::date AS day,count(*) AS orders_count,
    count(*) FILTER(WHERE status IN ('cancelled','refunded')) AS cancelled_orders_count,
    COALESCE(sum(total_cents) FILTER(WHERE status NOT IN ('cancelled','refunded')),0) AS total_order_value_cents
    FROM orders WHERE tenant_slug=$1 AND created_at>=($2::date::timestamp AT TIME ZONE $4) AND created_at<(($3::date+1)::timestamp AT TIME ZONE $4)
    GROUP BY 1)
    UPDATE analytics_daily d SET orders_count=g.orders_count,cancelled_orders_count=g.cancelled_orders_count,total_order_value_cents=g.total_order_value_cents
    FROM grouped g WHERE d.tenant_slug=$1 AND d.timezone=$4 AND d.channel='unknown' AND d.day=g.day`,params);
  await client.query(`WITH settled AS (
    SELECT (p.paid_at AT TIME ZONE $4)::date AS day,count(*) AS paid_orders_count,sum(p.amount_cents) AS confirmed_revenue_cents
    FROM pix_transactions p JOIN orders o ON o.id=p.order_id AND o.tenant_slug=p.tenant_slug
    WHERE p.tenant_slug=$1 AND ${SETTLED_PIX_SQL} AND p.paid_at>=($2::date::timestamp AT TIME ZONE $4) AND p.paid_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY 1)
    UPDATE analytics_daily d SET paid_orders_count=s.paid_orders_count,confirmed_revenue_cents=s.confirmed_revenue_cents
    FROM settled s WHERE d.tenant_slug=$1 AND d.timezone=$4 AND d.channel='unknown' AND d.day=s.day`,params);
  await client.query(`WITH events AS (
    SELECT (received_at AT TIME ZONE $4)::date AS day,channel,
    count(*) FILTER(WHERE kind='menu_view') AS menu_views,count(*) FILTER(WHERE kind='product_view') AS product_views,
    count(*) FILTER(WHERE kind='product_click') AS product_clicks,count(*) FILTER(WHERE kind='checkout_start') AS checkout_starts
    FROM analytics_events WHERE tenant_slug=$1 AND received_at>=($2::date::timestamp AT TIME ZONE $4) AND received_at<(($3::date+1)::timestamp AT TIME ZONE $4) GROUP BY 1,2)
    UPDATE analytics_daily d SET menu_views=e.menu_views,product_views=e.product_views,product_clicks=e.product_clicks,checkout_starts=e.checkout_starts
    FROM events e WHERE d.tenant_slug=$1 AND d.timezone=$4 AND d.day=e.day AND d.channel=e.channel`,params);
  // Count ordered units and settled units separately. Snapshot item totals include add-ons;
  // delivery fees stay in order revenue and never become product revenue.
  await client.query(`WITH facts AS (
    SELECT (o.created_at AT TIME ZONE $4)::date AS day,'unknown'::text AS channel,item->>'productId' AS product_id,
    COALESCE(item->>'productName','Produto removido') AS name,
    CASE WHEN item->>'quantity' ~ '^[0-9]{1,2}$' THEN (item->>'quantity')::bigint ELSE 0 END AS ordered,0::bigint AS confirmed,0::bigint AS value,0::bigint AS views,0::bigint AS clicks
    FROM orders o CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) item
    WHERE o.tenant_slug=$1 AND o.status NOT IN ('cancelled','refunded') AND o.created_at>=($2::date::timestamp AT TIME ZONE $4) AND o.created_at<(($3::date+1)::timestamp AT TIME ZONE $4)
    UNION ALL
    SELECT (p.paid_at AT TIME ZONE $4)::date,'unknown',item->>'productId',COALESCE(item->>'productName','Produto removido'),0,
    CASE WHEN item->>'quantity' ~ '^[0-9]{1,2}$' THEN (item->>'quantity')::bigint ELSE 0 END,
    CASE WHEN item->>'totalCents' ~ '^[0-9]{1,9}$' THEN (item->>'totalCents')::bigint ELSE 0 END,0,0
    FROM pix_transactions p JOIN orders o ON o.id=p.order_id AND o.tenant_slug=p.tenant_slug
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.items)='array' THEN o.items ELSE '[]'::jsonb END) item
    WHERE p.tenant_slug=$1 AND ${SETTLED_PIX_SQL} AND p.paid_at>=($2::date::timestamp AT TIME ZONE $4) AND p.paid_at<(($3::date+1)::timestamp AT TIME ZONE $4)
    UNION ALL
    SELECT (e.received_at AT TIME ZONE $4)::date,e.channel,e.product_id,COALESCE(p.name,'Produto removido'),0,0,0,
    CASE WHEN kind='product_view' THEN 1 ELSE 0 END,CASE WHEN kind='product_click' THEN 1 ELSE 0 END
    FROM analytics_events e LEFT JOIN products p ON p.id=e.product_id AND p.tenant_slug=e.tenant_slug
    WHERE e.tenant_slug=$1 AND e.product_id IS NOT NULL AND e.received_at>=($2::date::timestamp AT TIME ZONE $4) AND e.received_at<(($3::date+1)::timestamp AT TIME ZONE $4))
    INSERT INTO analytics_product_daily(tenant_slug,timezone,day,channel,product_id,product_name,category_id,units_ordered,units_confirmed,confirmed_item_value_cents,views,clicks,version)
    SELECT $1,$4,f.day,f.channel,f.product_id,COALESCE(max(p.name),max(f.name)),max(p.category_id),sum(ordered),sum(confirmed),sum(value),sum(views),sum(clicks),$5
    FROM facts f LEFT JOIN products p ON p.id=f.product_id AND p.tenant_slug=$1
    WHERE f.product_id IS NOT NULL AND length(f.product_id)<=80 GROUP BY f.day,f.channel,f.product_id`,[...params,version]);
  const result=await client.query(`INSERT INTO analytics_rebuilds(id,tenant_slug,timezone,from_date,to_date,version,actor)
    VALUES($1,$2,$3,$4::date,$5::date,$6,$7) RETURNING *`,[jobId,slug,period.timezone,period.previousFrom,period.to,version,actor]);
  return {jobId,version,computedAt:result.rows[0].computed_at,from:period.previousFrom,to:period.to,timezone:period.timezone,status:'completed'};
}
async function report(client:PoolClient,slug:string,period:Period) {
  await requireFeature(client,slug,'analytics');
  const result=await client.query(`SELECT d.*,d.day::text AS day FROM analytics_daily d WHERE d.tenant_slug=$1 AND d.timezone=$2 AND d.day BETWEEN $3::date AND $4::date AND ($5::text IS NULL OR d.channel=$5) ORDER BY d.day,d.channel`,[slug,period.timezone,period.previousFrom,period.to,period.channel]);
  const current=result.rows.filter(row=>daily(row).date>=period.from),previous=result.rows.filter(row=>daily(row).date<period.from);
  const expected=period.days*(period.channel?1:4),pending=current.length!==expected || previous.length!==expected;
  const timestamps=result.rows.map(row=>new Date(row.computed_at).getTime());
  const computedAt=timestamps.length?new Date(Math.min(...timestamps)).toISOString():null;
  const dataLagSeconds=computedAt?Math.max(0,Math.floor((Date.now()-Date.parse(computedAt))/1000)):null;
  return {timezone:period.timezone,period:{from:period.from,to:period.to},channel:period.channel,computedAt,dataLagSeconds,isStale:pending||dataLagSeconds===null||dataLagSeconds>300,version:result.rows.length?Math.min(...result.rows.map(row=>Number(row.version))):null,pending,current,previous};
}
export function analyticsCsv(rows:Array<Record<string,unknown>>) {
  const keys=['date','channel',...Object.keys(columns)];
  const cell=(value:unknown)=>`"${String(value??'').replace(/"/g,'""')}"`;
  return [keys.map(cell).join(','),...rows.map(row=>keys.map(key=>cell(row[key])).join(','))].join('\r\n');
}
export function mountAnalytics(app:Express,pool:Pool,guard:RequestHandler,superGuard:RequestHandler) {
  const base='/api/v1/tenants/:slug/analytics';
  app.post(`${base}/events`,transactionalRoute(pool,async(req,res,client)=>{
    await requireFeature(client,req.params.slug,'analytics');
    const event=analyticsEvent(req.body);
    let categoryId:string|null=null;
    if (event.productId) {
      const product=await client.query('SELECT category_id FROM products WHERE tenant_slug=$1 AND id=$2',[req.params.slug,event.productId]);
      if (!product.rows.length) throw new HttpError(400,'Produto inválido para o restaurante.');
      categoryId=product.rows[0].category_id;
    }
    // Stable retries return success without adding facts; changed payload under the same key is rejected.
    const inserted=await client.query(`INSERT INTO analytics_events(tenant_slug,event_id,kind,product_id,category_id,session_id,channel)
      VALUES($1,$2::uuid,$3,$4,$5,$6::uuid,$7) ON CONFLICT(tenant_slug,event_id) DO NOTHING RETURNING event_id`,[req.params.slug,event.eventId,event.kind,event.productId,categoryId,event.sessionId,event.channel]);
    if (!inserted.rows.length) {
      const existing=await client.query('SELECT kind,product_id,session_id,channel FROM analytics_events WHERE tenant_slug=$1 AND event_id=$2::uuid',[req.params.slug,event.eventId]);
      const old=existing.rows[0];
      if (!old || old.kind!==event.kind || old.product_id!==event.productId || old.session_id!==event.sessionId || old.channel!==event.channel) throw new HttpError(409,'Identificador de evento já utilizado.');
    }
    res.status(202).json({accepted:true,duplicate:!inserted.rows.length});
  }));
  app.post(`${base}/rebuild`,superGuard,transactionalRoute(pool,async(req,res,client)=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await requireFeature(client,req.params.slug,'analytics');
    const period=analyticsPeriod(req.body||{}),actor=String((req as unknown as {user?:{sub:string}}).user?.sub||'');
    if (!actor) throw new HttpError(401,'Autor obrigatório.');
    if (period.channel) throw new HttpError(400,'Reconstrução deve incluir todos os canais.');
    res.json(await rebuild(client,req.params.slug,period,actor));
  }));
  for (const kind of ['summary','timeseries','products','export']) app.get(`${base}/${kind}`,guard,transactionalRoute(pool,async(req,res,client)=>{
    await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await requireFeature(client,req.params.slug,'analytics');
    const period=analyticsPeriod(req.query),data=await report(client,req.params.slug,period);
    const {current,previous,...metadata}=data;
    if (kind==='summary') {
      const now=metrics(current),before=metrics(previous);
      const averageTicketCents=now.paidOrdersCount?Math.round(now.confirmedRevenueCents/now.paidOrdersCount):null;
      const previousTicket=before.paidOrdersCount?Math.round(before.confirmedRevenueCents/before.paidOrdersCount):null;
      res.json({...metadata,metrics:{...now,averageTicketCents},previous:{...before,averageTicketCents:previousTicket},comparison:analyticsComparison(now,before),conversionRate:null,conversionUnavailableReason:'Sessões de telemetria não possuem vínculo verificável com pedidos. Conversão de compra indisponível.'});
    } else if (kind==='timeseries') res.json({...metadata,rows:current.map(daily)});
    else if (kind==='export') res.json({...metadata,filename:`analytics-${period.from}-${period.to}.csv`,csv:analyticsCsv(current.map(daily))});
    else {
      const products=await client.query(`SELECT product_id,max(product_name) AS name,max(category_id) AS category_id,sum(units_ordered) AS units_ordered,sum(units_confirmed) AS units_confirmed,sum(confirmed_item_value_cents) AS confirmed_item_value_cents,sum(views) AS views,sum(clicks) AS clicks
        FROM analytics_product_daily WHERE tenant_slug=$1 AND timezone=$2 AND day BETWEEN $3::date AND $4::date AND ($5::text IS NULL OR channel=$5)
        GROUP BY product_id ORDER BY sum(units_confirmed) DESC,product_id LIMIT 1000`,[req.params.slug,period.timezone,period.from,period.to,period.channel]);
      res.json({...metadata,rows:products.rows.map(row=>({productId:row.product_id,name:row.name,categoryId:row.category_id,unitsOrdered:Number(row.units_ordered),unitsConfirmed:Number(row.units_confirmed),confirmedItemValueCents:Number(row.confirmed_item_value_cents),views:Number(row.views),clicks:Number(row.clicks)}))});
    }
  }));
}
