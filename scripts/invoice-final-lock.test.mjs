import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { approveInvoiceFinalLock, unlockInvoiceFinalLocksForInvoice } = require('../backend/dist/services/invoiceFinalLock.js');
const routes = await readFile(new URL('../backend/src/routes/invoiceDraft.routes.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../backend/migration_fix.sql', import.meta.url), 'utf8');

const database = () => {
  const invoice = { id: 'i', sellerOrgId: 7, status: 'ISSUED', sequenceNumber: 2,
    orders: [{ sourceOrderId: 'o1' }, { sourceOrderId: 'o2' }] };
  const orders = [{ id: 1, orderId: 'o1', sellerOrgId: 7, totalQuantity: 10, invoiceFinalLockedAt: null },
    { id: 2, orderId: 'o2', sellerOrgId: 7, totalQuantity: 20, invoiceFinalLockedAt: null }];
  const events = [];
  const db = { $transaction: async run => run(db), $executeRawUnsafe: async () => 0,
    invoice: { findFirst: async ({ where }) => where.id === invoice.id && where.sellerOrgId === invoice.sellerOrgId ? invoice : null },
    invoiceOrder: { findFirst: async () => null },
    workOrder: {
      findMany: async ({ where }) => orders.filter(row => row.sellerOrgId === where.sellerOrgId
        && (!where.orderId?.in || where.orderId.in.includes(row.orderId))
        && (!where.invoiceFinalLockInvoiceId || row.invoiceFinalLockInvoiceId === where.invoiceFinalLockInvoiceId)
        && (!where.invoiceFinalLockedAt || row.invoiceFinalLockedAt)),
      updateMany: async ({ where, data }) => { const target = orders.find(row => row.id === where.id && row.sellerOrgId === where.sellerOrgId
        && (where.invoiceFinalLockedAt === null ? !row.invoiceFinalLockedAt : true)
        && (!where.invoiceFinalLockInvoiceId || row.invoiceFinalLockInvoiceId === where.invoiceFinalLockInvoiceId));
        if (!target) return { count: 0 }; Object.assign(target, data); return { count: 1 }; },
    },
    invoiceFinalLockEvent: {
      findMany: async ({ where }) => events.filter(row => (!where.clientKey || row.clientKey === where.clientKey)
        && (!where.invoiceId || row.invoiceId === where.invoiceId)).sort((a, b) => a.workOrderId - b.workOrderId),
      create: async ({ data }) => { const row = { id: `e${events.length + 1}`, ...data, createdAt: new Date() }; events.push(row); return row; },
    },
  };
  return { db, state: () => ({ orders, events }) };
};

test('explicit final approval locks every invoice order and retry is idempotent', async () => {
  const fake = database();
  const body = { clientKey: 'final_lock_batch_001', orders: [
    { sourceOrderId: 'o1', recognizedQuantity: 9, reason: 'approved shortage' },
    { sourceOrderId: 'o2', recognizedQuantity: 21, reason: 'approved overage' },
  ] };
  const first = await approveInvoiceFinalLock(fake.db, 7, 'actor', 'i', body);
  const retried = await approveInvoiceFinalLock(fake.db, 7, 'actor', 'i', body);
  assert.equal(first.length, 2); assert.equal(retried.length, 2);
  assert.ok(fake.state().orders.every(row => row.invoiceFinalLockedAt));
  assert.deepEqual(fake.state().orders.map(row => row.invoiceFinalRecognizedQuantity), [9, 21]);
  assert.equal(fake.state().events.length, 2);
});

test('any invoice-authorized caller can unlock the invoice batch while preserving history', async () => {
  const fake = database();
  await approveInvoiceFinalLock(fake.db, 7, 'accountant', 'i', { clientKey: 'final_lock_batch_002', orders: [
    { sourceOrderId: 'o1', recognizedQuantity: 10, reason: 'final' }, { sourceOrderId: 'o2', recognizedQuantity: 20, reason: 'final' },
  ] });
  const unlocked = await unlockInvoiceFinalLocksForInvoice(fake.db, 7, 'operator', 'i', { clientKey: 'final_unlock_0002', reason: 'reopen settlement' });
  assert.equal(unlocked.length, 2); assert.ok(fake.state().orders.every(row => !row.invoiceFinalLockedAt));
  assert.deepEqual(fake.state().events.map(row => row.action), ['LOCK', 'LOCK', 'UNLOCK', 'UNLOCK']);
});

test('routes use the same invoice access gate for final approval and unlock', () => {
  assert.match(routes, /\/invoices\/issued\/:id\/final-lock/);
  assert.match(routes, /\/invoices\/issued\/:id\/final-unlock/);
  assert.doesNotMatch(routes, /final-unlock[\s\S]{0,300}ADMIN/);
  assert.match(migration, /baro_invoice_final_lock_guard/);
  assert.match(migration, /INVOICE_FINAL_LOCKED/);
});
