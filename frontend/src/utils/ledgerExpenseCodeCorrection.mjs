import {expenseLinePayload} from './expenseRequest.mjs';

// Reuse expense approval and its atomic replacement of every linked payment.
// Change one actual allocated item; never infer items from matching code names.
export function expenseCodeCorrectionInput(form,itemId,codeId,clientKey,ledgerOrigin){
 const item=form?.items?.find(line=>line.itemId===itemId);
 if(!item||!form.canonicalSource?.id||!form.revision||!Number.isSafeInteger(codeId)||codeId<=0)throw Error('CHANGE_SOURCE_CHANGED');
 return {menu:'EXPENSE',operation:'UPDATE',sourceKind:form.canonicalSource.kind,sourceId:String(form.canonicalSource.id),revision:form.revision,version:form.version,
  payload:{...(ledgerOrigin?{ledgerCodeOrigin:{entryId:ledgerOrigin.entryId,revision:ledgerOrigin.revision,itemId}}:{}),clientKey,revision:form.revision,version:form.version,remark:form.remark,requestDate:form.requestDate,scheduledPaymentDate:form.scheduledPaymentDate||null,partnerOrgId:form.partnerOrgId||null,payeeEmployeeId:form.payeeEmployeeId||null,
   items:form.items.map(line=>expenseLinePayload(line.itemId===itemId?{...line,transactionCodeId:codeId}:line))}};
}
