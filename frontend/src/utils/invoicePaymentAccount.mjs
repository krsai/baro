import {invoicePaymentAccountText} from '../constants/invoicePaymentAccount.js';
export const paymentAccountSnapshot=account=>({bankName:account.bankName,accountNumber:account.accountNumber,accountHolder:account.accountHolder,currencyCode:account.currency?.code||account.currencyCode||'',swiftCode:account.swiftCode||''});
export const paymentAccountRows=(snapshot,languageCode='en')=>{const t=invoicePaymentAccountText[languageCode]||invoicePaymentAccountText.en;return ['bankName','accountNumber','accountHolder','currencyCode','swiftCode'].map(key=>({key,label:t[key],value:snapshot?.[key]||'—'}));};
export const paymentAccountFields=account=>{const snapshot=paymentAccountSnapshot(account);return {bankAccountId:account.id,bankAccountRevision:account.updatedAt||'',bankAccountSnapshot:snapshot,bank:paymentAccountRows(snapshot).map(row=>row.label+': '+row.value).join('\n')};};
export const paymentAccountSelections=fields=>Array.isArray(fields?.bankAccounts)?fields.bankAccounts:fields?.bankAccountSnapshot?[{id:fields.bankAccountId,revision:fields.bankAccountRevision||'',snapshot:fields.bankAccountSnapshot}]:[];
export function paymentAccountsFields(accounts){
 if(accounts.length>3||new Set(accounts.map(row=>row.id)).size!==accounts.length)throw new Error('INVOICE_BANK_ACCOUNT_INVALID');
 const bankAccounts=accounts.map(account=>({id:account.id,revision:account.updatedAt?.toISOString?.()||account.updatedAt||account.revision||'',snapshot:paymentAccountSnapshot(account)})),first=bankAccounts[0];
 return {bankAccounts,bankAccountId:first?.id??null,bankAccountRevision:first?.revision||'',bankAccountSnapshot:first?.snapshot||null,bank:bankAccounts.map(row=>paymentAccountRows(row.snapshot).map(field=>field.label+': '+field.value).join('\n')).join('\n\n')};
}
export const paymentAccountText=(fields,languageCode='en')=>paymentAccountSelections(fields).length?paymentAccountSelections(fields).map(account=>paymentAccountRows(account.snapshot,languageCode).map(row=>row.label+': '+row.value).join('\n')).join('\n\n'):Array.isArray(fields?.bankAccounts)?'':fields?.bank||'';
export function paymentAccountsHtml(fields,languageCode,escape){
 const accounts=paymentAccountSelections(fields);
 if(!accounts.length)return `<div class="invoice-bank-lines">${String(paymentAccountText(fields,languageCode)||'—').split(/\r?\n/).map(line=>`<p class="invoice-bank-line">${escape(line)}</p>`).join('')}</div>`;
 return `<div class="invoice-bank-grid" style="--invoice-bank-count:${accounts.length};--invoice-bank-tablet-count:${Math.min(2,accounts.length)}">${accounts.map(account=>`<dl class="invoice-bank-card">${paymentAccountRows(account.snapshot,languageCode).map(row=>`<dt>${escape(row.label)}</dt><dd>${escape(row.value)}</dd>`).join('')}</dl>`).join('')}</div>`;
}
export const paymentAccountError=(error,languageCode='en')=>['INVOICE_BANK_ACCOUNT_INVALID','INVOICE_BANK_ACCOUNT_CHANGED'].includes(error)?(invoicePaymentAccountText[languageCode]||invoicePaymentAccountText.en).invalid:'';
