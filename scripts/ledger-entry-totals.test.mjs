import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ledgerEntryTotals} from '../frontend/src/utils/ledgerEntryTotals.mjs';
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
