import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {shippingState} from '../frontend/src/utils/shippingState.mjs';
const require=createRequire(import.meta.url);
const {saveFreight,listFreight}=require('../backend/dist/services/freightOperations');
const {actOnShippingRequest,deleteRejectedShippingRequest,submitShippingRequest}=require('../backend/dist/services/shippingRequests');
const {saveJobOperationDetails,createJobDocument,saveJobProgress}=require('../backend/dist/services/freightJobWorkflow');

test('receipt display distinguishes received/rejected and active transport',()=>{
 assert.equal(shippingState({receiptStatus:'ACCEPTED',status:'DRAFT'}),'ACCEPTED');
 assert.equal(shippingState({receiptStatus:'REJECTED',status:'DRAFT'}),'REJECTED');
 assert.equal(shippingState({receiptStatus:'ACCEPTED',status:'IN_TRANSIT'}),'IN_TRANSIT');
});

test('forwarder rejection keeps the customer source owner and only that owner may permanently delete',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),source=s.company.id,actor=s.people.admin.id,forwarder=s.other.id;
  await db.organization.update({where:{id:source},data:{type:'MANUFACTURER'}});
  const set=await db.employeeGradeSet.create({data:{orgId:forwarder,code:'F',name:'Forwarder'}});
  const grade=await db.employeeGrade.create({data:{orgId:forwarder,setId:set.id,code:'F',name:'Admin',nameKo:'Admin',nameEn:'Admin',nameVi:'Admin',sortOrder:0}});
  const admin=await db.employee.create({data:{orgId:forwarder,gradeId:grade.id,name:'Forwarder Admin',orgRole:'ADMIN',status:'ACTIVE'}});
  await db.companyPartnerLink.create({data:{orgId:source,entityId:s.vendor.id,targetOrgId:forwarder,createdByEmployeeId:actor,matchMethod:'SELECTED'}});
  const local=await db.organization.create({data:{name:'Local Customer',type:'MATERIAL_SUPPLIER',ownerOrgId:forwarder}});
  await db.companyPartnerLink.create({data:{orgId:forwarder,entityId:local.id,targetOrgId:source,createdByEmployeeId:admin.id,matchMethod:'SELECTED'}});
  const sent=await submitShippingRequest(db,source,actor,{clientKey:randomUUID(),forwarderOrgId:forwarder,mode:'ROAD',data:{origin:'Hanoi',destination:'Seoul',shipper:'Sender',consignee:'Buyer',cargo:'Garment',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'}}});
  const accepted=await actOnShippingRequest(db,forwarder,admin.id,sent.id,{action:'ACCEPT',version:sent.version});
  const working=await saveJobOperationDetails(db,forwarder,admin.id,sent.id,{version:accepted.version,requestId:randomUUID(),fields:{remark:'Forwarder Work'}});
  const rejected=await actOnShippingRequest(db,forwarder,admin.id,sent.id,{action:'REJECT',version:working.version});
  await assert.rejects(deleteRejectedShippingRequest(db,forwarder,admin.id,sent.id,{version:rejected.version}),/SHIPPING_ACCESS_DENIED/);
  await deleteRejectedShippingRequest(db,source,actor,sent.id,{version:rejected.version});
  assert.deepEqual(await deleteRejectedShippingRequest(db,source,actor,sent.id,{version:rejected.version}),{id:sent.id,deleted:true});
  assert.equal((await db.$queryRawUnsafe('SELECT id FROM "FreightAudit" WHERE "sourceId"=$1',sent.id)).length,0);
 }finally{await f.close();}
});

test('rejection and permanent deletion preserve company scope, references, revisions and remove every SR copy',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const create=()=>saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'ROAD',data:{origin:'Hanoi',destination:'Seoul',shipper:'Sender',consignee:'Buyer'}});
  let job=await create();const second=await create();
  await assert.rejects(deleteRejectedShippingRequest(db,org,actor,job.id,{version:job.version}),/SHIPPING_DELETE_BLOCKED/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "FreightJob" WHERE id=$1',job.id),/SHIPPING_DELETE_BLOCKED/);
  const received=await listFreight(db,org,actor,'jobs',{status:'ACCEPTED'});assert.equal(received.total,2);
  const request={action:'REJECT',version:job.version};
  const rejected=await actOnShippingRequest(db,org,actor,job.id,request);
  assert.deepEqual(await actOnShippingRequest(db,org,actor,job.id,request),rejected);
  assert.equal((await listFreight(db,org,actor,'jobs',{status:'REJECTED'})).total,1);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{version:rejected.version,requestId:randomUUID(),fields:{cargo:'Changed'}}),/SHIPPING_NOT_ACCEPTED/);
  await assert.rejects(deleteRejectedShippingRequest(db,org,actor,job.id,{version:job.version}),/SHIPPING_CHANGED/);
  await assert.rejects(deleteRejectedShippingRequest(db,s.other.id,actor,job.id,{version:rejected.version}));
  await deleteRejectedShippingRequest(db,org,actor,job.id,{version:rejected.version});
  for(const [table,column] of [['FreightJob','id'],['FreightAudit','sourceId'],['ShippingRequestEvent','jobId']])assert.equal((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${table}" WHERE "${column}"=$1`,job.id))[0].n,0);
  const third=await create();assert.notEqual(third.number,second.number);assert.equal(third.number,'JOB-000003');
  const document=await createJobDocument(db,org,actor,second.id,{clientKey:randomUUID(),version:second.version,kind:'AN'});
  await assert.rejects(actOnShippingRequest(db,org,actor,second.id,{action:'REJECT',version:second.version}),/SHIPPING_REJECT_BLOCKED/);
  assert.equal((await db.$queryRawUnsafe('SELECT id FROM "FreightDocument" WHERE id=$1',document.id)).length,1);
  job=await saveJobProgress(db,org,actor,third.id,{version:third.version,requestId:randomUUID(),status:'BOOKED',tasks:[]});
  await assert.rejects(actOnShippingRequest(db,org,actor,third.id,{action:'REJECT',version:job.version}),/SHIPPING_REJECT_BLOCKED/);
  const migration=readFileSync(new URL('../backend/prisma/migrations/20261125050000_shipping_rejection_delete/migration.sql',import.meta.url),'utf8');
  await f.pg.exec(migration);await f.pg.exec(migration);
  assert.equal((await db.$queryRawUnsafe('SELECT id FROM "FreightDocument" WHERE id=$1',document.id)).length,1);
 }finally{await f.close();}
});
