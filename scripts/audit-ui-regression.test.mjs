import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('employee and work list filters use the shared sticky toolbar', async () => {
  const [employee, work] = await Promise.all([
    read('frontend/src/pages/App/employee/EmployeeBoard.jsx'),
    read('frontend/src/pages/App/work/WorkList.jsx'),
  ]);
  assert.match(employee, /toolbar=\{\(\s*<PageToolbar/);
  assert.match(employee, /left=\{<SearchInput/);
  assert.match(work, /<PageToolbar[\s\S]*left=\{<SearchInput/);
  assert.doesNotMatch(work, /import LastUpdaterLabel/);
});

test('QC and process-version screens expose Korean, English and Vietnamese copy', async () => {
  const [qc, versions] = await Promise.all([
    read('frontend/src/pages/App/QcReview.jsx'),
    read('frontend/src/pages/App/style/styleDetail/ProcessVersionManager.jsx'),
  ]);
  for (const source of [qc, versions]) {
    assert.match(source, /\bko:\s*\{/);
    assert.match(source, /\ben:\s*\{/);
    assert.match(source, /\bvi:\s*\{/);
  }
  assert.match(qc, /const \{ languageCode \} = useLanguage\(\)/);
  assert.match(versions, /const copy = COPY\[languageCode\] \|\| COPY\.en/);
  assert.doesNotMatch(qc, /label="(?:공장|상태|검색|검수일|검수 통과 수량)"/);
  assert.doesNotMatch(versions, /<DialogTitle>공정 버전 관리<\/DialogTitle>/);
});

test('QC and capacity actions use theme primitives instead of audit hard-coded colors', async () => {
  const [qc, capacity] = await Promise.all([
    read('frontend/src/pages/App/QcReview.jsx'),
    read('frontend/src/pages/App/assign/components/FactoryMonthCapacityBoard.jsx'),
  ]);
  assert.doesNotMatch(qc, /#0d6efd|#0a58ca/);
  assert.match(capacity, /LABEL_PALETTE/);
  assert.doesNotMatch(capacity, /#15803D|#B45309|#B91C1C|#2563EB/);
});
