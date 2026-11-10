import {parseDecimalUnits,formatDecimalUnits} from './invoiceBilling.mjs';

export const paymentAllocationAmount=(value,currency)=>currency==='USD'?String(value):String(value).replace(/\.0+$/,'');

export function paymentScheduleError(rows,totals){
 if(!rows?.length)return null;
 if(rows.length<2||rows.length>50||rows.some(row=>!row.label?.trim()||row.label.trim().length>100||!/^\d{4}-\d{2}-\d{2}$/.test(row.scheduledDate)||!Number.isFinite(Date.parse(row.scheduledDate+'T00:00:00Z'))||new Date(row.scheduledDate+'T00:00:00Z').toISOString().slice(0,10)!==row.scheduledDate||!['USD','VND','KRW'].includes(row.currency)||!new RegExp(`^\\d{1,16}${row.currency==='USD'?'(\\.\\d{1,2})?':''}$`).test(row.amount)||parseDecimalUnits(row.amount,2)<=0n))return 'invalid';
 const currencies=new Set([...rows,...totals].map(row=>row.currency));
 for(const currency of currencies){
  const planned=rows.filter(row=>row.currency===currency).reduce((sum,row)=>sum+parseDecimalUnits(row.amount,2),0n);
  const total=totals.find(row=>row.currency===currency);
  if(!total||total.incomplete||planned!==parseDecimalUnits(total.amount,2))return 'mismatch';
 }
 return null;
}

// Suggest explicit cost allocations for the selected installment; the accountant
// can still inspect/change them before submitting the bank transaction.
export function allocateScheduledPayment(document,schedule){
 if(!schedule)return {paymentScheduleId:'',amount:'',expenseItems:[]};
 let remaining=parseDecimalUnits(schedule.remaining,2);
 const expenseItems=[];
 for(const item of (document.items||[]).filter(item=>item.id===schedule.expenseItemId)){
  if(remaining<=0n)break;
  const available=parseDecimalUnits(item.remaining,2),amount=available<remaining?available:remaining;
  if(amount>0n)expenseItems.push({itemId:item.id,amount:formatDecimalUnits(amount,2),label:item.description});
  remaining-=amount;
 }
 return {paymentScheduleId:schedule.id,amount:schedule.remaining,expenseItems:expenseItems.map(item=>({...item,amount:schedule.currency==='USD'?item.amount:String(BigInt(item.amount.replace('.',''))/100n)}))};
}
