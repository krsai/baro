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

test('review card renders recorded versus assigned quantity for every process', () => {
  assert.match(card, /reviewProcessTotals\.map/);
  assert.match(card, /processLabel.*quantity\.toLocaleString\(\).*planned\.toLocaleString\(\)/s);
  assert.match(card, /difference === 0 \? 'success' : 'error'/);
});
