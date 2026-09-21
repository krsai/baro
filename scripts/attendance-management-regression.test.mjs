import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import dayjs from '../frontend/node_modules/dayjs/dayjs.min.js';
import { buildAttendanceImportPlan } from '../frontend/src/pages/App/attendance/attendanceFileImport.js';
import { isAttendanceEmployeeVisibleOnDate, isFormerEmployee } from '../frontend/src/pages/App/attendance/attendanceEmployment.js';

const migration = readFileSync('backend/prisma/migrations/20260921090000_attendance_management_exclusion/migration.sql', 'utf8');

test('payroll readiness requires attendance only from managed employees, including an all-exempt office', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('../backend/node_modules/typescript');
  const source = readFileSync('backend/src/payroll/payroll.service.ts', 'utf8');
  const start = source.indexOf('export const getPayrollMonthReadiness =');
  const code = ts.transpileModule(source.slice(start, source.indexOf('const buildIntegratedPayrollEmployees', start)).replace('export const', 'const'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exceptions = [{ id: 2, factoryId: 1, alwaysFullAttendance: true }, { id: 3, factoryId: 1, payrollExcluded: true }];
  for (const includeNormal of [true, false]) {
    const employees = includeNormal ? [{ id: 1, factoryId: 1 }, ...exceptions] : exceptions;
    const factory = { id: 1, employees };
    const deps = {
      prisma: {
        factory: { findMany: async () => [factory] },
        employee: { findMany: async () => employees },
        organizationHoliday: { findMany: async () => [] },
        attendanceEntry: { findMany: async ({ where }) => { assert.equal(where.managementExcluded, false); return includeNormal ? [{ factoryId: 1, workerId: 1, workDate: '2026-04-01' }] : []; } },
        workLog: { findMany: async () => [] }, payrollSnapshot: { findUnique: async () => null },
      },
      assertPayrollMonth: () => {}, toPositiveIntOrNull: Number,
      resolveCurrentPayrollMonthKey: () => '2026-09',
      loadEmployeePayTypePolicies: async () => [],
      employeePayTypePolicyMap: () => new Map([['GENERAL', {}], ['OUTPUT', {}]]),
      EMPLOYEE_PAY_TYPE: { GENERAL: 'GENERAL', OUTPUT: 'OUTPUT' },
      enumerateMonthDateKeys: () => ['2026-04-01', '2026-04-02'],
      isExpectedSalaryWorkDate: () => true,
      getPayrollMonthRange: () => ({}), isPayrollEmployeeRelevantForMonth: employee => !employee.payrollExcluded,
      resolvePayrollEmployeeName: employee => String(employee.id),
      resolveEmployeeEffectivePayType: () => 'GENERAL',
      resolveFactoryManagementStartDateKey: () => '2026-04-01', employeeExpectedOnDate: () => true,
    };
    const readiness = new Function(...Object.keys(deps), code + '; return getPayrollMonthReadiness;')(...Object.values(deps));
    const result = await readiness(1, '2026-04', 1);
    assert.equal(result.attendanceRequiredCount, includeNormal ? 2 : 0);
    assert.equal(result.attendanceRecordedCount, includeNormal ? 1 : 0);
    assert.deepEqual(result.missingPayrollAttendance.map(row => row.workerId), includeNormal ? [1] : []);
    assert.equal(result.ready, !includeNormal);
  }
});

test('existing punches are retained but excluded, and future policy changes synchronize in the same transaction', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE "Employee" (id int primary key, "orgId" int not null, "alwaysFullAttendance" boolean default false, "payrollExcluded" boolean default false);
      CREATE TABLE "AttendanceEntry" (id int primary key, "orgId" int not null, "workerId" int references "Employee"(id), "clockIn" text, "clockOut" text, "updatedAt" timestamp default now());
      INSERT INTO "Employee" VALUES (1, 1, false, false), (2, 1, true, false), (3, 1, false, true), (4, 2, false, false);
      INSERT INTO "AttendanceEntry" (id,"orgId","workerId","clockIn","clockOut") VALUES (1,1,1,'08:00','17:00'),(2,1,2,'07:58','17:12'),(3,1,3,'08:13','18:00'),(4,2,4,'08:00','17:00');
    `);
    const punches = async () => (await db.query('SELECT id, "clockIn", "clockOut" FROM "AttendanceEntry" ORDER BY id')).rows;
    const original = await punches();
    await db.exec(migration);
    const state = async () => (await db.query('SELECT id, "managementExcluded" FROM "AttendanceEntry" ORDER BY id')).rows;
    assert.deepEqual(await state(), [
      { id: 1, managementExcluded: false }, { id: 2, managementExcluded: true },
      { id: 3, managementExcluded: true }, { id: 4, managementExcluded: false },
    ]);
    await db.exec(migration);
    assert.deepEqual(await punches(), original);
    await db.exec('UPDATE "Employee" SET "alwaysFullAttendance" = true WHERE id = 1');
    assert.equal((await state())[0].managementExcluded, true);
    await db.exec('UPDATE "Employee" SET "alwaysFullAttendance" = false WHERE id = 2');
    assert.equal((await state())[1].managementExcluded, false);
    await db.exec('INSERT INTO "AttendanceEntry" (id,"orgId","workerId","managementExcluded") VALUES (5,1,3,false)');
    assert.equal((await state())[4].managementExcluded, true);
    await db.exec('UPDATE "AttendanceEntry" SET "managementExcluded" = false WHERE id = 3');
    assert.equal((await state())[2].managementExcluded, true);
    await assert.rejects(db.exec('INSERT INTO "AttendanceEntry" (id,"orgId","workerId") VALUES (6,2,1)'), /does not belong/);
    await assert.rejects(db.transaction(async tx => {
      await tx.exec('UPDATE "Employee" SET "payrollExcluded" = false WHERE id = 3');
      throw Error('rollback');
    }), /rollback/);
    assert.equal((await state())[2].managementExcluded, true);
    assert.deepEqual((await punches()).slice(0, 4), original);
  } finally { await db.close(); }
});

test('attendance and payroll exceptions are excluded from both daily staff and file imports, including historical dates', () => {
  for (const flags of [{ alwaysFullAttendance: true }, { payrollExcluded: true }]) {
    const employee = { id: 1, employeeNo: 'BRVN0001', status: 'ACTIVE', joinedAt: '2025-01-01', ...flags };
    assert.equal(isAttendanceEmployeeVisibleOnDate(employee, '2026-04-01'), false);
    const result = buildAttendanceImportPlan({ employees: [employee], events: [{ workerCode: 'BRVN0001', occurredAt: dayjs('2026-04-01 08:00') }] });
    assert.equal(result.dailyEntries.length, 0);
    assert.equal(result.unmatchedDetails[0].reason, 'management_excluded');
    assert.equal(result.unmatchedReasonCount.management_excluded, 1);
  }
  const former = { status: 'TERMINATED', leftAt: '2026-09-04' };
  assert.equal(isFormerEmployee(former, '2026-09-21'), true);
  assert.equal(isAttendanceEmployeeVisibleOnDate(former, '2026-08-15'), true);
  assert.equal(isFormerEmployee({ status: 'ACTIVE', leftAt: '2026-09-04' }, '2026-09-21'), true);
  assert.equal(isFormerEmployee({ status: 'ACTIVE', leftAt: '2026-10-01' }, '2026-09-21'), false);
});

test('shared settings preserve hidden former-employee selections and attendance reads filter unmanaged records', () => {
  const dialog = readFileSync('frontend/src/pages/App/payroll/PayrollSettingsDialog.jsx', 'utf8');
  assert.match(dialog, /showRetired \|\| !isFormerEmployee\(row\)/);
  assert.match(dialog, /Array.from\(attendanceSelected\)/);
  assert.match(dialog, /Array.from\(payrollExcluded\)/);
  const list = readFileSync('frontend/src/pages/App/attendance/AttendanceList.jsx', 'utf8');
  assert.match(list, /<PayrollSettingsDialog/);
  const server = readFileSync('backend/src/index.ts', 'utf8');
  const route = server.slice(server.indexOf('app.get("/attendance-entries"'), server.indexOf('app.get("/work-logs"'));
  assert.match(route, /managementExcluded: false/);
  assert.match(route, /ATTENDANCE_MANAGEMENT_EXCLUDED/);
  const runtime = readFileSync('backend/migration_fix.sql', 'utf8').replace(/\r\n/g, '\n');
  assert.ok(runtime.includes(migration.replace(/\r\n/g, '\n')));
});
