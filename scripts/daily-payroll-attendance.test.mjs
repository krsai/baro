import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const source = ts.transpileModule(readFileSync('backend/src/employees/dailyPayrollAttendance.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function('require', 'exports', source)(() => ({ isPolicyWorkday: date => new Date(`${date}T00:00Z`).getUTCDay() !== 0 }), exports);
const { dailyPayrollAttendance } = exports;
const punch = (workDate, hours, clockIn = '08:00') => ({ workDate, clockIn, clockOut: '20:00', workedSeconds: hours * 3600 });
const calculate = (entries, approvals = [], extra = {}) => dailyPayrollAttendance({ dateKeys: ['2026-11-02'], entries, approvals,
  holidayDateKeys: new Set(), excusedDateKeys: new Set(), policy: { standardClockIn: '08:00', standardWorkMinutes: 480 },
  latenessGraceMinutes: 30, overtimeToleranceMinutes: 0, ...extra });
test('lateness counts dates, permits exactly 30 minutes and never changes attended-day count', () => {
  assert.equal(calculate([punch('2026-11-02', 7.5, '08:30')]).lateCount, 0);
  const late = calculate([punch('2026-11-02', 7, '08:31')]);
  assert.equal(late.lateCount, 1);
  assert.equal(late.actualWorkdays, 1);
});
test('unapproved overtime is zero; approved duration caps actual attendance per date', () => {
  assert.equal(calculate([punch('2026-11-02', 11)]).overtimeSeconds, 0);
  const approvals = [{ workDate: '2026-11-02', kind: 'OVERTIME', approvedSeconds: 10800 }];
  assert.equal(calculate([punch('2026-11-02', 10)], approvals).overtimeSeconds, 7200);
  assert.equal(calculate([punch('2026-11-02', 12)], approvals).overtimeSeconds, 10800);
  assert.equal(calculate([punch('2026-11-02', 12)], [...approvals, ...approvals]).overtimeSeconds, 10800);
  assert.equal(calculate([punch('2026-11-02', 12)], [{ ...approvals[0], workDate: '2026-11-03' }]).overtimeSeconds, 0);
});
test('explicit tolerance is applied only inside the shortfall boundary', () => {
  const approvals = [{ workDate: '2026-11-02', kind: 'OVERTIME', approvedSeconds: 10800 }];
  assert.equal(calculate([punch('2026-11-02', 8 + 170 / 60)], approvals, { overtimeToleranceMinutes: 10 }).overtimeSeconds, 10800);
  assert.equal(calculate([punch('2026-11-02', 8 + 169 / 60)], approvals, { overtimeToleranceMinutes: 10 }).overtimeSeconds, 10140);
});
test('absent, excused, incomplete punches and non-working dates remain distinct', () => {
  assert.equal(calculate([]).absenceCount, 1);
  assert.equal(calculate([], [], { excusedDateKeys: new Set(['2026-11-02']) }).absenceCount, 0);
  const missing = calculate([{ ...punch('2026-11-02', 11), clockOut: null }]);
  assert.equal(missing.absenceCount, 0);
  assert.equal(missing.reviewCount, 1);
  assert.equal(calculate([], [], { holidayDateKeys: new Set(['2026-11-02']) }).absenceCount, 0);
});
test('special work needs its own approved date and valid punches', () => {
  const options = { holidayDateKeys: new Set(['2026-11-02']) };
  assert.equal(calculate([punch('2026-11-02', 2)], [], options).specialSeconds, 0);
  assert.equal(calculate([punch('2026-11-02', 2)], [{ workDate: '2026-11-02', kind: 'SPECIAL', approvedSeconds: 10800 }], options).specialSeconds, 7200);
});
