import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {retryAssignmentProgress}=require('../backend/dist/services/assignmentProgressRetry');
const sql=readFileSync('backend/prisma/migrations/20261126010000_assignment_progress_retry/migration.sql','utf8');
async function fixture(){
 const pg=new PGlite();
 await pg.exec(`CREATE TABLE "AssignmentPlan"(id integer PRIMARY KEY,"orgId" integer NOT NULL,UNIQUE(id,"orgId"));
 CREATE TABLE "WorkRecord"(id integer PRIMARY KEY,"assignmentPlanId" integer,"orgId" integer,quantity integer);
 CREATE TABLE "OutsourcedWorkRecord"(LIKE "WorkRecord" INCLUDING ALL);
 INSERT INTO "AssignmentPlan" VALUES(1,10),(2,10),(3,20);`);
 await pg.exec(sql); await pg.exec(sql);
 let activeTx;
 const db={
  $queryRawUnsafe:async(query,...params)=>(await pg.query(query,params)).rows,
  $executeRawUnsafe:async(query,...params)=>(await pg.query(query,params)).affectedRows,
 };
 db.$transaction=async run=>pg.transaction(async tx=>{activeTx=tx;try{return await run({
  $queryRawUnsafe:async(query,...params)=>(await tx.query(query,params)).rows,
  $executeRawUnsafe:async(query,...params)=>(await tx.query(query,params)).affectedRows,
 });}finally{activeTx=null;}});
 return {pg,db,duringSync:sql=>activeTx.exec(sql),rows:async()=>(await pg.query('SELECT *, revision::text AS rev,"syncedRevision"::text AS synced FROM "AssignmentProgressSync" ORDER BY "assignmentPlanId"')).rows};
}
test('migration is retry safe, queues both canonical record types atomically and enforces actual company FK',async()=>{
 const {pg,rows}=await fixture();try{
  assert.deepEqual(await rows(),[]);
  await assert.rejects(pg.exec('BEGIN; INSERT INTO "WorkRecord" VALUES(1,1,10,5); SELECT 1/0; COMMIT;'));await pg.exec('ROLLBACK;');assert.deepEqual(await rows(),[]);
  await assert.rejects(pg.exec('INSERT INTO "WorkRecord" VALUES(2,1,20,5)'),/foreign key/);assert.deepEqual(await rows(),[]);
  await pg.exec('INSERT INTO "WorkRecord" VALUES(1,1,10,5); INSERT INTO "OutsourcedWorkRecord" VALUES(1,1,10,7);');assert.equal((await rows())[0].rev,'2');
  await pg.exec('UPDATE "WorkRecord" SET "assignmentPlanId"=2; DELETE FROM "OutsourcedWorkRecord";');
  assert.deepEqual((await rows()).map(row=>[row.assignmentPlanId,row.rev]),[[1,'4'],[2,'1']]);
 }finally{await pg.close();}
});
test('failure survives restart, backs off, retries current records and acknowledges only the processed revision',async()=>{
 const {pg,db,rows}=await fixture();try{
  await pg.exec('INSERT INTO "WorkRecord" VALUES(1,1,10,5),(2,3,20,9);');
  const calls=[];
  await retryAssignmentProgress(db,async(org,ids)=>{calls.push([org,ids]);throw Error('private details');});
  assert.equal(calls.length,2);assert.equal((await rows())[0].synced,'0');assert.equal((await rows())[0].attempts,1);assert.equal((await rows())[0].lastError,'ASSIGNMENT_PROGRESS_SYNC_FAILED');
  assert.equal(await retryAssignmentProgress(db,async()=>assert.fail('backoff')),0);
  await pg.exec('UPDATE "AssignmentProgressSync" SET "nextAttemptAt"=now();');
  const quantities=(await pg.query('SELECT * FROM "WorkRecord"')).rows;
  const values=[];await retryAssignmentProgress(db,async(org,ids)=>{values.push([org,ids[0],quantities.find(row=>row.assignmentPlanId===ids[0]&&row.orgId===org).quantity]);});
  assert.deepEqual(values,[[10,1,5],[20,3,9]]);assert.ok((await rows()).every(row=>row.rev===row.synced&&row.lastError===null));
  await pg.exec('UPDATE "WorkRecord" SET quantity=11 WHERE id=1;');
  await retryAssignmentProgress(db,async()=>{},1);assert.equal((await rows())[0].synced,'2');
  assert.equal(await retryAssignmentProgress(db,async()=>assert.fail('already acknowledged')),0);
 }finally{await pg.close();}
});
test('runtime and deploy register the additive migration and read-only schema checks',()=>{
 const runner=readFileSync('backend/scripts/migrate-entity-profiles.js','utf8');assert.ok(runner.includes('20261126010000_assignment_progress_retry'));
 for(const file of ['backend/src/index.ts','backend/scripts/railway-schema-preflight.js'])assert.ok(readFileSync(file,'utf8').includes('AssignmentProgressSync'));
 assert.ok(readFileSync('backend/src/index.ts','utf8').includes('startAssignmentProgressRetry(prisma'));
});
test('overlapping worker invocations acknowledge a pending revision once',async()=>{
 const {pg,db,rows}=await fixture();try{
  await pg.exec('INSERT INTO "WorkRecord" VALUES(1,1,10,5);');
  let enter,release,calls=0;const entered=new Promise(resolve=>enter=resolve),gate=new Promise(resolve=>release=resolve);
  const sync=async()=>{calls++;enter();await gate;};
  const first=retryAssignmentProgress(db,sync,1);await entered;
  const second=retryAssignmentProgress(db,sync,1);release();
  assert.deepEqual(await Promise.all([first,second]),[1,0]);assert.equal(calls,1);assert.equal((await rows())[0].synced,'1');
 }finally{await pg.close();}
});
test('request-side processing is scoped and newer revisions remain pending until recomputed',async()=>{
 const {pg,db,rows,duringSync}=await fixture();try{
  await pg.exec('INSERT INTO "WorkRecord" VALUES(1,1,10,5),(2,3,20,9);');
  const calls=[];
  await retryAssignmentProgress(db,async(org,ids)=>{calls.push([org,...ids]);await duringSync('UPDATE "WorkRecord" SET quantity=12 WHERE id=1;');},1,{orgId:10,planIds:[1]});
  assert.deepEqual(calls,[[10,1]]);assert.deepEqual((await rows()).map(row=>[row.rev,row.synced]),[['2','1'],['1','0']]);
  await retryAssignmentProgress(db,async(org,ids)=>calls.push([org,...ids]),20,{orgId:10,planIds:[1]});
  assert.deepEqual(calls,[[10,1],[10,1]]);assert.equal((await rows())[1].synced,'0','foreign company untouched by request');
  assert.equal(await retryAssignmentProgress(db,async()=>assert.fail('empty target'),20,{orgId:10,planIds:[]}),0);
  await retryAssignmentProgress(db,async(org,ids)=>calls.push([org,...ids]));assert.deepEqual(calls.at(-1),[20,3]);
 }finally{await pg.close();}
});
test('a failed older revision cannot delay a new canonical mutation',async()=>{
 const {pg,db,rows,duringSync}=await fixture();try{
  await pg.exec('INSERT INTO "WorkRecord" VALUES(1,1,10,5);');
  await retryAssignmentProgress(db,async()=>{await duringSync('UPDATE "WorkRecord" SET quantity=8 WHERE id=1;');throw Error('old computation failed');},1);
  const [pending]=await rows();assert.equal(pending.rev,'2');assert.equal(pending.synced,'0');assert.equal(pending.attempts,0);
  assert.equal(await retryAssignmentProgress(db,async()=>{},1),1,'new mutation remains immediately eligible');assert.equal((await rows())[0].synced,'2');
 }finally{await pg.close();}
});
