import {invoiceUi} from '../constants/invoiceUi.js';
import {escapeInvoiceHtml} from './invoiceDraft.mjs';

export const invoicePartyRows=[
 {className:'invoice-party-main',keys:['name','taxId']},
 {className:'invoice-party-address-row',keys:['address']},
 {className:'invoice-party-contacts',keys:['contactName','phone','email']},
];
export const invoicePartyLabels=languageCode=>({... (invoiceUi[languageCode]||invoiceUi.en),...({
 ko:{name:'회사명',contactName:'담당자'},en:{name:'Company name',contactName:'Contact person'},vi:{name:'Tên công ty',contactName:'Người liên hệ'},
}[languageCode]||{name:'Company name',contactName:'Contact person'})});

// All invoice kinds render the same declared fields, using only their snapshot.
export function invoicePartyHtml(title,party={},languageCode='en'){
 const e=escapeInvoiceHtml,labels=invoicePartyLabels(languageCode);
 return `<section class="invoice-party"><h2 class="invoice-party-title">${e(title)}</h2>${invoicePartyRows.map(row=>`<div class="invoice-party-row ${row.className}">${row.keys.map(key=>`<div class="invoice-cell"><span class="invoice-cell-label">${e(labels[key])}</span><span class="invoice-cell-value">${e(party[key])}</span></div>`).join('')}</div>`).join('')}</section>`;
}
