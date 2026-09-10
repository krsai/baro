import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const requireFromFrontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const requireFromBackend = createRequire(new URL('../backend/package.json', import.meta.url));
const dayjs = requireFromFrontend('dayjs');
const ts = requireFromBackend('typescript');
const ui = fs.readFileSync(
  new URL('../frontend/src/pages/App/work/WorkList.jsx', import.meta.url),
  'utf8'
);

const scope = vm.createContext({ dayjs });
const source = ui.slice(
  ui.indexOf('const formatWorkLogDateRangeLabel ='),
  ui.indexOf('const resolveAverageCtSecondsPerWorker =')
);
vm.runInContext(
  ts.transpileModule(
    `${source}\nglobalThis.formatWorkLogDateRangeLabel = formatWorkLogDateRangeLabel;`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText,
  scope
);

test('a single-day work log still shows just its one date', () => {
  const log = { workDate: '2026-08-31', coverageStartDate: '2026-08-31', coverageEndDate: '2026-08-31' };
  assert.equal(scope.formatWorkLogDateRangeLabel(log), '2026-08-31');
});

test('a period-covering work log (e.g. a whole-month import row) shows its real start~end range', () => {
  // AGENTS.md "WorkLog Date 규칙": workDate/displayDate is always coverageEndDate,
  // so a month-long import (DATE(START) 2026-08-01 / DATE(END) 2026-08-31) looks
  // identical in the list to a genuine single day on 2026-08-31 unless the range
  // itself is shown - there is no other way to tell them apart from this screen.
  const log = { workDate: '2026-08-31', coverageStartDate: '2026-08-01', coverageEndDate: '2026-08-31' };
  assert.equal(scope.formatWorkLogDateRangeLabel(log), '2026-08-01 ~ 2026-08-31');
});

test('missing or invalid coverage dates fall back to the plain work date instead of throwing', () => {
  assert.equal(
    scope.formatWorkLogDateRangeLabel({ workDate: '2026-08-31' }),
    '2026-08-31'
  );
  assert.equal(
    scope.formatWorkLogDateRangeLabel({ workDate: '2026-08-31', coverageStartDate: 'not-a-date', coverageEndDate: '2026-08-31' }),
    '2026-08-31'
  );
  assert.equal(scope.formatWorkLogDateRangeLabel(null), '-');
});

test('both the mobile card and desktop table rows render the range label, not the raw workDate', () => {
  const cardBlock = ui.slice(ui.indexOf('filteredLogs.map((log) => ('), ui.indexOf('<TableContainer'));
  assert.match(cardBlock, /\{formatWorkLogDateRangeLabel\(log\)\}/);
  assert.doesNotMatch(cardBlock, /\{log\.workDate \|\| '-'\}/);

  const tableBlock = ui.slice(ui.indexOf('<TableContainer'), ui.indexOf('</TableContainer>', ui.indexOf('<TableContainer')));
  assert.match(tableBlock, /\{formatWorkLogDateRangeLabel\(log\)\}/);
  assert.doesNotMatch(tableBlock, /\{log\.workDate \|\| '-'\}/);
});
