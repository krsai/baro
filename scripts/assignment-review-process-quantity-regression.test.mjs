import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [backend, board, capacity, card] = await Promise.all([
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/assign/AssignBoard.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/assign/utils/lineMonthCapacity.js', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/assign/components/LineMonthCapacityBoard.jsx', import.meta.url), 'utf8'),
]);

test('review-required progress response carries only the compact review summary', () => {
  const reviewSummary = backend.slice(
    backend.indexOf('reviewReason:'),
    backend.indexOf('quantityReview: includeQuantityReviewDetails')
  );
  assert.match(reviewSummary, /recordedTotalQuantity: totalDone/);
  assert.doesNotMatch(reviewSummary, /processTotals|workRecords/);
  assert.match(board, /reviewReason: progressRow\?\.reviewReason/);
  assert.match(capacity, /reviewReason: assignment\?\.reviewReason/);
});

test('review card stays compact and opens a dedicated quantity-review drawer', () => {
  assert.doesNotMatch(card, /reviewProcessTotals\.map/);
  assert.match(board, /'수량 확인'.*'Quantity review'.*'Kiểm tra số lượng'/s);
  assert.match(board, /disabled=\{!contextMenuTargetAssignment\}/);
  assert.match(board, /reason\.processTotals/);
  assert.match(board, /reason\.workRecords/);
  assert.match(backend, /workRecords: \[\.\.\.stats\.records\]/);
});

test('quantity review menu uses the same scheduler-enriched status as the review card', () => {
  assert.match(board, /const resolveAssignmentWithSchedulerProgress = useCallback/);
  assert.match(board, /applySchedulerProgressToAssignments\(\[assignment\]/);
  assert.match(board, /return resolveAssignmentWithSchedulerProgress\(detailState\.assignmentId\)/);
  assert.doesNotMatch(board, /contextMenuTargetAssignment\?\.scheduleStatus !== 'REVIEW_REQUIRED'/);
  assert.doesNotMatch(
    board.slice(
      board.indexOf('const handleContextOpenReviewReason'),
      board.indexOf('const handleCloseDetail')
    ),
    /assignmentById\.get/
  );
});

test('all assignments load quantity-review details only when the menu is opened', () => {
  assert.match(backend, /app\.get\("\/assignment-plans\/:id\/quantity-review"/);
  assert.match(backend, /includeQuantityReviewDetails: true/);
  assert.match(board, /setQuantityReviewAssignmentId\(contextMenuState\.id\)/);
  assert.match(board, /\/quantity-review` \+/);
  assert.match(board, /quantityReviewLoading/);
  assert.match(board, /externalReloadTick[\s\S]*quantityReviewAssignmentId/);
});

test('process quantity rows expand their linked work records inline', () => {
  assert.match(board, /const QuantityReviewProcessTable =/);
  assert.match(board, /setExpandedProcessKey/);
  assert.match(board, /record\?\.styleProcessId[\s\S]*process\.styleProcessId/);
  assert.match(board, /aria-label=\{label\('연결된 작업기록'/);
  assert.match(board, /<QuantityReviewProcessTable/);
  assert.doesNotMatch(board, /label\('생산 기록', 'Production records'/);
});

test('expanded quantity records can open their source work-log detail', () => {
  assert.match(backend, /workLogId: toPositiveIntOrNull\(record\?\.workLogId\)/);
  assert.match(board, /onOpenWorkLog=\{handleOpenQuantityReviewWorkLog\}/);
  assert.match(board, /navigateToPath\(`\/work-history\/\$\{workLogId\}`/);
  assert.match(board, /label\('작업 기록', 'Work log', 'Nhật ký'\)/);
});

test('review cards show uncapped actual progress while scheduling remains capped', () => {
  assert.match(backend, /const operationalProgressPercent =[\s\S]*Math\.round\(operationalProgressRatio \* 100\)/);
  assert.match(backend, /Math\.min\(100, operationalProgressPercent\)/);
  assert.match(backend, /operationalProgressPercent,\s*\n\s*displayProgressPercent,\s*\n\s*schedulerProgressPercent/);
  assert.match(card, /progressPercent=\{assignment\.workProgressPercent \?\? assignment\.progressPercent\}/);
});

test('review-card progress exposes the highest process overproduction instead of an offsetting average', () => {
  assert.match(backend, /const displayProgressPercent =/);
  assert.match(backend, /reviewProcessTotals\.map\(\(process\) =>/);
  assert.match(backend, /process\?\.quantity[\s\S]*baselineQuantityRaw/);
  assert.match(board, /progressRow\?\.displayProgressPercent \?\?/);
});
