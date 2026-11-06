import {randomUUID,createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {normalizeEmployeePayTypePolicy,isPolicyWorkday} from './employeePayTypePolicy';
import {resolveEmployeeEffectivePayType} from './employeeCompensation';
import {employmentDateKey} from './salaryTenure';
const fail=(code:string,status=400):never=>{throw createHttpError(status,code);};
const date=(value:any)=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const reason=(value:any)=>typeof value==='string'&&value.trim().length>0&&value.trim().length<=1000;
const client=(value:any)=>typeof value==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(value);
async function employee(db:any,orgId:number,id:number){
 if(!Number.isSafeInteger(id)||id<=0)fail('LEAVE_INVALID_INPUT');
 const row=await db.employee.findFirst({where:{orgId,id,status:{notIn:['PENDING','REJECTED']}},include:{role:true}});
 if(!row)fail('LEAVE_EMPLOYEE_NOT_FOUND',404);return row;
}
async function lock(db:any,orgId:number,id:number){
 // Holiday saves lock the company first as well. This keeps calendar and balance checks atomic.
 await db.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
 await db.$queryRawUnsafe('SELECT id FROM "Employee" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',id,orgId);
}
async function calendar(db:any,orgId:number,row:any,year:number){
 const payType=resolveEmployeeEffectivePayType(row),policies=await db.employeePayTypePolicy.findMany({where:{orgId,payType}});
 const holidays=await db.organizationHoliday.findMany({where:{orgId,holidayDate:{gte:year+'-01-01',lte:year+'-12-31'}},select:{holidayDate:true}});
 return {policy:normalizeEmployeePayTypePolicy(policies[0],payType),holidays:new Set(holidays.map((day:any)=>day.holidayDate))};
}
export async function employeeLeaveBalance(db:any,orgId:number,id:number,year:number){
 const row=await employee(db,orgId,id),schedule=await calendar(db,orgId,row,year);
 const grants=await db.$queryRawUnsafe('SELECT * FROM "EmployeeLeaveGrant" WHERE "orgId"=$1 AND "employeeId"=$2 AND "year"=$3 ORDER BY "createdAt" DESC',orgId,id,year);
 const leaves=await db.$queryRawUnsafe('SELECT * FROM "EmployeeLeaveDay" WHERE "orgId"=$1 AND "employeeId"=$2 AND "leaveDate">=$3 AND "leaveDate"<=$4 ORDER BY "leaveDate" DESC,"createdAt" DESC',orgId,id,year+'-01-01',year+'-12-31');
 const counted=(entry:any)=>!entry.cancelledAt&&!schedule.holidays.has(entry.leaveDate)&&isPolicyWorkday(entry.leaveDate,schedule.policy);
 const granted=grants.reduce((sum:number,entry:any)=>sum+entry.days,0),used=leaves.filter((entry:any)=>entry.kind==='ANNUAL'&&counted(entry)).length;
 return {employee:{id:row.id,name:row.name,employeeNo:row.employeeNo},year,granted,used,remaining:granted-used,grants,leaves:leaves.map((entry:any)=>({...entry,counted:counted(entry)}))};
}
export async function grantEmployeeLeave(db:any,orgId:number,id:number,actorId:number,input:any){
 if(!Number.isInteger(input?.year)||input.year<1900||input.year>2200||!Number.isInteger(input?.days)||!input.days||Math.abs(input.days)>366||!reason(input.reason)||!client(input.clientKey))fail('LEAVE_INVALID_INPUT');
 return db.$transaction(async(tx:any)=>{
  await lock(tx,orgId,id);await employee(tx,orgId,id);
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'},select:{id:true}});if(!actor)fail('LEAVE_ACCESS_DENIED',403);
  const previous=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeLeaveGrant" WHERE "orgId"=$1 AND "clientKey"=$2',orgId,input.clientKey))[0];
  if(previous){if(previous.employeeId!==id||previous.year!==input.year||previous.days!==input.days||previous.reason!==input.reason.trim()||previous.createdByEmployeeId!==actorId)fail('LEAVE_RETRY_CONFLICT',409);return employeeLeaveBalance(tx,orgId,id,input.year);}
  const balance=await employeeLeaveBalance(tx,orgId,id,input.year);if(balance.remaining+input.days<0)fail('LEAVE_INSUFFICIENT_BALANCE',409);
  await tx.$executeRawUnsafe('INSERT INTO "EmployeeLeaveGrant" (id,"orgId","employeeId","year",days,reason,"clientKey","createdByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8)',randomUUID(),orgId,id,input.year,input.days,input.reason.trim(),input.clientKey,actorId);
  return employeeLeaveBalance(tx,orgId,id,input.year);
 });
}
export async function recordEmployeeLeave(db:any,orgId:number,id:number,actorId:number,input:any){
 if(!date(input?.startDate)||!date(input?.endDate)||input.startDate>input.endDate||input.startDate.slice(0,4)!==input.endDate.slice(0,4)||!['ANNUAL','PAID','UNPAID'].includes(input.kind)||!reason(input.reason)||!client(input.clientKey))fail('LEAVE_INVALID_INPUT');
 const year=Number(input.startDate.slice(0,4));if(year<1900||year>2200)fail('LEAVE_INVALID_INPUT');
 return db.$transaction(async(tx:any)=>{
  await lock(tx,orgId,id);const row=await employee(tx,orgId,id),schedule=await calendar(tx,orgId,row,year);
  const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}},select:{id:true}});if(!actor)fail('LEAVE_ACCESS_DENIED',403);
  const dates:string[]=[];
  for(const current=new Date(input.startDate+'T00:00:00Z');current.toISOString().slice(0,10)<=input.endDate;current.setUTCDate(current.getUTCDate()+1)){
   const key=current.toISOString().slice(0,10);if(!isPolicyWorkday(key,schedule.policy)||schedule.holidays.has(key))continue;
   if(employmentDateKey(row.joinedAt)&&key<employmentDateKey(row.joinedAt)||employmentDateKey(row.leftAt)&&key>employmentDateKey(row.leftAt))fail('LEAVE_OUTSIDE_EMPLOYMENT');dates.push(key);
  }
  if(!dates.length)fail('LEAVE_NO_WORKDAYS');
  const hash=createHash('sha256').update(JSON.stringify({id,kind:input.kind,startDate:input.startDate,endDate:input.endDate,reason:input.reason.trim()})).digest('hex');
  const previous=await tx.$queryRawUnsafe('SELECT * FROM "EmployeeLeaveDay" WHERE "orgId"=$1 AND left("clientKey",length($2)+1)=$2||chr(58)',orgId,input.clientKey);
  if(previous.length){if(previous.some((entry:any)=>entry.requestHash!==hash||entry.createdByEmployeeId!==actorId))fail('LEAVE_RETRY_CONFLICT',409);return employeeLeaveBalance(tx,orgId,id,year);}
  const balance=await employeeLeaveBalance(tx,orgId,id,year);if(input.kind==='ANNUAL'&&balance.remaining<dates.length)fail('LEAVE_INSUFFICIENT_BALANCE',409);
  if(balance.leaves.some((entry:any)=>!entry.cancelledAt&&dates.includes(entry.leaveDate)))fail('LEAVE_DATE_OVERLAP',409);
  if(await tx.attendanceEntry.findFirst({where:{orgId,workerId:id,workDate:{in:dates},managementExcluded:false,workedSeconds:{gt:0}},select:{id:true}}))fail('LEAVE_ATTENDANCE_CONFLICT',409);
  for(const day of dates)await tx.$executeRawUnsafe('INSERT INTO "EmployeeLeaveDay" (id,"orgId","employeeId","leaveDate",kind,reason,"clientKey","requestHash","createdByEmployeeId") VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',randomUUID(),orgId,id,day,input.kind,input.reason.trim(),input.clientKey+':'+day,hash,actorId);
  return employeeLeaveBalance(tx,orgId,id,year);
 });
}
export async function cancelEmployeeLeave(db:any,orgId:number,id:number,actorId:number,leaveId:string,input:any){
 if(!reason(input?.reason))fail('LEAVE_INVALID_INPUT');
 return db.$transaction(async(tx:any)=>{
  await lock(tx,orgId,id);const actor=await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:['ADMIN','ACCOUNTANT','OPERATOR']}},select:{id:true}});if(!actor)fail('LEAVE_ACCESS_DENIED',403);
  const entry=(await tx.$queryRawUnsafe('SELECT * FROM "EmployeeLeaveDay" WHERE id=$1 AND "orgId"=$2 AND "employeeId"=$3',leaveId,orgId,id))[0];if(!entry)fail('LEAVE_NOT_FOUND',404);
  if(!entry.cancelledAt)await tx.$executeRawUnsafe('UPDATE "EmployeeLeaveDay" SET "cancelledAt"=CURRENT_TIMESTAMP,"cancelledByEmployeeId"=$1,"cancellationReason"=$2 WHERE id=$3',actorId,input.reason.trim(),leaveId);
  return employeeLeaveBalance(tx,orgId,id,Number(entry.leaveDate.slice(0,4)));
 });
}
export async function loadPayrollLeaves(db:any,orgId:number,month:string){
 return db.$queryRawUnsafe('SELECT "employeeId","leaveDate",kind FROM "EmployeeLeaveDay" WHERE "orgId"=$1 AND "leaveDate">=$2 AND "leaveDate"<=$3 AND "cancelledAt" IS NULL',orgId,month+'-01',month+'-31');
}
export async function assertCompanyLeaveBalances(db:any,orgId:number){
 const groups=await db.$queryRawUnsafe('SELECT DISTINCT "employeeId",left("leaveDate",4)::integer AS year FROM "EmployeeLeaveDay" WHERE "orgId"=$1 AND kind=$2 AND "cancelledAt" IS NULL',orgId,'ANNUAL');
 for(const group of groups)if((await employeeLeaveBalance(db,orgId,group.employeeId,group.year)).remaining<0)fail('LEAVE_INSUFFICIENT_BALANCE',409);
}
export function registerEmployeeLeaveRoutes(app:any,db:any,gates:any){
 const route=(method:string,path:string,action:any)=>app[method](path,async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!access)return;
  const policy=await gates.loadPolicy();if(!policy.policy?.[access.organization.type]?.[access.employee?.orgRole]?.includes('HOLIDAY'))return res.status(403).json({error:'LEAVE_ACCESS_DENIED'});
  if(req.params.id&&(!Number.isSafeInteger(Number(req.params.id))||Number(req.params.id)<=0))fail('LEAVE_INVALID_INPUT');
  return res.json(await action(req,access.organization.id,gates.actorId()));
 });
 route('get','/employee-leaves',async(req:any,orgId:number)=>{
  const year=Number(req.query.year);if(!Number.isInteger(year)||year<1900||year>2200)fail('LEAVE_INVALID_INPUT');
  const employees=await db.employee.findMany({where:{orgId,status:{notIn:['PENDING','REJECTED']}},select:{id:true,name:true,employeeNo:true},orderBy:{name:'asc'}}),id=Number(req.query.employeeId);
  if(req.query.employeeId&&(!Number.isSafeInteger(id)||id<=0))fail('LEAVE_INVALID_INPUT');
  return {employees,balance:id?await employeeLeaveBalance(db,orgId,id,year):null};
 });
 route('post','/employees/:id/leave-grants',(r:any,o:number,a:number)=>grantEmployeeLeave(db,o,Number(r.params.id),a,r.body));
 route('post','/employees/:id/leaves',(r:any,o:number,a:number)=>recordEmployeeLeave(db,o,Number(r.params.id),a,r.body));
 route('post','/employees/:id/leaves/:leaveId/cancel',(r:any,o:number,a:number)=>cancelEmployeeLeave(db,o,Number(r.params.id),a,r.params.leaveId,r.body));
}
