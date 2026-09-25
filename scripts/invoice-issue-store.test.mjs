import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const { calculateInvoiceIssueSnapshot, createInvoiceRevisionDraft, recordInvoicePayment, replaceInvoicePaymentAllocations, voidInvoicePayment } = require('../backend/dist/services/invoiceIssueStore.js');
const [schema, migration, routes] = await Promise.all([
  readFile(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8'),
  readFile(new URL('../backend/migration_fix.sql', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/routes/invoiceDraft.routes.ts', import.meta.url), 'utf8'),
]);

const source = (orderId, orderNumber, unitPrice) => ({
  orderId, orderNumber, workOrderId: Number(orderId.slice(1)), sourceUpdatedAt: '2026-09-22T00:00:00.000Z',
  styles: [{ styleId: 10, prices: [{ pricingBasis: 'MANUFACTURING_SERVICE_PRICE', currencyCode: 'USD', versionId: 3,
    entries: [{ quantity: 1, unitPrice, priceId: 9 }] }] }],
  lines: [{ key: '11:', itemId: 11, styleId: 10, styleCode: 'S1', description: 'Jacket', color: 'Black', gender: 'U', size: '', orderedQuantity: 3 }],
});
const content = {
  basis: 'MANUFACTURING_SERVICE_PRICE', currency: 'USD', fields: { number: 'INV-1', date: '2026-09-22' },
  orders: [{ orderId: 'o1' }, { orderId: 'o2' }], percentages: { o1: '100', o2: '50' },
  lines: [
    { key: JSON.stringify(['o1', '11:']), quantity: '3', remark: '', adjustmentReason: '', hsCode: '', origin: '' },
    { key: JSON.stringify(['o2', '11:']), quantity: '3', remark: '', adjustmentReason: '', hsCode: '', origin: '' },
  ],
};

test('issued snapshot prices each order independently and stores per-order settlement amounts', () => {
  const result = calculateInvoiceIssueSnapshot(content, [source('o1', 'A', '1.2345'), source('o2', 'B', '2.0000')]);
  assert.equal(result.subtotal, '9.70');
  assert.equal(result.total, '6.70');
  assert.deepEqual(result.orders.map(row => [row.sourceOrderId, row.billingPercentage, row.basisAmount, row.billedAmount]), [
    ['o1', '100', '3.70', '3.70'], ['o2', '50', '6.00', '3.00'],
  ]);
  assert.equal(result.lines[0].unitPrice, '1.2345');
  assert.equal(result.lines[0].amount, '3.70');
});

test('issued snapshot fails closed when a current price is missing', () => {
  const missing = source('o2', 'B', null);
  missing.styles[0].prices[0].entries[0].unitPrice = null;
  assert.throws(() => calculateInvoiceIssueSnapshot(content, [source('o1', 'A', '1.00'), missing]), /INVOICE_ISSUE_PRICE_MISSING/);
});

test('settlement keeps prior billed, received and applied deduction separate without duplicate debt', () => {
  const currentSource = source('o1', 'A', '100.0000'); currentSource.lines[0].orderedQuantity = 100;
  const input = { ...content, orders: [{ orderId: 'o1' }], percentages: { o1: '100' },
    lines: [{ ...content.lines[0], quantity: '100' }], settlements: { o1: { deduction: '3000', reason: 'deduct received amount only' } } };
  const result = calculateInvoiceIssueSnapshot(input, [currentSource], { o1: {
    priorBilledAmount: '5000.0000', priorReceivedAmount: '3000.0000', defaultDeductionAmount: '5000.0000',
  } });
  assert.equal(result.orders[0].billedAmount, '10000.00');
  assert.equal(result.orders[0].priorBilledAmount, '5000.0000');
  assert.equal(result.orders[0].priorReceivedAmount, '3000.0000');
  assert.equal(result.orders[0].appliedDeductionAmount, '3000.00');
  assert.equal(result.orders[0].netAmount, '7000.00'); assert.equal(result.total, '7000.00');
  assert.equal(result.orders[0].priorOutstandingAmount, '2000.00');
  assert.equal(result.orders[0].receivableAdded, '5000.00'); assert.equal(result.receivableAdded, '5000.00');
  assert.throws(() => calculateInvoiceIssueSnapshot({ ...input, settlements: { o1: { deduction: '3000', reason: '' } } }, [currentSource],
    { o1: { defaultDeductionAmount: '5000' } }), /DEDUCTION_REASON_REQUIRED/);
});

test('actual payments are separate, idempotent records and voiding preserves the original row', async () => {
  let payment = null;
  const db = { $transaction: async run => run(db), invoice: { findFirst: async () => ({ id: 'i', status: 'ISSUED', currencyCode: 'USD' }) },
    invoicePayment: {
      findFirst: async ({ where }) => payment && (where.id === payment.id || where.clientKey === payment.clientKey) ? payment : null,
      create: async ({ data }) => (payment = { id: 'p', ...data, voidedAt: null }),
      updateMany: async ({ data }) => { payment = { ...payment, ...data }; return { count: 1 }; },
    } };
  const body = { clientKey: 'payment_key_123456', amount: '30.00', receivedAt: '2026-09-22T00:00:00.000Z', reference: 'BANK-1' };
  const first = await recordInvoicePayment(db, 1, 'actor', 'i', body);
  const retried = await recordInvoicePayment(db, 1, 'actor', 'i', body);
  assert.equal(first.id, retried.id); assert.equal(first.currencyCode, 'USD');
  const voided = await voidInvoicePayment(db, 1, 'admin', 'p', 'wrong transfer');
  assert.equal(voided.voidReason, 'wrong transfer'); assert.ok(voided.voidedAt);
});

test('multi-order payments use explicit replaceable allocations and preserve voided history', async () => {
  let rows = [];
  const db = { $transaction: async run => run(db), invoicePayment: { findFirst: async () => ({ id: 'p', amount: '100.0000', voidedAt: null,
    invoice: { id: 'i', status: 'ISSUED', orders: [{ id: 1 }, { id: 2 }] } }) }, invoicePaymentAllocation: {
    findMany: async ({ where }) => rows.filter(row => row.paymentId === where.paymentId
      && (where.batchKey === undefined || row.batchKey === where.batchKey) && (where.voidedAt === undefined || row.voidedAt === where.voidedAt)),
    updateMany: async ({ data }) => { rows = rows.map(row => row.voidedAt ? row : { ...row, ...data }); return { count: rows.length }; },
    createMany: async ({ data }) => { const start = rows.length; rows.push(...data.map((row, index) => ({ id: `a${start + index}`, ...row, voidedAt: null }))); return { count: data.length }; },
  } };
  const first = await replaceInvoicePaymentAllocations(db, 1, 'actor', 'p', { clientKey: 'allocation_batch_0001',
    allocations: [{ invoiceOrderId: 1, amount: '60' }, { invoiceOrderId: 2, amount: '40' }] });
  assert.equal(first.length, 2);
  await assert.rejects(replaceInvoicePaymentAllocations(db, 1, 'actor', 'p', { clientKey: 'allocation_batch_0002',
    allocations: [{ invoiceOrderId: 1, amount: '50' }] }), /ALLOCATION_REASON_REQUIRED/);
  const replaced = await replaceInvoicePaymentAllocations(db, 1, 'actor', 'p', { clientKey: 'allocation_batch_0002', reason: 'correct split',
    allocations: [{ invoiceOrderId: 1, amount: '50' }, { invoiceOrderId: 2, amount: '50' }] });
  assert.equal(replaced.length, 2); assert.equal(rows.filter(row => row.voidedAt).length, 2);
  await assert.rejects(replaceInvoicePaymentAllocations(db, 1, 'actor', 'p', { clientKey: 'allocation_batch_0003', reason: 'bad',
    allocations: [{ invoiceOrderId: 1, amount: '101' }] }), /EXCEEDS_PAYMENT/);
});

test('revision draft copies immutable snapshot inputs and links the original invoice', async () => {
  let draft;
  const invoice = { id: 'i1', sellerOrgId: 1, buyerOrgId: 2, status: 'ISSUED', pricingBasis: 'MANUFACTURING_SERVICE_PRICE',
    currencyCode: 'USD', snapshot: { fields: { number: 'INV-1', date: '2026-09-22' } },
    orders: [{ id: 4, workOrderId: 3, sourceOrderId: 'o1', sourceUpdatedAt: new Date('2026-09-22'), billingPercentage: '100', appliedDeductionAmount: '0', deductionReason: '' }],
    lines: [{ workOrderItemId: 11, sourceItemId: 11, lineKey: 'line', quantity: 3, remark: '', adjustmentReason: '', hsCode: '', origin: '' }] };
  const db = { $transaction: async run => run(db), invoice: { findFirst: async ({ where }) => where.revisionOfInvoiceId ? null : invoice },
    invoiceDraft: { findFirst: async () => null, create: async ({ data }) => (draft = { id: 'd1', ...data }) },
    invoiceDraftOrder: { createMany: async () => ({ count: 1 }) }, invoiceDraftLine: { createMany: async () => ({ count: 1 }) } };
  const result = await createInvoiceRevisionDraft(db, 1, 'actor', 'i1', { clientKey: 'revision_draft_0001', reason: 'correct address' });
  assert.equal(result.revisionOfInvoiceId, 'i1'); assert.equal(result.revisionReason, 'correct address');
  assert.equal(draft.content.orders[0].orderId, 'o1'); assert.equal(draft.content.lines[0].key, 'line');
});

test('ledger schema and routes preserve immutable order and line snapshots', () => {
  assert.match(schema, /model Invoice \{/);
  assert.match(schema, /@@unique\(\[sellerOrgId, invoiceNumber\]\)/);
  assert.match(schema, /model InvoiceOrder \{/);
  assert.match(schema, /model InvoiceLine \{/);
  assert.match(schema, /model InvoicePaymentAllocation \{/);
  assert.match(schema, /revisionOfInvoiceId String\? @unique/);
  assert.match(migration, /immutable issued-invoice ledger foundation/);
  assert.match(routes, /\/invoices\/drafts\/:id\/issue/);
  assert.match(routes, /\/invoices\/issued/);
  assert.match(routes, /\/invoices\/issued\/:id\/cancel/);
  assert.match(routes, /\/invoices\/issued\/:id\/payments/);
  assert.match(routes, /\/invoices\/payments\/:id\/void/);
  assert.match(routes, /\/invoices\/payments\/:id\/allocations/);
  assert.match(routes, /\/invoices\/issued\/:id\/revision-draft/);
});

test('issued ledger bootstrap is repeatable and preserves snapshots when source rows are deleted', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TYPE "SalesPricingBasis" AS ENUM ('MANUFACTURING_SERVICE_PRICE','FINISHED_GOODS_PRICE');
      CREATE TABLE "Organization" (id INTEGER PRIMARY KEY);
      CREATE TABLE "WorkOrder" (id INTEGER PRIMARY KEY);
      CREATE TABLE "WorkOrderItem" (id INTEGER PRIMARY KEY);`);
    const sql = migration.slice(migration.indexOf('-- 2026-09-22: immutable issued-invoice ledger foundation.'));
    await db.exec(sql); await db.exec(sql);
    await db.exec(`INSERT INTO "Organization" VALUES (1),(2); INSERT INTO "WorkOrder" VALUES (3); INSERT INTO "WorkOrderItem" VALUES (4);
      INSERT INTO "Invoice" (id,"sellerOrgId","buyerOrgId","invoiceNumber","clientKey","sequenceNumber","pricingBasis","currencyCode",subtotal,total,snapshot,"issuedBy")
      VALUES ('i',1,2,'INV-1','key',1,'MANUFACTURING_SERVICE_PRICE','USD',10,5,'{}','actor');
      INSERT INTO "InvoiceOrder" ("invoiceId","workOrderId","sourceOrderId","sourceOrderNumber","sourceUpdatedAt","billingPercentage","basisAmount","billedAmount","installmentNumber")
      VALUES ('i',3,'o','O-1',now(),50,10,5,1);
      INSERT INTO "InvoiceLine" ("invoiceId","invoiceOrderId","workOrderItemId","sourceItemId","lineKey","styleCode","styleName",description,color,gender,size,quantity,"bucketQuantity","unitPrice",amount,remark,"adjustmentReason","hsCode",origin)
      SELECT 'i',id,4,4,'line','S','Style','Style','','','',1,1,10,10,'','','','' FROM "InvoiceOrder" WHERE "invoiceId"='i';
      DELETE FROM "WorkOrderItem"; DELETE FROM "WorkOrder";`);
    assert.equal((await db.query('SELECT "workOrderItemId","sourceItemId" FROM "InvoiceLine"')).rows[0].workOrderItemId, null);
    assert.equal((await db.query('SELECT "workOrderId","sourceOrderId" FROM "InvoiceOrder"')).rows[0].workOrderId, null);
    await db.exec(`INSERT INTO "Invoice" (id,"sellerOrgId","buyerOrgId","invoiceNumber","clientKey","sequenceNumber","pricingBasis","currencyCode",subtotal,total,snapshot,"issuedBy")
      VALUES ('i2',1,2,'INV-2','key2',2,'MANUFACTURING_SERVICE_PRICE','USD',10,5,'{}','actor');
      INSERT INTO "InvoiceOrder" ("invoiceId","sourceOrderId","sourceOrderNumber","sourceUpdatedAt","billingPercentage","basisAmount","billedAmount","installmentNumber")
      VALUES ('i2','o2','O-2',now(),50,10,5,1);
      INSERT INTO "InvoicePayment" (id,"invoiceId","clientKey",amount,"currencyCode","receivedAt",reference,note,"createdBy")
      VALUES ('p','i','payment-key',5,'USD',now(),'','','actor');
      INSERT INTO "InvoicePaymentAllocation" (id,"paymentId","invoiceOrderId","invoiceId","batchKey",amount,"createdBy")
      SELECT 'a','p',id,'i','batch',5,'actor' FROM "InvoiceOrder" WHERE "invoiceId"='i';`);
    await assert.rejects(db.exec(`INSERT INTO "InvoicePaymentAllocation" (id,"paymentId","invoiceOrderId","invoiceId","batchKey",amount,"createdBy")
      SELECT 'bad','p',id,'i','batch2',5,'actor' FROM "InvoiceOrder" WHERE "invoiceId"='i2';`));
    await db.exec(`INSERT INTO "WorkOrder" (id) VALUES (5);
      UPDATE "WorkOrder" SET "invoiceFinalLockedAt"=now(),"invoiceFinalLockInvoiceId"='i',"invoiceFinalLockReason"='final' WHERE id=5;`);
    await assert.rejects(db.exec(`UPDATE "WorkOrder" SET "invoiceFinalLockReason"='changed' WHERE id=5;`), /INVOICE_FINAL_LOCKED/);
    await db.exec(`SET baro.invoice_lock_bypass='on'; UPDATE "WorkOrder" SET "invoiceFinalLockedAt"=NULL,"invoiceFinalLockInvoiceId"=NULL WHERE id=5; SET baro.invoice_lock_bypass='off'; DELETE FROM "WorkOrder" WHERE id=5;`);
    await assert.rejects(db.exec('DELETE FROM "Invoice" WHERE id=\'i\''));
  } finally { await db.close(); }
});
