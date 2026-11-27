import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {freightDocumentHtml} from '../frontend/src/utils/freightPrint.js';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobBill,jobDetail}=require('../backend/dist/services/freightJobs');
const {createJobDocument}=require('../backend/dist/services/freightJobWorkflow');

test('House-only surrender and versioned print snapshots preserve retries and saved history',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'PORT A',destination:'PORT B',shipper:'SENDER',consignee:'BUYER'}});
  const master=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'MASTER-1'});
  const status={surrenderStatus:'CONFIRMED',surrenderConfirmedAt:'2026-11-27',surrenderReference:'CONFIRM-1'};
  await assert.rejects(saveJobBill(db,org,actor,job.id,{...master,data:status},master.id),/FREIGHT_SURRENDER_SCOPE/);
  const house=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'HOUSE',number:'',masterId:master.id,data:{shipper:'SENDER',consignee:'BUYER',cargo:'Garment',weightKg:'12345',...status}});
  const latest=await jobDetail(db,org,actor,job.id);
  const input={clientKey:randomUUID(),version:latest.version,kind:'HOUSE_DRAFT',billId:house.id,billVersion:house.version,fields:{}};
  await assert.rejects(createJobDocument(db,org,actor,job.id,{...input,billVersion:house.version+1}),/FREIGHT_CHANGED/);
  const output=await createJobDocument(db,org,actor,job.id,input);
  assert.equal(output.snapshot.layout,'bill-form-v3');assert.equal(output.snapshot.source.bill.version,house.version);
  assert.equal((await createJobDocument(db,org,actor,job.id,input)).id,output.id);
  const html=freightDocumentHtml(output,{});assert.match(html,/SURRENDERED/);assert.match(html,/12,345/);assert.match(html,/DRAFT \/ FOR REVIEW/);
  await saveJobBill(db,org,actor,job.id,{...house,data:{...house.data,cargo:'Changed',surrenderStatus:'NONE',surrenderReason:'Corrected'}},house.id);
  assert.equal((await createJobDocument(db,org,actor,job.id,input)).id,output.id);
  assert.equal(output.snapshot.source.data.cargo,'Garment');assert.equal(output.snapshot.source.data.surrenderStatus,'CONFIRMED');
  const legacy={...output,snapshot:{...output.snapshot,layout:'bill-form-v2'}};assert.match(freightDocumentHtml(legacy,{}),/SURRENDERED — CONFIRMATION RECORDED/);
  await assert.rejects(createJobDocument(db,s.other.id,actor,job.id,{...input,clientKey:randomUUID()}),/ACTIVE_EMPLOYEE_REQUIRED/);
 }finally{await f.close();}
});
