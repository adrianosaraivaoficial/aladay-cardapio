import test from 'node:test';
import assert from 'node:assert/strict';
import { upsellRule, upsellCart, upsellSchedule, upsellEligible, attributeUpsellOrder } from '../backend/upsell';
import type { PoolClient } from 'pg';
const base={name:'Bebida com lanche',enabled:true,suggestedProductIds:['drink'],triggerProductIds:['burger']};
test('new rules are disabled by default and reject forged pricing/configuration',()=>{
  assert.equal(upsellRule({name:'Regra',suggestedProductIds:['drink']}).enabled,false);
  for(const change of [{discountCents:500},{tenantSlug:'other'},{suggestedProductIds:['../other']},{suggestedProductIds:[]},{priority:1001},{enabled:'true'},{timezone:'Moon/Base'},{startTime:'25:00'},{weekdays:[7]},{maxImpressionsPerSession:0}])assert.throws(()=>upsellRule({...base,...change}));
});
test('cart schema accepts quantities only and canonically sorts IDs',()=>{
  assert.deepEqual(upsellCart(JSON.stringify([{productId:'z',quantity:1},{productId:'a',quantity:2}])),[{productId:'a',quantity:2},{productId:'z',quantity:1}]);
  for(const cart of [[{productId:'a',quantity:0}],[{productId:'a',quantity:100}],[{productId:'a',quantity:1,priceCents:1}],[{productId:'a',quantity:1},{productId:'a',quantity:2}]])assert.throws(()=>upsellCart(cart));
  assert.throws(()=>upsellCart('invalid JSON'));
});
test('scheduled windows use local IANA time and handle overnight starting weekday',()=>{
  const schedule={timezone:'America/Sao_Paulo',weekdays:[1],startTime:'22:00',endTime:'02:00'};
  assert.equal(upsellSchedule(schedule,new Date('2026-11-17T02:30:00Z')),true,'Monday 23:30');
  assert.equal(upsellSchedule(schedule,new Date('2026-11-17T04:00:00Z')),true,'Tuesday 01:00 belongs to Monday window');
  assert.equal(upsellSchedule(schedule,new Date('2026-11-17T05:00:00Z')),false,'exclusive 02:00 endpoint');
  assert.equal(upsellSchedule(schedule,new Date('2026-11-18T04:00:00Z')),false,'Wednesday 01:00 belongs to Tuesday');
});
test('eligibility combines verified base subtotal, category/product triggers, schedule and enabled flag',()=>{
  const rule=upsellRule({...base,minSubtotalCents:2000,maxSubtotalCents:3000,triggerCategoryIds:['snacks']});
  const cart=[{productId:'burger',categoryId:'snacks',quantity:2,priceCents:1000}],now=new Date('2026-11-14T18:00:00Z');
  assert.equal(upsellEligible(rule,cart,now),true);
  assert.equal(upsellEligible(rule,[{...cart[0],quantity:1}],now),false);
  assert.equal(upsellEligible(rule,[{...cart[0],quantity:4}],now),false);
  assert.equal(upsellEligible(rule,[{...cart[0],categoryId:'foreign'}],now),false);
  assert.equal(upsellEligible({...rule,enabled:false},cart,now),false);
});
test('optional checkout attribution ignores malformed metadata and disabled features',async()=>{
  let queried=0;
  const client={query:async()=>{queried++;return {rows:[]};}} as unknown as PoolClient;
  for(const attribution of [null,undefined,{orderId:'forged'},{sessionId:'phone',checkoutId:'email',offerIds:[]}])assert.equal((await attributeUpsellOrder(client,'tenant','order',[],attribution)).attributed,0);
  assert.equal(queried,0,'invalid client metadata never reads or mutates checkout tables');
  const attribution={sessionId:'d5cbfe69-545c-4ad5-85c3-671d8fbdbb10',checkoutId:'20b08e84-f31f-4421-869f-969184b38cb3',offerIds:['55385ec0-b988-45ac-a494-3df90f1a7e52']};
  assert.equal((await attributeUpsellOrder(client,'tenant','order',[],attribution)).attributed,0);assert.equal(queried,1,'disabled feature returns before order lookup');
});
