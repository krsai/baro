import {paymentAccountsHtml} from './invoicePaymentAccount.mjs';
import {invoicePartyHtml} from './invoicePartyLayout.mjs';
import {escapeInvoiceHtml as e} from './invoiceDraft.mjs';
import {invoiceDocumentCss,invoicePrintCss} from './invoiceDocumentStyle.mjs';
import {formatInvoiceMoney} from './invoiceItemGrid.mjs';
import {invoiceNumber} from './invoiceStyleRows.mjs';
import {generalInvoiceText} from '../constants/generalInvoice.js';
import {invoiceDocumentText} from '../constants/invoiceDocument.js';
import {invoiceUi} from '../constants/invoiceUi.js';

export function buildGeneralInvoicePrintHtml(invoice,languageCode='en'){
 languageCode='en';
 const s=invoice.snapshot,f=s.fields,t=generalInvoiceText[languageCode]||generalInvoiceText.en,d=invoiceDocumentText[languageCode]||invoiceDocumentText.en,ui=invoiceUi[languageCode]||invoiceUi.en;
 const money=(value,currency=s.currencyCode)=>e(formatInvoiceMoney(value,currency)),num=value=>e(invoiceNumber(value));
 const cell=(label,value)=>`<div class="invoice-cell"><span class="invoice-cell-label">${e(label)}</span><span class="invoice-cell-value">${e(value)}</span></div>`;
 const party=(label,value={})=>invoicePartyHtml(label,value,languageCode);
 return `<!doctype html><html lang="${['ko','en','vi'].includes(languageCode)?languageCode:'en'}"><head><meta charset="utf-8"><title>${e(f.number)} · ${e(d.title)}</title><style>@page{size:A4;margin:14mm}body{margin:0;padding:0;background:white}${invoiceDocumentCss}${invoicePrintCss}thead{display:table-header-group}tr,section{break-inside:avoid}.invoice-lines{margin:16px 0}</style></head><body><main class="invoice-sheet invoice-print"><header class="invoice-document-top"><h1 class="invoice-heading">${e(d.title)}</h1><div class="invoice-document-identifiers">${cell(d.number,f.number)}${cell(ui.date,f.date)}</div></header>${invoice.status!=='ISSUED'?`<p>${e(invoice.status==='CANCELLED'?ui.cancelled:ui.superseded)}</p>`:''}<div class="invoice-parties">${party(d.buyer,f.buyer)}${party(d.seller,f.seller)}</div>
 <table class="invoice-lines"><colgroup>${[4,26,7,11,7,10,6,12,17].map(width=>`<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${['#',t.description,t.unit,t.quantity,t.currency,t.price,t.vat,t.tax,t.total].map((label,index)=>`<th${index>=3?' class="num"':''}>${e(label)}</th>`).join('')}</tr></thead><tbody>${s.lines.map((line,index)=>`<tr><td>${index+1}</td><td>${e(line.description)}</td><td>${e(line.unit)}</td><td class="num">${num(line.quantity)}</td><td>${e(line.currencyCode||s.currencyCode)}</td><td class="num">${num(line.unitPrice)}</td><td class="num">${num(line.vatRate)}%</td><td class="num">${money(line.vatAmount,line.currencyCode||s.currencyCode)}</td><td class="num">${money(line.amount,line.currencyCode||s.currencyCode)}</td></tr>`).join('')}</tbody></table>
 <section class="invoice-summary"><div><p class="invoice-cell-label">${e(ui.notes)}</p><p style="white-space:pre-wrap">${e(f.notes)}</p></div><div>${(s.currencyTotals||[{currencyCode:s.currencyCode,subtotal:s.subtotal,vatAmount:s.vatAmount,total:s.total}]).map(total=>`<div class="invoice-total"><span>${e(t.subtotal)}</span><span>${money(total.subtotal,total.currencyCode)}</span></div><div class="invoice-total"><span>${e(t.tax)}</span><span>${money(total.vatAmount,total.currencyCode)}</span></div><div class="invoice-total"><span>${e(t.total)}${s.currencyTotals?.length>1?' / '+e(total.currencyCode):''}</span><span>${money(total.total,total.currencyCode)}</span></div>`).join('')}</div><div class="invoice-bank-section">${cell(ui.bank,'')}${paymentAccountsHtml(f,languageCode,e)}</div></section><footer class="invoice-signature"><div class="invoice-stamp"><strong>${e(f.seller?.name)}</strong><p>${e(d.stamp)}</p></div></footer></main></body></html>`;
}
