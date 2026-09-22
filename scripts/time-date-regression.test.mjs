import test from 'node:test';
import { loadSourceBindings } from './helpers/source-bindings.mjs';
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
const backendSource = fs.readFileSync('backend/src/index.ts', 'utf8');
const quantitySettlementServiceSource = fs.readFileSync(
  'backend/src/quantity-settlement/quantitySettlement.service.ts',
  'utf8'
);
const backendPackage = JSON.parse(fs.readFileSync('backend/package.json', 'utf8'));
const payrollBoardSource = fs.readFileSync(
  'frontend/src/pages/App/payroll/PayrollBoard.jsx',
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

test('production allowance board uses the server business calendar instead of browser local month', () => {
  assert.match(payrollControllerSource, /resolveLatestCompletedPayrollMonthKey\(\{ timeZone \}\)/);
  assert.match(payrollControllerSource, /process\.env\.BUSINESS_TIME_ZONE \|\| "Asia\/Seoul"/);
  assert.match(payrollBoardSource, /requestJSON\('\/payroll\/calendar'/);
  assert.match(payrollBoardSource, /calendarPayload\?\.latestCompletedMonthKey/);
  assert.match(payrollBoardSource, /const \[selectedMonth, setSelectedMonth\] = useState\(''\)/);
  assert.match(payrollBoardSource, /month <= latestCompletedMonth/);
  assert.match(payrollBoardSource, /<MenuItem value="">/);
  assert.match(payrollBoardSource, /renderValue: \(value\) => value \|\| allMonthsLabel/);
});

test('payroll save rejects current month, missing factory and locked snapshots before calculation', async () => {
  for (const scenario of ['future', 'missing-factory', 'locked', 'incomplete']) {
    let calculated = false;
    const { savePayrollSnapshot } = loadSourceBindings('backend/src/payroll/payroll.service.ts', ['savePayrollSnapshot'], {
      assertPayrollMonth: () => {},
      toPositiveIntOrNull: value => Number(value) > 0 ? Number(value) : null,
      createHttpError: (status, message) => Object.assign(new Error(message), { status }),
      resolveCurrentPayrollMonthKey: () => '2026-09',
      prisma: { payrollSnapshot: { findUnique: async ({ where }) => {
        assert.deepEqual(where, { orgId_month_factoryId: { orgId: 1, month: '2026-08', factoryId: 2 } });
        return scenario === 'locked' ? { isProvisional: false } : null;
      } } },
      getPayrollMonthReadiness: async (orgId, month, factoryId) => {
        assert.deepEqual([orgId, month, factoryId], [1, '2026-08', 2]);
        return { ready: false, invalidPayrollAttendance: [] };
      },
      getPayrollByMonth: async () => { calculated = true; throw new Error('unexpected calculation'); },
    });
    const expected = { future: /previous month/, 'missing-factory': /factoryId is required/, locked: /unlock payroll/, incomplete: /attendance and work records are incomplete/ };
    await assert.rejects(savePayrollSnapshot({ orgId: 1, month: scenario === 'future' ? '2026-09' : '2026-08', factoryId: scenario === 'missing-factory' ? null : 2, savedBy: 'test' }), expected[scenario]);
    assert.equal(calculated, false);
  }
});

test('production startup applies safe database schema synchronization before serving requests', () => {
  assert.match(backendPackage.scripts.start, /prisma:apply:payroll-provisional/);
  assert.doesNotMatch(backendPackage.scripts.start, /prisma:apply:migration-fix/);
  assert.doesNotMatch(backendPackage.scripts.start, /prisma:deploy:safe/);
});

test('production allowance confirmation neither depends on shipment settlement nor locks production', () => {
  assert.doesNotMatch(payrollServiceSource, /assertQuantitySettlementReadyForPayroll/);
  assert.doesNotMatch(payrollServiceSource, /syncAssignmentPlanPayrollFinalization/);
  assert.doesNotMatch(payrollServiceSource, /ASSIGNMENT_STATUS_PRODUCTION_COMPLETED/);
  assert.doesNotMatch(payrollEntrySource, /fetchQuantitySettlement|settlementSummary|quantity settlement incomplete/);
  assert.match(backendSource, /PayrollSnapshot is currently a production-allowance-only snapshot/);
  assert.doesNotMatch(quantitySettlementServiceSource, /quantity settlement locked by payroll/);
});

test('payroll board calculates and opens details with explicit factory scope', () => {
  assert.match(payrollBoardSource, /rowKey\(row\.month, row\.factory\.id\)/);
  assert.match(payrollBoardSource, /factoryId: row\.factory\.id/);
  assert.match(payrollBoardSource, /navigateToPath\(`\/payroll\/\$\{month\}\?factoryId=\$\{factory\.id\}/);
  assert.match(payrollBoardSource, /readinessByKey\[key\]/);
  assert.match(payrollBoardSource, /row\.snapshot\.isProvisional === true/);
  assert.match(payrollBoardSource, /monthReadiness\?\.needsRecalculation === true/);
});

test('integrated payroll uses the salary system while retaining recorded production CT', () => {
  assert.match(payrollServiceSource, /ctSeconds \* quantity \* wagePerSecond/);
  assert.match(payrollServiceSource, /buildIntegratedPayrollEmployees\(orgId, month, employees, factoryId\)/);
  assert.match(payrollServiceSource, /preserveManualProductionRate/);
  assert.doesNotMatch(payrollServiceSource, /Number\(workLog\.factoryWagePerSecond\)/);
});

test('factory monthly target converts to a per-second rate and preserves explicit fallback', () => {
  const { resolveFactoryWageFields } = loadSourceBindings('backend/src/factories/factory.routes.ts', ['FACTORY_WORK_SECONDS_PER_MONTH', 'roundToScale', 'resolveFactoryWageFields'], {
    toNumberOrNull: value => value == null || value === '' ? null : Number(value),
  });
  assert.deepEqual(resolveFactoryWageFields(7488000, 999), { targetMonthlyWage: 7488000, wagePerSecond: 10 });
  assert.deepEqual(resolveFactoryWageFields(null, 7.5), { targetMonthlyWage: null, wagePerSecond: 7.5 });
});

test('payroll date enumeration and employment boundaries preserve leap days and leave', () => {
  const { enumerateMonthDateKeys, employeeExpectedOnDate } = loadSourceBindings('backend/src/payroll/payroll.service.ts', ['toDateKey', 'enumerateMonthDateKeys', 'employeeExpectedOnDate'], {
    getPayrollMonthRange: () => ({ start: new Date('2024-02-01Z'), endExclusive: new Date('2024-03-01Z') }),
  });
  const dates = enumerateMonthDateKeys('2024-02');
  assert.equal(dates.length, 29);
  assert.equal(dates.at(-1), '2024-02-29');
  const employee = { joinedAt: '2024-02-10', leftAt: '2024-02-20', leaveStartAt: '2024-02-15', leaveEndAt: '2024-02-16' };
  for (const [day, expected] of [['09', false], ['10', true], ['15', false], ['16', false], ['17', true], ['20', true], ['21', false]]) {
    assert.equal(employeeExpectedOnDate(employee, '2024-02-' + day), expected);
  }
});

test('invalid business time zones fail during server configuration', () => {
  assert.equal(assertValidBusinessTimeZone('Asia/Seoul'), 'Asia/Seoul');
  assert.equal(assertValidBusinessTimeZone(''), 'Asia/Seoul');
  assert.throws(
    () => assertValidBusinessTimeZone('Invalid/Business_Time_Zone'),
    /Invalid BUSINESS_TIME_ZONE/
  );
});
