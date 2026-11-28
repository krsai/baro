import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
import tasks from '../backend/dist/services/taskReports.js';
import requests from '../backend/dist/services/dashboardWorkRequests.js';
import automation from '../backend/dist/services/employeeFeedbackAutomation.js';
import storage from '../backend/dist/services/evidenceStorage.js';
import evidence from '../backend/dist/services/evidenceAttachments.js';
const {createWorkRequest,actWorkRequest,listWorkRequests}=requests;
const {submitTaskReport,taskReportList,runTaskReportWarnings}=tasks;
const gates={canAccess:async()=>true,industryFeatures:async()=>['DASHBOARD','EMPLOYEE_SYSTEM']};
const input=(recipientId,patch={})=>({clientKey:randomUUID(),recipientId,title:'Monthly Task',message:'Prepare The Report.',reportRequired:true,dueAt:'2030-01-02T02:00:00Z',timeZone:'Asia/Ho_Chi_Minh',reportFileRequired:false,automaticWarning:true,warningMessage:'{employee}: {task} Was Not Reported By {deadline}.',...patch});
const submission=(patch={})=>({clientKey:randomUUID(),requirementVersion:1,body:'Work Results',attachmentIds:[],...patch});

test('tasks preserve original parties, require actual recipient reports and freeze submitted report snapshots',async()=>{
 const f=await changeApprovalFixture();try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id,a=s.people.admin.id,b=s.people.junior.id,c=s.people.lead.id;
 const taskInput=input(b),task=await createWorkRequest(db,org,a,taskInput);assert.equal(task.reportRequired,true);assert.ok(task.dueAt);assert.equal((await createWorkRequest(db,org,a,taskInput)).id,task.id);
 await assert.rejects(actWorkRequest(db,org,b,task.id,{action:'COMPLETE',version:1}),/TASK_REPORT_REQUIRED/);
 await assert.rejects(submitTaskReport(db,org,a,task.id,submission()),/RECIPIENT_REQUIRED/);
 await assert.rejects(submitTaskReport(db,org,c,task.id,submission()),/NOT_FOUND/);
 await assert.rejects(submitTaskReport(db,org,b,task.id,submission({body:''})),/REPORT_REQUIRED/);
 await assert.rejects(submitTaskReport(db,org,b,task.id,submission({requirementVersion:99})),/CHANGED/);
 const reportInput=submission(),report=await submitTaskReport(db,org,b,task.id,reportInput,new Date('2030-01-02T01:00:00Z'));
 assert.equal((await submitTaskReport(db,org,b,task.id,reportInput)).id,report.id);
 assert.equal((await listWorkRequests(db,org,a)).rows[0].status,'DONE');
 const view=await taskReportList(db,org,a,task.id);assert.equal(view.reports[0].body,'Work Results');assert.equal(view.reports[0].taskSnapshot.dueAt,'2030-01-02T02:00:00.000Z');
 await assert.rejects(taskReportList(db,org,c,task.id),/NOT_FOUND/);
 await assert.rejects(db.$executeRawUnsafe('UPDATE "WorkTaskReport" SET body=$1 WHERE id=$2','Changed',report.id),/IMMUTABLE/);
 await assert.rejects(db.$executeRawUnsafe('DELETE FROM "WorkTaskReport" WHERE id=$1',report.id),/IMMUTABLE/);
 const otherTask=await createWorkRequest(db,org,a,input(b));
 const updated=await actWorkRequest(db,org,a,otherTask.id,{action:'UPDATE',version:1,title:'Updated Task',message:'Updated Instructions',dueAt:'2030-01-03T02:00:00Z'});
 assert.equal(updated.requirementVersion,2);
 await assert.rejects(submitTaskReport(db,org,b,otherTask.id,submission()),/CHANGED/);
 assert.equal((await db.$queryRawUnsafe('SELECT snapshot FROM "DashboardWorkRequestEvent" WHERE "requestId"=$1 AND action=\'TASK_UPDATE\'',otherTask.id))[0].snapshot.before.dueAt,'2030-01-02T02:00:00.000Z');
 const cancelled=await actWorkRequest(db,org,a,otherTask.id,{action:'CANCEL',version:updated.version,reason:'Scope Changed'});
 assert.ok(cancelled.cancelledAt);await assert.rejects(submitTaskReport(db,org,b,otherTask.id,submission({requirementVersion:2})),/CHANGED/);
 assert.equal((await listWorkRequests(db,org,b,{status:'CANCELLED'})).rows[0].id,otherTask.id);
 await actWorkRequest(db,org,b,otherTask.id,{action:'HIDE',version:cancelled.version});assert.ok(await db.workTaskReport.count());
 }finally{await f.close();}
});

test('optional and required files use actual ready report attachments, private task FKs and atomic audit rollback',async()=>{
 const f=await changeApprovalFixture();try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id,a=s.people.admin.id,b=s.people.junior.id,c=s.people.lead.id;
 const bytes=Buffer.from('%PDF-1.7\nReport\n%%EOF'),fileInput={clientKey:randomUUID(),fileName:'Report.pdf',contentBase64:bytes.toString('base64')};
 const env={EVIDENCE_NAS_COMPANIES_JSON:JSON.stringify({[org]:{baseUrl:'https://nas.example.test/BARO/',username:'baro',password:'test-only'}})};
 const file=await storage.uploadEvidence(db,{orgId:org,actorId:b,purpose:'WORK_REPORT'},fileInput,()=>({write:async()=>{}}),env);
 const row=await createWorkRequest(db,org,a,input(b,{reportFileRequired:true}));
 await assert.rejects(submitTaskReport(db,org,b,row.id,submission()),/FILE_REQUIRED/);
 const report=await submitTaskReport(db,org,b,row.id,submission({body:'',attachmentIds:[fileInput.clientKey]}));assert.ok(report.id);
 assert.equal((await taskReportList(db,org,a,row.id)).reports[0].files[0].path,file.path);
 await assert.rejects(taskReportList(db,org,c,row.id),/NOT_FOUND/);
 const foreign=await storage.uploadEvidence(db,{orgId:org,actorId:a,purpose:'WORK_REPORT'},{...fileInput,clientKey:randomUUID()},()=>({write:async()=>{}}),env);
 const another=await createWorkRequest(db,org,a,input(b));
 await assert.rejects(submitTaskReport(db,org,b,another.id,submission({attachmentIds:[foreign.path.split('/')[2]]})),/FILE_REQUIRED/);
 const failing={...db,$transaction:work=>db.$transaction(tx=>work(new Proxy(tx,{get:(target,key)=>key==='$executeRawUnsafe'?async(sql,...args)=>{if(sql.includes('DashboardWorkRequestEvent'))throw Error('audit unavailable');return target.$executeRawUnsafe(sql,...args);}:Reflect.get(target,key)})))};
 await assert.rejects(submitTaskReport(failing,org,b,another.id,submission({attachmentIds:[fileInput.clientKey]})),/audit unavailable/);
 assert.equal((await db.workTaskReport.findMany({where:{requestId:another.id}})).length,0);assert.equal((await db.dashboardWorkRequest.findUnique({where:{id:another.id}})).status,'OPEN');
 let actorId=c;const routes=new Map();evidence.registerEvidenceAttachmentRoutes({get:(p,fn)=>routes.set('GET '+p,fn),post:()=>{}},db,{requireOrgRole:async()=>({organization:s.company}),actorId:()=>actorId,canAccess:async()=>true});
 const get=routes.get('GET /evidence-attachments/:id/content'),res={setHeader(){},json(){}};
 await assert.rejects(get({params:{id:fileInput.clientKey}},res),/FILE_NOT_FOUND/);
 actorId=a;await assert.rejects(get({params:{id:fileInput.clientKey}},res),/STORAGE_NOT_CONFIGURED/,'actual sender can review; live NAS connection is separate');
 await f.pg.exec(readFileSync('backend/prisma/migrations/20261128050000_task_reports/migration.sql','utf8'));
 assert.equal((await taskReportList(db,org,b,row.id)).reports[0].id,report.id);
 }finally{await f.close();}
});

test('task warnings follow actual deadline and report submission, company activation and one warning per requirement version',async()=>{
 const f=await changeApprovalFixture();try{
 const db=f.db,s=await seedChangeApproval(db),org=s.company.id,a=s.people.admin.id,b=s.people.junior.id;
 const missing=await createWorkRequest(db,org,a,input(b)),timely=await createWorkRequest(db,org,a,input(b)),late=await createWorkRequest(db,org,a,input(b)),cancel=await createWorkRequest(db,org,a,input(b)),extended=await createWorkRequest(db,org,a,input(b));
 await submitTaskReport(db,org,b,timely.id,submission(),new Date('2030-01-02T01:00:00Z'));
 await submitTaskReport(db,org,b,late.id,submission(),new Date('2030-01-02T03:00:00Z'));
 await actWorkRequest(db,org,a,cancel.id,{action:'CANCEL',version:1,reason:'Not Required'});
 await actWorkRequest(db,org,a,extended.id,{action:'UPDATE',version:1,title:extended.title,message:extended.message,dueAt:'2030-01-04T02:00:00Z'});
 await runTaskReportWarnings(db,gates,new Date('2030-01-03T03:00:00Z'));assert.equal(await db.employeeFeedbackDelivery.count(),0,'default off is preserved');
 await automation.saveFeedbackAutomation(db,org,a,{enabled:true,version:0},new Date('2030-01-01T00:00:00Z'));
 const storageHeld=await createWorkRequest(db,org,a,input(b,{reportFileRequired:true}));
 await runTaskReportWarnings(db,gates,new Date('2030-01-03T03:00:00Z'));await runTaskReportWarnings(db,gates,new Date('2030-01-03T03:00:00Z'));
 const letters=await db.employeeFeedbackDelivery.findMany();assert.equal(letters.length,2);assert.deepEqual(letters.map(r=>r.taskId).sort(),[missing.id,late.id].sort());assert.ok(letters.every(r=>r.ruleId===null&&r.employeeId===b));
 const held=(await db.$queryRawUnsafe('SELECT result,"lastError" FROM "WorkTaskReportCheck" WHERE "requestId"=$1',storageHeld.id))[0];assert.equal(held.result,'PENDING');assert.equal(held.lastError,'SYSTEM_ERROR','missing required-file storage must not penalize the employee');
 const received=await automation.listFeedbackInbox(db,org,b);assert.equal(received.rows.length,2);assert.ok(received.rows[0].message.includes('Asia/Ho_Chi_Minh'));
 await submitTaskReport(db,org,b,missing.id,submission(),new Date('2030-01-03T04:00:00Z'));await runTaskReportWarnings(db,gates,new Date('2030-01-03T05:00:00Z'));assert.equal(await db.employeeFeedbackDelivery.count(),2);
 await runTaskReportWarnings(db,gates,new Date('2030-01-05T03:00:00Z'));assert.equal(await db.employeeFeedbackDelivery.count(),3);assert.equal((await db.employeeFeedbackDelivery.findFirst({where:{taskId:extended.id}})).taskRequirementVersion,2);
 }finally{await f.close();}
});
