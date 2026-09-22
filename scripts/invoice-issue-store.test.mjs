import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const require = createRequire(import.meta.url);
const { calculateInvoiceIssueSnapshot } = require('../backend/dist/services/invoiceIssueStore.js');
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

test('ledger schema and routes preserve immutable order and line snapshots', () => {
  assert.match(schema, /model Invoice \{/);
  assert.match(schema, /@@unique\(\[sellerOrgId, invoiceNumber\]\)/);
  assert.match(schema, /model InvoiceOrder \{/);
  assert.match(schema, /model InvoiceLine \{/);
  assert.match(migration, /immutable issued-invoice ledger foundation/);
  assert.match(routes, /\/invoices\/drafts\/:id\/issue/);
  assert.match(routes, /\/invoices\/issued/);
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
      INSERT INTO "InvoiceOrder" ("invoiceId","workOrderId","sourceOrderId","sourceOrderNumber","sourceUpdatedAt","billingPercentage","basisAmount","billedAmount")
      VALUES ('i',3,'o','O-1',now(),50,10,5);
      INSERT INTO "InvoiceLine" ("invoiceId","invoiceOrderId","workOrderItemId","sourceItemId","lineKey","styleCode","styleName",description,color,gender,size,quantity,"bucketQuantity","unitPrice",amount,remark,"adjustmentReason","hsCode",origin)
      SELECT 'i',id,4,4,'line','S','Style','Style','','','',1,1,10,10,'','','','' FROM "InvoiceOrder" WHERE "invoiceId"='i';
      DELETE FROM "WorkOrderItem"; DELETE FROM "WorkOrder";`);
    assert.equal((await db.query('SELECT "workOrderItemId","sourceItemId" FROM "InvoiceLine"')).rows[0].workOrderItemId, null);
    assert.equal((await db.query('SELECT "workOrderId","sourceOrderId" FROM "InvoiceOrder"')).rows[0].workOrderId, null);
    await assert.rejects(db.exec('DELETE FROM "Invoice" WHERE id=\'i\''));
  } finally { await db.close(); }
});
