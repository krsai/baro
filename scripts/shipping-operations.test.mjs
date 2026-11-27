import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import {initialBillData} from '../frontend/src/utils/shippingBillData.mjs';
import {shippingWorkValues,shippingPackageTotals} from '../frontend/src/utils/shippingWorkData.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobBill,jobOptions,jobDetail}=require('../backend/dist/services/freightJobs');
const {saveJobOperationDetails,saveJobProgress,createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');

test('operational customer changes use a scoped FK while preserving SR, parties, bills and saved documents',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const customerMigration=readFileSync('backend/prisma/migrations/20261127070000_shipping_customer_correction/migration.sql','utf8');await f.pg.exec(customerMigration);await f.pg.exec(customerMigration);await f.pg.exec(readFileSync('backend/prisma/migrations/20261127080000_shipping_shared_data/migration.sql','utf8'));
  const customer=await db.organization.create({data:{name:'NEW CUSTOMER',type:'LOGISTICS_PROVIDER',ownerOrgId:org}});
  const inactive=await db.organization.create({data:{name:'INACTIVE',type:'LOGISTICS_PROVIDER',ownerOrgId:org,isActive:false}});
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{shipper:'SENDER',consignee:'BUYER',cargo:'Cargo',origin:'Hanoi',destination:'Busan'}});
  const bill=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'M-CUSTOMER',data:{shipper:'SAVED SENDER'}});
  const document=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:job.version,kind:'MASTER_DRAFT',billId:bill.id});
  const request={version:job.version,requestId:randomUUID(),fields:{customerId:customer.id}};
  for(const customerId of [null,0,'1'])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...request,fields:{customerId}}),/FREIGHT_INVALID_INPUT/);
  for(const customerId of [s.other.id,inactive.id])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...request,fields:{customerId}}),/FREIGHT_PARTY_SCOPE/);
  await assert.rejects(saveJobOperationDetails(db,org,999999,job.id,request),/ACTIVE_EMPLOYEE_REQUIRED/);
  const saved=await saveJobOperationDetails(db,org,actor,job.id,request);
  assert.equal(saved.customerId,customer.id);assert.equal(saved.data.customer.id,customer.id);assert.equal(saved.version,job.version+1);
  for(const key of ['sharedSnapshot','orgId','requesterOrgId','requestCreatedByOrgId'])assert.deepEqual(saved[key],job[key]);
  for(const key of ['shipper','consignee','notify','shipperId','consigneeId','origin','destination'])assert.deepEqual(saved.data[key],job.data[key]);
  assert.equal(saved.data.customerId,undefined);assert.equal(saved.data.workDetails?.customerId,undefined);
  assert.equal((await saveJobOperationDetails(db,org,actor,job.id,request)).version,saved.version);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...request,requestId:randomUUID()}),/FREIGHT_CHANGED/);
  const syncedBill=(await db.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1',bill.id))[0];assert.equal(syncedBill.number,bill.number);assert.equal(syncedBill.data.cargo,bill.data.cargo);assert.equal(syncedBill.data.shipper,bill.data.shipper||saved.data.shipper);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',document.id))[0].snapshot,document.snapshot);
  const audit=(await db.$queryRawUnsafe('SELECT "before","after" FROM "FreightAudit" WHERE entity=\'operation-details\' AND "sourceId"=$1',job.id))[0];assert.equal(audit.before.customerId,s.vendor.id);assert.equal(audit.after.customerId,customer.id);
  await assert.rejects(db.$executeRawUnsafe('UPDATE "FreightJob" SET "customerId"=$1,"requestSnapshot"=$3::jsonb,version=version+1 WHERE id=$2',s.vendor.id,job.id,'{}'),/SHIPPING_CUSTOMER_IMMUTABLE|SHIPPING_PUBLIC_FIELDS_REQUIRED/);
  const next=await saveJobOperationDetails(db,org,actor,job.id,{version:saved.version,requestId:randomUUID(),fields:{vessel:'Next Vessel'}});assert.equal(next.customerId,customer.id);assert.equal(next.requestSnapshot.data.vessel,'Next Vessel');assert.equal(next.requestSnapshot.data.cargo,job.requestSnapshot.data.cargo);
 }finally{await f.close();}
});

test('new bills start from editable working values and saved bill values remain independent',()=>{
 const job={data:{cargo:'Original',shipperParty:{name:'ORIGINAL'},workDetails:{shipper:'WORK SENDER\nNew Address',cargo:'Working Cargo'}}};
 assert.equal(shippingWorkValues(job).shipper,'WORK SENDER\nNew Address');
 assert.equal(initialBillData(job,{data:{}}).cargo,'Working Cargo');assert.equal(initialBillData(job,{data:{}}).shipper,'WORK SENDER\nNew Address');
 assert.equal(initialBillData(job,{data:{cargo:'Saved Bill Cargo'}}).cargo,'Saved Bill Cargo');
});

test('dimension totals use metres and exact rounding only when explicitly applied',()=>{
 assert.deepEqual(shippingPackageTotals([{quantity:'3',lengthM:'0.1',widthM:'0.2',heightM:'0.3'}]),{quantity:'3',cbm:'0.0180'});
 assert.deepEqual(shippingPackageTotals([{quantity:'1',lengthM:'1',widthM:'1',heightM:'0.00005'}]),{quantity:'1',cbm:'0.0001'});
 for(const rows of [[],[null],[{quantity:'1',lengthM:'',widthM:'1',heightM:'1'}],[{quantity:'1',lengthM:'1000000',widthM:'1000000',heightM:'1000000'}]])assert.equal(shippingPackageTotals(rows),null);
 const job={data:{quantity:'99',cbm:'88',packages:[{quantity:'3',lengthM:'0.1',widthM:'0.2',heightM:'0.3'}]}};
 assert.equal(shippingWorkValues(job).quantity,'99');assert.equal(shippingWorkValues(job).cbm,'88');
});

test('editable package dimensions preserve original cargo and reject malformed, missing and excessive dimensions',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'AIR',data:{cargo:'Original Cargo',marks:'Original Marks',placeOfReceipt:'Original Receipt'}});
  const packages=[{quantity:'3',lengthM:'0.1',widthM:'0.2',heightM:'0.3'}],input=fields=>({version:job.version,requestId:randomUUID(),fields});
  for(const value of [null,{},[null],[{...packages[0],quantity:'1.5'}],[{...packages[0],lengthM:''}],[{...packages[0],widthM:'-1'}],[{...packages[0],heightM:'1e3'}],[{...packages[0],lengthM:'1000000',widthM:'1000000',heightM:'1000000'}],[{...packages[0],orgId:999}],Array(51).fill(packages[0])])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input({packages:value})),/FREIGHT_INVALID_INPUT/);
  const fields={packages,...shippingPackageTotals(packages),chargeableWeightKg:'12.5'},request=input(fields);
  const saved=await saveJobOperationDetails(db,org,actor,job.id,request);
  assert.deepEqual(saved.data.workDetails,fields);assert.equal(saved.data.marks,'Original Marks');assert.equal(saved.data.placeOfReceipt,job.data.placeOfReceipt);assert.equal(saved.requestSnapshot.data.cargo,saved.data.cargo);assert.equal(saved.requestSnapshot.data.quantity,saved.data.quantity);
  assert.equal((await saveJobOperationDetails(db,org,actor,job.id,request)).version,saved.version);
  assert.equal(transportSnapshot(saved).data.workDetails,undefined);
 }finally{await f.close();}
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
  for(const key of ['orgId','customerId','mode','service','receiptStatus','sharedSnapshot'])assert.deepEqual(saved[key],job[key]);
  assert.equal((await saveJobOperationDetails(db,org,actor,job.id,input)).version,saved.version);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...input,fields:{vessel:'Different retry'}}),/FREIGHT_CHANGED/);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...input,requestId:randomUUID()}),/FREIGHT_CHANGED/);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM "FreightAudit" WHERE entity=\'operation-details\''))[0].n,1);
  const again=await saveJobOperationDetails(db,org,actor,job.id,{version:saved.version,requestId:randomUUID(),fields:{eta:'2026-12-05'}});
  assert.equal(again.requestSnapshot.data.eta,'2026-12-05');assert.equal(again.requestSnapshot.data.vessel,'Working vessel');
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',copy.id))[0].snapshot,copy.snapshot);
  assert.equal(transportSnapshot(saved).data.operationEdit,undefined);
  const migration=readFileSync(new URL('../backend/prisma/migrations/20261124020000_shipping_operation_snapshot/migration.sql',import.meta.url),'utf8');
  await f.pg.exec(migration);await f.pg.exec(migration);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT "requestSnapshot" FROM "FreightJob" WHERE id=$1',job.id))[0].requestSnapshot,again.requestSnapshot);
  assert.equal((await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM "BankLedgerEntry"'))[0].n,0);
 }finally{await f.close();}
});

test('operational patch validates exact fields, dates, company employees and writable state',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'ROAD'});
  const input=fields=>({version:job.version,requestId:randomUUID(),fields});
  for(const fields of [{origin:{}},{operations:{}},{etd:'2026-02-30'},{eta:''},{assigneeId:'1'},{weightKg:'-1'},{plannedDate:'2026-02-30'},{containers:[{size:'20',type:'DC',count:0}]},{}])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input(fields)),/FREIGHT_INVALID_INPUT/);
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

test('common work edits update current SR and inherited bill fields while custom cargo and saved output copies remain intact',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  const job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'Original Factory',destination:'Original Buyer',shipper:'ORIGINAL SENDER',consignee:'ORIGINAL BUYER',cargo:'Original Cargo'}});
  const bill=await saveJobBill(db,org,actor,job.id,{id:randomUUID(),kind:'MASTER',number:'PRESERVE',data:{cargo:'Existing BL Cargo'}});
  const old=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:job.version,kind:'AN'});
  const fields={shipper:'WORK SENDER\nWorking Address',consignee:'WORK BUYER',notify:'WORK NOTIFY',cargo:'Working Cargo',origin:'Working Factory',destination:'Working Buyer',quantity:'12',weightKg:'120.25',freightTerms:'Prepaid',incoterms:'CIF',remark:'Internal Working Remark',containers:[{size:'20',type:'DC',count:'2'}]};
  const input={version:job.version,requestId:randomUUID(),fields},saved=await saveJobOperationDetails(db,org,actor,job.id,input);
  assert.deepEqual(saved.data.workDetails,fields);assert.equal(saved.data.cargo,'Working Cargo');assert.equal(saved.data.shipper,fields.shipper);assert.equal(saved.requestSnapshot.data.cargo,saved.data.cargo);assert.equal(saved.requestSnapshot.data.quantity,saved.data.quantity);
  assert.equal((await saveJobOperationDetails(db,org,actor,job.id,input)).version,saved.version);
  const next=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:saved.version,kind:'AN'});
  assert.equal(next.snapshot.source.data.cargo,'Working Cargo');assert.equal(next.snapshot.source.data.shipper,fields.shipper);
  assert.deepEqual((await db.$queryRawUnsafe('SELECT snapshot FROM "FreightDocument" WHERE id=$1',old.id))[0].snapshot,old.snapshot);
  const preserved=(await db.$queryRawUnsafe('SELECT * FROM "FreightBill" WHERE id=$1',bill.id))[0];assert.equal(preserved.data.cargo,bill.data.cargo);assert.equal(preserved.number,bill.number);assert.equal(preserved.data.shipper,fields.shipper);
  assert.equal(transportSnapshot(saved).data.workDetails,undefined);assert.equal(transportSnapshot(saved).data.cargo,'Working Cargo');
 }finally{await f.close();}
});
