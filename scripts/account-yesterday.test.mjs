import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {accountBalanceReport}=createRequire(import.meta.url)('../backend/dist/services/accountOverview.js');
test('yesterday is one business date, excludes today and preserves new-account openings and currency totals',()=>{
 const accounts=[{id:'old',currencyCode:'USD',openingDate:'2026-01-01',openingBalance:'100',currentBalance:'1000'},
 {id:'yesterday',currencyCode:'USD',openingDate:'2026-10-31',openingBalance:'120',currentBalance:'200'},
 {id:'today',currencyCode:'VND',openingDate:'2026-11-01',openingBalance:'300',currentBalance:'350'}];
 const flow=(accountId,date,direction,amount)=>({accountId,transactionDate:date,direction,_sum:{amount}});
 const flows=[flow('old','2026-10-30','IN','760'),flow('old','2026-10-31','IN','120'),flow('old','2026-10-31','OUT','20'),flow('old','2026-11-01','IN','50'),flow('old','2026-11-01','OUT','10'),flow('yesterday','2026-10-31','IN','80'),flow('today','2026-11-01','IN','50')];
 const report=accountBalanceReport(accounts,flows,'2026-11-01');
 assert.equal(report.yesterday,'2026-10-31');assert.equal(report.yesterdayAccounts.length,2);
 const row=report.yesterdayAccounts[0];assert.equal(row.beginningBalance,'860.00');assert.equal(row.totalIn,'120.00');assert.equal(row.totalOut,'20.00');assert.equal(row.change,'100.00');assert.equal(row.currentBalance,'960.00');
 assert.equal(report.yesterdayAccounts[1].beginningBalance,'120.00');assert.equal(report.yesterdayTotals.length,1);assert.equal(report.yesterdayTotals[0].currencyCode,'USD');assert.equal(report.yesterdayTotals[0].currentBalance,'1160.00');assert.equal(report.accounts[0].currentBalance,'1000.00');
});
