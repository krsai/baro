import {Prisma} from '@prisma/client';
import {createHash} from 'node:crypto';
import {createHttpError} from '../utils/http';
import {resolveLedgerCounterparty,entryCounterparty} from './ledgerCounterparty';
import {validateApprovalRules,resolveApprovalRules} from './approvalRules';
import {defaultApprovalSettings} from './expenseApproval';
import {canSkipApprovalStage} from './approvalStageAuthority';
import {flexibleApprovalStages,hasApprovalGradeVacancy} from './flexibleApprovalStages';
import {validateLedgerMoney,ledgerScale4} from './bankLedger';
const subject={key:'BANK_LEDGER',menuPath:'/bank-ledger',hasAmount:true,enabled:true};
const fail=(code:string):never=>{throw createHttpError(400,code);};
export async function defaultLedgerRegistration(db:any,orgId:number){
 const expense=await db.systemSetting.findUnique({where:{key:`EXPENSE_APPROVAL_POLICY:${orgId}`}});
 const senior=await db.employeeGrade.findFirst({where:{orgId,isActive:true,set:{isActive:true},...(expense?.value?.seniorGradeId?{id:expense.value.seniorGradeId}:{code:'CL2'})},orderBy:{id:'asc'}});
 return {revision:0,drafterScope:{role:'ALL',gradeId:null},registrationStages:[{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'},{role:'ACCOUNTANT',gradeId:senior?.id||null,gradeMatch:'MINIMUM'}]};
}
export async function validateLedgerRegistration(db:any,orgId:number,input:any){
 const scope=input?.drafterScope||{role:'ALL',gradeId:null};
 if(!['ALL','ADMIN','ACCOUNTANT','OPERATOR'].includes(scope.role)||scope.gradeId!=null&&(!Number.isSafeInteger(scope.gradeId)||!await db.employeeGrade.findFirst({where:{id:scope.gradeId,orgId,isActive:true,set:{isActive:true}}})))fail('INVALID_APPROVAL_RULE');
 if(input?.rules!==undefined&&input?.kind==='BANK_LEDGER'){
  if(!Array.isArray(input.rules)||!input.rules.length)fail('INVALID_APPROVAL_RULE');
  return {...(input.stageAuthorityVersion===1?{stageAuthorityVersion:1}:{}),version:2,kind:'BANK_LEDGER',revision:input.revision,drafterScope:scope,limits:defaultApprovalSettings().limits,rules:await validateApprovalRules(db,orgId,input.rules,subject)};
 }
 if(!Array.isArray(input?.registrationStages)||!input.registrationStages.length||input.registrationStages.length>10)fail('INVALID_APPROVAL_RULE');
 const stages=[];
 for(const stage of input.registrationStages){
  if(!['ADMIN','ACCOUNTANT','OPERATOR'].includes(stage.role)||!['ANY','EXACT','MINIMUM'].includes(stage.gradeMatch))fail('INVALID_APPROVAL_RULE');
  if(stage.gradeMatch!=='ANY'&&(!Number.isSafeInteger(stage.gradeId)||!await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}})))fail('INVALID_APPROVAL_RULE');
  stages.push({role:stage.role,gradeId:stage.gradeMatch==='ANY'?null:stage.gradeId,gradeMatch:stage.gradeMatch});
 }
 return {revision:input.revision,registrationStages:stages,drafterScope:scope};
}
export async function ledgerRegistrationSource(db:any,orgId:number,input:any){
 const payload=input.payload,parents=payload?.rows?.filter((r:any)=>r.entryKind==='BANK');
 if(!parents?.length||payload.rows.length>50||parents.some((r:any)=>r.transactionDate!==parents[0].transactionDate||r.evidenceType==='ADJUSTMENT'))fail('LEDGER_SINGLE_ACCOUNT_REQUIRED');
 if(!payload.clientKey||input.sourceId!==payload.clientKey)fail('INVALID_TRANSACTION_KEY');
 const rows=[],items=[],transferTargets=[],accountSources=[];
 for(const row of parents){
 const accountId=row.accountId;
 const ledger=await db.bankLedgerAccount.findFirst({where:{id:accountId,orgId}});
 const masterId=ledger?.entityAccountId||String(accountId).replace(/^entity:/,'');
 const master=await db.organizationBankAccount.findFirst({where:{id:masterId,orgId,entityId:orgId,isActive:true},include:{currency:true}});
 if(!master)fail('LEDGER_ACCOUNT_NOT_FOUND');
 const account=ledger||{id:accountId,entityAccountId:master.id,currencyCode:master.currency.code};
 accountSources.push({accountId,masterId:master.id,currency:account.currencyCode,name:master.displayName||[master.bankName,master.accountNumber].filter(Boolean).join(' / ')});
  const allocations:any[]=[];
  if(row.evidenceType==='INVOICE'){const invoice=await db.invoice.findFirst({where:{sellerOrgId:orgId,invoiceNumber:row.evidenceNumber,status:'ISSUED'},select:{id:true}});if(!invoice)fail('LEDGER_INVOICE_NOT_FOUND');allocations.push({invoiceId:invoice.id});}
  if(row.evidenceType==='EXPENSE')for(const item of row.expenseItems||[])allocations.push({expenseItemId:item.itemId});
  const party=input.allowIncomplete&&!row.counterparty&&!allocations.length?{}:await resolveLedgerCounterparty(db,orgId,account,row,allocations);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(row.transactionDate)||!input.allowIncomplete&&(!/^\d+(\.\d{1,4})?$/.test(row.amount)||!new Prisma.Decimal(row.amount).gt(0)))fail('LEDGER_INVALID_AMOUNT');
  if(row.evidenceType==='PAYROLL'&&!input.allowIncomplete){
   const item=await db.payrollPayableItem.findFirst({where:{id:row.payrollItemId,orgId,voidedAt:null},include:{document:{include:{snapshot:true}}}});
   if(!item||item.document.snapshot.isProvisional||item.snapshotRevision!==item.document.snapshot.revision||item.currencyCode!==account.currencyCode||row.transactionDate<item.document.month+'-01'||row.accountingCodeId!==item.document.accountingCodeId||row.direction!=='OUT'||party.counterpartyEmployeeId!==item.employeeId||party.counterpartyOrgId||party.counterpartyAccountId)fail('PAYROLL_PAYABLE_SOURCE_CHANGED');
  }
  if(row.evidenceType==='OPENING'&&!input.allowIncomplete){
   const opening=await db.accountingOpeningItem.findFirst({where:{id:row.openingItemId,orgId,kind:'OPENING',voidedAt:null}});
   if(!opening||opening.currencyCode!==account.currencyCode||opening.balanceDate>row.transactionDate||opening.accountingCodeId!==row.accountingCodeId||row.direction!==(opening.side==='AR'?'IN':'OUT')||party.counterpartyOrgId!==opening.partyOrgId||party.counterpartyEmployeeId!==opening.employeeId)fail('OPENING_SOURCE_CHANGED');
  }
  let transfer:any={};
  if(party.counterpartyAccountId){
   const target=await db.organizationBankAccount.findFirst({where:{id:party.counterpartyAccountId,orgId,entityId:orgId,isActive:true},include:{currency:true}});
   const currency=target.currency.code,value=row.transferAmount??(currency===account.currencyCode?row.amount:'');
   if(row.transferCurrencyCode!==undefined&&row.transferCurrencyCode!==currency)fail('LEDGER_TRANSFER_CURRENCY_CHANGED');
   transferTargets.push({id:target.id,currency});
   if(!input.allowIncomplete){validateLedgerMoney(value,currency);if(currency===account.currencyCode&&ledgerScale4(value)!==ledgerScale4(row.amount))fail('LEDGER_TRANSFER_AMOUNT_MISMATCH');}
   transfer={transferAmount:value,transferCurrencyCode:currency};
   if(currency!==account.currencyCode)items.push({currency,unitPrice:/^\d+(\.\d{1,4})?$/.test(value)?value:'0',quantity:'1',vatRate:'0'});
  }
  items.push({currency:account.currencyCode,unitPrice:/^\d+(\.\d{1,4})?$/.test(row.amount)?row.amount:'0',quantity:'1',vatRate:'0'});
  rows.push({...row,...transfer,counterparty:entryCounterparty(party)});
 }
 const first=accountSources[0]!,account={id:first.accountId,entityAccountId:first.masterId,currencyCode:first.currency};
 const snapshot={account:{name:first.name,currencyCode:first.currency},accounts:accountSources,rows};
 const revisionAccounts=new Set(accountSources.map(a=>a.accountId)).size===1?{accountId:first.accountId,masterId:first.masterId,currency:first.currency}:{accounts:accountSources.map(({accountId,masterId,currency})=>({accountId,masterId,currency}))};
 const revision=createHash('sha256').update(JSON.stringify({...revisionAccounts,...(transferTargets.length?{transferTargets}:{})})).digest('hex');
 return {menu:'BANK_LEDGER',operation:'CREATE',kind:'batch',id:input.sourceId,version:null,revision,snapshot,entry:{account,evidenceType:'FILE'},items};
}
export async function previewLedgerRegistration(db:any,orgId:number,drafter:any,source:any,config:any,selection:any={}){
 const currencyTotals=new Map<string,Prisma.Decimal>();for(const item of source.items)currencyTotals.set(item.currency||source.entry.account.currencyCode,(currencyTotals.get(item.currency||source.entry.account.currencyCode)||new Prisma.Decimal(0)).add(item.unitPrice));
 const totals=[...currencyTotals].map(([currency,amount])=>({currency,amount:amount.toString()}));
 if(config.version===2&&config.kind==='BANK_LEDGER'){
  const result=await resolveApprovalRules(db,orgId,drafter,currencyTotals,config,selection,true,subject);
  if(!result)fail('APPROVAL_RULE_NOT_FOUND');return result!;
 }
 if(await canSkipApprovalStage(db,orgId,drafter,config.registrationStages[config.registrationStages.length-1],false))return {ids:[],stages:[],complete:true,drafter,policy:{config,drafterId:drafter.id,exempt:true,exemptionReason:'FINAL_DRAFTER',finalDrafterStage:config.registrationStages[config.registrationStages.length-1],resolvedStages:[],skipped:[],totals}};
 if(await hasApprovalGradeVacancy(db,orgId,config.registrationStages)){
  const result=await flexibleApprovalStages(db,orgId,drafter,config.registrationStages,selection,true);
  return {...result,drafter,policy:{...result.policy,config,drafterId:drafter.id,totals}};
 }
 const ids:number[]=[],stages:any[]=[],resolvedStages:any[]=[],skipped:string[]=[],effectiveRegistrationStages:any[]=[];
 for(const [index,stage] of config.registrationStages.entries()){
  if(await canSkipApprovalStage(db,orgId,drafter,stage,index===config.registrationStages.length-1)){skipped.push('step'+(index+1));continue;}
  const grade=stage.gradeId?await db.employeeGrade.findFirst({where:{id:stage.gradeId,orgId,isActive:true,set:{isActive:true}}}):null;
  const pool=stage.gradeMatch!=='ANY'&&!grade?[]:await db.employee.findMany({where:{orgId,status:'ACTIVE',orgRole:stage.role,...(grade?{grade:stage.gradeMatch==='MINIMUM'?{orgId,setId:grade.setId,sortOrder:{gte:grade.sortOrder},isActive:true,set:{isActive:true}}:{id:grade.id,isActive:true,set:{isActive:true}}}:{})},select:{id:true,name:true,gradeId:true,grade:{select:{name:true,nameKo:true,nameEn:true,nameVi:true}}},orderBy:[{name:'asc'},{id:'asc'}]});
  const candidates=pool.filter((person:any)=>person.id!==drafter.id&&!ids.includes(person.id));
  const unavailableReason=stage.gradeMatch!=='ANY'&&!grade?'GRADE_NOT_CONFIGURED':candidates.length?null:pool.some((person:any)=>person.id!==drafter.id&&ids.includes(person.id))?'ALREADY_SELECTED':pool.some((person:any)=>person.id===drafter.id)?'DRAFTER_ONLY':'NO_ELIGIBLE';
  const key='step'+(index+1),chosen=candidates.find((p:any)=>p.id===(selection[key+'EmployeeId']??(candidates.length===1?candidates[0].id:null)));
  if(chosen){ids.push(chosen.id);resolvedStages.push({employeeId:chosen.id,role:stage.role,gradeId:chosen.gradeId});}
  stages.push({key,role:stage.role,gradeId:stage.gradeMatch==='EXACT'?stage.gradeId:null,minimumGradeId:stage.gradeMatch==='MINIMUM'?stage.gradeId:null,requiredGrade:grade?{id:grade.id,name:grade.name,nameKo:grade.nameKo,nameEn:grade.nameEn,nameVi:grade.nameVi}:null,gradeMatch:stage.gradeMatch,unavailableReason,employeeId:chosen?.id||null,name:chosen?.name,candidates});
  effectiveRegistrationStages.push(stage);
 }
 return {ids,stages,drafter,complete:ids.length===stages.length,policy:{config,exempt:false,resolvedStages,skipped,effectiveRegistrationStages,totals}};
}
