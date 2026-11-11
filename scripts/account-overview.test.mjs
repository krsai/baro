import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{accountBalanceReport,outstandingReport,loadAccountOverview,accountReportToday,shiftReportDate}=require('../backend/dist/services/accountOverview.js');
const {Prisma}=require('../backend/node_modules/@prisma/client');
const {registerBankLedgerRoutes}=require('../backend/dist/services/bankLedger');
const {attachLedgerActorNames}=require('../backend/dist/services/ledgerActors');
import {formatLedgerAmount} from '../frontend/src/utils/bankLedgerMoney.mjs';

test('monthly movements use calendar boundaries, leap years and account names without changing current history',()=>{
 const {accountMovementPeriod}=require('../backend/dist/services/accountOverview.js');
 assert.deepEqual(accountMovementPeriod('2024-02','2026-11-06'),{month:'2024-02',start:'2024-02-01',end:'2024-02-29'});
 assert.equal(accountMovementPeriod('2025-02','2026-11-06').end,'2025-02-28');
 assert.equal(accountMovementPeriod('2026-11','2026-11-06').end,'2026-11-06');
 for(const value of ['2026-12','2026-13','2026-1','invalid'])assert.throws(()=>accountMovementPeriod(value,'2026-11-06'),/LEDGER_INVALID_RANGE/);
 const flows=[{accountId:'a',transactionDate:'2026-09-30',direction:'IN',_sum:{amount:'900'}},{accountId:'a',transactionDate:'2026-10-01',direction:'IN',_sum:{amount:'50'}},{accountId:'a',transactionDate:'2026-10-31',direction:'OUT',_sum:{amount:'20'}},{accountId:'a',transactionDate:'2026-11-01',direction:'IN',_sum:{amount:'700'}}];
 const period=accountBalanceReport([{id:'a',displayName:'Operating account',bankName:'Bank',accountNumber:'123',currencyCode:'USD',openingDate:'2026-01-01',openingBalance:'0',currentBalance:'130'}],flows,'2026-10-31');
 assert.equal(period.accounts[0].name,'Operating account');assert.equal(period.accounts[0].beginningBalance,'100.00');assert.equal(period.accounts[0].totalIn,'50.00');assert.equal(period.accounts[0].totalOut,'20.00');assert.equal(period.accounts[0].change,'30.00');assert.equal(period.accounts[0].currentBalance,'130.00');
 const unnamed=accountBalanceReport([{id:'b',bankName:'Bank',accountNumber:'456',currencyCode:'VND',openingDate:'2026-01-01',openingBalance:'0',currentBalance:'0'}],[],'2026-10-31');assert.equal(unnamed.accounts[0].name,'Bank / 456');
});

test('overview API requires a real company member and its separate configured policy feature',async()=>{
 for(const [role,features,system,expected] of [['ADMIN',['ACCOUNT_OVERVIEW'],false,true],['ADMIN',['BANK_LEDGER'],false,false],['ACCOUNTANT',['ACCOUNT_OVERVIEW','BANK_LEDGER'],false,true],['ACCOUNTANT',['ACCOUNT_OVERVIEW'],true,true],['OPERATOR',['ACCOUNT_OVERVIEW'],false,true],['WORKER',['ACCOUNT_OVERVIEW'],false,true],['WORKER',['BANK_LEDGER'],false,false],['OPERATOR',[],false,false],['INVALID',['ACCOUNT_OVERVIEW'],false,false],[null,['ACCOUNT_OVERVIEW'],true,false]]){
  const routes=new Map();let reached=0,status;
  registerBankLedgerRoutes(new Proxy({},{get:(_,method)=>(path,handler)=>routes.set(method+' '+path,handler)}),{$transaction:async()=>{reached++;throw Error('REPORT_REACHED');}}, {requireOrgRole:async()=>({organization:{id:7,type:'MANUFACTURER'},employee:role?{id:10,orgRole:role}:null,systemUser:system?{systemRole:'SYSTEM_ADMIN'}:null}),loadPolicy:async()=>({policy:{MANUFACTURER:{[role||'ADMIN']:features}}})});
  const response={status(code){status=code;return this;},json(){return this;}};
  const run=routes.get('get /bank-ledger/overview')({query:{}},response);
  if(expected)await assert.rejects(run,/REPORT_REACHED/);else {await run;assert.equal(status,403);status=null;await routes.get('get /bank-ledger/exchange-rates')({query:{}},response);assert.equal(status,403);}assert.equal(reached,expected?1:0);
 }
});
test('ledger writers resolve only unambiguous employees in the current company, including inactive writers',async()=>{
 let calls=0;const db={employee:{findMany:async({where,select})=>{calls++;assert.equal(where.orgId,7);assert.equal('status' in where,false);assert.deepEqual(select,{email:true,name:true});return [{email:'writer@example.com',name:'Writer name'},{email:'duplicate@example.com',name:'A'},{email:'DUPLICATE@example.com',name:'B'}];}}};
 const result=await attachLedgerActorNames(db,7,[{createdBy:'WRITER@example.com',settlementLines:[{createdBy:'missing@example.com'}]},{createdBy:'duplicate@example.com'},{createdBy:'legacy-script'}]);
 assert.equal(result[0].createdByName,'Writer name');assert.equal(result[0].createdBy,'WRITER@example.com');assert.equal(result[0].settlementLines[0].createdByName,null);assert.equal(result[1].createdByName,null);assert.equal(result[2].createdByName,null);assert.equal(calls,1);
 assert.equal(formatLedgerAmount('12345678901234567890','VND'),'₫12,345,678,901,234,567,890');assert.equal(formatLedgerAmount('0','USD'),'$0.00');
});

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
 const asOf=accountReportToday(),yesterday=shiftReportDate(asOf,-1),orgId=7,lookups=[],ranges=[];
 const entries=[
  {id:'file',accountId:'a',direction:'IN',amount:'10',purpose:'File',allocations:[],settlementLines:[]},
  {id:'invoice',accountId:'a',direction:'IN',amount:'20',purpose:'Invoice',allocations:[{invoiceId:'inv'}],settlementLines:[{id:'fee',kind:'FEE',amount:'1.25',purpose:'Fee'}]},
  {id:'expense',accountId:'a',direction:'OUT',amount:'30',purpose:'Expense',allocations:[{expenseItemId:'cost'},{expenseItemId:'cost'}],settlementLines:[]},
  {id:'missing',accountId:'a',direction:'IN',amount:'1',purpose:'Missing',allocations:[{invoiceId:'foreign'},{expenseItemId:'missing'}],settlementLines:[]},
 ];
 const tx={
  accountingOpeningItem:{findMany:async()=>[]},bankLedgerAccount:{findMany:async query=>{assert.equal(query.where.orgId,orgId);return [{id:'a',currencyCode:'USD',openingDate:'2026-01-01',openingBalance:'100',bankName:'Bank',createdAt:new Date(),entityAccount:null}];}},
  organizationBankAccount:{findMany:async query=>{assert.deepEqual(query.where,{orgId,entityId:orgId});return [];}},
  bankLedgerEntry:{groupBy:async query=>{ranges.push(query.where.transactionDate);assert.equal(query.where.orgId,orgId);assert.equal(query.where.voidedAt,null);return [];},findMany:async query=>{validateQuery('BankLedgerEntry',query);assert.deepEqual(query.where,{orgId,voidedAt:null,transactionDate:yesterday});return entries;}},
  invoice:{findMany:async query=>{validateQuery('Invoice',query);assert.equal(query.where.sellerOrgId,orgId);if(!query.where.id)return [];lookups.push('invoice');assert.deepEqual(query.where.id.in,['inv','foreign']);return [{id:'inv',buyer:{name:'Buyer'}}];}},
  partnerTransactionCost:{findMany:async query=>{validateQuery('PartnerTransactionCost',query);assert.equal(query.where.orgId,orgId);assert.deepEqual(query.where.id.in,['cost','missing']);lookups.push('expense');return [{id:'cost',expenseRequest:{payeeEmployee:{name:'Employee'}}}];}},
  expenseRequest:{findMany:async query=>{validateQuery('ExpenseRequest',query);assert.equal(query.where.orgId,orgId);return [];}},
  bankLedgerEvidenceAllocation:{findMany:async query=>{validateQuery('BankLedgerEvidenceAllocation',query);assert.equal(query.where.orgId,orgId);return [];}},
 };
 const db={$transaction:async callback=>callback(tx)};
 const report=await loadAccountOverview(db,orgId);
 assert.equal(report.orgId,orgId);assert.equal(report.transactions[0].counterparty,'');assert.equal(report.transactions[1].counterparty,'Buyer');assert.equal(report.transactions[2].counterparty,'Employee');assert.equal(report.transactions[3].counterparty,'');assert.equal(report.transactions[1].settlementLines[0].amount,'1.25');assert.deepEqual(lookups.sort(),['expense','invoice']);
 entries.splice(0);lookups.splice(0);assert.equal((await loadAccountOverview(db,orgId,{days:180})).transactions.length,0);assert.deepEqual(lookups,[]);assert.equal(ranges.at(-1).gte,shiftReportDate(asOf,-179));assert.equal(ranges.at(-1).lte,asOf);
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
