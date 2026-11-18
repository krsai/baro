import test from 'node:test';
import assert from 'node:assert/strict';
import {ledgerFlowPreservesEvidence,selectLedgerFlowEndpoint} from '../frontend/src/utils/ledgerFlow.mjs';
import {loadSourceBindings} from './helpers/source-bindings.mjs';
const accounts=[{id:'a',entityAccountId:1,currencyCode:'USD'},{id:'b',entityAccountId:2,currencyCode:'USD'},{id:'c',entityAccountId:3,currencyCode:'VND'}];
const row={accountId:'a',direction:'OUT',evidenceType:'EXPENSE',counterparty:{kind:'PARTNER',id:10},document:{id:20},expenseItems:[{itemId:30,amount:'10'}],paymentScheduleId:'schedule'};
test('reselecting the same party or changing a same-currency account retains linked evidence',()=>{
 for(const [side,value] of [['to',{kind:'PARTNER',id:10}],['from',{kind:'ACCOUNT',id:2,currencyCode:'USD'}]]){
  const patch=selectLedgerFlowEndpoint(row,accounts,side,value);
  assert.equal(ledgerFlowPreservesEvidence(row,patch,accounts),true);
  const next={...row,...patch};assert.deepEqual(next.document,row.document);assert.deepEqual(next.expenseItems,row.expenseItems);assert.equal(next.paymentScheduleId,'schedule');
 }
});
test('actual party, currency or direction changes require evidence revalidation',()=>{
 for(const patch of [{counterparty:{kind:'PARTNER',id:11}},{counterparty:{kind:'EMPLOYEE',id:10}},{accountId:'c'},{direction:'IN'},{counterparty:null}])assert.equal(ledgerFlowPreservesEvidence(row,patch,accounts),false);
});
test('reselecting the same document version preserves payment allocations and installment',()=>{
 const updates=[];
 const {selectDocument}=loadSourceBindings('frontend/src/pages/App/BankLedgerEntry.jsx',['selectDocument'],{
  edit:(key,patch)=>updates.push({key,patch}),resetEvidence:()=>{throw Error('Unexpected evidence reset');},
 });
 const document={id:20,version:3,reference:'EXP-20'};
 selectDocument({...row,clientKey:'main',document},document);
 assert.deepEqual(updates,[{key:'main',patch:{document}}]);
});
