import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {initialBillData} from '../frontend/src/utils/shippingBillData.mjs';
import {shippingWorkValues} from '../frontend/src/utils/shippingWorkData.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobBill,jobOptions,jobDetail}=require('../backend/dist/services/freightJobs');
const {saveJobOperationDetails,saveJobProgress,createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');

test('new bills start from editable working values and saved bill values remain independent',()=>{
 const job={data:{cargo:'Original',shipperParty:{name:'ORIGINAL'},workDetails:{shipper:'WORK SENDER\nNew Address',cargo:'Working Cargo'}}};
 assert.equal(shippingWorkValues(job).shipper,'WORK SENDER\nNew Address');
 assert.equal(initialBillData(job,{data:{}}).cargo,'Working Cargo');assert.equal(initialBillData(job,{data:{}}).shipper,'WORK SENDER\nNew Address');
 assert.equal(initialBillData(job,{data:{cargo:'Saved Bill Cargo'}}).cargo,'Saved Bill Cargo');
});

test('operational patch changes only selected fields and preserves request, progress, documents and financial records',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  let job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'SENDER',consignee:'BUYER',cargo:'CUSTOMER CARGO',vessel:'Original vessel'}});
  job=await saveJobProgress(db,org,actor,job.id,{version:job.version,requestId:randomUUID(),status:'DRAFT',tasks:[]});
  const copy=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:job.version,kind:'AN'});
  const operator=await db.employee.create({data:{orgId:org,name:'Operator',email:'operator@example.test',orgRole:'OPERATOR',status:'ACTIVE',gradeId:s.people.admin.gradeId}});
  const input={version:job.version,requestId:randomUUID(),fields:{assigneeId:operator.id,vessel:'Working vessel',voyage:'0230W',etd:'2026-12-01',eta:'2026-12-04'}};
  const saved=await saveJobOperationDetails(db,org,actor,job.id,input);
  assert.equal(saved.version,job.version+1);assert.equal(saved.data.voyage,'0230W');
  for(const key of ['origin','destination','shipper','consignee','cargo','operations'])assert.deepEqual(saved.data[key],job.data[key]);
  for(const key of ['orgId','customerId','mode','service','receiptStatus','requestSnapshot','sharedSnapshot'])assert.deepEqual(saved[key],job[key]);
  assert.equal((await saveJobOperationDetails(db,org,actor,job.id,input)).version,saved.version);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...input,fields:{vessel:'Different retry'}}),/FREIGHT_CHANGED/);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...input,requestId:randomUUID()}),/FREIGHT_CHANGED/);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM "FreightAudit" WHERE entity=\'operation-details\''))[0].n,1);
  const again=await saveJobOperationDetails(db,org,actor,job.id,{version:saved.version,requestId:randomUUID(),fields:{eta:'2026-12-05'}});
  assert.deepEqual(again.requestSnapshot,job.requestSnapshot,'repeated operational saves must not replace the original with the previous working data');
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',copy.id))[0].snapshot,copy.snapshot);
  assert.equal(transportSnapshot(saved).data.operationEdit,undefined);
  const migration=readFileSync(new URL('../backend/prisma/migrations/20261124020000_shipping_operation_snapshot/migration.sql',import.meta.url),'utf8');
  await f.pg.exec(migration);await f.pg.exec(migration);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT "requestSnapshot" FROM "FreightJob" WHERE id=$1',job.id))[0].requestSnapshot,job.requestSnapshot);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM "BankLedgerEntry"'))[0].n,0);
 }finally{await f.close();}
});

test('operational patch validates exact fields, dates, company employees and writable state',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'ROAD'});
  const input=fields=>({version:job.version,requestId:randomUUID(),fields});
  for(const fields of [{customerId:s.other.id},{origin:{}},{operations:{}},{etd:'2026-02-30'},{eta:''},{assigneeId:'1'},{weightKg:'-1'},{plannedDate:'2026-02-30'},{containers:[{size:'20',type:'DC',count:0}]},{}])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input(fields)),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input({assigneeId:999999})),/FREIGHT_ASSIGNEE_SCOPE/);
  for(const person of [s.people.admin,s.people.junior])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input({assigneeId:person.id})),/FREIGHT_ASSIGNEE_SCOPE/);
  const operator=await db.employee.create({data:{orgId:org,name:'Operator',email:'operator@example.test',orgRole:'OPERATOR',status:'ACTIVE',gradeId:s.people.admin.gradeId}});
  const suspended=await db.employee.create({data:{orgId:org,name:'Suspended Operator',email:'suspended@example.test',orgRole:'OPERATOR',status:'SUSPENDED',gradeId:s.people.admin.gradeId}});
  const otherSet=await db.employeeGradeSet.create({data:{orgId:s.other.id,code:'TEST',name:'Other Grades'}});
  const otherGrade=await db.employeeGrade.create({data:{orgId:s.other.id,setId:otherSet.id,code:'OP',name:'Operator',nameKo:'Operator',nameEn:'Operator',nameVi:'Operator',sortOrder:0}});
  const other=await db.employee.create({data:{orgId:s.other.id,name:'Other Operator',email:'other@example.test',orgRole:'OPERATOR',status:'ACTIVE',gradeId:otherGrade.id}});
  assert.deepEqual((await jobOptions(db,org,actor)).employees.map(row=>row.id),[operator.id]);
  for(const person of [suspended,other])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input({assigneeId:person.id})),/FREIGHT_ASSIGNEE_SCOPE/);
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET data=data||jsonb_build_object(\'assigneeId\',$1::int),version=version+1 WHERE id=$2',actor,job.id);
  const legacy=await jobDetail(db,org,actor,job.id);assert.equal(legacy.assignee.id,actor);
  const preserved=await saveJobOperationDetails(db,org,actor,job.id,{version:legacy.version,requestId:randomUUID(),fields:{vessel:'Keep historical assignee'}});assert.equal(preserved.data.assigneeId,actor);
  await assert.rejects(saveJobOperationDetails(db,s.other.id,actor,job.id,input({etd:null})),/ACTIVE_EMPLOYEE_REQUIRED/);
  const saved=await saveJobOperationDetails(db,org,actor,job.id,{...input({etd:null,assigneeId:null}),version:preserved.version});
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET status=\'CANCELLED\',version=version+1 WHERE id=$1',job.id);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...input({eta:null}),version:saved.version+1}),/SHIPPING_NOT_ACCEPTED/);
 }finally{await f.close();}
});

test('editable BL-like work values preserve SR, saved bills and snapshots while new documents use the working copy',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'Original Factory',destination:'Original Buyer',shipper:'ORIGINAL SENDER',consignee:'ORIGINAL BUYER',cargo:'Original Cargo'}});
  const bill=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'PRESERVE',data:{cargo:'Existing BL Cargo'}});
  const old=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:job.version,kind:'AN'});
  const fields={shipper:'WORK SENDER\nWorking Address',consignee:'WORK BUYER',notify:'WORK NOTIFY',cargo:'Working Cargo',origin:'Working Factory',destination:'Working Buyer',quantity:'12',weightKg:'120.25',freightTerms:'Prepaid',incoterms:'CIF',remark:'Internal Working Remark',containers:[{size:'20',type:'DC',count:'2'}]};
  const input={version:job.version,requestId:randomUUID(),fields},saved=await saveJobOperationDetails(db,org,actor,job.id,input);
  assert.deepEqual(saved.data.workDetails,fields);assert.equal(saved.data.cargo,'Original Cargo');assert.equal(saved.data.shipper,'ORIGINAL SENDER');assert.deepEqual(saved.requestSnapshot,job.requestSnapshot);
  assert.equal((await saveJobOperationDetails(db,org,actor,job.id,input)).version,saved.version);
  const next=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:saved.version,kind:'AN'});
  assert.equal(next.snapshot.source.data.cargo,'Working Cargo');assert.equal(next.snapshot.source.data.shipper,fields.shipper);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',old.id))[0].snapshot,old.snapshot);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1',bill.id))[0],bill);
  assert.equal(transportSnapshot(saved).data.workDetails,undefined);assert.equal(transportSnapshot(saved).data.cargo,'Original Cargo');
 }finally{await f.close();}
});
