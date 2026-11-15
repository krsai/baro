import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {searchShippingPorts}=require('../backend/dist/services/shippingPorts');
const scope=require('../backend/data/shipping-ports-search-scope.json');
test('port lookup binds primary gateway scope for empty and exact searches',async()=>{
 assert.equal(scope.codes.length,20);
 assert.equal(new Set(scope.codes).size,20);
 assert.ok(scope.codes.includes('VNHPH')&&scope.codes.includes('KRINC'));
 assert.ok(!scope.codes.includes('VNC8Q')&&!scope.codes.includes('JPKIJ'));
 for(const query of ['', 'VNC8Q', '%']){
  const db={$queryRawUnsafe:async(sql,...args)=>{
   assert.match(sql,/code = ANY\(\$4::text\[\]\)/);
   assert.deepEqual(args[3],scope.codes);
   if(query==='%')assert.equal(args[0],'%\\%%');
   return [];
  }};
  assert.deepEqual(await searchShippingPorts(db,query),{rows:[],hasMore:false});
 }
});
