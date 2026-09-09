import test from 'node:test';
import assert from 'node:assert/strict';
import dayjs from '../frontend/node_modules/dayjs/dayjs.min.js';
import { buildAttendanceImportPlan, mergeImportedAttendanceEntries } from '../frontend/src/pages/App/attendance/attendanceFileImport.js';

const mai = { id: 100, employeeNo: '0023', name: 'Lê Phương Mai' };
const other = { id: 23, employeeNo: '0003', name: 'Trịnh Thị Ngà' };
const event = (time, overrides = {}) => ({ workerCode: '0023', workerName: 'Le Phuong Mai', occurredAt: dayjs(`2026-08-01 ${time}`), ...overrides });
const plan = (events, employees = [mai, other]) => buildAttendanceImportPlan({ events, employees });
const row = (events) => plan(events).dailyEntries[0].entries[0];

test('matches employee number instead of a colliding database ID and preserves two punches', () => {
  assert.deepEqual(row([event('08:00:38'), event('17:00:38')]), { workerId: 100, clockIn: '08:00', clockOut: '17:00', note: null });
  for (const workerCode of ["'0023", '23', 'EMP-0023']) assert.equal(row([event('08:00:38', { workerCode })]).workerId, 100);
});

test('rejects conflicting identity or duplicate employee numbers before producing a plan', () => {
  assert.throws(() => plan([event('08:00:00'), event('17:00:00', { workerName: 'Trinh Thi Nga' })]), { code: 'ATTENDANCE_EMPLOYEE_CONFLICT' });
  assert.throws(() => plan([event('08:00:00')], [mai, { ...other, employeeNo: '23' }]), { code: 'ATTENDANCE_EMPLOYEE_CONFLICT' });
  assert.equal(plan([event('08:00:00', { workerCode: '9999' })]).matchedEventCount, 0);
});

test('supports accent-free and abbreviated Vietnamese names, with name-only ambiguity rejected', () => {
  const people = [
    ['Đỗ Thị Thắm', 'Do Thi Tham'], ['Chu Thị Diệp', 'Chu Thi Diep'],
    ['Trương Thị Kim Viên', 'Truong thi kim vien'], ['Nguyễn Thị Thanh Hương', 'Nguyen Thi T Huong'],
  ];
  for (const [name, workerName] of people) {
    assert.equal(plan([event('08:08:49', { workerName })], [{ ...mai, name }]).matchedEventCount, 1);
  }
  assert.equal(plan([event('08:00:00', { workerCode: '' })]).matchedEventCount, 1);
  assert.equal(plan([event('08:00:00', { workerCode: '' })], [mai, { ...mai, id: 101 }]).unmatchedReasonCount.ambiguous_name, 1);
});

test('fills missing checkout before noon and missing checkin from noon, naming the employee', () => {
  for (const [time, clockIn, clockOut] of [['08:08:49', '08:08', '17:00'], ['11:59:59', '11:59', '17:00'], ['12:00:00', '08:00', '12:00'], ['17:23:10', '08:00', '17:23']]) {
    const result = row([event(time)]);
    assert.equal(result.clockIn, clockIn);
    assert.equal(result.clockOut, clockOut);
    assert.match(result.note, /Lê Phương Mai.*자동 생성/);
  }
  assert.equal(row([event('08:08:49'), event('08:08:49')]).clockOut, '17:00');
  assert.equal(row([event('08:08:49'), event('08:09:49')]).note, null);
});

test('merging persists named generated notes, preserves manual notes and avoids repeated notes', () => {
  const imported = row([event('08:08:49')]);
  const existing = [{ workerId: mai.id, note: '기존 메모' }];
  const merged = mergeImportedAttendanceEntries(existing, [imported]);
  assert.equal(merged[0].note, `기존 메모\n${imported.note}`);
  assert.deepEqual(mergeImportedAttendanceEntries(merged, [imported]), merged);
});
