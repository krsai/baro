import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {postLedgerBatch}=require('../backend/dist/services/bankLedger');
const {assertAccountingDirection,resolveAccountingCode}=require('../backend/dist/services/accountingCode');
test('direction guards reject mismatched ledger, fee and expense writes without reclassifying history',async()=>{
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
test('current direction rejects the exact batch row and rolls back earlier rows; completed retries preserve history',async()=>{
 const f=await changeApprovalFixture();try{
  const s=await seedChangeApproval(f.db),orgId=s.company.id,code=s.code.id;
  await f.db.transactionCodeBase.update({where:{id:s.code.baseId},data:{cashDirection:'IN'}});
  const row=direction=>({entryKind:'BANK',clientKey:randomUUID(),accountId:s.account.id,transactionDate:'2026-04-02',direction,amount:'10',purpose:'Cash',remark:'Cash',accountingCodeId:code,evidenceType:'FILE',evidenceNumber:'REF',counterparty:{kind:'PARTNER',id:s.vendor.id}});
  const failed={clientKey:randomUUID(),accountingCodeVersion:1,rows:[row('IN'),row('OUT')]};
  await assert.rejects(postLedgerBatch(f.db,orgId,'actor@test',failed),/LEDGER_ROW:2:ACCOUNTING_CODE_DIRECTION_MISMATCH/);
  assert.equal(await f.db.bankLedgerEntry.count(),0);assert.equal(await f.db.bankLedgerBatch.count(),0);
  const body={...failed,clientKey:randomUUID(),rows:[row('IN')]},saved=await postLedgerBatch(f.db,orgId,'actor@test',body);
  await f.db.transactionCodeBase.update({where:{id:s.code.baseId},data:{cashDirection:'OUT'}});
  assert.deepEqual(await postLedgerBatch(f.db,orgId,'actor@test',body),saved);
  assert.equal(await f.db.bankLedgerEntry.count(),1);
  assert.throws(()=>assertAccountingDirection({base:{cashDirection:'IN'}},'OUT'),/ACCOUNTING_CODE_DIRECTION_MISMATCH/);
  assert.doesNotThrow(()=>assertAccountingDirection({base:{cashDirection:'BOTH'}},'OUT'));
 }finally{await f.close();}
});
