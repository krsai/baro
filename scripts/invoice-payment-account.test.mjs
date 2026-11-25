import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {paymentAccountFields,paymentAccountText} from '../frontend/src/utils/invoicePaymentAccount.mjs';
import {buildIssuedInvoicePrintHtml} from '../frontend/src/utils/issuedInvoicePrint.mjs';
const require=createRequire(import.meta.url);
const {resolveInvoicePaymentAccount,listInvoicePaymentAccounts}=require('../backend/dist/services/invoicePaymentAccount');
const migration=await readFile(new URL('../backend/prisma/migrations/20261125030000_invoice_payment_accounts/migration.sql',import.meta.url),'utf8');
const account={id:'chosen',orgId:1,entityId:1,accountKind:'BANK',isActive:true,bankName:'Selected Bank',accountNumber:'000123',accountHolder:'BARO',swiftCode:'ASCBVNVX',updatedAt:new Date('2026-11-25T00:00:00Z'),currency:{code:'USD'}};

test('explicit own-company bank selection overrides defaults and rejects stale, foreign and cash account IDs',async()=>{
 const db={$queryRawUnsafe:async()=>[],organizationBankAccount:{findFirst:async({where})=>{assert.deepEqual(where,{id:where.id,orgId:1,entityId:1,accountKind:'BANK',isActive:true});return where.id==='chosen'?account:null;},findMany:async({where,select})=>{assert.deepEqual(where,{orgId:1,entityId:1,accountKind:'BANK',isActive:true});assert.equal(select.swiftCode,true);assert.equal('ledgerAccounts' in select,false);return [account];}}};
 const fields={...paymentAccountFields({...account,updatedAt:account.updatedAt.toISOString()}),bank:'Forged bank text'};
 await resolveInvoicePaymentAccount(db,1,fields);
 assert.equal(fields.bankAccountId,'chosen');assert.match(fields.bank,/Bank Name: Selected Bank/);assert.match(fields.bank,/Account Number: 000123/);assert.match(fields.bank,/SWIFT Code: ASCBVNVX/);
 await assert.rejects(resolveInvoicePaymentAccount(db,1,{bankAccountId:'foreign'}),/INVOICE_BANK_ACCOUNT_INVALID/);
 await assert.rejects(resolveInvoicePaymentAccount(db,1,{bankAccountId:'cash'}),/INVOICE_BANK_ACCOUNT_INVALID/);
 await assert.rejects(resolveInvoicePaymentAccount(db,1,{bankAccountId:'chosen',bankAccountRevision:'old'}),/INVOICE_BANK_ACCOUNT_CHANGED/);
 assert.equal((await listInvoicePaymentAccounts(db,1)).length,1);
 const legacy={bank:'Frozen / Original / Instructions'};await resolveInvoicePaymentAccount(db,1,legacy);assert.deepEqual(legacy,{bank:'Frozen / Original / Instructions'});
 const cleared={bankAccountId:null,bank:'Old',bankAccountSnapshot:{bankName:'Old'}};await resolveInvoicePaymentAccount(db,1,cleared);assert.equal(cleared.bank,'');assert.equal('bankAccountSnapshot' in cleared,false);
 for(const language of ['ko','en','vi']){const text=paymentAccountText(fields,language);assert.match(text,/000123/);assert.match(text,/ASCBVNVX/);const html=buildIssuedInvoicePrintHtml({status:'ISSUED',snapshot:{templateVersion:'BARO_INVOICE_V1',documentKind:'GENERAL',fields,lines:[],orders:[],currencyCode:'USD',total:'0',subtotal:'0',vatAmount:'0'}},language);assert.match(html,/ASCBVNVX/);assert.match(html,/000123/);}
});

test('bank account migration retries preserve original snapshots and enforce own bank FKs and SWIFT format',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE "OrganizationBankAccount"(id text,"orgId" int,"entityId" int,"accountKind" text,UNIQUE(id,"orgId"));INSERT INTO "OrganizationBankAccount" VALUES('own',1,1,'BANK'),('partner',1,2,'BANK'),('foreign',2,2,'BANK'),('cash',1,1,'CASH');
   CREATE TABLE "Invoice"(id text PRIMARY KEY,"sellerOrgId" int,snapshot jsonb);INSERT INTO "Invoice" VALUES('old',1,'{"fields":{"bank":"Original Frozen Bank"}}');
   CREATE TABLE "InvoiceDraft"(id text PRIMARY KEY,"sellerOrgId" int,content jsonb);`);
  await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query(`SELECT snapshot->'fields'->>'bank' AS bank FROM "Invoice" WHERE id='old'`)).rows[0].bank,'Original Frozen Bank');
  for(const table of ['Invoice','InvoiceDraft']){
   const column=table==='Invoice'?'snapshot':'content';
   const insert=id=>db.query(`INSERT INTO "${table}"(id,"sellerOrgId","bankAccountId",${column}) VALUES($1,1,$2,$3)`,[table+id,id,{fields:{bankAccountId:id,bank:'Chosen Bank'}}]);
   await insert('own');for(const bad of ['partner','foreign','cash'])await assert.rejects(insert(bad),/INVOICE_BANK_ACCOUNT_INVALID|foreign key/);
  }
  await db.exec(`UPDATE "OrganizationBankAccount" SET "swiftCode"='ASCBVNVX' WHERE id='own'`);
  await assert.rejects(db.exec(`UPDATE "OrganizationBankAccount" SET "swiftCode"='bad' WHERE id='own'`),/check constraint/);
  await assert.rejects(db.exec(`UPDATE "OrganizationBankAccount" SET "swiftCode"='ASCBVNVX' WHERE id='cash'`),/check constraint/);
  await assert.rejects(db.exec(`DELETE FROM "OrganizationBankAccount" WHERE id='own'`),/foreign key/);
 }finally{await db.close();}
});
