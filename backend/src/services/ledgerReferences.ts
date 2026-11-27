import {legacyExpenseNumber} from './documentNumber';

// Identity and evidence are separate, company-scoped read projections.
export async function ledgerReferenceDetails(db:any,orgId:number,entries:any[]){
 const expenseIds=[...new Set(entries.flatMap(entry=>(entry.allocations||[]).map((row:any)=>row.expenseItemId).filter(Boolean)))];
 const invoiceIds=[...new Set(entries.flatMap(entry=>(entry.allocations||[]).map((row:any)=>row.invoiceId).filter(Boolean)))];
 const [expenses,invoices]=await Promise.all([
  expenseIds.length?db.partnerTransactionCost.findMany({where:{orgId,id:{in:expenseIds}},select:{id:true,expenseRequestId:true,expenseRequest:{select:{managementNumber:true}}}}):[],
  invoiceIds.length?db.invoice.findMany({where:{sellerOrgId:orgId,id:{in:invoiceIds}},select:{id:true,invoiceNumber:true}}):[],
 ]);
 return new Map<string,any>(entries.map(entry=>{
  const expenseRequestNumbers:string[]=[],invoiceNumbers:string[]=[];
  for(const allocation of entry.allocations||[]){
   const expense=expenses.find((row:any)=>row.id===allocation.expenseItemId),invoice=invoices.find((row:any)=>row.id===allocation.invoiceId);
   if(expense?.expenseRequestId)expenseRequestNumbers.push(expense.expenseRequest?.managementNumber||legacyExpenseNumber(expense.expenseRequestId));
   if(invoice?.invoiceNumber)invoiceNumbers.push(invoice.invoiceNumber);
  }
  const evidence=String(entry.evidenceNumber||'').trim().replace(/^["']|["']$/g,'');
  return [entry.id,{managementNumber:entry.ledgerDocument?.managementNumber||entry.managementIdentity?.managementNumber||'',expenseRequestNumbers:[...new Set(expenseRequestNumbers)],invoiceNumbers:[...new Set(invoiceNumbers)],evidenceFilename:entry.evidenceType==='FILE'&&!evidence.startsWith('IBT:')?evidence.split(/[\\/]/).pop()||'':''}];
 }));
}
