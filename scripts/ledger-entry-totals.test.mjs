import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ledgerEntryTotals} from '../frontend/src/utils/ledgerEntryTotals.mjs';
import {ledgerExpenseSelectionAmount} from '../frontend/src/utils/ledgerExpenseRows.mjs';

test('linking multiple expense items replaces a previous single-item cash total',()=>{
 const row={entryKind:'BANK',evidenceType:'EXPENSE',accountId:'v',direction:'OUT',amount:'6775950'};
 const document={remaining:'7050950',items:[{id:'electricity',remaining:'6775950'},{id:'water',remaining:'275000'}]};
 const amount=ledgerExpenseSelectionAmount(row,document);
 assert.equal(amount,'7050950');
 assert.deepEqual(ledgerEntryTotals([{...row,amount}],[{id:'v',currencyCode:'VND'}]),[{currency:'VND',incoming:'0.00',outgoing:'7050950.00',net:'-7050950.00'}]);
 assert.equal(ledgerExpenseSelectionAmount(row,{...document,items:[document.items[0]]}),'6775950','Single-item partial payment stays editable');
 assert.equal(ledgerExpenseSelectionAmount({...row,evidenceType:'INVOICE'},document),'6775950');
 assert.equal(ledgerExpenseSelectionAmount(row,{...document,paymentSchedule:[{id:'plan'}]}),'','Installments still require explicit selection');
 assert.equal(ledgerExpenseSelectionAmount(row,{items:[{id:'a',remaining:'9007199254740993.01'},{id:'b',remaining:'0.02'}]}),'9007199254740993.03');
});
test('actual bank movement stays separate by currency and does not double count settlement lines',()=>{
 const accounts=[{id:'u',currencyCode:'USD'},{id:'v',currencyCode:'VND'}];
 const bank=(accountId,direction,amount)=>({entryKind:'BANK',accountId,direction,amount});
 assert.deepEqual(ledgerEntryTotals([bank('u','IN','0.30'),bank('u','OUT','0.20'),bank('v','OUT','9007199254740993'),{entryKind:'FEE',amount:'500'},{entryKind:'WRITEOFF',amount:'999'},bank('missing','IN','5')],accounts),[
  {currency:'USD',incoming:'0.30',outgoing:'0.20',net:'0.10'},
  {currency:'VND',incoming:'0.00',outgoing:'9007199254740993.00',net:'-9007199254740993.00'},
 ]);
});
test('blank and invalid amounts do not create NaN totals',()=>{
 assert.deepEqual(ledgerEntryTotals([{entryKind:'BANK',accountId:'a',direction:'IN',amount:''},{entryKind:'BANK',accountId:'a',direction:'OUT',amount:'x'}],[{id:'a',currencyCode:'USD'}]),[{currency:'USD',incoming:'0.00',outgoing:'0.00',net:'0.00'}]);
});
