import test from 'node:test';
import assert from 'node:assert/strict';
import attendanceFallback from '../backend/dist/services/attendanceFallback.js';

const { resolveAtAttendanceDay } = attendanceFallback;
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
