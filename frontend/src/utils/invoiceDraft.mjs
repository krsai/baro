export const INVOICE_BASES = [
  { value: 'MANUFACTURING_SERVICE_PRICE', label: 'CMT' },
  { value: 'FINISHED_GOODS_PRICE', label: 'FP' },
];

// Keep pricing and production scoped to each original order. Combining orders
// must not move repeated styles into a cheaper aggregate price tier.
export function combineInvoiceSources(sources) {
  if (!sources.length) throw new Error('INVOICE_SOURCE_REQUIRED');
  const first = sources[0];
  if (sources.length > 1 && (!first.buyerOrgId || !first.sellerOrgId)) throw new Error('INVOICE_PARTIES_REQUIRED');
  const ids = new Set();
  for (const source of sources) {
    if (!source.orderId || ids.has(source.orderId)) throw new Error('INVOICE_ORDER_CONFLICT');
    if (source.buyerOrgId !== first.buyerOrgId || source.sellerOrgId !== first.sellerOrgId) throw new Error('INVOICE_PARTY_CONFLICT');
    ids.add(source.orderId);
  }
  return {
    ...first, orderId: sources.length === 1 ? first.orderId : null,
    sourceUpdatedAt: sources.length === 1 ? first.sourceUpdatedAt : null,
    orderNumber: sources.map(s => s.orderNumber).join(', '),
    orders: sources.map(s => ({ orderId: s.orderId, orderNumber: s.orderNumber, sourceUpdatedAt: s.sourceUpdatedAt })),
    ready: sources.every(s => s.ready),
    currencies: [...new Set(sources.flatMap(s => s.currencies || []))],
    styles: sources.flatMap(s => s.styles.map(style => ({ ...style, orderId: s.orderId,
      orderNumber: s.orderNumber, styleScopeKey: JSON.stringify([s.orderId, style.styleId]) }))),
    lines: sources.flatMap(s => s.lines.map(line => ({ ...line, orderId: s.orderId, orderNumber: s.orderNumber,
      key: JSON.stringify([s.orderId, line.key]), styleScopeKey: JSON.stringify([s.orderId, line.styleId]), remark: '' }))),
  };
}
const styleScope = row => row.styleScopeKey ?? row.styleId;

export const parseInvoiceQuantity = (value) => {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number <= 2147483647 ? number : null;
};

const parsePrice = (value) => {
  if (value == null || !/^\d+(\.\d{1,4})?$/.test(String(value))) return null;
  const [whole, fraction = ''] = String(value).split('.');
  const result = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
  return result > 0n ? result : null;
};
const formatMinor = (value, digits) => {
  const text = value.toString().padStart(digits + 1, '0');
  return digits ? `${text.slice(0, -digits)}.${text.slice(-digits)}` : text;
};

export function calculateInvoiceDraft(source, lines, pricingBasis, currencyCode) {
  const issues = [];
  const quantities = new Map();
  let digits;
  try { digits = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits; }
  catch { digits = 2; issues.push('CURRENCY'); }
  if (!source?.ready) issues.push('PRODUCTION');
  for (const line of lines) {
    const q = parseInvoiceQuantity(line.quantity);
    if (q == null) issues.push('QUANTITY');
    if (q !== line.orderedQuantity && !line.adjustmentReason?.trim()) issues.push('REASON');
    quantities.set(styleScope(line), (quantities.get(styleScope(line)) || 0) + (q ?? 0));
  }
  let total = 0n;
  const calculated = lines.map((line) => {
    const q = parseInvoiceQuantity(line.quantity);
    const styleQuantity = quantities.get(styleScope(line)) || 0;
    const style = source?.styles.find((style) => styleScope(style) === styleScope(line));
    const list = style?.prices.find((list) => list.pricingBasis === pricingBasis && list.currencyCode === currencyCode);
    const entries = [...(list?.entries || [])].sort((a, b) => a.quantity - b.quantity);
    const entry = entries.filter((entry) => entry.quantity <= styleQuantity).at(-1) || entries[0];
    const price = parsePrice(entry?.unitPrice);
    if (q > 0 && price == null) issues.push('PRICE');
    // Integer decimal arithmetic, round half up per line in the selected currency.
    const divisor = 10n ** BigInt(4 - Math.min(4, digits));
    const amount = q != null && price != null ? (price * BigInt(q) + divisor / 2n) / divisor : null;
    if (q > 0 && amount != null) total += amount;
    return { ...line, quantity: q, unitPrice: entry?.unitPrice ?? null,
      bucketQuantity: entry?.quantity ?? null, priceId: entry?.priceId ?? null,
      versionId: list?.versionId ?? null,
      amount: amount == null ? null : formatMinor(amount, digits) };
  });
  if (!calculated.some((line) => line.quantity > 0)) issues.push('EMPTY');
  return { lines: calculated, total: formatMinor(total, digits), issues: [...new Set(issues)],
    styles: (source?.styles || []).map((style) => {
      const rows = calculated.filter(line => styleScope(line) === styleScope(style));
      const amount = rows.some(line => line.amount == null) ? null : formatMinor(rows.reduce((sum, line) => sum + BigInt(line.amount.replace('.', '')), 0n), digits);
      return { ...style, invoiceQuantity: quantities.get(styleScope(style)) || 0, unitPrice: rows[0]?.unitPrice ?? null, amount };
    }) };
}

export const escapeInvoiceHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// Each order is rounded independently, after summing its rounded line amounts.
// This percentage changes money only; it never consumes a percentage of units.
export function applyOrderBillingPercentages(source, calculation, percentages = {}) {
  const digits = calculation.total.includes('.') ? calculation.total.split('.')[1].length : 0;
  // Partial shipment / advance review does not require the whole order to be
  // completed. Keep production uncertainty visible and require user review.
  const issues = calculation.issues.filter(issue => issue !== 'PRODUCTION');
  let total = 0n;
  const orders = (source.orders || [source]).map(order => {
    const raw = String(percentages[order.orderId] ?? '').trim() || '100';
    const valid = /^\d+(\.\d{1,2})?$/.test(raw) && Number(raw) > 0 && Number(raw) <= 100;
    if (!valid) issues.push('PERCENTAGE');
    const [whole, fraction = ''] = valid ? raw.split('.') : ['0'];
    const percent = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    const rows = calculation.lines.filter(line => (line.orderId ?? source.orderId) === order.orderId);
    const known = rows.every(line => line.amount != null || line.quantity === 0);
    const subtotal = rows.reduce((sum, line) => sum + BigInt((line.amount || '0').replace('.', '')), 0n);
    const amount = (subtotal * percent + 5000n) / 10000n;
    total += amount;
    return { orderId: order.orderId, orderNumber: order.orderNumber, percentage: valid ? raw : null,
      subtotal: known ? formatMinor(subtotal, digits) : null,
      amount: known && valid ? formatMinor(amount, digits) : null,
      difference: known && valid ? formatMinor(subtotal - amount, digits) : null };
  });
  return { ...calculation, orders, subtotal: calculation.total,
    warnings: calculation.issues.includes('PRODUCTION') ? ['PRODUCTION'] : [],
    total: orders.some(order => order.amount == null) ? null : formatMinor(total, digits), issues: [...new Set(issues)] };
}

export function buildInvoicePrintHtml({ source, calculation, fields, pricingBasis, currencyCode }) {
  const e = escapeInvoiceHtml;
  const party = (label, value) => `<section><h3>${label}</h3><strong>${e(value.name)}</strong><p>${e(value.address)}</p><p>${e(value.country)}</p><p>Tax ID: ${e(value.taxId)}</p><p>${e(value.email)} ${e(value.phone)}</p></section>`;
  const monetary = calculation.mode === 'PERCENTAGE' || calculation.mode === 'FIXED_AMOUNT';
  const title = monetary ? 'PAYMENT REQUEST' : pricingBasis === 'FINISHED_GOODS_PRICE' ? 'COMMERCIAL INVOICE' : 'MANUFACTURING SERVICE INVOICE';
  const paymentTable = `<table><thead><tr><th>Payment description</th><th class="num">Amount (${e(currencyCode)})</th></tr></thead><tbody><tr><td><strong>${calculation.mode === 'PERCENTAGE' ? `${e(calculation.percentage)}% of agreed total ${e(currencyCode)} ${e(calculation.contractAmount)}` : 'Agreed installment amount'}</strong><p>${e(calculation.agreementNote)}</p></td><td class="num">${e(calculation.total)}</td></tr></tbody></table><p>Advance / installment request. No garment quantities are invoiced by this document.</p>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Draft Invoice ${e(fields.number)}</title>
  <style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:11px Arial,sans-serif;color:#182b3d;margin:0}h1{font-size:25px;margin:0 0 8px}h3{font-size:10px;letter-spacing:1px;color:#526577}p{margin:4px 0;white-space:pre-wrap;overflow-wrap:anywhere}.top{display:flex;justify-content:space-between;border-bottom:3px solid #182b3d;padding-bottom:14px}.draft{color:#a44016;font-weight:bold}.parties,.meta{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:18px 0}section{break-inside:avoid}table{width:100%;border-collapse:collapse;margin:18px 0;table-layout:fixed}th{background:#edf1f4;text-align:left}th,td{padding:7px 4px;border-bottom:1px solid #ccd4dc;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.num{text-align:right}.total{text-align:right;font-size:17px;font-weight:bold;margin:20px 0}.terms{border-top:1px solid #ccd4dc;padding-top:12px;break-inside:avoid}footer{margin-top:24px;font-size:10px;color:#526577}.screen{padding:10px;background:#fff0de;margin-bottom:20px}@media print{.screen{display:none}body::before{content:"DRAFT / NOT ISSUED";position:fixed;top:45%;left:12%;font-size:48px;color:rgba(130,130,130,.12);transform:rotate(-30deg);z-index:-1}}</style></head><body>
  <div class="screen">PDF: use Print / Save as PDF. Disable browser headers and footers. <button onclick="window.print()">Print / Save as PDF</button></div>
  <div class="top"><div><h1>${title}</h1><span class="draft">DRAFT — NOT ISSUED / NOT FOR PAYMENT</span></div><div><p>Invoice reference: ${e(fields.number)}</p><p>Date: ${e(fields.date)}</p><p>Order: ${e(source.orderNumber)}</p><p>Currency: ${e(currencyCode)}</p></div></div>
  <div class="parties">${party('SELLER / EXPORTER', fields.seller)}${party('BUYER / BILL TO', fields.buyer)}</div>
  <div class="meta"><section><h3>SHIP TO / CONSIGNEE</h3><p>${e(fields.shipTo)}</p></section><section><p>Shipment date: ${e(fields.shipmentDate)}</p><p>Incoterm / Named place: ${e(fields.incoterm)}</p><p>Payment terms: ${e(fields.paymentTerms)}</p><p>Due date: ${e(fields.dueDate)}</p></section></div>
  ${monetary ? paymentTable : `<table><thead><tr><th style="width:5%">No.</th><th style="width:30%">Order / Description / Style / Color / Gender / Size</th><th style="width:10%">HS / Origin</th><th class="num" style="width:9%">Qty (PCS)</th><th class="num" style="width:12%">Unit price</th><th class="num" style="width:14%">Amount</th><th style="width:20%">Remark</th></tr></thead><tbody>${calculation.lines.filter((line) => line.quantity > 0).map((line, i) => `<tr><td>${i + 1}</td><td><p>${e(line.orderNumber || source.orderNumber)}</p><strong>${e(line.styleCode)}</strong><p>${e(line.description)}</p><p>${e([line.color, line.gender, line.size].filter(Boolean).join(' / '))}</p></td><td>${e(line.hsCode)}<p>${e(line.origin)}</p></td><td class="num">${e(line.quantity)}</td><td class="num">${e(line.unitPrice)}</td><td class="num">${e(line.amount)}</td><td><p>${e(line.remark)}</p></td></tr>`).join('')}</tbody></table>`}
  ${calculation.orders ? `<table><thead><tr><th>Order</th><th class="num">Quantity × unit price</th><th class="num">Billing %</th><th class="num">Amount due (${e(currencyCode)})</th></tr></thead><tbody>${calculation.orders.map(order => `<tr><td>${e(order.orderNumber)}</td><td class="num">${e(order.subtotal)}</td><td class="num">${e(order.percentage)}%</td><td class="num">${e(order.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
  <div class="total">TOTAL ${e(currencyCode)} ${e(calculation.total)}</div><div class="terms"><h3>BANK / PAYMENT INSTRUCTIONS</h3><p>${e(fields.bank)}</p><h3>REMARKS</h3><p>${e(fields.notes)}</p></div>
  <footer>DRAFT — NOT ISSUED. Prepared for quantity and price review only.<br>Authorized signature: __________________________</footer></body></html>`;
}
