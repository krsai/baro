import {appendExpenseRemark} from '../frontend/src/utils/ledgerExpenseRemark.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {syncSingleExpenseAllocations as sync} from '../frontend/src/utils/ledgerExpenseAllocation.mjs';
import {ledgerEntryTotals} from '../frontend/src/utils/ledgerEntryTotals.mjs';
const expense={clientKey:'expense',entryKind:'BANK',accountId:'bank',direction:'OUT',evidenceType:'EXPENSE',amount:'100',expenseItems:[{itemId:'cost',amount:'100'}]};
test('single expense payment follows the cash amount while an independent fee remains another cash transaction',()=>{
 const rows=sync([{...expense,amount:'80.25'},{clientKey:'fee',entryKind:'BANK',accountId:'bank',direction:'OUT',evidenceType:'FILE',amount:'2.50'}]);
 assert.equal(rows[0].expenseItems[0].amount,'80.25');assert.equal(rows[1].parentClientKey,undefined);
 assert.deepEqual(ledgerEntryTotals(rows,[{id:'bank',currencyCode:'USD'}]),[{currency:'USD',incoming:'0.00',outgoing:'82.75',net:'-82.75'}]);
 assert.equal(expense.expenseItems[0].amount,'100');
});
test('historical included fees never become a second cash withdrawal and removal updates the allocation',()=>{
 const legacy={clientKey:'legacy-fee',parentClientKey:'expense',entryKind:'FEE',amount:'10'};
 const rows=sync([expense,legacy]);assert.equal(rows[0].expenseItems[0].amount,'90.00');
 assert.equal(ledgerEntryTotals(rows,[{id:'bank',currencyCode:'USD'}])[0].outgoing,'100.00');
 assert.equal(sync(rows.filter(row=>row!==legacy))[0].expenseItems[0].amount,'100.00');
});
test('multiple expense allocations retain explicit payments and invalid amounts are not fabricated',()=>{
 const multi={...expense,expenseItems:[{itemId:'a',amount:'30'},{itemId:'b',amount:'70'}]};assert.deepEqual(sync([multi])[0],multi);
 assert.equal(sync([{...expense,amount:'invalid'}])[0].expenseItems[0].amount,'');
 assert.equal(sync([{...expense,amount:'9999999999999.99'}])[0].expenseItems[0].amount,'9999999999999.99');
});

test('expense remark copy preserves multiline source and manual additions without truncation or duplicates',()=>{
 const source={id:42,remark:'Chi phí vận chuyển\nShipping expense\n\nAdditional source detail'};
 const copied=appendExpenseRemark('Payment note',source);assert.equal(copied,'Payment note\n\n'+source.remark);
 assert.equal(appendExpenseRemark(copied,source),copied);assert.equal(appendExpenseRemark('',source),source.remark);
 assert.equal(appendExpenseRemark('Payment note',{id:43,remark:'  '}),'Payment note');
 assert.equal(appendExpenseRemark('x'.repeat(990),{id:44,remark:'y'.repeat(500)}).length,1492);
 source.remark='Later source edit';assert.equal(copied,'Payment note\n\nChi phí vận chuyển\nShipping expense\n\nAdditional source detail');
});
