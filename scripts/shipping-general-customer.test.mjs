import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveFreight,listFreight,freightOptions}=require('../backend/dist/services/freightOperations');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');
test('express general customer is created once per company with independent SR requester details and real protected FK',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),orgId=s.company.id,actorId=s.people.admin.id;
  const data={generalCustomer:true,actualRequesterName:'Kim Min Su',actualRequesterPhone:'+84 123 456',shipmentType:'AIR',shipperParty:{name:'Sender',address:'Pickup'},consigneeParty:{name:'Recipient',address:'Delivery'},cargo:'Personal goods'};
  const input={clientKey:randomUUID(),mode:'AIR',service:'EXPRESS',customerId:null,data};
  await assert.rejects(saveFreight(db,orgId,actorId,'jobs',{...input,data:{...data,actualRequesterName:' '}}),/SHIPPING_REQUESTER_REQUIRED/);
  assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "ShippingGeneralCustomer"'),[],'failed SR does not leave a collection partner mapping');
  await freightOptions(db,orgId,actorId);assert.deepEqual(await db.$queryRawUnsafe('SELECT * FROM "ShippingGeneralCustomer"'),[],'options are read-only');
  const job=await saveFreight(db,orgId,actorId,'jobs',input);
  assert.equal(job.orgId,orgId);assert.equal(job.requestCreatedByOrgId,orgId);assert.equal(job.requestCreatedByEmployeeId,actorId);assert.equal(job.data.customerRole,undefined);assert.equal(job.data.generalCustomer,true);assert.equal(job.data.actualRequesterName,'Kim Min Su');assert.equal(job.data.shipperParty.name,'Sender');assert.equal(job.data.consigneeParty.name,'Recipient');
  assert.equal((await saveFreight(db,orgId,actorId,'jobs',input)).id,job.id);
  const pool=await db.organization.findUnique({where:{id:job.customerId}});assert.equal(pool.ownerOrgId,orgId);assert.equal(pool.dataOwnerOrgId,null);assert.equal(pool.partyKind,'INDIVIDUAL');assert.equal(await db.employee.count({where:{orgId:pool.id}}),0);
  const second=await saveFreight(db,orgId,actorId,'jobs',{...input,clientKey:randomUUID(),data:{...data,actualRequesterName:'Lee',actualRequesterPhone:'0909999'}});
  assert.equal(second.customerId,job.customerId);assert.notEqual(second.id,job.id);assert.equal((await db.$queryRawUnsafe('SELECT * FROM "ShippingGeneralCustomer" WHERE "orgId"=$1',orgId)).length,1);
  const options=await freightOptions(db,orgId,actorId);assert.equal(options.find(row=>row.id===pool.id).isShippingGeneralCustomer,true);
  for(const search of ['Kim Min Su','+84 123 456']){const found=await listFreight(db,orgId,actorId,'jobs',{search});assert.equal(found.rows.length,1);assert.equal(found.rows[0].id,job.id);}
  assert.equal((await listFreight(db,orgId,actorId,'jobs',{search:'Lee'})).rows[0].id,second.id);
  await assert.rejects(saveFreight(db,s.other.id,actorId,'jobs',input),/ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(saveFreight(db,orgId,actorId,'jobs',{...input,clientKey:randomUUID(),customerId:s.vendor.id}),/FREIGHT_PARTY_SCOPE/);
  await assert.rejects(saveFreight(db,orgId,actorId,'jobs',{...input,clientKey:randomUUID(),customerId:pool.id,data:{...data,generalCustomer:undefined,actualRequesterPhone:''}}),/SHIPPING_REQUESTER_REQUIRED/);
  await assert.rejects(saveFreight(db,orgId,actorId,'jobs',{...input,clientKey:randomUUID(),service:'GENERAL'}),/SHIPPING_GENERAL_CUSTOMER_INVALID/);
  await assert.rejects(saveFreight(db,orgId,actorId,'jobs',{...input,clientKey:randomUUID(),data:{...data,customerRole:'shipper',shipperId:pool.id}}),/FREIGHT_CUSTOMER_ROLE/);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightJob" SET data=data-\'actualRequesterPhone\',version=version+1 WHERE id=$1',job.id),/SHIPPING_REQUESTER_REQUIRED/);
  await assert.rejects(db.$executeRawUnsafe('DELETE FROM "ShippingGeneralCustomer" WHERE "orgId"=$1',orgId),/SHIPPING_GENERAL_CUSTOMER_IMMUTABLE/);
  await assert.rejects(db.organization.update({where:{id:pool.id},data:{ownerOrgId:null}}),/SHIPPING_GENERAL_CUSTOMER_IMMUTABLE/);
  const publicData=transportSnapshot(job).data;assert.equal(publicData.actualRequesterName,undefined);assert.equal(publicData.actualRequesterPhone,undefined,'internal requester contact is not implicitly shared');
  const before=await db.$queryRawUnsafe('SELECT data,"requestSnapshot" FROM "FreightJob" WHERE id=$1',job.id);
  const migration=require('../backend/scripts/migrate-entity-profiles').migrations().find(row=>row.version==='20261114090000_shipping_general_customer');await f.pg.exec(migration.sql);await f.pg.exec(migration.sql);assert.deepEqual(await db.$queryRawUnsafe('SELECT data,"requestSnapshot" FROM "FreightJob" WHERE id=$1',job.id),before);
  const edit=await saveFreight(db,orgId,actorId,'jobs',{...input,customerId:pool.id,version:job.version,data:{...data,actualRequesterPhone:'+84 777'}},job.id);assert.equal(edit.data.actualRequesterPhone,'+84 777');assert.equal(edit.requestCreatedByOrgId,orgId);assert.equal(edit.customerId,pool.id);
  assert.equal((await db.freightJob.findUnique({where:{id:second.id}})).data.actualRequesterPhone,'0909999');assert.equal(await db.freightAudit.count({where:{orgId,entity:'jobs',sourceId:job.id}}),2);
 }finally{await f.close();}
});
