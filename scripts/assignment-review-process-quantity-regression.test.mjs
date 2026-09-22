import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadSourceBindings } from './helpers/source-bindings.mjs';

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
const backend = read('backend/src/index.ts');
const board = read('frontend/src/pages/App/assign/AssignBoard.jsx');
const drawer = read('frontend/src/components/QuantityReviewDrawer.jsx');
const capacity = read('frontend/src/pages/App/assign/utils/factoryMonthCapacity.js');

test('review summary retains process diagnostics while work records load on demand', () => {
  const summary = backend.slice(backend.indexOf('reviewReason:'), backend.indexOf('quantityReview: includeQuantityReviewDetails'));
  assert.match(summary, /recordedTotalQuantity: totalDone/);
  assert.match(summary, /processTotals: reviewProcessTotals/);
  assert.doesNotMatch(summary, /workRecords:/);
  assert.match(backend, /quantityReview: includeQuantityReviewDetails\s*\?/);
  assert.match(board, /reviewReason: progressRow\?\.reviewReason/);
  assert.match(capacity, /reviewReason: assignment\?\.reviewReason/);
});

test('quantity menu opens the shared drawer for the scheduler-enriched assignment', () => {
  assert.match(board, /setQuantityReviewAssignmentId\(contextMenuState\.id\)/);
  assert.match(board, /<QuantityReviewDrawer/);
  assert.match(board, /externalId=\{quantityReviewAssignmentId\}/);
  assert.match(board, /resolveAssignmentWithSchedulerProgress\(quantityReviewAssignmentId\)/);
  assert.match(board, /applySchedulerProgressToAssignments\(\[assignment\]/);
});

test('shared drawer loads details only for a valid open assignment and cancels stale responses', () => {
  assert.match(drawer, /if \(!assignmentId \|\| !Number\.isFinite\(normalizedOrgId\) \|\| normalizedOrgId <= 0\)/);
  assert.match(drawer, /\/quantity-review/);
  assert.match(drawer, /forceRefresh: true/);
  assert.match(drawer, /if \(!cancelled\) setData/);
  assert.match(drawer, /abortController\.abort\(\)/);
  assert.match(backend, /includeQuantityReviewDetails: true/);
});

test('process rows expand linked records with each process own applicable quantity', () => {
  assert.match(drawer, /setExpandedProcessKey/);
  assert.match(drawer, /process\?\.applicableQuantity \?\? planned/);
  assert.match(drawer, /record\?\.styleProcessId[\s\S]*process\.styleProcessId/);
  assert.match(drawer, /aria-label=\{label\('연결된 작업기록'/);
});

test('linked records close the drawer before opening their source work log', () => {
  assert.match(drawer, /onOpenWorkLog=\{handleOpenWorkLog\}/);
  assert.match(drawer, /onClose\?\.\(\);\s*navigateToPath/);
  assert.match(drawer, /\/work-history\/\$\{workLogId\}/);
  assert.match(backend, /workLogId: toPositiveIntOrNull\(record\?\.workLogId\)/);
});

test('display progress remains uncapped while scheduler progress is bounded and unknown stays unknown', () => {
  for (const [operationalProgressPercent, progressForRemainingRatio, expected] of [[196, 1.96, 100], [60, 0.4, 40], [null, null, null]]) {
    const actual = loadSourceBindings('backend/src/index.ts', ['schedulerProgressPercent', 'displayProgressPercent'], { operationalProgressPercent, progressForRemainingRatio });
    assert.equal(actual.displayProgressPercent, operationalProgressPercent);
    assert.equal(actual.schedulerProgressPercent, expected);
  }
});
