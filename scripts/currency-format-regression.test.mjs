import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { formatCurrency } from '../frontend/src/utils/currencyFormat.js';
import {formatLedgerMoney} from '../frontend/src/utils/bankLedgerMoney.mjs';

test('amount symbols and precision are consistent without changing source values',()=>{
 for(const [code,symbol] of [['USD','$'],['VND','₫'],['KRW','₩']]){
  const raw='1932790.00';
  assert.equal(formatLedgerMoney(raw,code),symbol+(code==='USD'?'1,932,790.00':'1,932,790'));
  assert.equal(raw,'1932790.00');
  assert.equal(formatLedgerMoney('-105.25',code),'-'+symbol+(code==='USD'?'105.25':'105'));
  for(const languageCode of ['ko','en','vi']){
   const text=formatCurrency(raw,{currencyCode:code,languageCode});assert.ok(text.includes(symbol));assert.ok(!text.includes(code));
  }
 }
 assert.equal(formatLedgerMoney('9999999999999999.995','USD'),'$10,000,000,000,000,000.00');
 assert.equal(formatLedgerMoney('1932790.50','VND'),'₫1,932,791');
 assert.equal(formatLedgerMoney('-0.001','USD'),'$0.00');
 assert.equal(formatLedgerMoney(null,'VND'),'—');
});

test('shared currency formatter applies currency precision and locale', () => {
  assert.match(formatCurrency(1234567.8, { currencyCode: 'VND', languageCode: 'vi' }), /1\.234\.568.*\u20ab|\u20ab.*1\.234\.568/);
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
