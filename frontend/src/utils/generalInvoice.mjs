import {expenseLineAmounts,expenseDocumentTotals} from './expenseRequest.mjs';
export const newGeneralInvoiceLine=(currencyCode='VND')=>({currencyCode,key:crypto.randomUUID(),transactionCodeId:null,description:'',unit:'',quantity:'1',unitPrice:'',vatRate:'0',remark:''});
export const generalInvoiceLines=snapshot=>(snapshot?.lines||[]).map(row=>({currencyCode:row.currencyCode||snapshot.currencyCode,key:row.lineKey,transactionCodeId:row.transactionCodeId,description:row.description,unit:row.unit||'',...(row.unitId?{unitId:row.unitId}:{}),...(row.materialItemId?{materialItemId:row.materialItemId,materialItemSnapshot:row.materialItemSnapshot,materialVariantId:row.materialItemSnapshot?.variantId,materialVariantRevision:row.materialItemSnapshot?.variantRevision}:{}),quantity:String(row.quantity),unitPrice:String(row.unitPrice),vatRate:String(row.vatRate||'0'),remark:row.remark||'',code:row.code,codeDescription:row.codeDescription}));
export function calculateGeneralInvoiceDraft(lines,currency){
 const codes=[...new Set(lines.map(row=>row.currencyCode||currency))];
 const currencyTotals=codes.map(currencyCode=>({currencyCode,...expenseDocumentTotals(lines.filter(row=>(row.currencyCode||currency)===currencyCode),currencyCode)}));
 const totals=currencyTotals.length===1?currencyTotals[0]:{subtotal:null,vatAmount:null,amount:null};
 return {...totals,currencyTotals,lines:lines.map(row=>({...row,currencyCode:row.currencyCode||currency,...expenseLineAmounts(row,row.currencyCode||currency)})),valid:codes.every(code=>['VND','USD','KRW'].includes(code))&&lines.length>0&&lines.length<=50&&currencyTotals.every(total=>!total.incomplete)&&lines.every(row=>Number.isSafeInteger(row.transactionCodeId)&&row.transactionCodeId>0&&row.description.trim())};
}
