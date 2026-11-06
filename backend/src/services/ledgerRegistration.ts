import {Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {resolveLedgerCounterparty,entryCounterparty} from './ledgerCounterparty';
const fail=(code:string):never=>{throw createHttpError(400,code);};
export async function defaultLedgerRegistration(db:any,orgId:number){
 const expense=await db.systemSetting.findUnique({where:{key:`EXPENSE_APPROVAL_POLICY:${orgId}`}});
 const senior=await db.employeeGrade.findFirst({where:{orgId,isActive:true,set:{isActive:true},...(expense?.value?.seniorGradeId?{id:expense.value.seniorGradeId}:{code:'CL2'})},orderBy:{id:'asc'}});
 return {revision:0,drafterScope:{role:'ALL',gradeId:null},registrationStages:[{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'},{role:'ACCOUNTANT',gradeId:senior?.id||null,gradeMatch:'MINIMUM'}]};
}
export async function validateLedgerRegistration(db:any,orgId:number,input:any){
 if(!Array.isArray(input?.registrationStages)||!input.registrationStages.length||input.registrationStages.length>10)fail('INVALID_APPROVAL_RULE');
 const stages=[];
 for(const stage of input.registrationStages){
  if(!['ADMIN','ACCOUNTANT','OPERATOR'].includes(stage.role)||!['ANY','EXACT','MINIMUM'].includes(stage.gradeMatch))fail('INVALID_APPROVAL_RULE');
  if(stage.gradeMatch!=='ANY'&&(!Number.isSafeInteger(stage.gradeId)||!await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}})))fail('INVALID_APPROVAL_RULE');
  stages.push({role:stage.role,gradeId:stage.gradeMatch==='ANY'?null:stage.gradeId,gradeMatch:stage.gradeMatch});
 }
 return {revision:input.revision,registrationStages:stages,drafterScope:{role:'ALL',gradeId:null}};
}
export async function ledgerRegistrationSource(db:any,orgId:number,input:any){
 const payload=input.payload,parents=payload?.rows?.filter((r:any)=>r.entryKind==='BANK');
 if(!parents?.length||payload.rows.length>50||parents.some((r:any)=>r.accountId!==parents[0].accountId||r.transactionDate!==parents[0].transactionDate||r.evidenceType==='ADJUSTMENT'))fail('LEDGER_SINGLE_ACCOUNT_REQUIRED');
 if(!payload.clientKey||input.sourceId!==payload.clientKey)fail('INVALID_TRANSACTION_KEY');
 const accountId=parents[0].accountId;
 const ledger=await db.bankLedgerAccount.findFirst({where:{id:accountId,orgId}});
 const masterId=ledger?.entityAccountId||String(accountId).replace(/^entity:/,'');
 const master=await db.organizationBankAccount.findFirst({where:{id:masterId,orgId,entityId:orgId,isActive:true},include:{currency:true}});
 if(!master)fail('LEDGER_ACCOUNT_NOT_FOUND');
 const account=ledger||{id:accountId,entityAccountId:master.id,currencyCode:master.currency.code};
 const rows=[];
 for(const row of parents){
  const allocations:any[]=[];
  if(row.evidenceType==='INVOICE'){const invoice=await db.invoice.findFirst({where:{sellerOrgId:orgId,invoiceNumber:row.evidenceNumber,status:'ISSUED'},select:{id:true}});if(!invoice)fail('LEDGER_INVOICE_NOT_FOUND');allocations.push({invoiceId:invoice.id});}
  if(row.evidenceType==='EXPENSE')for(const item of row.expenseItems||[])allocations.push({expenseItemId:item.itemId});
  const party=input.allowIncomplete&&!row.counterparty&&!allocations.length?{}:await resolveLedgerCounterparty(db,orgId,account,row,allocations);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.transactionDate)||!input.allowIncomplete&&(!/^\d+(\.\d{1,4})?$/.test(row.amount)||!new Prisma.Decimal(row.amount).gt(0)))fail('LEDGER_INVALID_AMOUNT');
  rows.push({...row,counterparty:entryCounterparty(party)});
 }
 const snapshot={account:{name:master.displayName||[master.bankName,master.accountNumber].filter(Boolean).join(' / '),currencyCode:account.currencyCode},rows};
 const revision=createHash('sha256').update(JSON.stringify({accountId,masterId:master.id,currency:account.currencyCode})).digest('hex');
 return {menu:'BANK_LEDGER',operation:'CREATE',kind:'batch',id:input.sourceId,version:null,revision,snapshot,entry:{account,evidenceType:'FILE'},items:rows.map((r:any)=>({currency:account.currencyCode,unitPrice:/^\d+(\.\d{1,4})?$/.test(r.amount)?r.amount:'0',quantity:'1',vatRate:'0'}))};
}
export async function previewLedgerRegistration(db:any,orgId:number,drafter:any,source:any,config:any,selection:any={}){
 const ids:number[]=[],stages:any[]=[],resolvedStages:any[]=[];
 for(const [index,stage] of config.registrationStages.entries()){
  const grade=stage.gradeId?await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}}):null;
  const pool=stage.gradeMatch!=='ANY'&&!grade?[]:await db.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:stage.role,...(grade?{grade:stage.gradeMatch==='MINIMUM'?{orgId,setId:grade.setId,sortOrder:{gte:grade.sortOrder},isActive:true,set:{isActive:true}}:{id:grade.id,isActive:true,set:{isActive:true}}}:{})},select:{id:true,name:true,gradeId:true,grade:{select:{name:true,nameKo:true,nameEn:true,nameVi:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
  const candidates=pool.filter((person:any)=>person.id!==drafter.id&&!ids.includes(person.id));
  const unavailableReason=stage.gradeMatch!=='ANY'&&!grade?'GRADE_NOT_CONFIGURED':candidates.length?null:pool.some((person:any)=>person.id!==drafter.id&&ids.includes(person.id))?'ALREADY_SELECTED':pool.some((person:any)=>person.id===drafter.id)?'DRAFTER_ONLY':'NO_ELIGIBLE';
  const key='step'+(index+1),chosen=candidates.find((p:any)=>p.id===(selection[key+'EmployeeId']??(candidates.length===1?candidates[0].id:null)));
  if(chosen){ids.push(chosen.id);resolvedStages.push({employeeId:chosen.id,role:stage.role,gradeId:chosen.gradeId});}
  stages.push({key,role:stage.role,gradeId:stage.gradeMatch==='EXACT'?stage.gradeId:null,minimumGradeId:stage.gradeMatch==='MINIMUM'?stage.gradeId:null,requiredGrade:grade?{id:grade.id,name:grade.name,nameKo:grade.nameKo,nameEn:grade.nameEn,nameVi:grade.nameVi}:null,gradeMatch:stage.gradeMatch,unavailableReason,employeeId:chosen?.id||null,name:chosen?.name,candidates});
 }
 const total=source.items.reduce((sum:any,i:any)=>sum.add(i.unitPrice),new Prisma.Decimal(0));
 return {ids,stages,drafter,complete:ids.length===stages.length,policy:{config,exempt:false,resolvedStages,totals:[{currency:source.entry.account.currencyCode,amount:total.toString()}]}};
}
