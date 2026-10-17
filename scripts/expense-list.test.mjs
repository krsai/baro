import test from 'node:test';
import assert from 'node:assert/strict';
import { expenseCurrencyTotals, groupExpenseRows, expenseIndustryKey } from '../frontend/src/utils/expenseList.mjs';

test('expense summaries preserve decimal amounts and separate currencies', () => {
  const rows=[{id:'a',partnerOrgId:11,currency:'VND',amount:'1.2345'},{id:'b',partnerOrgId:11,currency:'VND',amount:'2.3456'},{id:'c',partnerOrgId:11,currency:'USD',amount:'10.25'}];
  assert.deepEqual(expenseCurrencyTotals(rows).map(({currency,amount})=>({currency,amount})),[{currency:'USD',amount:'10.2500'},{currency:'VND',amount:'3.5801'}]);
  const groups=groupExpenseRows(rows,'partner',()=> 'Vendor');
  assert.equal(groups.length,2);assert.ok(groups.every(group=>group.share===100));assert.equal(groups.find(group=>group.currency==='VND').count,2);
});
test('equal partner names do not merge different FK identities and unknown partners are not guessed', () => {
  const rows=[{id:'a',partnerOrgId:11,currency:'VND',amount:'10'},{id:'b',partnerOrgId:12,currency:'VND',amount:'30'},{id:'c',currency:'VND',amount:'1'},{id:'d',currency:'VND',amount:'1'}];
  const groups=groupExpenseRows(rows,'partner',()=> 'Same name');assert.equal(groups.length,4);
  assert.equal(groups.find(group=>group.identity===11).share,23.8);
});
test('industry summaries use service FKs and a separate historical category', () => {
  const rows=[{id:'a',serviceTypeId:4,currency:'VND',amount:'100'},{id:'b',serviceTypeId:5,currency:'VND',amount:'200'},{id:'old',sourceKind:'HISTORICAL_WORK_RECORD',currency:'VND',amount:'300'}];
  assert.equal(expenseIndustryKey(rows[2]),'historical-process');assert.equal(groupExpenseRows(rows,'industry',()=> 'Work').length,3);
});
