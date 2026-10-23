import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const monthSelector = read('frontend/src/components/MonthSelector.jsx');

test('global month selector owns the preferred month input and stacked shift controls', () => {
  assert.match(monthSelector, /type="month"/);
  assert.match(monthSelector, />\s*M\+\s*<\/Button>/);
  assert.match(monthSelector, />\s*M-\s*<\/Button>/);
  assert.match(monthSelector, /min: minMonth \|\| undefined/);
  assert.match(monthSelector, /max: maxMonth \|\| undefined/);
});

test('query and settlement screens reuse the global date range selector', () => {
  const screens = [
    'frontend/src/pages/App/attendance/AttendanceList.jsx',
    'frontend/src/pages/App/assign/AssignBoard.jsx',
    'frontend/src/pages/App/ShipmentReview.jsx',
    'frontend/src/pages/App/work/WorkList.jsx',
    'frontend/src/pages/App/work/WorkMonthlyBoard.jsx',
  ];

  screens.forEach((screen) => {
    const source = read(screen);
    assert.match(source, /import DateRangeSelector from/);
    assert.match(source, /<DateRangeSelector/);
    assert.doesNotMatch(source, /type="month"/);
  });
});

test('work history sends the independently selected start and end dates', () => {
  const workList = read('frontend/src/pages/App/work/WorkList.jsx');
  assert.match(workList, /onStartChange=\{changeFilterDate\(setDateFilterStart\)\}/);
  assert.match(workList, /onEndChange=\{changeFilterDate\(setDateFilterEnd\)\}/);
  assert.match(workList, /dateFrom,/);assert.match(workList, /dateTo,/);
  assert.doesNotMatch(workList, /handleFilterMonthChange/);
});
