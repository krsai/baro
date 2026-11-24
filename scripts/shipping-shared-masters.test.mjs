import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {workRoute,workCargo} from '../frontend/src/utils/shippingWorkPresentation.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobBill,jobDetail}=require('../backend/dist/services/freightJobs');
const {changeJobMasterLink,searchJobMasters}=require('../backend/dist/services/freightMasterLinks');
const {createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {saveShippingCharge}=require('../backend/dist/services/shippingRequests');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');
const request=version=>({version,requestId:randomUUID()});

test('migration backfills exact original master IDs without merging equal numbers or changing charges and audits',async()=>{
 let original,masters,jobs,charge;
 const f=await changeApprovalFixture({beforeMigration:async(f,migration)=>{
  if(migration.version!=='20261124030000_shared_shipment_masters')return;
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  jobs=await Promise.all([1,2].map(()=>saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA'})));
  masters=[];for(const job of jobs)masters.push(await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'SAME NUMBER',data:{vessel:'ORIGINAL'}}));
  charge=await saveShippingCharge(db,org,actor,jobs[0].id,{id:randomUUID(),billId:masters[0].id,direction:'PURCHASE',description:'Existing cost',currencyCode:'USD',amount:'90'});
  charge=(await db.$queryRawUnsafe('SELECT * FROM "ShippingChargeDraft" WHERE id=$1',charge.id))[0];
  original=await db.$queryRawUnsafe('SELECT * FROM "FreightAudit" ORDER BY id');
 }});try{
  const links=await f.db.$queryRawUnsafe('SELECT * FROM "FreightJobMaster" ORDER BY "jobId"');
  assert.equal(links.length,2);for(const master of masters){const link=links.find(l=>l.masterBillId===master.id);assert.equal(link.jobId,master.jobId);assert.deepEqual((await f.db.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1',master.id))[0],master);}
  assert.deepEqual(await f.db.$queryRawUnsafe('SELECT * FROM "FreightAudit" ORDER BY id'),original);
  assert.deepEqual((await f.db.$queryRawUnsafe('SELECT * FROM "ShippingChargeDraft" WHERE id=$1',charge.id))[0],charge);
 }finally{await f.close();}
});

test('two jobs reference the same MBL ID while HBLs, amounts, owner jobs and saved copies stay independent',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const make=cargo=>saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'SENDER',consignee:'BUYER',cargo}});
  const one=await make('CARGO ONE'),two=await make('CARGO TWO');
  const master=await saveJobBill(db,org,actor,one.id,{id:randomUUID(),kind:'MASTER',number:'MASTER A',data:{vessel:'VESSEL A'}});
  const h1=await saveJobBill(db,org,actor,one.id,{id:randomUUID(),kind:'HOUSE',number:'HOUSE B',masterId:master.id,data:{shipper:'CUSTOMER ONE'}});
  const linkRequest=request(two.version),linked=await changeJobMasterLink(db,org,actor,two.id,master.id,linkRequest);
  assert.equal((await changeJobMasterLink(db,org,actor,two.id,master.id,linkRequest)).version,linked.version);
  assert.equal(linked.version,two.version+1);
  const h2=await saveJobBill(db,org,actor,two.id,{id:randomUUID(),kind:'HOUSE',number:'HOUSE C',masterId:master.id,data:{shipper:'CUSTOMER TWO'}});
  const detail=await jobDetail(db,org,actor,two.id);
  assert.deepEqual(detail.bills.map(row=>row.id).sort(),[master.id,h2.id].sort());
  assert.equal(detail.bills.find(row=>row.id===master.id).linkedJobCount,2);
  assert.equal(detail.bills.some(row=>row.id===h1.id),false);
  assert.equal(detail.bills.find(row=>row.id===master.id).jobId,one.id);
  const copy=await createJobDocument(db,org,actor,two.id,{version:linked.version,clientKey:randomUUID(),kind:'HOUSE_DRAFT',billId:h2.id});
  assert.equal(copy.snapshot.source.master.id,master.id);
  const changed=await saveJobBill(db,org,actor,two.id,{...master,number:'MASTER A',data:{vessel:'SHARED UPDATE'}},master.id);
  assert.equal(changed.jobId,one.id);
  assert.equal((await jobDetail(db,org,actor,one.id)).bills.find(row=>row.id===master.id).data.vessel,'SHARED UPDATE');
  await assert.rejects(saveJobBill(db,org,actor,one.id,{...master,data:{vessel:'STALE'}},master.id),/FREIGHT_CHANGED/);
  await saveShippingCharge(db,org,actor,two.id,{id:randomUUID(),billId:h2.id,direction:'SALES',description:'Own house charge',currencyCode:'USD',amount:'25'});
  await assert.rejects(saveShippingCharge(db,org,actor,two.id,{id:randomUUID(),billId:master.id,direction:'PURCHASE',description:'Wrong source job',currencyCode:'USD',amount:'5'}),/SHIPPING_BILL_SCOPE/);
  await assert.rejects(changeJobMasterLink(db,org,actor,two.id,master.id,request(linked.version),true),/FREIGHT_MASTER_HAS_HOUSES/);
  const detachedHouse=await saveJobBill(db,org,actor,two.id,{...h2,masterId:null},h2.id);
  assert.equal(detachedHouse.masterId,null);
  const removed=await changeJobMasterLink(db,org,actor,two.id,master.id,request(linked.version),true);
  assert.equal((await jobDetail(db,org,actor,two.id)).bills.some(row=>row.id===master.id),false);
  assert.equal((await jobDetail(db,org,actor,one.id)).bills.find(row=>row.id===master.id).linkedJobCount,1);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',copy.id))[0].snapshot,copy.snapshot);
  assert.equal((await db.$queryRawUnsafe('SELECT "deletedAt" FROM "FreightBill" WHERE id=$1',master.id))[0].deletedAt,null);
  assert.equal((await db.$queryRawUnsafe('SELECT "deletedAt" FROM "FreightJobMaster" WHERE "jobId"=$1 AND "masterBillId"=$2',two.id,master.id))[0].deletedAt instanceof Date,true);
  await saveJobBill(db,org,actor,one.id,{...h1,masterId:null},h1.id);
  await assert.rejects(saveJobBill(db,org,actor,one.id,{version:changed.version},master.id,true),/FREIGHT_BILL_HAS_DOCUMENTS/);
  assert.equal((await changeJobMasterLink(db,org,actor,two.id,master.id,request(removed.version))).version,removed.version+1);
  const candidates=await searchJobMasters(db,org,actor,two.id,'MASTER A');assert.equal(candidates.rows.length,1);assert.equal(candidates.rows[0].id,master.id);
  assert.equal(transportSnapshot(detail).bills,undefined);
  assert.equal((await jobDetail(db,org,actor,one.id)).data.cargo,'CARGO ONE');assert.equal((await jobDetail(db,org,actor,two.id)).data.cargo,'CARGO TWO');
 }finally{await f.close();}
});

test('shared master links reject wrong company, mode, versions and direct SQL bypasses',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const make=mode=>saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode});
  const one=await make('SEA'),two=await make('SEA'),air=await make('AIR');
  const master=await saveJobBill(db,org,actor,one.id,{id:randomUUID(),kind:'MASTER',number:'A'});
  await assert.rejects(saveJobBill(db,org,actor,two.id,{id:randomUUID(),kind:'HOUSE',number:'UNLINKED',masterId:master.id}),/FREIGHT_MASTER_SCOPE/);
  await assert.rejects(changeJobMasterLink(db,s.other.id,actor,two.id,master.id,request(two.version)),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(changeJobMasterLink(db,org,actor,air.id,master.id,request(air.version)),/FREIGHT_MASTER_MODE/);
  await assert.rejects(changeJobMasterLink(db,org,actor,two.id,master.id,request(two.version+1)),/FREIGHT_CHANGED/);
  const linked=await changeJobMasterLink(db,org,actor,two.id,master.id,request(two.version));
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightJob" SET mode=\'AIR\',version=version+1 WHERE id=$1',two.id),/FREIGHT_MASTER_MODE/);
  await assert.rejects(saveJobBill(db,org,actor,one.id,{version:master.version},master.id,true),/FREIGHT_MASTER_HAS_JOBS/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightBill" SET "deletedAt"=CURRENT_TIMESTAMP,version=version+1 WHERE id=$1',master.id),/FREIGHT_MASTER_HAS_JOBS/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightJobMaster" SET "orgId"=$1,version=version+1 WHERE "jobId"=$2 AND "masterBillId"=$3',s.other.id,two.id,master.id),/SHIPPING_NOT_ACCEPTED|FREIGHT_INVALID_REVISION|foreign key/);
  await assert.rejects(changeJobMasterLink(db,org,actor,two.id,master.id,request(two.version),true),/FREIGHT_CHANGED/);
  assert.equal((await jobDetail(db,org,actor,two.id)).version,linked.version);
 }finally{await f.close();}
});

test('operations show saved ports instead of door addresses and suppress meaningless zero cargo',()=>{
 const data={origin:'Factory street address',destination:'Buyer street address',originPortCode:'VNHPH',destinationPortCode:'KRPUS',shipmentType:'FCL',cargo:'Garments',containers:[{size:'20',type:'DC',count:1}],quantity:'0',weightKg:'0',cbm:'0'};
 assert.equal(workRoute({mode:'SEA',data}).from.value,'VNHPH');assert.equal(workRoute({mode:'SEA',data}).to.value,'KRPUS');
 assert.deepEqual(workCargo(data),['Garments',"20' DC × 1"]);
 assert.equal(workRoute({mode:'ROAD',data}).from.value,data.origin);
 assert.equal(workRoute({mode:'AIR',service:'EXPRESS',data}).from.value,data.origin);
});
