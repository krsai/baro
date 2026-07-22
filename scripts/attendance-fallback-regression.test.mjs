import test from 'node:test';
import assert from 'node:assert/strict';
import attendanceFallback from '../backend/dist/services/attendanceFallback.js';

const { resolveAtAttendanceDay, resolveAtAttendanceQueryDateRange } = attendanceFallback;
const base = {
  actualEntryExists: false,
  actualWorkedSeconds: null,
  isEligibleWorker: true,
  isOnLeave: false,
  isWorkingDay: true,
  fallbackWorkSeconds: 8 * 60 * 60,
};

test('uses actual attendance seconds when an explicit row exists', () => {
  assert.deepEqual(resolveAtAttendanceDay({
    ...base,
    actualEntryExists: true,
    actualWorkedSeconds: 27_000,
  }), { seconds: 27_000, source: 'ACTUAL' });
});

test('preserves an explicit zero-second absence', () => {
  assert.deepEqual(resolveAtAttendanceDay({
    ...base,
    actualEntryExists: true,
    actualWorkedSeconds: 0,
  }), { seconds: 0, source: 'ACTUAL' });
});

test('treats an explicit row without worked seconds as incomplete and falls back', () => {
  assert.deepEqual(resolveAtAttendanceDay({
    ...base,
    actualEntryExists: true,
    actualWorkedSeconds: null,
  }), { seconds: 28_800, source: 'FALLBACK' });
});

test('uses eight hours for a missing attendance row on an eligible workday', () => {
  assert.deepEqual(resolveAtAttendanceDay(base), {
    seconds: 28_800,
    source: 'FALLBACK',
  });
});

test('does not create fallback labor outside employment, on leave, or off workdays', () => {
  for (const overrides of [
    { isEligibleWorker: false },
    { isOnLeave: true },
    { isWorkingDay: false },
  ]) {
    assert.deepEqual(resolveAtAttendanceDay({ ...base, ...overrides }), {
      seconds: 0,
      source: 'NONE',
    });
  }
});

test('expands attendance queries to the full cross-month coverage range', () => {
  assert.deepEqual(resolveAtAttendanceQueryDateRange([
    '2026-06-05',
    '2026-05-29',
    '2026-06-01',
    null,
    'invalid',
  ]), { gte: '2026-05-29', lte: '2026-06-05' });
});
