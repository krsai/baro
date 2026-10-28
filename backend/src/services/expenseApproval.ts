import { createHttpError } from '../utils/http';
import { Prisma } from '@prisma/client';
import { calculateRequestAmounts } from './transactionRequest';

export const EXPENSE_APPROVAL_ROLES = ['ADMIN','ACCOUNTANT'];
export const approvalSettingKey = (orgId:number) => `EXPENSE_APPROVAL_POLICY:${orgId}`;
export const defaultApprovalSettings = () => ({limits:{VND:{senior:'20000000',lead:'100000000'},USD:{senior:'1000',lead:'5000'},KRW:{senior:'1000000',lead:'5000000'}},seniorGradeId:null,leadGradeId:null,seniorEmployeeId:null,leadEmployeeId:null,adminEmployeeId:null});

export async function validateApprovalSettings(tx:any,orgId:number,value:any){
  if(!value||typeof value!=='object')throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  const result:any={limits:{}};
  for(const currency of ['VND','USD','KRW']){
    const limits=value.limits?.[currency];
    if(currency!=='VND'&&!limits?.senior&&!limits?.lead){result.limits[currency]={senior:'',lead:''};continue;}
    result.limits[currency]={};
    for(const level of ['senior','lead']){
      const amount=limits?.[level];
      if(typeof amount!=='string'||!(currency==='USD'?/^\d{1,15}(\.\d{1,2})?$/:/^\d{1,15}$/).test(amount)||new Prisma.Decimal(amount).lte(0))throw createHttpError(400,'INVALID_APPROVAL_LIMIT');
      result.limits[currency][level]=new Prisma.Decimal(amount).toFixed();
    }
    if(new Prisma.Decimal(limits.senior).gte(limits.lead))throw createHttpError(400,'INVALID_APPROVAL_LIMIT');
  }
  for(const level of ['senior','lead']){
    const gradeId=value[`${level}GradeId`]||null,employeeId=value[`${level}EmployeeId`]||null;
    if(gradeId && (!Number.isSafeInteger(gradeId)||!await tx.employeeGrade.findFirst({where:{id:gradeId,orgId,isActive:true,set:{isActive:true}}})))throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
    if(employeeId && (!Number.isSafeInteger(employeeId)||!gradeId||!await tx.employee.findFirst({where:{id:employeeId,orgId,status:'ACTIVE',orgRole:'ACCOUNTANT',gradeId}})))throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
    result[`${level}GradeId`]=gradeId;result[`${level}EmployeeId`]=employeeId;
  }
  if(result.seniorGradeId&&result.seniorGradeId===result.leadGradeId)throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  const adminId=value.adminEmployeeId;
  if(!Number.isSafeInteger(adminId)||!await tx.employee.findFirst({where:{id:adminId,orgId,status:'ACTIVE',orgRole:'ADMIN'}}))throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  result.adminEmployeeId=adminId;
  return result;
}

export async function resolveExpenseApproval(tx:any, orgId:number, drafterId:number,items:any[]=[]) {
  const drafter = await tx.employee.findFirst({where:{id:drafterId,orgId,status:'ACTIVE'},select:{id:true,name:true,orgRole:true,gradeId:true,grade:{select:{isActive:true,set:{select:{isActive:true}}}}}});
  if(!drafter) throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
  const setting = await tx.systemSetting.findUnique({where:{key:approvalSettingKey(orgId)}});
  if(!setting)throw createHttpError(400,'EXPENSE_APPROVER_REQUIRED');
  const config=setting.value;
  const totals=new Map<string,Prisma.Decimal>();
  if(!Array.isArray(items)||!items.length||items.length>50)throw createHttpError(400,'EXPENSE_REQUEST_ITEMS_REQUIRED');
  for(const [index,item] of items.entries()){
    try{
      if(!item||typeof item!=='object'||Array.isArray(item))throw createHttpError(400,'INVALID_EXPENSE_REQUEST_ITEM');
      const amount=calculateRequestAmounts(item.unitPrice,item.quantity,item.currency,item.vatRate).amount;
      totals.set(item.currency,(totals.get(item.currency)||new Prisma.Decimal(0)).add(amount));
    }catch(error:any){error.expenseLine=index+1;error.message=`EXPENSE_LINE:${index+1}:${error.message}`;throw error;}
  }
  let level=0;
  for(const [currency,amount] of totals){
    const limits=config.limits?.[currency];
    if(!limits?.senior||!limits?.lead)throw createHttpError(400,'APPROVAL_CURRENCY_LIMIT_REQUIRED');
    level=Math.max(level,amount.lte(limits.senior)?0:amount.lte(limits.lead)?1:2);
  }
  const ownLevel=drafter.orgRole==='ACCOUNTANT'&&drafter.grade?.isActive&&drafter.grade.set?.isActive ? drafter.gradeId===config.leadGradeId?1:drafter.gradeId===config.seniorGradeId?0:-1 : -1;
  const ids:number[]=[],skipped:string[]=[];let requiredLevel=level;
  for(let index=0;index<=requiredLevel;index++){
    if(index<=ownLevel)continue;
    const key=['senior','lead','admin'][index]!;
    const employeeId=config[`${key}EmployeeId`];
    const employee=employeeId ? await tx.employee.findFirst({where:{id:employeeId,orgId,status:'ACTIVE',orgRole:index===2?'ADMIN':'ACCOUNTANT',...(index<2?{gradeId:config[`${key}GradeId`],grade:{isActive:true,set:{isActive:true}}}:{})}}):null;
    if(!employee){
      if(index===2)throw createHttpError(400,'EXPENSE_APPROVER_REQUIRED');
      skipped.push(key);requiredLevel=Math.max(requiredLevel,index+1);continue;
    }
    if(employeeId===drafterId)throw createHttpError(400,'EXPENSE_SELF_APPROVAL');
    ids.push(employeeId);
  }
  return {ids,policy:{drafterId,exempt:!ids.length&&ownLevel>=level,config,skipped,level,totals:[...totals].map(([currency,amount])=>({currency,amount:amount.toString()}))}};
}
export const EXPENSE_APPROVAL_INCLUDE = { orderBy: { position: 'asc' as const }, include: {employee: { select: { id:true, name:true, status:true } }} };

export async function validateExpenseApprovers(tx:any, orgId:number, value:unknown) {
  const ids = value ?? [];
  if(!Array.isArray(ids) || ids.length>20 || new Set(ids).size!==ids.length || ids.some(id=>!Number.isSafeInteger(id)||id<=0))
    throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  if(ids.length) {
    const employees=await tx.employee.findMany({where:{id:{in:ids},orgId,status:'ACTIVE',orgRole:{in:EXPENSE_APPROVAL_ROLES}},select:{id:true}});
    if(employees.length!==ids.length)throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
  }
  return ids as number[];
}

export async function replaceExpenseApprovers(tx:any,orgId:number,requestId:number,ids:number[],previous:any[]=[]) {
  if(JSON.stringify(ids)===JSON.stringify(previous.map(step=>step.employeeId)))return;
  await tx.expenseRequestApprovalStep.deleteMany({where:{orgId,requestId}});
  for(const [index,employeeId] of ids.entries())await tx.expenseRequestApprovalStep.create({data:{orgId,requestId,employeeId,position:index+1}});
}
