import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { runRailwayPreflight, columns, constraints } = require('../backend/scripts/railway-schema-preflight.js');
const env = { RAILWAY_ENVIRONMENT_ID:'test-environment', RAILWAY_SERVICE_ID:'test-service', DATABASE_URL:'postgresql://test:secret@127.0.0.1/test' };
const quiet = () => {};
const {migrations,migrationSql}=require('../backend/scripts/migrate-expenses.js');
const entityMigration=require('../backend/scripts/migrate-entity-profiles.js');
test('local npm start does not open or modify a database; Railway runs the prestart hook before the pure API command', async () => {
  await runRailwayPreflight({ env: {}, log:quiet, createClient:()=>{throw Error('No local DB access');}, run:()=>{throw Error('No local SQL');} });
  const pkg=JSON.parse(fs.readFileSync('backend/package.json','utf8'));
  assert.equal(pkg.scripts.prestart,'node scripts/railway-schema-preflight.js');
  assert.equal(pkg.scripts.start,'node dist/index.js'); assert.equal(pkg.scripts['start:api'],'node dist/index.js');
});
test('missing Railway URLs and authentication database targets are refused before opening a client', async () => {
  const createClient=()=>{throw Error('No DB access');};
  await assert.rejects(runRailwayPreflight({env:{...env,DATABASE_URL:''},createClient,log:quiet}),/URL is missing/);
  await assert.rejects(runRailwayPreflight({env:{...env,DATABASE_URL:'postgresql://x:x@db.example.supabase.co/postgres'},createClient,log:quiet}),/Refusing Supabase/);
  await assert.rejects(runRailwayPreflight({env:{...env,DIRECT_URL:env.DATABASE_URL,DATABASE_URL:'postgresql://x:x@db.example.supabase.co/postgres'},createClient,log:quiet}),/Refusing Supabase/);
});
test('a complete schema skips SQL and closes the check connection', async () => {
  let closed=false;
  await runRailwayPreflight({env,log:quiet,createClient:()=>({$queryRawUnsafe:async sql=>sql.includes('to_regclass') ? [{present:true}] : sql==='SELECT version,checksum FROM "ExpenseSchemaMigration"' ? migrations() : sql.includes('SELECT version,checksum FROM "EntitySchemaMigration"') ? entityMigration.migrations() : sql.includes('information_schema') ? columns.map(([table_name,column_name])=>({table_name,column_name})) : constraints.map(name=>({name,definition:name==='TransactionCost_style_scope_fkey'?'FOREIGN KEY ("styleId", "orgId") REFERENCES "Style"(id, "orgId")':name.endsWith('_payType_check')?'OUTPUT_FIXED':undefined})), $disconnect:async()=>{closed=true;}}),run:()=>{throw Error('No repeated migration');}});
  assert.ok(closed);
});
test('preflight applies the bounded additive transaction, preserves legacy costs, verifies constraints and skips the next launch', async () => {
  const db=new PGlite();let runs=0,closed=0;
  try {
    await db.exec(`CREATE TYPE "OrganizationType" AS ENUM ('MANUFACTURER','BRAND','PROCESS_OUTSOURCING','MATERIAL_SUPPLIER'); CREATE TABLE "SystemSetting"(key TEXT PRIMARY KEY,value JSONB,"updatedByEmployeeId" INT,"createdAt" TIMESTAMP DEFAULT now(),"updatedAt" TIMESTAMP DEFAULT now());
      CREATE TABLE "Organization"(id INT PRIMARY KEY,name TEXT,type "OrganizationType" DEFAULT 'MANUFACTURER',"ownerOrgId" INT,"dataOwnerOrgId" INT,UNIQUE(id,"ownerOrgId"));
      CREATE TABLE "SettingServiceDefault"(id SERIAL PRIMARY KEY,code TEXT UNIQUE); CREATE TABLE "ExpenseType"(id INT PRIMARY KEY); CREATE TABLE "TransactionCodeBase"("serviceTypeId" INT,"expenseTypeId" INT);
      CREATE TABLE "Currency"(id INT PRIMARY KEY); CREATE TABLE "OrgRelationship"("manufacturerOrgId" INT,"brandOrgId" INT);
      CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,status TEXT DEFAULT 'ACTIVE',"orgRole" TEXT DEFAULT 'ADMIN',UNIQUE(id,"orgId"));
      CREATE TABLE "OutsourcedWorkRecord"(id INT PRIMARY KEY,"orgId" INT);
      CREATE TABLE "Style"(id INT PRIMARY KEY,"orgId" INT,"customerOrgId" INT);
      CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"partnerOrgId" INT,"styleId" INT,currency TEXT,amount NUMERIC);
      INSERT INTO "Organization"(id,"ownerOrgId") VALUES(1,NULL),(11,1); INSERT INTO "Employee"(id,"orgId") VALUES(20,1);
      INSERT INTO "PartnerTransactionCost" VALUES('legacy',1,11,NULL,'VND',123);`);
    await db.exec(`ALTER TABLE "SettingServiceDefault" ADD COLUMN "nameKo" TEXT,ADD COLUMN "nameEn" TEXT,ADD COLUMN "nameVi" TEXT,ADD COLUMN "entryMode" TEXT,ADD COLUMN "requiredFields" TEXT[],ADD COLUMN "orderInput" TEXT,ADD COLUMN "styleInput" TEXT,ADD COLUMN "processInput" TEXT,ADD COLUMN "isActive" BOOL,ADD COLUMN "sortOrder" INT;
      ALTER TABLE "TransactionCodeBase" ADD COLUMN id INT PRIMARY KEY,ADD COLUMN code TEXT;
      CREATE TABLE "OutsourcingServiceType"(id SERIAL PRIMARY KEY,"ownerOrgId" INT,code TEXT,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"entryMode" TEXT,"requiredFields" TEXT[],"orderInput" TEXT,"styleInput" TEXT,"processInput" TEXT,"isActive" BOOL,"sortOrder" INT,"systemDefaultId" INT,"isOverridden" BOOL,"updatedAt" TIMESTAMP,UNIQUE("ownerOrgId","systemDefaultId"));
      CREATE TABLE "TransactionCode"(id INT,"ownerOrgId" INT,"serviceTypeId" INT,"baseId" INT,"systemDefaultId" INT);
      CREATE TABLE "SettingTransactionCodeDefault"(id INT,"serviceTypeId" INT);
      CREATE TABLE "OrganizationOutsourcingServiceType"("partnerOrgId" INT,"ownerOrgId" INT,"serviceTypeId" INT,"createdAt" TIMESTAMP,PRIMARY KEY("partnerOrgId","serviceTypeId"));
      ${['WorkLog','WorkOrder','AssignmentPlan'].map(table=>`CREATE TABLE "${table}"(id INT);`).join('\n')}`);
    await db.exec('CREATE TABLE "Invoice"(id TEXT PRIMARY KEY,"sellerOrgId" INT,status TEXT,"currencyCode" TEXT,total NUMERIC)');
    await db.exec(['SalaryItemRate','EmployeeCompensationPolicy','EmployeePayTypePolicy'].map(table=>`CREATE TABLE "${table}"(id INT PRIMARY KEY,"payType" TEXT);`).join('\n'));
    await db.exec(['ProcessMasterOption','Factory','Warehouse','EmployeeGrade','SalaryItem','AttrColor','AttrCategory','AttrProcess','PriorCompletionReason','TaxTreatment'].map(table=>`CREATE TABLE "${table}"(id INT PRIMARY KEY,name TEXT);`).join('\n'));
    await db.exec(`UPDATE "Organization" SET name='Fixture organization '||id WHERE name IS NULL`);
    const dependencies={env,log:quiet,createClient:()=>({$queryRawUnsafe:async sql=>(await db.query(sql)).rows,$disconnect:async()=>{closed++;}}),run:async(_exe,args,options)=>{
      runs++;assert.ok(!args.includes(env.DATABASE_URL));assert.equal(options.shell,undefined);
      assert.match(options.input,/BEGIN;[\s\S]*pg_advisory_xact_lock[\s\S]*COMMIT;/);
      assert.ok([migrationSql(),entityMigration.migrationSql()].includes(options.input));
      await db.exec(options.input);return {status:0};
    }};
    await runRailwayPreflight(dependencies); await runRailwayPreflight(dependencies);
    assert.equal(runs,2);assert.equal(closed,2);
    assert.deepEqual((await db.query(`SELECT amount::text,"expenseRequestId","expenseRequestLine" FROM "PartnerTransactionCost" WHERE id='legacy'`)).rows,[{amount:'123',expenseRequestId:null,expenseRequestLine:null}]);
  }finally{await db.close();}
});
test('migration failure stops launch, disconnects and never exposes subprocess credentials', async () => {
  let closed=false;const logs=[];
  const db={$queryRawUnsafe:async()=>[],$disconnect:async()=>{closed=true;}};
  await assert.rejects(runRailwayPreflight({env,createClient:()=>db,log:value=>logs.push(value),run:()=>({status:1,stderr:env.DATABASE_URL})}),/Migration failed/);
  assert.ok(closed); assert.ok(!logs.join('').includes('secret'));
});

test('expense style FK repairs customer scope, preserves rows, rejects other manufacturers and refuses orphan repair',async()=>{
  const db=new PGlite();
  const repair=fs.readFileSync('backend/prisma/migrations/20261020120000_expense_style_manufacturer_fk/migration.sql','utf8');
  try{
    await db.exec(`CREATE TABLE "Style"(id INT PRIMARY KEY,"orgId" INT,"customerOrgId" INT,UNIQUE(id,"customerOrgId"));
      CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"styleId" INT,amount NUMERIC,
        CONSTRAINT "TransactionCost_style_scope_fkey" FOREIGN KEY("styleId","orgId") REFERENCES "Style"(id,"customerOrgId"));
      INSERT INTO "Style" VALUES(34,1,2); INSERT INTO "PartnerTransactionCost" VALUES('legacy',1,NULL,510000);`);
    await assert.rejects(db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('valid',1,34,510000)`),/TransactionCost_style_scope_fkey/);
    await db.exec(repair);await db.exec(repair);
    await db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('valid',1,34,510000)`);
    await assert.rejects(db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('foreign',2,34,510000)`),/TransactionCost_style_scope_fkey/);
    assert.deepEqual((await db.query(`SELECT amount::text FROM "PartnerTransactionCost" ORDER BY id`)).rows,[{amount:'510000'},{amount:'510000'}]);
    await db.exec(`DELETE FROM "PartnerTransactionCost" WHERE id='valid'; ALTER TABLE "PartnerTransactionCost" DROP CONSTRAINT "TransactionCost_style_scope_fkey";
      ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "TransactionCost_style_scope_fkey" FOREIGN KEY("styleId","orgId") REFERENCES "Style"(id,"customerOrgId");
      INSERT INTO "PartnerTransactionCost" VALUES('needs-review',2,34,42);`);
    await assert.rejects(db.exec(repair),/EXPENSE_STYLE_OWNER_MISMATCH/);
  }finally{await db.close();}
});
