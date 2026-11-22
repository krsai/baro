import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {transportFormHtml} from '../frontend/src/utils/transportForms.mjs';
import {shippingChargeTotals} from '../frontend/src/utils/shippingChargeTotals.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobProgress,createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {saveDocumentSetup,saveJobBill,jobDetail}=require('../backend/dist/services/freightJobs');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');

test('progress revisions, actual actor, stale retries, history, private boundaries and document snapshots',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  let row=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'SEOUL',shipper:'SENDER',consignee:'RECEIVER',cargo:'Jackets',quantity:2,weightKg:'12',remark:'PRIVATE NOTE'}});
  const task={id:randomUUID(),title:'Departure',state:'TODO',assigneeId:actor,dueAt:'2026-01-01T10:00:00Z',completedAt:null,delayReason:''};
  const request={requestId:randomUUID(),version:row.version,status:'BOOKED',tasks:[task]};
  const saved=await saveJobProgress(db,org,actor,row.id,request);assert.equal(saved.status,'BOOKED');assert.equal(saved.version,row.version+1);
  assert.equal((await saveJobProgress(db,org,actor,row.id,request)).version,saved.version);
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...request,status:'ARRIVED'}),/FREIGHT_CHANGED/);
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...request,requestId:randomUUID()}),/FREIGHT_CHANGED/);
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...request,requestId:randomUUID(),version:saved.version,tasks:[]}),/FREIGHT_PROGRESS_HISTORY/);
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...request,requestId:randomUUID(),version:saved.version,tasks:[{...task,assigneeId:999999}]}),/FREIGHT_ASSIGNEE_SCOPE/);
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...request,requestId:randomUUID(),version:saved.version,tasks:[{...task,state:'DONE'}]}),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...request,requestId:randomUUID(),version:saved.version,tasks:[{...task,state:'BLOCKED'}]}),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...request,requestId:randomUUID(),version:saved.version,tasks:[{...task,state:'SKIPPED'}]}),/FREIGHT_INVALID_INPUT/);
  const complete={...request,requestId:randomUUID(),version:saved.version,status:'IN_TRANSIT',tasks:[{...task,state:'DONE',completedAt:'2026-01-01T11:01:23Z'}]};
  row=await saveJobProgress(db,org,actor,row.id,complete);assert.equal(row.data.operations.tasks[0].completedByEmployeeId,actor);assert.equal(row.data.operations.tasks[0].completedAt,'2026-01-01T11:01:23.000Z');
  assert.equal((await saveJobProgress(db,org,actor,row.id,request)).version,row.version,'late retry returns current version without rewriting later progress');
  const edit=await saveFreight(db,org,actor,'jobs',{...row,clientKey:randomUUID(),data:{...row.data,operations:{tasks:[]}}},row.id);assert.deepEqual(edit.data.operations,row.data.operations,'normal editor preserves operational history');row=edit;
  assert.equal(transportSnapshot(row).data.operations,undefined,'private task and assignee data are not shared');
  await assert.rejects(saveJobProgress(db,org,actor,row.id,{...complete,requestId:randomUUID(),version:row.version,status:'DELIVERED'}),/FREIGHT_DELIVERY_REQUIRED/);
  row=await saveDocumentSetup(db,org,actor,row.id,{version:row.version,composition:'MASTER_HOUSE',documentType:'BILL_OF_LADING'});
  const master=await saveJobBill(db,org,actor,row.id,{id:randomUUID(),kind:'MASTER',number:'M-1'});
  const house=await saveJobBill(db,org,actor,row.id,{id:randomUUID(),kind:'HOUSE',number:'H-1',masterId:master.id});
  const documentRequest={clientKey:randomUUID(),version:row.version,kind:'HOUSE_DRAFT',billId:house.id,fields:{vessel:'TEST VESSEL',eta:'2026-11-26'}};
  const doc=await createJobDocument(db,org,actor,row.id,documentRequest);
  assert.equal(doc.snapshot.source.bill.number,'H-1');assert.equal(doc.snapshot.source.master.number,'M-1');assert.equal(doc.snapshot.source.data.remark,undefined);assert.equal(doc.snapshot.source.data.operations,undefined);
  assert.equal(doc.snapshot.source.data.vessel,'TEST VESSEL');assert.equal((await jobDetail(db,org,actor,row.id)).data.vessel,row.data.vessel,'document-specific fields never edit the shipment');
  await assert.rejects(createJobDocument(db,org,actor,row.id,{...documentRequest,clientKey:randomUUID(),fields:{internalCost:'123'}}),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(createJobDocument(db,org,actor,row.id,{...documentRequest,clientKey:randomUUID(),fields:{eta:'2026-02-31'}}),/FREIGHT_INVALID_INPUT/);
  assert.equal((await createJobDocument(db,org,actor,row.id,documentRequest)).id,doc.id);
  await assert.rejects(createJobDocument(db,org,actor,row.id,{...documentRequest,kind:'DO'}),/FREIGHT_KEY_CONFLICT/);
  await assert.rejects(createJobDocument(db,org,actor,row.id,{...documentRequest,clientKey:randomUUID(),billId:randomUUID()}),/FREIGHT_MASTER_SCOPE/);
  for(const kind of ['AN','DO','POD','MANIFEST']){const output=await createJobDocument(db,org,actor,row.id,{clientKey:randomUUID(),version:row.version,kind});assert.match(transportFormHtml(output),/DRAFT \/ FOR REVIEW/);assert.equal(output.snapshot.deliveryConfirmed,false);}
  const snapshot=structuredClone(doc.snapshot);row=await saveJobProgress(db,org,actor,row.id,{...complete,requestId:randomUUID(),version:row.version,status:'ARRIVED'});
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',doc.id))[0].snapshot,snapshot);
  assert.equal((await jobDetail(db,org,actor,row.id)).documents.length,5);
  const audits=await db.$queryRawUnsafe('SELECT count(*)::integer AS count FROM "FreightAudit" WHERE entity=\'progress\'');assert.equal(audits[0].count,3);
  await assert.rejects(saveJobProgress(db,org,999999,row.id,{...complete,version:row.version}),/ACTIVE_EMPLOYEE_REQUIRED/);
  await db.organization.update({where:{id:org},data:{type:'MANUFACTURER'}});
  await assert.rejects(saveJobProgress(db,org,actor,row.id,request),/FREIGHT_ACCESS_DENIED/);
  await assert.rejects(createJobDocument(db,org,actor,row.id,documentRequest),/FREIGHT_ACCESS_DENIED/);
 }finally{await f.close();}
});

test('document forms escape input, distinguish kinds and leave the source unchanged',()=>{
 const doc={kind:'HOUSE_DRAFT',number:'COPY-1',sourceVersion:1,snapshot:{issuer:{name:'<script>evil</script>'},source:{number:'JOB-1',mode:'AIR',documentType:'AIR_WAYBILL',data:{shipper:'SENDER',consignee:'RECEIVER',cargo:'Jackets <b>test</b>',weightKg:'12',quantity:2}}}};
 const before=structuredClone(doc),html=transportFormHtml(doc);assert.match(html,/AIR WAYBILL/);assert.match(html,/ACCOUNTING INFORMATION/);assert.doesNotMatch(html,/<script>|<b>test/);assert.match(html,/&lt;script&gt;/);assert.deepEqual(doc,before);
 const forms=['AN','DO','POD','MANIFEST'].map(kind=>transportFormHtml({...doc,kind}));assert.equal(new Set(forms).size,4);assert.match(forms[2],/NOT CONFIRMED/);
});

test('purchase/sales totals keep decimal precision and currencies separate',()=>{
 const totals=shippingChargeTotals([{direction:'PURCHASE',currencyCode:'USD',amount:'9007199254740993.1234'},{direction:'SALES',currencyCode:'USD',amount:'9007199254740993.2235'},{direction:'SALES',currencyCode:'VND',amount:'100000'}]);
 assert.equal(totals[0].difference,'0.1001');assert.equal(totals[1].sales,'100000.0000');assert.throws(()=>shippingChargeTotals([{direction:'SALES',currencyCode:'USD',amount:'NaN'}]));
});
