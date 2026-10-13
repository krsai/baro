import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import dayjs from '../frontend/node_modules/dayjs/dayjs.min.js';
import { isAttendanceEmployeeVisibleOnDate, resolvePayrollManagement as frontendPolicy } from '../frontend/src/pages/App/attendance/attendanceEmployment.js';
import { buildAttendanceImportPlan } from '../frontend/src/pages/App/attendance/attendanceFileImport.js';
const require = createRequire(import.meta.url);
const { resolvePayrollManagement, payrollManagementInclude } = require('../backend/dist/employees/payrollManagement.js');
const migration = readFileSync('backend/prisma/migrations/20261013150000_payroll_management_versions/migration.sql', 'utf8');

test('attendance exemption still pays salary; future payroll exclusion preserves earlier month and date-based imports', () => {
  const employee = { id: 1, employeeNo: 'BRVN0024', name: 'Uyen', orgRole: 'WORKER', status: 'ACTIVE', alwaysFullAttendance: true, payrollExcluded: false,
    payrollManagementVersions: [{ id: 1, effectiveMonth: '2026-11', alwaysFullAttendance: false, payrollExcluded: true }, { id: 2, effectiveMonth: '2027-01', alwaysFullAttendance: false, payrollExcluded: false }] };
  for (const resolver of [resolvePayrollManagement, frontendPolicy]) {
    assert.equal(resolver(employee, '2026-10').alwaysFullAttendance, true);
    assert.equal(resolver(employee, '2026-10').payrollExcluded, false);
    assert.equal(resolver(employee, '2026-11').payrollExcluded, true);
    assert.equal(resolver(employee, '2027-01').payrollExcluded, false);
    assert.equal(resolver(employee, '2026-08').orgRole, 'WORKER');
  }
  const { resolveSalaryAttendanceParameters } = require('../backend/dist/employees/salaryAttendanceParameters.js');
  const { evaluateSalaryFormula } = require('../backend/dist/employees/salaryFormula.js');
  const attendance = resolveSalaryAttendanceParameters({ month: '2026-10', payType: 'GENERAL', holidayDateKeys: [], attendanceEntries: [], alwaysFullAttendance: resolvePayrollManagement(employee,'2026-10').alwaysFullAttendance });
  assert.ok(attendance.SCHEDULED_WORKDAYS > 0);
  assert.equal(attendance.ACTUAL_WORKDAYS, attendance.SCHEDULED_WORKDAYS);
  assert.equal(evaluateSalaryFormula(['GRADE_RATE','×','ACTUAL_WORKDAYS','÷','SCHEDULED_WORKDAYS'],{...attendance,GRADE_RATE:10000000}),10000000);
  assert.equal(isAttendanceEmployeeVisibleOnDate(employee, '2026-11-03'), false);
  assert.equal(isAttendanceEmployeeVisibleOnDate(employee, '2027-01-04'), true);
  const plan = buildAttendanceImportPlan({ employees: [employee], events: [
    { workerCode: 'BRVN0024', occurredAt: dayjs('2026-11-03 08:00') },
    { workerCode: 'BRVN0024', occurredAt: dayjs('2027-01-04 08:00') },
  ] });
  assert.equal(plan.unmatchedReasonCount.management_excluded, 1);
});

test('effective-month SQL preserves past punches and locked payroll, supports correction history and replay', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Employee" (id int primary key, "orgId" int not null, "alwaysFullAttendance" boolean default false, "payrollExcluded" boolean default false, UNIQUE(id,"orgId"));
      CREATE TABLE "AttendanceEntry" (id int primary key,"orgId" int,"workerId" int,"workDate" text,"managementExcluded" boolean default false,"clockIn" text,"clockOut" text,"updatedAt" timestamp default '2026-10-01');
      CREATE TABLE "PayrollSnapshot" (id int primary key,"orgId" int,month text,"isProvisional" boolean,"recalculationRequested" boolean default false,data jsonb);
      INSERT INTO "Employee" VALUES(1,1,false,false),(2,2,false,false);
      INSERT INTO "AttendanceEntry"(id,"orgId","workerId","workDate","clockIn","clockOut") VALUES(1,1,1,'2026-10-01','08:00','17:00'),(2,1,1,'2026-11-02','08:00','17:00'),(3,1,1,'2027-01-04','08:00','17:00');
      INSERT INTO "PayrollSnapshot"(id,"orgId",month,"isProvisional",data) VALUES(1,1,'2026-10',false,'{"salary":100}'),(2,1,'2026-11',true,'{"salary":100}');`);
    await db.exec(readFileSync('backend/prisma/migrations/20260921090000_attendance_management_exclusion/migration.sql','utf8'));
    await db.exec(migration);
    const october = (await db.query('SELECT * FROM "AttendanceEntry" WHERE id=1')).rows;
    await db.exec(`INSERT INTO "EmployeePayrollManagementVersion"("orgId","employeeId","effectiveMonth","alwaysFullAttendance","payrollExcluded") VALUES(1,1,'2027-01',false,false),(1,1,'2026-11',false,true)`);
    assert.deepEqual((await db.query('SELECT * FROM "AttendanceEntry" WHERE id=1')).rows, october);
    assert.deepEqual((await db.query('SELECT id,"managementExcluded" FROM "AttendanceEntry" ORDER BY id')).rows,
      [{id:1,managementExcluded:false},{id:2,managementExcluded:true},{id:3,managementExcluded:false}]);
    const snapshots = (await db.query('SELECT id,"recalculationRequested",data FROM "PayrollSnapshot" ORDER BY id')).rows;
    assert.deepEqual(snapshots,[{id:1,recalculationRequested:false,data:{salary:100}},{id:2,recalculationRequested:true,data:{salary:100}}]);
    const beforeReplay = (await db.query('SELECT * FROM "AttendanceEntry" ORDER BY id')).rows;
    const runtime = readFileSync('backend/migration_fix.sql','utf8');
    const start = runtime.indexOf('-- Preserve punches;');
    await db.exec(runtime.slice(start,runtime.indexOf('-- Step 0r:',start)));
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM "AttendanceEntry" ORDER BY id')).rows,beforeReplay);
    await db.exec(`INSERT INTO "EmployeePayrollManagementVersion"("orgId","employeeId","effectiveMonth") VALUES(1,1,'2026-11')`);
    assert.equal((await db.query('SELECT "managementExcluded" FROM "AttendanceEntry" WHERE id=2')).rows[0].managementExcluded,false);
    assert.equal((await db.query('SELECT count(*)::int n FROM "EmployeePayrollManagementVersion"')).rows[0].n,3);
    await assert.rejects(db.exec(`UPDATE "EmployeePayrollManagementVersion" SET "payrollExcluded"=true WHERE id=1`),/cannot be changed/);
    await assert.rejects(db.exec(`DELETE FROM "EmployeePayrollManagementVersion" WHERE id=1`),/cannot be deleted/);
    await assert.rejects(db.exec(`UPDATE "Employee" SET "payrollExcluded"=true WHERE id=1`),/effective-month/);
    await assert.rejects(db.exec(`INSERT INTO "EmployeePayrollManagementVersion"("orgId","employeeId","effectiveMonth") VALUES(2,1,'2026-12')`),/foreign key/);
    await db.exec(migration);
    assert.deepEqual((await db.query('SELECT * FROM "AttendanceEntry" WHERE id=1')).rows,october);
    assert.deepEqual((await db.query('SELECT id,"recalculationRequested",data FROM "PayrollSnapshot" ORDER BY id')).rows,snapshots);
  } finally { await db.close(); }
});

test('settings append changed employee versions, reject stale/cross-org input and never update baseline or memberships', async () => {
  const ts = require('../backend/node_modules/typescript');
  const source = readFileSync('backend/src/payroll/payroll.service.ts','utf8');
  const start = source.indexOf('export const updatePayrollSettings =');
  const code = ts.transpileModule(source.slice(start,source.indexOf('export const getPayrollByMonth =',start)).replace('export const','const'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const writes=[];
  const employees=[{id:1,orgId:1,factoryId:1,alwaysFullAttendance:true,payrollExcluded:false,payrollManagementVersions:[]},{id:2,orgId:1,factoryId:1,alwaysFullAttendance:false,payrollExcluded:false,payrollManagementVersions:[]}];
  let locked=false;
  const deps={assertPayrollMonth:month=>{if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('invalid month');},toPositiveIntOrNull:value=>Number.isSafeInteger(value)&&value>0?value:null,
    createHttpError:(status,message)=>Object.assign(Error(message),{status}),resolvePayrollManagement,payrollManagementInclude,getPayrollSettings:async()=>({}),
    prisma:{$transaction:async fn=>fn({$queryRaw:async()=>[],employee:{findMany:async()=>employees},payrollSnapshot:{findFirst:async()=>locked?{id:1}:null},employeePayrollManagementVersion:{create:async({data})=>writes.push(data)}})}};
  const update = new Function(...Object.keys(deps),code+';return updatePayrollSettings;')(...Object.values(deps));
  await update(1,[],[1],'2026-11','1:;2:');
  assert.deepEqual(writes,[{orgId:1,employeeId:1,effectiveMonth:'2026-11',alwaysFullAttendance:false,payrollExcluded:true}]);
  assert.equal(employees[0].alwaysFullAttendance,true);
  await assert.rejects(update(1,[],[1],'2026-11','outdated'),/Reload/);
  await assert.rejects(update(1,[],[999],'2026-11','1:;2:'),/does not belong/);
  locked=true;
  await assert.rejects(update(1,[],[1],'2026-11','1:;2:'),/Unlock/);
});
