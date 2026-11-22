import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {shippingEnglishValid} from '../frontend/src/utils/shippingEnglish.mjs';
const require=createRequire(import.meta.url),{assertShippingEnglishData}=require('../backend/dist/services/shippingEnglish');
const {saveShippingPreset}=require('../backend/dist/services/shippingPresets'),{saveFreight}=require('../backend/dist/services/freightOperations'),{registerJobRoutes}=require('../backend/dist/services/freightJobs');
test('English validation preserves historical text and rejects newly changed non-Latin names and addresses',()=>{
 const previous={shipperParty:{name:'과거 회사',address:'기존 주소'},routeLocations:{ORIGIN_DOOR:'기존 장소'}};
 assert.doesNotThrow(()=>assertShippingEnglishData(previous,previous));
 for(const data of [{shipperParty:{name:'새 회사'}},{consigneeParty:{contactName:'담당자'}},{routeLocations:{ORIGIN_DOOR:'하노이'}},{actualRequesterAddress:'새 주소'}])assert.throws(()=>assertShippingEnglishData(data,previous),/SHIPPING_ENGLISH_REQUIRED/);
 assert.equal(shippingEnglishValid({name:'KIM',address:'1 MAIN ST'}),true);assert.equal(shippingEnglishValid({name:'김'}),false);assert.equal(shippingEnglishValid({name:'김'},{name:'김'}),true);
});
test('presets and EXPRESS/ROAD jobs enforce English without rewriting history or changing company ownership',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),orgId=s.company.id,actorId=s.people.admin.id,scope={orgId,actorId,org:s.company};
  const input={id:randomUUID(),customerId:s.vendor.id,kind:'PARTY',label:'PARTY',data:{name:'New party',address:'123 MAIN ST'}};
  await assert.rejects(saveShippingPreset(db,scope,{...input,data:{...input.data,name:'한글'}}),/SHIPPING_ENGLISH_REQUIRED/);
  assert.equal((await saveShippingPreset(db,scope,input)).partyId,null);
  for(const [mode,service]of [['AIR','EXPRESS'],['ROAD','GENERAL']]){
   const data={customerRole:'shipper',shipperId:s.vendor.id,consigneeParty:{name:'RECEIVER',address:'456 MAIN ST'},notifySameAsConsignee:true,workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},transportService:service,routeLocations:{ORIGIN_DOOR:'PICKUP',DESTINATION_DOOR:'DELIVERY'},routeLocationDetails:{ORIGIN_DOOR:{label:'PICKUP WAREHOUSE',phone:'00123',country:'VN'}},cargo:'Goods'};
   const job=await saveFreight(db,orgId,actorId,'jobs',{clientKey:randomUUID(),mode,service,customerId:s.vendor.id,data});
   assert.equal(job.data.shipperId,s.vendor.id);assert.equal(job.data.notifyParty.name,'RECEIVER');assert.equal(job.requestCreatedByOrgId,orgId);assert.equal(job.data.routeLocationDetails.ORIGIN_DOOR.phone,'00123');
   await assert.rejects(saveFreight(db,orgId,actorId,'jobs',{version:job.version,clientKey:randomUUID(),mode,service,customerId:s.vendor.id,data:{...data,consigneeParty:{name:'새 수취인'}}},job.id),/SHIPPING_ENGLISH_REQUIRED/);
   assert.equal((await db.freightJob.findUnique({where:{id:job.id}})).version,job.version);
  }
  const routes=new Map();registerJobRoutes({get(){},put(){},delete(){},post:(p,h)=>routes.set(p,h)},db,async()=>({orgId,actorId}));
  let result;await routes.get('/freight/transport-jobs')({params:{},body:{clientKey:randomUUID(),mode:'AIR',service:'EXPRESS',customerId:null,data:{generalCustomer:true,actualRequesterName:'KIM',actualRequesterPhone:'00123',customerRole:null,shipperParty:{name:'SENDER'},consigneeParty:{name:'RECEIVER'},notifySameAsConsignee:true,workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},transportService:'EXPRESS',routeLocations:{ORIGIN_DOOR:'PICKUP',DESTINATION_DOOR:'DELIVERY'},cargo:'Goods'}}},{json:value=>{result=value;}});
  assert.equal(result.data.customerRole,undefined);assert.equal(result.data.shipperParty.name,'SENDER');assert.equal(result.data.notifyParty.name,'RECEIVER');assert.equal(result.orgId,orgId);
 }finally{await f.close();}
});
