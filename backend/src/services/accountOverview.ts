import {createHttpError} from '../utils/http';
import {retryEditTransaction} from '../utils/editRevision';
import {ledgerDate,ledgerScale4,ledgerMoney,readLedgerAccounts} from './bankLedger';
import {attachExpenseApprovalStates} from './bankEvidence';
import {legacyExpenseNumber} from './documentNumber';
export const accountReportToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function shiftReportDate(value:string,days:number){const date=new Date(value+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);}
const delta=(rows:any[])=>rows.reduce((sum:bigint,row:any)=>sum+(row.direction==='IN'?1n:-1n)*ledgerScale4(row._sum.amount||'0'),0n);
const amountSum=(rows:any[],direction:string)=>rows.filter(row=>row.direction===direction).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row._sum.amount||'0'),0n);
const accountName=(a:any)=>a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / ');
export function accountBalanceReport(accounts:any[],flows:any[],asOf:string){
 const monthStart=asOf.slice(0,7)+'-01',yesterday=shiftReportDate(asOf,-1),historyStart=shiftReportDate(asOf,-29);
 const summaries=accounts.map(account=>{
  const code=account.currencyCode,own=flows.filter(row=>row.accountId===account.id),month=own.filter(row=>row.transactionDate>=monthStart&&row.transactionDate<=asOf),day=own.filter(row=>row.transactionDate===yesterday),balance=ledgerScale4(account.currentBalance),change=delta(month);
  return {id:account.id,name:accountName(account),currencyCode:code,openingDate:account.openingDate,beginningBalance:ledgerMoney(balance-change,code),totalIn:ledgerMoney(amountSum(month,'IN'),code),totalOut:ledgerMoney(amountSum(month,'OUT'),code),change:ledgerMoney(change,code),currentBalance:ledgerMoney(balance,code),yesterdayIn:ledgerMoney(amountSum(day,'IN'),code),yesterdayOut:ledgerMoney(amountSum(day,'OUT'),code)};
 });
 const currencies=[...new Set<string>(accounts.map(row=>row.currencyCode))];
 const fields=['beginningBalance','totalIn','totalOut','change','currentBalance','yesterdayIn','yesterdayOut'];
 const totals=currencies.map(code=>({currencyCode:code,...Object.fromEntries(fields.map(field=>[field,ledgerMoney(summaries.filter(row=>row.currencyCode===code).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row[field]),0n),code)]))}));
 const balances=new Map<string,bigint>(accounts.map(row=>[row.id,ledgerScale4(row.currentBalance)])),history:any[]=[];
 for(let index=0;index<30;index++){
  const date=shiftReportDate(asOf,-index),dailyAccounts=accounts.map(account=>({accountId:account.id,balance:ledgerMoney(balances.get(account.id)!,account.currencyCode)}));
  history.unshift({date,accounts:dailyAccounts,currencyTotals:currencies.map(code=>({currencyCode:code,balance:ledgerMoney(accounts.filter(row=>row.currencyCode===code).reduce((sum:bigint,row)=>sum+balances.get(row.id)!,0n),code)}))});
  for(const account of accounts){let balance=balances.get(account.id)!-delta(flows.filter(row=>row.accountId===account.id&&row.transactionDate===date));if(account.openingDate===date)balance-=ledgerScale4(account.openingBalance);balances.set(account.id,balance);}
 }
 return {asOf,monthStart,yesterday,historyStart,accounts:summaries,currencyTotals:totals,history};
}
export async function loadAccountOverview(db:any,orgId:number,query:any={}){
 const today=accountReportToday(),asOf=ledgerDate(query.asOf||today);
 if(asOf!==today)throw createHttpError(400,'LEDGER_INVALID_RANGE');
 return retryEditTransaction(db,async(tx:any)=>{
  const accounts=await readLedgerAccounts(tx,orgId,asOf),monthStart=asOf.slice(0,7)+'-01',yesterday=shiftReportDate(asOf,-1),historyStart=shiftReportDate(asOf,-29),start=[monthStart,yesterday,historyStart].sort()[0];
  const [flows,dailyEntries,outstanding]=await Promise.all([
   tx.bankLedgerEntry.groupBy({by:['accountId','transactionDate','direction'],where:{orgId,voidedAt:null,transactionDate:{gte:start,lte:asOf}},_sum:{amount:true}}),
   tx.bankLedgerEntry.findMany({where:{orgId,voidedAt:null,transactionDate:yesterday},include:{allocations:{include:{invoice:{select:{buyer:{select:{name:true}}}},expenseItem:{select:{partner:{select:{name:true}}}}}},settlementLines:true},orderBy:[{accountId:'asc'},{createdAt:'asc'},{id:'asc'}]}),
   loadOutstanding(tx,orgId,asOf),
  ]);
  const known=new Map<string,any>(accounts.map((row:any)=>[row.id,row]));
  const transactions=dailyEntries.map((row:any)=>{const account=known.get(row.accountId);if(!account)throw createHttpError(409,'LEDGER_ACCOUNT_NOT_FOUND');return {id:row.id,accountId:row.accountId,accountName:accountName(account),currencyCode:account.currencyCode,direction:row.direction,amount:ledgerMoney(ledgerScale4(row.amount),account.currencyCode),purpose:row.purpose,counterparty:[...new Set(row.allocations.map((a:any)=>a.invoice?.buyer?.name||a.expenseItem?.partner?.name).filter(Boolean))].join(', '),settlementLines:row.settlementLines.map((line:any)=>({id:line.id,kind:line.kind,amount:ledgerMoney(ledgerScale4(line.amount),account.currencyCode),purpose:line.purpose}))};});
  return {orgId,...accountBalanceReport(accounts,flows,asOf),transactions,...outstanding};
 },60000);
}
async function loadOutstanding(tx:any,orgId:number,asOf:string):Promise<any>{
 const [invoices,requests,allocations]=await Promise.all([
  tx.invoice.findMany({where:{sellerOrgId:orgId},select:{id:true,buyerOrgId:true,currencyCode:true,status:true,invoiceNumber:true,receivableAdded:true,issuedAt:true,buyer:{select:{name:true}},credits:{where:{voidedAt:null},select:{amount:true}},payments:{where:{voidedAt:null,receivedAt:{lte:new Date(`${asOf}T23:59:59.999+07:00`)}},select:{kind:true,amount:true}}}}),
  tx.expenseRequest.findMany({where:{orgId,requestDate:{lte:asOf}},include:{partner:{select:{name:true}},createdByEmployee:{select:{id:true,orgId:true,status:true,orgRole:true}},approvalSteps:{orderBy:{position:'asc'}},items:{select:{id:true,currency:true,amount:true}}}}),
  tx.bankLedgerEvidenceAllocation.findMany({where:{orgId,entry:{voidedAt:null,transactionDate:{lte:asOf}}},select:{invoiceId:true,expenseItemId:true,amount:true}}),
 ]);
 const approved=(await attachExpenseApprovalStates(tx,orgId,requests)).filter((row:any)=>row.approval.approved);
 return outstandingReport(invoices,approved,allocations);
}
export function outstandingReport(invoices:any[],requests:any[],allocations:any[]){
 const receivable=new Map<string,any>(),payable=new Map<string,any>();
 for(const invoice of invoices){
  const key=JSON.stringify([invoice.buyerOrgId,invoice.currencyCode]),code=invoice.currencyCode;
  const group=receivable.get(key)||{partyId:invoice.buyerOrgId,party:invoice.buyer?.name||'',currencyCode:code,debt:0n,matched:0n,separateReceived:0n,references:[]};
  if(invoice.status==='ISSUED')group.debt+=ledgerScale4(invoice.receivableAdded)-invoice.credits.reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
  group.matched+=allocations.filter(row=>row.invoiceId===invoice.id).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
  group.separateReceived+=invoice.payments.reduce((sum:bigint,row:any)=>sum+(row.kind==='REFUND'?-1n:1n)*ledgerScale4(row.amount),0n);
  group.references.push({kind:'INVOICE',id:invoice.id,number:invoice.invoiceNumber,date:invoice.issuedAt});receivable.set(key,group);
 }
 for(const request of requests)for(const item of request.items){
  const key=JSON.stringify([request.partnerOrgId,item.currency]),group=payable.get(key)||{partyId:request.partnerOrgId,party:request.partner?.name||'',currencyCode:item.currency,debt:0n,matched:0n,references:[]};
  group.debt+=ledgerScale4(item.amount);group.matched+=allocations.filter(row=>row.expenseItemId===item.id).reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
  if(!group.references.some((r:any)=>r.id===request.id))group.references.push({kind:'EXPENSE_REQUEST',id:request.id,number:request.managementNumber||legacyExpenseNumber(request.id),date:request.requestDate});payable.set(key,group);
 }
 const format=(group:any)=>({...group,debt:ledgerMoney(group.debt,group.currencyCode),matched:ledgerMoney(group.matched,group.currencyCode),balance:ledgerMoney(BigInt(group.debt)-BigInt(group.matched),group.currencyCode),separateReceived:ledgerMoney(group.separateReceived||0n,group.currencyCode),hasUnlinkedReceipt:group.separateReceived>0n&&group.separateReceived!==group.matched});
 const receivables=[...receivable.values()].filter(row=>row.debt!==row.matched||row.separateReceived>0n&&row.separateReceived!==row.matched).map(format),payables=[...payable.values()].filter(row=>row.debt!==row.matched).map(format);
 const currencies=[...new Set<string>([...receivables,...payables].map(row=>row.currencyCode))];
 const totals=currencies.map(code=>{const sum=(rows:any[],credit=false)=>rows.filter(row=>row.currencyCode===code).reduce((total:bigint,row:any)=>{const amount=ledgerScale4(row.balance)*(credit?-1n:1n);return total+(amount>0n?amount:0n);},0n);return {currencyCode:code,receivable:ledgerMoney(sum(receivables),code),payable:ledgerMoney(sum(payables),code),customerCredit:ledgerMoney(sum(receivables,true),code)};});
 return {receivables,payables,outstandingTotals:totals};
}
