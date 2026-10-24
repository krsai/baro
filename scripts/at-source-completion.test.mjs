import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import eligibility from '../backend/dist/services/atTrainingEligibility.js';
import jobs from '../backend/dist/services/atSyncJob.js';
import deletion from '../backend/dist/services/styleDeletion.js';
import {waitForAtSyncJob} from '../frontend/src/utils/atSyncJob.mjs';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('../backend/node_modules/typescript');
const backendSource=fs.readFileSync('backend/src/index.ts','utf8');
const loadFunction=(name,next,deps)=>new Function(...Object.keys(deps),ts.transpileModule(
  backendSource.slice(backendSource.indexOf(`const ${name} =`),backendSource.indexOf(`const ${next} =`)),
  {compilerOptions:{target:ts.ScriptTarget.ES2022}},
).outputText+`;return ${name};`)(...Object.values(deps));
const {loadCompletedAtFactoryMonths,completedAtFactoryMonths,completedAtBucketSql,atSourceSignature}=eligibility;
const policy={workWeekdays:[1,2,3,4,5,6]};
const base={factoryId:1,monthKey:'2026-09',workThrough:'2026-09-30',attendanceThrough:'2026-09-30',invalidAttendanceCount:0};
const complete=rows=>completedAtFactoryMonths({rows,factories:[{id:1,startDate:'2026-04-01'}],currentMonth:'2026-10',holidays:[],policy});

test('factory/month completion does not demand attendance for every employee/day',()=>{
  assert.equal(complete([base]).length,1);
  for(const patch of [{attendanceThrough:'2026-09-29'},{workThrough:'2026-09-29'},{invalidAttendanceCount:1},{factoryId:2},{monthKey:'2026-10'}])assert.equal(complete([{...base,...patch}]).length,0);
});
test('month-end weekends and holidays use the final scheduled workday',()=>{
  assert.equal(complete([{...base,monthKey:'2026-05',workThrough:'2026-05-30',attendanceThrough:'2026-05-30'}]).length,1);
  assert.equal(completedAtFactoryMonths({rows:[{...base,workThrough:'2026-09-29',attendanceThrough:'2026-09-29'}],factories:[{id:1,startDate:'2026-09-15'}],currentMonth:'2026-10',holidays:['2026-09-30'],policy})[0].startDate,'2026-09-15');
});

test('source changes reactivate status and rebuild an older completed month, not incomplete months',async()=>{
  const {Prisma}=require('../backend/node_modules/@prisma/client');
  const scopes=[...complete([{...base,monthKey:'2026-08',workThrough:'2026-08-31',attendanceThrough:'2026-08-31'}]),...complete([base])];
  const value={version:eligibility.AT_SOURCE_POLICY_VERSION,sourceSignature:atSourceSignature(scopes),reason:'done'};
  const rebuilt=[];
  const db={systemSetting:{findUnique:async()=>({value})},$queryRaw:async()=>[{
    source_month_count:scopes.length,stale_month_count:0,source_work_log_count:2,source_work_record_count:2,bucket_count:2,resettable_item_count:2,
  }],$transaction:async fn=>fn({})};
  const status=loadFunction('buildAtSyncStatusForOrg','resetAtTrainingStateForOrg',{
    Prisma,prisma:db,resolveAtSyncTrainingMonthKey:()=> '2026-09',loadCompletedAtFactoryMonths:async()=>scopes,
    completedAtSourceSql:eligibility.completedAtSourceSql,completedAtBucketSql,AT_V2_MODEL_VERSION:'v2',
    AT_SOURCE_POLICY_VERSION:eligibility.AT_SOURCE_POLICY_VERSION,atSourceSignature,
  });
  assert.equal((await status(1)).needsUpdate,false);
  // Older source content changes even when aggregate maximum timestamps do not.
  scopes[0]={...scopes[0],sourceRevision:'late-actual-attendance'};
  assert.equal((await status(1)).needsUpdate,true);
  const backfill=loadFunction('ensureHistoricalAtTrainingBucketsForOrg','loadAtTrainingDataFromBuckets',{
    prisma:db,normalizeMonthKey:key=>key,loadCompletedAtFactoryMonths:async()=>scopes,
    AT_SOURCE_POLICY_VERSION:eligibility.AT_SOURCE_POLICY_VERSION,atSourceSignature,
    collectRawAtTrainingMonthKeysForOrg:async()=>['2026-07','2026-08','2026-09'],
    collectStoredAtTrainingMonthKeysForOrg:async()=>['2026-08','2026-09'],
    collectStaleStoredAtTrainingMonthKeysForOrg:async()=>[],ensureArray:value=>value,
    syncAtTrainingBucketsForMonth:async({trainingMonthKey})=>rebuilt.push(trainingMonthKey),
  });
  assert.deepEqual(await backfill({orgId:1,maxMonthKey:'2026-09',excludeMonthKeys:['2026-09']}),['2026-08']);
  assert.deepEqual(rebuilt,['2026-08']);
  value.sourceSignature=atSourceSignature(scopes);
  assert.equal((await status(1)).needsUpdate,false);
  scopes[0]={...scopes[0],sourceRevision:'late-work-record'};
  assert.equal((await status(1)).needsUpdate,true);
  scopes.splice(0);
  assert.equal((await status(1)).needsUpdate,false,'old AT values must not enable training without a completed source month');
});

test('real SQL excludes incomplete factories, current months and foreign organizations; old buckets are gated too',async()=>{
  const sql=new PGlite();try{
    await sql.exec(`CREATE TABLE "Factory"(id INT PRIMARY KEY,"orgId" INT,"managementStartDate" TEXT);
      CREATE TABLE "WorkLog"(id INT PRIMARY KEY,"orgId" INT,"factoryId" INT,"workDate" TEXT,"coverageEndDate" TEXT,"recordKind" TEXT,"updatedAt" TIMESTAMP DEFAULT NOW());
      CREATE TABLE "WorkRecord"(id INT PRIMARY KEY,"workLogId" INT,quantity INT,"assignmentPlanId" INT,"updatedAt" TIMESTAMP DEFAULT NOW());
      CREATE TABLE "AttendanceEntry"(id INT PRIMARY KEY,"orgId" INT,"factoryId" INT,"workerId" INT,"workDate" TEXT,"workedSeconds" INT,"managementExcluded" BOOLEAN DEFAULT FALSE,"updatedAt" TIMESTAMP DEFAULT NOW());
      CREATE TABLE "AtTrainingBucket"(id INT,"orgId" INT,"factoryId" INT,"monthKey" TEXT,"workDate" TEXT);
      INSERT INTO "Factory" VALUES(1,1,'2026-04-01'),(2,1,'2026-04-01'),(3,2,'2026-04-01');
      INSERT INTO "WorkLog"(id,"orgId","factoryId","workDate","coverageEndDate","recordKind") VALUES(1,1,1,'2026-09-30','2026-09-30','EMPLOYEE'),(2,1,2,'2026-09-30','2026-09-30','EMPLOYEE'),(3,1,1,'2026-10-31','2026-10-31','EMPLOYEE'),(4,2,3,'2026-09-30','2026-09-30','EMPLOYEE');
      INSERT INTO "WorkRecord"(id,"workLogId",quantity,"assignmentPlanId") VALUES(1,1,10,1),(2,1,20,1),(3,2,10,2),(4,3,10,3),(5,4,10,4);
      INSERT INTO "AttendanceEntry"(id,"orgId","factoryId","workerId","workDate","workedSeconds") VALUES(1,1,1,10,'2026-09-30',28800),(2,1,2,20,'2026-09-15',28800),(3,1,1,10,'2026-10-31',28800),(4,2,3,30,'2026-09-30',28800);
      INSERT INTO "AtTrainingBucket" VALUES(1,1,1,'2026-09','2026-09-30'),(2,1,2,'2026-09','2026-09-30'),(3,1,1,'2026-10','2026-10-31');`);
    const db={
      $queryRaw:async q=>(await sql.query(q.text,q.values)).rows,
      factory:{findMany:async({where})=>(await sql.query('SELECT * FROM "Factory" WHERE "orgId"=$1',[where.orgId])).rows},
      organizationHoliday:{findMany:async()=>[]},employeePayTypePolicy:{findMany:async()=>[]},
    };
    const scopes=await loadCompletedAtFactoryMonths(db,1,'2026-10',new Date('2026-10-19T00:00:00Z'));
    assert.deepEqual(scopes.map(s=>[s.factoryId,s.monthKey]),[[1,'2026-09']]);
    const where=completedAtBucketSql(scopes,'b');
    assert.deepEqual((await sql.query(`SELECT id FROM "AtTrainingBucket" b WHERE ${where.text}`,where.values)).rows.map(r=>r.id),[1]);
    const oldSignature=atSourceSignature(scopes);
    await sql.exec('UPDATE "WorkRecord" SET quantity=30 WHERE id=1');
    const changedWork=await loadCompletedAtFactoryMonths(db,1,'2026-10',new Date('2026-10-19T00:00:00Z'));
    assert.notEqual(atSourceSignature(changedWork),oldSignature,'content correction must invalidate AT even without a newer aggregate timestamp');
    await sql.exec('UPDATE "AttendanceEntry" SET "workedSeconds"=32000 WHERE id=1');
    const changedAttendance=await loadCompletedAtFactoryMonths(db,1,'2026-10',new Date('2026-10-19T00:00:00Z'));
    assert.notEqual(atSourceSignature(changedAttendance),atSourceSignature(changedWork));
    await sql.exec('DELETE FROM "AttendanceEntry" WHERE id=1');
    const after=await loadCompletedAtFactoryMonths(db,1,'2026-10',new Date('2026-10-19T00:00:00Z'));
    assert.equal(after.length,0);assert.notEqual(atSourceSignature(after),oldSignature);
  }finally{await sql.close();}
});

test('style deletion accounts for production history, orders, assignments and retained raw training sources',()=>{
  assert.equal(deletion.styleDeletionState().canDelete,false);
  assert.equal(deletion.styleDeletionState({}).canDelete,true);
  for(const field of Object.keys(deletion.STYLE_DELETION_COUNTS))assert.equal(deletion.styleDeletionState({[field]:1}).canDelete,false,field);
  // Retained source relations on inactive processes must also block deletion;
  // an AT number or a shared prediction is not evidence of this style's work.
  assert.equal(deletion.styleDeletionState({styleProcesses:1}).deleteBlockedReason,'TRAINING_SOURCE');
  assert.deepEqual(deletion.STYLE_DELETION_COUNTS.styleProcesses.where.OR.map(filter=>Object.keys(filter)[0]),
    ['workRecords','outsourcedWorkRecords','trainingBuckets','atObservations']);
});

test('AT background jobs are durable, deduplicated per org, isolated and report completion',async()=>{
  const sql=new PGlite();try{
    await sql.exec('CREATE TABLE "SystemSetting"(key TEXT PRIMARY KEY,value JSONB,"updatedAt" TIMESTAMP DEFAULT NOW())');
    const adapter=s=>({
      $queryRawUnsafe:async(q,...a)=>(await s.query(q,a)).rows,
      $executeRawUnsafe:async(q,...a)=>s.query(q,a),
      systemSetting:{findUnique:async({where})=>(await s.query('SELECT * FROM "SystemSetting" WHERE key=$1',[where.key])).rows[0],upsert:async({where,create,update})=>s.query('INSERT INTO "SystemSetting"(key,value) VALUES($1,$2::jsonb) ON CONFLICT(key) DO UPDATE SET value=$3::jsonb',[where.key,JSON.stringify(create.value),JSON.stringify(update.value)])},
    });
    const db={...adapter(sql),$transaction:fn=>sql.transaction(s=>fn(adapter(s)))};
    let done,calls=0;const task=()=>{calls++;return new Promise(resolve=>{done=resolve;});};
    const first=await jobs.startAtSyncJob(db,1,task);
    const duplicate=await jobs.startAtSyncJob(db,1,task);assert.equal(duplicate.jobId,first.jobId);
    await new Promise(setImmediate);assert.equal(calls,1);
    await assert.rejects(jobs.getAtSyncJob(db,2,first.jobId),/NOT_FOUND/);
    await assert.rejects(jobs.assertNoAtSyncJob(db,1),/ALREADY_RUNNING/);
    done({reason:'done',updatedProcesses:3});
    const result=await waitForAtSyncJob(first,id=>jobs.getAtSyncJob(db,1,id),{sleep:()=>new Promise(setImmediate)});
    assert.equal(result.updatedProcesses,3);
    await sql.query('UPDATE "SystemSetting" SET value=$1::jsonb',[JSON.stringify({...first,heartbeatAt:'2000-01-01T00:00:00Z'})]);
    assert.equal((await jobs.getAtSyncJob(db,1,first.jobId)).status,'FAILED');
  }finally{await sql.close();}
});

test('polling handles transient failures and propagates failed jobs rather than reporting success',async()=>{
  let attempt=0;
  assert.equal((await waitForAtSyncJob({jobId:'1',status:'RUNNING'},async()=>{if(++attempt===1)throw Error('network');return {status:'SUCCEEDED',result:{ok:true}};},{sleep:async()=>{}})).ok,true);
  await assert.rejects(waitForAtSyncJob({jobId:'2',status:'FAILED',error:'INTERRUPTED'},async()=>{}),/INTERRUPTED/);
});
