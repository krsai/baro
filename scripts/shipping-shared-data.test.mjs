import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {initialBillData} from '../frontend/src/utils/shippingBillData.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobOperationDetails,createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {saveJobBill}=require('../backend/dist/services/freightJobs');
const {sharedBillSource,syncPartnerDocuments}=require('../backend/dist/services/shippingSharedData');
const {savePartnerContacts}=require('../backend/dist/services/partnerContacts');
const containers=count=>[{size:'40',type:'HQ',count:String(count)}];
const read=async(db,table,id)=>(await db.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE id=$1`,id))[0];

test('SR, waybill and BL common values synchronize atomically in both directions without rewriting output copies',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const migration=readFileSync('backend/prisma/migrations/20261127080000_shipping_shared_data/migration.sql','utf8');await f.pg.exec(migration);await f.pg.exec(migration);
  let job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'Hanoi',destination:'Busan',shipper:'SELLER\nOld Address',consignee:'BUYER',cargo:'Original Cargo',quantity:'10',weightKg:'100',cbm:'5'}});
  const patch=async fields=>{job=await saveJobOperationDetails(db,org,actor,job.id,{version:job.version,requestId:randomUUID(),fields});return job;};
  await patch({containers:containers(1)});
  const source=sharedBillSource(job),initial=initialBillData(job,{kind:'MASTER',data:{}});for(const key of Object.keys(source))assert.deepEqual(initial[key],source[key],key);
  let master=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'M-SYNC',data:source});
  let house=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'HOUSE',number:'H-SYNC',masterId:master.id,data:source});
  const output=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:job.version,kind:'MASTER_DRAFT',billId:master.id});
  const req={version:job.version,requestId:randomUUID(),fields:{containers:containers(3),cargo:'Revised Cargo'}};
  job=await saveJobOperationDetails(db,org,actor,job.id,req);
  assert.deepEqual(job.data.containers,containers(3));assert.deepEqual(job.requestSnapshot.data.containers,containers(3));assert.equal(job.requestSnapshot.data.cargo,'Revised Cargo');
  master=await read(db,'FreightBill',master.id);house=await read(db,'FreightBill',house.id);
  assert.deepEqual(master.data.containers,containers(3));assert.deepEqual(house.data.containers,containers(3));assert.equal(house.data.cargo,'Revised Cargo');
  const afterRetry=await saveJobOperationDetails(db,org,actor,job.id,req);assert.equal(afterRetry.version,job.version);assert.equal((await read(db,'FreightBill',master.id)).version,master.version);
  job=await saveFreight(db,org,actor,'jobs',{...job,clientKey:randomUUID(),data:{...job.data,cargo:'From SR'}},job.id);
  house=await read(db,'FreightBill',house.id);assert.equal(house.data.cargo,'From SR');assert.equal(job.data.workDetails.cargo,'From SR');assert.equal(job.requestSnapshot.data.cargo,'From SR');
  assert.deepEqual(job.data.containers,containers(3));
  house=await saveJobBill(db,org,actor,job.id,{...house,data:{...house.data,containers:containers(5),cargo:'From House'}},house.id);
  job=await read(db,'FreightJob',job.id);master=await read(db,'FreightBill',master.id);
  assert.deepEqual(job.data.containers,containers(5));assert.deepEqual(job.requestSnapshot.data.containers,containers(5));assert.deepEqual(master.data.containers,containers(5));assert.equal(master.data.cargo,'From House');
  assert.equal((await saveJobBill(db,org,actor,job.id,{...house,version:house.version-1,data:house.data},house.id)).version,house.version);
  assert.deepEqual((await read(db,'FreightDocument',output.id)).snapshot,output.snapshot);
  assert.equal(job.customerId,s.vendor.id);assert.equal(job.requesterOrgId,afterRetry.requesterOrgId);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightJob" SET "requestCreatedByOrgId"=$1,version=version+1 WHERE id=$2',s.other.id,job.id),/SHIPPING_IDENTITY_IMMUTABLE/);
  // A directly customized value and forwarder Master party remain independent.
  master=await saveJobBill(db,org,actor,job.id,{...master,data:{...master.data,shipper:'FORWARDER',cargo:'Custom Master'}},master.id);
  job=await read(db,'FreightJob',job.id);await patch({cargo:'Next Cargo',shipper:'SELLER\nNew Address'});
  master=await read(db,'FreightBill',master.id);assert.equal(master.data.shipper,'FORWARDER');
  // Independent House quantities do not turn into shipment totals or sibling quantities.
  let second=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'HOUSE',number:'H-2',masterId:master.id,data:{...sharedBillSource(job),quantity:'2'}});
  second=await saveJobBill(db,org,actor,job.id,{...second,data:{...second.data,quantity:'3'}},second.id);
  assert.equal((await read(db,'FreightJob',job.id)).data.quantity,'10');assert.equal((await read(db,'FreightBill',house.id)).data.quantity,'10');
  await assert.rejects(saveJobBill(db,org,actor,job.id,{...second,data:{...second.data,containers:[{size:'99',type:'XX',count:'1'}]}},second.id),/FREIGHT_INVALID_INPUT/);
  job=await read(db,'FreightJob',job.id);const blocked={version:job.version,requestId:randomUUID(),fields:{containers:containers(7)}};
  await db.$executeRawUnsafe('ALTER TABLE "FreightBill" ADD CONSTRAINT sync_test_atomic CHECK (data->\'containers\'->0->>\'count\'<>\'7\') NOT VALID');
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,blocked));assert.deepEqual(await read(db,'FreightJob',job.id),job);
  await db.$executeRawUnsafe('ALTER TABLE "FreightBill" DROP CONSTRAINT sync_test_atomic');
  const retry=await saveJobOperationDetails(db,org,actor,job.id,blocked);assert.deepEqual(retry.requestSnapshot.data.containers,containers(7));
 }finally{await f.close();}
});

test('company FK address propagation preserves manual party text, other companies and saved source ownership',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  await db.organization.update({where:{id:s.vendor.id},data:{address:'Old Address'}});
  let job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'Hanoi',destination:'Busan',shipperId:s.vendor.id,consignee:'BUYER',cargo:'Cargo'}});
  let bill=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'M-ADDRESS',data:sharedBillSource(job)});
  const before=job.data.shipperParty,next={...before,address:'New Address'};
  await db.$transaction(tx=>savePartnerContacts(tx,org,s.vendor.id,actor,{revision:0,patch:{address:'New Address'}}));
  job=await read(db,'FreightJob',job.id);bill=await read(db,'FreightBill',bill.id);
  assert.equal(job.data.shipperParty.address,'New Address');assert.match(bill.data.shipper,/New Address/);assert.equal(job.requestSnapshot.data.shipperParty.address,'New Address');
  await db.$transaction(tx=>syncPartnerDocuments(tx,s.other.id,actor,s.vendor.id,next,{...next,address:'Foreign Address'}));
  assert.equal((await read(db,'FreightJob',job.id)).data.shipperParty.address,'New Address');
  const original=structuredClone(job.requestSnapshot);
  assert.deepEqual((await read(db,'FreightJob',job.id)).requestSnapshot,original);
 }finally{await f.close();}
});
