import {attachLedgerReportItems,ledgerReportItems} from './ledgerReportItems';
import {attachLedgerCounterpartyNames} from './ledgerCounterparty';
import {openingSum} from './accountingOpening';
import type {Prisma} from '@prisma/client';
import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerDate,ledgerScale4,ledgerMoney,readLedgerAccounts} from './bankLedger';
import {attachExpenseApprovalStates} from './bankEvidence';
import {legacyExpenseNumber} from './documentNumber';
const reportCodeInclude={base:{include:{industryLinks:{include:{industry:{include:{partnerRole:true}}}},serviceType:{include:{partnerRole:true}}}}};
export const accountReportToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function shiftReportDate(value:string,days:number){const date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
const delta=(rows:any[])=>rows.reduce((sum:bigint,row:any)=>sum+(row.direction==='IN'?1n:-1n)*ledgerScale4(row._sum.amount||'0'),0n);
const amountSum=(rows:any[],direction:string)=>rows.filter(row=>row.direction===direction).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row._sum.amount||'0'),0n);
const accountName=(a:any)=>a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / ');
export function accountHistoryDays(value:unknown=30){const days=Number(value);if(![30,60,90,180].includes(days))throw createHttpError(400,'LEDGER_INVALID_RANGE');return days;}
export function accountHistoryPeriod(asOf:string,value:unknown=1){
 const months=Number(value);if(![1,3,6,12].includes(months))throw createHttpError(400,'LEDGER_INVALID_RANGE');
 const day=Number(asOf.slice(8)),date=new Date(asOf.slice(0,7)+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()-months);
 const last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();date.setUTCDate(Math.min(day,last));
 const start=shiftReportDate(date.toISOString().slice(0,10),1),days=Math.round((Date.parse(asOf+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)+1;
 return {months,start,end:asOf,days};
}
export function accountMovementPeriod(value:unknown,today=accountReportToday()){
 const month=value===undefined?today.slice(0,7):String(value);
 if(!/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>today.slice(0,7))throw createHttpError(400,'LEDGER_INVALID_RANGE');
 const start=month+'-01',date=new Date(start+'T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+1);
 return {month,start,end:month===today.slice(0,7)?today:shiftReportDate(date.toISOString().slice(0,10),-1)};
}
export function accountBalanceReport(accounts:any[],flows:any[],asOf:string,days=30,movementStart?:string){
 if(!Number.isSafeInteger(days)||days<1||days>366)throw createHttpError(400,'LEDGER_INVALID_RANGE');
 const monthStart=movementStart||asOf.slice(0,7)+'-01',yesterday=shiftReportDate(asOf,-1),historyStart=shiftReportDate(asOf,1-days);
 const summaries=accounts.map(account=>{
  const code=account.currencyCode,own=flows.filter(row=>row.accountId===account.id),month=own.filter(row=>row.transactionDate>=monthStart&&row.transactionDate<=asOf),day=own.filter(row=>row.transactionDate===yesterday),balance=ledgerScale4(account.currentBalance),change=delta(month);
  return {id:account.id,name:accountName(account),currencyCode:code,openingDate:account.openingDate,beginningBalance:ledgerMoney(balance-change,code),totalIn:ledgerMoney(amountSum(month,'IN'),code),totalOut:ledgerMoney(amountSum(month,'OUT'),code),change:ledgerMoney(change,code),currentBalance:ledgerMoney(balance,code),yesterdayIn:ledgerMoney(amountSum(day,'IN'),code),yesterdayOut:ledgerMoney(amountSum(day,'OUT'),code)};
 });
 const currencies=[...new Set<string>(accounts.map(row=>row.currencyCode))];
 const fields=['beginningBalance','totalIn','totalOut','change','currentBalance','yesterdayIn','yesterdayOut'];
 const totals=currencies.map(code=>({currencyCode:code,...Object.fromEntries(fields.map(field=>[field,ledgerMoney(summaries.filter(row=>row.currencyCode===code).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row[field]),0n),code)]))}));
 const yesterdayAccounts=accounts.filter(account=>account.openingDate<=yesterday).map(account=>{
  const code=account.currencyCode,own=flows.filter(row=>row.accountId===account.id),day=own.filter(row=>row.transactionDate===yesterday);
  const closing=ledgerScale4(account.currentBalance)-delta(own.filter(row=>row.transactionDate===asOf)),change=delta(day);
  return {id:account.id,name:accountName(account),currencyCode:code,beginningBalance:ledgerMoney(closing-change,code),totalIn:ledgerMoney(amountSum(day,'IN'),code),totalOut:ledgerMoney(amountSum(day,'OUT'),code),change:ledgerMoney(change,code),currentBalance:ledgerMoney(closing,code)};
 });
 const yesterdayTotals=[...new Set(yesterdayAccounts.map(row=>row.currencyCode))].map(code=>({currencyCode:code,...Object.fromEntries(fields.filter(field=>!field.startsWith('yesterday')).map(field=>[field,ledgerMoney(yesterdayAccounts.filter(row=>row.currencyCode===code).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row[field]),0n),code)]))}));
 const balances=new Map<string,bigint>(accounts.map(row=>[row.id,ledgerScale4(row.currentBalance)])),history:any[]=[];
 const dailyChanges=new Map<string,bigint>();for(const row of flows){const key=JSON.stringify([row.accountId,row.transactionDate]);dailyChanges.set(key,(dailyChanges.get(key)||0n)+(row.direction==='IN'?1n:-1n)*ledgerScale4(row._sum.amount||'0'));}
 for(let index=0;index<days;index++){
  const date=shiftReportDate(asOf,-index),dailyAccounts=accounts.map(account=>({accountId:account.id,balance:ledgerMoney(balances.get(account.id)!,account.currencyCode)}));
  history.unshift({date,accounts:dailyAccounts,currencyTotals:currencies.map(code=>({currencyCode:code,balance:ledgerMoney(accounts.filter(row=>row.currencyCode===code).reduce((sum:bigint,row)=>sum+balances.get(row.id)!,0n),code)}))});
  for(const account of accounts){let balance=balances.get(account.id)!-(dailyChanges.get(JSON.stringify([account.id,date]))||0n);if(account.openingDate===date)balance-=ledgerScale4(account.openingBalance);balances.set(account.id,balance);}
 }
 return {asOf,monthStart,yesterday,historyStart,historyDays:days,accounts:summaries,currencyTotals:totals,history,yesterdayAccounts,yesterdayTotals};
}
export function accountCashFlowReport(accounts:any[],entries:any[]){
 const known=new Map(accounts.map(row=>[row.id,row])),groups=new Map<string,any>();
 for(const entry of entries.flatMap(ledgerReportItems).filter((row:any)=>row.cashMovement!==false)){
  const account=known.get(entry.accountId);if(!account)throw createHttpError(409,'LEDGER_ACCOUNT_NOT_FOUND');
  const baseCode=entry.accountingCode?.base?.code;
  if(entry.counterpartyAccountId||entry.internalTransferSourceId||baseCode==='FXC'||baseCode==='IBT')continue;
  const code=entry.accountingCode,base=code?.base,itemKey=base?.id?'BASE:'+base.id:code?.id?'CODE:'+code.id:'UNCODED',key=JSON.stringify([itemKey,entry.direction,account.currencyCode]);
  const links=(base?.industryLinks||[]).map((link:any)=>link.industry);
  const industries=links.length?links:base?.serviceType?[base.serviceType]:[];
  const group=groups.get(key)||{itemKey,baseId:base?.id??null,code:base?.code||code?.code||'',nameKo:base?.nameKo||code?.nameKo||'',nameEn:base?.nameEn||code?.nameEn||'',nameVi:base?.nameVi||code?.nameVi||'',industries,direction:entry.direction,currencyCode:account.currencyCode,total:0n,entries:[]};
  group.total+=ledgerScale4(entry.amount);
  group.entries.push({id:entry.id,itemId:entry.itemId,date:entry.transactionDate,accountId:entry.accountId,accountName:accountName(account),currencyCode:account.currencyCode,direction:entry.direction,amount:ledgerMoney(ledgerScale4(entry.amount),account.currencyCode),code:code?.code||'',nameKo:code?.nameKo||base?.nameKo||'',nameEn:code?.nameEn||base?.nameEn||'',nameVi:code?.nameVi||base?.nameVi||'',counterparty:entry.currentCounterpartyName||entry.counterpartyName||'',purpose:entry.purpose||''});groups.set(key,group);
 }
 return [...groups.values()].map(({total,...group})=>({...group,amount:ledgerMoney(total,group.currencyCode)})).sort((a,b)=>a.code.localeCompare(b.code)||a.itemKey.localeCompare(b.itemKey)||a.direction.localeCompare(b.direction)||a.currencyCode.localeCompare(b.currencyCode));
}
export async function loadAccountOverview(db:any,orgId:number,query:any={}){
 const today=accountReportToday(),asOf=ledgerDate(query.asOf||today),calendar=query.months!==undefined||query.days===undefined?accountHistoryPeriod(asOf,query.months??1):null,days=calendar?.days??accountHistoryDays(query.days),period=query.month!==undefined||!calendar?accountMovementPeriod(query.month,today):{month:null,start:calendar.start,end:asOf};
 if(asOf!==today)throw createHttpError(400,'LEDGER_INVALID_RANGE');
 return retryEditTransaction(db,async(tx:any)=>{
  const accounts=await readLedgerAccounts(tx,orgId,asOf),monthStart=asOf.slice(0,7)+'-01',yesterday=shiftReportDate(asOf,-1),historyStart=shiftReportDate(asOf,1-days),start=[period.start,monthStart,yesterday,historyStart].sort()[0];
  const [flows,dailyEntries,outstanding,periodEntries]=await Promise.all([
   tx.bankLedgerEntry.groupBy({by:['accountId','transactionDate','direction'],where:{orgId,voidedAt:null,transactionDate:{gte:start,lte:asOf}},_sum:{amount:true}}),
   tx.bankLedgerEntry.findMany({where:{orgId,voidedAt:null,transactionDate:yesterday},include:{allocations:true,settlementLines:true} satisfies Prisma.BankLedgerEntryInclude,orderBy:[{accountId:'asc'},{createdAt:'asc'},{id:'asc'}]}),
   loadOutstanding(tx,orgId,asOf),
   tx.bankLedgerEntry.findMany({where:{orgId,voidedAt:null,transactionDate:{gte:historyStart,lte:asOf}},select:{id:true,accountId:true,transactionDate:true,direction:true,amount:true,counterpartyName:true,counterpartyOrgId:true,counterpartyAccountId:true,internalTransferSourceId:true,purpose:true,allocations:{where:{orgId},select:{id:true,expenseItemId:true,amount:true}},settlementLines:{include:{accountingCode:{include:reportCodeInclude}}},accountingCode:{select:{id:true,code:true,nameKo:true,nameEn:true,nameVi:true,base:{select:{id:true,code:true,nameKo:true,nameEn:true,nameVi:true,serviceType:{include:{partnerRole:true}},industryLinks:{select:{industry:{select:{id:true,nameKo:true,nameEn:true,nameVi:true,partnerRole:{select:{id:true,nameKo:true,nameEn:true,nameVi:true}}}}}}}}}}},orderBy:[{transactionDate:'desc'},{createdAt:'desc'},{id:'desc'}]} satisfies Prisma.BankLedgerEntryFindManyArgs),
  ]);
  const invoiceIds=[...new Set<string>(dailyEntries.flatMap((row:any)=>row.allocations.map((a:any)=>a.invoiceId).filter(Boolean)))];
  const expenseIds=[...new Set<string>(dailyEntries.flatMap((row:any)=>row.allocations.map((a:any)=>a.expenseItemId).filter(Boolean)))];
  const [invoices,expenses]=await Promise.all([
   invoiceIds.length?tx.invoice.findMany({where:{sellerOrgId:orgId,id:{in:invoiceIds}},select:{id:true,buyer:{select:{name:true}}} satisfies Prisma.InvoiceSelect}):[],
   expenseIds.length?tx.partnerTransactionCost.findMany({where:{orgId,id:{in:expenseIds}},select:{id:true,partner:{select:{name:true}},payeeEmployee:{select:{name:true}},expenseRequest:{select:{partner:{select:{name:true}},payeeEmployee:{select:{name:true}}}}} satisfies Prisma.PartnerTransactionCostSelect}):[],
  ]);
  const invoiceNames=new Map<string,string>(invoices.map((row:any)=>[row.id,row.buyer?.name||''])),expenseNames=new Map<string,string>(expenses.map((row:any)=>[row.id,row.expenseRequest?.partner?.name||row.expenseRequest?.payeeEmployee?.name||row.partner?.name||row.payeeEmployee?.name||'']));
  const known=new Map<string,any>(accounts.map((row:any)=>[row.id,row]));
  const itemEntries=await attachLedgerReportItems(tx,orgId,periodEntries,reportCodeInclude);
  const namedEntries=await attachLedgerCounterpartyNames(tx,orgId,[...dailyEntries,...itemEntries]);
  const transactions=namedEntries.slice(0,dailyEntries.length).map((row:any)=>{const account=known.get(row.accountId);if(!account)throw createHttpError(409,'LEDGER_ACCOUNT_NOT_FOUND');return {id:row.id,accountId:row.accountId,accountName:accountName(account),currencyCode:account.currencyCode,direction:row.direction,amount:ledgerMoney(ledgerScale4(row.amount),account.currencyCode),purpose:row.purpose,counterparty:row.currentCounterpartyName||row.counterpartyName||[...new Set(row.allocations.map((a:any)=>invoiceNames.get(a.invoiceId)||expenseNames.get(a.expenseItemId)).filter(Boolean))].join(', '),settlementLines:row.settlementLines.map((line:any)=>({id:line.id,kind:line.kind,amount:ledgerMoney(ledgerScale4(line.amount),account.currencyCode),purpose:line.purpose}))};});
  const monthAccounts=period.end===asOf?accounts:await readLedgerAccounts(tx,orgId,period.end);
  const movements=accountBalanceReport(monthAccounts.filter((row:any)=>row.openingDate<=period.end),flows,period.end,days,period.start);
  return {orgId,...accountBalanceReport(accounts,flows,asOf,days),historyMonths:calendar?.months??null,movementMonth:period.month,movementStart:period.start,movementEnd:period.end,movementAccounts:movements.accounts,movementTotals:movements.currencyTotals,cashflowGroups:accountCashFlowReport(accounts,namedEntries.slice(dailyEntries.length)),transactions,...outstanding};
 },60000);
}
async function loadOutstanding(tx:any,orgId:number,asOf:string):Promise<any>{
 const [invoices,requests,allocations,openings]=await Promise.all([
  tx.invoice.findMany({where:{sellerOrgId:orgId},select:{id:true,buyerOrgId:true,currencyCode:true,status:true,invoiceNumber:true,receivableAdded:true,issuedAt:true,buyer:{select:{name:true}},credits:{where:{voidedAt:null},select:{amount:true}},payments:{where:{voidedAt:null,receivedAt:{lte:new Date(`${asOf}T23:59:59.999+07:00`)}},select:{kind:true,amount:true}}}}),
  tx.expenseRequest.findMany({where:{orgId,requestDate:{lte:asOf}},include:{partner:{select:{name:true}},payeeEmployee:{select:{name:true}},createdByEmployee:{select:{id:true,orgId:true,status:true,orgRole:true}},approvalSteps:{orderBy:{position:'asc'}},items:{orderBy:[{expenseRequestLine:'asc'},{id:'asc'}],select:{id:true,currency:true,amount:true,description:true,transactionCode:{select:{code:true,base:{select:{code:true}}}}}}}}),
  tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,entry:{voidedAt:null,transactionDate:{lte:asOf}}},select:{invoiceId:true,expenseItemId:true,amount:true}}),
  tx.accountingOpeningItem.findMany({where:{orgId,voidedAt:null,balanceDate:{lte:asOf}},include:{party:{select:{name:true}},employee:{select:{name:true}},allocations:{where:{entry:{voidedAt:null,transactionDate:{lte:asOf}}}}}}),
 ]);
 const approved=(await attachExpenseApprovalStates(tx,orgId,requests)).filter((row:any)=>row.approval.approved);
 const payroll=await tx.payrollPayableItem.findMany({where:{orgId,voidedAt:null,document:{snapshot:{isProvisional:false,payableManagementExcluded:false,OR:[{evidenceManagementExcluded:false},{evidenceManagementExcluded:null}]},month:{lte:asOf.slice(0,7)}}},include:{document:true,employee:{select:{name:true}},allocations:{where:{entry:{voidedAt:null,transactionDate:{lte:asOf}}}}}});
 return outstandingReport(invoices,approved,allocations,openings,payroll);
}
export function outstandingReport(invoices:any[],requests:any[],allocations:any[],openings:any[]=[],payroll:any[]=[]){
 const receivable=new Map<string,any>(),payable=new Map<string,any>();
 const payableDetails=new Map<string,any>();
 for(const invoice of invoices){
  const key=JSON.stringify([invoice.buyerOrgId,invoice.currencyCode]),code=invoice.currencyCode;
  const group=receivable.get(key)||{partyId:invoice.buyerOrgId,party:invoice.buyer?.name||'',currencyCode:code,debt:0n,matched:0n,separateReceived:0n,references:[]};
  if(invoice.status==='ISSUED')group.debt+=ledgerScale4(invoice.receivableAdded)-invoice.credits.reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
  group.matched+=openingSum(openings.filter(row=>row.invoiceId===invoice.id));
  group.matched+=allocations.filter(row=>row.invoiceId===invoice.id).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
  group.separateReceived+=invoice.payments.reduce((sum:bigint,row:any)=>sum+(row.kind==='REFUND'?-1n:1n)*ledgerScale4(row.amount),0n);
  group.references.push({kind:'INVOICE',id:invoice.id,number:invoice.invoiceNumber,date:invoice.issuedAt});receivable.set(key,group);
 }
 for(const request of requests)for(const item of request.items){
  const key=JSON.stringify([request.payeeEmployeeId?'EMPLOYEE':'PARTNER',request.payeeEmployeeId||request.partnerOrgId,item.currency]),group=payable.get(key)||{partyKind:request.payeeEmployeeId?'EMPLOYEE':'PARTNER',partyId:request.payeeEmployeeId||request.partnerOrgId,party:request.partner?.name||request.payeeEmployee?.name||'',currencyCode:item.currency,debt:0n,matched:0n,references:[]};
  const debt=ledgerScale4(item.amount),matched=openingSum(openings.filter(row=>row.expenseItemId===item.id))+allocations.filter(row=>row.expenseItemId===item.id).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
  group.debt+=debt;group.matched+=matched;
  const detailKey=JSON.stringify(['EXPENSE_REQUEST',request.id,item.currency]);
  const detail=payableDetails.get(detailKey)||{key:detailKey,party:group.party,currencyCode:item.currency,number:request.managementNumber||legacyExpenseNumber(request.id),date:request.scheduledPaymentDate||null,debt:0n,matched:0n,lines:[],representativeCode:'',representativeAmount:0n};
  const itemCode=item.transactionCode?.base?.code||item.transactionCode?.code||'';
  if(itemCode&&(!detail.representativeCode||debt>detail.representativeAmount)){detail.representativeCode=itemCode;detail.representativeAmount=debt;}
  detail.debt+=debt;detail.matched+=matched;
  if(item.description)detail.lines.push(item.description);
  payableDetails.set(detailKey,detail);
  if(!group.references.some((r:any)=>r.id===request.id))group.references.push({kind:'EXPENSE_REQUEST',id:request.id,number:request.managementNumber||legacyExpenseNumber(request.id),date:request.requestDate});payable.set(key,group);
 }
 for(const item of payroll){
  const key=JSON.stringify(['EMPLOYEE',item.employeeId,item.currencyCode]),group=payable.get(key)||{partyKind:'EMPLOYEE',partyId:item.employeeId,party:item.employee.name,currencyCode:item.currencyCode,debt:0n,matched:0n,references:[]};
  const debt=ledgerScale4(item.amount),matched=openingSum(item.allocations)+openingSum(openings.filter(row=>row.payrollItemId===item.id));
  group.debt+=debt;group.matched+=matched;group.references.push({kind:'PAYROLL',id:item.id,number:item.document.managementNumber,date:item.document.month+'-01'});payable.set(key,group);
  payableDetails.set('PAYROLL:'+item.id,{key:'PAYROLL:'+item.id,party:group.party,currencyCode:item.currencyCode,number:item.document.managementNumber,date:null,debt,matched,lines:[]});
 }
 for(const item of openings.filter(row=>row.kind==='OPENING')){
  const map=item.side==='AR'?receivable:payable,key=JSON.stringify(item.side==='AR'?[item.employeeId?'EMPLOYEE:'+item.employeeId:item.partyOrgId,item.currencyCode]:[item.employeeId?'EMPLOYEE':'PARTNER',item.employeeId||item.partyOrgId,item.currencyCode]);
  const group=map.get(key)||{partyKind:item.employeeId?'EMPLOYEE':'PARTNER',partyId:item.partyOrgId||item.employeeId,party:item.party?.name||item.employee?.name||'',currencyCode:item.currencyCode,debt:0n,matched:0n,separateReceived:0n,references:[]};
  group.debt+=ledgerScale4(item.amount);group.matched+=openingSum(item.allocations);group.references.push({kind:'OPENING',id:item.id,number:item.reason,date:item.balanceDate});map.set(key,group);
  if(item.side!=='AR')payableDetails.set('OPENING:'+item.id,{key:'OPENING:'+item.id,party:group.party,currencyCode:item.currencyCode,number:null,date:null,debt:ledgerScale4(item.amount),matched:openingSum(item.allocations),lines:[item.reason].filter(Boolean)});
 }
 const format=(group:any)=>({...group,debt:ledgerMoney(group.debt,group.currencyCode),matched:ledgerMoney(group.matched,group.currencyCode),balance:ledgerMoney(BigInt(group.debt)-BigInt(group.matched),group.currencyCode),separateReceived:ledgerMoney(group.separateReceived||0n,group.currencyCode),hasUnlinkedReceipt:group.separateReceived>0n&&group.separateReceived!==group.matched});
 const receivables=[...receivable.values()].filter(row=>row.debt!==row.matched||row.separateReceived>0n&&row.separateReceived!==row.matched).map(format),payables=[...payable.values()].filter(row=>row.debt!==row.matched).map(format);
 const currencies=[...new Set<string>([...receivables,...payables].map(row=>row.currencyCode))];
 const totals=currencies.map(code=>{const sum=(rows:any[],credit=false)=>rows.filter(row=>row.currencyCode===code).reduce((total:bigint,row:any)=>{const amount=ledgerScale4(row.balance)*(credit?-1n:1n);return total+(amount>0n?amount:0n);},0n);return {currencyCode:code,receivable:ledgerMoney(sum(receivables),code),payable:ledgerMoney(sum(payables),code),customerCredit:ledgerMoney(sum(receivables,true),code)};});
 const payableRows=[...payableDetails.values()].filter(row=>row.debt!==row.matched)
  .sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||String(a.number||'').localeCompare(String(b.number||'')))
  .map(({representativeAmount,...row})=>format(row));
 return {receivables,payables,payableRows,outstandingTotals:totals};
}
