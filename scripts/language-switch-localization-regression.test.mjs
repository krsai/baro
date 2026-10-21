import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {resolvePageNaming} from '../frontend/src/utils/pageNaming.mjs';

const [layout, processTime, workDetail, styleProcess, styleMatrix] = await Promise.all([
  readFile(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/utils/processTime.js', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/work/WorkDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/style/styleDetail/StyleProcess.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/style/styleDetail/StyleTimeMatrix.jsx', import.meta.url), 'utf8'),
]);

test('dynamic workspace tab titles are recalculated for the current language', () => {
  for(const path of ['/work-history/1','/production-analysis/2026-10/1/2','/attendance/1/2026-10-21','/style/1','/order/1','/customer/1','/payroll/1']) {
    const names=['ko','en','vi'].map(lang=>resolvePageNaming(path,lang,key=>`${lang}:${key}`).title);
    assert.equal(new Set(names).size,3);
  }
  assert.match(layout, /tab => resolveTabLabel\(tab\?\.path \|\| tab\?\.id/);
});

test('seconds use the selected Korean, English, or Vietnamese unit', () => {
  assert.match(processTime, /languageCode === 'vi'\) return ' giây'/);
  assert.match(processTime, /languageCode === 'en'\) return ' sec'/);
  assert.match(workDetail, /formatSeconds\(ctSeconds, languageCode\)/);
  assert.match(styleProcess, /formatSeconds\(totalPT, languageCode\)/);
  assert.match(styleMatrix, /\(giây\)/);
});
