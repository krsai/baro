import {Prisma} from '@prisma/client';

// A percentage invoice stores the full order basis separately from its billed
// amount. Use one current invoice basis, never sum repeated installments.
export async function loadIssuedOrderSalesValues(db:any,orders:any[]){
 const result=new Map<number,any>();
 if(!orders.length)return result;
 const args={where:{OR:orders.map(order=>({workOrderId:order.id,invoice:{sellerOrgId:order.sellerOrgId,buyerOrgId:order.buyerOrgId,status:'ISSUED' as const}}))},
  orderBy:[{invoice:{sequenceNumber:'desc' as const}},{id:'desc' as const}],
  select:{workOrderId:true,sourceOrderId:true,basisAmount:true,
   invoice:{select:{id:true,sellerOrgId:true,buyerOrgId:true,status:true,sequenceNumber:true,invoiceNumber:true,currencyCode:true,pricingBasis:true}},
   lines:{select:{id:true,styleId:true,styleCode:true,styleName:true,quantity:true,bucketQuantity:true,unitPrice:true,amount:true}}}
 } satisfies Prisma.InvoiceOrderFindManyArgs;
 const rows=await db.invoiceOrder.findMany(args);
 for(const order of orders){
  const candidates=rows.filter((row:any)=>row.workOrderId===order.id&&row.invoice.sellerOrgId===order.sellerOrgId&&row.invoice.buyerOrgId===order.buyerOrgId&&row.invoice.status==='ISSUED'&&(!order.orderId||row.sourceOrderId===order.orderId));
  const row=order.invoiceFinalLockInvoiceId?candidates.find((r:any)=>r.invoice.id===order.invoiceFinalLockInvoiceId):candidates[0];
  if(!row){if(order.invoiceFinalLockedAt)result.set(order.id,{status:'MISSING_PRICE',source:'ISSUED_INVOICE',amount:null,currencyCode:null,pricingBasis:null,hasMultipleScopes:false,lines:[]});continue;}
  const groups=new Map<string,any>();
  for(const line of row.lines){
   const key=JSON.stringify([line.styleId,line.styleCode,line.styleName,String(line.unitPrice),line.bucketQuantity]);
   const group=groups.get(key)||{key,styleId:line.styleId,styleCode:line.styleCode,styleName:line.styleName,quantity:0,bucketQuantity:line.bucketQuantity,unitPrice:String(line.unitPrice),amount:new Prisma.Decimal(0),status:'AVAILABLE'};
   group.quantity+=line.quantity;group.amount=group.amount.add(line.amount);groups.set(key,group);
  }
  result.set(order.id,{status:'AVAILABLE',source:'ISSUED_INVOICE',invoiceId:row.invoice.id,invoiceNumber:row.invoice.invoiceNumber,
   amount:String(row.basisAmount),currencyCode:row.invoice.currencyCode,pricingBasis:row.invoice.pricingBasis,hasMultipleScopes:false,
   lines:[...groups.values()].map(line=>({...line,amount:line.amount.toString()}))});
 }
 return result;
}
