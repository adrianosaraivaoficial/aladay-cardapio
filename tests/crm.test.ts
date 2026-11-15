import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCrmCustomers } from '../backend/crm';
import { HttpError } from '../backend/database';

test('legacy CRM normalizes phone and never infers marketing consent',()=>{
  assert.deepEqual(normalizeCrmCustomers([{name:' Ana ',phone:'(11) 99999-9999',ordersCount:50}], 'test-a'),[{name:'Ana',phone:'5511999999999',notes:'',marketingConsent:false}]);
});
test('CRM validates tenant attribution, limits, consent types and duplicate normalized phones',()=>{
  const customer={name:'Ana',phone:'11999999999'};
  for(const input of [[{...customer,tenantSlug:'test-b'}],[{...customer,marketingConsent:'true'}],[{...customer,admin:true}],[customer,{...customer,phone:'5511999999999'}],Array.from({length:2001},()=>customer)]) assert.throws(()=>normalizeCrmCustomers(input,'test-a'),HttpError);
});
test('explicit consent and notes survive migration normalization without mutating the source',()=>{
  const source=[{id:'legacy-1',name:'Ana',phone:'11999999999',notes:'Prefere retirar',marketingConsent:true}];
  const snapshot=JSON.stringify(source);
  assert.equal(normalizeCrmCustomers(source,'test-a')[0].marketingConsent,true);
  assert.equal(JSON.stringify(source),snapshot);
});
