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
const {migrationSql}=require('../backend/scripts/migrate-expenses.js');
const entityMigration=require('../backend/scripts/migrate-entity-profiles.js');
const {saveEntityBankAccount,requirePayeeBankAccount}=require('../backend/dist/services/entityBankAccount.js');
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
 apply('backend/prisma/migrations/20261017120000_expense_request_documents/migration.sql');
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
 const vnd=await db.currency.upsert({where:{code:'VND'},create:{code:'VND',name:'Vietnam dong'},update:{}});
 const usd=await db.currency.upsert({where:{code:'USD'},create:{code:'USD',name:'US dollar'},update:{}});
 const bankInput={bankName:'Test bank',accountHolder:'Selected vendor',accountNumber:'001234',currencyId:vnd.id};
 const bankSave=(id,body)=>db.$transaction(tx=>saveEntityBankAccount(tx,org.id,actor.id,vendor.id,id,body),{isolationLevel:'Serializable'});
 await check('payee without an account is rejected; first account becomes currency default and preserves leading zeros',async()=>{
   await assert.rejects(db.$transaction(tx=>requirePayeeBankAccount(tx,org.id,vendor.id)),/PAYEE_BANK_ACCOUNT_REQUIRED/);
   const first=await bankSave(null,bankInput);assert.equal(first.isDefault,true);assert.equal(first.accountNumber,'001234');
   await db.$transaction(tx=>requirePayeeBankAccount(tx,org.id,vendor.id));
   const second=await bankSave(null,{...bankInput,accountNumber:'009876',isDefault:true});
   assert.equal((await db.organizationBankAccount.findUnique({where:{id:first.id}})).isDefault,false);
   await bankSave(null,{...bankInput,currencyId:usd.id});
   assert.equal(await db.organizationBankAccount.count({where:{orgId:org.id,entityId:vendor.id,isDefault:true}}),2);
   await bankSave(second.id,{...second,isActive:false});
   assert.equal((await db.organizationBankAccount.findUnique({where:{id:first.id}})).isDefault,true);
   await assert.rejects(db.$transaction(tx=>saveEntityBankAccount(tx,9999,actor.id,vendor.id,null,bankInput)),/ENTITY_NOT_FOUND/);
   await assert.rejects(bankSave(null,{...bankInput,accountNumber:''}),/INVALID_BANK_ACCOUNT/);
 });
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
 const input=await form();input.remark='Buttonhole request';input.clientKey=key();input.items[0].transactionCodeId=code.id;
 const save=body=>db.$transaction(tx=>saveExpenseEditor(tx,org.id,actor.id,'legacy',String(record.id),body),{isolationLevel:'Serializable',timeout:60000});
 // Reproduce the deployed insert-then-link path before applying the new guard.
 await check('old database rule reproduces the insert-then-link UPDATE failure',async()=>{
   await assert.rejects(db.$transaction(async tx=>{
     const doc=await registerExpenseRequest(tx,org.id,actor.id,{remark:'New',requestDate:'2026-07-31',partnerOrgId:vendor.id,clientKey:key(),items:[{...input.items[0],sourceRecordId:undefined,workOrderId:order.id,styleId:style.id,styleProcessId:styleProcess.id,assignmentPlanId:plan.id}]});return doc;
   }),/ELIGIBLE_ASSIGNMENT_REQUIRED/);
   // The old trigger rejects even a linkage-only update, independently of source locks.
   const general=await db.transactionCode.findFirst({where:{ownerOrgId:org.id,code:'GENE'}});
   const doc=await db.$transaction(tx=>registerExpenseRequest(tx,org.id,actor.id,{remark:'General',requestDate:'2026-07-31',partnerOrgId:vendor.id,clientKey:key(),items:[{transactionCodeId:general.id,currency:'VND',description:'Service',quantity:'1',unitPrice:'100',vatRate:'0',details:{}}]}));
   await assert.rejects(db.partnerTransactionCost.update({where:{id:doc.items[0].id},data:{expenseRequestId:doc.id,expenseRequestLine:1}}),/history cannot be changed/);
 });
 apply('backend/prisma/migrations/20261019180000_expense_request_editor/migration.sql');apply('backend/prisma/migrations/20261019180000_expense_request_editor/migration.sql');
 await check('customer-scoped legacy FK rejects valid manufacturer cost; targeted repair preserves sources and rejects foreign styles',async()=>{
   sql('ALTER TABLE "PartnerTransactionCost" DROP CONSTRAINT "TransactionCost_style_scope_fkey"; ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_style_scope_fkey" FOREIGN KEY ("styleId","orgId") REFERENCES "Style"(id,"customerOrgId") ON DELETE RESTRICT ON UPDATE RESTRICT;');
   await assert.rejects(save(input),error=>error.code==='P2003');
   assert.equal(await db.expenseRequest.count({where:{clientKey:input.clientKey}}),0);
   assert.deepEqual(await db.outsourcedWorkRecord.findMany({orderBy:{id:'asc'}}),original);
   apply('backend/prisma/migrations/20261020120000_expense_style_manufacturer_fk/migration.sql');apply('backend/prisma/migrations/20261020120000_expense_style_manufacturer_fk/migration.sql');
   const definition=await db.$queryRawUnsafe("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='TransactionCost_style_scope_fkey'");
   assert.match(definition[0].definition,/REFERENCES "Style"\(id, "orgId"\)/);
 });
 await check('legacy audit import preserves the exact envelope and actor; malformed history rolls back; versioned migration is repeatable',async()=>{
   const historical=await db.expenseRequest.findFirst({where:{remark:'General'}});
   const source=await loadExpenseEditorSource(db,org.id,'request',String(historical.id));
   const legacyKey=`EXPENSE_REQUEST_EDIT:${org.id}:legacy-history-001`;
   const value=JSON.parse(JSON.stringify({inputHash:'legacy-input-hash',requestId:historical.id,before:source,after:source}));
   const old=await db.systemSetting.create({data:{key:legacyKey,updatedByEmployeeId:actor.id,value}});
   const bad=await db.systemSetting.create({data:{key:`EXPENSE_REQUEST_EDIT:${org.id}:broken-history`,value:{requestId:999999}}});
   assert.throws(()=>sql(migrationSql()),/EXPENSE_LEGACY_AUDIT_REQUIRES_REVIEW/);
   assert.ok(await db.systemSetting.findUnique({where:{key:legacyKey}}));
   await db.systemSetting.delete({where:{key:bad.key}});
   await db.$executeRawUnsafe('ALTER TABLE "ExpenseRequest" RENAME COLUMN "legacyTitle" TO title');
   await db.$executeRawUnsafe('UPDATE "ExpenseRequest" SET title=remark');
   sql(migrationSql());
   const imported=await db.expenseRequestAudit.findUnique({where:{legacyKey}});
   const preserved=JSON.parse(JSON.stringify(old));preserved.createdAt=preserved.createdAt.replace(/Z$/,'');preserved.updatedAt=preserved.updatedAt.replace(/Z$/,'');
   assert.equal(imported.actorId,actor.id);assert.deepEqual(imported.legacyPayload,preserved);
   assert.deepEqual(imported.beforeSnapshot,value.before);assert.deepEqual(imported.afterSnapshot,value.after);
   assert.equal(await db.systemSetting.findUnique({where:{key:legacyKey}}),null);
   const updated=await db.expenseRequest.findUnique({where:{id:historical.id}});
   assert.equal(updated.version,2);assert.equal(updated.updatedByEmployeeId,actor.id);assert.equal(+updated.updatedAt,+old.updatedAt);
   const events=await db.expenseRequestAudit.count();sql(migrationSql());
   assert.equal(await db.expenseRequestAudit.count(),events);
   assert.deepEqual(await db.expenseRequest.findUnique({where:{id:historical.id}}),updated);
   assert.equal(await db.expenseSchemaMigration.count(),5);
 });
 let requestId;
 await check('versioned entity migration is repeatable and database guards reject missing banks and duplicate currency defaults',async()=>{
   const before=await db.expenseRequest.findMany();sql(entityMigration.migrationSql());sql(entityMigration.migrationSql());
   assert.deepEqual(await db.expenseRequest.findMany(),before);assert.equal(await db.entitySchemaMigration.count(),1);
   await assert.rejects(db.organizationBankAccount.create({data:{...bankInput,orgId:org.id,entityId:vendor.id,accountNumber:'duplicate-default',isDefault:true,createdByEmployeeId:actor.id,updatedByEmployeeId:actor.id}}),error=>error.code==='P2002');
   const general=await db.transactionCode.findFirst({where:{ownerOrgId:org.id,code:'GENE'}});
   const total=await db.expenseRequest.count();
   await assert.rejects(db.$transaction(tx=>registerExpenseRequest(tx,org.id,actor.id,{requestDate:'2026-07-31',partnerOrgId:other.id,clientKey:key(),items:[{transactionCodeId:general.id,currency:'VND',quantity:'1',unitPrice:'100',vatRate:'0',details:{}}]})),/PAYEE_BANK_ACCOUNT_REQUIRED/);
   assert.equal(await db.expenseRequest.count(),total);
   const header=await db.expenseRequest.findFirst();
   const {id:ignoredId,...copy}=header;
   await assert.rejects(db.$transaction(async tx=>{
     await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(org.id)},true),set_config('baro.expense_editor_actor',${String(actor.id)},true),set_config('baro.expense_editor_key',${`EXPENSE_REQUEST_EDIT:${org.id}:${key()}`},true)`;
     await tx.expenseRequest.create({data:{...copy,version:1,partnerOrgId:other.id,clientKey:key()}});
     await tx.$executeRawUnsafe('SET CONSTRAINTS "ExpenseRequest_payee_bank_guard" IMMEDIATE');
   }),/PAYEE_BANK_ACCOUNT_REQUIRED/);
   await assert.rejects(db.organizationBankAccount.create({data:{...bankInput,orgId:org.id,entityId:buyer.id,createdByEmployeeId:actor.id,updatedByEmployeeId:actor.id}}),/BANK_ACCOUNT_ENTITY_SCOPE/);
   await assert.rejects(db.organizationBankAccount.create({data:{...bankInput,accountNumber:'',orgId:org.id,entityId:vendor.id,createdByEmployeeId:actor.id,updatedByEmployeeId:actor.id}}),/OrganizationBankAccount_complete_check/);
 });
 await check('real Prisma wraps the completed legacy row with BTHE while preserving both vendors and source period',async()=>{
   const result=await save(input);requestId=result.requestId;
   const doc=await db.expenseRequest.findUnique({where:{id:requestId},include:{items:true}});
   assert.equal(doc.items.length,1);assert.equal(doc.items[0].transactionCodeId,code.id);assert.equal(doc.items[0].outsourcedWorkRecordId,record.id);assert.equal(doc.items[0].amount.toString(),'510000');
   assert.deepEqual(await db.outsourcedWorkRecord.findMany({orderBy:{id:'asc'}}),original);assert.deepEqual(await db.workLog.findUnique({where:{id:log.id}}),originalLog);
   await save(input);assert.equal(await db.partnerTransactionCost.count({where:{outsourcedWorkRecordId:record.id}}),1);
 });
 await check('existing request financial edits commit with audit and preserve IDs',async()=>{
   const next=await form();next.clientKey=key();next.remark='Reviewed';next.items[0].description='User override ignored';
   const previousDescription=(await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}})).description;
   await save(next);const cost=await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}});assert.equal(cost.description,previousDescription);assert.equal(cost.expenseRequestId,requestId);
 });
 await check('ordered approvers use tenant employee FKs, audit reordering and reject invalid candidates atomically',async()=>{
   const second=await db.employee.create({data:{orgId:org.id,gradeId:grade.id,name:'Approver',orgRole:'ACCOUNTANT',status:'ACTIVE'}});
   const worker=await db.employee.create({data:{orgId:org.id,gradeId:grade.id,name:'Worker',orgRole:'WORKER',status:'ACTIVE'}});
   const next=await form();next.clientKey=key();next.approverEmployeeIds=[actor.id,second.id];await save(next);
   assert.deepEqual((await form()).approverEmployeeIds,[actor.id,second.id]);
   const reorder=await form();reorder.clientKey=key();reorder.approverEmployeeIds.reverse();await save(reorder);
   assert.deepEqual((await form()).approverEmployeeIds,[second.id,actor.id]);
   for(const ids of [[actor.id,actor.id],[worker.id],[999999]]){
     const invalid=await form();invalid.clientKey=key();invalid.approverEmployeeIds=ids;
     await assert.rejects(save(invalid),/INVALID_EXPENSE_APPROVERS/);
     assert.deepEqual((await form()).approverEmployeeIds,[second.id,actor.id]);
   }
   const invalid=await form();invalid.clientKey=key();invalid.approverEmployeeIds=[actor.id];invalid.items[0].unitPrice='0';
   await assert.rejects(save(invalid),/INVALID_PRICE_OR_QUANTITY/);
   assert.deepEqual((await form()).approverEmployeeIds,[second.id,actor.id]);
   const latest=await db.expenseRequestAudit.findFirst({where:{requestId},orderBy:{version:'desc'}});
   assert.deepEqual(latest.afterSnapshot.document.approvalSteps.map(step=>step.employeeId),[second.id,actor.id]);
   const general=await db.transactionCode.findFirst({where:{ownerOrgId:org.id,code:'GENE'}});
   const created=await db.$transaction(tx=>registerExpenseRequest(tx,org.id,actor.id,{requestDate:'2026-07-31',partnerOrgId:vendor.id,clientKey:key(),approverEmployeeIds:[second.id,actor.id],items:[{transactionCodeId:general.id,currency:'VND',quantity:'1',unitPrice:'100',vatRate:'0',details:{}}]}));
   const loaded=expenseEditorForm(await loadExpenseEditorSource(db,org.id,'request',String(created.id)));
   assert.equal(loaded.remark,'');assert.deepEqual(loaded.approverEmployeeIds,[second.id,actor.id]);
 });
 await check('explicit versions reject stale saves and audit rows cannot be rewritten or removed',async()=>{
   const a=await form(),b=await form();a.clientKey=key();b.clientKey=key();a.remark='Version winner';b.remark='Stale loser';
   await save(a);await assert.rejects(save(b),/EXPENSE_REQUEST_CHANGED/);
   const latest=await form();assert.equal(latest.version,a.version+1);assert.equal(latest.updatedByEmployee.id,actor.id);assert.ok(latest.updatedAt);
   const event=await db.expenseRequestAudit.findFirst({where:{requestId},orderBy:{version:'desc'}});
   assert.equal(event.version,latest.version);assert.equal(event.afterSnapshot.document.remark,'Version winner');
   await assert.rejects(db.expenseRequestAudit.update({where:{id:event.id},data:{inputHash:'tamper'}}),/append only/);
   await assert.rejects(db.expenseRequestAudit.delete({where:{id:event.id}}),/append only/);
   await assert.rejects(db.expenseRequest.update({where:{id:requestId},data:{remark:'bypass'}}),/context required/);
 });
 await check('simultaneous editors commit exactly one next version and one audit',async()=>{
   const a=await form(),b=await form();a.clientKey=key();b.clientKey=key();a.remark='Parallel A';b.remark='Parallel B';
   const events=await db.expenseRequestAudit.count({where:{requestId}});
   const results=await Promise.allSettled([save(a),save(b)]);
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const rejected=results.find(r=>r.status==='rejected').reason;
   assert.ok(rejected.code==='P2034'||['40001','40P01'].includes(rejected.meta?.code)||rejected.message.includes('EXPENSE_REQUEST_CHANGED'),JSON.stringify({code:rejected.code,meta:rejected.meta}));
   assert.equal((await form()).version,a.version+1);
   assert.equal(await db.expenseRequestAudit.count({where:{requestId}}),events+1);
 });
 await check('direct writes and context without a matching audit roll back',async()=>{
   const cost=await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}});
   await assert.rejects(db.partnerTransactionCost.update({where:{id:cost.id},data:{description:'bypass'}}),/history cannot be changed/);
   await assert.rejects(db.outsourcedWorkRecord.delete({where:{id:record.id}}),/history cannot be changed/);
   await assert.rejects(db.$transaction(async tx=>{
     await tx.$queryRaw`SELECT set_config('baro.expense_editor_org',${String(org.id)},true),set_config('baro.expense_editor_actor',${String(actor.id)},true),set_config('baro.expense_editor_key',${`EXPENSE_REQUEST_EDIT:${org.id}:${key()}`},true)`;
     await tx.partnerTransactionCost.update({where:{id:cost.id},data:{description:'unaudited'}});
   }),/audit required/);
   assert.equal((await db.partnerTransactionCost.findUnique({where:{id:cost.id}})).description,'Outsourced process - BTH');
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
   const before=await db.partnerTransactionCost.findUnique({where:{outsourcedWorkRecordId:record.id}}),events=await db.expenseRequestAudit.count();
   const next=await form();next.clientKey=key();next.items[0].quantity='172';next.items.push({...next.items[0],itemId:undefined,sourceRecordId:undefined,unitPrice:'0'});
   await assert.rejects(save(next),/INVALID_PRICE_OR_QUANTITY/);
   assert.deepEqual(await db.partnerTransactionCost.findUnique({where:{id:before.id}}),before);assert.equal((await db.outsourcedWorkRecord.findUnique({where:{id:record.id}})).quantity,171);assert.equal(await db.expenseRequestAudit.count(),events);
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
   const next=await form();next.clientKey=key();next.remark='Forbidden';await assert.rejects(save(next),/ORDER_FINALLY_LOCKED/);
 });
 await check('repeated schema preparation preserves FK names, version history and all business rows',async()=>{
   const before=await db.expenseRequest.findUnique({where:{id:requestId}}),events=await db.expenseRequestAudit.count();
   try{execFileSync(process.execPath,[cli,'db','push','--skip-generate','--schema','prisma/schema.prisma'],{cwd:backend,env,stdio:'pipe',encoding:'utf8'});}catch(error){throw Error(error.stdout+error.stderr);}
   sql(migrationSql());
   const fk=await db.$queryRawUnsafe("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='TransactionCost_style_scope_fkey'");
   assert.match(fk[0].definition,/REFERENCES "Style"\(id, "orgId"\)/);
   assert.deepEqual(await db.expenseRequest.findUnique({where:{id:requestId}}),before);
   assert.equal(await db.expenseRequestAudit.count(),events);
 });
 console.log(`Expense editor PostgreSQL passed ${count} scenarios.`);
}finally{
 await db.$disconnect();await admin.$executeRawUnsafe('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1',name).catch(()=>{});
 await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);await admin.$disconnect();
}
