import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {orderedSalesPriceBuckets} from '../frontend/src/utils/orderedSalesPriceBuckets.mjs';
const {resolveSalesPriceBucket}=createRequire(import.meta.url)('../backend/dist/utils/orderSalesValue.js');
test('required price tiers match the order valuation contract including the minimum and maximum tiers',()=>{
 const buckets=[100,1,50,200,50];
 for(const quantity of [1,49,50,60,100,150,200,999])assert.deepEqual([...orderedSalesPriceBuckets([quantity],buckets)],[resolveSalesPriceBucket(quantity,buckets)]);
 assert.deepEqual([...orderedSalesPriceBuckets([1],[50,100])],[50]);
});
test('separate orders never combine into a higher tier; unused and invalid quantities require no price',()=>{
 assert.deepEqual([...orderedSalesPriceBuckets([60,60],[1,50,100])],[50]);
 assert.deepEqual([...orderedSalesPriceBuckets([60,150],[1,50,100])],[50,100]);
 assert.equal(orderedSalesPriceBuckets([0,-1,null,1.5], [1,50]).size,0);
 assert.equal(orderedSalesPriceBuckets([], [1,50]).size,0);
 assert.equal(orderedSalesPriceBuckets([100], []).size,0);
});
