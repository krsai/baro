import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url),{saveFreight}=require('../backend/dist/services/freightOperations'),{saveJobBill,jobDetail}=require('../backend/dist/services/freightJobs');

test('job registration validates scoped parties, preserves cargo details and starts received without BLs',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const routes=new Map();require('../backend/dist/services/freightJobs').registerJobRoutes({get:()=>{},post:(path,fn)=>routes.set(path,fn),put:()=>{},delete:()=>{}},db,async()=>({orgId:org,actorId:actor}));
  const create=async body=>{let value;await routes.get('/freight/transport-jobs')({params:{},body},{json:row=>{value=row;}});return value;};
  const body={clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',status:'DELIVERED',data:{customerRole:'shipper',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'},billTo:'Destination forwarder',shipperId:s.vendor.id,consigneeId:s.vendor.id,shipmentType:'FCL',incoterms:'FOB Hai Phong',cargo:'Garments',quantity:'20',weightKg:'250.5',cbm:'4.25',containerType:'40HC',containerCount:'2',pickupRequired:true,pickupAddress:'Separate warehouse',dangerousGoods:true,dangerousGoodsDetails:'UN 1993'}};
  await assert.rejects(create({...body,data:{...body.data,shipperId:null}}),/FREIGHT_PARTIES_REQUIRED/);
  await assert.rejects(create({...body,data:{...body.data,consigneeId:s.other.id}}),/FREIGHT_PARTY_SCOPE/);
  await assert.rejects(create({...body,data:{...body.data,shipmentType:'AIR'}}),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(create({...body,data:{...body.data,workScope:null}}),/FREIGHT_SCOPE_REQUIRED/);
  await assert.rejects(create({...body,data:{...body.data,customerRole:'notify'}}),/FREIGHT_CUSTOMER_ROLE/);
  await assert.rejects(create({...body,data:{...body.data,workScope:{start:'ORIGIN_TERMINAL',end:'DESTINATION_TERMINAL'}}}),/FREIGHT_PICKUP_REQUIRED/);
  await assert.rejects(create({...body,data:{...body.data,pickupAddress:''}}),/FREIGHT_PICKUP_REQUIRED/);
  await assert.rejects(create({...body,data:{...body.data,pickupPartyId:s.other.id}}),/FREIGHT_PARTY_SCOPE/);
  const saved=await create(body);assert.deepEqual(saved.data.workScope,body.data.workScope);assert.equal(saved.data.billTo,'Destination forwarder');assert.equal(saved.data.incoterms,'FOB Hai Phong');assert.equal(saved.status,'DRAFT');assert.equal(saved.data.shipperParty.id,s.vendor.id);assert.equal(saved.data.pickupAddress,'Separate warehouse');assert.equal(saved.data.cbm,'4.25');assert.equal(saved.data.containerCount,'2');assert.equal(saved.data.dangerousGoods,true);assert.equal((await jobDetail(db,org,actor,saved.id)).bills.length,0);
  assert.equal((await create(body)).id,saved.id,'retry does not create another job');
  const receiver=await db.organization.create({data:{name:'Receiver',type:'BRAND',ownerOrgId:org}});
  await assert.rejects(create({...body,clientKey:randomUUID(),data:{...body.data,customerRole:'consignee',consigneeId:receiver.id}}),/FREIGHT_CUSTOMER_ROLE/);
  const consignee=await create({...body,clientKey:randomUUID(),customerId:receiver.id,data:{...body.data,customerRole:'consignee',consigneeId:receiver.id,incoterms:'DDP',workScope:{start:'ORIGIN_TERMINAL',end:'DESTINATION_TERMINAL'},pickupRequired:false}});
  assert.equal(consignee.data.customerRole,'consignee');assert.deepEqual(consignee.data.workScope,{start:'ORIGIN_TERMINAL',end:'DESTINATION_TERMINAL'});assert.equal(consignee.data.billTo,'Destination forwarder');
  await assert.rejects(create({...body,clientKey:randomUUID(),mode:'ROAD',data:{...body.data,shipmentType:'ROAD',workScope:{start:'ORIGIN_TERMINAL',end:'DESTINATION_DOOR'}}}),/FREIGHT_INVALID_INPUT/);
  const road=await create({...body,clientKey:randomUUID(),mode:'ROAD',data:{...body.data,shipmentType:'ROAD',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'}}});assert.equal(road.mode,'ROAD');
 }finally{await f.close();}
});
test('jobs have independent optional BLs with scoped, mutable Master-House links and protected history',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const create=()=>saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'ROAD'});
  const job=await create(),other=await create();
  await assert.rejects(saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,data:{assigneeId:999999}}),/FREIGHT_ASSIGNEE_SCOPE/);
  const changed=await saveFreight(db,org,actor,'jobs',{...job,clientKey:randomUUID(),data:{...job.data,assigneeId:actor,plannedDate:'2026-11-06',jobType:'DOMESTIC'}},job.id);assert.equal(changed.data.assigneeId,actor);assert.equal(changed.data.plannedDate,'2026-11-06');assert.notEqual(job.number,other.number);
  assert.deepEqual((await jobDetail(db,org,actor,job.id)).bills,[]);
  const add=(kind,number,masterId=null,jobId=job.id)=>saveJobBill(db,org,actor,jobId,{id:randomUUID(),kind,number,issuer:'Issuer',masterId});
  const house=await add('HOUSE','HOUSE-1');assert.equal(house.masterId,null);
  const master=await add('MASTER','MASTER-1'),second=await add('MASTER','MASTER-2');
  const update=(bill,masterId)=>saveJobBill(db,org,actor,job.id,{...bill,masterId},bill.id);
  let h=await update(house,master.id);const h2=await add('HOUSE','HOUSE-2',master.id),unlinked=await add('HOUSE','HOUSE-3');
  let detail=await jobDetail(db,org,actor,job.id);assert.equal(detail.bills.filter(row=>row.masterId===master.id).length,2);assert.equal(detail.bills.filter(row=>row.kind==='MASTER').length,2);
  await assert.rejects(saveJobBill(db,org,actor,job.id,{version:master.version},master.id,true),/FREIGHT_MASTER_HAS_HOUSES/);
  h=await update(h,second.id);h=await update(h,null);assert.equal(h.jobId,job.id);assert.equal(h.masterId,null);
  await assert.rejects(saveJobBill(db,org,actor,job.id,{...h,masterIds:[master.id,second.id]},h.id),/FREIGHT_INVALID_INPUT/);
  const foreign=await add('MASTER','FOREIGN',null,other.id);
  await assert.rejects(update(h,foreign.id),/FREIGHT_MASTER_SCOPE/);
  await assert.rejects(update(h,h2.id),/FREIGHT_MASTER_SCOPE/);
  await assert.rejects(saveJobBill(db,org,actor,other.id,{...h,masterId:foreign.id},h.id),/FREIGHT_NOT_FOUND/);
  await assert.rejects(jobDetail(db,s.other.id,actor,job.id),/ACTIVE_EMPLOYEE_REQUIRED/);
  const stale=h;h=await update(h,master.id);await assert.rejects(update(stale,null),/FREIGHT_CHANGED/);
  await update(h,null);await update(h2,null);
  await saveJobBill(db,org,actor,job.id,{version:master.version},master.id,true);
  detail=await jobDetail(db,org,actor,job.id);assert.ok(detail.bills.some(row=>row.id===house.id));assert.ok(detail.bills.some(row=>row.id===unlinked.id));assert.ok(!detail.bills.some(row=>row.id===master.id));
  // Same number and issuer never imply identity or global uniqueness.
  const same=await add('MASTER','MASTER-2');assert.notEqual(same.id,second.id);
  const retry={id:randomUUID(),kind:'HOUSE',number:'RETRY',issuer:'',masterId:null};const a=await saveJobBill(db,org,actor,job.id,retry);assert.equal((await saveJobBill(db,org,actor,job.id,retry)).id,a.id);
  // Database constraints independently reject cross-job links and deletion.
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightBill" SET "masterId"=$1,version=version+1 WHERE id=$2',foreign.id,a.id),/FREIGHT_MASTER_SCOPE|foreign key/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "FreightBill" WHERE id=$1',a.id),/FREIGHT_HISTORY_IMMUTABLE/);
  const foreignSet=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'OTHER',name:'Other grades'}});
  const foreignGrade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:foreignSet.id,code:'ADMIN',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:0}});
  const foreignActor=await db.employee.create({data:{orgId:s.other.id,name:'Other admin',orgRole:'ADMIN',status:'ACTIVE',gradeId:foreignGrade.id}});
  await assert.rejects(jobDetail(db,s.other.id,foreignActor.id,job.id),/FREIGHT_NOT_FOUND/);
  await assert.rejects(saveJobBill(db,s.other.id,foreignActor.id,job.id,{id:randomUUID(),kind:'MASTER',number:'Forbidden'}),/FREIGHT_NOT_FOUND/);
  await db.$executeRawUnsafe('INSERT INTO "FreightTransportTarget"(id,"orgId","jobId",kind,number) VALUES($1,$2,$3,\'CONTAINER\',$4)', 'target1',org,job.id,'REUSED-CONTAINER');
  await db.$executeRawUnsafe('INSERT INTO "FreightTransportTarget"(id,"orgId","jobId",kind,number) VALUES($1,$2,$3,\'CONTAINER\',$4)', 'target2',org,other.id,'REUSED-CONTAINER');
  for(const kind of ['PICKUP','DELIVERY','EMPTY_RETURN'])await db.$executeRawUnsafe('INSERT INTO "FreightTransportTask"(id,"orgId","jobId","targetId",kind) VALUES($1,$2,$3,$4,$5)',randomUUID(),org,job.id,'target1',kind);
  await assert.rejects(db.$executeRawUnsafe('INSERT INTO "FreightTransportTask"(id,"orgId","jobId","targetId",kind) VALUES($1,$2,$3,$4,$5)',randomUUID(),org,other.id,'target1','PICKUP'),/foreign key/);
  await assert.rejects(db.$executeRawUnsafe('INSERT INTO "FreightTransportTask"(id,"orgId","jobId",kind,"partnerId") VALUES($1,$2,$3,$4,$5)',randomUUID(),org,job.id,'PICKUP',s.other.id),/FREIGHT_PARTY_SCOPE/);
  assert.equal(await db.expenseRequest.count(),0);assert.equal(await db.bankLedgerEntry.count(),0);
 }finally{await f.close();}
});
test('legacy migration copies only real BLs per job and preserves original operational records',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const master=await saveFreight(db,org,actor,'masters',{clientKey:randomUUID(),number:'REAL-MASTER',mode:'AIR',data:{issuer:'Carrier'}});
  const a=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'AIR',masterId:master.id,houseStatus:'HOUSE',houseNumber:'REAL-HOUSE'});
  const b=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'AIR',masterId:master.id});
  const c=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,houseStatus:'UNKNOWN'});
  const before=await db.$queryRawUnsafe('SELECT * FROM "FreightJob" ORDER BY id');
  await f.pg.exec('DROP TABLE "FreightTransportTask";DROP TABLE "FreightTransportTarget";DROP TABLE "FreightBill";DROP FUNCTION baro_job_bill_guard();DROP FUNCTION baro_job_task_scope();');
  await f.pg.exec(readFileSync('backend/prisma/migrations/20261105140000_job_bills/migration.sql','utf8'));
  assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "FreightJob" ORDER BY id'),before);
  const first=await jobDetail(db,org,actor,a.id),second=await jobDetail(db,org,actor,b.id);
  assert.equal(first.bills.length,2);assert.equal(second.bills.length,1);assert.equal(first.bills.find(row=>row.kind==='HOUSE').masterId,first.bills.find(row=>row.kind==='MASTER').id);
  assert.notEqual(first.bills.find(row=>row.kind==='MASTER').id,second.bills[0].id);
  assert.equal((await jobDetail(db,org,actor,c.id)).bills.length,0);
  assert.equal((await db.$queryRawUnsafe('SELECT number FROM "FreightMaster" WHERE id=$1',master.id))[0].number,'REAL-MASTER');
  const constraints=await db.$queryRawUnsafe('SELECT conname FROM pg_constraint WHERE conrelid=\'"FreightBill"\'::regclass');
  assert.ok(constraints.some(row=>row.conname==='FreightBill_masterId_jobId_orgId_masterKind_fkey'));
 }finally{await f.close();}
});
