import assert from 'node:assert/strict';
import test from 'node:test';
import {ledgerInputIssue} from '../frontend/src/utils/ledgerInputIssue.mjs';
test('inline bank fee requires amount and code, without recipient or evidence; regular cash keeps its evidence checks',()=>{
 const accounts=[{id:'bank',currencyCode:'USD'}];
 const main={clientKey:'main',entryKind:'BANK',accountId:'bank',direction:'IN',amount:'16100.75',accountingCodeId:7,evidenceType:'FILE',counterparty:{kind:'PARTNER',id:11},evidenceNumber:'receipt.pdf'};
 const fee={clientKey:'fee',entryKind:'BANK',feeForClientKey:'main',accountId:'bank',direction:'OUT',amount:'8.86',accountingCodeId:9,evidenceType:'BANK_FEE',evidenceNumber:''};
 assert.equal(ledgerInputIssue([main,fee],accounts,[]),null);
 assert.deepEqual(ledgerInputIssue([main,{...fee,amount:''}],accounts,[]),{field:'amount',index:1,rowNumber:1,fee:true});
 assert.equal(ledgerInputIssue([main,{...fee,accountingCodeId:''}],accounts,[]).field,'code');
 assert.equal(ledgerInputIssue([{...main,evidenceNumber:''},fee],accounts,[]).field,'evidence');
 assert.equal(ledgerInputIssue([{...main,counterparty:null},fee],accounts,[]).field,'counterparty');
 assert.equal(ledgerInputIssue([main,fee,{...main,clientKey:'second',amount:''}],accounts,[]).rowNumber,2);
 assert.equal(ledgerInputIssue([main,{...fee,accountId:'foreign'}],accounts,[]).field,'account');
});
