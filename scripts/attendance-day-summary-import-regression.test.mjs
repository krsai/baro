import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from '../frontend/node_modules/xlsx/xlsx.mjs';
import { parseAttendanceImportFile, buildAttendanceImportPlan } from '../frontend/src/pages/App/attendance/attendanceFileImport.js';

const buildXlsxFile = (rows) => {
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  return { arrayBuffer: async () => buffer };
};

test('manual source indicators block the whole file with localized row numbers', async () => {
  for (const [languageCode, source, expected] of [
    ['ko', 'Nhập thủ công', /수동 편집한 자료는 업로드할 수 없습니다/],
    ['en', 'Manual correction', /Manually edited data cannot be uploaded/],
    ['vi', 'Nhật ký sửa thủ công', /Không thể tải dữ liệu đã sửa thủ công/],
  ]) {
    await assert.rejects(parseAttendanceImportFile(buildXlsxFile([
      ['ID Người', 'Tên', 'Thời gian', 'Nguồn dữ liệu'],
      ['01', 'BRVN0003', '2026-09-01 08:00:00', 'Nhật ký quẹt thẻ'],
      ['01', 'BRVN0003', '2026-09-01 17:00:00', source],
    ]), { languageCode }), error => {
      assert.equal(error.code, 'ATTENDANCE_FILE_INTEGRITY');
      assert.deepEqual(error.issues, [{ rowNumber: 3, reasons: ['manual'] }]);
      assert.match(error.message, expected);
      return true;
    });
  }
});

test('manual processing flags also block day summaries, but blank markers and missing punches do not', async () => {
  await assert.rejects(parseAttendanceImportFile(buildXlsxFile([
    ['Tên', 'Ngày', 'Thời Gian Vào', 'Thời Gian Ra', 'Loại xử lý'],
    ['BRVN0003', '2026-09-01', '08:00:00', '-', 'Chỉnh sửa'],
  ])), { code: 'ATTENDANCE_FILE_INTEGRITY' });
  const parsed = await parseAttendanceImportFile(buildXlsxFile([
    ['ID Người', 'Tên', 'Thời gian', 'Nguồn dữ liệu', 'Loại xử lý'],
    ['01', 'BRVN0003', '2026-09-01 08:00:00', 'Nhật ký quẹt thẻ', '-'],
  ]));
  assert.equal(parsed.events.length, 1);
});

test('inconsistent ISO timestamps are blocked instead of silently normalized', async () => {
  await assert.rejects(parseAttendanceImportFile(buildXlsxFile([
    ['ID Người', 'Tên', 'Thời gian'],
    ['01', 'BRVN0003', '2026-09-01 08:00:00'],
    ['01', 'BRVN0003', '2026-09-01 17:00:00'],
    ['01', 'BRVN0003', '2026-09-2  8:00:00'],
  ])), error => {
    assert.deepEqual(error.issues, [{ rowNumber: 4, reasons: ['format'] }]);
    return error.code === 'ATTENDANCE_FILE_INTEGRITY';
  });
});

test('formula timestamps are rejected even if their cached value looks valid', async () => {
  const sheet = XLSX.utils.aoa_to_sheet([
    ['ID Người', 'Tên', 'Thời gian'], ['01', 'BRVN0003', '2026-09-01 08:00:00'],
  ]);
  sheet.C2.f = '"2026-09-01 08:00:00"';
  const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  await assert.rejects(parseAttendanceImportFile({ arrayBuffer: async () => buffer }), error => {
    assert.deepEqual(error.issues, [{ rowNumber: 2, reasons: ['formula'] }]);
    return error.code === 'ATTENDANCE_FILE_INTEGRITY';
  });
});

test('July event report prefers full employee code in name column over unrelated device ID', async () => {
  const parsed = await parseAttendanceImportFile(buildXlsxFile([
    ['Báo Cáo Ghi Chép Gốc'],
    ['ID Người', 'Tên', 'Bộ phận', 'Thời gian'],
    ["'07", 'BRVN0006', 'New Organization/Baro', '2026-07-01 07:48:09'],
    ["'07", 'BRVN0006', 'New Organization/Baro', '2026-07-01 17:00:14'],
  ]));
  const plan = buildAttendanceImportPlan({ events: parsed.events, employees: [
    { id: 6, employeeNo: 'BRVN0006', name: 'Employee Six' },
    { id: 7, employeeNo: 'BRVN0007', name: 'Employee Seven' },
  ] });
  assert.equal(parsed.events[0].workerName, '');
  assert.deepEqual(plan.dailyEntries[0].entries, [{ workerId: 6, clockIn: '07:48', clockOut: '17:00', note: null }]);
});

test('both layouts find employee codes in arbitrary columns and preserve company prefix', async () => {
  for (const rows of [
    [['Thời gian', 'Unrelated heading', 'ID Người'], ['2026-07-01 08:00:00', 'BRVN0006', '07']],
    [['ID Người', 'Thời gian biểu', 'Ngày', 'Thời Gian Ra', 'Unrelated heading', 'Thời Gian Vào'],
      ['07', '(00:00:00-23:59:00)', '2026-07-01', '17:00:00', 'BRVN0006', '08:00:00']],
  ]) {
    const parsed = await parseAttendanceImportFile(buildXlsxFile(rows));
    assert.equal(parsed.events[0].workerCode, 'BRVN0006');
    const people = [{ id: 6, employeeNo: 'BRVN0006' }, { id: 7, employeeNo: 'ABCD0006' }];
    assert.equal(buildAttendanceImportPlan({ events: parsed.events, employees: people }).dailyEntries[0].entries[0].workerId, 6);
    assert.equal(buildAttendanceImportPlan({ events: parsed.events, employees: people.slice(1) }).matchedEventCount, 0);
  }
});

test('ambiguous full employee codes in one row stop the import', async () => {
  await assert.rejects(parseAttendanceImportFile(buildXlsxFile([
    ['ID Người', 'Tên', 'Thời gian'],
    ['BRVN0007', 'BRVN0006', '2026-07-01 08:00:00'],
  ])), { code: 'ATTENDANCE_EMPLOYEE_CONFLICT' });
});

test('retired office employee imports April and employment boundary dates, excluding days outside employment', async () => {
  const dates = ['2025-10-23', '2025-10-24', '2026-04-08', '2026-06-18', '2026-06-19'];
  for (const summary of [false, true]) {
    const rows = summary
      ? [['Tên', 'Ngày', 'Thời Gian Vào', 'Thời Gian Ra'], ...dates.map(d => ['BRVN0002', d, '07:59:00', '17:13:00'])]
      : [['ID Người', 'Tên', 'Thời gian'], ...dates.flatMap(d => [['01', 'BRVN0002', `${d} 07:59:00`], ['01', 'BRVN0002', `${d} 17:13:00`]])];
    const parsed = await parseAttendanceImportFile(buildXlsxFile(rows));
    const plan = buildAttendanceImportPlan({ events: parsed.events, employees: [{
      id: 2, employeeNo: 'BRVN0002', orgRole: 'OPERATOR', status: 'TERMINATED',
      joinedAt: '2025-10-24T00:00:00.000Z', leftAt: '2026-06-18T00:00:00.000Z',
    }] });
    assert.deepEqual(plan.dailyEntries.map(d => d.workDate), dates.slice(1, 4));
    assert.equal(plan.matchedEventCount, 6);
    assert.equal(plan.unmatchedReasonCount.outside_employment_period, 4);
  }
});

// 실제 기기가 출력하는 "Báo Cáo Thời Gian Bắt đầu/Kết Thúc Công Việc" 양식.
// 이 기기는 별도 사번 열을 지원하지 않아 "Tên"(이름) 열에 사번을 직접 적는다.
// "Thời gian biểu"는 근무 시간대 고정값("(00:00:00-23:59:00)")이며 실제
// 펀치 시각이 아니므로 시각 열로 오인되면 안 된다.
const daySummaryRows = (dataRows) => [
  [],
  ['Báo Cáo Thời Gian Bắt đầu/Kết Thúc Công Việc'],
  ['2026-05-01 00:00:00 - 2026-05-31 23:59:59'],
  ['Bộ phận', 'Tên', 'Ngày', 'Ca làm việc', 'Thời gian biểu', 'Thời Gian Vào', 'Thời Gian Ra'],
  ...dataRows,
];

test('day-summary shape: reads separate clock-in/clock-out columns and ignores the fixed shift-schedule column', async () => {
  const file = buildXlsxFile(daySummaryRows([
    ['New Organization/Baro', 'BRVN0003', '2026-05-01', 'ca linh hoat', '(00:00:00-23:59:00)', '-', '-'],
    ['New Organization/Baro', 'BRVN0003', '2026-05-04', 'ca linh hoat', '(00:00:00-23:59:00)', '07:37:40', '17:05:12'],
    ['New Organization/Baro', 'BRVN0003', '2026-05-23', 'ca linh hoat', '(00:00:00-23:59:00)', '08:34:29', '-'],
    ['New Organization/Baro', 'BRVN0003', '2026-05-24', 'ca linh hoat', '(00:00:00-23:59:00)', '-', '17:12:00'],
  ]));

  const parsed = await parseAttendanceImportFile(file);
  assert.equal(parsed.skippedInvalidTimeCount, 0);
  assert.equal(parsed.events.length, 4); // both-missing row (05-01) contributes no events

  const plan = buildAttendanceImportPlan({
    events: parsed.events,
    employees: [{ id: 999, employeeNo: 'BRVN0003', name: 'Trinh Thi Nga' }],
    languageCode: 'ko',
  });
  assert.equal(plan.matchedEventCount, 4);
  assert.equal(plan.unmatchedEventCount, 0);
  assert.equal(plan.dailyEntries.length, 3);

  const byDate = Object.fromEntries(plan.dailyEntries.map((d) => [d.workDate, d.entries[0]]));
  assert.deepEqual(byDate['2026-05-04'], { workerId: 999, clockIn: '07:37', clockOut: '17:05', note: null });
  assert.equal(byDate['2026-05-23'].clockIn, '08:34');
  assert.equal(byDate['2026-05-23'].clockOut, '17:00');
  assert.match(byDate['2026-05-23'].note, /퇴근 기록 없음/);
  assert.equal(byDate['2026-05-24'].clockIn, '08:00');
  assert.equal(byDate['2026-05-24'].clockOut, '17:12');
  assert.match(byDate['2026-05-24'].note, /출근 기록 없음/);
});

test('day-summary shape: no separate ID column means the name-column value is treated as the employee code, not a name', async () => {
  const file = buildXlsxFile(daySummaryRows([
    ['New Organization/Baro', 'BRVN0003', '2026-05-04', 'ca linh hoat', '(00:00:00-23:59:00)', '07:00:00', '17:00:00'],
  ]));
  const parsed = await parseAttendanceImportFile(file);
  assert.equal(parsed.events[0].workerCode, 'BRVN0003');
  assert.equal(parsed.events[0].workerName, '');

  // 코드가 다른 직원의 사번과 일치하지 않으면 이름 매칭으로 대신하지 않고 미매칭 처리한다.
  const plan = buildAttendanceImportPlan({
    events: parsed.events,
    employees: [{ id: 1, employeeNo: 'BRVN9999', name: 'BRVN0003' }],
    languageCode: 'ko',
  });
  assert.equal(plan.matchedEventCount, 0);
  assert.equal(plan.unmatchedReasonCount.unmatched_worker, 2);
});

test('day-summary shape: rows with both clock-in and clock-out blank contribute no events', async () => {
  const file = buildXlsxFile(daySummaryRows([
    ['New Organization/Baro', 'BRVN0003', '2026-05-01', 'ca linh hoat', '(00:00:00-23:59:00)', '-', '-'],
    ['New Organization/Baro', 'BRVN0003', '2026-05-02', 'ca linh hoat', '(00:00:00-23:59:00)', '', ''],
  ]));
  const parsed = await parseAttendanceImportFile(file);
  assert.equal(parsed.events.length, 0);
  assert.equal(parsed.skippedInvalidTimeCount, 0);
});

test('event shape (single timestamp column) still works unchanged alongside day-summary support', async () => {
  const file = buildXlsxFile([
    ['ID Người', 'Tên', 'Bộ phận', 'Thời gian'],
    ['01', 'Trinh Thi Nga', 'New Organization/Baro', '2026-06-01 07:35:54'],
    ['01', 'Trinh Thi Nga', 'New Organization/Baro', '2026-06-01 17:10:00'],
  ]);
  const parsed = await parseAttendanceImportFile(file);
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.events[0].workerCode, '01');
  assert.equal(parsed.events[0].punchType, undefined);
});
