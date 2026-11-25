import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {ledgerReferenceRows} from '../frontend/src/utils/ledgerReferences.mjs';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {changeApprovalFixture,seedChangeApproval} from './helpers/change-approval-fixture.mjs';
const require=createRequire(import.meta.url);
const {postLedgerEntry,listLedgerActivity}=require('../backend/dist/services/bankLedger');
const {readLedgerEdit,ledgerEntryRevision}=require('../backend/dist/services/bankLedgerEdit');
const migration=await readFile('backend/prisma/migrations/20261125070000_ledger_management_numbers/migration.sql','utf8');
test('backfill preserves whole original rows, company/year scope, cancellations and deterministic order; retries, rollback and immutable numbers',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE TABLE "Organization"(id integer PRIMARY KEY);
   INSERT INTO "Organization" VALUES(1),(2);
   CREATE TABLE "BankLedgerEntry"(id text PRIMARY KEY,"orgId" integer,"transactionDate" text,"createdAt" timestamp,amount numeric,"evidenceNumber" text,"voidedAt" timestamp,"revisesEntryId" text,UNIQUE(id,"orgId"));
   INSERT INTO "BankLedgerEntry" VALUES
   ('b',1,'2026-11-10','2026-11-10',2085000,'EXP-2026-000003',NULL,NULL),
   ('a',1,'2026-11-10','2026-11-10',100,'original.pdf','2026-11-11',NULL),
   ('c',1,'2025-12-31','2026-11-11',200,'keep.png',NULL,'a'),
   ('d',2,'2026-11-01','2026-11-01',300,'other.pdf',NULL,NULL);`);
  const original=(await db.query('SELECT * FROM "BankLedgerEntry" ORDER BY id')).rows;
  await db.exec('BEGIN;'+migration+'COMMIT;');
  const numbers=(await db.query('SELECT * FROM "BankLedgerManagementNumber" ORDER BY "entryId"')).rows;
  assert.deepEqual(numbers.map(n=>n.managementNumber),['BNK-2026-000001','BNK-2026-000002','BNK-2025-000001','BNK-2026-000001']);
  assert.deepEqual((await db.query('SELECT * FROM "BankLedgerEntry" ORDER BY id')).rows,original);
  assert.equal((await db.query('SELECT count(*)::int AS count FROM "BankLedgerManagementNumber" n JOIN "BankLedgerEntry" b ON b.id=n."entryId" WHERE n."originalRow"=to_jsonb(b)')).rows[0].count,4);
  await db.exec('BEGIN;'+migration+'COMMIT;');
  assert.deepEqual((await db.query('SELECT * FROM "BankLedgerManagementNumber" ORDER BY "entryId"')).rows,numbers);
  await db.exec(`BEGIN; INSERT INTO "BankLedgerEntry" VALUES('rollback',1,'2026-11-12',now(),1,'',NULL,NULL); ROLLBACK;
   INSERT INTO "BankLedgerEntry" VALUES('new',1,'2026-11-12',now(),1,'',NULL,NULL);`);
  const next=(await db.query(`SELECT * FROM "BankLedgerManagementNumber" WHERE "entryId"='new'`)).rows[0];
  assert.equal(next.managementNumber,'BNK-2026-000003');assert.equal(next.origin,'AUTO');assert.equal(next.originalRow,null);
  await assert.rejects(db.exec(`UPDATE "BankLedgerManagementNumber" SET "managementNumber"='changed' WHERE "entryId"='new'`),/IMMUTABLE/);
  await assert.rejects(db.exec(`DELETE FROM "BankLedgerManagementNumber" WHERE "entryId"='new'`),/IMMUTABLE/);
  await assert.rejects(db.exec(`INSERT INTO "BankLedgerManagementNumber"("entryId","orgId","managementNumber",year,sequence,origin) VALUES('a',2,'WRONG',2026,20,'AUTO')`),/scope_fkey|duplicate/);
 }finally{await db.close();}
});
test('labels distinguish ledger identity, linked expenses, invoices and filenames in all three languages',()=>{
 for(const language of ['ko','en','vi']){
  const lines=ledgerReferenceRows({managementNumber:'BNK-2026-000001',expenseRequestNumbers:['EXP-2026-000003'],invoiceNumbers:['INV-2026-000002'],evidenceFilename:'Receipt.pdf'},language);
  assert.equal(new Set(lines.map(([label])=>label)).size,4);
  assert.deepEqual(lines.map(([,value])=>value),['BNK-2026-000001','EXP-2026-000003','INV-2026-000002','Receipt.pdf']);
 }
});
test('real Prisma reads, number search and duplicate submission retain one identity without altering ledger revisions',async()=>{
 const f=await changeApprovalFixture();
 try{
  const db=f.db,s=await seedChangeApproval(db),org=s.company.id;
  const body={clientKey:randomUUID(),transactionDate:'2026-04-02',direction:'IN',amount:'100',purpose:'Receipt',evidenceType:'FILE',evidenceNumber:'folder/Receipt.pdf',accountingCodeId:s.code.id,counterparty:{kind:'PARTNER',id:s.vendor.id}};
  const entry=await postLedgerEntry(db,org,'junior@example.test',s.account.id,body);
  const identity=await db.bankLedgerManagementNumber.findUnique({where:{entryId:entry.id}});
  assert.equal(identity.managementNumber,'BNK-2026-000001');
  const scalar=await db.bankLedgerEntry.findUnique({where:{id:entry.id}}),revision=ledgerEntryRevision(scalar);
  const edit=await readLedgerEdit(db,org,entry.id);
  assert.equal(edit.managementNumber,identity.managementNumber);assert.equal(edit.evidenceFilename,'Receipt.pdf');
  assert.equal(edit.revision,revision);
  const retry=await postLedgerEntry(db,org,'junior@example.test',s.account.id,body);
  assert.equal(retry.id,entry.id);assert.equal(await db.bankLedgerManagementNumber.count(),1);
  const listing=await listLedgerActivity(db,org,{start:'2026-04-01',end:'2026-04-30',search:identity.managementNumber});
  assert.equal(listing.rows.length,1);assert.equal(listing.rows[0].managementNumber,identity.managementNumber);assert.equal(listing.rows[0].evidenceFilename,'Receipt.pdf');
  await f.pg.exec('BEGIN;'+migration+'COMMIT;');
  assert.equal(ledgerEntryRevision(await db.bankLedgerEntry.findUnique({where:{id:entry.id}})),revision);
  assert.equal((await db.bankLedgerManagementNumber.findUnique({where:{entryId:entry.id}})).managementNumber,identity.managementNumber);
 }finally{await f.close();}
});
