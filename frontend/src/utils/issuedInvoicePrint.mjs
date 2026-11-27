import {paymentAccountsHtml} from './invoicePaymentAccount.mjs';
import {invoicePartyPairHtml} from './invoicePartyLayout.mjs';
import {escapeInvoiceHtml as e} from './invoiceDraft.mjs';
import {buildGeneralInvoicePrintHtml} from './generalInvoicePrint.mjs';
import {invoiceStyleRows,invoiceNumber} from './invoiceStyleRows.mjs';
import {formatInvoiceMoney} from './invoiceItemGrid.mjs';
import {invoiceAmountFormulaRows} from './invoiceAmountFormula.mjs';
import {invoiceMessages} from '../constants/invoiceMessages.js';
import {invoiceDocumentCss,invoicePrintCss} from './invoiceDocumentStyle.mjs';
import {invoiceUi} from '../constants/invoiceUi.js';
import {invoiceDetailText} from '../constants/invoiceDetail.js';
import {invoiceDocumentText} from '../constants/invoiceDocument.js';

// Display only the issued snapshot. Never read current master data or rewrite amounts.
export function buildIssuedInvoicePrintHtml(invoice,languageCode='en') {
  languageCode='en';
  const s=invoice?.snapshot;
  if(!s||!Array.isArray(s.lines)||!Array.isArray(s.orders))throw new Error('INVOICE_SNAPSHOT_INVALID');
  if(s.templateVersion?s.templateVersion!=='BARO_INVOICE_V1':![1,2].includes(s.version))throw new Error('INVOICE_TEMPLATE_UNSUPPORTED');
  if(s.documentKind==='GENERAL')return buildGeneralInvoicePrintHtml(invoice,languageCode);
  const ui=invoiceUi[languageCode]||invoiceUi.en,d=invoiceDetailText[languageCode]||invoiceDetailText.en;
  const text=invoiceDocumentText[languageCode]||invoiceDocumentText.en;
  const f=s.fields||{},money=value=>e(formatInvoiceMoney(value,s.currencyCode)),num=value=>e(invoiceNumber(value));
  const cell=(label,value)=>`<div class="invoice-cell"><span class="invoice-cell-label">${e(label)}</span><span class="invoice-cell-value">${e(value)}</span></div>`;
  const orders=new Map(s.orders.map(order=>[order.sourceOrderId,order.sourceOrderNumber]));
  const rows=invoiceStyleRows(s.lines.filter(line=>line.quantity>0));
  const kind=s.pricingBasis==='FINISHED_GOODS_PRICE'?'COMMERCIAL INVOICE':'MANUFACTURING SERVICE INVOICE';
  return `<!doctype html><html lang="${['ko','en','vi'].includes(languageCode)?languageCode:'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(f.number)} · ${kind}</title><style>
  @page{size:A4;margin:14mm}body{margin:0;padding:0;background:white}${invoiceDocumentCss}${invoicePrintCss}
  thead{display:table-header-group}tr,section{break-inside:avoid}.invoice-lines{margin-top:16px}.invoice-lines td{height:28px}
  @media(max-width:500px){body{padding:12px}.invoice-sheet th,.invoice-sheet td{font-size:10px;padding:5px 3px}}@media print{.screen{display:none}}
  </style></head><body><main class="invoice-sheet invoice-print">
  <header class="invoice-document-top"><h1 class="invoice-heading">${text.title}</h1><div class="invoice-document-identifiers">${cell(text.number,f.number)}${cell(ui.date,f.date)}</div></header>${invoice.status&&invoice.status!=='ISSUED'?`<p class="invoice-status">${e(invoice.status==='CANCELLED'?ui.cancelled:invoice.status==='SUPERSEDED'?ui.superseded:invoice.status)}</p>`:''}
  ${invoicePartyPairHtml(text.buyer,f.buyer,text.seller,f.seller,languageCode)}

  <table class="invoice-lines"><colgroup><col style="width:5%"><col style="width:43%"><col style="width:18%"><col style="width:14%"><col style="width:20%"></colgroup><thead><tr><th class="num">${text.row}</th><th>${text.description}</th><th class="num">${e(d.quantity)}</th><th class="num">${e(d.unitPrice)}</th><th class="num">${e(ui.summary)}</th></tr></thead><tbody>${rows.map((group,index)=>{const line=group.lines[0];return `<tr><td class="num">${num(index+1)}</td><td><p>${e(orders.get(line.orderId))}</p><p>${e(line.description||line.styleName)}</p></td><td class="num">${num(group.quantity)}</td><td class="num">${money(line.unitPrice)}</td><td class="num">${money(group.amount)}</td></tr>`;}).join('')}</tbody></table>
  <section class="invoice-summary"><div class="invoice-remark"><p class="invoice-cell-label">${e(ui.notes)}</p><p style="white-space:pre-wrap;margin-top:6px">${e(f.notes)}</p></div><div>${invoiceAmountFormulaRows(s.orders,s.currencyCode).map(row=>`<div class="invoice-amount-formula"><p class="invoice-cell-label">${e(row.label)} · ${e((invoiceMessages[languageCode]||invoiceMessages.en).subtotal)}</p><p>${e(row.formula)}</p>${row.deduction?`<p>${e(row.deduction)}</p>`:""}</div>`).join("")}${s.orders.filter(order=>order.billedAmount==null&&order.amount==null).map(order=>`<p>${e(order.sourceOrderNumber)} / ${e(text.billing)} ${num(order.billingPercentage)}% / ${money(order.netAmount)}</p>`).join('')}<p>${s.orders.filter(order=>order.vatRate!==undefined).map(order=>`VAT ${e(order.vatRate)}%: ${money(order.vatAmount)}`).join(" / ")}</p><div class="invoice-total"><span>${text.total}</span><span>${money(s.total)}</span></div><div class="invoice-bank-section"><p class="invoice-cell-label" style="margin:0 0 10px">${e(ui.bank)}</p>${paymentAccountsHtml(f,languageCode,e)}</div></div></section>
  <footer class="invoice-signature"><div class="invoice-stamp"><strong>${e(f.seller?.name)}</strong><p>${text.stamp}</p></div></footer></main></body></html>`;
}
