import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {cleanup}=createRequire(import.meta.url)('../backend/scripts/cleanup-urideul-legacy-type.js');
function fixture(){
 const relationship={id:2,manufacturerOrgId:1,brandOrgId:3,systemIndustryId:96},classification={revision:2,industries:[{systemIndustryId:94}]};let receipt=null;const writes=[];
 const tx={$executeRawUnsafe:async sql=>assert.match(sql,/READ ONLY/),$queryRawUnsafe:async()=>[],
 orgRelationship:{findUnique:async()=>structuredClone(relationship),updateMany:async({where,data})=>{assert.deepEqual(where,{id:2,manufacturerOrgId:1,brandOrgId:3,systemIndustryId:96});assert.deepEqual(data,{systemIndustryId:null});Object.assign(relationship,data);writes.push('legacy');return {count:1};}},
 partnerClassification:{findUnique:async()=>structuredClone(classification)},settingServiceDefault:{findMany:async()=>[{id:94,code:'WOVEN'},{id:96,code:'MIXED'}]},systemSetting:{findUnique:async()=>receipt,create:async({data})=>{receipt=data;writes.push('receipt');}}};
 return {db:{$transaction:async fn=>fn(tx)},relationship,classification,writes};
}
test('cleanup defaults to read-only, rejects stale revision and preserves the customer relationship and classification',async()=>{
 const {db,relationship,classification,writes}=fixture(),plan=await cleanup(db);assert.deepEqual(writes,[]);assert.equal(plan.mode,'READ_ONLY');
 await assert.rejects(cleanup(db,{apply:true,revision:'stale'}),/REVISION_CHANGED/);assert.deepEqual(writes,[]);
 const result=await cleanup(db,{apply:true,revision:plan.revision});assert.equal(result.after.systemIndustryId,null);assert.equal(relationship.id,2);assert.deepEqual(classification,{revision:2,industries:[{systemIndustryId:94}]});assert.deepEqual(writes,['legacy','receipt']);
 assert.equal((await cleanup(db,{apply:true})).alreadyClean,true);assert.deepEqual(writes,['legacy','receipt']);
});
test('cleanup refuses a different relationship or changed explicit classification before writing',async()=>{
 const f=fixture();f.relationship.brandOrgId=4;await assert.rejects(cleanup(f.db,{apply:true}),/TARGET_CHANGED/);assert.deepEqual(f.writes,[]);
 const g=fixture();g.classification.industries[0].systemIndustryId=96;await assert.rejects(cleanup(g.db,{apply:true}),/TARGET_CHANGED/);assert.deepEqual(g.writes,[]);
});
