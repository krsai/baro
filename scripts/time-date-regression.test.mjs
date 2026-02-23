import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateKeyInTimeZone, todayDateKey } from '../frontend/src/utils/dateKey.mjs';
import { resolveAtTrainingMonthKey } from '../backend/dist/utils/atTrainingMonthKey.js';

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

test('AT training month key uses previous month on cutoff day', () => {
  const key = resolveAtTrainingMonthKey({
    now: new Date('2026-02-05T00:00:00+09:00'),
    timeZone: 'Asia/Seoul',
    cutoffDay: 5,
  });
  assert.equal(key, '2026-01');
});

test('AT training month key uses two months back before cutoff day', () => {
  const key = resolveAtTrainingMonthKey({
    now: new Date('2026-02-04T23:59:00+09:00'),
    timeZone: 'Asia/Seoul',
    cutoffDay: 5,
  });
  assert.equal(key, '2025-12');
});

test('AT training month key handles year boundary in January', () => {
  const onCutoff = resolveAtTrainingMonthKey({
    now: new Date('2026-01-05T08:00:00+09:00'),
    timeZone: 'Asia/Seoul',
    cutoffDay: 5,
  });
  const beforeCutoff = resolveAtTrainingMonthKey({
    now: new Date('2026-01-04T08:00:00+09:00'),
    timeZone: 'Asia/Seoul',
    cutoffDay: 5,
  });
  assert.equal(onCutoff, '2025-12');
  assert.equal(beforeCutoff, '2025-11');
});
