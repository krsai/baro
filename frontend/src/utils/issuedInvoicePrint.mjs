import { escapeInvoiceHtml as e } from './invoiceDraft.mjs';
import {invoiceStyleRows,invoiceNumber} from './invoiceStyleRows.mjs';
import {formatInvoiceMoney} from './invoiceItemGrid.mjs';

// Render stored values only. Never fetch current orders, prices or parties here.
export function buildIssuedInvoicePrintHtml(invoice) {
  const s = invoice?.snapshot;
  if (!s || !Array.isArray(s.lines) || !Array.isArray(s.orders)) throw new Error('INVOICE_SNAPSHOT_INVALID');
  // Before templateVersion was introduced, snapshot versions 1/2 used this layout.
  if (s.templateVersion ? s.templateVersion !== 'BARO_INVOICE_V1' : ![1, 2].includes(s.version)) {
    throw new Error('INVOICE_TEMPLATE_UNSUPPORTED');
  }
  const f = s.fields || {};
  const number = value => e(invoiceNumber(value));
  const money = value => e(formatInvoiceMoney(value,s.currencyCode));
  const party = (label, p = {}) => `<section><h3>${label}</h3><strong>${e(p.name)}</strong>${
    ['address', 'country', 'taxId', 'email', 'phone'].map(key => `<p>${e(p[key])}</p>`).join('')}</section>`;
  const field = (label, value) => `<p><b>${label}:</b> ${e(value)}</p>`;
  const orderNumbers = new Map(s.orders.map(order => [order.sourceOrderId, order.sourceOrderNumber]));
  const title = s.pricingBasis === 'FINISHED_GOODS_PRICE' ? 'COMMERCIAL INVOICE' : 'MANUFACTURING SERVICE INVOICE';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(f.number)}</title>
  <style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#182b3d;margin:0;padding:28px}
  h1{font-size:26px;letter-spacing:2px;border-bottom:2px solid #243746;padding-bottom:16px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin:18px 0}th,td{padding:6px 4px;border-bottom:1px solid #ccd4dc;text-align:left;overflow-wrap:anywhere}
  th{background:#edf1f4}thead{display:table-header-group}tr,section{break-inside:avoid}.num{text-align:right}.total{text-align:right;font-size:16px}
  @media(max-width:500px){body{padding:14px;font-size:11px}h1{font-size:20px}.parties{grid-template-columns:1fr}th,td{padding:6px 2px}}@media print{.screen{display:none}}</style></head><body>
  <h1>${title}</h1>${field('Invoice', f.number)}${field('Date', f.date)}${field('Status', invoice.status)}${field('Currency', s.currencyCode)}
  <div class="parties">${party('SELLER / EXPORTER', f.seller)}${party('BUYER / BILL TO', f.buyer)}</div>
  <section>${field('Ship to / Consignee', f.shipTo)}${field('Shipment date', f.shipmentDate)}${field('Incoterm / Named place', f.incoterm)}${field('Payment terms', f.paymentTerms)}${field('Due date', f.dueDate)}</section>
  <table><thead><tr><th>Order / Style / Description</th><th class="num">Qty (PCS)</th><th class="num">Unit price</th><th class="num">Amount</th><th>Remark</th></tr></thead><tbody>${invoiceStyleRows(s.lines.filter(line => line.quantity > 0)).map(group => {const line=group.lines[0];return `<tr>
  <td><p>${e(orderNumbers.get(line.orderId))}</p><p>${e(line.styleCode)}</p><p>${e(line.description || line.styleName)}</p></td>
  <td class="num">${number(group.quantity)}</td><td class="num">${money(line.unitPrice)}</td><td class="num">${money(group.amount)}</td><td><p>${e(line.remark)}</p>${line.hsCode?field('HS',line.hsCode):''}${line.origin?field('Origin',line.origin):''}</td></tr>`;}).join('')}</tbody></table>
  <table><thead><tr><th>Order</th><th class="num">Billing %</th><th class="num">Billed amount</th><th class="num">Deduction</th><th class="num">Invoice amount</th></tr></thead><tbody>${s.orders.map(order => `<tr>
  <td>${e(order.sourceOrderNumber)}</td><td class="num">${number(order.billingPercentage)}%</td><td class="num">${money(order.billedAmount??order.basisAmount)}</td><td class="num">${money(order.appliedDeductionAmount??'0')}</td><td class="num">${money(order.netAmount)}</td></tr>`).join('')}</tbody></table>
  <h2 class="total">TOTAL ${money(s.total)}</h2>
  <section><h3>BANK / PAYMENT INSTRUCTIONS</h3><p>${e(f.bank)}</p><h3>REMARKS</h3><p>${e(f.notes)}</p></section>
  <footer>Authorized signature: __________________________</footer></body></html>`;
}
