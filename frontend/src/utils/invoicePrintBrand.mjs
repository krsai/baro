import {escapeInvoiceHtml as e} from './invoiceDraft.mjs';

// Use the logo captured at issue time, never current company branding.
export function invoiceBrandHtml(fields){
 const logo=fields?.logoDataUrl||'';
 const image=logo.length<=400000&&/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(logo)?`<img class="invoice-logo" alt="${e(fields.seller?.name||'Company')}" src="${e(logo)}">`:'';
 return `<div class="invoice-brand">${image}<h1 class="invoice-heading">INVOICE</h1></div>`;
}
export function invoiceSignatureHtml(fields,label){
 return `<footer class="invoice-signature"><div class="invoice-stamp"><strong>${e(fields.seller?.name)}</strong><div class="invoice-signing-space"></div><p>${e(label)}</p></div></footer>`;
}
