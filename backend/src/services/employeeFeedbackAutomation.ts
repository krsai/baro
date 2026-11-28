import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {toDateKeyInTimeZone} from '../utils/atTrainingMonthKey';
import {loadManagementPeriod} from '../factories/factoryManagementStart';
import {feedbackRuleInput} from './employeeFeedback';

const fail=(status:number,message:string):never=>{throw createHttpError(status,message);};
const shift=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const day=(value:any,zone:string)=>toDateKeyInTimeZone(value,zone)||'';
export const feedbackDeadline=(date:string,rule:any)=>new Date(`${shift(date,rule.dueAfterDays)}T${rule.deadlineTime}:00${rule.timeZone==='Asia/Seoul'?'+09:00':'+07:00'}`);
async function person(db:any,orgId:number,id:number,admin=false){
 const row=(await db.$queryRawUnsafe(`SELECT e.id,e.name,e."orgRole"::text AS role,e."joinedAt",e."leftAt",o.type::text AS "orgType" FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE e.id=$1 AND e."orgId"=$2 AND e.status='ACTIVE' AND o."isActive" AND o."ownerOrgId" IS NULL FOR SHARE OF e,o`,id,orgId))[0];
 if(!row||admin&&row.role!=='ADMIN')fail(403,'FEEDBACK_ACCESS_DENIED');return row;
}
async function allowed(db:any,gates:any,orgId:number,p:any,feature:string){
 return await gates.canAccess({orgType:p.orgType,orgRole:p.role,feature})&&(await gates.industryFeatures(db,orgId,p.orgType)).includes(feature);
}
export async function saveFeedbackAutomation(db:any,orgId:number,actorId:number,input:any,now=new Date()){
 if(typeof input?.enabled!=='boolean'||!Number.isSafeInteger(input.version)||input.version<0)fail(400,'FEEDBACK_INVALID');
 return retryEditTransaction(db,async(tx:any)=>{
  await person(tx,orgId,actorId,true);
  await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text',`feedback-policy:${orgId}`);
  const before=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackAutomation" WHERE "orgId"=$1 FOR UPDATE',orgId))[0];
  if(before?.enabled===input.enabled)return before;
  if((before?.version||0)!==input.version)fail(409,'FEEDBACK_CHANGED');
  const row=(await tx.$queryRawUnsafe(`INSERT INTO "EmployeeFeedbackAutomation"("orgId",enabled,"actorId","enabledFrom") VALUES($1,$2,$3,$4) ON CONFLICT("orgId") DO UPDATE SET enabled=$2,"actorId"=$3,"enabledFrom"=$4,version="EmployeeFeedbackAutomation".version+1 RETURNING *`,orgId,input.enabled,actorId,input.enabled?now:null))[0];
  await tx.$executeRawUnsafe('INSERT INTO "EmployeeFeedbackAutomationEvent"("orgId",version,"actorId",enabled) VALUES($1,$2,$3,$4)',orgId,row.version,actorId,row.enabled);
  return row;
 });
}

// Calendar exclusions are authoritative source reads, never inferred from a
// missing production or ledger row. Any failed read holds the rule for retry.
async function excluded(db:any,orgId:number,employeeId:number,date:string,rule:any,p:any){
 if(!rule.weekdays.includes(new Date(date+'T00:00:00Z').getUTCDay())||p.joinedAt&&day(p.joinedAt,rule.timeZone)>date||p.leftAt&&day(p.leftAt,rule.timeZone)<date)return true;
 const rows=await db.$queryRawUnsafe(`SELECT 1 AS found FROM "OrganizationHoliday" WHERE "orgId"=$1 AND "holidayDate"=$3
 UNION ALL SELECT 1 FROM "EmployeeLeaveDay" WHERE "orgId"=$1 AND "employeeId"=$2 AND "leaveDate"=$3 AND "cancelledAt" IS NULL
 UNION ALL SELECT 1 FROM "WorkTimeDay" d JOIN "WorkTimeRequest" r ON r.id=d."requestId" AND r."orgId"=d."orgId" WHERE d."orgId"=$1 AND r."employeeId"=$2 AND d."workDate"=$3 AND r.status='APPROVED' AND r.kind IN ('ANNUAL','ANNUAL_AM','ANNUAL_PM','PAID','UNPAID') LIMIT 1`,orgId,employeeId,date);
 return rows.length>0;
}
export async function workLogFeedbackEvidence(db:any,orgId:number,ruleRow:any,date:string){
 const rows=await db.$queryRawUnsafe(`SELECT w.id,w."createdAt",w."createdByEmployeeId",(SELECT count(*)::int FROM "WorkLogWorkerReview" v WHERE v."workLogId"=w.id AND v."orgId"=w."orgId") AS reviews FROM "WorkLog" w WHERE w."orgId"=$1 AND w."factoryId"=$2 AND w."recordKind"='EMPLOYEE' AND w."workDate"=$3 AND COALESCE(w."coverageStartDate",w."workDate")=$3 AND COALESCE(w."coverageEndDate",w."workDate")=$3`,orgId,ruleRow.factoryId,date);
 if(!rows.length){
  const periods=await db.$queryRawUnsafe(`SELECT id FROM "WorkLog" WHERE "orgId"=$1 AND "factoryId"=$2 AND "recordKind"='EMPLOYEE' AND COALESCE("coverageStartDate","workDate")<=$3 AND COALESCE("coverageEndDate","workDate")>=$3 LIMIT 1`,orgId,ruleRow.factoryId,date);
  return periods.length?{state:'HOLD',reason:'LEGACY_PERIOD'}:{state:'VERIFIED',submittedAt:null,sourceIds:[]};
 }
 if(rows.length!==1||rows[0].reviews<1)return {state:'HOLD',reason:'INCOMPLETE_DAILY_SOURCE'};
 return {state:'VERIFIED',submittedAt:rows[0].createdAt,sourceIds:[String(rows[0].id)],actualActorId:rows[0].createdByEmployeeId};
}
export async function ledgerFeedbackEvidence(db:any,orgId:number,employeeId:number,since:Date,cursor:any){
 // Approval time advances the processing cursor only. The original request's
 // creation time, not final approval or posting time, measures input timeliness.
 return db.$queryRawUnsafe(`SELECT r.id,r."createdAt",r."appliedAt",r.payload#>>'{rows,0,transactionDate}' AS "workDate",
  (SELECT count(*)::int FROM "BankLedgerDocument" d WHERE d."changeRequestId"=r.id AND d."orgId"=r."orgId" AND d."transactionDate"=r.payload#>>'{rows,0,transactionDate}') AS documents
  FROM "ChangeApprovalRequest" r WHERE r."orgId"=$1 AND r."requestedByEmployeeId"=$2 AND r.menu='BANK_LEDGER' AND r.operation='CREATE' AND r.status='APPROVED' AND r."appliedAt" IS NOT NULL AND r."createdAt">=$3
  AND ($4::timestamp IS NULL OR (r."appliedAt",r.id)>($4::timestamp,$5::text)) ORDER BY r."appliedAt",r.id LIMIT 31`,orgId,employeeId,since,cursor.lastAppliedAt||null,cursor.lastSourceId||'');
}
function publicEvidence(rule:any,date:string,deadline:Date,count:number){return {ruleName:rule.name,workDate:date,deadline:deadline.toISOString(),count,timeZone:rule.timeZone};}
async function deliver(tx:any,r:any,policy:any,state:any,date:string,key:string,evidence:any,p:any,now:Date){
 const rule=r.definition,deadline=feedbackDeadline(date,rule),basis=publicEvidence(rule,date,deadline,state.matchCount);
 const replacements:any={employee:p.name||'',workDate:date,deadline:`${shift(date,rule.dueAfterDays)} ${rule.deadlineTime} (${rule.timeZone})`,count:String(state.matchCount)};
 const message=rule.message.replace(/\{(employee|workDate|deadline|count)\}/g,(_value:string,name:string)=>replacements[name]);
 await tx.$executeRawUnsafe(`INSERT INTO "EmployeeFeedbackDelivery"(id,"orgId","employeeId","ruleId","ruleVersion","automationVersion","occurrenceKey",kind,subject,message,"periodStartDate","periodEndDate",evidence,"authorizedByEmployeeId","createdAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15) ON CONFLICT("ruleId","ruleVersion","automationVersion","occurrenceKey") DO NOTHING`,randomUUID(),r.orgId,r.employeeId,r.id,r.version,policy.version,key,rule.kind,rule.name,message,state.matchStartDate||date,date,JSON.stringify({public:basis,source:evidence,ruleSnapshot:rule}),r.automationByEmployeeId,now);
 state.matchCount=0;state.matchStartDate=null;
}
async function processRule(tx:any,r:any,policy:any,state:any,gates:any,now:Date){
 state.lastError=null;
 const rule=feedbackRuleInput(r.definition);
 const p=await person(tx,r.orgId,r.employeeId),authorizer=await person(tx,r.orgId,r.automationByEmployeeId,true),policyActor=await person(tx,r.orgId,policy.actorId,true);
 if(!await allowed(tx,gates,r.orgId,authorizer,'EMPLOYEE_SYSTEM')||!await allowed(tx,gates,r.orgId,policyActor,'EMPLOYEE_SYSTEM')||!await allowed(tx,gates,r.orgId,p,'DASHBOARD')||!await allowed(tx,gates,r.orgId,p,rule.task==='WORK_LOG_ENTRY'?'WORK_HISTORY':'BANK_LEDGER'))fail(403,'FEEDBACK_ACCESS_DENIED');
 const management=await loadManagementPeriod(tx,r.orgId,r.factoryId);
 const since=new Date(Math.max(new Date(r.armedAt).getTime(),new Date(policy.enabledFrom).getTime()));
 const start=[rule.effectiveFrom,shift(day(since,rule.timeZone),1),management.startDate].sort().at(-1)!;
 const assess=async(date:string,key:string,evidence:any)=>{
  if(date<start||await excluded(tx,r.orgId,r.employeeId,date,rule,p))return;
  if(evidence.state==='HOLD')fail(409,'FEEDBACK_SOURCE_HOLD');
  const deadline=feedbackDeadline(date,rule),submitted=evidence.submittedAt?new Date(evidence.submittedAt):null;
  if(submitted&&(!Number.isFinite(submitted.getTime())||submitted>now))fail(409,'FEEDBACK_SOURCE_HOLD');
  const late=!submitted||submitted>deadline;
  const matches=rule.kind==='WARNING'?late:!late&&evidence.actualActorId===r.employeeId;
  if(matches){state.matchCount++;state.matchStartDate=state.matchStartDate||date;}else{state.matchCount=0;state.matchStartDate=null;}
  if(matches&&state.matchCount>=rule.threshold)await deliver(tx,r,policy,state,date,key,evidence,p,now);
 };
 if(rule.task==='WORK_LOG_ENTRY'){
  let next=state.lastWorkDate?shift(state.lastWorkDate,1):start;
  for(let i=0;i<31&&feedbackDeadline(next,rule)<=now;i++,next=shift(next,1)){
   try{if(next>=start&&!await excluded(tx,r.orgId,r.employeeId,next,rule,p))await assess(next,next,await workLogFeedbackEvidence(tx,r.orgId,r,next));}
   catch(error:any){if(error?.message==='FEEDBACK_SOURCE_HOLD'){state.lastError='SOURCE_UNCONFIRMED';break;}throw error;}
   state.lastWorkDate=next;
  }
 }else if(rule.task==='LEDGER_ENTRY'){
  const sources=await ledgerFeedbackEvidence(tx,r.orgId,r.employeeId,since,state);
  for(const source of sources){
   if(new Date(source.appliedAt)>now)break;
   try{
   if(!/^\d{4}-\d{2}-\d{2}$/.test(source.workDate||''))fail(409,'FEEDBACK_SOURCE_HOLD');
   if(source.workDate>=start){
    if(!source.documents)fail(409,'FEEDBACK_SOURCE_HOLD');
    await assess(source.workDate,source.id,{state:'VERIFIED',submittedAt:source.createdAt,sourceIds:[source.id],actualActorId:r.employeeId});
   }
   state.lastAppliedAt=source.appliedAt;state.lastSourceId=source.id;
   }catch(error:any){if(error?.message==='FEEDBACK_SOURCE_HOLD'){state.lastError='SOURCE_UNCONFIRMED';break;}throw error;}
  }
 }else fail(409,'FEEDBACK_AUTOMATION_UNSUPPORTED');
}
export async function runFeedbackAutomation(db:any,gates:any,now=new Date()){
 const candidates=await db.$queryRawUnsafe(`SELECT r.id,r."orgId" FROM "EmployeeFeedbackRule" r JOIN "EmployeeFeedbackAutomation" a ON a."orgId"=r."orgId" LEFT JOIN "EmployeeFeedbackRun" s ON s."ruleId"=r.id WHERE a.enabled AND r.definition->>'automaticDelivery'='true' AND r."armedAt" IS NOT NULL ORDER BY COALESCE(s."lastAttemptAt",'epoch'::timestamp),r.id LIMIT 20`);
 for(const candidate of candidates){
  try{await retryEditTransaction(db,async(tx:any)=>{
   const [claim]=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',`feedback-rule:${candidate.id}`);if(!claim.locked)return;
   const policy=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackAutomation" WHERE "orgId"=$1 FOR SHARE',candidate.orgId))[0];if(!policy?.enabled)return;
   const r=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackRule" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',candidate.id,candidate.orgId))[0];if(!r?.definition?.automaticDelivery||!r.armedAt)return;
   const old=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackRun" WHERE "ruleId"=$1 AND "orgId"=$2',r.id,r.orgId))[0];
   const state=old?.ruleVersion===r.version&&old?.automationVersion===policy.version?old:{lastWorkDate:null,lastAppliedAt:null,lastSourceId:null,matchCount:0,matchStartDate:null};
   await processRule(tx,r,policy,state,gates,now);
   await tx.$executeRawUnsafe(`INSERT INTO "EmployeeFeedbackRun"("ruleId","orgId","ruleVersion","automationVersion","lastWorkDate","lastAppliedAt","lastSourceId","matchCount","matchStartDate","lastAttemptAt","lastError") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT("ruleId") DO UPDATE SET "ruleVersion"=$3,"automationVersion"=$4,"lastWorkDate"=$5,"lastAppliedAt"=$6,"lastSourceId"=$7,"matchCount"=$8,"matchStartDate"=$9,"lastError"=$11,"lastAttemptAt"=$10`,r.id,r.orgId,r.version,policy.version,state.lastWorkDate,state.lastAppliedAt,state.lastSourceId,state.matchCount,state.matchStartDate,now,state.lastError);
  });}catch(error:any){
   const code=error?.message==='FEEDBACK_SOURCE_HOLD'?'SOURCE_UNCONFIRMED':error?.status===403?'ACCESS_CHANGED':'SYSTEM_ERROR';
   await db.$executeRawUnsafe(`INSERT INTO "EmployeeFeedbackRun"("ruleId","orgId","ruleVersion","automationVersion","lastError","lastAttemptAt") SELECT r.id,r."orgId",r.version,a.version,$3,$4 FROM "EmployeeFeedbackRule" r JOIN "EmployeeFeedbackAutomation" a ON a."orgId"=r."orgId" WHERE r.id=$1 AND r."orgId"=$2 ON CONFLICT("ruleId") DO UPDATE SET "lastError"=$3,"lastAttemptAt"=$4`,candidate.id,candidate.orgId,code,now);
  }
 }
 return candidates.length;
}
export function startFeedbackAutomation(db:any,gates:any){
 let running=false;const run=async()=>{if(running)return;running=true;try{await runFeedbackAutomation(db,gates);}catch{console.warn('[employee-feedback] automatic check unavailable; pending work retained');}finally{running=false;}};
 const timer=setInterval(()=>void run(),60000);timer.unref();void run();return ()=>clearInterval(timer);
}

export async function listFeedbackInbox(db:any,orgId:number,actorId:number,page=0,adminView=false){
 await person(db,orgId,actorId,adminView);
 if(!Number.isSafeInteger(page)||page<0||page>100000)fail(400,'FEEDBACK_INVALID');
 const rows=await db.$queryRawUnsafe(`SELECT d.id,d.kind,d.subject,d.message,d."periodStartDate",d."periodEndDate",d."createdAt",d."readAt",d.evidence->'public' AS basis${adminView?',e.name AS "employeeName"':''} FROM "EmployeeFeedbackDelivery" d ${adminView?'JOIN "Employee" e ON e.id=d."employeeId" AND e."orgId"=d."orgId"':''} WHERE d."orgId"=$1 AND ($2::int IS NULL OR d."employeeId"=$2) ORDER BY d."createdAt" DESC,d.id DESC LIMIT 51 OFFSET $3`,orgId,adminView?null:actorId,page*50);
 return {rows:rows.slice(0,50),hasMore:rows.length>50,page};
}
export async function readFeedbackDelivery(db:any,orgId:number,actorId:number,id:string){
 return retryEditTransaction(db,async(tx:any)=>{
  await person(tx,orgId,actorId);
  const rows=await tx.$queryRawUnsafe('UPDATE "EmployeeFeedbackDelivery" SET "readAt"=COALESCE("readAt",CURRENT_TIMESTAMP) WHERE id=$1 AND "orgId"=$2 AND "employeeId"=$3 RETURNING id,"readAt"',id,orgId,actorId);
  if(!rows[0])fail(404,'FEEDBACK_NOT_FOUND');return rows[0];
 });
}
export function registerFeedbackAutomationRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any,adminView=false)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:adminView?['ADMIN']:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'],allowSystemAdmin:false});if(!ctx)return null;
  const orgId=ctx.organization.id,actorId=gates.actorId(),p=await person(db,orgId,actorId,adminView);
  if(!await allowed(db,gates,orgId,p,adminView?'EMPLOYEE_SYSTEM':'DASHBOARD'))fail(403,'FEEDBACK_ACCESS_DENIED');res.setHeader('Cache-Control','no-store');return {orgId,actorId};
 };
 app.put('/employee-feedback/automation',async(req:any,res:any)=>{const s=await access(req,res,true);if(s)res.json(await saveFeedbackAutomation(db,s.orgId,s.actorId,req.body));});
 app.get('/employee-feedback/inbox',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await listFeedbackInbox(db,s.orgId,s.actorId,Number(req.query.page||0)));});
 app.get('/employee-feedback/sent',async(req:any,res:any)=>{const s=await access(req,res,true);if(s)res.json(await listFeedbackInbox(db,s.orgId,s.actorId,Number(req.query.page||0),true));});
 app.post('/employee-feedback/inbox/:id/read',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await readFeedbackDelivery(db,s.orgId,s.actorId,req.params.id));});
}
