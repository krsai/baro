import {companyNameCodeSearch} from './companySearch';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerDate,ledgerScale4,ledgerMoney,validateLedgerMoney} from './bankLedger';
import {ledgerAccountingCode} from './accountingCode';
import {ledgerCounterpartyOptions,resolveLedgerCounterparty} from './ledgerCounterparty';
import {attachExpenseApprovalStates} from './bankEvidence';

const fail=(code='OPENING_INVALID_INPUT',status=400):never=>{throw createHttpError(status,code);};
export const openingSum=(rows:any[]=[])=>rows.filter(row=>!row.voidedAt).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
export async function openingAdmin(tx:any,orgId:number,actorId:number){
 if(!actorId||!await tx.employee.findFirst({where:{id:actorId,orgId,status:'ACTIVE',orgRole:'ADMIN'},select:{id:true}}))fail('LEDGER_ADJUSTMENT_ADMIN_REQUIRED',403);
}
export async function documentOpeningAmount(tx:any,orgId:number,where:any,asOf?:string){
 const rows=await tx.accountingOpeningItem.findMany({where:{orgId,voidedAt:null,...where,...(asOf?{balanceDate:{lte:asOf}}:{})}});
 return openingSum(rows);
}
export async function invoiceOpeningRemaining(tx:any,orgId:number,invoice:any){
 const root=invoice.rootInvoiceId||invoice.id;
 const family=await tx.invoice.findMany({where:{sellerOrgId:orgId,OR:[{id:root},{rootInvoiceId:root}]},select:{id:true,payments:{where:{voidedAt:null},select:{id:true}}}});
 const used=await tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,invoiceId:{in:family.map((row:any)=>row.id)},entry:{voidedAt:null}}});
 const matched=openingSum(used);
 // Separate receipt records must be reconciled explicitly; never guess that two
 // receipts are the same money merely because their amounts match.
 const hasUnlinkedReceipt=family.some((row:any)=>row.payments.length>0);
 const remaining=ledgerScale4(invoice.receivableAdded)-openingSum(invoice.credits)-matched-await documentOpeningAmount(tx,orgId,{invoiceId:invoice.id});
 return {remaining,hasUnlinkedReceipt};
}
export async function expenseOpeningRemaining(tx:any,orgId:number,item:any){
 const used=await tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,expenseItemId:item.id,entry:{voidedAt:null}}});
 return ledgerScale4(item.amount)-openingSum(used)-await documentOpeningAmount(tx,orgId,{expenseItemId:item.id});
}
export function normalizeOpeningRows(value:any){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>100)fail();
 return value.map((row:any)=>{
  if(!row||!['OPENING','SETTLED','EXCLUDED'].includes(row.kind)||!['AR','AP'].includes(row.side))fail();
  if(row.kind==='OPENING'){
   if(!['USD','VND','KRW'].includes(row.currencyCode)||!row.counterparty||!['PARTNER','EMPLOYEE'].includes(row.counterparty.kind)||!Number.isSafeInteger(row.counterparty.id)||!Number.isSafeInteger(row.accountingCodeId))fail();
   return {kind:row.kind,side:row.side,currencyCode:row.currencyCode,amount:validateLedgerMoney(row.amount,row.currencyCode),accountingCodeId:row.accountingCodeId,counterparty:{kind:row.counterparty.kind,id:row.counterparty.id}};
  }
  if(typeof row.sourceId!=='string'||!row.sourceId||row.sourceId.length>100||typeof row.expectedRemaining!=='string')fail();
  return {kind:row.kind,side:row.side,sourceId:row.sourceId,expectedRemaining:row.expectedRemaining,sourceVersion:row.sourceVersion??null};
 });
}
export async function applyAccountingOpening(tx:any,scope:any,body:any,rows:any[]){
 const orgId=scope.orgId,date=ledgerDate(body.balanceDate),seen=new Set<string>();
 for(const [line,row] of rows.entries()){
  let data:any={orgId,batchKey:body.clientKey,line,kind:row.kind,side:row.side,balanceDate:date,reason:body.reason.trim(),createdByEmployeeId:scope.actorId};
  if(row.kind==='OPENING'){
   await ledgerAccountingCode(tx,orgId,row.accountingCodeId,row.side==='AR'?'IN':'OUT');
   const party=await resolveLedgerCounterparty(tx,orgId,{}, {counterparty:row.counterparty},[]);
   data={...data,partyOrgId:party.counterpartyOrgId,employeeId:party.counterpartyEmployeeId,currencyCode:row.currencyCode,amount:row.amount,accountingCodeId:row.accountingCodeId};
  }else{
   const key=row.side+':'+row.sourceId;if(seen.has(key))fail();seen.add(key);
   let remaining:bigint;
   if(row.side==='AR'){
    await tx.$queryRawUnsafe('SELECT id FROM "Invoice" WHERE id=$1 AND "sellerOrgId"=$2 FOR UPDATE',row.sourceId,orgId);
    const invoice=await tx.invoice.findFirst({where:{id:row.sourceId,sellerOrgId:orgId,status:'ISSUED'},include:{credits:{where:{voidedAt:null}},payments:{where:{voidedAt:null}}}});
    if(!invoice||String((invoice.snapshot as any)?.fields?.date||invoice.issuedAt.toISOString().slice(0,10)).slice(0,10)>=date)fail('OPENING_SOURCE_CHANGED',409);
    const current=await invoiceOpeningRemaining(tx,orgId,invoice);if(current.hasUnlinkedReceipt)fail('OPENING_UNLINKED_RECEIPT',409);remaining=current.remaining;
    data={...data,invoiceId:invoice.id,partyOrgId:invoice.buyerOrgId,currencyCode:invoice.currencyCode};
   }else{
    const item=await tx.partnerTransactionCost.findFirst({where:{id:row.sourceId,orgId},include:{expenseRequest:true}});
    if(!item?.expenseRequest||item.expenseRequest.deletedAt||item.expenseRequest.requestDate>=date)fail('OPENING_SOURCE_CHANGED',409);
    await tx.$queryRawUnsafe('SELECT id FROM "ExpenseRequest" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',item.expenseRequestId,orgId);
    if(item.expenseRequest.version!==row.sourceVersion)fail('OPENING_SOURCE_CHANGED',409);
    const approved=(await attachExpenseApprovalStates(tx,orgId,[await tx.expenseRequest.findFirst({where:{id:item.expenseRequestId,orgId},include:{createdByEmployee:true,approvalSteps:true,items:true}})]))[0];
    if(!approved?.approval?.approved)fail('LEDGER_EXPENSE_NOT_APPROVED');
    remaining=await expenseOpeningRemaining(tx,orgId,item);
    data={...data,expenseItemId:item.id,sourceVersion:row.sourceVersion,partyOrgId:item.partnerOrgId,employeeId:item.payeeEmployeeId,currencyCode:item.currency,accountingCodeId:item.transactionCodeId};
   }
   if(remaining<=0n||ledgerScale4(row.expectedRemaining)!==remaining)fail('OPENING_SOURCE_CHANGED',409);
   data.amount=ledgerMoney(remaining!,data.currencyCode);
  }
  await tx.accountingOpeningItem.create({data});
 }
}
export async function readAccountingOpening(db:any,orgId:number,actorId:number,query:any){
 const balanceDate=ledgerDate(query.balanceDate),search=String(query.search||'').trim();if(search.length>200)fail();
 return retryEditTransaction(db,async(tx:any)=>{
  await openingAdmin(tx,orgId,actorId);
  const [invoices,requests,history,parties]=await Promise.all([
   tx.invoice.findMany({where:{sellerOrgId:orgId,status:'ISSUED',...(search?{OR:[{invoiceNumber:{contains:search,mode:'insensitive'}},{buyer:companyNameCodeSearch(orgId,search)}]}:{})},include:{buyer:{select:{name:true}},credits:{where:{voidedAt:null}},payments:{where:{voidedAt:null}}},orderBy:{issuedAt:'desc'},take:201}),
   tx.expenseRequest.findMany({where:{orgId,deletedAt:null,requestDate:{lt:balanceDate},...(search?{OR:[{managementNumber:{contains:search,mode:'insensitive'}},{partner:companyNameCodeSearch(orgId,search)},{payeeEmployee:{OR:[{name:{contains:search,mode:'insensitive'}},{employeeNo:{contains:search,mode:'insensitive'}}]}}]}:{})},include:{partner:{select:{name:true}},payeeEmployee:{select:{name:true}},createdByEmployee:true,approvalSteps:true,items:{include:{transactionCode:true}}},orderBy:{requestDate:'desc'},take:201}),
   tx.accountingOpeningItem.findMany({where:{orgId},include:{party:{select:{name:true}},employee:{select:{name:true}},invoice:{select:{invoiceNumber:true}},expenseItem:{select:{description:true}},accountingCode:{select:{code:true}},allocations:{include:{entry:{select:{voidedAt:true}}}}},orderBy:{createdAt:'desc'}}),
   ledgerCounterpartyOptions(tx,orgId),
  ]);
  const roots=[...new Set(invoices.slice(0,200).map((i:any)=>i.rootInvoiceId||i.id))];
  const families=await tx.invoice.findMany({where:{sellerOrgId:orgId,OR:[{id:{in:roots}},{rootInvoiceId:{in:roots}}]},select:{id:true,rootInvoiceId:true,payments:{where:{voidedAt:null},select:{id:true}}}});
  const familyRoot=new Map(families.map((i:any)=>[i.id,i.rootInvoiceId||i.id]));
  const invoiceIds=families.map((i:any)=>i.id),costIds=requests.slice(0,200).flatMap((r:any)=>r.items.map((i:any)=>i.id));
  const [links,adjustments]=await Promise.all([
   tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,entry:{voidedAt:null},OR:[{invoiceId:{in:invoiceIds}},{expenseItemId:{in:costIds}}]}}),
   tx.accountingOpeningItem.findMany({where:{orgId,voidedAt:null,OR:[{invoiceId:{in:invoiceIds}},{expenseItemId:{in:costIds}}]}}),
  ]);
  const totals=new Map<string,bigint>();for(const row of [...links,...adjustments]){const key=row.invoiceId?'AR:'+familyRoot.get(row.invoiceId):'AP:'+row.expenseItemId;totals.set(key,(totals.get(key)||0n)+ledgerScale4(row.amount));}
  const documents:any[]=[];
  for(const invoice of invoices.slice(0,200)){
   if(String((invoice.snapshot as any)?.fields?.date||invoice.issuedAt.toISOString().slice(0,10)).slice(0,10)>=balanceDate)continue;
   const remaining=ledgerScale4(invoice.receivableAdded)-openingSum(invoice.credits)-(totals.get('AR:'+(invoice.rootInvoiceId||invoice.id))||0n),hasUnlinkedReceipt=families.some((i:any)=>(i.rootInvoiceId||i.id)===(invoice.rootInvoiceId||invoice.id)&&i.payments.length>0);
   if(remaining>0n)documents.push({side:'AR',id:invoice.id,reference:invoice.invoiceNumber,party:invoice.buyer.name,currencyCode:invoice.currencyCode,remaining:ledgerMoney(remaining,invoice.currencyCode),hasUnlinkedReceipt});
  }
  const approved=(await attachExpenseApprovalStates(tx,orgId,requests.slice(0,200))).filter((r:any)=>r.approval.approved);
  for(const request of approved)for(const item of request.items){const remaining=ledgerScale4(item.amount)-(totals.get('AP:'+item.id)||0n);if(remaining>0n)documents.push({side:'AP',id:item.id,sourceVersion:request.version,reference:(request.managementNumber||String(request.id))+' #'+item.expenseRequestLine,description:item.description,party:request.partner?.name||request.payeeEmployee?.name||'',currencyCode:item.currency,remaining:ledgerMoney(remaining,item.currency)});}
  return {documents:documents.slice(0,200),hasMore:documents.length>200||invoices.length>200||requests.length>200,parties:parties.filter((p:any)=>p.kind!=='ACCOUNT'),history:history.map((r:any)=>({...r,amount:String(r.amount),matched:ledgerMoney(r.allocations.filter((a:any)=>!a.entry.voidedAt).reduce((s:bigint,a:any)=>s+ledgerScale4(a.amount),0n),r.currencyCode),remaining:ledgerMoney(ledgerScale4(r.amount)-r.allocations.filter((a:any)=>!a.entry.voidedAt).reduce((s:bigint,a:any)=>s+ledgerScale4(a.amount),0n),r.currencyCode),allocations:undefined}))};
 });
}
export async function openingCashEvidence(tx:any,orgId:number,account:any,body:any){
 if(typeof body.openingItemId!=='string')fail();
 await tx.$queryRawUnsafe('SELECT id FROM "AccountingOpeningItem" WHERE id=$1 AND "orgId"=$2 FOR UPDATE',body.openingItemId,orgId);
 const item=await tx.accountingOpeningItem.findFirst({where:{id:body.openingItemId,orgId,kind:'OPENING',voidedAt:null}});
 if(!item||item.currencyCode!==account.currencyCode||item.balanceDate>body.transactionDate||body.direction!==(item.side==='AR'?'IN':'OUT')||body.accountingCodeId!==item.accountingCodeId)fail('OPENING_SOURCE_CHANGED',409);
 const used=await tx.accountingOpeningAllocation.findMany({where:{orgId,openingItemId:item.id,entry:{voidedAt:null}}});
 if(openingSum(used)+ledgerScale4(body.amount)>ledgerScale4(item.amount))fail('LEDGER_EXCEEDS_DOCUMENT');
 const expected=item.partyOrgId?{kind:'PARTNER',id:item.partyOrgId}:{kind:'EMPLOYEE',id:item.employeeId};
 if(!body.counterparty||body.counterparty.kind!==expected.kind||body.counterparty.id!==expected.id)fail('LEDGER_COUNTERPARTY_MISMATCH');
 return item;
}
export async function voidAccountingOpening(db:any,orgId:number,actorId:number,id:string,reason:any){
 if(typeof reason!=='string'||!reason.trim()||reason.length>1000)fail();
 return retryEditTransaction(db,async(tx:any)=>{
  await openingAdmin(tx,orgId,actorId);await tx.$queryRawUnsafe('SELECT id FROM "Organization" WHERE id=$1 FOR UPDATE',orgId);
  const item=await tx.accountingOpeningItem.findFirst({where:{id,orgId}});if(!item)fail('OPENING_SOURCE_CHANGED',409);
  if(item.voidedAt){if(item.voidReason!==reason.trim())fail('LEDGER_RETRY_CONFLICT',409);return {id};}
  if(await tx.accountingOpeningAllocation.count({where:{orgId,openingItemId:id,entry:{voidedAt:null}}}))fail('OPENING_ALREADY_MATCHED',409);
  await tx.accountingOpeningItem.update({where:{id},data:{voidedAt:new Date(),voidReason:reason.trim(),voidedByEmployeeId:actorId}});return {id};
 });
}
