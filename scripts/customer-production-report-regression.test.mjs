import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [server, page, router, layout, access, pageToolbar] = await Promise.all([
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/CustomerProductionReport.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/router.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/utils/accessControl.js', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/components/PageToolbar.jsx', import.meta.url), 'utf8'),
]);
const messages = await readFile(new URL('../frontend/src/constants/uiMessages.js', import.meta.url), 'utf8');

test('report aggregates customer production by relational order and style', () => {
  assert.match(server, /app\.get\("\/customer-production-reports"/);
  assert.match(server, /const key = `\$\{plan\.workOrderId\}:\$\{plan\.styleId/);
  assert.match(server, /ensureArray\(order\.workOrderItems\)/);
  assert.match(server, /operationalProgressRatio/);
  assert.match(server, /const reportedProgressPercent = isCompleted/);
  assert.match(server, /Math\.min\(99, Math\.max\(0, progressPercent\)\)/);
  assert.match(page, /\[row\.styleName, row\.styleCode\]/);
});

test('forecast is withheld until the full order-style quantity is assigned', () => {
  assert.match(server, /const canForecast = assignedQuantity >= item\.orderedQuantity && progress\.length > 0/);
  assert.match(server, /ASSIGNMENT_REQUIRED/);
  assert.match(server, /actualStartDate[\s\S]*plannedDurationDays - 1/);
  assert.match(server, /ST_DURATION_FROM_ACTUAL_START/);
  assert.match(server, /reportPlannedDurationDays/);
  assert.doesNotMatch(
    server.slice(server.indexOf('const buildAssignmentPlanProgressRows'), server.indexOf('const isAutoWorklogCompletedPlan')),
    /plannedDurationDays:\s*durationDays/
  );
  assert.doesNotMatch(server.slice(server.indexOf('app.get("/customer-production-reports"')), /forecastCompletedAt\) \|\| normalizeDateKey\(row\?\.renderEndDate/);
});

test('assignment progress does not hide missing outsource columns with a legacy query', () => {
  const progressLoader = server.slice(
    server.indexOf('const loadAssignmentPlanProgressWorkRows'),
    server.indexOf('const resolveAssignmentProcessGroupTotals')
  );
  assert.match(progressLoader, /isOutsourced: true/);
  assert.match(progressLoader, /outsourceVendorName: true/);
  assert.doesNotMatch(progressLoader, /loadRows\(false\)|P2022/);
});

test('empty customer filter keeps the label clear of the all-customers value', () => {
  assert.match(page, /const \[customerId, setCustomerId\] = useState\(''\)/);
  assert.match(page, /<InputLabel shrink>\{text\.customer\}<\/InputLabel>/);
  assert.match(page, /renderValue=.*text\.allCustomers/);
});

test('report omits the unfinished verified-output quantity column', () => {
  assert.doesNotMatch(page, /text\.produced/);
  assert.doesNotMatch(page, /row\.producedQuantity/);
  assert.doesNotMatch(page, /produced: 'Verified output'/);
});

test('sales report is routed, permissioned, printable, and exportable', () => {
  assert.match(router, /path:\s*'customer-production-report'/);
  assert.match(layout, /customer-production-report/);
  assert.match(access, /\/customer-production-report.*FEATURE_KEYS\.ORDER/);
  assert.match(page, /window\.print\(\)/);
  assert.match(page, /text\/csv;charset=utf-8/);
  assert.doesNotMatch(page, /estimateBasis|text\.basis|const BASIS/);
  assert.doesNotMatch(page, /PARTIALLY_ASSIGNED|Partially assigned|일부 미배정/);
  assert.match(page, /SCHEDULED: \{ ko: '배정 완료'/);
  assert.match(page, /useState\(false\).*includeCompleted|includeCompleted.*useState\(false\)/s);
  assert.match(page, /!includeCompleted && row\.status === 'COMPLETED'/);
  assert.doesNotMatch(page, /<Alert severity="info">\{text\.note\}<\/Alert>/);
  assert.match(page, /includeCompleted: '완료 포함'/);
  assert.match(page, /includeCompleted: 'Include completed'/);
  assert.match(page, /includeCompleted: 'Bao gồm đã hoàn thành'/);
  assert.match(messages, /customerProductionReport:\s*\{ ko: '보고서', en: 'Report', vi: 'Báo cáo' \}/);
  assert.match(page, /title: '보고서'/);
  assert.match(page, /title: 'Report'/);
  assert.match(page, /title: 'Báo cáo'/);
  assert.match(page, /displayEmpty/);
  assert.match(page, /renderValue=.*text\.allCustomers/);
  assert.match(page, /selectedCustomer \? customerLabel\(selectedCustomer, languageCode\) : text\.allCustomers/);
  assert.match(page, /import PageToolbar from/);
  assert.match(page, /import SearchInput from/);
  assert.match(page, /toolbar=\{<PageToolbar/);
  assert.doesNotMatch(page, /toolbar=\{<Stack/);
  assert.match(pageToolbar, /className=\{className\}/);
});
