import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{accountBalanceReport,outstandingReport,loadAccountOverview,accountReportToday,shiftReportDate}=require('../backend/dist/services/accountOverview.js');
const {Prisma}=require('../backend/node_modules/@prisma/client');
const {registerBankLedgerRoutes}=require('../backend/dist/services/bankLedger');
const {attachLedgerActorNames}=require('../backend/dist/services/ledgerActors');
import {formatLedgerAmount} from '../frontend/src/utils/bankLedgerMoney.mjs';
import {accountCashflowItems,accountCashflowTotal,cashflowSegments,categorizeCashflow} from '../frontend/src/utils/accountCashflow.mjs';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';

test('cashflow groups by role without duplicating amounts across multiple industries',()=>{
 const role={id:1,nameEn:'Outsourcing'},industry={id:10,nameEn:'Cutting',partnerRole:role};
 const group=(itemKey,industries,amount)=>({itemKey,industries,direction:'OUT',currencyCode:'VND',entries:[{amount,direction:'OUT'}]});
 const rows=categorizeCashflow([group('BASE:1',[industry],12),group('BASE:2',[industry,{...industry,id:11}],30),group('BASE:3',[industry,{id:12,partnerRole:{id:2}}],8)],{unclassified:{nameEn:'Unclassified'}});
 assert.equal(rows[0].sourceIndustry.id,10);
 assert.equal(rows[1].sourceIndustry.nameEn,'Unclassified');
 const items=accountCashflowItems(rows,'','VND');
 assert.equal(items.find(row=>row.itemKey==='ROLE:1').out,'42');
 assert.equal(items.find(row=>row.itemKey==='UNCLASSIFIED').out,'8');
 assert.equal(accountCashflowTotal(items,'OUT','VND'),'50');
});

test('cashflow excludes internal account transfers and exchanges while retaining bank fees',()=>{
 const {accountCashFlowReport}=require('../backend/dist/services/accountOverview.js');
 const account={id:'a',currencyCode:'VND'};
 const entry=(id,code,extra={})=>({id,accountId:'a',direction:'OUT',amount:'100',accountingCode:code?{base:{id,code}}:null,...extra});
 const report=accountCashFlowReport([account],[entry(1,'FXC'),entry(2,'IBT'),entry(3,null,{counterpartyAccountId:'b'}),entry(4,null,{internalTransferSourceId:'a1'}),entry(5,'BNF')]);
 assert.deepEqual(report.map(row=>[row.code,row.amount]),[['BNF','100']]);
});

test('real database overview scopes monthly cash flows, excludes voids and leaves ledger records unchanged',async()=>{
 const f=await changeApprovalFixture();try{
  const db=f.db,s=await seedChangeApproval(db),today=accountReportToday(),{accountHistoryPeriod}=require('../backend/dist/services/accountOverview.js'),start=accountHistoryPeriod(today,1).start;
  const add=(date,amount,extra={})=>db.bankLedgerEntry.create({data:{orgId:s.company.id,accountId:s.account.id,clientKey:crypto.randomUUID(),transactionDate:date,direction:'IN',amount,purpose:'Test receipt',evidenceNumber:'receipt.pdf',createdBy:'admin@example.test',accountingCodeId:s.code.id,counterpartyOrgId:s.vendor.id,counterpartyName:'Vendor',...extra}});
  await add(start,'10.01');await add(today,'20.02');await add(shiftReportDate(start,-1),'50');await add(today,'900',{voidedAt:new Date(),voidedBy:'admin@example.test',voidReason:'Duplicate'});
  const foreign=await db.bankLedgerAccount.create({data:{orgId:s.other.id,clientKey:crypto.randomUUID(),bankName:'Other',accountNumber:'002',accountHolder:'Other',currencyCode:'USD',openingDate:'0001-01-01',openingBalance:'0',createdBy:'other@example.test'}});
  const otherVendor=await db.organization.create({data:{name:'Other vendor',type:'LOGISTICS_PROVIDER',ownerOrgId:s.other.id}});
  await db.bankLedgerEntry.create({data:{orgId:s.other.id,accountId:foreign.id,clientKey:crypto.randomUUID(),transactionDate:today,direction:'IN',amount:'9999',purpose:'Other',evidenceNumber:'other.pdf',createdBy:'other@example.test',counterpartyOrgId:otherVendor.id,counterpartyName:'Vendor'}});
  const before=await db.bankLedgerEntry.findMany({orderBy:{id:'asc'}}),report=await loadAccountOverview(db,s.company.id,{months:1});
  assert.equal(report.historyStart,start);assert.equal(report.cashflowGroups.length,1);assert.equal(report.cashflowGroups[0].amount,'30.03');assert.equal(report.cashflowGroups[0].baseId,s.code.baseId);assert.equal(report.cashflowGroups[0].entries.length,2);assert.equal(report.accounts[0].currentBalance,'80.03');assert.equal(report.movementAccounts[0].totalIn,'30.03');
  const year=await loadAccountOverview(db,s.company.id,{months:12});assert.equal(year.cashflowGroups[0].amount,'80.03');assert.deepEqual(await db.bankLedgerEntry.findMany({orderBy:{id:'asc'}}),before);
 }finally{await f.close();}
});

test('calendar periods use 1/3/6/12 actual months including leap days and clamped month ends',()=>{
 const {accountHistoryPeriod}=require('../backend/dist/services/accountOverview.js');
 assert.deepEqual(accountHistoryPeriod('2026-11-17',1),{months:1,start:'2026-10-18',end:'2026-11-17',days:31});
 assert.equal(accountHistoryPeriod('2026-11-17',3).start,'2026-08-18');
 assert.equal(accountHistoryPeriod('2026-11-17',6).start,'2026-05-18');
 assert.equal(accountHistoryPeriod('2024-03-31',1).start,'2024-03-01');
 assert.equal(accountHistoryPeriod('2024-03-01',12).days,366);
 for(const n of [0,2,30,60,13,'bad'])assert.throws(()=>accountHistoryPeriod('2026-11-17',n),/LEDGER_INVALID_RANGE/);
});

test('cash flows group actual code bases across VAT variants, retain entries and native currency and convert precisely',()=>{
 const {accountCashFlowReport}=require('../backend/dist/services/accountOverview.js');
 const accounts=[{id:'a',displayName:'USD cash',currencyCode:'USD'},{id:'b',displayName:'VND bank',currencyCode:'VND'}],base={id:1,code:'ZIP',nameEn:'Zipper'},entry=(id,accountId,direction,amount,code)=>({id,accountId,direction,amount,accountingCode:code,transactionDate:'2026-11-16'});
 const groups=accountCashFlowReport(accounts,[entry('1','a','IN','10.01',{id:11,code:'ZIP0',base}),entry('2','a','IN','20.02',{id:12,code:'ZIP8',base}),entry('3','b','IN','25000',{id:13,code:'ZIP10',base}),entry('4','a','OUT','5.03',{id:11,code:'ZIP0',base}),entry('5','a','OUT','2',{id:14,code:'OTHER',base:{id:2,code:'OTHER',nameEn:'Zipper'}}),entry('6','b','OUT','100',null)]);
 assert.equal(groups.length,5);assert.equal(groups.find(row=>row.itemKey==='BASE:1'&&row.currencyCode==='USD'&&row.direction==='IN').amount,'30.03');
 const items=accountCashflowItems(groups,'','USD',{USD:'1',VND:'25000'}),zip=items.find(row=>row.itemKey==='BASE:1');
 assert.equal(zip.in,'31.03');assert.equal(zip.out,'5.03');assert.equal(zip.net,'26.00');assert.equal(zip.entries.length,4);assert.deepEqual(zip.entries.map(row=>row.code),['ZIP0','ZIP8','ZIP10','ZIP0']);assert.equal(items.length,3);
 assert.equal(accountCashflowTotal(items,'IN','USD',{USD:'1',VND:'25000'}),'31.03');
 assert.equal(accountCashflowItems(groups,'a','USD',{}).find(row=>row.itemKey==='BASE:1').in,'30.03');
 assert.equal(accountCashflowItems(groups,'','USD',{}).find(row=>row.itemKey==='BASE:1').in,null);
 const slices=cashflowSegments(items,'out');assert.equal(slices.length,2);assert.equal(slices.at(-1).end,Math.PI*1.5);
 assert.throws(()=>accountCashFlowReport(accounts,[entry('x','foreign','IN','1',null)]),/LEDGER_ACCOUNT_NOT_FOUND/);
 const large=accountCashFlowReport(accounts,[entry('large','a','IN','9007199254740993.99',null),entry('small','a','IN','0.01',null)]);
 assert.equal(large[0].amount,'9007199254740994.00');assert.equal(accountCashflowItems(large,'','USD',{})[0].in,'9007199254740994.00');
});

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
  payrollPayableItem:{findMany:async query=>{validateQuery('PayrollPayableItem',query);assert.equal(query.where.orgId,orgId);return [];}},
  accountingOpeningItem:{findMany:async()=>[]},bankLedgerAccount:{findMany:async query=>{assert.equal(query.where.orgId,orgId);return [{id:'a',currencyCode:'USD',openingDate:'2026-01-01',openingBalance:'100',bankName:'Bank',createdAt:new Date(),entityAccount:null}];}},
  organizationBankAccount:{findMany:async query=>{assert.deepEqual(query.where,{orgId,entityId:orgId});return [];}},
  bankLedgerEntry:{groupBy:async query=>{ranges.push(query.where.transactionDate);assert.equal(query.where.orgId,orgId);assert.equal(query.where.voidedAt,null);return [];},findMany:async query=>{validateQuery('BankLedgerEntry',query);if(query.select){assert.equal(query.where.orgId,orgId);assert.equal(query.where.voidedAt,null);assert.equal(query.where.transactionDate.lte,asOf);assert.ok(query.where.transactionDate.gte<asOf);return [];}assert.deepEqual(query.where,{orgId,voidedAt:null,transactionDate:yesterday});return entries;}},
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
