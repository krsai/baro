import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [backend, board, capacity, card] = await Promise.all([
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/assign/AssignBoard.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/assign/utils/lineMonthCapacity.js', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/assign/components/LineMonthCapacityBoard.jsx', import.meta.url), 'utf8'),
]);

test('review-required progress response carries process-level recorded quantities', () => {
  assert.match(backend, /reviewReason:[\s\S]*processTotals: reviewProcessTotals/);
  assert.match(board, /reviewReason: progressRow\?\.reviewReason/);
  assert.match(capacity, /reviewReason: assignment\?\.reviewReason/);
});

test('review card stays compact and opens a dedicated quantity-review drawer', () => {
  assert.doesNotMatch(card, /reviewProcessTotals\.map/);
  assert.match(board, /'수량 확인'.*'Quantity review'.*'Kiểm tra số lượng'/s);
  assert.match(board, /disabled=\{contextMenuTargetAssignment\?\.scheduleStatus !== 'REVIEW_REQUIRED'\}/);
  assert.match(board, /reason\.processTotals/);
  assert.match(board, /reason\.workRecords/);
  assert.match(backend, /workRecords: stats\.records/);
});
