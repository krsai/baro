import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {registerExpenseRequest}=require('../backend/dist/services/expenseRequest');
const {postLedgerBatch}=require('../backend/dist/services/bankLedger');
const {accountingDirectionAnomaly,resolveAccountingCode}=require('../backend/dist/services/accountingCode');
test('historical migration is unchanged and retains its original guards',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "TransactionCodeBase"(id INT PRIMARY KEY);CREATE TABLE "TransactionCode"(id INT,"ownerOrgId" INT,"baseId" INT);
   CREATE TABLE "BankLedgerEntry"(id INT,"orgId" INT,"accountingCodeId" INT,direction TEXT);CREATE TABLE "BankLedgerSettlementLine"("orgId" INT,"accountingCodeId" INT);
   CREATE TABLE "PartnerTransactionCost"("orgId" INT,"transactionCodeId" INT);INSERT INTO "TransactionCodeBase" VALUES(1);INSERT INTO "TransactionCode" VALUES(10,7,1);INSERT INTO "BankLedgerEntry" VALUES(1,7,10,'OUT');`);
  await db.exec(readFileSync('backend/prisma/migrations/20261105010000_accounting_cash_direction/migration.sql','utf8'));
  assert.equal((await db.query('SELECT "cashDirection" FROM "TransactionCodeBase"')).rows[0].cashDirection,'BOTH');
  await db.exec(`UPDATE "TransactionCodeBase" SET "cashDirection"='IN';INSERT INTO "BankLedgerEntry" VALUES(2,7,10,'IN');`);
  for(const sql of [`INSERT INTO "BankLedgerEntry" VALUES(3,7,10,'OUT')`,`INSERT INTO "BankLedgerSettlementLine" VALUES(7,10)`,`INSERT INTO "PartnerTransactionCost" VALUES(7,10)`])await assert.rejects(db.exec(sql),/ACCOUNTING_CODE_DIRECTION_MISMATCH/);
  assert.equal((await db.query('SELECT direction FROM "BankLedgerEntry" WHERE id=1')).rows[0].direction,'OUT');
  await assert.rejects(db.exec(`UPDATE "TransactionCodeBase" SET "cashDirection"='INVALID'`),/cashDirection_check/);
  await db.exec(`UPDATE "TransactionCodeBase" SET "cashDirection"='OUT';INSERT INTO "PartnerTransactionCost" VALUES(7,10);INSERT INTO "BankLedgerSettlementLine" VALUES(7,10);`);
  await assert.rejects(db.exec(`INSERT INTO "BankLedgerEntry" VALUES(4,7,10,'IN')`),/ACCOUNTING_CODE_DIRECTION_MISMATCH/);
 }finally{await db.close();}
});
test('unusual directions save, are detected by the current basis, and retries preserve history',async()=>{
 const f=await changeApprovalFixture();try{
  const s=await seedChangeApproval(f.db),orgId=s.company.id,code=s.code.id;
  await f.db.transactionCodeBase.update({where:{id:s.code.baseId},data:{cashDirection:'IN'}});
  const row=direction=>({entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-04-02',direction,amount:'10',purpose:'Cash',remark:'Cash',accountingCodeId:code,evidenceType:'FILE',evidenceNumber:'REF',counterparty:{kind:'PARTNER',id:s.vendor.id}});
  const failed={clientKey:randomUUID(),accountingCodeVersion:1,rows:[row('IN'),row('OUT')]};
  await postLedgerBatch(f.db,orgId,'actor@test',failed);
  assert.equal(await f.db.bankLedgerEntry.count(),2);
  const anomalies=await f.db.$queryRawUnsafe('SELECT * FROM \"AccountingDirectionAnomaly\" WHERE \"orgId\"=$1',orgId);assert.equal(anomalies.length,1);assert.equal(anomalies[0].actualDirection,'OUT');
  const body={...failed,clientKey:randomUUID(),rows:[row('IN')]},saved=await postLedgerBatch(f.db,orgId,'actor@test',body);
  await f.db.transactionCodeBase.update({where:{id:s.code.baseId},data:{cashDirection:'OUT'}});
  assert.deepEqual(await postLedgerBatch(f.db,orgId,'actor@test',body),saved);
  assert.equal(await f.db.bankLedgerEntry.count(),3);
  assert.equal(accountingDirectionAnomaly({base:{cashDirection:'IN'}},'OUT'),true);
  assert.equal(accountingDirectionAnomaly({base:{cashDirection:'BOTH'}},'OUT'),false);
  await f.db.transactionCodeBase.update({where:{id:s.code.baseId},data:{cashDirection:'IN'}});
  const expense=await f.db.$transaction(tx=>registerExpenseRequest(tx,orgId,s.people.admin.id,{partnerOrgId:s.vendor.id,requestDate:'2026-04-02',clientKey:randomUUID(),items:[{transactionCodeId:code,currency:'USD',unitPrice:'10',quantity:'1',vatRate:'0',details:{reference:'R1',evidenceFile:'file.pdf'}}]}),{timeout:30000});
  assert.ok(expense.id);const warnings=await f.db.$queryRawUnsafe('SELECT * FROM \"AccountingDirectionAnomaly\" WHERE \"orgId\"=$1 AND \"sourceKind\"=\'EXPENSE\'',orgId);assert.equal(warnings.length,1);
  assert.deepEqual(await f.db.$queryRawUnsafe('SELECT * FROM \"AccountingDirectionAnomaly\" WHERE \"orgId\"=$1',s.other.id),[]);
 }finally{await f.close();}
});
