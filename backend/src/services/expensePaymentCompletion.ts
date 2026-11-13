import {Prisma} from '@prisma/client';

// Completion is per real expense item. A single link, approval, pending payment,
// or bookkeeping exclusion does not mean the whole request has been paid.
export function expensePaymentCompletionByItem(items:any[],allocations:any[]){
 const paid=new Map<string,Prisma.Decimal>();
 for(const allocation of allocations)if(allocation.expenseItemId){
  const id=allocation.expenseItemId;
  paid.set(id,(paid.get(id)||new Prisma.Decimal(0)).add(allocation.amount??0));
 }
 return new Map(items.map(item=>[item.id,new Prisma.Decimal(item.amount).gt(0)&&(paid.get(item.id)||new Prisma.Decimal(0)).gte(item.amount)]));
}

export async function attachExpensePaymentCompletion(db:any,orgId:number,items:any[]){
 const ids=items.map(item=>item.id);
 const allocations=ids.length?await db.bankLedgerEvidenceAllocation.findMany({where:{orgId,expenseItemId:{in:ids},entry:{orgId,voidedAt:null}},select:{expenseItemId:true,amount:true}}):[];
 const complete=expensePaymentCompletionByItem(items,allocations);
 return items.map(item=>({...item,bankPaymentComplete:complete.get(item.id)===true}));
}
