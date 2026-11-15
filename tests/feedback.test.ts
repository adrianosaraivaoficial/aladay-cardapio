import test from 'node:test';
import assert from 'node:assert/strict';
import {feedbackInput,feedbackTokenHash} from '../backend/feedback';
const token='a'.repeat(64);
test('feedback has strict rating and absent public consent stays false',()=>{
  assert.deepEqual(feedbackInput({token,rating:4,comment:' Boa experiência '}),{token,rating:4,comment:'Boa experiência',publicConsent:false});
  assert.equal(feedbackInput({token,rating:1,publicConsent:true}).publicConsent,true);
});
test('feedback rejects unknown fields, coerced consent, excessive comments and malformed tokens',()=>{
  for(const value of [{token,rating:0},{token,rating:6},{token,rating:'5'},{token,rating:5,publicConsent:'true'},{token,rating:5,comment:'x'.repeat(2001)},{token:'a'.repeat(63),rating:5},{token,rating:5,tenantSlug:'other'},{token,rating:5,comment:'\u0000'}]) assert.throws(()=>feedbackInput(value));
});
test('feedback token hashing is stable and never stores the token itself',()=>{assert.equal(feedbackTokenHash(token),feedbackTokenHash(token));assert.match(feedbackTokenHash(token),/^[a-f0-9]{64}$/);assert.notEqual(feedbackTokenHash(token),token);});
