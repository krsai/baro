import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [layout, processTime, workDetail, styleProcess, styleMatrix] = await Promise.all([
  readFile(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/utils/processTime.js', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/work/WorkDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/style/styleDetail/StyleProcess.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/style/styleDetail/StyleTimeMatrix.jsx', import.meta.url), 'utf8'),
]);

test('dynamic workspace tab titles are recalculated for the current language', () => {
  assert.match(layout, /withStoredContext\(resolveWorkHistoryTabLabel\('detail'\)\)/);
  assert.match(layout, /withStoredContext\(resolveProductionAnalysisTabLabel\('detail'\)\)/);
  assert.match(layout, /withStoredContext\(resolveAttendanceTabLabel\('detail'\)\)/);
  assert.match(layout, /tabPath\.startsWith\('\/style\/'\)/);
  assert.match(layout, /tabPath\.startsWith\('\/order\/'\)/);
  assert.match(layout, /tabPath\.startsWith\('\/customer\/'\)/);
  assert.match(layout, /tabPath\.startsWith\('\/payroll\/'\)/);
  assert.doesNotMatch(layout, /tabPath\.startsWith\('\/work-history\/'\)[\s\S]{0,180}return tab\.label/);
});

test('seconds use the selected Korean, English, or Vietnamese unit', () => {
  assert.match(processTime, /languageCode === 'vi'\) return ' giây'/);
  assert.match(processTime, /languageCode === 'en'\) return ' sec'/);
  assert.match(workDetail, /formatSeconds\(ctSeconds, languageCode\)/);
  assert.match(styleProcess, /formatSeconds\(totalPT, languageCode\)/);
  assert.match(styleMatrix, /\(giây\)/);
});
