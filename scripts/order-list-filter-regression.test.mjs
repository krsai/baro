import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [page, statuses] = await Promise.all([
  readFile(new URL('../frontend/src/pages/App/order/OrderList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/constants/orderStatus.js', import.meta.url), 'utf8'),
]);

test('order list exposes only all, in-progress, and completed filters', () => {
  assert.match(page, /ORDER_FILTER_ALL/);
  assert.match(page, /ORDER_FILTER_IN_PROGRESS/);
  assert.match(page, /ORDER_FILTER_COMPLETED/);
  assert.match(statuses, /filterInProgressLabel/);
  assert.match(statuses, /filterCompletedLabel/);
  assert.doesNotMatch(page, /ORDER_FILTER_EXCEPT_DONE|ORDER_STATUS_OPTIONS\.map\(\(option\) => \(\{/);
});

test('order list does not filter by a date or month range', () => {
  assert.doesNotMatch(page, /MonthRangeSelector|dueDateFilterStart|dueDateFilterEnd|shiftDueDateFilterMonth/);
});
