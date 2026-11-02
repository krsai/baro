import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{accountBalanceReport,outstandingReport,loadAccountOverview,accountReportToday,shiftReportDate}=require('../backend/dist/services/accountOverview.js');
const {Prisma}=require('../backend/node_modules/@prisma/client');

function validateQuery(modelName,query){
 const model=Prisma.dmmf.datamodel.models.find(row=>row.name===modelName);
 for(const kind of ['select','include'])for(const [key,value] of Object.entries(query?.[kind]||{})){
  const field=model.fields.find(row=>row.name===key);
  assert.ok(field,`${modelName}.${key} does not exist`);
  if(kind==='include')assert.equal(field.kind,'object',`${modelName}.${key} is not a relation`);
  if(value&&typeof value==='object')validateQuery(field.type,value);
 }
}

test('overview reads real Prisma relations and resolves daily counterparties only within the authenticated company',async()=>{
 const asOf=accountReportToday(),yesterday=shiftReportDate(asOf,-1),orgId=7,lookups=[];
 const entries=[
  {id:'file',accountId:'a',direction:'IN',amount:'10',purpose:'File',allocations:[],settlementLines:[]},
  {id:'invoice',accountId:'a',direction:'IN',amount:'20',purpose:'Invoice',allocations:[{invoiceId:'inv'}],settlementLines:[{id:'fee',kind:'FEE',amount:'1.25',purpose:'Fee'}]},
  {id:'expense',accountId:'a',direction:'OUT',amount:'30',purpose:'Expense',allocations:[{expenseItemId:'cost'},{expenseItemId:'cost'}],settlementLines:[]},
  {id:'missing',accountId:'a',direction:'IN',amount:'1',purpose:'Missing',allocations:[{invoiceId:'foreign'},{expenseItemId:'missing'}],settlementLines:[]},
 ];
 const tx={
  bankLedgerAccount:{findMany:async query=>{assert.equal(query.where.orgId,orgId);return [{id:'a',currencyCode:'USD',openingDate:'2026-01-01',openingBalance:'100',bankName:'Bank',createdAt:new Date(),entityAccount:null}];}},
  organizationBankAccount:{findMany:async query=>{assert.deepEqual(query.where,{orgId,entityId:orgId});return [];}},
  bankLedgerEntry:{groupBy:async query=>{assert.equal(query.where.orgId,orgId);assert.equal(query.where.voidedAt,null);return [];},findMany:async query=>{validateQuery('BankLedgerEntry',query);assert.deepEqual(query.where,{orgId,voidedAt:null,transactionDate:yesterday});return entries;}},
  invoice:{findMany:async query=>{validateQuery('Invoice',query);assert.equal(query.where.sellerOrgId,orgId);if(!query.where.id)return [];lookups.push('invoice');assert.deepEqual(query.where.id.in,['inv','foreign']);return [{id:'inv',buyer:{name:'Buyer'}}];}},
  partnerTransactionCost:{findMany:async query=>{validateQuery('PartnerTransactionCost',query);assert.equal(query.where.orgId,orgId);assert.deepEqual(query.where.id.in,['cost','missing']);lookups.push('expense');return [{id:'cost',expenseRequest:{payeeEmployee:{name:'Employee'}}}];}},
  expenseRequest:{findMany:async query=>{validateQuery('ExpenseRequest',query);assert.equal(query.where.orgId,orgId);return [];}},
  bankLedgerEvidenceAllocation:{findMany:async query=>{validateQuery('BankLedgerEvidenceAllocation',query);assert.equal(query.where.orgId,orgId);return [];}},
 };
 const db={$transaction:async callback=>callback(tx)};
 const report=await loadAccountOverview(db,orgId);
 assert.equal(report.orgId,orgId);assert.equal(report.transactions[0].counterparty,'');assert.equal(report.transactions[1].counterparty,'Buyer');assert.equal(report.transactions[2].counterparty,'Employee');assert.equal(report.transactions[3].counterparty,'');assert.equal(report.transactions[1].settlementLines[0].amount,'1.25');assert.deepEqual(lookups.sort(),['expense','invoice']);
 entries.splice(0);lookups.splice(0);assert.equal((await loadAccountOverview(db,orgId)).transactions.length,0);assert.deepEqual(lookups,[]);
});
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

test('employee payables remain separate from partners with the same numeric ID and other employees',()=>{
 const request=(id,partnerOrgId,payeeEmployeeId)=>({id,partnerOrgId,payeeEmployeeId,payeeEmployee:{name:'Employee '+id},partner:partnerOrgId?{name:'Vendor'}:null,items:[{id:'c'+id,currency:'VND',amount:'100'}]});
 const report=outstandingReport([],[request(1,3,null),request(2,null,3),request(3,null,4)],[]);
 assert.equal(report.payables.length,3);assert.deepEqual(report.payables.map(r=>r.partyKind),['PARTNER','EMPLOYEE','EMPLOYEE']);assert.equal(report.outstandingTotals[0].payable,'300');
});
