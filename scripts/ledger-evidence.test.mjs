import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
const require=createRequire(import.meta.url);
const {resolveEvidence,approveExpense}=require('../backend/dist/services/bankEvidence.js');
const {postLedgerEntry}=require('../backend/dist/services/bankLedger.js');
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY);INSERT INTO "Organization" VALUES(1),(2);
 CREATE TABLE "Employee"(id INT,"orgId" INT,status TEXT,"orgRole" TEXT,UNIQUE(id,"orgId"));INSERT INTO "Employee" VALUES(10,1,'ACTIVE','ADMIN'),(11,1,'ACTIVE','ACCOUNTANT');
 CREATE TABLE "ExpenseRequest"(id INT,"orgId" INT,version INT,UNIQUE(id,"orgId"));INSERT INTO "ExpenseRequest" VALUES(1,1,1);
 CREATE TABLE "ExpenseRequestApprovalStep"(id TEXT,"orgId" INT,"requestId" INT,position INT,"employeeId" INT);INSERT INTO "ExpenseRequestApprovalStep" VALUES('s1',1,1,1,10),('s2',1,1,2,11);
 CREATE TABLE "Invoice"(id TEXT PRIMARY KEY,"sellerOrgId" INT,status TEXT,"currencyCode" TEXT,total NUMERIC,"invoiceNumber" TEXT);INSERT INTO "Invoice" VALUES('i1',1,'ISSUED','USD',10000,'INV-1'),('i2',2,'ISSUED','USD',10000,'INV-2');
 CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"expenseRequestId" INT,"expenseRequestLine" INT,currency TEXT,amount NUMERIC,description TEXT);INSERT INTO "PartnerTransactionCost" VALUES('c1',1,1,1,'USD',100,'Expense');`);
 await db.exec(await readFile('backend/prisma/migrations/20261027160100_bank_ledger/migration.sql','utf8'));
 // Old transactions are preserved without rewriting their evidence.
 await db.exec(`INSERT INTO "BankLedgerAccount"(id,"orgId","clientKey","bankName","accountNumber","accountHolder","currencyCode","openingDate","openingBalance","createdBy") VALUES('a',1,'a','B','001','C','USD','2026-01-01',0,'actor');
 INSERT INTO "BankLedgerEntry"(id,"orgId","accountId","clientKey","transactionDate",direction,amount,purpose,"evidenceNumber","createdBy") VALUES('old',1,'a','old','2026-01-01','IN',1,'Legacy','old-ref','actor');`);
 await db.exec(await readFile('backend/prisma/migrations/20261027210000_ledger_evidence/migration.sql','utf8'));
 await db.exec(await readFile('backend/prisma/migrations/20261027210100_ledger_evidence_delete/migration.sql','utf8'));
 return db;
}
const entry=(id,type,amount,fee=0,direction='IN',reference='evidence.pdf')=>`INSERT INTO "BankLedgerEntry"(id,"orgId","accountId","clientKey","transactionDate",direction,amount,purpose,"evidenceNumber","createdBy","evidenceType","bankFee") VALUES('${id}',1,'a','${id}','2026-01-02','${direction}',${amount},'Reason','${reference}','actor','${type}',${fee});`;
async function rejectTx(db,sql,pattern){try{await assert.rejects(db.exec(`BEGIN;${sql}COMMIT;`),pattern);}finally{await db.exec('ROLLBACK');}}
test('database keeps old evidence, requires file evidence, and permits reasoned balance adjustments',async()=>{
 const db=await fixture();try{
  assert.deepEqual((await db.query(`SELECT amount::text,"evidenceNumber","evidenceType" FROM "BankLedgerEntry" WHERE id='old'`)).rows,[{amount:'1.0000',evidenceNumber:'old-ref',evidenceType:'FILE'}]);
  await assert.rejects(db.exec(entry('missing','FILE',10,0,'IN','')),/LEDGER_FILE_REQUIRED/);
  await db.exec(`INSERT INTO "PartnerTransactionCost"(id,"orgId",currency,amount) VALUES('unlinked',1,'USD',10);DELETE FROM "PartnerTransactionCost" WHERE id='unlinked';`);assert.equal((await db.query(`SELECT count(*)::int AS n FROM "PartnerTransactionCost" WHERE id='unlinked'`)).rows[0].n,0);
  await db.exec(entry('file','FILE',10));await db.exec(entry('adjust','ADJUSTMENT',5,0,'OUT',''));
  await assert.rejects(db.exec(`UPDATE "BankLedgerEntry" SET amount=999 WHERE id='file'`),/LEDGER_ENTRY_IMMUTABLE/);
 }finally{await db.close();}
});
test('invoice net receipt plus fee can match partially; missing allocations, other company and over-allocation fail',async()=>{
 const db=await fixture();try{
  await db.exec(`BEGIN;${entry('receipt','INVOICE',9980,20)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m1','receipt',1,'i1',10000);COMMIT;`);
  await rejectTx(db,entry('missing','INVOICE',1),/LEDGER_ALLOCATION_MISMATCH/);
  await rejectTx(db,`${entry('foreign','INVOICE',1)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m2','foreign',1,'i2',1);`,/foreign key/);
  await rejectTx(db,`${entry('over','INVOICE',1)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m3','over',1,'i1',1);`,/LEDGER_EXCEEDS_DOCUMENT/);
  await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=now(),"voidedBy"='actor',"voidReason"='wrong' WHERE id='receipt'`);
  await db.exec(`BEGIN;${entry('partial','INVOICE',4980,20)}INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","invoiceId",amount) VALUES('m4','partial',1,'i1',5000);COMMIT;`);
 }finally{await db.close();}
});
test('expense item requires sequential approvals for current version, checks allocation and locks reconciled content',async()=>{
 const db=await fixture();const allocation=`INSERT INTO "BankLedgerEvidenceAllocation"(id,"entryId","orgId","expenseItemId","requestVersion",amount) VALUES('x','expense',1,'c1',1,50);`;
 try{
  await rejectTx(db,entry('expense','EXPENSE',51,1,'OUT')+allocation,/LEDGER_EXPENSE_NOT_APPROVED/);
  await assert.rejects(db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES('d2',1,1,1,2,11,now())`),/EXPENSE_APPROVAL_NOT_YOUR_TURN/);
  await db.exec(`INSERT INTO "ExpenseApprovalDecision" VALUES('d1',1,1,1,1,10,now()),('d2',1,1,1,2,11,now())`);
  await rejectTx(db,entry('expense','EXPENSE',100,1,'OUT')+allocation,/LEDGER_ALLOCATION_MISMATCH/);
  await db.exec('BEGIN;'+entry('expense','EXPENSE',51,1,'OUT')+allocation+'COMMIT;');
  await assert.rejects(db.exec(`UPDATE "PartnerTransactionCost" SET amount=90 WHERE id='c1'`),/EXPENSE_ALREADY_RECONCILED/);
  await assert.rejects(db.exec(`UPDATE "ExpenseRequest" SET version=2 WHERE id=1`),/EXPENSE_ALREADY_RECONCILED/);
  await assert.rejects(db.exec(`DELETE FROM "ExpenseApprovalDecision"`),/EVIDENCE_APPEND_ONLY/);
  await db.exec(`UPDATE "BankLedgerEntry" SET "voidedAt"=now(),"voidedBy"='actor',"voidReason"='wrong' WHERE id='expense';UPDATE "ExpenseRequest" SET version=2 WHERE id=1;`);
  await rejectTx(db,entry('expense2','EXPENSE',50,0,'OUT')+allocation.replaceAll("'expense'","'expense2'").replace("'x'","'x2'"),/LEDGER_EXPENSE_NOT_APPROVED/);
 }finally{await db.close();}
});
test('service validates invoice scope, actual receipt and fees without forcing full settlement',async()=>{
 const invoices=[{id:'i',sellerOrgId:1,invoiceNumber:'INV-1',status:'ISSUED',currencyCode:'USD',total:'10000'}];
 const tx={$queryRawUnsafe:async()=>[],invoice:{findFirst:async({where})=>invoices.find(i=>Object.entries(where).every(([k,v])=>i[k]===v))},bankLedgerEvidenceAllocation:{findMany:async()=>[]}};
 const body={evidenceType:'INVOICE',direction:'IN',evidenceNumber:'INV-1',amount:'4980',bankFee:'20'};
 const result=await resolveEvidence(tx,1,{currencyCode:'USD'},body);assert.equal(result.allocations[0].amount,'5000.00');
 await assert.rejects(resolveEvidence(tx,2,{currencyCode:'USD'},body),/INVOICE_NOT_FOUND/);
 await assert.rejects(resolveEvidence(tx,1,{currencyCode:'VND'},body),/INVOICE_NOT_FOUND/);
 await assert.rejects(resolveEvidence(tx,1,{currencyCode:'USD'},{...body,amount:'10000'}),/EXCEEDS_DOCUMENT/);
});
test('first transaction initializes an owned business account only with explicit opening balance, and retries keep one transaction',async()=>{
 let account=null,row=null;let creates=0;
 const tx={$queryRawUnsafe:async()=>[],organizationBankAccount:{findFirst:async({where})=>where.entityId===1&&where.orgId===1?{id:'master',currency:{code:'USD'},bankName:'',accountNumber:'',accountHolder:''}:null},bankLedgerAccount:{findFirst:async({where})=>account&&where.orgId===account.orgId&&(!where.id||where.id===account.id)&&(!where.entityAccountId||where.entityAccountId===account.entityAccountId)?account:null,create:async({data})=>account={id:'ledger',...data}},bankLedgerEntry:{findUnique:async()=>row,create:async({data})=>{creates++;return row={id:'entry',...data};}}};tx.$transaction=async fn=>fn(tx);
 const body={clientKey:'11111111-1111-4111-8111-111111111111',openingDate:'2026-01-01',openingBalance:'0',transactionDate:'2026-01-02',direction:'IN',amount:'10',purpose:'Received',evidenceNumber:'receipt.pdf',evidenceType:'FILE',bankFee:'0'};
 await postLedgerEntry(tx,1,'actor','entity:master',body);await postLedgerEntry(tx,1,'actor','entity:master',body);assert.equal(creates,1);assert.equal(account.openingBalance,'0.00');
 await assert.rejects(postLedgerEntry(tx,2,'actor','entity:master',body),/ACCOUNT_NOT_FOUND/);
 await assert.rejects(postLedgerEntry(tx,1,'actor','entity:master',{...body,evidenceNumber:'different.pdf'}),/RETRY_CONFLICT/);
});
test('approval service uses active employee identity and only the designated next approver',async()=>{
 const decisions=[],request={id:1,orgId:1,version:1,approvalSteps:[{id:'s1',position:1,employeeId:10},{id:'s2',position:2,employeeId:11}]};
 const tx={$queryRawUnsafe:async()=>[],employee:{findFirst:async({where})=>[10,11].includes(where.id)?where:null},expenseRequest:{findFirst:async()=>request},expenseApprovalDecision:{findMany:async()=>decisions,create:async({data})=>{decisions.push(data);return data;}}};tx.$transaction=async fn=>fn(tx);
 await assert.rejects(approveExpense(tx,1,11,1,1),/NOT_YOUR_TURN/);await assert.rejects(approveExpense(tx,1,99,1,1),/ACCESS_DENIED/);
 assert.equal((await approveExpense(tx,1,10,1,1)).approved,false);await approveExpense(tx,1,10,1,1);assert.equal(decisions.length,1);assert.equal((await approveExpense(tx,1,11,1,1)).approved,true);
 await assert.rejects(approveExpense(tx,1,10,1,2),/REQUEST_CHANGED/);
});
