import {expenseLineAmounts,expenseDocumentTotals} from './expenseRequest.mjs';
export const newGeneralInvoiceLine=()=>({key:crypto.randomUUID(),transactionCodeId:null,description:'',unit:'',quantity:'1',unitPrice:'',vatRate:'0',remark:''});
export const generalInvoiceLines=snapshot=>(snapshot?.lines||[]).map(row=>({key:row.lineKey,transactionCodeId:row.transactionCodeId,description:row.description,unit:row.unit||'',quantity:String(row.quantity),unitPrice:String(row.unitPrice),vatRate:String(row.vatRate||'0'),remark:row.remark||'',code:row.code,codeDescription:row.codeDescription}));
export function calculateGeneralInvoiceDraft(lines,currency){
 const totals=expenseDocumentTotals(lines,currency);
 return {...totals,lines:lines.map(row=>({...row,...expenseLineAmounts(row,currency)})),valid:['VND','USD','KRW'].includes(currency)&&lines.length>0&&lines.length<=50&&!totals.incomplete&&lines.every(row=>Number.isSafeInteger(row.transactionCodeId)&&row.transactionCodeId>0&&row.description.trim())};
}
