import {createHttpError} from '../utils/http';

export async function orderInvoiceListScope(db:any,orgId:number,sourceOrderId:unknown){
 const orderId=String(sourceOrderId||'');
 if(!orderId)return null;
 if(orderId.length>200)throw createHttpError(400,'INVOICE_ORDER_FILTER_INVALID');
 const order=await db.workOrder.findFirst({where:{sellerOrgId:orgId,orderId},select:{id:true,orderId:true,orderNumber:true}});
 if(!order)throw createHttpError(404,'INVOICE_ORDER_NOT_FOUND');
 return order;
}
export async function loadOrderInvoiceCounts(db:any,orgId:number,orders:any[]){
 const ids=orders.filter(order=>order.sellerOrgId===orgId).map(order=>order.id);
 if(!ids.length)return new Map<number,number>();
 const counts=await db.invoiceOrder.groupBy({by:['workOrderId'],where:{workOrderId:{in:ids},invoice:{sellerOrgId:orgId,status:{not:'DELETED'}}},_count:{invoiceId:true}});
 return new Map<number,number>(counts.map((row:any)=>[row.workOrderId,row._count.invoiceId]));
}
