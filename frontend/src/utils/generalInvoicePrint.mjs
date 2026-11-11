import {escapeInvoiceHtml as e} from './invoiceDraft.mjs';
import {invoiceDocumentCss} from './invoiceDocumentStyle.mjs';
import {formatInvoiceMoney} from './invoiceItemGrid.mjs';
import {invoiceNumber} from './invoiceStyleRows.mjs';
import {generalInvoiceText} from '../constants/generalInvoice.js';
import {invoiceDocumentText} from '../constants/invoiceDocument.js';
import {invoiceUi} from '../constants/invoiceUi.js';

export function buildGeneralInvoicePrintHtml(invoice,languageCode='en'){
 const s=invoice.snapshot,f=s.fields,t=generalInvoiceText[languageCode]||generalInvoiceText.en,d=invoiceDocumentText[languageCode]||invoiceDocumentText.en,ui=invoiceUi[languageCode]||invoiceUi.en;
 const money=value=>e(formatInvoiceMoney(value,s.currencyCode)),num=value=>e(invoiceNumber(value));
 const cell=(label,value)=>`<div class="invoice-cell"><span class="invoice-cell-label">${e(label)}</span><span class="invoice-cell-value">${e(value)}</span></div>`;
 const party=(label,row={})=>`<section class="invoice-party"><h2 class="invoice-party-title">${e(label)}</h2>${['name','address','taxId','phone','email'].map(key=>cell(ui[key],row[key])).join('')}</section>`;
 return `<!doctype html><html lang="${['ko','en','vi'].includes(languageCode)?languageCode:'en'}"><head><meta charset="utf-8"><title>${e(f.number)} · ${e(t.general)}</title><style>@page{size:A4;margin:14mm}body{margin:0;padding:24px;background:white}${invoiceDocumentCss}thead{display:table-header-group}tr,section{break-inside:avoid}.invoice-lines{margin:16px 0}.invoice-total{margin:8px 0}</style></head><body><main class="invoice-sheet"><h1 class="invoice-heading">${e(t.general)}</h1>${invoice.status!=='ISSUED'?`<p>${e(invoice.status==='CANCELLED'?ui.cancelled:ui.superseded)}</p>`:''}<div class="invoice-parties">${party(d.buyer,f.buyer)}${party(d.seller,f.seller)}</div><div class="invoice-metadata">${cell(d.number,f.number)}${cell(ui.date,f.date)}</div>
 <table class="invoice-lines"><thead><tr>${['#',t.description,t.unit,t.quantity,t.price,t.vat,t.tax,t.total].map((label,index)=>`<th${index>=3?' class="num"':''}>${e(label)}</th>`).join('')}</tr></thead><tbody>${s.lines.map((line,index)=>`<tr><td>${index+1}</td><td>${e(line.description)}</td><td>${e(line.unit)}</td><td class="num">${num(line.quantity)}</td><td class="num">${num(line.unitPrice)}</td><td class="num">${num(line.vatRate)}%</td><td class="num">${money(line.vatAmount)}</td><td class="num">${money(line.amount)}</td></tr>`).join('')}</tbody></table>
 <section class="invoice-summary"><div><p class="invoice-cell-label">${e(ui.notes)}</p><p style="white-space:pre-wrap">${e(f.notes)}</p></div><div>${cell(t.currency,s.currencyCode)}<div class="invoice-total"><span>${e(t.subtotal)}</span><span>${money(s.subtotal)}</span></div><div class="invoice-total"><span>${e(t.tax)}</span><span>${money(s.vatAmount)}</span></div><div class="invoice-total"><span>${e(t.total)}</span><span>${money(s.total)}</span></div>${cell(ui.bank,f.bank)}</div></section><footer class="invoice-signature"><div class="invoice-stamp"><strong>${e(f.seller?.name)}</strong><p>${e(d.stamp)}</p></div></footer></main></body></html>`;
}
