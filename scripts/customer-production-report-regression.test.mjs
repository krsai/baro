import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [server, page, router, layout, access] = await Promise.all([
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/CustomerProductionReport.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/router.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/utils/accessControl.js', import.meta.url), 'utf8'),
]);

test('report aggregates customer production by relational order and style', () => {
  assert.match(server, /app\.get\("\/customer-production-reports"/);
  assert.match(server, /const key = `\$\{plan\.workOrderId\}:\$\{plan\.styleId/);
  assert.match(server, /ensureArray\(order\.workOrderItems\)/);
  assert.match(server, /operationalProgressRatio/);
});

test('forecast is withheld until the full order-style quantity is assigned', () => {
  assert.match(server, /const canForecast = assignedQuantity >= item\.orderedQuantity && progress\.length > 0/);
  assert.match(server, /ASSIGNMENT_REQUIRED/);
  assert.match(server, /hasMonthlySummaryRecords: progress\.some/);
});

test('sales report is routed, permissioned, printable, and exportable', () => {
  assert.match(router, /path:\s*'customer-production-report'/);
  assert.match(layout, /customer-production-report/);
  assert.match(access, /\/customer-production-report.*FEATURE_KEYS\.ORDER/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /text\/csv;charset=utf-8/);
  assert.match(page, /monthlySummary/);
});
