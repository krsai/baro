import {employeeLeaveBalance} from '../employees/employeeLeave';
import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {normalizeEmployeePayTypePolicy,isPolicyWorkday} from '../employees/employeePayTypePolicy';
import {resolveEmployeeEffectivePayType} from '../employees/employeeCompensation';
import {employmentDateKey} from '../employees/salaryTenure';

export const WORK_TIME_KINDS=['OVERTIME','SPECIAL','ANNUAL','ANNUAL_AM','ANNUAL_PM','PAID','UNPAID'];
const roles=['ADMIN','OPERATOR','ACCOUNTANT','WORKER'];
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const key=(orgId:number)=>`WORK_TIME_POLICY:${orgId}`;
const validDate=(v:any)=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const reason=(v:any)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=1000;
const clock=(v:any)=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?Number(v.slice(0,2))*60+Number(v.slice(3)):NaN;
export const workTimeInclude={employee:{select:{id:true,name:true,employeeNo:true}},drafter:{select:{id:true,name:true}},days:{orderBy:{workDate:'asc'}},steps:{orderBy:{position:'asc'},include:{employee:{select:{id:true,name:true}}}},decisions:{orderBy:{position:'asc'}}};
export async function workTimeActor(db:any,orgId:number,actorId:number){
 if(!Number.isSafeInteger(actorId)||!Number.isSafeInteger(orgId))fail('WORK_TIME_ACCESS_DENIED',403);
 const row=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',organization:{isActive:true,type:{in:['MANUFACTURER','SERVICE']}}},include:{grade:true,role:true}});
 const policy=await db.systemSetting.findUnique({where:{key:'ROLE_ACCESS_POLICY'}});
 const org=await db.organization.findUnique({where:{id:orgId},select:{type:true}});
 if(!row||!(policy?.value as any)?.[org?.type]?.[row.orgRole]?.includes('WORK_TIME'))fail('WORK_TIME_ACCESS_DENIED',403);
 return row;
}
export async function workTimePolicy(db:any,orgId:number){
 const row=await db.systemSetting.findUnique({where:{key:key(orgId)}});
 return row?.value||{revision:0,drafterRoles:roles,proxyRoles:['ADMIN','OPERATOR'],approverIds:[]};
}
export async function saveWorkTimePolicy(db:any,orgId:number,actorId:number,input:any){
 return retryEditTransaction(db,async(tx:any)=>saveWorkTimePolicyInTransaction(tx,orgId,actorId,input));
}
export async function saveWorkTimePolicyInTransaction(tx:any,orgId:number,actorId:number,input:any){
  await tx.$queryRawUnsafe("SELECT set_config('baro.work_time_actor',$1,true)",String(actorId));
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  const actor=await workTimeActor(tx,orgId,actorId);if(actor.orgRole!=='ADMIN')fail('WORK_TIME_ACCESS_DENIED',403);
  const current=await workTimePolicy(tx,orgId);if(!Number.isInteger(input?.revision)||input.revision!==current.revision){
   const receipt=await tx.systemSetting.findUnique({where:{key:key(orgId)+':REV:'+current.revision}});
   if(input?.revision+1===current.revision&&receipt?.value?.actorId===actorId&&['drafterRoles','proxyRoles','approverIds'].every(k=>JSON.stringify(input[k])===JSON.stringify(current[k])))return current;
   fail('WORK_TIME_POLICY_CHANGED',409);
  }
  if(!Array.isArray(input.drafterRoles)||!input.drafterRoles.length||input.drafterRoles.some((r:any)=>!roles.includes(r))||!Array.isArray(input.proxyRoles)||input.proxyRoles.some((r:any)=>!['ADMIN','OPERATOR','ACCOUNTANT'].includes(r))||!Array.isArray(input.approverIds)||!input.approverIds.length||input.approverIds.length>10||new Set(input.approverIds).size!==input.approverIds.length||input.approverIds.some((id:any)=>!Number.isSafeInteger(id)))fail('WORK_TIME_INVALID_POLICY');
  const people=await tx.employee.count({where:{orgId,id:{in:input.approverIds},status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}});if(people!==input.approverIds.length)fail('WORK_TIME_INVALID_POLICY');
  const value={revision:current.revision+1,drafterRoles:[...new Set(input.drafterRoles)],proxyRoles:[...new Set(input.proxyRoles)],approverIds:input.approverIds};
  await tx.systemSetting.create({data:{key:key(orgId)+':REV:'+value.revision,value:{before:current,after:value,actorId,at:new Date().toISOString()},updatedByEmployeeId:actorId}});
  await tx.systemSetting.upsert({where:{key:key(orgId)},create:{key:key(orgId),value,updatedByEmployeeId:actorId},update:{value,updatedByEmployeeId:actorId}});return value;
}
export async function workTimeAnnualBalance(db:any,orgId:number,employeeId:number,year:string){
 return (await employeeLeaveBalance(db,orgId,employeeId,Number(year))).remaining;
}
async function sourceDays(tx:any,orgId:number,employee:any,input:any){
 if(!WORK_TIME_KINDS.includes(input.kind)||!validDate(input.startDate)||!validDate(input.endDate)||input.startDate>input.endDate||input.startDate.slice(0,4)!==input.endDate.slice(0,4)||!reason(input.reason))fail('WORK_TIME_INVALID_INPUT');
 const extra=['OVERTIME','SPECIAL'].includes(input.kind),half=['ANNUAL_AM','ANNUAL_PM'].includes(input.kind);
 let requestedMinutes:number|null=null;
 if(extra){const start=clock(input.startTime),end=clock(input.endTime);if(end!==0&&end<start)fail('WORK_TIME_SPLIT_DAY');requestedMinutes=(end-start+1440)%1440;if(input.startDate!==input.endDate||!Number.isFinite(requestedMinutes)||requestedMinutes<=0||requestedMinutes>1440)fail('WORK_TIME_INVALID_INPUT');}
 if(half&&input.startDate!==input.endDate)fail('WORK_TIME_INVALID_INPUT');
 const payType=resolveEmployeeEffectivePayType(employee),saved=await tx.employeePayTypePolicy.findFirst({where:{orgId,payType}}),policy=normalizeEmployeePayTypePolicy(saved,payType);
 const previousDate=new Date(Date.parse(input.startDate+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const holidays=await tx.organizationHoliday.findMany({where:{orgId,holidayDate:{gte:previousDate,lte:input.endDate}},select:{holidayDate:true}}),holidaySet=new Set(holidays.map((d:any)=>d.holidayDate));
 const days:any[]=[];
 for(let d=new Date(input.startDate+'T00:00:00Z');d.toISOString().slice(0,10)<=input.endDate;d.setUTCDate(d.getUTCDate()+1)){
  const workDate=d.toISOString().slice(0,10),regular=isPolicyWorkday(workDate,policy)&&!holidaySet.has(workDate);
  if(employmentDateKey(employee.joinedAt)&&workDate<employmentDateKey(employee.joinedAt)||employmentDateKey(employee.leftAt)&&workDate>employmentDateKey(employee.leftAt))fail('WORK_TIME_OUTSIDE_EMPLOYMENT');
  if(extra){
   if((input.kind==='OVERTIME')!==regular)fail('WORK_TIME_WRONG_DAY');
   const begin=clock(input.startTime),finish=begin+requestedMinutes!,shiftLength=(clock(policy.standardClockOut)-clock(policy.standardClockIn)+1440)%1440||1440;
   for(const offset of [-1,0]){
    const shiftDate=new Date(d.getTime()+offset*86400000).toISOString().slice(0,10);
    if(!isPolicyWorkday(shiftDate,policy)||holidaySet.has(shiftDate))continue;
    const shiftBegin=offset*1440+clock(policy.standardClockIn);
    if(begin<shiftBegin+shiftLength&&finish>shiftBegin)fail('WORK_TIME_OVERLAPS_SHIFT');
   }
  }
  else if(!regular)continue;
  days.push({workDate,portion:extra?0:half?0.5:1});
 }
 if(!days.length)fail('WORK_TIME_NO_WORKDAYS');return {days,requestedMinutes,calendarSnapshot:policy};
}
async function noOverlap(tx:any,orgId:number,employeeId:number,kind:string,days:any[],excludeId?:string){
 const existing=await tx.workTimeDay.findMany({where:{orgId,workDate:{in:days.map(d=>d.workDate)},request:{employeeId,status:{in:['PENDING','APPROVED']},cancelsRequestId:null,...(excludeId?{id:{not:excludeId}}:{})}},include:{request:{select:{kind:true}}}});
 for(const day of days)for(const other of existing.filter((d:any)=>d.workDate===day.workDate)){
  const extras=['OVERTIME','SPECIAL'];if(extras.includes(kind)&&extras.includes(other.request.kind)||!extras.includes(kind)&&!extras.includes(other.request.kind)&&!(kind==='ANNUAL_AM'&&other.request.kind==='ANNUAL_PM'||kind==='ANNUAL_PM'&&other.request.kind==='ANNUAL_AM')||(!extras.includes(kind)&&day.portion===1&&extras.includes(other.request.kind))||(extras.includes(kind)&&Number(other.portion)===1))fail('WORK_TIME_OVERLAP',409);
 }
}
export async function submitWorkTimeRequest(db:any,orgId:number,actorId:number,input:any){
 if(typeof input?.clientKey!=='string'||!/^[-\w]{8,80}$/.test(input.clientKey))fail('WORK_TIME_INVALID_INPUT');
 const hash=createHash('sha256').update(JSON.stringify({policyRevision:input.policyRevision,employeeId:input.employeeId,kind:input.kind,startDate:input.startDate,endDate:input.endDate,startTime:input.startTime||null,endTime:input.endTime||null,reason:input.reason,cancelsRequestId:input.cancelsRequestId||null})).digest('hex');
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe("SELECT set_config('baro.work_time_actor',$1,true)",String(actorId));
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);const actor=await workTimeActor(tx,orgId,actorId);
  const previous=await tx.workTimeRequest.findUnique({where:{orgId_clientKey:{orgId,clientKey:input.clientKey}}});if(previous){if(previous.drafterId!==actorId||previous.requestHash!==hash)fail('WORK_TIME_RETRY_CONFLICT',409);return readWorkTimeRequest(tx,orgId,actorId,previous.id);}
  const config=await workTimePolicy(tx,orgId);if(input.policyRevision!==config.revision)fail('WORK_TIME_POLICY_CHANGED',409);if(!(input.employeeId===actorId?config.drafterRoles:config.proxyRoles).includes(actor.orgRole))fail('WORK_TIME_ACCESS_DENIED',403);
  const employee=await tx.employee.findFirst({where:{id:input.employeeId,orgId,status:{notIn:['PENDING','REJECTED']}},include:{role:true}});if(!employee)fail('WORK_TIME_INVALID_INPUT');
  let source:any;if(input.cancelsRequestId){
   const original=await tx.workTimeRequest.findFirst({where:{id:input.cancelsRequestId,orgId,status:'APPROVED',employeeId:employee.id,cancelsRequestId:null}});if(!original||!reason(input.reason)||await tx.workTimeRequest.findFirst({where:{orgId,cancelsRequestId:original.id,status:'PENDING'}}))fail('WORK_TIME_SOURCE_CHANGED',409);
   source={...original,reason:input.reason,days:[],requestedMinutes:original.requestedMinutes};
  }else source={...input,...await sourceDays(tx,orgId,employee,input)};
  if(!input.cancelsRequestId)await noOverlap(tx,orgId,employee.id,input.kind,source.days);
  const people=await tx.employee.findMany({where:{orgId,id:{in:config.approverIds},status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}}});
  if(!config.approverIds.length||people.length!==config.approverIds.length)fail('WORK_TIME_APPROVERS_REQUIRED');
  if(config.approverIds.includes(actorId)||config.approverIds.includes(employee.id))fail('WORK_TIME_SELF_APPROVAL');
  const row=await tx.workTimeRequest.create({data:{orgId,employeeId:employee.id,drafterId:actorId,kind:source.kind,startDate:source.startDate,endDate:source.endDate,startTime:['OVERTIME','SPECIAL'].includes(source.kind)?source.startTime:null,endTime:['OVERTIME','SPECIAL'].includes(source.kind)?source.endTime:null,requestedMinutes:source.requestedMinutes,reason:source.reason.trim(),policy:{...config,drafterRole:actor.orgRole,calendarSnapshot:source.calendarSnapshot||null,requestedDays:source.days},clientKey:input.clientKey,requestHash:hash,cancelsRequestId:input.cancelsRequestId||null}});
  if(source.days.length)await tx.workTimeDay.createMany({data:source.days.map((d:any)=>({...d,orgId,requestId:row.id}))});
  await tx.workTimeStep.createMany({data:config.approverIds.map((id:number,position:number)=>({orgId,requestId:row.id,employeeId:id,position:position+1,role:people.find((p:any)=>p.id===id).orgRole}))});
  return readWorkTimeRequest(tx,orgId,actorId,row.id);
 },60000);
}
export async function readWorkTimeRequest(db:any,orgId:number,actorId:number,id:string){
 const actor=await workTimeActor(db,orgId,actorId);const row=await db.workTimeRequest.findFirst({where:{id,orgId},include:workTimeInclude});
 if(!row||actor.orgRole!=='ADMIN'&&row.drafterId!==actorId&&row.employeeId!==actorId&&!row.steps.some((s:any)=>s.employeeId===actorId))fail('WORK_TIME_NOT_FOUND',404);
 const config=await workTimePolicy(db,orgId);
 const canRequest=(row.employeeId===actorId?config.drafterRoles:config.proxyRoles).includes(actor.orgRole);
 const next=row.steps.find((s:any)=>!row.decisions.some((d:any)=>d.position===s.position));
 const locked=await db.payrollSnapshot.findMany({where:{orgId,isProvisional:false,month:{gte:row.startDate.slice(0,7),lte:row.endDate.slice(0,7)}},select:{data:true}});
 return {...row,drafter:{...row.drafter,orgRole:row.policy.drafterRole},days:row.days.map((d:any)=>({...d,portion:Number(d.portion)})),canDecide:row.status==='PENDING'&&next?.employeeId===actorId&&next.role===actor.orgRole,canWithdraw:row.status==='PENDING'&&row.drafterId===actorId,canCancel:canRequest&&row.status==='APPROVED'&&!row.cancelsRequestId,payrollLocked:locked.some((snapshot:any)=>Array.isArray(snapshot.data)&&snapshot.data.some((person:any)=>Number(person.workerId)===row.employeeId))};
}
export async function decideWorkTimeRequest(db:any,orgId:number,actorId:number,id:string,input:any){
 if(!['APPROVED','REJECTED','WITHDRAWN'].includes(input?.decision)||input.decision==='REJECTED'&&!reason(input.reason))fail('WORK_TIME_INVALID_INPUT');
 return retryEditTransaction(db,async(tx:any)=>{
  await tx.$queryRawUnsafe("SELECT set_config('baro.work_time_actor',$1,true)",String(actorId));
  await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);const actor=await workTimeActor(tx,orgId,actorId),row=await readWorkTimeRequest(tx,orgId,actorId,id);
  const prior=row.decisions.find((d:any)=>d.actorId===actorId&&d.position===input.revision+1);
  if(prior&&prior.decision===input.decision&&prior.reason===(input.reason?.trim()||null)&&!(prior.position===row.steps.length&&row.requestedMinutes!=null&&!row.cancelsRequestId&&input.decision==='APPROVED'&&Number(input.approvedMinutes)!==row.approvedMinutes))return row;
  if(row.status!=='PENDING'){if(row.status==='WITHDRAWN'&&input.decision==='WITHDRAWN'&&row.drafterId===actorId&&input.revision===row.revision-1)return row;fail('WORK_TIME_SOURCE_CHANGED',409);}
  if(input.revision!==row.revision)fail('WORK_TIME_SOURCE_CHANGED',409);
  if(input.decision==='WITHDRAWN'){if(!row.canWithdraw)fail('WORK_TIME_ACCESS_DENIED',403);await tx.workTimeRequest.update({where:{id},data:{status:'WITHDRAWN',revision:{increment:1},decidedAt:new Date()}});return readWorkTimeRequest(tx,orgId,actorId,id);}
  if(!row.canDecide||actorId===row.drafterId||actorId===row.employeeId)fail('WORK_TIME_ACCESS_DENIED',403);
  const position=row.decisions.length+1,final=position===row.steps.length;
  let approvedMinutes:null|number=null;
  if(final&&input.decision==='APPROVED'&&!row.cancelsRequestId){
   if(row.requestedMinutes!=null){approvedMinutes=Number(input.approvedMinutes);if(!Number.isInteger(approvedMinutes)||approvedMinutes<=0||approvedMinutes>row.requestedMinutes)fail('WORK_TIME_INVALID_MINUTES');}
   await noOverlap(tx,orgId,row.employeeId,row.kind,row.days,id);
   if(row.kind.startsWith('ANNUAL')){
    const balance=await employeeLeaveBalance(tx,orgId,row.employeeId,Number(row.startDate.slice(0,4)));
    const legacy=new Set(balance.leaves.filter((d:any)=>d.kind==='ANNUAL'&&d.counted).map((d:any)=>d.leaveDate));
    const incremental=row.days.filter((d:any)=>!legacy.has(d.workDate)).reduce((sum:number,d:any)=>sum+Number(d.portion),0);
    if(balance.remaining<incremental)fail('WORK_TIME_LEAVE_BALANCE',409);
   }
  }
  if(final&&input.decision==='APPROVED'&&row.cancelsRequestId){const original=await tx.workTimeRequest.findFirst({where:{id:row.cancelsRequestId,orgId,status:'APPROVED'}});if(!original)fail('WORK_TIME_SOURCE_CHANGED',409);}
  await tx.workTimeDecision.create({data:{orgId,requestId:id,position,actorId,decision:input.decision,reason:input.reason?.trim()||null}});
  await tx.workTimeRequest.update({where:{id},data:{revision:{increment:1},...(input.decision==='REJECTED'||final?{status:input.decision,approvedMinutes,decidedAt:new Date()}:{})}});
  if(final&&input.decision==='APPROVED'&&row.cancelsRequestId)await tx.workTimeRequest.update({where:{id:row.cancelsRequestId},data:{status:'CANCELLED',revision:{increment:1}}});
  return readWorkTimeRequest(tx,orgId,actorId,id);
 },60000);
}
export async function approvedWorkTime(db:any,orgId:number,month:string){
 const rows=await db.workTimeDay.findMany({orderBy:[{workDate:'asc'},{requestId:'asc'}],where:{orgId,workDate:{gte:month+'-01',lte:month+'-31'},request:{status:'APPROVED',cancelsRequestId:null}},include:{request:{select:{id:true,employeeId:true,kind:true,approvedMinutes:true}}}});
 return rows.map((d:any)=>({requestId:d.request.id,employeeId:d.request.employeeId,workDate:d.workDate,kind:d.request.kind,approvedMinutes:d.request.approvedMinutes||0,portion:Number(d.portion)}));
}
export function registerWorkTimeRoutes(app:any,db:any,gates:any){
 const route=(method:string,path:string,action:any)=>app[method]('/work-time'+path,async(req:any,res:any)=>{
  const ctx=await gates.requireOrgRole(req,res,{allowedRoles:roles,allowSystemAdmin:false});if(!ctx)return;const actorId=gates.actorId();await workTimeActor(db,ctx.organization.id,actorId);res.json(await action(ctx.organization.id,actorId,req));
 });
 route('get','/catalog',async(orgId:number,actorId:number)=>{
  const actor=await workTimeActor(db,orgId,actorId),config=await workTimePolicy(db,orgId),proxy=config.proxyRoles.includes(actor.orgRole);
  const employees=await db.employee.findMany({where:{orgId,...(actor.orgRole==='ADMIN'||proxy?{status:{notIn:['PENDING','REJECTED']}}:{id:actorId})},select:{id:true,name:true,employeeNo:true,orgRole:true,status:true},orderBy:{name:'asc'}});
  const managers=actor.orgRole==='ADMIN'?await db.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:{in:['ADMIN','OPERATOR','ACCOUNTANT']}},select:{id:true,name:true,employeeNo:true,orgRole:true},orderBy:{name:'asc'}}):[];
  const approvers=await db.employee.findMany({where:{orgId,id:{in:config.approverIds},status:'ACTIVE'},select:{id:true,name:true,orgRole:true}});
  return {actor:{id:actor.id,name:actor.name,orgRole:actor.orgRole},employees,managers,approvers,policy:config,canConfigure:actor.orgRole==='ADMIN',canProxy:proxy};
 });
 route('get','/requests',async(orgId:number,actorId:number,req:any)=>{
  if(!validDate(req.query.start)||!validDate(req.query.end)||req.query.start>req.query.end)fail('WORK_TIME_INVALID_INPUT');const actor=await workTimeActor(db,orgId,actorId);
  const search=typeof req.query.q==='string'?req.query.q.trim().slice(0,200):'',status=typeof req.query.status==='string'?req.query.status:'';if(status&&!['PENDING','APPROVED','REJECTED','CANCELLED','WITHDRAWN'].includes(status))fail('WORK_TIME_INVALID_INPUT');
  const rows=await db.workTimeRequest.findMany({where:{orgId,...(status?{status}:{}),...(search?{AND:[{OR:[{reason:{contains:search,mode:'insensitive'}},{employee:{name:{contains:search,mode:'insensitive'}}},{employee:{employeeNo:{contains:search,mode:'insensitive'}}},{drafter:{name:{contains:search,mode:'insensitive'}}}]}]}:{}),startDate:{lte:req.query.end},endDate:{gte:req.query.start},...(actor.orgRole==='ADMIN'?{}:{OR:[{employeeId:actorId},{drafterId:actorId},{steps:{some:{employeeId:actorId}}}]})},include:workTimeInclude,orderBy:[{createdAt:'desc'},{id:'desc'}],take:201});
  return {rows:rows.slice(0,200).map((r:any)=>({...r,days:r.days.map((d:any)=>({...d,portion:Number(d.portion)}))})),hasMore:rows.length>200};
 });
 route('get','/balance',async(o:number,a:number,r:any)=>{const actor=await workTimeActor(db,o,a),config=await workTimePolicy(db,o),id=Number(r.query.employeeId),year=String(r.query.year);if(!Number.isSafeInteger(id)||!/^20\d{2}$/.test(year))fail('WORK_TIME_INVALID_INPUT');if(id!==a&&actor.orgRole!=='ADMIN'&&!config.proxyRoles.includes(actor.orgRole))fail('WORK_TIME_ACCESS_DENIED',403);if(!await db.employee.findFirst({where:{id,orgId:o}}))fail('WORK_TIME_NOT_FOUND',404);return {remaining:await workTimeAnnualBalance(db,o,id,year)};});
 route('put','/policy',(o:number,a:number,r:any)=>saveWorkTimePolicy(db,o,a,r.body));
 route('post','/requests',(o:number,a:number,r:any)=>submitWorkTimeRequest(db,o,a,r.body));
 route('get','/requests/:id',(o:number,a:number,r:any)=>readWorkTimeRequest(db,o,a,r.params.id));
 route('post','/requests/:id/decision',(o:number,a:number,r:any)=>decideWorkTimeRequest(db,o,a,r.params.id,r.body));
}
