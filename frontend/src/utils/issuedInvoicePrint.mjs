import {escapeInvoiceHtml as e} from './invoiceDraft.mjs';
import {invoiceStyleRows,invoiceNumber} from './invoiceStyleRows.mjs';
import {formatInvoiceMoney} from './invoiceItemGrid.mjs';
import {invoiceDocumentCss} from './invoiceDocumentStyle.mjs';
import {invoiceUi} from '../constants/invoiceUi.js';
import {invoiceDetailText} from '../constants/invoiceDetail.js';
import {invoiceDocumentText} from '../constants/invoiceDocument.js';

// Display only the issued snapshot. Never read current master data or rewrite amounts.
export function buildIssuedInvoicePrintHtml(invoice,languageCode='en') {
  const s=invoice?.snapshot;
  if(!s||!Array.isArray(s.lines)||!Array.isArray(s.orders))throw new Error('INVOICE_SNAPSHOT_INVALID');
  if(s.templateVersion?s.templateVersion!=='BARO_INVOICE_V1':![1,2].includes(s.version))throw new Error('INVOICE_TEMPLATE_UNSUPPORTED');
  const ui=invoiceUi[languageCode]||invoiceUi.en,d=invoiceDetailText[languageCode]||invoiceDetailText.en;
  const text=invoiceDocumentText[languageCode]||invoiceDocumentText.en;
  const f=s.fields||{},money=value=>e(formatInvoiceMoney(value,s.currencyCode)),num=value=>e(invoiceNumber(value));
  const cell=(label,value)=>`<div class="invoice-cell"><span class="invoice-cell-label">${e(label)}</span><span class="invoice-cell-value">${e(value)}</span></div>`;
  const party=(label,p={})=>`<section class="invoice-party"><h2 class="invoice-party-title">${e(label)}</h2>${['name','address','taxId','country','phone','email'].map(key=>cell(ui[key],p[key])).join('')}</section>`;
  const orders=new Map(s.orders.map(order=>[order.sourceOrderId,order.sourceOrderNumber]));
  const rows=invoiceStyleRows(s.lines.filter(line=>line.quantity>0));
  const kind=s.pricingBasis==='FINISHED_GOODS_PRICE'?'COMMERCIAL INVOICE':'MANUFACTURING SERVICE INVOICE';
  return `<!doctype html><html lang="${['ko','en','vi'].includes(languageCode)?languageCode:'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(f.number)} · ${kind}</title><style>
  @page{size:A4;margin:14mm}body{margin:0;padding:28px;background:white}${invoiceDocumentCss}
  thead{display:table-header-group}tr,section{break-inside:avoid}.invoice-lines{margin-top:16px}.invoice-billing{margin:16px 0}.invoice-lines td{height:32px}.invoice-total{margin-bottom:16px}
  @media(max-width:500px){body{padding:12px}.invoice-sheet th,.invoice-sheet td{font-size:10px;padding:5px 3px}}@media print{.screen{display:none}}
  </style></head><body><main class="invoice-sheet">
  <h1 class="invoice-heading">${text.title}</h1>${invoice.status&&invoice.status!=='ISSUED'?`<p class="invoice-status">${e(invoice.status==='CANCELLED'?ui.cancelled:invoice.status==='SUPERSEDED'?ui.superseded:invoice.status)}</p>`:''}
  <div class="invoice-parties">${party(text.buyer,f.buyer)}${party(text.seller,f.seller)}</div>
  <div class="invoice-metadata">${cell(text.number,f.number)}${cell(ui.date,f.date)}${cell(ui.dueDate,f.dueDate)}${cell(ui.shipmentDate,f.shipmentDate)}${cell(ui.paymentTerms,f.paymentTerms)}${cell(ui.incoterm,f.incoterm)}</div>
  <table class="invoice-lines"><colgroup><col style="width:5%"><col style="width:33%"><col style="width:16%"><col style="width:12%"><col style="width:18%"><col style="width:16%"></colgroup><thead><tr><th class="num">${text.row}</th><th>${text.description}</th><th class="num">${e(d.unitPrice)}</th><th class="num">${e(d.quantity)}</th><th class="num">${e(ui.summary)}</th><th>${text.note}</th></tr></thead><tbody>${rows.map((group,index)=>{const line=group.lines[0];return `<tr><td class="num">${num(index+1)}</td><td><p>${e(orders.get(line.orderId))}</p><strong>${e(line.styleCode)}</strong><p>${e(line.description||line.styleName)}</p></td><td class="num">${money(line.unitPrice)}</td><td class="num">${num(group.quantity)}</td><td class="num">${money(group.amount)}</td><td><p>${e(line.remark)}</p>${line.hsCode?`<p>HS: ${e(line.hsCode)}</p>`:''}${line.origin?`<p>${e(line.origin)}</p>`:''}</td></tr>`;}).join('')}${Array.from({length:Math.max(0,10-rows.length)},(_,index)=>`<tr aria-hidden="true"><td class="num">${num(rows.length+index+1)}</td>${'<td>&nbsp;</td>'.repeat(5)}</tr>`).join('')}</tbody></table>
  <table class="invoice-billing"><thead><tr><th>${e(ui.orders)}</th><th class="num">${text.billing}</th><th class="num">${e(ui.summary)}</th><th class="num">${text.deduction}</th><th class="num">${text.total}</th></tr></thead><tbody>${s.orders.map(order=>`<tr><td>${e(order.sourceOrderNumber)}</td><td class="num">${num(order.billingPercentage)}%</td><td class="num">${money(order.billedAmount??order.basisAmount)}</td><td class="num">${money(order.appliedDeductionAmount??'0')}</td><td class="num">${money(order.netAmount)}</td></tr>`).join('')}</tbody></table>
  <div class="invoice-total"><span>${text.total}</span><span>${money(s.total)}</span></div>
  <section class="invoice-footer">${cell(ui.bank,f.bank)}${cell(ui.shipTo,f.shipTo)}${cell(ui.notes,f.notes)}</section>
  <footer class="invoice-signature">${e(f.date)}</footer></main></body></html>`;
}
