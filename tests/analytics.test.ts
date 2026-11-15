import test from 'node:test';
import assert from 'node:assert/strict';
import { analyticsEvent, analyticsPeriod, analyticsComparison, analyticsCsv } from '../backend/analytics';

const event={eventId:'d5cbfe69-545c-4ad5-85c3-671d8fbdbb10',sessionId:'20b08e84-f31f-4421-869f-969184b38cb3',kind:'menu_view',channel:'web'};
test('analytics event allowlist never accepts identity or arbitrary payload fields',()=>{
  assert.deepEqual(analyticsEvent(event),{...event,productId:null});
  for (const field of ['phone','email','name','metadata','tenantSlug','occurredAt','orderId','amountCents']) assert.throws(()=>analyticsEvent({...event,[field]:'untrusted'}));
  assert.throws(()=>analyticsEvent({...event,sessionId:'5511999999999'}));
  assert.throws(()=>analyticsEvent({...event,kind:'order_paid'}));
  assert.throws(()=>analyticsEvent({...event,eventId:[event.eventId]}));
  assert.throws(()=>analyticsEvent({...event,sessionId:[event.sessionId]}));
  assert.throws(()=>analyticsEvent({...event,kind:['menu_view']}));
  assert.throws(()=>analyticsEvent({...event,channel:'<script>'}));
});
test('product telemetry requires explicit safe product IDs',()=>{
  assert.throws(()=>analyticsEvent({...event,kind:'product_view'}));
  assert.throws(()=>analyticsEvent({...event,kind:'product_click',productId:'../other'}));
  assert.equal(analyticsEvent({...event,kind:'product_view',productId:'prod_123'}).productId,'prod_123');
});
test('periods preserve civil dates across timezone and daylight changes',()=>{
  const period=analyticsPeriod({from:'2024-03-09',to:'2024-03-11',timezone:'America/New_York'},new Date('2026-01-01T00:00:00Z'));
  assert.equal(period.days,3);assert.equal(period.previousFrom,'2024-03-06');assert.equal(period.previousTo,'2024-03-08');
  const local=analyticsPeriod({},new Date('2026-11-14T01:00:00Z'));
  assert.equal(local.to,'2026-11-13');assert.equal(local.from,'2026-10-15');
});
test('period bounds reject invalid calendar dates and costly or future requests',()=>{
  const now=new Date('2026-11-14T15:00:00Z');
  for (const input of [{from:'2026-02-30',to:'2026-03-01'},{from:'2026-03-01',to:'2026-02-01'},{from:'2026-01-01',to:'2026-11-14'},{to:'2027-01-01'},{timezone:'Moon/Base'},{channel:'all'},{from:['2026-01-01']}]) assert.throws(()=>analyticsPeriod(input,now));
});
test('comparison reports unavailable percentage for a zero baseline',()=>{
  assert.deepEqual(analyticsComparison({orders:5,revenue:200},{orders:0,revenue:100}),{orders:{delta:5,percent:null},revenue:{delta:100,percent:100}});
});
test('aggregate export escapes cells and omits unknown sensitive fields',()=>{
  const csv=analyticsCsv([{date:'2026-11-14',channel:'web',ordersCount:2,customerPhone:'5511999999999'}]);
  assert.match(csv,/"2026-11-14","web","2"/);
  assert.ok(!csv.includes('5511999999999'));
  assert.ok(!csv.includes('customerPhone'));
});
