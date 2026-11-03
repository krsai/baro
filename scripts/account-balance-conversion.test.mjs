import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {convertAccountBalances} from '../frontend/src/utils/accountBalanceConversion.mjs';
const require=createRequire(import.meta.url);
const {accountBalanceReport,accountHistoryDays}=require('../backend/dist/services/accountOverview.js');
const {createReferenceRateLoader}=require('../backend/dist/services/referenceExchangeRates.js');
test('all currency accounts convert to the selected currency, including negatives and exact large amounts',()=>{
 const rates={USD:'1',VND:'25000',KRW:'1250'},rows=[{currencyCode:'USD',balance:'100'},{currencyCode:'VND',balance:'2500000'},{currencyCode:'KRW',balance:'125000'}];
 assert.equal(convertAccountBalances(rows,'USD',rates),'300.00');assert.equal(convertAccountBalances(rows,'VND',rates),'7500000');assert.equal(convertAccountBalances(rows,'KRW',rates),'375000');
 assert.equal(convertAccountBalances([rows[1]],'USD',rates),'100.00');assert.equal(convertAccountBalances([{currencyCode:'KRW',balance:'-125000'}],'USD',rates),'-100.00');
 assert.equal(convertAccountBalances([{currencyCode:'USD',balance:'9007199254740993.99'}],'USD'),'9007199254740993.99');
 assert.equal(convertAccountBalances(rows,'USD',{USD:'1',VND:'25000'}),null);
 assert.equal(convertAccountBalances([{currencyCode:'VND',balance:'0'}],'USD'),'0.00');
 assert.equal(convertAccountBalances([{currencyCode:'VND',balance:'1'},{currencyCode:'VND',balance:'1'}],'USD',{USD:'1',VND:'400'}),'0.01');
});
test('30/60/90/180 inclusive days preserve history and opening balances across leap/year boundaries',()=>{
 for(const days of [30,60,90,180]){
  const report=accountBalanceReport([{id:'a',currencyCode:'USD',openingDate:'2024-01-01',openingBalance:'10',currentBalance:'15'}],[{accountId:'a',transactionDate:'2024-02-29',direction:'IN',_sum:{amount:'5'}}],'2024-03-01',days);
  assert.equal(report.history.length,days);assert.equal(report.historyDays,days);assert.equal(report.history.at(-1).date,'2024-03-01');assert.equal(report.historyStart,report.history[0].date);
  assert.equal(report.history.find(row=>row.date==='2024-02-28').accounts[0].balance,'10.00');
  if(days>=90)assert.equal(report.history.find(row=>row.date==='2023-12-31').accounts[0].balance,'0.00');
 }
 for(const value of [0,31,181,'bad',null])assert.throws(()=>accountHistoryDays(value));
});
test('reference rates fetch once, validate complete data, cache, and bound stale fallback',async()=>{
 let now=Date.parse('2026-11-03T12:00:00Z'),calls=0,fail=false;
 const load=createReferenceRateLoader(async(url,options)=>{calls++;assert.equal(url,'https://api.frankfurter.dev/v2/rates?base=USD&quotes=VND,KRW');assert.ok(options.signal);if(fail)throw Error('Offline');return {ok:true,json:async()=>[{base:'USD',quote:'VND',rate:25000,date:'2026-11-03'},{base:'USD',quote:'KRW',rate:1250,date:'2026-11-03'}]};},()=>now);
 const [first,second]=await Promise.all([load(),load()]);assert.equal(calls,1);assert.equal(first,second);assert.deepEqual(first.rates,{USD:'1',VND:'25000',KRW:'1250'});
 await load();assert.equal(calls,1);now+=7*3600000;fail=true;assert.equal((await load()).stale,true);await load();assert.equal(calls,2);
 now+=49*3600000;await assert.rejects(load(),/EXCHANGE_RATES_UNAVAILABLE/);
 for(const rows of [[{base:'USD',quote:'VND',rate:25000,date:'2026-11-03'}],[{base:'USD',quote:'VND',rate:0,date:'2026-11-03'},{base:'USD',quote:'KRW',rate:1250,date:'2026-11-03'}]]){
  const bad=createReferenceRateLoader(async()=>({ok:true,json:async()=>rows}),()=>Date.parse('2026-11-03'));await assert.rejects(bad(),/EXCHANGE_RATES_UNAVAILABLE/);
 }
});
