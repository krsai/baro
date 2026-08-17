import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [server, page] = await Promise.all([
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/order/OrderList.jsx', import.meta.url), 'utf8'),
]);

test('orders expose a current customer-price based order value without partial totals', () => {
  assert.match(server, /loadCurrentOrderValueByOrderDbId/);
  assert.match(server, /quantityByStyleId/);
  assert.match(server, /resolveStBucketQuantityFromValues/);
  assert.match(server, /status: "MISSING_PRICE"/);
  assert.match(server, /currentOrderValue: currentOrderValueByOrderDbId\.get\(order\.id\)/);
});

test('order list labels the value and warns when a price is missing in all languages', () => {
  assert.match(page, /orderValue/);
  assert.match(page, /수주 금액/);
  assert.match(page, /Order Value/);
  assert.match(page, /Giá trị đơn hàng/);
  assert.match(page, /단가 누락/);
  assert.match(page, /currentOrderValue\?\.status === 'AVAILABLE'/);
});
