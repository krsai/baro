import {loadInvoiceBillingCoverage} from './invoiceWorkflow';
import {loadOrderReceiptSettlement} from './orderReceiptSettlement';
import {orderWorkflowStatus} from './orderWorkflow';

// Closed is a projection of actual billing/evidence, never the legacy status column.
// Exclude policy-closed orders in SQL, then settled orders before production/pricing reads.
export async function loadOrderListCandidates(db:any,orgId:number,accessWhere:any[],include:any,excludeClosed=false){
 const candidates:any[]=await db.workOrder.findMany({
  where:{AND:[{OR:accessWhere},...(excludeClosed?[{NOT:{sellerOrgId:orgId,invoiceTargetPolicy:{is:{orgId,excluded:true}}}}]:[])]},
  orderBy:[{createdAt:'desc'},{id:'desc'}],include,
 });
 const invoiceCoverage=await loadInvoiceBillingCoverage(db,candidates);
 const receiptSettlement=await loadOrderReceiptSettlement(db,candidates,invoiceCoverage,orgId);
 const orders=excludeClosed?candidates.filter((order:any)=>orderWorkflowStatus({...order,
  isBillingComplete:invoiceCoverage.get(order.id)?.complete===true,
  isReceiptSettled:receiptSettlement.get(order.id)===true,
 },[],undefined,orgId)!=='COMPLETED'):candidates;
 return {orders,invoiceCoverage,receiptSettlement};
}
