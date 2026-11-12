import {formatInvoiceMoney} from './invoiceItemGrid.mjs';

// Describe calculated/stored amounts; do not recalculate or aggregate rounded orders.
export function invoiceAmountFormulaRows(orders=[],currencyCode){
 const money=value=>formatInvoiceMoney(value,currencyCode);
 return orders.flatMap(order=>{
  const base=order.subtotal??order.basisAmount,percent=order.percentage??order.billingPercentage;
  const billed=order.amount??order.billedAmount,net=order.netAmount;
  if(base==null||percent==null||billed==null||net==null)return [];
  const deduction=order.appliedDeductionAmount;
  return [{key:order.orderId??order.sourceOrderId,label:order.orderNumber??order.sourceOrderNumber,
   formula:`${money(base)} × ${percent}%${order.adjustmentAmount&&!/^[-+]?0(?:\.0+)?$/.test(String(order.adjustmentAmount))?` ${String(order.adjustmentAmount).startsWith('-')?'−':'+'} ${money(String(order.adjustmentAmount).replace(/^[+-]/,''))}`:''} = ${money(billed)}`,
   deduction:deduction!=null&&!/^0(?:\.0+)?$/.test(String(deduction))?`${money(billed)} − ${money(deduction)} = ${money(net)}`:null}];
 });
}
