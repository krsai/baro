import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import policy from '../backend/dist/services/expenseCodeLinkPolicy.js';
import {expenseCodeForLine,inputMode,validExpenseLine} from '../frontend/src/utils/expenseRequest.mjs';
const sql=readFileSync('backend/prisma/migrations/20261023140000_expense_code_link_policy/migration.sql','utf8');
const seed=readFileSync('backend/prisma/migrations/20261023140100_baro_expense_code_links/migration.sql','utf8');

test('hierarchy requires parent references while style scope supports an optional process set without production',()=>{
 const base={entryMode:'PROCESS',requiredFields:[]},line={quantity:'2',unitPrice:'10',vatRate:'0',details:{},enabled:{},workOrderId:40,styleId:50,styleProcessIds:[55,56]};
 for(const [target,expected] of [['ORDER',['REQUIRED','HIDDEN','HIDDEN']],['STYLE',['REQUIRED','REQUIRED','OPTIONAL']],['PROCESS',['REQUIRED','REQUIRED','REQUIRED']]]){
  const code=policy.applyExpenseCodeLinkPolicy({base,vatEnabled:false},target);
  assert.deepEqual(['order','style','process'].map(key=>inputMode(code,key)),expected);
  if(target==='STYLE'){
   assert.equal(code.base.entryMode,'GENERAL');assert.equal(validExpenseLine(line,code,'USD'),true);
   assert.equal(validExpenseLine({...line,styleProcessIds:[]},code,'USD'),true);
   assert.equal(validExpenseLine({...line,workOrderId:''},code,'USD'),false);
   assert.equal(expenseCodeForLine({...line,itemId:'saved',linkTarget:'STYLE'},policy.applyExpenseCodeLinkPolicy({base},'NONE')).linkTarget,'STYLE');
  }
 }
});

test('hierarchy SQL keeps legacy rows and permits one cost with multiple real process FKs',async()=>{
 const db=await fixture(true);try{
  const setPolicy=async target=>{const {rows:[audit]}=await db.query(`INSERT INTO "ExpenseCodeLinkAudit"("orgId","baseId",target,"actorId") VALUES(1,20,$1,20) RETURNING id`,[target]);await db.query(`UPDATE "ExpenseCodeLinkPolicy" SET target=$1,"auditId"=$2 WHERE "orgId"=1 AND "baseId"=20`,[target,audit.id]);};
  const insert=(id,style=null)=>db.query(`INSERT INTO "PartnerTransactionCost"(id,"orgId","partnerOrgId","serviceTypeId","transactionCodeId","workOrderId","styleId","unitPrice",quantity,subtotal,"vatRate","vatAmount",amount,currency,details) VALUES($1,1,11,1,4,40,$2,10,2,20,0,0,20,'VND','{}')`,[id,style]);
  await setPolicy('ORDER');await insert('order-only');await assert.rejects(insert('unexpected-style',50),/unexpected input option/);
  await setPolicy('STYLE');await assert.rejects(insert('missing-style'),/required input option/);await insert('style',50);
  await assert.rejects(db.exec(`INSERT INTO "ExpenseCostProcess" VALUES('style',1,50,55)`),/audit required/);
  await db.exec(`SET test.editor='true';INSERT INTO "ExpenseCostProcess" VALUES('style',1,50,55),('style',1,50,56)`);
  assert.equal((await db.query(`SELECT count(*)::int AS n FROM "ExpenseCostProcess"`)).rows[0].n,2);
  assert.equal(Number((await db.query(`SELECT amount FROM "PartnerTransactionCost" WHERE id='style'`)).rows[0].amount),20);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "OutsourcedWorkRecord"')).rows[0].n,1,'Only the original production record exists');
  for(const [style,process] of [[50,57],[50,58],[51,57]])await assert.rejects(db.query(`INSERT INTO "ExpenseCostProcess" VALUES('style',1,$1,$2)`,[style,process]),/foreign key/);
  await db.exec(`INSERT INTO "BankLedgerEntry" VALUES(1,NULL);INSERT INTO "BankLedgerEvidenceAllocation" VALUES('style',1)`);
  await assert.rejects(db.exec(`DELETE FROM "ExpenseCostProcess" WHERE "costId"='style'`),/EXPENSE_ALREADY_RECONCILED/);
  await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=NOW();UPDATE "WorkOrder" SET "invoiceFinalLockedAt"=NOW() WHERE id=40`);
  await assert.rejects(db.exec(`DELETE FROM "ExpenseCostProcess" WHERE "costId"='style'`),/finally locked/);
 }finally{await db.close();}
});

test('employee payee SQL preserves vendor history and enforces real employee, account and document scopes',async()=>{
 const db=await fixture(true);try{
  await db.exec(`ALTER TABLE "Employee" ADD COLUMN status TEXT DEFAULT 'ACTIVE',ADD COLUMN "orgRole" TEXT DEFAULT 'ADMIN',ADD COLUMN "bankAccountNumber" TEXT DEFAULT 'payroll-original';
   CREATE TABLE "ExpenseRequest"(id INT PRIMARY KEY,"orgId" INT,"partnerOrgId" INT NOT NULL);
   CREATE TABLE "OrganizationBankAccount"(id TEXT PRIMARY KEY,"orgId" INT,"entityId" INT);`);
  const before=(await db.query('SELECT to_jsonb(c) AS row FROM "PartnerTransactionCost" c ORDER BY id')).rows;
  const migration=readFileSync('backend/prisma/migrations/20261030210000_employee_expense_payees/migration.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query(`SELECT to_jsonb(c)-'payeeEmployeeId' AS row FROM "PartnerTransactionCost" c ORDER BY id`)).rows,before);
  await db.exec(`CREATE CONSTRAINT TRIGGER request_bank AFTER INSERT OR UPDATE ON "ExpenseRequest" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION baro_expense_payee_bank_guard();`);
  await assert.rejects(db.exec(`INSERT INTO "ExpenseRequest" VALUES(1,1,NULL,20)`),/PAYEE_BANK_ACCOUNT_REQUIRED/);
  await db.exec(`INSERT INTO "EmployeeExpenseBankAccount"(id,"orgId","employeeId","createdByEmployeeId","currencyCode","bankName","accountNumber","accountHolder") VALUES('emp-bank',1,20,20,'USD','Bank','123','Employee');`);
  await assert.rejects(db.exec(`INSERT INTO "EmployeeExpenseBankAccount"(id,"orgId","employeeId","createdByEmployeeId","currencyCode","bankName","accountNumber","accountHolder") VALUES('wrong',1,21,20,'USD','Bank','123','Other company')`));
  await db.exec(`INSERT INTO "ExpenseRequest" VALUES(1,1,NULL,20);SET test.editor='true';`);
  await db.exec(`INSERT INTO "Employee"(id,"orgId") VALUES(22,1);`);
  const insert=(id,employee,record=null)=>db.query(`INSERT INTO "PartnerTransactionCost"(id,"orgId","partnerOrgId","payeeEmployeeId","expenseRequestId","serviceTypeId","transactionCodeId","unitPrice",quantity,subtotal,"vatRate","vatAmount",amount,currency,details,"outsourcedWorkRecordId") VALUES($1,1,NULL,$2,1,1,5,10,2,20,0,0,20,'USD','{}',$3)`,[id,employee,record]);
  await insert('employee-cost',20);
  await assert.rejects(insert('other-company-cost',21));
  await assert.rejects(insert('different-request-payee',22));
  await assert.rejects(insert('production-for-employee',20,70));
  await assert.rejects(db.exec(`UPDATE "EmployeeExpenseBankAccount" SET "accountNumber"='changed' WHERE id='emp-bank'`),/immutable/);
  assert.equal((await db.query(`SELECT "bankAccountNumber" FROM "Employee" WHERE id=20`)).rows[0].bankAccountNumber,'payroll-original');
 }finally{await db.close();}
});

test('base FK determines all E/V/Z variants; unset defaults ignore industry and legacy input flags',async()=>{
 const db={expenseCodeLinkPolicy:{findUnique:async({where})=>where.orgId_baseId.orgId===1&&where.orgId_baseId.baseId===10?{target:'PROCESS',auditId:5}:null},industryProductionPolicy:{findUnique:()=>{throw Error('Legacy industry setting must not be read');}}};
 for(const tax of ['E','V','Z']){
  const code={baseId:10,code:'BTH'+tax,base:{entryMode:'PROCESS',processInput:'REQUIRED',requiredFields:[],serviceTypeId:1}};
  const original=structuredClone(code),required=await policy.resolveExpenseCodeLink(db,1,code);
  assert.equal(required.linkTarget,'PROCESS');assert.equal(inputMode(required,'process'),'REQUIRED');assert.deepEqual(code,original);
  for(const [org,base] of [[2,10],[1,20],[1,99]]){
   const optional=await policy.resolveExpenseCodeLink(db,org,{...code,baseId:base});
   assert.equal(optional.linkTarget,'NONE');assert.equal(optional.base.entryMode,'GENERAL');assert.equal(inputMode(optional,'process'),'HIDDEN');
  }
 }
});

test('required process input does not turn a general cost into production; saved modes never follow later settings',async()=>{
 const code={baseId:30,vatEnabled:false,base:{entryMode:'GENERAL',requiredFields:[]}};
 const db={expenseCodeLinkPolicy:{findUnique:async()=>({target:'PROCESS',auditId:6})}};
 const required=await policy.resolveExpenseCodeLink(db,1,code);
 assert.equal(required.base.entryMode,'GENERAL');assert.equal(inputMode(required,'process'),'REQUIRED');
 const line={quantity:'1.5',unitPrice:'10',vatRate:'0',details:{},workOrderId:1,styleId:2,styleProcessId:3,enabled:{}};
 assert.equal(validExpenseLine(line,required,'USD'),true);
 assert.equal(validExpenseLine({...line,styleProcessId:''},required,'USD'),false);
 const old=await policy.resolveExpenseCodeLink(db,1,code,{cost:{id:'old'}});
 assert.equal(old.linkTarget,'NONE');
 const linked=await policy.resolveExpenseCodeLink(db,1,code,{cost:{id:'old'},record:{id:1}});
 assert.equal(linked.base.entryMode,'PROCESS');
 assert.equal(expenseCodeForLine({...line,itemId:'old'},required).linkTarget,'NONE');
 assert.equal(expenseCodeForLine({...line,itemId:'old',linkTarget:'PROCESS'},required).base.entryMode,'GENERAL');
});

test('settings API ignores request tenant IDs, validates role and target, and saves an audit with actual base FK',async()=>{
 const routes=new Map(),writes=[];let allowed=true,validBase=true,current=null;
 const db={$queryRawUnsafe:async()=>[],transactionCodeBase:{findFirst:async()=>validBase?{id:10}:null},expenseCodeLinkPolicy:{findUnique:async()=>current,upsert:async query=>{writes.push(query);return query.create;}},expenseCodeLinkAudit:{create:async({data})=>{writes.push(data);return{id:5};}},$transaction:fn=>fn(db)};
 policy.registerExpenseCodeLinkPolicyRoutes({get:()=>{},put:(path,handler)=>routes.set(path,handler)},db,{actorId:()=>20,requireOrgRole:async(_req,_res,options)=>{assert.deepEqual(options.allowedRoles,['ADMIN']);return allowed?{organization:{id:1}}:null;}});
 const route=routes.get('/app-settings/expense-code-links'),req={query:{orgId:999},body:{baseId:10,target:'PROCESS'}},res={json:()=>{}};
 await route(req,res);assert.deepEqual(writes[0],{orgId:1,baseId:10,previousTarget:'NONE',target:'PROCESS',actorId:20});
 assert.deepEqual(writes[1].where,{orgId_baseId:{orgId:1,baseId:10}});
 allowed=false;await route(req,res);assert.equal(writes.length,2);allowed=true;
 current={target:'PROCESS'};await route(req,res);assert.equal(writes.length,2);current=null;
 for(const target of [true,null,'UNKNOWN','default'])await assert.rejects(route({...req,body:{baseId:10,target}},res),/INVALID_EXPENSE_CODE_LINK_POLICY/);
 validBase=false;await assert.rejects(route(req,res),/INVALID_EXPENSE_CODE_BASE/);
});

async function fixture(hierarchy=false){
 const db=new PGlite();
 await db.exec(`
 CREATE TABLE "Organization"(id INT PRIMARY KEY,name TEXT,type TEXT,"ownerOrgId" INT,"isActive" BOOL DEFAULT true,UNIQUE(id,"ownerOrgId"));
 CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,UNIQUE(id,"orgId"));
 CREATE TABLE "ExpenseType"(id INT PRIMARY KEY,"isActive" BOOL); INSERT INTO "ExpenseType" VALUES(1,true);
 CREATE TABLE "TransactionCodeBase"(id INT PRIMARY KEY,code TEXT UNIQUE,"entryMode" TEXT,"requiredFields" TEXT[],"orderInput" TEXT,"styleInput" TEXT,"processInput" TEXT,"expenseTypeId" INT,"isActive" BOOL DEFAULT true);
 CREATE TABLE "TransactionCode"(id INT PRIMARY KEY,"baseId" INT,"ownerOrgId" INT,"serviceTypeId" INT,"isActive" BOOL DEFAULT true,"vatEnabled" BOOL DEFAULT false);
 CREATE TABLE "OutsourcingServiceType"(id INT,"ownerOrgId" INT,"entryMode" TEXT,"requiredFields" TEXT[],"orderInput" TEXT,"styleInput" TEXT,"processInput" TEXT,"isActive" BOOL DEFAULT true);
 CREATE TABLE "WorkOrder"(id INT PRIMARY KEY,"orgId" INT,"invoiceFinalLockedAt" TIMESTAMP);
 CREATE TABLE "AssignmentPlan"(id INT PRIMARY KEY,"workOrderId" INT);
 CREATE TABLE "OutsourcedWorkRecord"(id INT PRIMARY KEY,"orgId" INT,"outsourcingPartnerId" INT,"styleId" INT,"styleProcessId" INT,"assignmentPlanId" INT,quantity INT,"outsourceUnitPrice" NUMERIC);
 CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"partnerOrgId" INT,"serviceTypeId" INT,"transactionCodeId" INT,"workOrderId" INT,"styleId" INT,"styleProcessId" INT,"outsourcedWorkRecordId" INT,"unitPrice" NUMERIC,quantity NUMERIC,subtotal NUMERIC,"vatRate" NUMERIC,"vatAmount" NUMERIC,amount NUMERIC,currency TEXT,details JSONB,"clientKey" TEXT,"createdByEmployeeId" INT,"createdAt" TIMESTAMP,"expenseRequestId" INT,"expenseRequestLine" INT);
 CREATE FUNCTION baro_expense_editor_authorized(org INT) RETURNS BOOL LANGUAGE sql AS $$ SELECT current_setting('test.editor',true)='true' $$;
 INSERT INTO "Organization" VALUES(1,'BARO GARMENT','MANUFACTURER',NULL,true),(2,'Other SaaS','MANUFACTURER',NULL,true),(11,'Vendor','PROCESS_OUTSOURCING',1,true);
 INSERT INTO "Employee" VALUES(20,1),(21,2);
 INSERT INTO "TransactionCodeBase" VALUES(10,'BTH','PROCESS','{}','REQUIRED','REQUIRED','REQUIRED',1,true),(20,'PRT','PROCESS','{}','REQUIRED','REQUIRED','REQUIRED',1,true),(30,'GEN','GENERAL','{}','REQUIRED','REQUIRED','REQUIRED',1,true);
 INSERT INTO "TransactionCode" VALUES(1,10,1,1,true,false),(2,10,1,1,true,false),(3,10,1,1,true,false),(4,20,1,1,true,false),(5,30,1,1,true,false);
 INSERT INTO "WorkOrder" VALUES(40,1,NULL); INSERT INTO "AssignmentPlan" VALUES(60,40);
 INSERT INTO "OutsourcedWorkRecord" VALUES(70,1,11,50,55,60,2,10);
 INSERT INTO "PartnerTransactionCost" VALUES('historical',1,11,1,1,NULL,NULL,NULL,NULL,10,2,20,0,0,20,'VND','{}','old',20,NOW(),NULL,NULL);
 `);
 const before=(await db.query(`SELECT to_jsonb(c) AS row FROM "PartnerTransactionCost" c`)).rows;
 await db.exec(sql);await db.exec(seed);await db.exec(sql);await db.exec(seed);
 assert.deepEqual((await db.query(`SELECT to_jsonb(c)-'linkTarget'-'linkPolicyAuditId' AS row FROM "PartnerTransactionCost" c`)).rows,before);
 await db.exec('CREATE TRIGGER cost_guard BEFORE INSERT OR UPDATE OR DELETE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_transaction_cost_guard()');
 if(hierarchy){
  await db.exec(`CREATE TABLE "StyleProcess"(id INT PRIMARY KEY,"styleId" INT,"orgId" INT,UNIQUE(id,"styleId","orgId"));INSERT INTO "StyleProcess" VALUES(55,50,1),(56,50,1),(57,51,1),(58,50,2);
   CREATE TABLE "BankLedgerEntry"(id INT PRIMARY KEY,"voidedAt" TIMESTAMP);CREATE TABLE "BankLedgerEvidenceAllocation"("expenseItemId" TEXT,"entryId" INT);`);
  const migration=readFileSync('backend/prisma/migrations/20261029190000_expense_link_hierarchy/migration.sql','utf8');
  const before=(await db.query('SELECT to_jsonb(c) AS row FROM "PartnerTransactionCost" c ORDER BY id')).rows;
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query('SELECT to_jsonb(c) AS row FROM "PartnerTransactionCost" c ORDER BY id')).rows,before);
 }
 return db;
}

test('migration preserves history, is repeatable, and seeds only BARO base policies with FK/append-only guards',async()=>{
 const db=await fixture();try{
  assert.deepEqual((await db.query('SELECT "orgId","baseId",target FROM "ExpenseCodeLinkPolicy" ORDER BY "baseId"')).rows,[{orgId:1,baseId:10,target:'PROCESS'},{orgId:1,baseId:20,target:'NONE'}]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "ExpenseCodeLinkAudit"')).rows[0].n,2);
  await assert.rejects(db.exec('DELETE FROM "ExpenseCodeLinkAudit"'),/append-only/);
  await assert.rejects(db.exec(`INSERT INTO "ExpenseCodeLinkAudit"("orgId","baseId",target,"actorId") VALUES(1,10,'NONE',21)`));
  await assert.rejects(db.exec(`INSERT INTO "ExpenseCodeLinkAudit"("orgId","baseId",target) VALUES(1,999,'NONE')`));
  await assert.rejects(db.exec(`UPDATE "ExpenseCodeLinkPolicy" SET target='NONE' WHERE "baseId"=10`),/audit mismatch/);
 }finally{await db.close();}
});

test('database enforces NONE/PROCESS independently of legacy options and preserves existing rows after settings change',async()=>{
 const db=await fixture();try{
  const insert=(id,code,{order=null,style=null,process=null,record=null,target='NONE'}={})=>db.query(`INSERT INTO "PartnerTransactionCost"(id,"orgId","partnerOrgId","serviceTypeId","transactionCodeId","workOrderId","styleId","styleProcessId","outsourcedWorkRecordId","unitPrice",quantity,subtotal,"vatRate","vatAmount",amount,currency,details,"linkTarget") VALUES($1,1,11,1,$2,$3,$4,$5,$6,10,2,20,0,0,20,'VND','{}',$7)`,[id,code,order,style,process,record,target]);
  await insert('printing',4); // Same legacy PROCESS options as BTH, but explicit NONE.
  for(const code of [1,2,3])await assert.rejects(insert('missing'+code,code),/target mismatch/);
  await assert.rejects(insert('missing-process',1,{target:'PROCESS',order:40,style:50}),/process references required/);
  await insert('production',1,{target:'PROCESS',order:40,style:50,process:55,record:70});
  await db.exec(`INSERT INTO "ExpenseCodeLinkAudit"("orgId","baseId",target) VALUES(1,30,'PROCESS');INSERT INTO "ExpenseCodeLinkPolicy" SELECT 1,30,'PROCESS',id,NOW() FROM "ExpenseCodeLinkAudit" WHERE "baseId"=30`);
  await insert('link-only',5,{target:'PROCESS',order:40,style:50,process:55});
  assert.equal((await db.query(`SELECT "outsourcedWorkRecordId" FROM "PartnerTransactionCost" WHERE id='link-only'`)).rows[0].outsourcedWorkRecordId,null);
  await db.exec(`INSERT INTO "ExpenseCodeLinkAudit"("orgId","baseId",target) VALUES(1,20,'PROCESS');UPDATE "ExpenseCodeLinkPolicy" SET target='PROCESS',"auditId"=(SELECT max(id) FROM "ExpenseCodeLinkAudit" WHERE "baseId"=20) WHERE "baseId"=20;SET test.editor='true';`);
  await db.exec(`UPDATE "PartnerTransactionCost" SET "unitPrice"=20,subtotal=40,amount=40 WHERE id='printing'`);
  await db.exec(`UPDATE "PartnerTransactionCost" SET "unitPrice"=20,subtotal=40,amount=40 WHERE id='historical'`);
  await assert.rejects(db.exec(`UPDATE "PartnerTransactionCost" SET "linkTarget"='PROCESS' WHERE id='printing'`),/immutable/);
  assert.equal((await db.query(`SELECT "outsourcedWorkRecordId" FROM "PartnerTransactionCost" WHERE id='historical'`)).rows[0].outsourcedWorkRecordId,null);
  assert.equal((await db.query('SELECT quantity FROM "OutsourcedWorkRecord" WHERE id=70')).rows[0].quantity,2);
 }finally{await db.close();}
});
