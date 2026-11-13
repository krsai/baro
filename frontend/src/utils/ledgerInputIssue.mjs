import {ledgerTransferCurrency} from './ledgerFlow.mjs';

// BANK_FEE deliberately has no recipient or evidence document. The server
// resolves its company-owned BNFE code again before creating the ledger entry.
export function ledgerInputIssue(rows,accounts,parties){
 for(const [index,row] of rows.entries()){
  let field;
  if(!String(row.amount??'').trim())field='amount';
  else if(!row.accountingCodeId)field='code';
  else if(row.entryKind==='WRITEOFF'&&!row.purpose?.trim())field='purpose';
  else if(row.entryKind==='BANK'){
   const account=accounts.find(account=>account.id===row.accountId);
   if(!account)field='account';
   else if(row.counterparty?.kind==='ACCOUNT'&&ledgerTransferCurrency(row,accounts,parties)!==account.currencyCode&&!row.transferAmount?.trim())field='transferAmount';
   else if(row.evidenceType==='FILE'&&!row.counterparty)field='counterparty';
   else if(row.evidenceType==='FILE'&&row.counterparty?.kind!=='ACCOUNT'&&!row.evidenceNumber?.trim())field='evidence';
   else if(['INVOICE','EXPENSE','OPENING','PAYROLL'].includes(row.evidenceType)&&!row.document)field='document';
   else if(row.evidenceType==='EXPENSE'&&!row.expenseItems?.length)field='allocation';
   else if(row.evidenceType==='EXPENSE'&&row.document?.paymentSchedule?.some(schedule=>row.expenseItems.some(item=>item.itemId===schedule.expenseItemId))&&!row.paymentScheduleId)field='schedule';
  }
  if(field){
   const parentKey=row.feeForClientKey||row.parentClientKey;
   const visible=rows.filter(row=>!row.feeForClientKey&&row.entryKind!=='FEE');
   return {field,index,rowNumber:visible.findIndex(item=>item.clientKey===(parentKey||row.clientKey))+1,fee:row.evidenceType==='BANK_FEE'||row.entryKind==='FEE'};
  }
 }
 return null;
}
