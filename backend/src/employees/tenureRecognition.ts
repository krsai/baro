import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {companyBusinessTimeZone} from '../services/serviceCompany';
import {resolveCurrentPayrollMonthKey} from '../utils/payrollMonth';
import {resolveSalaryTenureYears} from './salaryTenure';

export const tenureRecognitionInclude={orderBy:[{effectiveMonth:'desc' as const},{id:'desc' as const}]};
export function resolveRecognizedTenure(employee:any,month:string){
 const actualYears=resolveSalaryTenureYears(employee.joinedAt??employee.approvedAt??employee.createdAt,month,employee.leftAt);
 const version=(employee.tenureRecognitions||[]).filter((row:any)=>row.effectiveMonth<=month)
  .sort((a:any,b:any)=>b.effectiveMonth.localeCompare(a.effectiveMonth)||b.id-a.id)[0];
 const additionalYears=version?.additionalYears??0;
 return {actualYears,additionalYears,recognizedYears:actualYears+additionalYears,recognitionId:version?.id??null};
}
export function recognizedTenureParameters(employee:any,month:string){
 const tenure=resolveRecognizedTenure(employee,month);
 return {TENURE_YEARS:tenure.recognizedYears,ACTUAL_TENURE_YEARS:tenure.actualYears,ADDITIONAL_TENURE_YEARS:tenure.additionalYears,TENURE_RECOGNITION_ID:tenure.recognitionId??0};
}
async function actor(db:any,orgId:number,actorId:number,write=false){
 if(!Number.isSafeInteger(actorId)||actorId<=0)throw createHttpError(403,'TENURE_ADMIN_REQUIRED');
 const value=await db.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:write?['ADMIN']:['ADMIN','ACCOUNTANT','OPERATOR']}}});
 if(!value)throw createHttpError(403,'TENURE_ADMIN_REQUIRED');return value;
}
export async function readTenureRecognition(db:any,orgId:number,employeeId:number,actorId:number,currentMonth:string){
 const user=await actor(db,orgId,actorId);
 const employee=await db.employee.findFirst({where:{id:employeeId,orgId},include:{tenureRecognitions:tenureRecognitionInclude}});
 if(!employee)throw createHttpError(404,'EMPLOYEE_NOT_FOUND');
 return {employeeId,employeeName:employee.name,joinedAt:employee.joinedAt,currentMonth,canEdit:user.orgRole==='ADMIN',
  revision:Math.max(0,...employee.tenureRecognitions.map((row:any)=>row.id)),...resolveRecognizedTenure(employee,currentMonth),
  history:employee.tenureRecognitions};
}
export async function saveTenureRecognition(db:any,orgId:number,employeeId:number,actorId:number,input:any,currentMonth:string){
 if(!Number.isSafeInteger(input?.revision)||input.revision<0||!Number.isInteger(input?.additionalYears)||input.additionalYears<0||input.additionalYears>100
  ||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input?.effectiveMonth)
  ||typeof input?.reason!=='string'||!input.reason.trim()||input.reason.trim().length>1000
  ||typeof input?.clientKey!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.clientKey))throw createHttpError(400,'TENURE_INVALID_INPUT');
 return retryEditTransaction(db,async(tx:any)=>{
  await actor(tx,orgId,actorId,true);
  const employee=await tx.employee.findFirst({where:{id:employeeId,orgId,status:{notIn:['PENDING','REJECTED']}},select:{id:true}});
  if(!employee)throw createHttpError(404,'EMPLOYEE_NOT_FOUND');
  await tx.$queryRawUnsafe('SELECT id FROM "Employee" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',employeeId,orgId);
  const duplicate=await tx.employeeTenureRecognition.findUnique({where:{orgId_clientKey:{orgId,clientKey:input.clientKey}}});
  if(duplicate){
   if(duplicate.employeeId!==employeeId||duplicate.createdByEmployeeId!==actorId||duplicate.additionalYears!==input.additionalYears||duplicate.effectiveMonth!==input.effectiveMonth||duplicate.reason!==input.reason.trim())throw createHttpError(409,'TENURE_RETRY_CONFLICT');
   return readTenureRecognition(tx,orgId,employeeId,actorId,currentMonth);
  }
  if(input.effectiveMonth<currentMonth)throw createHttpError(400,'TENURE_INVALID_INPUT');
  const latest=await tx.employeeTenureRecognition.findFirst({where:{orgId,employeeId},orderBy:{id:'desc'}});
  if((latest?.id??0)!==input.revision)throw createHttpError(409,'TENURE_CHANGED');
  await tx.employeeTenureRecognition.create({data:{orgId,employeeId,additionalYears:input.additionalYears,effectiveMonth:input.effectiveMonth,reason:input.reason.trim(),clientKey:input.clientKey,createdByEmployeeId:actorId}});
  return readTenureRecognition(tx,orgId,employeeId,actorId,currentMonth);
 });
}
export function registerTenureRecognitionRoutes(app:any,db:any,gates:any){
 for(const method of ['get','put'])app[method]('/employees/:id/tenure-recognition',async(req:any,res:any)=>{
  const access=await gates.requireOrgRole(req,res,{allowedRoles:method==='put'?['ADMIN']:['ADMIN','ACCOUNTANT','OPERATOR'],allowSystemAdmin:false});if(!access)return;
  const policy=await gates.loadPolicy();
  if(!policy.policy?.[access.organization.type]?.[access.employee?.orgRole]?.includes('EMPLOYEE'))return res.status(403).json({error:'TENURE_ACCESS_DENIED'});
  const id=Number(req.params.id),actorId=gates.actorId();if(!Number.isSafeInteger(id)||id<=0)throw createHttpError(400,'EMPLOYEE_INVALID_ID');
  const month=resolveCurrentPayrollMonthKey({timeZone:companyBusinessTimeZone(access.organization)});
  res.json(method==='put'?await saveTenureRecognition(db,access.organization.id,id,actorId,req.body,month):await readTenureRecognition(db,access.organization.id,id,actorId,month));
 });
}
