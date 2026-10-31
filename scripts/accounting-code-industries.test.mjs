import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {codeIndustrySelection,codeIndustryDto}=require('../backend/dist/services/accountingCodeIndustries.js');
const {resolveAccountingCode,ledgerAccountingCode}=require('../backend/dist/services/accountingCode.js');
const {accountingCodeDescription}=await import('../frontend/src/utils/accountingCode.mjs');
const sql=readFileSync('backend/prisma/migrations/20261031220000_accounting_code_industries/migration.sql','utf8');
test('N:M selections require real source FKs and a current revision; inactive retained sources can be kept',async()=>{
 const sources=[{id:10,code:'ZIPPER',isActive:true,partnerRoleId:1},{id:20,code:'BUTTON',isActive:true,partnerRoleId:2},{id:30,code:'GENERAL',isActive:true,partnerRoleId:3},{id:40,code:'RETIRED',isActive:false,partnerRoleId:1}];
 const tx={$queryRawUnsafe:async()=>[],accountingCodeIndustry:{findMany:async()=>[{systemIndustryId:40}]},settingServiceDefault:{findMany:async({where})=>sources.filter(row=>where.id.in.includes(row.id))}};
 assert.deepEqual((await codeIndustrySelection(tx,{industryIds:[10,20]},null)).ids,[10,20]);
 assert.deepEqual((await codeIndustrySelection(tx,{industryIds:[40],industryRevision:3},{id:7,industryRevision:3})).ids,[40]);
 await assert.rejects(codeIndustrySelection(tx,{industryIds:[10],industryRevision:2},{id:7,industryRevision:3}),/ACCOUNTING_INDUSTRY_CHANGED/);
 assert.deepEqual((await codeIndustrySelection(tx,{industryIds:[],industryRevision:3,isActive:false},{id:7,industryRevision:3})).ids,[]);
 for(const ids of [[],[10,10],[999],[30],['10'],[40]])await assert.rejects(codeIndustrySelection(tx,{industryIds:ids}),/ACCOUNTING_INDUSTRY_REQUIRED/);
 assert.deepEqual(codeIndustryDto({id:7,industryLinks:[{systemIndustryId:10,industry:sources[0]}]}).industryIds,[10]);
});
test('new codes have no accounting type dependency; retired or disabled legacy codes keep their old availability',async()=>{
 const base={code:'ZIP',nameEn:'Zipper cost',isActive:true,variants:[{id:2,taxTreatmentId:1,isActive:true,isEnabled:true}]};
 const row={id:3,ownerOrgId:1,isActive:true,base,taxTreatmentId:1,taxTreatment:{id:1,code:'VAT',suffix:'V'}};
 assert.equal(resolveAccountingCode(row).code,'ZIPV');assert.equal(accountingCodeDescription(row,'en'),'Zipper cost');
 const tx={transactionCode:{findFirst:async()=>row}};assert.deepEqual(await ledgerAccountingCode(tx,1,3),{id:3,description:'Zipper cost'});
 assert.equal(resolveAccountingCode({...row,base:{...base,expenseType:{code:'OTHER',isActive:false}}}),null);
 assert.equal(resolveAccountingCode({...row,base:{...base,expenseType:{code:'OLD',isActive:false}}}),null);
 assert.equal(resolveAccountingCode({...row,base:{...base,isActive:false}}),null);
 assert.equal(codeIndustryDto({...base,expenseType:{code:'DISABLED',isActive:false}}).isAvailable,false);
});
async function fixture(){
 const db=new PGlite();await db.exec(`
 CREATE TABLE "ExpenseType"(id INT PRIMARY KEY,code TEXT,"isActive" BOOL);INSERT INTO "ExpenseType" VALUES(1,'PRODUCTION',true),(2,'DISABLED',false),(3,'OTHER',false);
 CREATE TABLE "SettingServiceDefault"(id INT PRIMARY KEY,code TEXT);INSERT INTO "SettingServiceDefault" VALUES(10,'ZIPPER'),(20,'BUTTON'),(30,'GENERAL');
 CREATE TABLE "TransactionCodeBase"(id INT PRIMARY KEY,"serviceTypeId" INT REFERENCES "SettingServiceDefault"(id),"expenseTypeId" INT NOT NULL REFERENCES "ExpenseType"(id),"entryMode" TEXT DEFAULT 'GENERAL',"requiredFields" TEXT[] DEFAULT '{}',"orderInput" TEXT DEFAULT 'OPTIONAL',"styleInput" TEXT DEFAULT 'HIDDEN',"processInput" TEXT DEFAULT 'HIDDEN',"isActive" BOOL DEFAULT true);
 INSERT INTO "TransactionCodeBase"(id,"serviceTypeId","expenseTypeId","isActive") VALUES(1,10,1,true),(2,20,2,true),(3,30,3,false);
 CREATE TABLE "SystemSetting"(key TEXT PRIMARY KEY,value JSONB);INSERT INTO "SystemSetting" VALUES('CATALOGUE_ORDER:EXPENSE_TYPES','{"ids":[2,1]}'),('KEEP','{"keep":true}');
 CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,"isActive" BOOL,type TEXT);INSERT INTO "Organization" VALUES(1,NULL,true,'MANUFACTURER'),(11,1,true,'MATERIAL_SUPPLIER');
 CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,status TEXT);INSERT INTO "Employee" VALUES(9,1,'ACTIVE');
 CREATE TABLE "OutsourcingServiceType"(id INT PRIMARY KEY,"ownerOrgId" INT,"isActive" BOOL,"entryMode" TEXT,"requiredFields" TEXT[],"orderInput" TEXT,"styleInput" TEXT,"processInput" TEXT);INSERT INTO "OutsourcingServiceType" VALUES(10,1,true,'GENERAL','{}','OPTIONAL','HIDDEN','HIDDEN'),(20,1,true,'GENERAL','{}','OPTIONAL','HIDDEN','HIDDEN');
 CREATE TABLE "TaxTreatment"(id INT PRIMARY KEY);INSERT INTO "TaxTreatment" VALUES(1);
 CREATE TABLE "TransactionCode"(id INT PRIMARY KEY,"baseId" INT,"ownerOrgId" INT,"serviceTypeId" INT,"taxTreatmentId" INT,"isActive" BOOL,"vatEnabled" BOOL DEFAULT false);INSERT INTO "TransactionCode" VALUES(101,1,1,10,1,true,false),(102,2,1,20,1,true,false);
 CREATE TABLE "SettingTransactionCodeDefault"(id INT PRIMARY KEY,"baseId" INT,"taxTreatmentId" INT,"isActive" BOOL,"isEnabled" BOOL);INSERT INTO "SettingTransactionCodeDefault" VALUES(1,1,1,true,true),(2,2,1,true,true);
 CREATE TABLE "BankLedgerEntry"(id INT PRIMARY KEY,"orgId" INT,"accountingCodeId" INT,amount NUMERIC);INSERT INTO "BankLedgerEntry" VALUES(1,1,NULL,12.3456);
 CREATE TABLE "WorkOrder"(id INT PRIMARY KEY,"orgId" INT,"invoiceFinalLockedAt" TIMESTAMP);
 CREATE TABLE "ExpenseCodeLinkPolicy"("orgId" INT,"baseId" INT,target TEXT,"inputSettings" JSONB);
 CREATE TABLE "ExpenseCodeLinkAudit"(id INT PRIMARY KEY,"orgId" INT,"baseId" INT,target TEXT,"inputSettings" JSONB);
 CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"partnerOrgId" INT,"payeeEmployeeId" INT,"transactionCodeId" INT,"serviceTypeId" INT,"createdByEmployeeId" INT,"createdAt" TIMESTAMP DEFAULT now(),"clientKey" TEXT,"outsourcedWorkRecordId" INT,"workOrderId" INT,"styleId" INT,"styleProcessId" INT,"linkTarget" TEXT,"linkPolicyAuditId" INT,details JSONB DEFAULT '{}',"unitPrice" NUMERIC,quantity NUMERIC,subtotal NUMERIC,"vatRate" NUMERIC,"vatAmount" NUMERIC,amount NUMERIC,currency TEXT);
 INSERT INTO "PartnerTransactionCost"(id,"orgId","partnerOrgId","transactionCodeId","serviceTypeId",amount) VALUES('historical',1,11,101,10,123.4567);
 CREATE FUNCTION baro_expense_editor_authorized(org INT) RETURNS BOOL LANGUAGE sql AS $$ SELECT current_setting('test.editor',true)='true' $$;
 `);return db;
}
test('migration copies only explicit FKs, permits N:M links and never rewrites money, original codes or input settings',async()=>{
 const db=await fixture();try{
  const before=(await db.query('SELECT * FROM "PartnerTransactionCost"')).rows,ledger=(await db.query('SELECT * FROM "BankLedgerEntry"')).rows,original=(await db.query('SELECT * FROM "TransactionCodeBase" ORDER BY id')).rows;
  await db.exec(sql);await db.exec(sql);
  assert.deepEqual((await db.query('SELECT * FROM "AccountingCodeIndustry" ORDER BY "baseId"')).rows,[{baseId:1,systemIndustryId:10},{baseId:2,systemIndustryId:20}]);
  await db.exec('INSERT INTO "AccountingCodeIndustry" VALUES(1,20),(2,10);UPDATE "TransactionCodeBase" SET "industryRevision"=2 WHERE id=1;DELETE FROM "AccountingCodeIndustry" WHERE "baseId"=1 AND "systemIndustryId"=10');await db.exec(sql);
  assert.equal((await db.query('SELECT count(*)::int n FROM "AccountingCodeIndustry" WHERE "baseId"=1 AND "systemIndustryId"=10')).rows[0].n,0);
  assert.deepEqual((await db.query('SELECT to_jsonb(b)-\'industryRevision\' AS row FROM "TransactionCodeBase" b ORDER BY id')).rows.map(row=>row.row),original);
  assert.deepEqual((await db.query('SELECT * FROM "PartnerTransactionCost"')).rows,before);assert.deepEqual((await db.query('SELECT * FROM "BankLedgerEntry"')).rows,ledger);
  assert.deepEqual((await db.query('SELECT key FROM "SystemSetting"')).rows,[{key:'KEEP'}]);
  await assert.rejects(db.exec('INSERT INTO "AccountingCodeIndustry" VALUES(1,999)'),/foreign key/);await assert.rejects(db.exec('DELETE FROM "SettingServiceDefault" WHERE id=20'),/foreign key/);
 }finally{await db.close();}
});
test('SQL permits expense/ledger writes with type-free codes regardless of payee industry and still rejects foreign, disabled and invalid amounts',async()=>{
 const db=await fixture();try{
  await db.exec(sql);
  await db.exec(`INSERT INTO "TransactionCodeBase"(id,"serviceTypeId","expenseTypeId") VALUES(4,20,NULL);INSERT INTO "TransactionCode" VALUES(104,4,1,20,1,true,false);INSERT INTO "SettingTransactionCodeDefault" VALUES(4,4,1,true,true);
   CREATE TRIGGER ledger_guard BEFORE INSERT ON "BankLedgerEntry" FOR EACH ROW EXECUTE FUNCTION baro_ledger_accounting_code_guard();
   CREATE TRIGGER cost_guard BEFORE INSERT OR UPDATE OR DELETE ON "PartnerTransactionCost" FOR EACH ROW EXECUTE FUNCTION baro_transaction_cost_guard();`);
  await db.exec('INSERT INTO "BankLedgerEntry" VALUES(2,1,104,20)');await assert.rejects(db.exec('INSERT INTO "BankLedgerEntry" VALUES(3,2,104,20)'),/LEDGER_ACCOUNTING_CODE_INVALID/);await assert.rejects(db.exec('INSERT INTO "BankLedgerEntry" VALUES(4,1,102,20)'),/LEDGER_ACCOUNTING_CODE_INVALID/);
  const insert=(id,code=104,amount=20)=>db.query(`INSERT INTO "PartnerTransactionCost"(id,"orgId","partnerOrgId","transactionCodeId","serviceTypeId","unitPrice",quantity,subtotal,"vatRate","vatAmount",amount,currency) VALUES($1,1,11,$2,20,10,2,20,0,0,$3,'VND')`,[id,code,amount]);
  await insert('type-free');await assert.rejects(insert('wrong-total',104,21),/invalid accounting totals/);await assert.rejects(insert('disabled',102),/invalid expense code/);
  await db.exec(`SET test.editor='true';DELETE FROM "AccountingCodeIndustry" WHERE "baseId"=4;UPDATE "PartnerTransactionCost" SET details='{"reference":"original document"}' WHERE id='type-free';`);
  assert.equal(Number((await db.query(`SELECT amount FROM "PartnerTransactionCost" WHERE id='type-free'`)).rows[0].amount),20);
 }finally{await db.close();}
});
test('unused legacy editors/order utility are removed, while referenced tables and immutable migrations remain',()=>{
 assert.equal(existsSync('frontend/src/pages/App/CodeBaseSettings.jsx'),false);assert.equal(existsSync('frontend/src/components/CatalogueOrderButtons.jsx'),false);assert.equal(existsSync('backend/scripts/migrate-expense-code-separation.js'),false);
 assert.equal(existsSync('backend/prisma/migrations/20261016090000_expense_code_separation/migration.sql'),true);
 for(const file of ['backend/scripts/migrate-entity-profiles.js','backend/scripts/railway-schema-preflight.js','backend/src/index.ts'])assert.match(readFileSync(file,'utf8'),/accounting_code_industries|AccountingCodeIndustry/);
});
