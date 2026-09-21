import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { isAttendanceEmployeeVisibleOnDate } from '../frontend/src/pages/App/attendance/attendanceEmployment.js';

const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const source = readFileSync('backend/src/index.ts', 'utf8');
const start = source.indexOf('app.put("/attendance-entries"');
const code = ts.transpileModule(source.slice(start, source.indexOf('app.get("/work-logs"', start)), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const office = { id: 2, orgRole: 'OPERATOR', status: 'TERMINATED', joinedAt: '2025-10-24', leftAt: '2026-06-18' };

async function save(workDate, employee = office) {
  let handler, status = 200, writes = [];
  const tx = { attendanceEntry: {
    upsert: async ({ create }) => { writes.push(create); return create; },
    findMany: async () => writes,
  } };
  const dependencies = {
    app: { put: (_path, fn) => { handler = fn; } },
    requireOrgRole: async () => ({ organization: { id: 1 } }),
    ORG_MANAGEMENT_ROLES: ['ADMIN'], BUSINESS_TIME_ZONE: 'Asia/Ho_Chi_Minh',
    prisma: {
      factory: { findFirst: async () => ({ id: 3 }) },
      employee: { findMany: async ({ where, select }) => {
        assert.deepEqual(where, { orgId: 1, factoryId: 3, id: { in: [2] } });
        assert.equal(select.joinedAt, true);
        return employee ? [employee] : [];
      } },
      $transaction: async fn => fn(tx),
    },
    normalizeDateKey: value => value,
    toDateKeyInTimeZone: value => value || '',
    toPositiveIntOrNull: Number,
    toAttendanceEntryResponse: value => value,
    normalizeAttendanceEntryPayloadList: rows => ({
      rows, invalidWorkerEntryIndex: -1, invalidClockInEntryIndex: -1,
      invalidClockOutEntryIndex: -1, duplicateWorkerId: null,
    }),
  };
  new Function(...Object.keys(dependencies), code)(...Object.values(dependencies));
  const res = { status: value => { status = value; return res; }, json: value => value };
  await handler({ body: { factoryId: 3, workDate, entries: [{ workerId: 2, clockIn: '08:00', clockOut: '17:00' }] } }, res);
  return { status, writes };
}

test('attendance API persists retired office staff during employment including both boundaries', async () => {
  for (const date of ['2025-10-24', '2026-04-08', '2026-06-18']) {
    assert.equal(isAttendanceEmployeeVisibleOnDate(office, date), true);
    const result = await save(date);
    assert.equal(result.status, 200);
    assert.equal(result.writes.length, 1);
    assert.equal(result.writes[0].workerId, 2);
  }
});

test('attendance API rejects dates outside employment and employees outside the authorized factory without writes', async () => {
  for (const [date, employee] of [
    ['2025-10-23', office], ['2026-06-19', office],
    ['2026-06-19', { ...office, status: 'ACTIVE' }],
    ['2026-04-08', { ...office, leftAt: null }],
    ['2026-04-08', { ...office, status: 'PENDING' }], ['2026-04-08', null],
  ]) {
    assert.equal(isAttendanceEmployeeVisibleOnDate(employee, date), false);
    const result = await save(date, employee);
    assert.equal(result.status, 400);
    assert.equal(result.writes.length, 0);
  }
});

test('attendance screens load office and retired staff and import errors use a dialog', () => {
  for (const file of ['AttendanceList.jsx', 'AttendanceBoard.jsx']) {
    const source = readFileSync(`frontend/src/pages/App/attendance/${file}`, 'utf8');
    assert.doesNotMatch(source, /membershipRole: 'WORKER'/);
    assert.match(source, /import \{ isAttendanceEmployeeVisibleOnDate \} from/);
  }
  const source = readFileSync('frontend/src/pages/App/attendance/AttendanceList.jsx', 'utf8');
  const handlers = source.slice(source.indexOf('  const handleImportFile ='), source.indexOf('\n  return (', source.indexOf('  const handleImportFile =')));
  assert.doesNotMatch(handlers, /window.confirm|showNotification\(/);
  assert.match(source, /<Dialog open=\{Boolean\(importError\)\}/);
});
