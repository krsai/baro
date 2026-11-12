import {retryEditTransaction} from '../utils/editRevision';
import {createHttpError} from '../utils/http';
import {openingAdmin} from './accountingOpening';
import {ledgerMoney,ledgerScale4} from './bankLedger';

export async function readAccountingOpeningHistory(db:any,orgId:number,actorId:number,query:any){
 const page=Number(query.page||0),size=100;
 if(!Number.isSafeInteger(page)||page<0||page>1000)throw createHttpError(400,'LEDGER_INVALID_RANGE');
 return retryEditTransaction(db,async(tx:any)=>{
  await openingAdmin(tx,orgId,actorId);
  const take=(page+1)*size+1;
  const [entries,items]=await Promise.all([
   tx.bankLedgerEntry.findMany({where:{orgId,evidenceType:'ADJUSTMENT'},include:{account:{include:{entityAccount:true}},accountingCode:{select:{code:true}},changeApprovalRequests:{where:{status:'PENDING'},select:{id:true}}},orderBy:[{transactionDate:'desc'},{createdAt:'desc'},{id:'desc'}],take}),
   tx.accountingOpeningItem.findMany({where:{orgId,replacementItems:{none:{}}},include:{party:{select:{name:true}},employee:{select:{name:true}},accountingCode:{select:{code:true}},invoice:{select:{invoiceNumber:true}},expenseItem:{select:{expenseRequest:{select:{managementNumber:true}}}},payrollItem:{select:{document:{select:{managementNumber:true}}}},replacesItem:{include:{invoice:{select:{invoiceNumber:true}},expenseItem:{select:{expenseRequest:{select:{managementNumber:true}}}},payrollItem:{select:{document:{select:{managementNumber:true}}}}}},allocations:{where:{entry:{voidedAt:null}},select:{amount:true}}},orderBy:[{balanceDate:'desc'},{createdAt:'desc'},{id:'desc'}],take}),
  ]);
  const rows=[...entries.map((r:any)=>({id:r.id,source:'ACCOUNT',date:r.transactionDate,createdAt:r.createdAt,side:'ACCOUNT',party:r.account.entityAccount?.displayName||[r.account.bankName,r.account.accountNumber].filter(Boolean).join(' / '),code:r.accountingCode?.code||'',reference:'',treatment:'ACCOUNT',currencyCode:r.account.currencyCode,amount:ledgerMoney((r.direction==='OUT'?-1n:1n)*ledgerScale4(r.amount),r.account.currencyCode),remaining:null,reason:r.purpose,voidedAt:r.voidedAt,voidReason:r.voidReason,changePending:r.changeApprovalRequests.length>0,matched:false})),
   ...items.map((r:any)=>{
    const source=r.replacesItem||r;
    const matched=r.allocations.reduce((sum:bigint,a:any)=>sum+ledgerScale4(a.amount),0n);
    return {id:r.id,source:'ARAP',date:r.balanceDate,createdAt:r.createdAt,side:r.side,party:r.party?.name||r.employee?.name||'',code:r.accountingCode?.code||'',reference:source.invoice?.invoiceNumber||source.expenseItem?.expenseRequest?.managementNumber||source.payrollItem?.document?.managementNumber||'',treatment:r.replacesItemId?'REPLACED':r.kind,currencyCode:r.currencyCode,amount:String(r.amount),remaining:ledgerMoney(r.kind==='OPENING'?ledgerScale4(r.amount)-matched:0n,r.currencyCode),reason:r.reason,voidedAt:r.voidedAt,voidReason:r.voidReason,changePending:false,matched:matched>0n};
   })].sort((a:any,b:any)=>b.date.localeCompare(a.date)||new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()||b.id.localeCompare(a.id));
  return {rows:rows.slice(page*size,(page+1)*size),hasMore:rows.length>(page+1)*size};
 });
}
