import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadSourceBindings } from './helpers/source-bindings.mjs';

test('report renders canonical server order progress without reweighting rounded style percentages', () => {
  const source = loadSourceBindings('frontend/src/pages/App/CustomerProductionReport.jsx', ['groupRowsByOrder'], {
    resolveOrderStatus: () => 'IN_PROGRESS',
  });
  const rows = [{ customerId: 1, orderId: 'L17-1', styleId: 7, orderedQuantity: 99, assignedQuantity: 99,
    progressPercent: 100, status: 'COMPLETED', producedQuantity: 99, orderProgressPercent: 99, orderProducedQuantity: 99 },
    { customerId: 1, orderId: 'L17-1', styleId: 8, orderedQuantity: 1, progressPercent: 99, status: 'IN_PROGRESS',
      orderProgressPercent: 99, orderProducedQuantity: 99 }];
  const [result] = source.groupRowsByOrder(rows);
  assert.equal(result.progressPercent, 99);
  assert.equal(result.producedQuantity, 99);
  assert.equal(result.completedStyleCount, 1);
  rows[0].orderProgressPercent = null; rows[0].orderProducedQuantity = null;
  assert.equal(source.groupRowsByOrder(rows)[0].progressPercent, null);
  assert.equal(source.groupRowsByOrder(rows)[0].producedQuantity, null);
});

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
  assert.match(server, /const key = `\$\{plan\.workOrderId \?\? plan\.assignmentCard\?\.workOrderId\}:\$\{plan\.styleId/);
  assert.match(server, /ensureArray\(order\.workOrderItems\)/);
  assert.match(server, /operationalProgressRatio/);
  assert.match(server, /const reportedProgressPercent = styleProduction\.progressPercent/);
  assert.match(server, /row\?\.scheduleStatus === ASSIGNMENT_STATUS_REVIEW_REQUIRED[\s\S]*row\?\.displayProgressPercent/);
  assert.match(server, /reviewRequired[\s\S]*\? "REVIEW_REQUIRED"/);
  assert.match(page, /styleName \|\| \w+\??\.?styleCode/);
});

test('report displays style name only, never the style code alongside it', () => {
  // The report is customer-facing; the internal style code has no meaning to
  // them, so a style cell shows the name (falling back to the code only when
  // no name exists) instead of "name · code".
  assert.doesNotMatch(page, /styleName, \w+\??\.?styleCode\]\.filter\(Boolean\)\.join/);
  assert.doesNotMatch(page, /\[soleStyle\?\.styleName, soleStyle\?\.styleCode\]/);
  assert.doesNotMatch(page, /\[styleRow\.styleName, styleRow\.styleCode\]/);
});

test('forecast is withheld until the full order-style quantity is assigned', () => {
  assert.match(server, /const canForecast = assignedQuantity >= item\.orderedQuantity && progress\.length > 0/);
  assert.match(server, /const canForecastFromWorkRate =\s*canForecast &&/);
  assert.match(server, /Math\.ceil\(observedElapsedDays \/ observedProgressRatio\) - 1/);
  assert.match(server, /canForecast && scheduledCompletionCandidates\.length === progress\.length/);
  assert.doesNotMatch(
    server.slice(server.indexOf('const buildAssignmentPlanProgressRows'), server.indexOf('const resolveAutoWorklogCompletionDate')),
    /plannedDurationDays:\s*durationDays/
  );
  assert.match(server, /const reportedProgressPercent = styleProduction\.progressPercent/);
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

test('report shows finished versus ordered quantities for orders and individual styles', () => {
  assert.match(page, /fmt\(row\.producedQuantity\).*fmt\(row\.orderedQuantity\)/);
  assert.match(page, /fmt\(styleRow\.producedQuantity\).*fmt\(styleRow\.orderedQuantity\)/);
  assert.doesNotMatch(page, /produced: 'Verified output'/);
});

test('customer-facing report withholds internal schedule estimates and review flags', () => {
  assert.doesNotMatch(page, /lastWork:|estimate:|basis:|reviewRequired|estimateBasis|estimatedCompletionDate|hasMonthlySummaryRecords/);
  // The backend's internal REVIEW_REQUIRED bookkeeping state must never reach
  // the customer as its own alarming status chip - it is folded into the
  // ordinary in-production status before rendering/grouping/export.
  assert.doesNotMatch(page, /REVIEW_REQUIRED: \{/);
  assert.match(page, /normalizeCustomerFacingStatus/);
  assert.match(page, /status === 'REVIEW_REQUIRED' \? 'IN_PROGRESS'/);
  assert.match(page, /completedStyleCount/);
  assert.match(page, /completedCount:\s*\(count, total\)/);
});

test('multi-style order rows summarize as "first style 외 N개" like the order screen, not a bare count', () => {
  assert.match(page, /resolveStyleSummaryLabel/);
  assert.doesNotMatch(page, /styleCount:\s*\(total\)/);
  assert.match(page, /\$\{names\[0\]\} 외 \$\{remaining\}개/);
});

test('report has no export or print action', () => {
  assert.doesNotMatch(page, /DownloadIcon|exportCsv|csvCell|text\.csv|\bBlob\(|PrintIcon|GlobalStyles|window\.print|customer-production-report-print/);
});

test('sales report is routed and permissioned', () => {
  assert.match(router, /path:\s*'customer-production-report'/);
  assert.match(layout, /customer-production-report/);
  assert.match(access, /\/customer-production-report.*FEATURE_KEYS\.ORDER/);

  assert.doesNotMatch(page, /estimateBasis|text\.basis|const BASIS/);
  assert.doesNotMatch(page, /PARTIALLY_ASSIGNED|Partially assigned|일부 미배정/);
  assert.match(page, /SCHEDULED: \{ ko: '배정 완료'/);
  assert.match(page, /useState\(false\).*includeCompleted|includeCompleted.*useState\(false\)/s);
  assert.match(page, /!includeCompleted && row\.status === 'COMPLETED'/);
  assert.doesNotMatch(page, /<Alert severity="info">\{text\.note\}<\/Alert>/);
  assert.match(page, /includeCompleted: '완료 포함'/);
  assert.match(page, /includeCompleted: 'Include completed'/);
  assert.match(page, /includeCompleted: 'Bao gồm đã hoàn thành'/);
  assert.match(messages, /customerProductionReport:\s*\{ ko: '현황판', en: 'Status Board', vi: 'Bảng tình hình' \}/);
  assert.match(page, /title: '현황판'/);
  assert.match(page, /title: 'Status Board'/);
  assert.match(page, /title: 'Bảng tình hình'/);
  assert.match(page, /displayEmpty/);
  assert.match(page, /renderValue=.*text\.allCustomers/);
  assert.match(page, /selectedCustomer \? customerLabel\(selectedCustomer, languageCode\) : text\.allCustomers/);
  assert.match(page, /import PageToolbar from/);
  assert.match(page, /import SearchInput from/);
  assert.match(page, /toolbar=\{<PageToolbar/);
  assert.doesNotMatch(page, /toolbar=\{<Stack/);
  assert.match(pageToolbar, /className=\{className\}/);
});
