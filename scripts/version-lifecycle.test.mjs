import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
import {applicableMonthVersion} from '../frontend/src/utils/versionApplication.mjs';
const require=createRequire(import.meta.url);
const {confirmCurrentProcessVersion,confirmedStyleProcessIds}=require('../backend/dist/services/styleProcessVersionLifecycle.js');

async function database() {
 const engine=new PGlite();
 await engine.exec(`CREATE TABLE "Style"(id int PRIMARY KEY,"orgId" int NOT NULL);
 CREATE TABLE "StyleProcess"(id int PRIMARY KEY,"styleId" int REFERENCES "Style",ct int NOT NULL);
 CREATE TABLE "StyleProcessVersion"(id serial PRIMARY KEY,"orgId" int,"styleId" int REFERENCES "Style","versionNumber" int,"confirmedDate" text,"confirmedBy" text,"processSnapshot" jsonb,UNIQUE("styleId","versionNumber"));
 INSERT INTO "Style" VALUES(1,10),(2,20); INSERT INTO "StyleProcess" VALUES(101,1,5);`);
 const adapter=client=>({
  $queryRawUnsafe:async(sql,...args)=>(await client.query(sql,args)).rows,
  styleProcessVersion:{
   findFirst:async({where})=>(await client.query('SELECT * FROM "StyleProcessVersion" WHERE "styleId"=$1 AND "orgId"=$2 ORDER BY "versionNumber" DESC LIMIT 1',[where.styleId,where.orgId])).rows[0]||null,
   create:async({data})=>(await client.query('INSERT INTO "StyleProcessVersion"("orgId","styleId","versionNumber","confirmedDate","confirmedBy","processSnapshot") VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[data.orgId,data.styleId,data.versionNumber,data.confirmedDate,data.confirmedBy,JSON.stringify(data.processSnapshot)])).rows[0],
  },
 });
 const input={orgId:10,styleId:1,actor:'actor',date:'2026-10-25',loadSnapshot:async db=>db.$queryRawUnsafe('SELECT id,ct FROM "StyleProcess" WHERE "styleId"=$1 ORDER BY id',1)};
 return {engine,adapter,input};
}

test('versions can be confirmed before any targets exist; duplicate/concurrent confirmations reuse the same version',async()=>{
 const {engine,adapter,input}=await database();try{
  const [first,duplicate]=await Promise.all([engine.transaction(tx=>confirmCurrentProcessVersion(adapter(tx),input)),engine.transaction(tx=>confirmCurrentProcessVersion(adapter(tx),input))]);
  assert.equal(first.id,duplicate.id);assert.equal(first.versionNumber,1);assert.equal((await engine.query('SELECT * FROM "StyleProcessVersion"')).rows.length,1);
  await engine.exec('UPDATE "StyleProcess" SET ct=7 WHERE id=101');
  const next=await engine.transaction(tx=>confirmCurrentProcessVersion(adapter(tx),input));assert.equal(next.versionNumber,2);
  const original=(await engine.query('SELECT "processSnapshot" FROM "StyleProcessVersion" WHERE id=$1',[first.id])).rows[0];assert.equal(original.processSnapshot[0].ct,5);
  await assert.rejects(engine.transaction(tx=>confirmCurrentProcessVersion(adapter(tx),{...input,orgId:99})),/style not found/);
 }finally{await engine.close();}
});

test('style process changes and confirmation roll back together when version storage fails',async()=>{
 const {engine,adapter,input}=await database();try{
  await engine.transaction(tx=>confirmCurrentProcessVersion(adapter(tx),input));
  await assert.rejects(engine.transaction(async tx=>{
   await tx.exec('UPDATE "StyleProcess" SET ct=999 WHERE id=101');
   const db=adapter(tx);db.styleProcessVersion.create=async()=>{throw Error('VERSION_WRITE_FAILED');};
   await confirmCurrentProcessVersion(db,input);
  }),/VERSION_WRITE_FAILED/);
  assert.equal((await engine.query('SELECT ct FROM "StyleProcess" WHERE id=101')).rows[0].ct,5);
  assert.equal((await engine.query('SELECT * FROM "StyleProcessVersion"')).rows.length,1);
 }finally{await engine.close();}
});

test('an empty draft does not create a meaningless first version',async()=>{
 const {engine,adapter,input}=await database();try{
  await engine.exec('DELETE FROM "StyleProcess"');
  assert.equal(await engine.transaction(tx=>confirmCurrentProcessVersion(adapter(tx),input)),null);
  assert.equal((await engine.query('SELECT * FROM "StyleProcessVersion"')).rows.length,0);
 }finally{await engine.close();}
});

test('new assignments use the latest confirmed snapshot without changing existing or locked assignment FKs',async()=>{
 const versions=[{id:1,versionNumber:1,processSnapshot:[{id:101,ct:5}]},{id:2,versionNumber:2,processSnapshot:[{id:101,ct:7}]}];
 let writes=0;
 const {ensureInitialStyleProcessVersion}=loadSourceBindings('backend/src/index.ts',['ensureInitialStyleProcessVersion'],{prisma:{},createHttpError:(status,message)=>Object.assign(Error(message),{status})});
 const db={styleProcessVersion:{findMany:async()=>versions},assignmentPlan:{updateMany:()=>{writes++;throw Error('HISTORICAL_WRITE');}}};
 const selected=await ensureInitialStyleProcessVersion({orgId:10,styleId:1,db});
 assert.equal(selected.id,2);assert.equal(selected.processSnapshot[0].ct,7);assert.equal(writes,0);
 assert.equal((await ensureInitialStyleProcessVersion({orgId:10,styleId:1,db})).id,2);
});

test('first-assignment initialization uses a unique upsert and returns any concurrently confirmed later version',async()=>{
 let upsert;
 const {ensureInitialStyleProcessVersion}=loadSourceBindings('backend/src/index.ts',['ensureInitialStyleProcessVersion'],{prisma:{},loadStyleProcessMirrorMapForStyleIds:async()=>new Map([[1,[{id:101,ct:5}]]]),normalizeStyleProcesses:x=>x,todayDateKey:()=> '2026-10-25',createHttpError:(status,message)=>Object.assign(Error(message),{status})});
 const later={id:2,versionNumber:2,processSnapshot:[{id:101,ct:7}]};
 const db={styleProcessVersion:{findMany:async()=>[],upsert:async args=>{upsert=args;return{id:1};},findFirst:async()=>later}};
 assert.equal((await ensureInitialStyleProcessVersion({orgId:10,styleId:1,db})).id,2);
 assert.deepEqual(upsert.where,{styleId_versionNumber:{styleId:1,versionNumber:1}});assert.deepEqual(upsert.update,{});
});

test('month previews agree with effective-month-first calculation; future and unassigned versions do not apply early',()=>{
 const versions=[{id:1,versionNumber:1},{id:2,versionNumber:2},{id:3,versionNumber:3},{id:4,versionNumber:4}],boundaries={2:'2026-11',3:'2026-09'};
 assert.equal(applicableMonthVersion(versions,boundaries,'2026-08',1).id,1);
 assert.equal(applicableMonthVersion(versions,boundaries,'2026-10',1).id,3);
 assert.equal(applicableMonthVersion(versions,boundaries,'2026-11',1).id,2);
 assert.equal(applicableMonthVersion(versions,{2:'2026-11',3:'2026-11'},'2026-11',1).id,3);
 assert.equal(applicableMonthVersion(versions,{2:'2026-11'},'2026-10'),null);
});

test('future/unassigned rates cannot fall back to the editable master, while a genuine legacy factory retains its baseline',()=>{
 const {resolveFactoryProductionAllowanceRate}=loadSourceBindings('backend/src/payroll/payroll.service.ts',['resolveFactoryProductionAllowanceRate'],{ensureArray:value=>Array.isArray(value)?value:[]});
 assert.ok(Number.isNaN(resolveFactoryProductionAllowanceRate({productionAllowanceRates:[],_count:{productionAllowanceRates:1},wagePerSecond:999})));
 assert.equal(resolveFactoryProductionAllowanceRate({productionAllowanceRates:[{wagePerSecond:12}],_count:{productionAllowanceRates:2},wagePerSecond:999}),12);
 assert.equal(resolveFactoryProductionAllowanceRate({productionAllowanceRates:[],_count:{productionAllowanceRates:0},wagePerSecond:5}),5);
 const source=readFileSync('backend/src/payroll/payroll.service.ts','utf8');assert.equal((source.match(/_count: \{ select: \{ productionAllowanceRates: true \} \}/g)||[]).length,3);
});

test('interactive style create/update and import confirm within the same transaction, not in a later HTTP step',()=>{
 const source=readFileSync('backend/src/index.ts','utf8');
 for(const key of ['createdStyle.id','updatedStyle.id','upserted.id'])assert.match(source,new RegExp('await confirmSavedStyleProcessVersion\\(tx, organization.id, '+key.replace('.','\\.')));
 const confirm=source.slice(source.indexOf('app.post("/styles/:styleId/process-versions/confirm"'),source.indexOf('app.put("/styles/:styleId/process-version-boundaries"'));
 assert.match(confirm,/retryEditTransaction/);assert.doesNotMatch(confirm,/assignmentPlan|at least one|409.*last/);
});

test('confirmed versions protect real process FKs even before the first assignment or work record',async()=>{
 const {engine,adapter,input}=await database();try{
  const original=await engine.transaction(tx=>confirmCurrentProcessVersion(adapter(tx),input));
  const ids=confirmedStyleProcessIds([{processSnapshot:[{styleProcessId:101},{id:102},{id:'not-an-id'},{code:'103'}]}]);
  assert.deepEqual([...ids],[101,102]);
  await engine.exec('ALTER TABLE "StyleProcess" ADD COLUMN "isActive" boolean NOT NULL DEFAULT true');
  const referenced=confirmedStyleProcessIds([original]);assert.ok(referenced.has(101));
  await engine.query('UPDATE "StyleProcess" SET "isActive"=false WHERE id=$1',[101]);
  await engine.exec('CREATE TABLE "LaterAssignment"(id int PRIMARY KEY,"styleProcessId" int REFERENCES "StyleProcess", "versionId" int REFERENCES "StyleProcessVersion")');
  await engine.query('INSERT INTO "LaterAssignment" VALUES(1,$1,$2)',[101,original.id]);
  assert.equal((await engine.query('SELECT * FROM "LaterAssignment"')).rows[0].styleProcessId,101);
  const source=readFileSync('backend/src/index.ts','utf8');const storage=source.slice(source.indexOf('const syncStyleProcessStorageForStyle'),source.indexOf('const ensureStyleProcessStorageForStyles'));
  assert.match(storage,/versionReferencedProcessIds\.has\(row.id\) \|\|/);assert.match(storage,/!versionReferencedProcessIds\.has\(row.id\) &&/);assert.match(storage,/versionReferencedProcessIds\.has\(existingRow.id\)/);
 }finally{await engine.close();}
});
