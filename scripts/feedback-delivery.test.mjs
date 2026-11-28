import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {feedbackDeliveryFixture} from './helpers/feedback-delivery-fixture.mjs';
import automation from '../backend/dist/services/employeeFeedbackAutomation.js';
import feedback from '../backend/dist/services/employeeFeedback.js';
const {saveFeedbackAutomation,runFeedbackAutomation,listFeedbackInbox,readFeedbackDelivery,registerFeedbackAutomationRoutes}=automation;
const {saveEmployeeFeedback}=feedback;
const gates={canAccess:async()=>true,industryFeatures:async()=>['EMPLOYEE_SYSTEM','WORK_HISTORY','BANK_LEDGER','DASHBOARD']};
const activated=new Date('2026-11-25T02:00:00Z'),now=new Date('2026-11-28T03:00:00Z');
async function rule(f,id='rule-auto-001',kind='WARNING',task='WORK_LOG_ENTRY',threshold=1){
 const row=await saveEmployeeFeedback(f.db,1,1,'rules',id,{version:0,employeeId:2,factoryId:task==='WORK_LOG_ENTRY'?1:null,definition:{name:`${kind} ${task}`,kind,task,timeZone:'Asia/Ho_Chi_Minh',effectiveFrom:'2026-04-01',dueAfterDays:1,deadlineTime:'09:00',threshold,weekdays:[0,1,2,3,4,5,6],message:'{employee}: {workDate}, {count}, {deadline}',automaticDelivery:true}});
 await f.pg.query('UPDATE "EmployeeFeedbackRule" SET "armedAt"=$1 WHERE id=$2',[activated,id]);return row;
}
async function enable(f,at=activated){return saveFeedbackAutomation(f.db,1,1,{enabled:true,version:0},at);}
async function sourceLog(f,date='2026-11-26',createdAt='2026-11-26T05:00:00Z',id=10,reviews=true){
 await f.pg.query('INSERT INTO "WorkLog"(id,"orgId","factoryId","workDate","coverageStartDate","coverageEndDate","createdAt","createdByEmployeeId") VALUES($1,1,1,$2,$2,$2,$3,2)',[id,date,createdAt]);
 if(reviews)await f.pg.query('INSERT INTO "WorkLogWorkerReview" VALUES($1,1,2,false)',[id]);
}
test('all delivery is off by default; enabling starts after activation and never backfills old days',async()=>{
 const f=await feedbackDeliveryFixture();try{
 await rule(f);assert.equal(await runFeedbackAutomation(f.db,gates,now),0);assert.deepEqual((await listFeedbackInbox(f.db,1,2)).rows,[]);
 await enable(f,new Date('2026-11-27T03:00:00Z'));await runFeedbackAutomation(f.db,gates,now);assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,0);
 await runFeedbackAutomation(f.db,gates,new Date('2026-11-29T03:00:00Z'));
 const received=(await listFeedbackInbox(f.db,1,2)).rows;assert.equal(received.length,1);assert.equal(received[0].periodEndDate,'2026-11-28');
 await runFeedbackAutomation(f.db,gates,new Date('2026-11-29T03:00:00Z'));assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,1);
 await saveFeedbackAutomation(f.db,1,1,{enabled:false,version:1});await runFeedbackAutomation(f.db,gates,new Date('2026-12-01T03:00:00Z'));assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,1);
 }finally{await f.close();}
});
test('automatic warnings reach only the assigned employee, are idempotent, readable by that employee and immutable',async()=>{
 const f=await feedbackDeliveryFixture();try{
 await rule(f);await enable(f);await runFeedbackAutomation(f.db,gates,now);await runFeedbackAutomation(f.db,gates,now);
 const received=(await listFeedbackInbox(f.db,1,2)).rows;assert.equal(received.length,2);assert.ok(received.every(row=>row.kind==='WARNING'&&row.message.includes('Worker One')));
 assert.equal((await listFeedbackInbox(f.db,1,5)).rows.length,0);assert.equal((await listFeedbackInbox(f.db,2,3)).rows.length,0);
 assert.equal((await listFeedbackInbox(f.db,1,1,0,true)).rows.length,2);
 assert.ok(!JSON.stringify(received).includes('ruleSnapshot'));assert.ok(!JSON.stringify(received).includes('sourceIds'));
 const receipt=await readFeedbackDelivery(f.db,1,2,received[0].id);assert.ok(receipt.readAt);assert.equal(String((await readFeedbackDelivery(f.db,1,2,received[0].id)).readAt),String(receipt.readAt));
 await assert.rejects(readFeedbackDelivery(f.db,1,5,received[0].id),/NOT_FOUND/);await assert.rejects(readFeedbackDelivery(f.db,2,3,received[0].id),/NOT_FOUND/);
 await assert.rejects(f.pg.query('UPDATE "EmployeeFeedbackDelivery" SET message=$1 WHERE id=$2',['changed',received[0].id]),/IMMUTABLE/);
 await assert.rejects(f.pg.query('DELETE FROM "EmployeeFeedbackDelivery" WHERE id=$1',[received[0].id]),/IMMUTABLE/);
 await f.pg.query(`UPDATE "EmployeeFeedbackRule" SET definition=jsonb_set(definition,'{message}','"New Wording"') WHERE id='rule-auto-001'`);
 assert.equal((await listFeedbackInbox(f.db,1,2)).rows[0].message,received[0].message);
 await f.pg.exec(readFileSync('backend/prisma/migrations/20261128040000_employee_feedback_delivery/migration.sql','utf8'));
 assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,2);
 }finally{await f.close();}
});
test('praise uses actual first input and actor FK; partial sources stay pending without penalizing the employee',async()=>{
 const f=await feedbackDeliveryFixture();try{
 await rule(f,'rule-praise-01','PRAISE');await enable(f);await sourceLog(f);await sourceLog(f,'2026-11-27','2026-11-27T05:00:00Z',11,false);
 await runFeedbackAutomation(f.db,gates,now);
 assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,1);
 const pending=(await f.pg.query('SELECT * FROM "EmployeeFeedbackRun"')).rows[0];assert.equal(pending.lastWorkDate,'2026-11-26');assert.equal(pending.lastError,'SOURCE_UNCONFIRMED');
 await f.pg.exec('INSERT INTO "WorkLogWorkerReview" VALUES(11,1,2,false)');await runFeedbackAutomation(f.db,gates,now);
 assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,2);
 await f.pg.exec('UPDATE "WorkLog" SET "createdByEmployeeId"=1 WHERE id=11');await runFeedbackAutomation(f.db,gates,now);assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,2,'received snapshots are not recalculated');
 }finally{await f.close();}
});
test('company holidays and approved personal leave are excluded and occurrence thresholds accumulate correctly',async()=>{
 const f=await feedbackDeliveryFixture();try{
 await rule(f,'rule-threshold','WARNING','WORK_LOG_ENTRY',2);await enable(f);
 await f.pg.exec(`INSERT INTO "OrganizationHoliday" VALUES(1,'2026-11-26');INSERT INTO "WorkTimeRequest" VALUES('leave',1,2,'APPROVED','ANNUAL');INSERT INTO "WorkTimeDay" VALUES('leave',1,'2026-11-27')`);
 await runFeedbackAutomation(f.db,gates,now);assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,0);
 await runFeedbackAutomation(f.db,gates,new Date('2026-11-30T03:00:00Z'));
 const rows=(await listFeedbackInbox(f.db,1,2)).rows;assert.equal(rows.length,1);assert.equal(rows[0].periodStartDate,'2026-11-28');assert.equal(rows[0].periodEndDate,'2026-11-29');
 }finally{await f.close();}
});
test('source failure and permission revocation hold pending work and recover without duplicate delivery',async()=>{
 const f=await feedbackDeliveryFixture();try{
 await rule(f);await enable(f);await f.pg.exec('ALTER TABLE "WorkLog" RENAME TO "UnavailableWorkLog"');await runFeedbackAutomation(f.db,gates,now);
 assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,0);assert.equal((await f.pg.query('SELECT "lastError" FROM "EmployeeFeedbackRun"')).rows[0].lastError,'SYSTEM_ERROR');
 await f.pg.exec('ALTER TABLE "UnavailableWorkLog" RENAME TO "WorkLog"');await runFeedbackAutomation(f.db,{...gates,canAccess:async()=>false},now);assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,0);
 await runFeedbackAutomation(f.db,gates,now);assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,2);
 await f.pg.exec(`UPDATE "Employee" SET status='SUSPENDED' WHERE id=2`);await runFeedbackAutomation(f.db,gates,new Date('2026-11-29T03:00:00Z'));assert.equal((await listFeedbackInbox(f.db,1,1,0,true)).rows.length,2);
 }finally{await f.close();}
});
test('ledger checks distinguish first input from approval delay, use actual requester and document FKs and do not infer missing transactions',async()=>{
 const f=await feedbackDeliveryFixture();try{
 await rule(f,'rule-ledger-w','WARNING','LEDGER_ENTRY');await rule(f,'rule-ledger-p','PRAISE','LEDGER_ENTRY');await enable(f);
 await runFeedbackAutomation(f.db,gates,now);assert.equal((await listFeedbackInbox(f.db,1,2)).rows.length,0);
 for(const [id,createdAt,appliedAt] of [['timely','2026-11-26T05:00:00Z','2026-11-28T01:00:00Z'],['late','2026-11-27T05:00:00Z','2026-11-28T02:00:00Z']]){
  await f.pg.query(`INSERT INTO "ChangeApprovalRequest" VALUES($1,1,2,'BANK_LEDGER','CREATE','APPROVED',$2,$3,$4::jsonb)`,[id,appliedAt,createdAt,JSON.stringify({rows:[{transactionDate:'2026-11-26',amount:'secret'}]})]);
  await f.pg.query(`INSERT INTO "BankLedgerDocument" VALUES($1,1,$2,'2026-11-26')`,['doc-'+id,id]);
 }
 await runFeedbackAutomation(f.db,gates,now);await runFeedbackAutomation(f.db,gates,now);
 const received=(await listFeedbackInbox(f.db,1,2)).rows;assert.equal(received.length,2);assert.deepEqual(received.map(row=>row.kind).sort(),['PRAISE','WARNING']);assert.ok(!JSON.stringify(received).includes('secret'));
 }finally{await f.close();}
});
test('inbox routes use the authenticated employee instead of caller employee IDs and keep settings admin-only',async()=>{
 const routes=[],app={get:(path,fn)=>routes.push({method:'GET',path,fn}),put:(path,fn)=>routes.push({method:'PUT',path,fn}),post:(path,fn)=>routes.push({method:'POST',path,fn})};
 const f=await feedbackDeliveryFixture();try{
 await rule(f);await enable(f);await runFeedbackAutomation(f.db,gates,now);let actorId=5,result;
 registerFeedbackAutomationRoutes(app,f.db,{...gates,actorId:()=>actorId,requireOrgRole:async(_req,_res,options)=>{assert.equal(options.allowSystemAdmin,false);return {organization:{id:1,type:'MANUFACTURER'}};}});
 const res={setHeader:()=>{},json:value=>{result=value;}};
 await routes.find(row=>row.path==='/employee-feedback/inbox').fn({query:{employeeId:2}},res);assert.equal(result.rows.length,0);
 await assert.rejects(routes.find(row=>row.path==='/employee-feedback/automation').fn({body:{enabled:true,version:1}},res),/ACCESS_DENIED/);
 actorId=2;await routes.find(row=>row.path==='/employee-feedback/inbox').fn({query:{employeeId:5}},res);assert.equal(result.rows.length,2);
 }finally{await f.close();}
});
