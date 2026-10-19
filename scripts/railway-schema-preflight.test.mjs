import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
const require = createRequire(import.meta.url);
const { runRailwayPreflight, columns, constraints } = require('../backend/scripts/railway-schema-preflight.js');
const env = { RAILWAY_ENVIRONMENT_ID:'test-environment', RAILWAY_SERVICE_ID:'test-service', DATABASE_URL:'postgresql://test:secret@127.0.0.1/test' };
const quiet = () => {};
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
  await runRailwayPreflight({env,log:quiet,createClient:()=>({$queryRawUnsafe:async sql=>sql.includes('information_schema') ? columns.map(([table_name,column_name])=>({table_name,column_name})) : constraints.map(name=>({name})), $disconnect:async()=>{closed=true;}}),run:()=>{throw Error('No repeated migration');}});
  assert.ok(closed);
});
test('preflight applies the bounded additive transaction, preserves legacy costs, verifies constraints and skips the next launch', async () => {
  const db=new PGlite();let runs=0,closed=0;
  try {
    await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,UNIQUE(id,"ownerOrgId"));
      CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,status TEXT DEFAULT 'ACTIVE',"orgRole" TEXT DEFAULT 'ADMIN',UNIQUE(id,"orgId"));
      CREATE TABLE "OutsourcedWorkRecord"(id INT PRIMARY KEY,"orgId" INT);
      CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"partnerOrgId" INT,currency TEXT,amount NUMERIC);
      INSERT INTO "Organization" VALUES(1,NULL),(11,1); INSERT INTO "Employee"(id,"orgId") VALUES(20,1);
      INSERT INTO "PartnerTransactionCost" VALUES('legacy',1,11,'VND',123);`);
    const dependencies={env,log:quiet,createClient:()=>({$queryRawUnsafe:async sql=>(await db.query(sql)).rows,$disconnect:async()=>{closed++;}}),run:async(_exe,args,options)=>{
      runs++;assert.ok(!args.includes(env.DATABASE_URL));assert.equal(options.shell,undefined);
      assert.match(options.input,/BEGIN;[\s\S]*pg_advisory_xact_lock[\s\S]*COMMIT;/);
      assert.doesNotMatch(options.input,/(?:^|;)\s*(?:UPDATE|DELETE FROM|DROP TABLE|TRUNCATE)\b/m);
      await db.exec(options.input);return {status:0};
    }};
    await runRailwayPreflight(dependencies); await runRailwayPreflight(dependencies);
    assert.equal(runs,1);assert.equal(closed,2);
    assert.deepEqual((await db.query(`SELECT amount::text,"expenseRequestId","expenseRequestLine" FROM "PartnerTransactionCost" WHERE id='legacy'`)).rows,[{amount:'123',expenseRequestId:null,expenseRequestLine:null}]);
  }finally{await db.close();}
});
test('migration failure stops launch, disconnects and never exposes subprocess credentials', async () => {
  let closed=false;const logs=[];
  const db={$queryRawUnsafe:async()=>[],$disconnect:async()=>{closed=true;}};
  await assert.rejects(runRailwayPreflight({env,createClient:()=>db,log:value=>logs.push(value),run:()=>({status:1,stderr:env.DATABASE_URL})}),/API will not start/);
  assert.ok(closed); assert.ok(!logs.join('').includes('secret'));
});
