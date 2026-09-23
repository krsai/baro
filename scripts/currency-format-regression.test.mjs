import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatCurrency } from '../frontend/src/utils/currencyFormat.js';

test('shared currency formatter applies currency precision and locale', () => {
  assert.match(formatCurrency(1234567.8, { currencyCode: 'VND', languageCode: 'vi' }), /1\.234\.568.*VND|VND.*1\.234\.568/);
  assert.match(formatCurrency(1234.5, { currencyCode: 'USD', languageCode: 'en' }), /USD|\$/);
  assert.match(formatCurrency(1234.5, { currencyCode: 'USD', languageCode: 'en' }), /1,234\.50/);
  assert.equal(formatCurrency('bad', { currencyCode: 'VND', fallback: '-' }), '-');
});

test('currency displays use the shared formatter and unsaved warning has Vietnamese tone marks', async () => {
  const paths = [
    'frontend/src/pages/App/assign/AssignBoard.jsx',
    'frontend/src/pages/App/payroll/PayrollEntry.jsx',
    'frontend/src/pages/App/work/WorkDetail.jsx',
    'frontend/src/pages/App/work/WorkList.jsx',
  ];
  for (const path of paths) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.match(source, /formatCurrency\(/, path);
  }
  const hook = await readFile(new URL('../frontend/src/hooks/useUnsavedChanges.js', import.meta.url), 'utf8');
  assert.match(hook, /Bạn có thay đổi chưa lưu\. Rời trang mà không lưu\?/);
});
