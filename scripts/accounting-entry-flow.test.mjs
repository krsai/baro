import test from 'node:test';
import assert from 'node:assert/strict';
import {ledgerFlowEndpoints,selectLedgerFlowEndpoint} from '../frontend/src/utils/ledgerFlow.mjs';
const accounts=[{id:'usd',entityAccountId:'u',currencyCode:'USD'},{id:'vnd',entityAccountId:'v',currencyCode:'VND'}];
const usd={kind:'ACCOUNT',id:'u',currencyCode:'USD'},vnd={kind:'ACCOUNT',id:'v',currencyCode:'VND'},party={kind:'PARTNER',id:17,name:'CUSTOMER'};
const choose=(row,side,value)=>({...row,...selectLedgerFlowEndpoint(row,accounts,side,value)});
test('either side can be entered first; account and direction follow endpoints, not an initial default',()=>{
 for(const first of ['from','to']){
  let row={accountId:'',direction:'IN',amount:'',evidenceType:'FILE'};
  row=choose(row,first,first==='from'?party:usd);row=choose(row,first==='from'?'to':'from',first==='from'?usd:party);
  assert.equal(row.accountId,'usd');assert.equal(row.direction,'IN');assert.deepEqual(row.counterparty,party);
  assert.deepEqual(ledgerFlowEndpoints(row,accounts[0]),{from:party,to:usd});
 }
 let row=choose({},'to',party);assert.equal(row.accountId,'');row=choose(row,'from',usd);
 assert.equal(row.direction,'OUT');assert.equal(row.accountId,'usd');assert.deepEqual(row.counterparty,party);
});
test('internal FX resolves one source account and preserves actual amounts only within the same currency',()=>{
 let row=choose({},'to',vnd);row={...row,amount:'1000000'};row=choose(row,'from',usd);
 assert.equal(row.accountId,'usd');assert.equal(row.direction,'OUT');assert.deepEqual(row.counterparty,vnd);assert.equal(row.amount,'');
 assert.equal(selectLedgerFlowEndpoint(row,accounts,'to',usd),null);
 assert.equal(selectLedgerFlowEndpoint(choose({},'from',party),accounts,'to',{kind:'EMPLOYEE',id:9}),null);
 assert.equal(selectLedgerFlowEndpoint({},accounts,'from',{kind:'ACCOUNT',id:'foreign'}),null);
 const external={...row,amount:'40',transferAmount:'1000000'};
 const changed=choose(external,'to',party);assert.equal(changed.amount,'40');assert.equal(changed.transferAmount,'');assert.equal(changed.transferCurrencyCode,'');
 const cleared=choose(changed,'from',null);assert.equal(cleared.accountId,'');assert.equal(cleared.flowFrom,null);assert.deepEqual(cleared.flowTo,party);
});
