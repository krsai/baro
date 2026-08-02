import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatDateKeyInTimeZone, todayDateKey } from '../frontend/src/utils/dateKey.mjs';
import { resolveAtTrainingMonthKey } from '../backend/dist/utils/atTrainingMonthKey.js';
import payrollMonth from '../backend/dist/utils/payrollMonth.js';
import workLogCoverage from '../backend/dist/work-records/workLogCoverage.js';

const { validateWorkLogSingleMonthRange } = workLogCoverage;
const {
  assertValidBusinessTimeZone,
  isPayrollMonthReady,
  resolveLatestCompletedPayrollMonthKey,
} = payrollMonth;
const payrollControllerSource = fs.readFileSync(
  'backend/src/payroll/payroll.controller.ts',
  'utf8'
);
const payrollEntrySource = fs.readFileSync(
  'frontend/src/pages/App/payroll/PayrollEntry.jsx',
  'utf8'
);
const payrollServiceSource = fs.readFileSync(
  'backend/src/payroll/payroll.service.ts',
  'utf8'
);
const factoryRoutesSource = fs.readFileSync(
  'backend/src/factories/factory.routes.ts',
  'utf8'
);
const factoryDetailSource = fs.readFileSync(
  'frontend/src/pages/App/organization/factoryDetail/FactoryDetail.jsx',
  'utf8'
);
const uiMessagesSource = fs.readFileSync(
  'frontend/src/constants/uiMessages.js',
  'utf8'
);

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

test('payroll entry uses the server business calendar instead of browser local month', () => {
  assert.match(payrollControllerSource, /resolveLatestCompletedPayrollMonthKey\(\{ timeZone \}\)/);
  assert.match(payrollControllerSource, /process\.env\.BUSINESS_TIME_ZONE \|\| "Asia\/Seoul"/);
  assert.match(payrollEntrySource, /requestJSON\('\/payroll\/calendar'/);
  assert.match(payrollEntrySource, /calendar\?\.latestCompletedMonthKey/);
  assert.doesNotMatch(payrollEntrySource, /const getLatestCompletedPayrollMonthKey/);
  assert.match(payrollEntrySource, /setPayMonth\(String\(payload\?\.latestCompletedMonthKey/);
  assert.match(payrollEntrySource, /title=\{isNew \? '생산수당 계산'/);
});

test('payroll persistence rejects unfinished months and supports exact save and delete paths', () => {
  assert.match(payrollServiceSource, /!isPayrollMonthReady\(month,/);
  assert.match(payrollServiceSource, /createHttpError\(409, "payroll month not ended"\)/);
  assert.match(payrollServiceSource, /prisma\.payrollSnapshot\.upsert\(/);
  assert.match(payrollServiceSource, /prisma\.payrollSnapshot\.delete\(/);
  assert.match(payrollServiceSource, /syncAssignmentPlanPayrollFinalization\(\{ orgId, month, finalized: false \}\)/);
});

test('production allowance calculation excludes unfinished salary components', () => {
  assert.match(payrollEntrySource, /생산수당 = 작업수량 × CT초 × 작업 당시 공장 생산수당 초당 단가/);
  assert.match(payrollServiceSource, /resolveEmployeeEffectivePayType\(employee\) === "CT"/);
  assert.match(payrollServiceSource, /productionAllowance/);
  assert.match(payrollServiceSource, /ctSeconds \* quantity \* wagePerSecond/);
  assert.match(payrollServiceSource, /void _employees/);
  assert.doesNotMatch(payrollEntrySource, /fixedSalary|ctAmount|bonus|deduction|finalEarnings/);
  assert.doesNotMatch(payrollEntrySource, /기본급|고정수당|변동수당|보너스|공제/);
});

test('factory production allowance rate is derived from the monthly production allowance target', () => {
  assert.match(factoryRoutesSource, /FACTORY_WORK_SECONDS_PER_MONTH = 26 \* 8 \* 60 \* 60/);
  assert.match(factoryRoutesSource, /targetMonthlyWage \/ FACTORY_WORK_SECONDS_PER_MONTH/);
  assert.match(factoryDetailSource, /name="wagePerSecond"/);
  assert.match(factoryDetailSource, /name="targetMonthlyWage"/);
  assert.match(factoryDetailSource, /computedWagePerSecond/);
  assert.match(uiMessagesSource, /월 목표 생산수당/);
});

test('invalid business time zones fail during server configuration', () => {
  assert.equal(assertValidBusinessTimeZone('Asia/Seoul'), 'Asia/Seoul');
  assert.equal(assertValidBusinessTimeZone(''), 'Asia/Seoul');
  assert.throws(
    () => assertValidBusinessTimeZone('Invalid/Business_Time_Zone'),
    /Invalid BUSINESS_TIME_ZONE/
  );
});
