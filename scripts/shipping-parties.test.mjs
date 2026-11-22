import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {sameShippingParty,shippingPartyChoices} from '../frontend/src/utils/shippingParties.mjs';
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

test('registered partners remain selectable without a preset, while actual IDs, source and opposite-party exclusions remain distinct',()=>{
 const parties=[{id:1,name:'BARO',code:'BARO',country:'VN'},{id:2,name:'THE SAN',nameKo:'더산',code:'TSKR',country:'KR',address:'Registered Korea address'},{id:3,name:'THE SAN',code:'TSVN',country:'VN',address:'Registered Vietnam address'},{id:4,name:'General customer',isShippingGeneralCustomer:true}];
 const original=JSON.stringify(parties),empty=shippingPartyChoices(parties,[]);
 assert.deepEqual(empty.map(row=>row.partyId),[1,2,3]);assert.equal(empty[1].registered,true);assert.equal(empty[1].data.name,'THE SAN');assert.equal(empty[1].country,'KR');assert.ok(empty[1].searchNames.includes('더산'));
 const presets=[{id:'preset-1',partyId:2,label:'CUSTOM DOCUMENT ADDRESS',version:4,data:{address:'Stored document address'}},{id:'preset-2',partyId:null,label:'THE SAN',version:1,data:{name:'THE SAN',address:'Private unlinked address'}}];
 const rows=shippingPartyChoices(parties,presets,{excludedParty:{id:2}});
 assert.deepEqual(rows.map(row=>row.id),['registered:1','registered:3','preset-2']);assert.equal(rows[1].label,'THE SAN','same name is not identity');
 assert.deepEqual(shippingPartyChoices(parties,presets,{fixedPartyId:2}).map(row=>row.id),['registered:2','preset-1']);
 assert.equal(shippingPartyChoices(parties,presets).find(row=>row.id==='preset-1').data.address,'Stored document address');
 assert.equal(JSON.stringify(parties),original);assert.equal(presets[0].version,4);
});

test('actual trade and owner FKs supply registered choices without creating companies or sharing private sources',async()=>{
 const {freightOptions,scopedParty}=require('../backend/dist/services/freightOperations'),{saveShippingPreset,listShippingPresets}=require('../backend/dist/services/shippingPresets');
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),orgId=s.company.id,actorId=s.people.admin.id;
  const own=await db.organization.update({where:{id:orgId},data:{type:'MANUFACTURER'}});
  const korea=await db.organization.create({data:{type:'BRAND',name:'THE SAN',code:'TSKR',country:'KR',address:'KOREA REGISTERED ADDRESS'}});
  const vietnam=await db.organization.create({data:{type:'MATERIAL_SUPPLIER',name:'THE SAN',code:'TSVN',country:'VN',ownerOrgId:orgId,address:'VIETNAM REGISTERED ADDRESS'}});
  const unrelated=await db.organization.create({data:{type:'BRAND',name:'THE SAN',code:'OTHER',country:'KR',address:'PRIVATE UNRELATED ADDRESS'}});
  await db.orgRelationship.create({data:{manufacturerOrgId:orgId,brandOrgId:korea.id}});
  const count=await db.organization.count(),options=await freightOptions(db,orgId,actorId),sameNames=options.filter(row=>row.name==='THE SAN');
  assert.deepEqual(sameNames.map(row=>row.id).sort((a,b)=>a-b),[korea.id,vietnam.id].sort((a,b)=>a-b));assert.ok(options.every(row=>row.id!==unrelated.id));
  assert.equal((await scopedParty(db,orgId,korea.id)).country,'KR');await assert.rejects(scopedParty(db,orgId,unrelated.id),/FREIGHT_PARTY_SCOPE/);
  await assert.rejects(freightOptions(db,orgId,-1),/ACTIVE_EMPLOYEE_REQUIRED/);
  assert.deepEqual(await listShippingPresets(db,{orgId,actorId,org:own},orgId,'PARTY'),[]);
  const candidates=shippingPartyChoices(options,[]);assert.equal(candidates.filter(row=>row.label==='THE SAN').length,2);
  const preset=await saveShippingPreset(db,{orgId,actorId,org:own},{id:randomUUID(),customerId:orgId,kind:'PARTY',partyId:korea.id,label:'THE SAN',data:{name:'UNTRUSTED NAME',address:'CUSTOM DOCUMENT ADDRESS'}});
  assert.equal(preset.partyId,korea.id);assert.equal(preset.data.name,undefined);assert.equal((await db.organization.findUnique({where:{id:korea.id}})).address,'KOREA REGISTERED ADDRESS');assert.equal(await db.organization.count(),count);
  assert.ok(options.every(row=>row.bankAccounts===undefined&&row.margin===undefined&&row.memo===undefined));
 }finally{await f.close();}
});
