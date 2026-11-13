import {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {allocateDocumentNumber} from './documentNumber';
import {ACCOUNTING_CODE_INCLUDE,resolveAccountingCode} from './accountingCode';
import {ledgerDate,ledgerScale4,ledgerMoney,validateLedgerMoney} from './bankLedger';

const fail=(code:string,status=409):never=>{throw createHttpError(status,code);};
const sum=(rows:any[]=[])=>rows.reduce((s:bigint,r:any)=>s+ledgerScale4(r.amount),0n);
export function payrollMonthEnd(month:string){const date=new Date(month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);return date.toISOString().slice(0,10);}
export async function requirePayrollActor(tx:any,orgId:number,actorId:number,admin=false){
 if(!Number.isSafeInteger(orgId)||orgId<=0||!Number.isSafeInteger(actorId)||actorId<=0)fail('PAYROLL_PAYABLE_ACCESS_DENIED',403);
 const [actor,org,policy]=await Promise.all([
  tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:{in:admin?['ADMIN']:['ADMIN','ACCOUNTANT','OPERATOR']}}}),
  tx.organization.findUnique({where:{id:orgId},select:{type:true}}),
  tx.systemSetting.findUnique({where:{key:'ROLE_ACCESS_POLICY'},select:{value:true}}),
 ]);
 const configured=(policy?.value as any)?.[org?.type]?.[actor?.orgRole];
 if(!actor||!['MANUFACTURER','SERVICE'].includes(org?.type)||Array.isArray(configured)&&!configured.includes('PAYROLL'))fail('PAYROLL_PAYABLE_ACCESS_DENIED',403);
 return actor;
}
export async function payrollSalaryCode(tx:any,orgId:number){
 const rows=await tx.transactionCode.findMany({where:{ownerOrgId:orgId,isActive:true,base:{code:'SAL'},taxTreatment:{suffix:'E'}},include:ACCOUNTING_CODE_INCLUDE});
 const code=rows.map(resolveAccountingCode).find(Boolean);if(!code)fail('PAYROLL_ACCOUNTING_CODE_REQUIRED',400);return code.id;
}
export function payrollPayableAmounts(data:any){
 if(!Array.isArray(data)||!data.length)fail('PAYROLL_PAYABLE_INVALID_SOURCE');
 const seen=new Set<number>();
 return data.map((e:any)=>{
  const employeeId=Number(e.workerId),currencyCode=e.currencyCode||'VND';
  if(!Number.isSafeInteger(employeeId)||employeeId<=0||seen.has(employeeId)||!['VND','USD','KRW'].includes(currencyCode))fail('PAYROLL_PAYABLE_INVALID_SOURCE');seen.add(employeeId);
  const raw=e.netSalary??e.grossSalary??e.totalSalary??e.totalEarnings??e.productionEarnings??e.productionAllowance;
  let value:Prisma.Decimal;try{value=new Prisma.Decimal(String(raw));}catch{return fail('PAYROLL_PAYABLE_INVALID_SOURCE');}
  if(!value!.isFinite()||value!.lt(0))fail('PAYROLL_PAYABLE_INVALID_SOURCE');
  const amount=value!.toFixed(currencyCode==='USD'?2:0);
  return {employeeId,currencyCode,amount};
 }).filter((r:any)=>ledgerScale4(r.amount)>0n);
}
export async function ensurePayrollPayables(tx:any,snapshot:any,actorId:number){
 if(snapshot.isProvisional)fail('PAYROLL_PAYABLE_NOT_LOCKED');
 const amounts=payrollPayableAmounts(snapshot.data);
 const employees=await tx.employee.findMany({where:{orgId:snapshot.orgId,id:{in:amounts.map((r:any)=>r.employeeId)}},select:{id:true}});
 if(employees.length!==amounts.length)fail('PAYROLL_PAYABLE_INVALID_SOURCE');
 let document=await tx.payrollPayableDocument.findUnique({where:{snapshotId:snapshot.id},include:{items:{where:{voidedAt:null}}}});
 if(document?.items.length){
  if(document.orgId!==snapshot.orgId||document.items.length!==amounts.length||document.items.some((item:any)=>item.snapshotRevision!==snapshot.revision||!amounts.some((a:any)=>a.employeeId===item.employeeId&&a.currencyCode===item.currencyCode&&ledgerScale4(a.amount)===ledgerScale4(item.amount))))fail('PAYROLL_PAYABLE_SOURCE_CHANGED');
  return {document,created:false};
 }
 if(!document){
  const accountingCodeId=await payrollSalaryCode(tx,snapshot.orgId);
  const managementNumber=await allocateDocumentNumber(tx,snapshot.orgId,'PAY',snapshot.month+'-01',undefined);
  document=await tx.payrollPayableDocument.create({data:{orgId:snapshot.orgId,snapshotId:snapshot.id,month:snapshot.month,managementNumber,accountingCodeId,createdByEmployeeId:actorId}});
 }
 for(const row of amounts)await tx.payrollPayableItem.create({data:{...row,orgId:snapshot.orgId,documentId:document.id,snapshotRevision:snapshot.revision,createdByEmployeeId:actorId}});
 return {document,created:true};
}
export async function voidPayrollPayables(tx:any,orgId:number,snapshotId:number,actorId:number){
 const items=await tx.payrollPayableItem.findMany({where:{orgId,document:{snapshotId},voidedAt:null},select:{id:true}}),ids=items.map((i:any)=>i.id);
 if(!ids.length)return;
 if(await tx.accountingOpeningItem.findFirst({where:{orgId,payrollItemId:{in:ids},voidedAt:null},select:{id:true}}))fail('PAYROLL_MANAGEMENT_EXCLUDED');
 if(await tx.payrollPayableAllocation.findFirst({where:{orgId,payrollItemId:{in:ids},entry:{voidedAt:null}},select:{id:true}}))fail('PAYROLL_PAYMENT_LINKED');
 await tx.payrollPayableItem.updateMany({where:{orgId,id:{in:ids},voidedAt:null},data:{voidedAt:new Date(),voidedByEmployeeId:actorId}});
}
export async function importLockedPayrollPayables(db:any,orgId:number,actorId:number,body:any){
 const date=ledgerDate(body?.balanceDate);
 return retryEditTransaction(db,async(tx:any)=>{
  await requirePayrollActor(tx,orgId,actorId,true);await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  const snapshots=await tx.payrollSnapshot.findMany({where:{orgId,isProvisional:false,payableManagementExcluded:false,month:{lte:date.slice(0,7)}},orderBy:[{month:'asc'},{factoryId:'asc'}]});let count=0;
  if(snapshots.length>200)fail('PAYROLL_PAYABLE_IMPORT_LIMIT');
  for(const snapshot of snapshots){if(payrollMonthEnd(snapshot.month)>=date)continue;await tx.$queryRawUnsafe('SELECT id FROM "PayrollSnapshot" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',snapshot.id,orgId);const current=await tx.payrollSnapshot.findUnique({where:{id:snapshot.id}});if(!current||current.isProvisional||current.revision!==snapshot.revision)fail('PAYROLL_PAYABLE_SOURCE_CHANGED');if((await ensurePayrollPayables(tx,current,actorId)).created)count++;}
  return {importedCount:count};
 },120000);
}
export async function payrollPayableRemaining(tx:any,orgId:number,item:any,asOf?:string,excludeEntryId?:string){
 const [paid,adjustments]=await Promise.all([
  tx.payrollPayableAllocation.findMany({where:{orgId,payrollItemId:item.id,...(excludeEntryId?{entryId:{not:excludeEntryId}}:{}),entry:{voidedAt:null,...(asOf?{transactionDate:{lte:asOf}}:{})}}}),
  tx.accountingOpeningItem.findMany({where:{orgId,payrollItemId:item.id,voidedAt:null,...(asOf?{balanceDate:{lte:asOf}}:{})}}),
 ]);
 return ledgerScale4(item.amount)-sum(paid)-sum(adjustments);
}
export async function validatePayrollEvidence(tx:any,orgId:number,account:any,body:any){
 if(typeof body.payrollItemId!=='string')fail('PAYROLL_PAYABLE_REQUIRED',400);
 await tx.$queryRawUnsafe('SELECT id FROM "PayrollPayableItem" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',body.payrollItemId,orgId);
 const item=await tx.payrollPayableItem.findFirst({where:{id:body.payrollItemId,orgId,voidedAt:null},include:{document:{include:{snapshot:true}}}});
 if(item?.document.snapshot.payableManagementExcluded)fail('PAYROLL_MONTH_MANAGEMENT_EXCLUDED');
 if(!item||item.document.snapshot.isProvisional||item.document.snapshot.revision!==item.snapshotRevision||body.direction!=='OUT'||item.currencyCode!==account.currencyCode||body.accountingCodeId!==item.document.accountingCodeId||body.counterparty?.kind!=='EMPLOYEE'||body.counterparty.id!==item.employeeId||body.transactionDate<item.document.month+'-01')fail('PAYROLL_PAYABLE_SOURCE_CHANGED');
 const amount=validateLedgerMoney(body.amount,account.currencyCode);
 if(ledgerScale4(amount)>await payrollPayableRemaining(tx,orgId,item))fail('LEDGER_EXCEEDS_DOCUMENT',400);
 return item;
}
export async function searchPayrollEvidence(db:any,orgId:number,query:any){
 const search=String(query.search||'').trim(),code=query.currencyCode;if(query.direction&&query.direction!=='OUT')return {documents:[]};if(!search)return {documents:[]};if(search.length>200||!['USD','VND','KRW'].includes(code))fail('LEDGER_INVALID_EVIDENCE',400);
 const items=await db.payrollPayableItem.findMany({where:{orgId,voidedAt:null,currencyCode:code,document:{snapshot:{isProvisional:false,payableManagementExcluded:false}},OR:[{document:{managementNumber:{contains:search,mode:'insensitive'}}},{document:{month:{contains:search}}},{employee:{OR:[{name:{contains:search,mode:'insensitive'}},{employeeNo:{contains:search,mode:'insensitive'}}]}}]},include:{employee:{select:{name:true,employeeNo:true}},document:true},orderBy:[{document:{month:'desc'}},{employeeId:'asc'}]});
 const documents=[];for(const item of items){const remaining=await payrollPayableRemaining(db,orgId,item);if(remaining>0n)documents.push({id:item.id,reference:item.document.managementNumber+' / '+item.document.month+' / '+item.employee.name,payee:item.employee.name,month:item.document.month,amount:ledgerMoney(ledgerScale4(item.amount),code),remaining:ledgerMoney(remaining,code),accountingCodeId:item.document.accountingCodeId,counterparty:{kind:'EMPLOYEE',id:item.employeeId,name:item.employee.name}});}
 return {documents:documents.slice(0,100)};
}
