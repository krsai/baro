import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {sameShippingParty} from '../frontend/src/utils/shippingParties.mjs';
const require=createRequire(import.meta.url),{assertDistinctShippingParties}=require('../backend/dist/services/shippingParties');
test('shipper and consignee cannot use the same real company, including confirmed linked identities',()=>{
 for(const [a,b,same] of [[{id:1},{id:1},true],[{id:1},{id:2},false],[{id:1},{id:2,linkedCompany:{sourceEntityId:1}},true],[{id:1,linkedCompany:{identityId:8}},{id:2,linkedCompany:{identityId:8}},true],[{name:'Same name'},{name:'Same name'},false],[null,{id:1},false]]){
  assert.equal(sameShippingParty(a,b),same);
  if(same)assert.throws(()=>assertDistinctShippingParties(a,b),/SHIPPING_PARTIES_OVERLAP/);else assert.doesNotThrow(()=>assertDistinctShippingParties(a,b));
 }
});
test('customer requests reject overlapping registered shipper and consignee before persisting snapshots',async()=>{
 const {submitShippingRequest}=require('../backend/dist/services/shippingRequests');
 await assert.rejects(submitShippingRequest({},1,1,{mode:'SEA',data:{shipperId:7,consigneeId:7}}),/SHIPPING_PARTIES_OVERLAP/);
});
