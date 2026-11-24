import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {saveFreight}=require('../backend/dist/services/freightOperations');
const {saveJobOperationDetails,saveJobProgress,createJobDocument}=require('../backend/dist/services/freightJobWorkflow');
const {transportSnapshot}=require('../backend/dist/services/transportExchange');

test('operational patch changes only selected fields and preserves request, progress, documents and financial records',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id,actor=s.people.admin.id;
  let job=await saveFreight(db,org,actor,'jobs',{clientKey:randomUUID(),customerId:s.vendor.id,mode:'SEA',data:{origin:'HANOI',destination:'BUSAN',shipper:'SENDER',consignee:'BUYER',cargo:'CUSTOMER CARGO',vessel:'Original vessel'}});
  job=await saveJobProgress(db,org,actor,job.id,{version:job.version,requestId:randomUUID(),status:'DRAFT',tasks:[]});
  const copy=await createJobDocument(db,org,actor,job.id,{clientKey:randomUUID(),version:job.version,kind:'AN'});
  const input={version:job.version,requestId:randomUUID(),fields:{assigneeId:actor,vessel:'Working vessel',voyage:'0230W',etd:'2026-12-01',eta:'2026-12-04'}};
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
  for(const fields of [{customerId:s.other.id},{origin:'Changed'},{operations:{}},{etd:'2026-02-30'},{eta:''},{assigneeId:'1'},{}])await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input(fields)),/FREIGHT_INVALID_INPUT/);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,input({assigneeId:999999})),/FREIGHT_ASSIGNEE_SCOPE/);
  await assert.rejects(saveJobOperationDetails(db,s.other.id,actor,job.id,input({etd:null})),/ACTIVE_EMPLOYEE_REQUIRED/);
  const saved=await saveJobOperationDetails(db,org,actor,job.id,input({etd:null,assigneeId:null}));
  await db.$executeRawUnsafe('UPDATE "FreightJob" SET status=\'CANCELLED\',version=version+1 WHERE id=$1',job.id);
  await assert.rejects(saveJobOperationDetails(db,org,actor,job.id,{...input({eta:null}),version:saved.version+1}),/SHIPPING_NOT_ACCEPTED/);
 }finally{await f.close();}
});
