import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateKeyInTimeZone, todayDateKey } from '../frontend/src/utils/dateKey.mjs';

test('Asia/Seoul date key does not shift at UTC boundary', () => {
  const source = new Date('2026-02-23T00:30:00+09:00');
  assert.equal(formatDateKeyInTimeZone(source, 'Asia/Seoul'), '2026-02-23');
  assert.equal(formatDateKeyInTimeZone(source, 'UTC'), '2026-02-22');
});

test('todayDateKey uses supplied now argument deterministically', () => {
  const source = new Date('2026-02-23T23:50:00+09:00');
  assert.equal(todayDateKey('Asia/Seoul', source), '2026-02-23');
});

test('invalid input returns empty date key', () => {
  assert.equal(formatDateKeyInTimeZone('invalid-date', 'Asia/Seoul'), '');
});
