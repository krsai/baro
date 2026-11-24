import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveFreight,listFreight,freightForwarder,registerFreightRoutes}=require('../backend/dist/services/freightOperations');
const {saveDocumentSetup,saveJobBill,jobDetail}=require('../backend/dist/services/freightJobs');
const {shippingCharges}=require('../backend/dist/services/shippingRequests');

test('legacy setup is preserved without constraining optional attachments; versions, filters and customer boundaries remain enforced',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const row=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA'});
  const setup={version:row.version,composition:'MASTER_HOUSE',documentType:'SEA_WAYBILL'};
  const saved=await saveDocumentSetup(db,org,actor,row.id,setup);
  assert.equal(saved.version,row.version+1);assert.equal(saved.data.documentSetup.documentType,'SEA_WAYBILL');
  assert.equal((await saveDocumentSetup(db,org,actor,row.id,setup)).version,saved.version,'response retry is idempotent');
  await assert.rejects(saveDocumentSetup(db,org,actor,row.id,{...setup,composition:'HOUSE_ONLY'}),/FREIGHT_CHANGED/);
  await assert.rejects(saveDocumentSetup(db,org,actor,row.id,{...setup,version:saved.version,documentType:'AIR_WAYBILL'}),/FREIGHT_INVALID_INPUT/);
  const master=await saveJobBill(db,org,actor,row.id,{id:randomUUID(),kind:'MASTER',number:'M1'});
  await assert.rejects(saveDocumentSetup(db,org,actor,row.id,{...setup,version:saved.version,composition:'HOUSE_ONLY'}),/FREIGHT_COMPOSITION_HAS_BILLS/);
  await assert.rejects(saveDocumentSetup(db,org,actor,row.id,{...setup,version:saved.version,documentType:'BILL_OF_LADING'}),/FREIGHT_COMPOSITION_HAS_BILLS/);
  const only=await saveDocumentSetup(db,org,actor,row.id,{...setup,version:saved.version,composition:'MASTER_ONLY'});
  await saveJobBill(db,org,actor,row.id,{id:randomUUID(),kind:'HOUSE',number:'H1'});
  const edited=await saveFreight(db,org,actor,'jobs',{...only,clientKey:randomUUID(),data:{...only.data,documentSetup:{composition:'HOUSE_ONLY'}}},row.id);
  assert.equal(edited.data.documentSetup.composition,'MASTER_ONLY','registration cannot overwrite operational setup');
  assert.equal((await jobDetail(db,org,actor,row.id)).bills[0].id,master.id);
  assert.equal((await listFreight(db,org,actor,'jobs',{source:'FORWARDER',status:'DRAFT'})).rows.length,1);
  assert.equal((await listFreight(db,org,actor,'jobs',{source:'CUSTOMER'})).rows.length,0);
  assert.equal((await listFreight(db,org,actor,'jobs',{status:'DELIVERED'})).rows.length,0);
  await assert.rejects(listFreight(db,org,actor,'jobs',{source:'INVALID'}),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(saveDocumentSetup(db,org,actor,'missing',{...setup,version:1}),/FREIGHT_NOT_FOUND/);
  const pending=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'AIR'});
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET status=\'CANCELLED\',version=version+1 WHERE id=$1',pending.id);
  await assert.rejects(saveJobBill(db,org,actor,pending.id,{id:randomUUID(),kind:'MASTER',number:'M2'}),/SHIPPING_NOT_ACCEPTED/);
  await assert.rejects(saveDocumentSetup(db,org,actor,pending.id,{version:pending.version+1,composition:'MASTER_ONLY',documentType:'AIR_WAYBILL'}),/SHIPPING_NOT_ACCEPTED/);
  const audit=await db.$queryRawUnsafe('SELECT count(*)::integer AS count FROM "FreightAudit" WHERE entity=\'document-setup\'');assert.equal(audit[0].count,2);
  await db.organization.update({where:{id:org},data:{type:'MANUFACTURER'}});
  await assert.rejects(freightForwarder(db,org,actor),/FREIGHT_ACCESS_DENIED/);
  await assert.rejects(saveDocumentSetup(db,org,actor,row.id,setup),/FREIGHT_ACCESS_DENIED/);
  await assert.rejects(saveJobBill(db,org,actor,row.id,{id:randomUUID(),kind:'MASTER',number:'M3'}),/FREIGHT_ACCESS_DENIED/);
  await assert.rejects(shippingCharges(db,org,actor,row.id),/SHIPPING_ACCESS_DENIED/);
  const routes=new Map(),app=Object.fromEntries(['get','post','put','delete'].map(method=>[method,(path,fn)=>routes.set(method+path,fn)]));
  registerFreightRoutes(app,db,{requireOrgRole:async()=>({organization:{id:org,type:'MANUFACTURER'},employee:{orgRole:'ADMIN'}}),actorId:()=>actor,loadPolicy:async()=>({policy:{MANUFACTURER:{ADMIN:['FREIGHT']}}})});
  await assert.rejects(routes.get('get/freight/transport-jobs')({query:{}},{json(){throw Error('must not return data');}}),/FREIGHT_ACCESS_DENIED/);
 }finally{await f.close();}
});
