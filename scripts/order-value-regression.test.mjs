import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { calculateOrderSalesValue } = require('../backend/dist/utils/orderSalesValue.js');
const [server, page] = await Promise.all([
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/order/OrderList.jsx', import.meta.url), 'utf8'),
]);

const bucketVersion = (id, buckets) => ({ id, entries: buckets.map((bucketQuantity, index) => ({ id: id * 100 + index, bucketQuantity })) });
const priceList = (styleId, pricingBasis, currencyCode, version, prices) => ({
  styleId, pricingBasis, currency: { code: currencyCode }, quantityBucketSetVersionId: version.id,
  prices: prices.map(([bucketQuantity, unitPrice]) => ({ unitPrice, quantityBucketEntry: { bucketQuantity } })),
});

test('order value groups style quantities and returns the exact tier and line calculation', () => {
  const version = bucketVersion(1, [100, 1000, 3000]);
  const order = { workOrderItems: [
    { styleId: 7, totalQuantity: 600, style: { code: 'ST-7' } },
    { styleId: 7, totalQuantity: 500, style: { code: 'ST-7' } },
    { styleId: 8, totalQuantity: 50, style: { code: 'ST-8' } },
  ] };
  const relationship = { salesBucketSetVersion: version, salesBucketOverrides: [], salesPriceLists: [
    priceList(7, 'MANUFACTURING_SERVICE_PRICE', 'USD', version, [[100, 4], [1000, 3], [3000, 2]]),
    priceList(8, 'MANUFACTURING_SERVICE_PRICE', 'USD', version, [[100, 5], [1000, 4], [3000, 3]]),
  ] };
  const result = calculateOrderSalesValue(order, relationship);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.amount, 3550);
  assert.deepEqual(result.lines.map(({ styleCode, quantity, bucketQuantity, unitPrice, amount }) => ({ styleCode, quantity, bucketQuantity, unitPrice, amount })), [
    { styleCode: 'ST-7', quantity: 1100, bucketQuantity: 1000, unitPrice: 3, amount: 3300 },
    { styleCode: 'ST-8', quantity: 50, bucketQuantity: 100, unitPrice: 5, amount: 250 },
  ]);
});

test('order value rejects partial totals while preserving missing-line evidence', () => {
  const version = bucketVersion(1, [100]);
  const order = { workOrderItems: [
    { styleId: 7, totalQuantity: 100, style: { code: 'A' } },
    { styleId: 8, totalQuantity: 100, style: { code: 'B' } },
  ] };
  const relationship = { salesBucketSetVersion: version, salesBucketOverrides: [], salesPriceLists: [
    priceList(7, 'MANUFACTURING_SERVICE_PRICE', 'USD', version, [[100, 2]]),
    priceList(7, 'FULL_PACKAGE_PRICE', 'USD', version, [[100, 8]]),
    priceList(8, 'FULL_PACKAGE_PRICE', 'USD', version, [[100, 9]]),
  ] };
  const result = calculateOrderSalesValue(order, relationship);
  assert.equal(result.status, 'AVAILABLE');
  assert.equal(result.pricingBasis, 'FULL_PACKAGE_PRICE');
  assert.equal(result.amount, 1700);
  relationship.salesPriceLists.pop();
  const missing = calculateOrderSalesValue(order, relationship);
  assert.equal(missing.status, 'MISSING_PRICE');
  assert.equal(missing.amount, null);
  assert.equal(missing.lines.find((line) => line.styleId === 8).status, 'MISSING_PRICE');
});

test('the order list opens a currency-aware calculation dialog', () => {
  assert.match(server, /calculateOrderSalesValue\(order, relationship\)/);
  assert.match(server, /currentOrderValue: currentOrderValueByOrderDbId\.get\(order\.id\)/);
  assert.match(page, /setOrderValueDetail\(order\)/);
  assert.match(page, /currentOrderValue\?\.lines/);
  assert.match(page, /formatOrderValue\(order\.currentOrderValue\.amount, order\.currentOrderValue\.currencyCode\)/);
  assert.match(page, /style: 'currency'/);
  assert.match(page, /Quantity tier/);
  assert.match(page, /단가 누락/);
});
