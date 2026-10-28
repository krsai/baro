import { createHttpError } from '../utils/http';
import { Prisma } from '@prisma/client';
import { calculateRequestAmounts } from './transactionRequest';

export const EXPENSE_APPROVAL_ROLES = ['ADMIN','ACCOUNTANT'];
export const approvalSettingKey = (orgId:number) => `EXPENSE_APPROVAL_POLICY:${orgId}`;
export const defaultApprovalSettings = () => ({limits:{VND:{senior:'20000000',lead:'100000000'},USD:{senior:'1000',lead:'5000'},KRW:{senior:'1000000',lead:'5000000'}}});

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
  return result;
}

export async function resolveExpenseApproval(tx:any, orgId:number, drafterId:number,items:any[]=[],selection?:any,allowIncomplete=false) {
  const drafter = await tx.employee.findFirst({where:{id:drafterId,orgId,status:'ACTIVE'},select:{id:true,name:true,orgRole:true,gradeId:true,grade:{select:{isActive:true,set:{select:{isActive:true}}}}}});
  if(!drafter) throw createHttpError(403,'ACTIVE_EMPLOYEE_REQUIRED');
  const setting = await tx.systemSetting.findUnique({where:{key:approvalSettingKey(orgId)}});
  const config=setting?.value||defaultApprovalSettings();
  if(selection!==undefined && (!selection||typeof selection!=='object'||Array.isArray(selection)))throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
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
  const ownLevel=drafter.orgRole==='ACCOUNTANT'&&drafter.grade?.isActive&&drafter.grade.set?.isActive ? drafter.gradeId===config.leadGradeId?1:!config.seniorGradeId||drafter.gradeId===config.seniorGradeId?0:-1 : -1;
  const ids:number[]=[],skipped:string[]=[],stages:any[]=[];let requiredLevel=level,complete=true;
  for(let index=0;index<=requiredLevel;index++){
    if(index<=ownLevel)continue;
    const key=['senior','lead','admin'][index]!;
    const gradeId=config[`${key}GradeId`];
    const where={orgId,status:'ACTIVE',orgRole:index===2?'ADMIN':'ACCOUNTANT',...(index<2?{...(gradeId?{gradeId}:{}),grade:{isActive:true,set:{isActive:true}}}:{})};
    const candidates=await tx.employee.findMany({where:{...where,id:{notIn:[drafterId,...ids]}},select:{id:true,name:true,gradeId:true,grade:{select:{name:true,nameEn:true,nameKo:true,nameVi:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
    const employeeId=selection===undefined?(candidates.length===1?candidates[0].id:null):selection[`${key}EmployeeId`];
    if(employeeId!=null&&(!Number.isSafeInteger(employeeId)||employeeId<=0))throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
    if(index<2&&!candidates.length){
      skipped.push(key);stages.push({key,employeeId:null,vacant:true,candidates});requiredLevel=Math.max(requiredLevel,index+1);continue;
    }
    const employee=employeeId ? await tx.employee.findFirst({where:{...where,id:employeeId}}):null;
    if(selection!==undefined&&employeeId&&(!employee||employeeId===drafterId||ids.includes(employeeId))){
      if(!allowIncomplete)throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
      complete=false;stages.push({key,employeeId:null,candidates,invalid:true});continue;
    }
    if(!employee){
      complete=false;stages.push({key,employeeId:null,candidates});
      if(!allowIncomplete)throw createHttpError(400,'EXPENSE_APPROVER_REQUIRED');
      continue;
    }
    if(employeeId===drafterId)throw createHttpError(400,'EXPENSE_SELF_APPROVAL');
    if(ids.includes(employeeId))throw createHttpError(400,'INVALID_EXPENSE_APPROVERS');
    ids.push(employeeId);stages.push({key,employeeId,name:employee.name,candidates});
  }
  return {ids,complete,stages,drafter,policy:{drafterId,exempt:complete&&!ids.length&&ownLevel>=level,config,skipped,level,...(selection===undefined?{}:{selection}),totals:[...totals].map(([currency,amount])=>({currency,amount:amount.toString()}))}};
}
export const EXPENSE_APPROVAL_INCLUDE = { orderBy: { position: 'asc' as const }, include: {employee: { select: { id:true, name:true, status:true } }} };

export async function replaceExpenseApprovers(tx:any,orgId:number,requestId:number,ids:number[],previous:any[]=[]) {
  if(JSON.stringify(ids)===JSON.stringify(previous.map(step=>step.employeeId)))return;
  await tx.expenseRequestApprovalStep.deleteMany({where:{orgId,requestId}});
  for(const [index,employeeId] of ids.entries())await tx.expenseRequestApprovalStep.create({data:{orgId,requestId,employeeId,position:index+1}});
}
