import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calculateInvoiceDraft, buildInvoicePrintHtml, parseInvoiceQuantity } from '../frontend/src/utils/invoiceDraft.mjs';
const require = createRequire(import.meta.url);
const { buildInvoiceSource } = require('../backend/dist/services/invoiceSource.js');
const order = { orderId: 'o1', orderNumber: 'PO-1', sellerOrg: { name: 'Seller' }, buyerOrg: { name: 'Buyer' }, workOrderItems: [
  { id: 1, styleId: 10, style: { code: 'S1', name: 'Jacket' }, totalQuantity: 100, sizeQuantities: { S: 40, M: 60 } },
] };
const plans = [{ id: 1, externalId: 'a1', styleId: 10 }];
const progress = [{ id: 'a1', isCompleted: true, producedQuantity: 95 }];
const relationship = { salesBucketSetVersion: { id: 1, entries: [{ id: 1, bucketQuantity: 1 }, { id: 2, bucketQuantity: 100 }] },
  salesPriceLists: [{ id: 1, styleId: 10, quantityBucketSetVersionId: 1, pricingBasis: 'FINISHED_GOODS_PRICE', currency: { code: 'USD' },
    prices: [{ id: 1, quantityBucketEntryId: 1, unitPrice: '2.1250' }, { id: 2, quantityBucketEntryId: 2, unitPrice: '1.0050' }] }] };
const source = () => buildInvoiceSource(order, plans, progress, relationship);
const calc = (s, lines = s.lines, currency = 'USD') => calculateInvoiceDraft(s, lines, 'FINISHED_GOODS_PRICE', currency);

test('production stays at style level; original size quantities and inputs are preserved', () => {
  const before = JSON.stringify({ order, plans, progress, relationship });
  const s = source();
  assert.equal(s.ready, true);
  assert.equal(s.styles[0].producedQuantity, 95);
  assert.deepEqual(s.lines.map((line) => line.quantity), ['40', '60']);
  assert.equal(JSON.stringify({ order, plans, progress, relationship }), before);
});
test('missing progress, unfinished production and invalid process links block draft printing', () => {
  for (const rows of [[], [{ ...progress[0], isCompleted: false }], [{ ...progress[0], hasInvalidProcessReferences: true }]]) {
    assert.ok(calc(buildInvoiceSource(order, plans, rows, relationship)).issues.includes('PRODUCTION'));
  }
  assert.equal(buildInvoiceSource(order, [], [], relationship).ready, false);
  assert.equal(buildInvoiceSource(order, [...plans, { id: 2, styleId: 99 }], progress, relationship).ready, false);
});
test('price tier uses style total across size lines; changing quantity crosses tier', () => {
  const s = source();
  assert.equal(calc(s).total, '100.50');
  const rows = s.lines.map((line, i) => ({ ...line, quantity: i === 0 ? '39' : line.quantity, adjustmentReason: 'QC rejection' }));
  const result = calc(s, rows);
  assert.equal(result.lines[0].unitPrice, '2.1250');
  assert.equal(result.total, '210.38');
  assert.deepEqual(result.issues, []);
});
test('a missing target tier is never filled from a nearby price or old version', () => {
  const rel = structuredClone(relationship);
  rel.salesPriceLists[0].prices.pop();
  assert.ok(calc(buildInvoiceSource(order, plans, progress, rel)).issues.includes('PRICE'));
  rel.salesBucketOverrides = [{ styleId: 10, quantityBucketSetVersion: { id: 2, entries: [{ id: 3, bucketQuantity: 1 }] } }];
  assert.ok(calc(buildInvoiceSource(order, plans, progress, rel)).issues.includes('PRICE'));
});
test('quantity validation and adjustment reasons include omitted zero-quantity rows', () => {
  for (const q of ['', '-1', '1.2', '1e3', 'Infinity', '2147483648']) assert.equal(parseInvoiceQuantity(q), null);
  const s = source();
  const result = calc(s, s.lines.map((line) => ({ ...line, quantity: '0' })));
  assert.ok(result.issues.includes('REASON'));
  assert.ok(result.issues.includes('EMPTY'));
});
test('currency rounding uses integer decimal arithmetic', () => {
  const s = source();
  s.styles[0].prices[0].currencyCode = 'VND';
  assert.equal(calc(s, s.lines, 'VND').total, '100');
  const usd = source();
  usd.lines = [{ ...usd.lines[0], orderedQuantity: 1, quantity: '1' }];
  assert.equal(calc(usd).total, '2.13');
});
test('print document escapes all customer content, repeats table headings and marks every draft', () => {
  const s = source();
  s.lines[0].description = '<script>alert(1)</script>';
  const html = buildInvoicePrintHtml({ source: s, calculation: calc(s), pricingBasis: 'FINISHED_GOODS_PRICE', currencyCode: 'USD',
    fields: { number: '\"><img src=x onerror=alert(1)>', seller: s.seller, buyer: s.buyer, notes: '<img>' } });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('DRAFT — NOT ISSUED'));
  assert.ok(html.includes('display:table-header-group'));
  assert.ok(html.includes('COMMERCIAL INVOICE'));
});
