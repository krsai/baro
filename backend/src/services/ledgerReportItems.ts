import {ledgerScale4} from './bankLedger';

// Read projections only: keep ledger IDs for navigation and actual child IDs for identity.
export function ledgerReportItems(entry:any){
 const allocations=(entry.allocations||[]).filter((row:any)=>row.expenseItemId);
 const lines=entry.settlementLines||[];
 const scaled=(amount:bigint)=>`${amount/10000n}.${String(amount%10000n).padStart(4,'0')}`;
 const fee=lines.filter((line:any)=>line.kind==='FEE').reduce((sum:bigint,line:any)=>sum+ledgerScale4(line.amount),0n);
 const common={...entry,ledgerEntryId:entry.id};
 const principal=allocations.length?allocations.map((allocation:any)=>({
  ...common,itemId:allocation.id||allocation.expenseItemId,amount:allocation.amount,
  accountingCode:allocation.expenseItem?.transactionCode||null,
  accountingCodeId:allocation.expenseItem?.transactionCodeId??null,
  purpose:allocation.expenseItem?.description||entry.purpose,
 })): [{...common,itemId:entry.id,amount:fee===0n?entry.amount:scaled(ledgerScale4(entry.amount)+(entry.direction==='IN'?fee:-fee))}];
 if(allocations.length){
  const remainder=ledgerScale4(entry.amount)-fee-allocations.reduce((sum:bigint,row:any)=>sum+ledgerScale4(row.amount),0n);
  if(remainder>0n)principal.push({...common,itemId:entry.id,amount:scaled(remainder),accountingCode:null,accountingCodeId:null});
 }
 return [...principal,...lines.map((line:any)=>({...common,itemId:line.id,reportKind:'SETTLEMENT',
  cashMovement:line.kind==='FEE',direction:'OUT',amount:line.amount,
  accountingCode:line.accountingCode,accountingCodeId:line.accountingCodeId??line.accountingCode?.id??null,purpose:line.purpose,
 }))];
}

export async function attachLedgerReportItems(db:any,orgId:number,entries:any[],codeInclude:any){
 const ids=[...new Set<string>(entries.flatMap(row=>(row.allocations||[]).map((allocation:any)=>allocation.expenseItemId).filter(Boolean)))];
 const expenses=ids.length?await db.partnerTransactionCost.findMany({where:{orgId,id:{in:ids}},select:{id:true,transactionCodeId:true,description:true,transactionCode:{include:codeInclude}}}):[];
 const byId=new Map(expenses.map((row:any)=>[row.id,row]));
 return entries.map(row=>({...row,allocations:(row.allocations||[]).map((allocation:any)=>({...allocation,expenseItem:byId.get(allocation.expenseItemId)||null}))}));
}
