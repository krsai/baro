import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { calculateInvoiceDraft, buildInvoicePrintHtml, parseInvoiceQuantity, combineInvoiceSources, applyOrderBillingPercentages } from '../frontend/src/utils/invoiceDraft.mjs';
const require = createRequire(import.meta.url);
const { buildInvoiceSource } = require('../backend/dist/services/invoiceSource.js');
const { invoiceOrderProgress } = require('../backend/dist/services/invoiceOrderProgress.js');

test('mixed order percentages default to 100 and change money without changing quantities', () => {
  const s = { orders: [{ orderId: 'a', orderNumber: 'A' }, { orderId: 'b', orderNumber: 'B' }] };
  const calculation = { total: '300.01', issues: [], lines: [
    { orderId: 'a', amount: '100.00', quantity: 10 }, { orderId: 'b', amount: '200.01', quantity: 20 }] };
  const result = applyOrderBillingPercentages(s, calculation, { b: '30' });
  assert.equal(result.total, '160.00');
  assert.deepEqual(result.orders.map(order => order.difference), ['0.00', '140.01']);
  assert.deepEqual(result.lines.map(line => line.quantity), [10, 20]);
  assert.equal(applyOrderBillingPercentages(s, calculation).total, '300.01');
  const partial = applyOrderBillingPercentages(s, { ...calculation, issues: ['PRODUCTION'] }, { b: '30' });
  assert.deepEqual(partial.issues, []); assert.deepEqual(partial.warnings, ['PRODUCTION']);
  for (const b of ['0', '-1', '100.01', '1e1', 'NaN', '1.001']) {
    const invalid = applyOrderBillingPercentages(s, calculation, { b });
    assert.ok(invalid.issues.includes('PERCENTAGE')); assert.equal(invalid.total, null);
  }
  const html = buildInvoicePrintHtml({ source: { orderNumber: 'A, B' }, calculation: result,
    currencyCode: 'USD', fields: { seller: {}, buyer: {} } });
  assert.match(html, /30%/); assert.match(html, /TOTAL USD 160.00/);
});

test('settlement preview separates prior billing, receipts, deduction and new debt', () => {
  const s = { orders: [{ orderId: 'a', orderNumber: 'A', settlementsByCurrency: { USD: {
    priorBilledAmount: '5000.0000', priorReceivedAmount: '3000.0000', defaultDeductionAmount: '5000.0000',
  } } }] };
  const calculation = { total: '10000.00', issues: [], lines: [{ orderId: 'a', amount: '10000.00', quantity: 100 }] };
  const changed = applyOrderBillingPercentages(s, calculation, {}, { a: { deduction: '3000', reason: 'received only' } }, 'USD');
  assert.equal(changed.orders[0].amount, '10000.00'); assert.equal(changed.orders[0].netAmount, '7000.00');
  assert.equal(changed.orders[0].priorReceivedAmount, '3000.0000'); assert.equal(changed.total, '7000.00');
  assert.equal(changed.orders[0].priorOutstandingAmount, '2000.00');
  assert.equal(changed.orders[0].receivableAdded, '5000.00'); assert.equal(changed.receivableAdded, '5000.00');
  const missingReason = applyOrderBillingPercentages(s, calculation, {}, { a: { deduction: '3000', reason: '' } }, 'USD');
  assert.ok(missingReason.issues.includes('DEDUCTION_REASON')); assert.equal(missingReason.total, '7000.00');
});

test('order progress includes unassigned quantities and never guesses unknown production', () => {
  const order = { id: 1, totalQuantity: 100 };
  const plans = [{ workOrderId: 1, externalId: 'a' }, { workOrderId: 2, externalId: 'foreign' }];
  const rows = [{ id: 'a', producedQuantity: 25, plannedQuantity: 50, displayProgressPercent: 50 }];
  const result = invoiceOrderProgress(order, plans, rows);
  assert.equal(result.progressPercent, 25);
  assert.equal(result.assignments.length, 1);
  assert.equal(result.assignments[0].progressPercent, 50);
  assert.equal(invoiceOrderProgress(order, plans, []).progressPercent, null);
  assert.equal(invoiceOrderProgress(order, [], []).producedQuantity, null);
  assert.equal(invoiceOrderProgress(order, plans, [{ ...rows[0], hasInvalidProcessReferences: true }]).producedQuantity, null);
});
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

test('multiple orders retain row identity and separate price tiers for the same style', () => {
  const a = { ...source(), buyerOrgId: 1, sellerOrgId: 2 };
  const b = { ...source(), orderId: 'o2', orderNumber: 'PO-2', buyerOrgId: 1, sellerOrgId: 2 };
  b.lines = b.lines.map(line => ({ ...line, orderedQuantity: 30, quantity: '30' }));
  b.styles = b.styles.map(style => ({ ...style, orderedQuantity: 60, producedQuantity: 60 }));
  const before = JSON.stringify([a, b]);
  const merged = combineInvoiceSources([a, b]);
  const result = calc(merged);
  assert.equal(new Set(merged.lines.map(line => line.key)).size, 4);
  assert.deepEqual(merged.lines.map(line => line.itemId), [1, 1, 1, 1]);
  assert.deepEqual(result.styles.map(style => style.invoiceQuantity), [100, 60]);
  assert.deepEqual(result.styles.map(style => style.unitPrice), ['1.0050', '2.1250']);
  assert.deepEqual(result.styles.map(style => style.amount), ['100.50', '127.50']);
  assert.equal(result.total, '228.00');
  assert.equal(JSON.stringify([a, b]), before);
});

test('combined drafts reject different parties and duplicate orders; missing production still blocks print', () => {
  const a = { ...source(), buyerOrgId: 1, sellerOrgId: 2 };
  assert.throws(() => combineInvoiceSources([a, a]), /ORDER_CONFLICT/);
  for (const extra of [{ buyerOrgId: 3 }, { sellerOrgId: 3 }]) {
    assert.throws(() => combineInvoiceSources([a, { ...a, orderId: 'other', ...extra }]), /PARTY_CONFLICT/);
  }
  const combined = combineInvoiceSources([a, { ...a, orderId: 'other', ready: false }]);
  assert.ok(calc(combined).issues.includes('PRODUCTION'));
});

test('printed multi-order invoice contains remarks and billing values but no internal quantities or reasons', () => {
  const a = { ...source(), buyerOrgId: 1, sellerOrgId: 2 };
  const merged = combineInvoiceSources([a, { ...a, orderId: 'other', orderNumber: 'PO-2' }]);
  merged.lines[0].remark = '<script>remark</script>';
  merged.lines[0].adjustmentReason = 'INTERNAL_ONLY_REASON';
  merged.lines[0].orderedQuantity = 987654;
  const html = buildInvoicePrintHtml({ source: merged, calculation: calc(merged), currencyCode: 'USD', pricingBasis: 'FINISHED_GOODS_PRICE',
    fields: { number: 'DRAFT', seller: a.seller, buyer: a.buyer } });
  assert.match(html, /PO-1/); assert.match(html, /PO-2/);
  assert.match(html, /<th[^>]*>Remark<\/th>/);
  assert.match(html, /&lt;script&gt;remark&lt;\/script&gt;/);
  assert.doesNotMatch(html, /987654|INTERNAL_ONLY_REASON|Ordered|Produced|<script>/);
});

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
