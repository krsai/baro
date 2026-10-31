import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{accountBalanceReport,outstandingReport}=require('../backend/dist/services/accountOverview.js');
test('account report uses actual closing balances, fills all 30 days and keeps opening balances and currencies separate',()=>{
 const accounts=[{id:'usd',currencyCode:'USD',bankName:'Bank',accountNumber:'1',openingDate:'2026-01-01',openingBalance:'100',currentBalance:'1090'},{id:'vnd',currencyCode:'VND',displayName:'Cash',openingDate:'2026-10-20',openingBalance:'1000',currentBalance:'1500'}];
 const flows=[{accountId:'usd',transactionDate:'2026-10-29',direction:'IN',_sum:{amount:'990'}},{accountId:'vnd',transactionDate:'2026-10-22',direction:'IN',_sum:{amount:'500'}}];
 const report=accountBalanceReport(accounts,flows,'2026-10-30');assert.equal(report.history.length,30);assert.equal(report.history[0].date,'2026-10-01');assert.equal(report.history.at(-1).date,'2026-10-30');assert.equal(report.accounts[0].beginningBalance,'100.00');assert.equal(report.accounts[0].yesterdayIn,'990.00');assert.equal(report.accounts[0].change,'990.00');
 assert.equal(report.history.find(row=>row.date==='2026-10-19').accounts[1].balance,'0');assert.equal(report.history.find(row=>row.date==='2026-10-20').accounts[1].balance,'1000');assert.equal(report.history.at(-1).currencyTotals[1].balance,'1500');assert.equal(report.currencyTotals.length,2);
});
test('month boundary history retains negative balances and exact amounts above Number precision',()=>{
 const report=accountBalanceReport([{id:'a',currencyCode:'USD',openingDate:'0001-01-01',openingBalance:'0',currentBalance:'9007199254740993.99'}],[{accountId:'a',transactionDate:'2026-10-31',direction:'IN',_sum:{amount:'9007199254741000.00'}}],'2026-11-01');
 assert.equal(report.yesterday,'2026-10-31');assert.equal(report.accounts[0].currentBalance,'9007199254740993.99');assert.equal(report.accounts[0].totalIn,'0.00');assert.equal(report.history[0].accounts[0].balance,'-6.01');
});
test('outstanding uses real partner/currency keys, avoids installment double counting and never adds separate invoice receipts twice',()=>{
 const invoices=[{id:'old',buyerOrgId:1,currencyCode:'USD',status:'ISSUED',invoiceNumber:'INV-1',receivableAdded:'300',buyer:{name:'Buyer'},credits:[],payments:[{kind:'RECEIPT',amount:'300'}]},{id:'new',buyerOrgId:1,currencyCode:'USD',status:'ISSUED',invoiceNumber:'INV-2',receivableAdded:'700',buyer:{name:'Buyer'},credits:[],payments:[]},{id:'cancelled',buyerOrgId:2,currencyCode:'USD',status:'CANCELLED',invoiceNumber:'INV-3',receivableAdded:'900',buyer:{name:'Other'},credits:[],payments:[]}];
 const requests=[{id:1,partnerOrgId:3,partner:{name:'Vendor'},managementNumber:'EXP-1',items:[{id:'c1',currency:'USD',amount:'100'},{id:'c2',currency:'VND',amount:'1000'}]}];
 const report=outstandingReport(invoices,requests,[{invoiceId:'new',amount:'1000'},{expenseItemId:'c1',amount:'100'},{expenseItemId:'c2',amount:'200'}]);
 assert.equal(report.receivables[0].balance,'0.00');assert.equal(report.receivables[0].hasUnlinkedReceipt,true);assert.equal(report.receivables[0].separateReceived,'300.00');assert.equal(report.payables.length,1);assert.equal(report.payables[0].balance,'800');assert.equal(report.outstandingTotals.find(row=>row.currencyCode==='USD').receivable,'0.00');
});
