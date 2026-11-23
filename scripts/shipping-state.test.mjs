import test from 'node:test';
import assert from 'node:assert/strict';
import {shippingState} from '../frontend/src/utils/shippingState.mjs';
test('request receipt and transport progress display separately without changing stored state',()=>{
 for(const [job,request,expected]of [
  [{receiptStatus:'PENDING',status:'DRAFT'},false,'PENDING'],
  [{receiptStatus:'PENDING',status:'IN_TRANSIT'},true,'PENDING'],
  [{receiptStatus:'PENDING',status:'CANCELLED'},true,'CANCELLED'],
  [{receiptStatus:'ACCEPTED',status:'DRAFT'},true,'ACCEPTED'],
  [{receiptStatus:'ACCEPTED',status:'IN_TRANSIT'},true,'ACCEPTED'],
  [{receiptStatus:'ACCEPTED',status:'IN_TRANSIT'},false,'IN_TRANSIT'],
  [{receiptStatus:'ACCEPTED',status:'DELIVERED'},false,'DELIVERED'],
  [{status:'DRAFT'},true,'ACCEPTED'],
 ]){const original=structuredClone(job);assert.equal(shippingState(job,{request}),expected);assert.deepEqual(job,original);}
});
