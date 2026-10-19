import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {PrismaClient} from '../backend/node_modules/@prisma/client/default.js';
const require=createRequire(import.meta.url);
const {loadExpenseEditorSource,expenseEditorForm,saveExpenseEditor}=require('../backend/dist/services/expenseRequestEditor.js');
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest.js');
const {provisionSettingDefaults}=require('../backend/dist/services/transactionSettingRoutes.js');
const {saveCodeBase}=require('../backend/dist/services/codeBaseManagement.js');
const base=process.env.INVOICE_TEST_DATABASE_URL;
if(!base)throw Error('INVOICE_TEST_DATABASE_URL must target dedicated local PostgreSQL');
const url=new URL(base);if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Refusing non-local PostgreSQL');
const adminUrl=new URL(url);adminUrl.pathname='/postgres';adminUrl.search='';
const name=`expense_test_${randomUUID().replaceAll('-','')}`;url.pathname=`/${name}`;url.search='';
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}}),db=new PrismaClient({datasources:{db:{url:url.toString()}}});
const backend=path.resolve('backend'),cli=path.join(backend,'node_modules/prisma/build/index.js'),env={...process.env,DATABASE_URL:url.toString(),DIRECT_URL:url.toString()};
const sql=text=>execFileSync(process.execPath,[cli,'db','execute','--stdin','--schema','prisma/schema.prisma'],{cwd:backend,env,input:text,stdio:'pipe'});
const apply=file=>sql(readFileSync(file,'utf8'));
const key=()=>randomUUID();let count=0;
const check=async(label,run)=>{await run();console.log(`PASS ${++count}: ${label}`);};
try{
 await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
 execFileSync(process.execPath,[cli,'db','push','--skip-generate','--schema','prisma/schema.prisma'],{cwd:backend,env,stdio:'pipe'});
 for(const version of ['20261010090000_partner_transaction_cost','20261011090000_transaction_request_codes','20261011120000_setting_inheritance','20261013090000_code_bases_tax','20261013120000_code_base_usage_fk','20261016090000_expense_code_separation'])apply(`backend/prisma/migrations/${version}/migration.sql`);
 apply('backend/scripts/apply-expense-request-documents.sql');
 const org=await db.organization.create({data:{name:'Expense seller',type:'MANUFACTURER'}});
 const productionType=await db.expenseType.findUnique({where:{code:'PRODUCTION'}}),generalType=await db.expenseType.findUnique({where:{code:'GENERAL'}});
 for(const [code,entryMode,expenseTypeId] of [['BTH','PROCESS',productionType.id],['GEN','GENERAL',generalType.id]]){
   const source=await db.settingServiceDefault.create({data:{code:code==='BTH'?'BUTTONHOLE':'GENERAL',nameKo:code,nameEn:code,nameVi:code,entryMode,orderInput:entryMode==='PROCESS'?'REQUIRED':'OPTIONAL',styleInput:entryMode==='PROCESS'?'REQUIRED':'HIDDEN',processInput:entryMode==='PROCESS'?'REQUIRED':'HIDDEN',requiredFields:[]}});
   await db.$transaction(tx=>saveCodeBase(tx,{code,nameKo:code,nameEn:code,nameVi:code,serviceTypeId:source.id,expenseTypeId,taxTreatmentIds:[1,2,3],requiredFields:[]}));
 }
 const gradeSet=await db.employeeGradeSet.create({data:{orgId:org.id,code:'TEST',name:'Test'}});
 const grade=await db.employeeGrade.create({data:{orgId:org.id,setId:gradeSet.id,code:'TEST',name:'Test',nameKo:'Test',nameEn:'Test',nameVi:'Test',sortOrder:1,isDefault:true}});
 const actor=await db.employee.create({data:{orgId:org.id,gradeId:grade.id,name:'Editor',orgRole:'ADMIN',status:'ACTIVE'}});
 const vendor=await db.organization.create({data:{ownerOrgId:org.id,name:'Selected vendor',type:'PROCESS_OUTSOURCING'}});
 const other=await db.organization.create({data:{ownerOrgId:org.id,name:'Other vendor',type:'PROCESS_OUTSOURCING'}});
 const factory=await db.factory.create({data:{orgId:org.id,name:'Factory',managementStartDate:'2026-04-01'}});
 const buyer=await db.organization.create({data:{name:'Customer',type:'BRAND'}});
 const style=await db.style.create({data:{orgId:org.id,customerOrgId:buyer.id,code:'AM02058',name:'Shirt'}});
 const styleProcess=await db.styleProcess.create({data:{orgId:org.id,styleId:style.id,processCode:'BH',processName:'Buttonhole'}});
 const order=await db.workOrder.create({data:{orgId:org.id,sellerOrgId:org.id,buyerOrgId:buyer.id,orderId:key(),orderNumber:'L17-1',totalQuantity:1000,workOrderItems:{create:{styleId:style.id,gender:'U',totalQuantity:1000,sizeQuantities:{S:1000}}}}});
 const snapshot={processes:[{styleProcessId:styleProcess.id}]};
 const plan=await db.assignmentPlan.create({data:{orgId:org.id,factoryId:factory.id,externalId:key(),workOrderId:order.id,styleId:style.id,startIndex:0,endIndex:1,assignmentCtSnapshot:snapshot,assignmentStSnapshot:snapshot,isCompleted:true}});
 const log=await db.workLog.create({data:{orgId:org.id,factoryId:factory.id,displayDate:'2026-07-31',coverageStartDate:'2026-07-01',coverageEndDate:'2026-07-31',recordKind:'OUTSOURCING',entryMode:'PERIOD'}});
 const record=await db.outsourcedWorkRecord.create({data:{orgId:org.id,workLogId:log.id,outsourcingPartnerId:vendor.id,outsourceVendorName:vendor.name,outsourceUnitPrice:'3000',quantity:170,styleId:style.id,styleProcessId:styleProcess.id,assignmentPlanId:plan.id,createdByEmployeeId:actor.id}});
 const untouched=await db.outsourcedWorkRecord.create({data:{orgId:org.id,workLogId:log.id,outsourcingPartnerId:other.id,outsourceVendorName:other.name,outsourceUnitPrice:'4000',quantity:20,styleId:style.id,styleProcessId:styleProcess.id,assignmentPlanId:plan.id,createdByEmployeeId:actor.id}});
 await db.$transaction(tx=>provisionSettingDefaults(tx,org.id,true));
 const code=await db.transactionCode.findFirst({where:{ownerOrgId:org.id,code:'BTHE'}});assert.ok(code);
 const original=await db.outsourcedWorkRecord.findMany({orderBy:{id:'asc'}}),originalLog=await db.workLog.findUnique({where:{id:log.id}});
 const form=()=>loadExpenseEditorSource(db,org.id,'legacy',String(record.id)).then(expenseEditorForm);
 const input=await form();input.title='Buttonhole request';input.clientKey=key();input.items[0].transactionCodeId=code.id;
 const save=body=>db.$transaction(tx=>saveExpenseEditor(tx,org.id,actor.id,'legacy',String(record.id),body),{isolationLevel:'Serializable',timeout:60000});
 // Reproduce the deployed insert-then-link path before applying the new guard.
 await check('old database rule reproduces the insert-then-link UPDATE failure',async()=>{
   await assert.rejects(db.$transaction(async tx=>{
     const doc=await registerExpenseRequest(tx,org.id,actor.id,{title:'New',requestDate:'2026-07-31',partnerOrgId:vendor.id,clientKey:key(),items:[{...input.items[0],sourceRecordId:undefined,workOrderId:order.id,styleId:style.id,styleProcessId:styleProcess.id,assignmentPlanId:plan.id}]});return doc;
   }),/ELIGIBLE_ASSIGNMENT_REQUIRED/);
   // The old trigger rejects even a linkage-only update, independently of source locks.
   const general=await db.transactionCode.findFirst({where:{ownerOrgId:org.id,code:'GENE'}});
   const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org.id,actor.id,{title:'General',requestDate:'2026-07-31',partnerOrgId:vendor.id,clientKey:key(),items:[{transactionCodeId:general.id,currency:'VND',description:'Service',quantity:'1',unitPrice:'100',vatRate:'0',details:{}}]}));
   await assert.rejects(db.partnerTransactionCost.update({where:{id:doc.items[0].id},data:{expenseRequestId:doc.id,expenseRequestLine:1}}),/history cannot be changed/);
 });
 apply('backend/scripts/apply-expense-request-editor.sql');apply('backend/scripts/apply-expense-request-editor.sql');
 let requestId;
 await check('real Prisma wraps the completed legacy row with BTHE while preserving both vendors and source period',async()=>{
   const result=await save(input);requestId=result.requestId;
   const doc=await db.expenseRequest.findUnique({where:{id:requestId},include:{items:true}});
   assert.equal(doc.items.length,1);assert.equal(doc.items[0].transactionCodeId,code.id);assert.equal(doc.items[0].outsourcedWorkRecordId,record.id);assert.equal(doc.items[0].amount.toString(),'510000');
   assert.deepEqual(await db.outsourcedWorkRecord.findMany({orderBy:{id:'asc'}}),original);assert.deepEqual(await db.workLog.findUnique({where:{id:log.id}}),originalLog);
   await save(input);assert.equal(await db.partnerTransactionCost.count({where:{outsourcedWorkRecordId:record.id}}),1);
 });
 await check('existing request financial edits commit with audit and preserve IDs',async()=>{
   const next=await form();next.clientKey=key();next.title='Reviewed';next.items[0].description='Updated description';
   await save(next);const cost=await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}});assert.equal(cost.description,'Updated description');assert.equal(cost.expenseRequestId,requestId);
 });
 await check('direct writes and context without a matching audit roll back',async()=>{
   const cost=await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}});
   await assert.rejects(db.partnerTransactionCost.update({where:{id:cost.id},data:{description:'bypass'}}),/history cannot be changed/);
   await assert.rejects(db.outsourcedWorkRecord.delete({where:{id:record.id}}),/history cannot be changed/);
   await assert.rejects(db.$transaction(async tx=>{
     await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(org.id)},true),set_config('baro.expense_editor_actor',${String(actor.id)},true),set_config('baro.expense_editor_key',${`EXPENSE_REQUEST_EDIT:${org.id}:${key()}`},true)`;
     await tx.partnerTransactionCost.update({where:{id:cost.id},data:{description:'unaudited'}});
   }),/audit required/);
   assert.equal((await db.partnerTransactionCost.findUnique({where:{id:cost.id}})).description,'Updated description');
 });
 await check('completed production remains immutable in both service and database guards',async()=>{
   const next=await form();next.clientKey=key();next.items[0].quantity='171';await assert.rejects(save(next),/PRODUCTION_COMPLETED/);
   await assert.rejects(db.$transaction(async tx=>{
     await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(org.id)},true),set_config('baro.expense_editor_actor',${String(actor.id)},true),set_config('baro.expense_editor_key',${`EXPENSE_REQUEST_EDIT:${org.id}:${key()}`},true)`;
     await tx.outsourcedWorkRecord.update({where:{id:record.id},data:{quantity:171}});
   }),/completed production/);
 });
 await check('unlocked production changes keep source identity and align financial totals atomically',async()=>{
   await db.assignmentPlan.update({where:{id:plan.id},data:{isCompleted:false}});
   const next=await form();next.clientKey=key();next.items[0].quantity='171';await save(next);
   assert.equal((await db.outsourcedWorkRecord.findUnique({where:{id:record.id}})).quantity,171);
   assert.equal((await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}})).amount.toString(),'513000');
   assert.deepEqual(await db.outsourcedWorkRecord.findUnique({where:{id:untouched.id}}),untouched);
 });
 await check('confirmed payroll remains protected in service and database guards',async()=>{
   const payroll=await db.payrollSnapshot.create({data:{orgId:org.id,factoryId:factory.id,month:'2026-07',data:{},lockedAt:new Date(),lockedBy:'test'}});
   const next=await form();next.clientKey=key();next.items[0].quantity='172';await assert.rejects(save(next),/PAYROLL_LOCKED/);
   await assert.rejects(db.$transaction(async tx=>{
     await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(org.id)},true),set_config('baro.expense_editor_actor',${String(actor.id)},true),set_config('baro.expense_editor_key',${`EXPENSE_REQUEST_EDIT:${org.id}:${key()}`},true)`;
     await tx.outsourcedWorkRecord.update({where:{id:record.id},data:{quantity:172}});
   }),/payroll locked/);
   await db.payrollSnapshot.delete({where:{id:payroll.id}});
 });
 await check('a bad later process rolls back edits, new source rows, and audit together',async()=>{
   const before=await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}}),events=await db.systemSetting.count();
   const next=await form();next.clientKey=key();next.items[0].quantity='172';next.items.push({...next.items[0],itemId:undefined,sourceRecordId:undefined,unitPrice:'0'});
   await assert.rejects(save(next),/INVALID_PRICE_OR_QUANTITY/);
   assert.deepEqual(await db.partnerTransactionCost.findUnique({where:{id:before.id}}),before);assert.equal((await db.outsourcedWorkRecord.findUnique({where:{id:record.id}})).quantity,171);assert.equal(await db.systemSetting.count(),events);
 });
 await check('another process can be added, retried and removed financially without removing its production history',async()=>{
   const additionalPlan=await db.assignmentPlan.create({data:{orgId:org.id,factoryId:factory.id,externalId:key(),workOrderId:order.id,styleId:style.id,startIndex:1,endIndex:2,assignmentCtSnapshot:snapshot,assignmentStSnapshot:snapshot}});
   const next=await form();next.clientKey=key();next.items.push({transactionCodeId:code.id,currency:'VND',description:'Second process',quantity:'200',unitPrice:'2500',vatRate:'0',workOrderId:order.id,styleId:style.id,styleProcessId:styleProcess.id,assignmentPlanId:additionalPlan.id,details:{}});
   await save(next);await save(next);
   const added=await db.partnerTransactionCost.findFirst({where:{expenseRequestId:requestId,outsourcedWorkRecordId:{not:record.id}}});assert.ok(added);
   assert.equal(await db.outsourcedWorkRecord.count(),3);assert.equal(added.amount.toString(),'500000');
   const remove=await form();remove.clientKey=key();remove.items=remove.items.filter(item=>item.itemId!==added.id);await save(remove);
   assert.equal(await db.partnerTransactionCost.count({where:{id:added.id}}),0);assert.equal(await db.outsourcedWorkRecord.count({where:{id:added.outsourcedWorkRecordId}}),1);
 });
 await check('final invoice lock continues to reject financial-only edits',async()=>{
   await db.workOrder.update({where:{id:order.id},data:{invoiceFinalLockedAt:new Date()}});
   const next=await form();next.clientKey=key();next.title='Forbidden';await assert.rejects(save(next),/ORDER_FINALLY_LOCKED/);
 });
 console.log(`Expense editor PostgreSQL passed ${count} scenarios.`);
}finally{
 await db.$disconnect();await admin.$executeRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',name).catch(()=>{});
 await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);await admin.$disconnect();
}
