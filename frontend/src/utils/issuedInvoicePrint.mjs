import { escapeInvoiceHtml as e } from './invoiceDraft.mjs';

// Render stored values only. Never fetch current orders, prices or parties here.
export function buildIssuedInvoicePrintHtml(invoice) {
  const s = invoice?.snapshot;
  if (!s || !Array.isArray(s.lines) || !Array.isArray(s.orders)) throw new Error('INVOICE_SNAPSHOT_INVALID');
  // Before templateVersion was introduced, snapshot versions 1/2 used this layout.
  if (s.templateVersion ? s.templateVersion !== 'BARO_INVOICE_V1' : ![1, 2].includes(s.version)) {
    throw new Error('INVOICE_TEMPLATE_UNSUPPORTED');
  }
  const f = s.fields || {};
  const party = (label, p = {}) => `<section><h3>${label}</h3><strong>${e(p.name)}</strong>${
    ['address', 'country', 'taxId', 'email', 'phone'].map(key => `<p>${e(p[key])}</p>`).join('')}</section>`;
  const field = (label, value) => `<p><b>${label}:</b> ${e(value)}</p>`;
  const orderNumbers = new Map(s.orders.map(order => [order.sourceOrderId, order.sourceOrderNumber]));
  const title = s.pricingBasis === 'FINISHED_GOODS_PRICE' ? 'COMMERCIAL INVOICE' : 'MANUFACTURING SERVICE INVOICE';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(f.number)}</title>
  <style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#182b3d}
  h1{font-size:24px}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:4px 0}.parties{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:20px 0}
  table{width:100%;border-collapse:collapse;table-layout:fixed;margin:18px 0}th,td{padding:6px 4px;border-bottom:1px solid #ccd4dc;text-align:left;overflow-wrap:anywhere}
  th{background:#edf1f4}thead{display:table-header-group}tr,section{break-inside:avoid}.num{text-align:right}.total{text-align:right;font-size:16px}
  @media print{.screen{display:none}}</style></head><body>
  <div class="screen"><button onclick="window.print()">Print / Save as PDF</button></div>
  <h1>${title}</h1>${field('Invoice', f.number)}${field('Date', f.date)}${field('Status', invoice.status)}${field('Currency', s.currencyCode)}
  <div class="parties">${party('SELLER / EXPORTER', f.seller)}${party('BUYER / BILL TO', f.buyer)}</div>
  <section>${field('Ship to / Consignee', f.shipTo)}${field('Shipment date', f.shipmentDate)}${field('Incoterm / Named place', f.incoterm)}${field('Payment terms', f.paymentTerms)}${field('Due date', f.dueDate)}</section>
  <table><thead><tr><th>Order / Style / Description</th><th>Color / Gender / Size</th><th>HS / Origin</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th>Remark</th></tr></thead><tbody>${s.lines.filter(line => line.quantity > 0).map(line => `<tr>
  <td><p>${e(orderNumbers.get(line.orderId))}</p><p>${e(line.styleCode)}</p><p>${e(line.description || line.styleName)}</p></td>
  <td>${e([line.color, line.gender, line.size].filter(Boolean).join(' / '))}</td><td>${e(line.hsCode)}<p>${e(line.origin)}</p></td>
  <td class="num">${e(line.quantity)}</td><td class="num">${e(line.unitPrice)}</td><td class="num">${e(line.amount)}</td><td><p>${e(line.remark)}</p></td></tr>`).join('')}</tbody></table>
  <table><thead><tr><th>Order</th><th>Quantity × unit price</th><th>Billing %</th><th>Prior billed / received</th><th>Deduction</th><th>Prior outstanding</th><th>Statement / New receivable</th></tr></thead><tbody>${s.orders.map(order => `<tr>
  <td>${e(order.sourceOrderNumber)}</td><td>${e(order.basisAmount)}</td><td>${e(order.billingPercentage)}%</td><td>${e(order.priorBilledAmount)} / ${e(order.priorReceivedAmount)}</td>
  <td>${e(order.appliedDeductionAmount)}</td><td>${e(order.priorOutstandingAmount)}</td><td>${e(order.netAmount)} / ${e(order.receivableAdded)}</td></tr>`).join('')}</tbody></table>
  <h2 class="total">STATEMENT TOTAL ${e(s.currencyCode)} ${e(s.total)}<br>NEW RECEIVABLE ${e(s.currencyCode)} ${e(s.receivableAdded)}</h2>
  <section><h3>BANK / PAYMENT INSTRUCTIONS</h3><p>${e(f.bank)}</p><h3>REMARKS</h3><p>${e(f.notes)}</p></section>
  <footer>Authorized signature: __________________________</footer></body></html>`;
}
