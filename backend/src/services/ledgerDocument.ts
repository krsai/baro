import {createHttpError} from '../utils/http';
export async function ledgerDocumentEntries(db:any,orgId:number,documentId:string){
 const rows=await db.bankLedgerEntry.findMany({where:{orgId,documentId,voidedAt:null},orderBy:[{documentPosition:'asc'},{id:'asc'}],include:{account:true,accountingCode:{include:{base:true}},allocations:true,bankFeeLinks:{include:{fee:true}},bankFeeParent:true,ledgerDocument:true}});
 const ids=rows.flatMap((row:any)=>row.allocations.map((item:any)=>item.expenseItemId).filter(Boolean));
 const costs=ids.length?await db.partnerTransactionCost.findMany({where:{orgId,id:{in:ids}},select:{id:true,description:true,expenseRequestLine:true}}):[];
 return rows.map((row:any)=>({...row,allocations:row.allocations.map((item:any)=>({...item,expenseItem:costs.find((cost:any)=>cost.id===item.expenseItemId)||null}))}));
}
export function ledgerDocumentRoot(entries:any[]){
 const root=entries.find(item=>item.documentPosition===0);
 if(!root)throw createHttpError(409,'LEDGER_ENTRY_CHANGED');
 return root;
}
