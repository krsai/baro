import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { buildWorkLogExportWorkbook, resolveWorkLogExportRange } from '../frontend/src/pages/App/work/workLogExport.js';
const require = createRequire(import.meta.url);
const XLSX = require('../frontend/node_modules/xlsx');

test('monthly workbook opens with every detailed row and preserves numeric values and coverage', () => {
  const record = { workerName: 'Worker A', customerName: 'Buyer', orderNo: '0012', styleCode: 'S01', processCode: 'P01', ctSeconds: 12, quantity: 3 };
  const workbook = buildWorkLogExportWorkbook([
    { workDate: '2026-11-26', factoryName: 'HANOI', records: [record, { ...record, workerName: 'Worker B', effectiveCoverageStartDate: '2026-11-20', effectiveCoverageEndDate: '2026-11-25' }] },
    { coverageStartDate: '2026-10-01', coverageEndDate: '2026-10-31', records: [record] },
  ]);
  const restored = XLSX.read(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
  assert.deepEqual(restored.SheetNames, ['2026-10', '2026-11']);
  const rows = XLSX.utils.sheet_to_json(restored.Sheets['2026-11']);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['Worker / Vendor'], 'Worker A');
  assert.equal(rows[0]['Order#'], '0012');
  assert.equal(rows[0]['Quantity'], 3);
  assert.equal(rows[0]['Total CT (sec)'], 36);
  assert.equal(rows[1]['Start Date'], '2026-11-20');
  assert.equal(rows[1]['End Date'], '2026-11-25');
});

test('export covers complete selected months including leap year February', () => {
  assert.deepEqual(resolveWorkLogExportRange('2028-02-12', '2028-02-15'), { dateFrom: '2028-02-01', dateTo: '2028-02-29' });
  assert.deepEqual(resolveWorkLogExportRange('2026-10-12', '2026-11-15'), { dateFrom: '2026-10-01', dateTo: '2026-11-30' });
});

test('missing detail data fails instead of exporting an incomplete report', () => {
  assert.throws(() => buildWorkLogExportWorkbook([{ workDate: '2026-11-01' }]), /WORK_LOG_DETAILS_MISSING/);
});
