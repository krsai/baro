import {randomUUID,createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {attachmentPath,evidenceStorageConfig} from './evidenceStorage';
import {toDateKeyInTimeZone} from '../utils/atTrainingMonthKey';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
export function taskRequestFields(input:any,now=new Date()){
 if(input.reportRequired!==undefined&&typeof input.reportRequired!=='boolean')fail('WORK_REQUEST_INVALID');
 if(!input.reportRequired)return {reportRequired:false,dueAt:null,timeZone:'Asia/Ho_Chi_Minh',reportFileRequired:false,automaticWarning:false,warningMessage:'',warningArmedAt:null};
 const dueAt=new Date(input.dueAt),timeZone=input.timeZone||'Asia/Ho_Chi_Minh';
 if(typeof input.dueAt!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$/.test(input.dueAt)||!Number.isFinite(dueAt.getTime())||!['Asia/Ho_Chi_Minh','Asia/Seoul'].includes(timeZone))fail('TASK_DUE_REQUIRED');
 if(input.automaticWarning!==undefined&&typeof input.automaticWarning!=='boolean'||input.reportFileRequired!==undefined&&typeof input.reportFileRequired!=='boolean')fail('WORK_REQUEST_INVALID');
 const automaticWarning=input.automaticWarning===true,warningMessage=typeof input.warningMessage==='string'?input.warningMessage.trim():'';
 if(automaticWarning&&(!warningMessage||warningMessage.length>4000))fail('TASK_FUTURE_DEADLINE_REQUIRED');
 return {reportRequired:true,dueAt,timeZone,reportFileRequired:input.reportFileRequired===true,automaticWarning,warningMessage,warningArmedAt:automaticWarning?now:null};
}
const taskSnapshot=(row:any)=>({title:row.title,message:row.message,dueAt:row.dueAt?new Date(row.dueAt).toISOString():null,timeZone:row.timeZone,reportFileRequired:row.reportFileRequired,automaticWarning:row.automaticWarning,warningMessage:row.warningMessage,requirementVersion:row.requirementVersion,senderId:row.senderId,recipientId:row.recipientId});
async function taskEvent(tx:any,orgId:number,actorId:number,row:any,action:string,snapshot:any){
 await tx.$executeRawUnsafe('INSERT INTO "DashboardWorkRequestEvent"(id,"orgId","requestId","actorId",action,version,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',randomUUID(),orgId,row.id,actorId,action,row.version,JSON.stringify(snapshot));
}
export async function updateTaskInTransaction(tx:any,orgId:number,actorId:number,before:any,input:any){
 if(before.senderId!==actorId)fail('WORK_REQUEST_ADMIN_REQUIRED',403);
 if(before.status!=='OPEN'||before.cancelledAt)fail('WORK_REQUEST_CHANGED',409);
 const fields=taskRequestFields({...before,...input,reportRequired:true,dueAt:input.dueAt||new Date(before.dueAt).toISOString()});
 const next={...before,...fields,title:input.title.trim(),message:input.message,requirementVersion:before.requirementVersion};
 if(JSON.stringify(taskSnapshot(before))===JSON.stringify(taskSnapshot(next)))return before;
 if(fields.automaticWarning&&fields.dueAt!<=fields.warningArmedAt!)fail('TASK_FUTURE_DEADLINE_REQUIRED');
 if(before.version!==input.version)fail('WORK_REQUEST_CHANGED',409);
 const row=(await tx.$queryRawUnsafe(`UPDATE "DashboardWorkRequest" SET title=$1,message=$2,"dueAt"=$3,"timeZone"=$4,"reportFileRequired"=$5,"automaticWarning"=$6,"warningMessage"=$7,"warningArmedAt"=$8,"requirementVersion"="requirementVersion"+1,version=version+1 WHERE id=$9 AND "orgId"=$10 RETURNING *`,next.title,next.message,fields.dueAt,fields.timeZone,fields.reportFileRequired,fields.automaticWarning,fields.warningMessage,fields.warningArmedAt,before.id,orgId))[0];
 await taskEvent(tx,orgId,actorId,row,'TASK_UPDATE',{before:taskSnapshot(before),after:taskSnapshot(row)});return row;
}
export async function cancelTaskInTransaction(tx:any,orgId:number,actorId:number,before:any,input:any){
 if(before.senderId!==actorId)fail('WORK_REQUEST_ADMIN_REQUIRED',403);
 if(typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>1000)fail('TASK_CANCEL_REASON_REQUIRED');
 if(before.cancelledAt){if(before.cancellationReason===input.reason.trim())return before;fail('WORK_REQUEST_CHANGED',409);}
 if(!before.reportRequired||before.status!=='OPEN'||before.version!==input.version)fail('WORK_REQUEST_CHANGED',409);
 const row=(await tx.$queryRawUnsafe('UPDATE "DashboardWorkRequest" SET "cancelledAt"=CURRENT_TIMESTAMP,"cancellationReason"=$1,version=version+1 WHERE id=$2 AND "orgId"=$3 RETURNING *',input.reason.trim(),before.id,orgId))[0];
 await taskEvent(tx,orgId,actorId,row,'TASK_CANCEL',{before:taskSnapshot(before),reason:row.cancellationReason,cancelledAt:row.cancelledAt});return row;
}
async function member(db:any,orgId:number,actorId:number){
 const person=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',organization:{isActive:true,ownerOrgId:null}},select:{id:true,orgRole:true}});
 if(!person)fail('WORK_REQUEST_ACCESS_DENIED',403);return person;
}
async function ownedTask(db:any,orgId:number,actorId:number,id:string,lock=false){
 await member(db,orgId,actorId);
 const row=(await db.$queryRawUnsafe(`SELECT * FROM "DashboardWorkRequest" WHERE id=$1 AND "orgId"=$2 AND ("senderId"=$3 OR "recipientId"=$3) ${lock?'FOR UPDATE':''}`,id,orgId,actorId))[0];
 if(!row||!row.reportRequired)fail('WORK_REQUEST_NOT_FOUND',404);return row;
}
export async function taskReportList(db:any,orgId:number,actorId:number,id:string){
 const task=await ownedTask(db,orgId,actorId,id);
 const reports=await db.$queryRawUnsafe('SELECT id,body,"submittedAt","requirementVersion","taskSnapshot" FROM "WorkTaskReport" WHERE "requestId"=$1 AND "orgId"=$2 ORDER BY "submittedAt",id',id,orgId);
 for(const report of reports){
  const files=await db.evidenceAttachmentLink.findMany({where:{orgId,workReportId:report.id},include:{attachment:true}});
  report.files=files.map((link:any)=>({path:attachmentPath(link.attachment.id,link.attachment.originalFileName),reference:''}));
 }
 return {task,reports};
}
export async function submitTaskReport(db:any,orgId:number,actorId:number,id:string,input:any,now=new Date()){
 if(typeof input?.clientKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientKey)||typeof input.body!=='string'||input.body.length>20000||!Number.isSafeInteger(input.requirementVersion)||input.requirementVersion<1||!Array.isArray(input.attachmentIds)||input.attachmentIds.length>50||input.attachmentIds.some((aid:any)=>typeof aid!=='string'||!/^[a-f0-9-]{36}$/.test(aid))||new Set(input.attachmentIds).size!==input.attachmentIds.length)fail('TASK_REPORT_INVALID');
 const files=[...input.attachmentIds].sort(),body=input.body.trim();
 if(!body&&!files.length)fail('TASK_REPORT_REQUIRED');
 const hash=createHash('sha256').update(JSON.stringify({id,body,files,requirementVersion:input.requirementVersion})).digest('hex');
 return retryEditTransaction(db,async(tx:any)=>{
  const task=await ownedTask(tx,orgId,actorId,id,true);
  if(task.recipientId!==actorId)fail('WORK_REQUEST_RECIPIENT_REQUIRED',403);
  const previous=(await tx.$queryRawUnsafe('SELECT * FROM "WorkTaskReport" WHERE "orgId"=$1 AND "authorId"=$2 AND "clientKey"=$3',orgId,actorId,input.clientKey))[0];
  if(previous){if(previous.requestHash!==hash)fail('WORK_REQUEST_CHANGED',409);return previous;}
  if(task.cancelledAt||task.status!=='OPEN'||task.requirementVersion!==input.requirementVersion)fail('WORK_REQUEST_CHANGED',409);
  if(task.reportFileRequired&&!files.length)fail('TASK_REPORT_FILE_REQUIRED');
  const attachments=files.length?await tx.evidenceAttachment.findMany({where:{id:{in:files},orgId,createdByEmployeeId:actorId,purpose:'WORK_REPORT',status:'READY'},select:{id:true}}):[];
  if(attachments.length!==files.length)fail('TASK_REPORT_FILE_REQUIRED');
  const report=(await tx.$queryRawUnsafe('INSERT INTO "WorkTaskReport"(id,"orgId","requestId","authorId","requirementVersion","clientKey","requestHash",body,"taskSnapshot","submittedAt") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *',randomUUID(),orgId,id,actorId,task.requirementVersion,input.clientKey,hash,body,JSON.stringify(taskSnapshot(task)),now))[0];
  for(const file of attachments)await tx.evidenceAttachmentLink.create({data:{id:`${file.id}:WorkTaskReport:${report.id}`,orgId,attachmentId:file.id,workReportId:report.id}});
  const row=(await tx.$queryRawUnsafe('UPDATE "DashboardWorkRequest" SET status=\'DONE\',"completedAt"=$1,version=version+1 WHERE id=$2 AND "orgId"=$3 RETURNING *',now,id,orgId))[0];
  await taskEvent(tx,orgId,actorId,row,'REPORT_SUBMIT',{reportId:report.id,requirementVersion:task.requirementVersion,submittedAt:report.submittedAt});return report;
 });
}
export function registerTaskReportRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR','WORKER'],allowSystemAdmin:false});if(!ctx)return null;
  const orgId=ctx.organization.id,actorId=gates.actorId(),p=await member(db,orgId,actorId);
  if(!await gates.canAccess({orgType:ctx.organization.type,orgRole:p.orgRole,feature:'DASHBOARD'})||!(await gates.industryFeatures(db,orgId,ctx.organization.type)).includes('DASHBOARD'))fail('WORK_REQUEST_ACCESS_DENIED',403);
  res.setHeader('Cache-Control','no-store');return {orgId,actorId};
 };
 app.get('/dashboard/work-requests/:id/reports',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await taskReportList(db,s.orgId,s.actorId,req.params.id));});
 app.post('/dashboard/work-requests/:id/report',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await submitTaskReport(db,s.orgId,s.actorId,req.params.id,req.body));});
}

export async function runTaskReportWarnings(db:any,gates:any,now=new Date()){
 const candidates=await db.$queryRawUnsafe(`SELECT t.id,t."orgId" FROM "DashboardWorkRequest" t JOIN "EmployeeFeedbackAutomation" a ON a."orgId"=t."orgId" LEFT JOIN "WorkTaskReportCheck" c ON c."requestId"=t.id AND c."requirementVersion"=t."requirementVersion" WHERE a.enabled AND t."reportRequired" AND t."automaticWarning" AND t."cancelledAt" IS NULL AND t."dueAt"<$1 AND t."dueAt">GREATEST(t."warningArmedAt",a."enabledFrom") AND (c.result IS NULL OR c.result='PENDING') ORDER BY COALESCE(c."checkedAt",'epoch'::timestamp),t."dueAt",t.id LIMIT 20`,now);
 for(const item of candidates){try{await retryEditTransaction(db,async(tx:any)=>{
  const [claim]=await tx.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked',`task-warning:${item.id}`);if(!claim.locked)return;
  const policy=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackAutomation" WHERE "orgId"=$1 FOR SHARE',item.orgId))[0];if(!policy?.enabled)return;
  const task=(await tx.$queryRawUnsafe('SELECT * FROM "DashboardWorkRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',item.id,item.orgId))[0];
  if(!task?.reportRequired||!task.automaticWarning||task.cancelledAt||!task.warningArmedAt||new Date(task.dueAt)>=now||new Date(task.dueAt)<=new Date(Math.max(new Date(policy.enabledFrom).getTime(),new Date(task.warningArmedAt).getTime())))return;
  const checked=(await tx.$queryRawUnsafe('SELECT * FROM "WorkTaskReportCheck" WHERE "requestId"=$1 AND "requirementVersion"=$2',task.id,task.requirementVersion))[0];if(checked&&checked.result!=='PENDING')return;
  const people=await tx.$queryRawUnsafe(`SELECT e.id,e.name,e."orgRole"::text AS role,o.type::text AS "orgType" FROM "Employee" e JOIN "Organization" o ON o.id=e."orgId" WHERE e."orgId"=$1 AND e.id=ANY($2::int[]) AND e.status='ACTIVE' AND o."isActive" AND o."ownerOrgId" IS NULL FOR SHARE OF e,o`,task.orgId,[...new Set([task.senderId,task.recipientId,policy.actorId])]);
  const sender=people.find((p:any)=>p.id===task.senderId),recipient=people.find((p:any)=>p.id===task.recipientId),authorizer=people.find((p:any)=>p.id===policy.actorId);
  if(!sender||sender.role!=='ADMIN'||!recipient||!authorizer||authorizer.role!=='ADMIN')fail('WORK_REQUEST_ACCESS_DENIED',403);
  for(const [p,feature] of [[sender,'DASHBOARD'],[recipient,'DASHBOARD'],[authorizer,'EMPLOYEE_SYSTEM']] as any[])if(!await gates.canAccess({orgType:p.orgType,orgRole:p.role,feature})||!(await gates.industryFeatures(tx,task.orgId,p.orgType)).includes(feature))fail('WORK_REQUEST_ACCESS_DENIED',403);
  const reports=await tx.$queryRawUnsafe('SELECT id,"submittedAt" FROM "WorkTaskReport" WHERE "requestId"=$1 AND "orgId"=$2 AND "requirementVersion"=$3 AND "authorId"=$4',task.id,task.orgId,task.requirementVersion,task.recipientId);
  const report=reports[0],timely=report&&new Date(report.submittedAt)<=new Date(task.dueAt);let deliveryId:string|null=null;
  if(!report&&task.reportFileRequired&&!evidenceStorageConfig(task.orgId))fail('TASK_REPORT_STORAGE_UNAVAILABLE',503);
  if(!timely){
   const date=toDateKeyInTimeZone(task.dueAt,task.timeZone),deadline=new Date(task.dueAt).toISOString();
   const localDeadline=new Intl.DateTimeFormat('sv-SE',{timeZone:task.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(task.dueAt));
   const replacements:Record<string,string>={employee:recipient.name||'',task:task.title,deadline:`${localDeadline} (${task.timeZone})`};
   const message=task.warningMessage.replace(/\{(employee|task|deadline)\}/g,(_s:string,key:string)=>replacements[key]||'');
   await tx.$executeRawUnsafe(`INSERT INTO "EmployeeFeedbackDelivery"(id,"orgId","employeeId","taskId","taskRequirementVersion","ruleVersion","automationVersion","occurrenceKey",kind,subject,message,"periodStartDate","periodEndDate",evidence,"authorizedByEmployeeId","createdAt") VALUES($1,$2,$3,$4,$5,1,$6,$7,'WARNING',$8,$9,$10,$10,$11::jsonb,$12,$13) ON CONFLICT("taskId","taskRequirementVersion") DO NOTHING`,randomUUID(),task.orgId,task.recipientId,task.id,task.requirementVersion,policy.version,`task:${task.id}:${task.requirementVersion}`,task.title,message,date,JSON.stringify({public:{ruleName:task.title,workDate:date,deadline,timeZone:task.timeZone,count:1},source:{taskId:task.id,requirementVersion:task.requirementVersion,reportId:report?.id||null,submittedAt:report?.submittedAt||null},taskSnapshot:taskSnapshot(task)}),task.senderId,now);
   deliveryId=(await tx.$queryRawUnsafe('SELECT id FROM "EmployeeFeedbackDelivery" WHERE "taskId"=$1 AND "taskRequirementVersion"=$2',task.id,task.requirementVersion))[0].id;
  }
  await tx.$executeRawUnsafe(`INSERT INTO "WorkTaskReportCheck"("requestId","orgId","requirementVersion",result,"reportId","deliveryId","checkedAt") VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT("requestId","requirementVersion") DO UPDATE SET result=$4,"reportId"=$5,"deliveryId"=$6,"lastError"=NULL,"checkedAt"=$7`,task.id,task.orgId,task.requirementVersion,timely?'ON_TIME':'WARNED',report?.id||null,deliveryId,now);
 });}catch(error:any){await db.$executeRawUnsafe(`INSERT INTO "WorkTaskReportCheck"("requestId","orgId","requirementVersion",result,"lastError","checkedAt") SELECT id,"orgId","requirementVersion",'PENDING',$3,$4 FROM "DashboardWorkRequest" WHERE id=$1 AND "orgId"=$2 ON CONFLICT("requestId","requirementVersion") DO UPDATE SET "lastError"=$3,"checkedAt"=$4`,item.id,item.orgId,error?.status===403?'ACCESS_CHANGED':'SYSTEM_ERROR',now);}}
 return candidates.length;
}
