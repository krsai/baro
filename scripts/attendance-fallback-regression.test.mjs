import test from 'node:test';
import assert from 'node:assert/strict';
import attendanceFallback from '../backend/dist/services/attendanceFallback.js';

const {
  isAtAttendanceFallbackWorkday,
  resolveAtAttendanceDay,
  resolveAtAttendanceQueryDateRange,
} = attendanceFallback;
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

test('an incomplete row cannot manufacture fallback labor', () => {
  assert.deepEqual(resolveAtAttendanceDay({
    ...base,
    actualEntryExists: true,
    actualWorkedSeconds: null,
  }), { seconds: 0, source: 'NONE' });
});

test('a missing attendance row is not assumed to be eight hours of attendance', () => {
  assert.deepEqual(resolveAtAttendanceDay(base), {
    seconds: 0,
    source: 'NONE',
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

test('a later attendance entry supplies only the exact measured seconds', () => {
  const beforeEntry = resolveAtAttendanceDay(base);
  const afterEntry = resolveAtAttendanceDay({
    ...base,
    actualEntryExists: true,
    actualWorkedSeconds: 25_200,
  });
  assert.deepEqual(beforeEntry, { seconds: 0, source: 'NONE' });
  assert.deepEqual(afterEntry, { seconds: 25_200, source: 'ACTUAL' });
});

test('allows Monday through Saturday but excludes Sunday and organization holidays', () => {
  assert.equal(isAtAttendanceFallbackWorkday({
    workDate: '2026-07-20',
    isOrganizationHoliday: false,
  }), true);
  assert.equal(isAtAttendanceFallbackWorkday({
    workDate: '2026-07-25',
    isOrganizationHoliday: false,
  }), true);
  assert.equal(isAtAttendanceFallbackWorkday({
    workDate: '2026-07-26',
    isOrganizationHoliday: false,
  }), false);
  assert.equal(isAtAttendanceFallbackWorkday({
    workDate: '2026-07-25',
    isOrganizationHoliday: true,
  }), false);
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
