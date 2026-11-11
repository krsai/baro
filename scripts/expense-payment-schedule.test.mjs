import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {paymentScheduleError,allocateScheduledPayment,paymentAllocationAmount} from '../frontend/src/utils/expensePaymentSchedule.mjs';
const require=createRequire(import.meta.url);
const {normalizeExpensePaymentSchedule,validateExpensePaymentScheduleTotals,expensePaymentScheduleStatus}=require('../backend/dist/services/expensePaymentSchedule.js');
const {resolveEvidence}=require('../backend/dist/services/bankEvidence.js');
const rows=()=>[{id:'advance-0001',label:'선급금',scheduledDate:'2026-11-30',currency:'VND',amount:'40000000'},{id:'balance-0001',label:'잔금',scheduledDate:'2026-12-10',currency:'VND',amount:'60000000'}];

test('per-item plans default to single payment and validate exact tax-inclusive totals independently',()=>{
 assert.deepEqual(normalizeExpensePaymentSchedule(undefined),[]);
 const plan=normalizeExpensePaymentSchedule(rows()).map(row=>({...row,expenseItemId:'cost1'}));
 validateExpensePaymentScheduleTotals(plan,[{id:'cost1',currency:'VND',amount:'100000000'},{id:'cost2',currency:'USD',amount:'25'}]);
 assert.throws(()=>validateExpensePaymentScheduleTotals(plan,[{id:'cost1',currency:'VND',amount:'99999999'}]),/TOTAL_MISMATCH/);
 assert.equal(paymentScheduleError(rows(),[{currency:'VND',amount:'100000000'}]),null);
 assert.equal(paymentScheduleError(rows(),[{currency:'VND',amount:'99999999'}]),'mismatch');
 for(const change of [{scheduledDate:'2026-02-30'},{amount:'0'},{amount:'1.1'},{currency:'EUR'},{label:' '},{id:'balance-0001'}])assert.throws(()=>normalizeExpensePaymentSchedule([{...rows()[0],...change},rows()[1]]));
 const usd=rows().map((row,index)=>({...row,currency:'USD',amount:index?'0.20':'0.10'}));
 validateExpensePaymentScheduleTotals(normalizeExpensePaymentSchedule(usd).map(row=>({...row,expenseItemId:'usd'})),[{id:'usd',currency:'USD',amount:'0.30'}]);
});

test('installment suggestion allocates only its own expense item and keeps the exact amount',()=>{
 assert.equal(paymentAllocationAmount('40000000.00','VND'),'40000000');
 assert.equal(paymentAllocationAmount('0.10','USD'),'0.10');
 assert.equal(paymentAllocationAmount('1.10','VND'),'1.10');
 const document={items:[{id:'other',description:'Other',remaining:'5000000'},{id:'cost1',description:'Machine',remaining:'100000000'}]};
 assert.deepEqual(allocateScheduledPayment(document,{...rows()[0],expenseItemId:'cost1',remaining:'40000000'}),{paymentScheduleId:'advance-0001',amount:'40000000',expenseItems:[{itemId:'cost1',amount:'40000000',label:'Machine'}]});
});

function ledgerFixture(){
 const schedule={...rows()[0],expenseItemId:'cost1',orgId:1,requestId:1,active:true};
 let paid='0';
 const cost={id:'cost1',orgId:1,expenseRequestId:1,expenseRequestLine:1,currency:'VND',amount:'100000000'};
 const tx={accountingOpeningItem:{findMany:async()=>[]},$queryRawUnsafe:async()=>[],
  partnerTransactionCost:{findMany:async()=>[cost],findFirst:async()=>cost},
  expenseRequest:{findFirst:async()=>({id:1,orgId:1,version:1,createdByEmployeeId:10,createdByEmployee:{id:10,orgId:1,status:'ACTIVE',orgRole:'ADMIN'},approvalSteps:[]})},
  expenseApprovalDecision:{findMany:async()=>[]},expenseRequestAudit:{findFirst:async()=>null},
  expensePaymentSchedule:{findMany:async({where})=>{assert.equal(where.orgId,1);return [schedule];}},
  bankLedgerEvidenceAllocation:{findMany:async({where})=>{assert.equal(where.orgId,1);assert.deepEqual(where.entry,{voidedAt:null});return paid==='0'?[]:[{amount:paid}];}}
 };
 const body={evidenceType:'EXPENSE',direction:'OUT',amount:'40000000',expenseRequestId:1,expenseVersion:1,paymentScheduleId:schedule.id,expenseItems:[{itemId:'cost1',amount:'40000000'}]};
 return {tx,body,schedule,setPaid:value=>{paid=value;}};
}
test('actual payment requires the selected item installment, current approval and no overpayment',async()=>{
 const f=ledgerFixture();
 const result=await resolveEvidence(f.tx,1,{currencyCode:'VND'},f.body);
 assert.equal(result.allocations[0].paymentScheduleId,'advance-0001');
 await assert.rejects(resolveEvidence(f.tx,1,{currencyCode:'VND'},{...f.body,paymentScheduleId:null}),/INVALID_EXPENSE_PAYMENT_SCHEDULE/);
 await assert.rejects(resolveEvidence(f.tx,1,{currencyCode:'VND'},{...f.body,paymentScheduleId:'foreign'}),/INVALID_EXPENSE_PAYMENT_SCHEDULE/);
 await assert.rejects(resolveEvidence(f.tx,1,{currencyCode:'VND'},{...f.body,expenseVersion:2}),/CHANGED/);
 f.setPaid('10000000');
 await assert.rejects(resolveEvidence(f.tx,1,{currencyCode:'VND'},f.body),/EXCEEDS_DOCUMENT/);
 const partial=await resolveEvidence(f.tx,1,{currencyCode:'VND'},{...f.body,amount:'30000000',expenseItems:[{itemId:'cost1',amount:'30000000'}]});
 assert.equal(partial.allocations[0].amount,'30000000');
 f.schedule.expenseItemId='other';
 await assert.rejects(resolveEvidence(f.tx,1,{currencyCode:'VND'},f.body),/INVALID_EXPENSE_PAYMENT_SCHEDULE/);
});

test('paid and remaining are based on valid ledger allocations and edit excludes the replaced entry',async()=>{
 const db={expensePaymentSchedule:{findMany:async({where})=>{assert.deepEqual(where,{orgId:1,requestId:1,active:true});return [{...rows()[0],expenseItemId:'cost1'}];}},bankLedgerEvidenceAllocation:{findMany:async({where})=>{assert.deepEqual(where.entry,{voidedAt:null});assert.deepEqual(where.entryId,{not:'old'});return [{paymentScheduleId:'advance-0001',amount:'10000000',entryId:'new',entry:{transactionDate:'2026-11-30'}}];}}};
 const result=await expensePaymentScheduleStatus(db,1,1,'old');
 assert.equal(result[0].paid,'10000000');assert.equal(result[0].remaining,'30000000');assert.equal(result[0].payments[0].date,'2026-11-30');
});

test('migration enforces company/item FKs, audit, totals, immutable payment history and transaction rollback',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "ExpenseRequest"(id INT,"orgId" INT,version INT,UNIQUE(id,"orgId"));
   CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"expenseRequestId" INT,currency TEXT,amount NUMERIC,UNIQUE(id,"orgId"));
   CREATE TABLE "ExpenseRequestAudit"("requestId" INT,"orgId" INT,version INT,"afterSnapshot" JSONB);
   CREATE TABLE "BankLedgerEntry"(id TEXT PRIMARY KEY,"voidedAt" TIMESTAMP); INSERT INTO "BankLedgerEntry" VALUES('entry',NULL);
   CREATE TABLE "BankLedgerEvidenceAllocation"(id TEXT PRIMARY KEY,"entryId" TEXT DEFAULT 'entry',"orgId" INT,"expenseItemId" TEXT,amount NUMERIC);
   INSERT INTO "ExpenseRequest" VALUES(1,1,1),(2,2,1);
   INSERT INTO "PartnerTransactionCost" VALUES('cost1',1,1,'VND',100000000),('cost2',2,2,'VND',100000000);`);
  const sql=await readFile('backend/prisma/migrations/20261110010000_expense_payment_schedule/migration.sql','utf8');
  await db.exec(sql);
  const plan=rows().map((row,index)=>({...row,position:index+1,expenseItemId:'cost1'}));
  await db.exec('BEGIN');
  await db.query("SELECT set_config('baro.expense_editor_org','1',true)");
  for(const row of plan)await db.query('INSERT INTO "ExpensePaymentSchedule"(id,"orgId","requestId","expenseItemId",position,label,"scheduledDate",currency,amount) VALUES($1,1,1,$2,$3,$4,$5,$6,$7)',[row.id,row.expenseItemId,row.position,row.label,row.scheduledDate,row.currency,row.amount]);
  await db.query('INSERT INTO "ExpenseRequestAudit" VALUES(1,1,1,$1)',[JSON.stringify({document:{paymentSchedule:plan}})]);
  await db.exec('COMMIT');
  await db.exec(`INSERT INTO "BankLedgerEvidenceAllocation"(id,"orgId","expenseItemId",amount,"paymentScheduleId") VALUES('a',1,'cost1',40000000,'advance-0001')`);
  await assert.rejects(db.exec(`INSERT INTO "BankLedgerEvidenceAllocation"(id,"orgId","expenseItemId",amount,"paymentScheduleId") VALUES('b',2,'cost2',1,'advance-0001')`));
  await assert.rejects(db.exec(`INSERT INTO "BankLedgerEvidenceAllocation"(id,"orgId","expenseItemId",amount,"paymentScheduleId") VALUES('c',1,'cost2',1,'advance-0001')`),/INVALID_EXPENSE_PAYMENT_SCHEDULE/);
  await assert.rejects(db.exec(`UPDATE "ExpensePaymentSchedule" SET amount=39999999 WHERE id='advance-0001'`),/REFERENCED/);
  await assert.rejects(db.exec(`DELETE FROM "ExpensePaymentSchedule" WHERE id='balance-0001'`),/PRESERVE_HISTORY/);
  await db.exec('BEGIN');await db.query("SELECT set_config('baro.expense_editor_org','1',true)");
  await db.exec(`UPDATE "ExpensePaymentSchedule" SET active=false WHERE id='balance-0001'`);
  await assert.rejects(db.exec('COMMIT'),/AUDIT_REQUIRED/);
  assert.equal((await db.query('SELECT count(*)::int n FROM "ExpensePaymentSchedule" WHERE active')).rows[0].n,2);
 }finally{await db.close();}
});
