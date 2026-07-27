import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateKeyInTimeZone, todayDateKey } from '../frontend/src/utils/dateKey.mjs';
import { resolveAtTrainingMonthKey } from '../backend/dist/utils/atTrainingMonthKey.js';
import payrollMonth from '../backend/dist/utils/payrollMonth.js';
import workLogCoverage from '../backend/dist/work-records/workLogCoverage.js';

const { validateWorkLogSingleMonthRange } = workLogCoverage;
const {
  isPayrollMonthReady,
  resolveLatestCompletedPayrollMonthKey,
} = payrollMonth;

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

test('work log coverage accepts one month and rejects a cross-month range', () => {
  assert.equal(validateWorkLogSingleMonthRange({
    coverageStartDate: '2026-06-01',
    coverageEndDate: '2026-06-30',
  }), null);
  assert.match(validateWorkLogSingleMonthRange({
    coverageStartDate: '2026-05-29',
    coverageEndDate: '2026-06-05',
  }), /cannot cross calendar months/i);
});

test('payroll becomes available only after the selected month ends', () => {
  const now = new Date('2026-06-30T17:05:00.000Z');
  const options = { now, timeZone: 'Asia/Ho_Chi_Minh' };

  assert.equal(resolveLatestCompletedPayrollMonthKey(options), '2026-06');
  assert.equal(isPayrollMonthReady('2026-06', options), true);
  assert.equal(isPayrollMonthReady('2026-07', options), false);
  assert.equal(isPayrollMonthReady('2026-08', options), false);
  assert.equal(isPayrollMonthReady('2026-13', options), false);
});

test('payroll stays unavailable while the selected month is still in progress', () => {
  const options = {
    now: new Date('2026-06-30T16:59:00.000Z'),
    timeZone: 'Asia/Ho_Chi_Minh',
  };

  assert.equal(resolveLatestCompletedPayrollMonthKey(options), '2026-05');
  assert.equal(isPayrollMonthReady('2026-06', options), false);
  assert.equal(isPayrollMonthReady('2026-05', options), true);
});
