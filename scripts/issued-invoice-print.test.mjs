import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIssuedInvoicePrintHtml } from '../frontend/src/utils/issuedInvoicePrint.mjs';

const fixture = () => ({ status: 'ISSUED', buyer: { name: 'CURRENT MASTER' }, snapshot: {
  version: 3, templateVersion: 'BARO_INVOICE_V1', pricingBasis: 'FINISHED_GOODS_PRICE', currencyCode: 'USD', total: '80', receivableAdded: '0',
  fields: { number: 'INV-1', date: '2026-09-28', seller: { name: 'Frozen seller', address: 'Frozen address' },
    buyer: { name: 'Frozen buyer', country: 'VN', taxId: 'TAX123', email: 'frozen@example.com', phone: 'PHONE123' },
    shipTo: 'Warehouse', shipmentDate: '2026-09-29', dueDate: '2026-10-28', incoterm: 'FOB', paymentTerms: '30 days', bank: 'Frozen bank', notes: '<script>alert(1)</script>' },
  orders: [{ sourceOrderId: 'internal-order-id', sourceOrderNumber: 'ORDER-1', basisAmount: '100', billingPercentage: '80', netAmount: '80', receivableAdded: '0' }],
  lines: [{ orderId: 'internal-order-id', quantity: 1, styleCode: 'STYLE123', description: 'Jacket', color: 'Blue', gender: 'U', size: 'XL', hsCode: 'HS123', origin: 'Vietnam', unitPrice: '100', amount: '100', remark: 'Customer remark', adjustmentReason: 'INTERNAL REASON' }],
} });

test('issued HTML renders frozen document fields, public order numbers and settlement, not live masters or internal reasons', () => {
  const invoice = fixture(), before = structuredClone(invoice), html = buildIssuedInvoicePrintHtml(invoice);
  for (const text of ['COMMERCIAL INVOICE', 'Frozen seller', 'Frozen address', 'Frozen buyer', 'TAX123', 'frozen@example.com', 'PHONE123', 'Warehouse', '2026-09-29', '2026-10-28', 'FOB', '30 days', 'Frozen bank', 'ORDER-1', '80%', 'STYLE123', 'Jacket', 'Blue / U / XL', 'HS123', 'Vietnam', 'Customer remark', 'NEW RECEIVABLE USD 0']) assert.ok(html.includes(text), text);
  assert.doesNotMatch(html, /CURRENT MASTER|internal-order-id|INTERNAL REASON|DRAFT|<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /thead\{display:table-header-group\}/);
  assert.match(html, /@media print\{\.screen\{display:none\}\}/);
  assert.deepEqual(invoice, before);
});

test('issued template rejects unknown versions and explicitly supports legacy snapshots', () => {
  const invoice = fixture(); invoice.snapshot.templateVersion = 'FUTURE';
  assert.throws(() => buildIssuedInvoicePrintHtml(invoice), /TEMPLATE_UNSUPPORTED/);
  delete invoice.snapshot.templateVersion; invoice.snapshot.version = 2;
  assert.match(buildIssuedInvoicePrintHtml(invoice), /INV-1/);
  invoice.snapshot.version = 999;
  assert.throws(() => buildIssuedInvoicePrintHtml(invoice), /TEMPLATE_UNSUPPORTED/);
});
