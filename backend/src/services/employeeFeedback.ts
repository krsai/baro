import {randomUUID} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {editRevision,retryEditTransaction} from '../utils/editRevision';

const fail=(status:number,message:string):never=>{throw createHttpError(status,message);};
const integer=(value:any,min:number,max:number)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const date=(value:any)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
const text=(value:any,max:number)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
export const feedbackDeliveryMode='CONFIGURED_AUTOMATION';
const canonical=(value:any):any=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const signature=(value:any)=>editRevision(canonical(value));

async function admin(db:any,orgId:number,actorId:number){
 if(!integer(orgId,1,2147483647)||!integer(actorId,1,2147483647))fail(403,'FEEDBACK_ACCESS_DENIED');
 const person=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN',organization:{isActive:true,ownerOrgId:null}},select:{id:true}});
 if(!person)fail(403,'FEEDBACK_ACCESS_DENIED');
}
async function employee(db:any,orgId:number,id:any){
 if(!integer(id,1,2147483647)||!await db.employee.findFirst({where:{id,orgId,status:'ACTIVE'},select:{id:true}}))fail(400,'FEEDBACK_EMPLOYEE_REQUIRED');
}
export function feedbackRuleInput(input:any){
 if(input?.automaticDelivery!==undefined&&typeof input.automaticDelivery!=='boolean')fail(400,'FEEDBACK_INVALID');
 if(input?.automaticDelivery===true&&input?.task==='OTHER')fail(400,'FEEDBACK_AUTOMATION_UNSUPPORTED');
 if(!text(input?.name,160)||!['WARNING','PRAISE'].includes(input?.kind)||!['WORK_LOG_ENTRY','LEDGER_ENTRY','OTHER'].includes(input?.task)||!['Asia/Ho_Chi_Minh','Asia/Seoul'].includes(input?.timeZone)||!date(input?.effectiveFrom)||!integer(input?.dueAfterDays,0,30)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input?.deadlineTime)||!integer(input?.threshold,1,365)||!text(input?.message,4000))fail(400,'FEEDBACK_INVALID');
 if(!Array.isArray(input.weekdays)||!input.weekdays.length||input.weekdays.some((day:any)=>!integer(day,0,6))||new Set(input.weekdays).size!==input.weekdays.length)fail(400,'FEEDBACK_INVALID');
 return {name:input.name.trim(),kind:input.kind,task:input.task,timeZone:input.timeZone,effectiveFrom:input.effectiveFrom,dueAfterDays:input.dueAfterDays,deadlineTime:input.deadlineTime,threshold:input.threshold,weekdays:[...input.weekdays].sort(),message:input.message.trim(),automaticDelivery:input.automaticDelivery===true};
}

// A simulation only: callers must explicitly supply verified evidence. Missing
// evidence never means misconduct. No worker, scheduler or delivery is invoked.
export function previewEmployeeFeedback(rule:any,input:any,now=new Date()){
 const policy=feedbackRuleInput(rule);
 if(!date(input?.workDate)||!['VERIFIED','UNKNOWN','SYSTEM_ERROR'].includes(input?.evidenceState)||!integer(input?.matchingCount,0,365))fail(400,'FEEDBACK_INVALID');
 const workDate=new Date(`${input.workDate}T00:00:00Z`);
 if(input.workDate<policy.effectiveFrom||!policy.weekdays.includes(workDate.getUTCDay())||input.excludedDay===true)return {result:'NOT_APPLICABLE',delivery:false};
 if(input.evidenceState!=='VERIFIED')return {result:'HOLD',delivery:false};
 const dueDay=new Date(workDate.getTime()+policy.dueAfterDays*86400000).toISOString().slice(0,10);
 const deadline=new Date(`${dueDay}T${policy.deadlineTime}:00${policy.timeZone==='Asia/Seoul'?'+09:00':'+07:00'}`);
 if(input.submittedAt&& (typeof input.submittedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.test(input.submittedAt)))fail(400,'FEEDBACK_INVALID');
 const submitted=input.submittedAt?new Date(input.submittedAt):null;
 if(submitted&&(Number.isNaN(submitted.getTime())||submitted>now))fail(400,'FEEDBACK_INVALID');
 const onTime=submitted!==null&&submitted<=deadline;
 const late=submitted!==null?submitted>deadline:now>deadline;
 const matched=(policy.kind==='PRAISE'?onTime:late)&&input.matchingCount>=policy.threshold;
 return {result:matched?'CANDIDATE':now<=deadline&&!submitted?'WAITING':'NO_MATCH',deadline:deadline.toISOString(),delivery:false};
}

const tables={rules:'EmployeeFeedbackRule',drafts:'EmployeeFeedbackDraft'} as const;
type Category=keyof typeof tables;
async function event(tx:any,orgId:number,actorId:number,category:Category,row:any,action:string,before:any){
 await tx.$executeRawUnsafe(`INSERT INTO "EmployeeFeedbackEvent"(id,"orgId","ruleId","draftId","actorId",version,action,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,randomUUID(),orgId,category==='rules'?row.id:null,category==='drafts'?row.id:null,actorId,row.version,action,JSON.stringify({before,after:row}));
}
export async function listEmployeeFeedback(db:any,orgId:number,actorId:number){
 await admin(db,orgId,actorId);
 const [rules,drafts,employees,factories,policies]=await Promise.all([
  db.$queryRawUnsafe('SELECT r.*,s."lastError",s."lastAttemptAt" FROM "EmployeeFeedbackRule" r LEFT JOIN "EmployeeFeedbackRun" s ON s."ruleId"=r.id AND s."orgId"=r."orgId" WHERE r."orgId"=$1 ORDER BY r."updatedAt" DESC,r.id LIMIT 200',orgId),
  db.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackDraft" WHERE "orgId"=$1 ORDER BY "updatedAt" DESC,id LIMIT 200',orgId),
  db.employee.findMany({where:{orgId},select:{id:true,name:true,employeeNo:true,status:true},orderBy:[{name:'asc'},{id:'asc'}]}),
  db.factory.findMany({where:{orgId},select:{id:true,name:true},orderBy:{name:'asc'}}),
  db.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackAutomation" WHERE "orgId"=$1',orgId),
 ]);
 return {mode:feedbackDeliveryMode,rules,drafts,employees,factories,automation:policies[0]||{enabled:false,version:0,enabledFrom:null}};
}
export async function saveEmployeeFeedback(db:any,orgId:number,actorId:number,category:Category,id:string,input:any){
 if(!tables[category]||!/^[-a-zA-Z0-9_]{8,80}$/.test(id)||!integer(input?.version,0,2147483646))fail(400,'FEEDBACK_INVALID');
 if(input?.automaticDelivery===true||input?.enabled===true||input?.send===true)fail(409,'FEEDBACK_PREPARATION_ONLY');
 return retryEditTransaction(db,async(tx:any)=>{
  await admin(tx,orgId,actorId);
  await employee(tx,orgId,input.employeeId);
  const table=tables[category];
  const existing=(await tx.$queryRawUnsafe(`SELECT * FROM "${table}" WHERE id=$1 AND "orgId"=$2 FOR UPDATE`,id,orgId))[0];
  let data:any,factoryId:number|null=null,ruleId:string|null=null,state='DRAFT';
  if(category==='rules'){
   data=feedbackRuleInput(input.definition);
   factoryId=input.factoryId??null;
   if(data.task==='WORK_LOG_ENTRY'&&!factoryId)fail(400,'FEEDBACK_FACTORY_REQUIRED');
   if(factoryId!==null&&(!integer(factoryId,1,2147483647)||!await tx.factory.findFirst({where:{id:factoryId,orgId},select:{id:true}})))fail(400,'FEEDBACK_FACTORY_REQUIRED');
  }else{
   if(!['WARNING','PRAISE'].includes(input.content?.kind)||!text(input.content?.subject,200)||!text(input.content?.message,4000)||!text(input.content?.basis,4000)||!['DRAFT','REVIEWED','DISMISSED'].includes(input.state))fail(400,'FEEDBACK_INVALID');
   data={kind:input.content.kind,subject:input.content.subject.trim(),message:input.content.message.trim(),basis:input.content.basis.trim()};
   state=input.state;ruleId=input.ruleId||null;
   if(ruleId){const rule=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeFeedbackRule" WHERE id=$1 AND "orgId"=$2',ruleId,orgId))[0];if(!rule||rule.employeeId!==input.employeeId||rule.definition.kind!==data.kind)fail(400,'FEEDBACK_RULE_MISMATCH');}
   if(!existing&&state!=='DRAFT')fail(400,'FEEDBACK_DRAFT_REQUIRED');
   if(existing&&existing.state!=='DRAFT'&&signature({employeeId:existing.employeeId,ruleId:existing.ruleId,content:existing.content,state:existing.state})!==signature({employeeId:input.employeeId,ruleId,content:data,state}))fail(409,'FEEDBACK_FINAL_DOCUMENT');
   if(existing&&state!=='DRAFT'&&(existing.employeeId!==input.employeeId||existing.ruleId!==ruleId||signature(existing.content)!==signature(data)))fail(409,'FEEDBACK_SAVE_BEFORE_REVIEW');
  }
  const payload=category==='rules'?{employeeId:input.employeeId,factoryId,definition:data}:{employeeId:input.employeeId,ruleId,content:data,state};
  const current=existing&&(category==='rules'?{employeeId:existing.employeeId,factoryId:existing.factoryId,definition:existing.definition}:{employeeId:existing.employeeId,ruleId:existing.ruleId,content:existing.content,state:existing.state});
  if(existing&&signature(current)===signature(payload))return existing;
  if((existing?.version??0)!==input.version)fail(409,'FEEDBACK_CHANGED');
  let row:any;
  if(category==='rules')row=(await tx.$queryRawUnsafe(`INSERT INTO "EmployeeFeedbackRule"(id,"orgId","employeeId","factoryId",definition,"createdByEmployeeId","armedAt","automationByEmployeeId") VALUES($1,$2,$3,$4,$5::jsonb,$6,$7,$8) ON CONFLICT(id) DO UPDATE SET "employeeId"=$3,"factoryId"=$4,definition=$5::jsonb,version="EmployeeFeedbackRule".version+1,"updatedAt"=CURRENT_TIMESTAMP,"armedAt"=$7,"automationByEmployeeId"=$8 WHERE "EmployeeFeedbackRule"."orgId"=$2 RETURNING *`,id,orgId,input.employeeId,factoryId,JSON.stringify(data),actorId,data.automaticDelivery?new Date():null,data.automaticDelivery?actorId:null))[0];
  else row=(await tx.$queryRawUnsafe(`INSERT INTO "EmployeeFeedbackDraft"(id,"orgId","employeeId","ruleId",content,state,"createdByEmployeeId") VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT(id) DO UPDATE SET "employeeId"=$3,"ruleId"=$4,content=$5::jsonb,state=$6,version="EmployeeFeedbackDraft".version+1,"updatedAt"=CURRENT_TIMESTAMP WHERE "EmployeeFeedbackDraft"."orgId"=$2 RETURNING *`,id,orgId,input.employeeId,ruleId,JSON.stringify(data),state,actorId))[0];
  if(!row)fail(409,'FEEDBACK_CHANGED');
  await event(tx,orgId,actorId,category,row,existing?'UPDATE':'CREATE',existing??null);
  return row;
 });
}

export function registerEmployeeFeedbackRoutes(app:any,db:any,gates:any){
 const access=async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN'],allowSystemAdmin:false});if(!ctx)return null;
  const orgId=ctx.organization.id,actorId=gates.actorId();await admin(db,orgId,actorId);
  if(!await gates.canAccess({orgType:ctx.organization.type,orgRole:'ADMIN',feature:'EMPLOYEE_SYSTEM'})||!(await gates.industryFeatures(db,orgId,ctx.organization.type)).includes('EMPLOYEE_SYSTEM'))fail(403,'FEEDBACK_ACCESS_DENIED');
  res.setHeader('Cache-Control','no-store');return {orgId,actorId};
 };
 app.get('/employee-feedback',async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await listEmployeeFeedback(db,s.orgId,s.actorId));});
 for(const category of ['rules','drafts'] as Category[])app.put(`/employee-feedback/${category}/:id`,async(req:any,res:any)=>{const s=await access(req,res);if(s)res.json(await saveEmployeeFeedback(db,s.orgId,s.actorId,category,req.params.id,req.body));});
 app.post('/employee-feedback/preview',async(req:any,res:any)=>{if(await access(req,res))res.json(previewEmployeeFeedback(req.body?.definition,req.body?.sample));});
}
