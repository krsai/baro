import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { restoreInvoiceDraftLines } from '../frontend/src/utils/invoiceDraftRestore.mjs';
const require = createRequire(import.meta.url);
const { saveInvoiceDraft, deleteInvoiceDraft, normalizeInvoiceDraftContent } = require('../backend/dist/services/invoiceDraftStore.js');
const { registerInvoiceDraftRoutes } = require('../backend/dist/routes/invoiceDraft.routes.js');
const date = new Date('2026-09-17T00:00:00.000Z');
const key = JSON.stringify(['o1', '11:']);
const body = () => ({ clientKey: 'client-request-123456', buyerOrgId: 8,
  orders: [{ orderId: 'o1', sourceUpdatedAt: date.toISOString() }],
  basis: 'MANUFACTURING_SERVICE_PRICE', currency: 'USD', percentages: { o1: '30' },
  fields: { number: 'DRAFT-ONE', notes: 'keep me', seller: { name: 'Seller' }, buyer: { name: 'Buyer' } },
  lines: [{ key, quantity: '80', remark: 'partial', adjustmentReason: 'shipping', hsCode: '', origin: 'VN' }],
});
const order = { id: 1, orderId: 'o1', orderNumber: 'PO-ONE', sellerOrgId: 7, buyerOrgId: 8, updatedAt: date,
  workOrderItems: [{ id: 11, styleId: 10, totalQuantity: 100, style: { name: 'Shirt' } }] };

function database({ source = [order], conflict = false, failLines = false } = {}) {
  let state = { rows: [], orders: [], lines: [] };
  const match = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const db = { $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    const draft = structuredClone(state);
    const tx = {
      workOrder: { findMany: async ({ where }) => source.filter(row => row.sellerOrgId === where.sellerOrgId &&
        row.buyerOrgId === where.buyerOrgId && where.orderId.in.includes(row.orderId)) },
      invoiceDraft: {
        findFirst: async ({ where }) => draft.rows.find(row => match(row, where)) || null,
        create: async ({ data: { orders, lines, ...data } }) => {
          const row = { ...data, id: `draft-${draft.rows.length + 1}`, revision: 1 };
          draft.rows.push(row); draft.orders = orders.create; draft.lines = lines.create;
          if (failLines) throw Error('line write failed');
          return row;
        },
        updateMany: async ({ where, data }) => {
          const row = draft.rows.find(row => match(row, where)); if (!row) return { count: 0 };
          Object.assign(row, data, { revision: row.revision + 1 }); return { count: 1 };
        },
        deleteMany: async ({ where }) => {
          const row = draft.rows.find(row => match(row, where)); if (!row) return { count: 0 };
          draft.rows = draft.rows.filter(item => item !== row); draft.orders = []; draft.lines = []; return { count: 1 };
        },
      },
      invoiceDraftOrder: { deleteMany: async () => { draft.orders = []; }, createMany: async ({ data }) => { draft.orders = data; } },
      invoiceDraftLine: { deleteMany: async () => { draft.lines = []; }, createMany: async ({ data }) => {
        if (db.failLines) throw Error('line write failed'); draft.lines = data;
      } },
    };
    const result = await run(tx);
    if (conflict) throw Object.assign(new Error('race'), { code: 'P2034' });
    state = draft; return structuredClone(result);
  }, state: () => structuredClone(state) };
  return db;
}

test('draft normalization whitelists editable inputs and keeps incomplete quantities without trusting totals/actor', () => {
  const input = { ...body(), amount: '9999', sellerOrgId: 99, createdBy: 'spoof', reviewed: true };
  input.lines[0].quantity = ''; input.lines[0].unitPrice = '0';
  const normalized = normalizeInvoiceDraftContent(input);
  assert.equal(normalized.lines[0].quantity, '');
  for (const property of ['amount', 'sellerOrgId', 'createdBy', 'reviewed']) assert.equal(normalized[property], undefined);
  assert.equal(normalized.lines[0].unitPrice, undefined);
  assert.throws(() => normalizeInvoiceDraftContent({ ...body(), orders: [body().orders[0], body().orders[0]] }), /INVALID/);
  assert.throws(() => normalizeInvoiceDraftContent({ ...body(), lines: [body().lines[0], body().lines[0]] }), /INVALID/);
  assert.throws(() => normalizeInvoiceDraftContent({ ...body(), fields: null }), /INVALID/);
});

test('create, idempotent retry, update and delete retain scoped canonical order/item FKs', async () => {
  const db = database(); const input = body();
  const created = await saveInvoiceDraft(db, 7, 'actor@example.com', input);
  assert.equal(created.createdBy, 'actor@example.com'); assert.equal(created.sellerOrgId, 7);
  assert.equal(db.state().orders[0].workOrderId, 1); assert.equal(db.state().lines[0].workOrderItemId, 11);
  assert.match(created.content.lines[0].label, /PO-ONE.*Shirt/);
  const again = await saveInvoiceDraft(db, 7, 'actor@example.com', { ...input, fields: { ...input.fields } });
  assert.equal(again.id, created.id); assert.equal(db.state().rows.length, 1);
  const edited = await saveInvoiceDraft(db, 7, 'other@example.com', { ...input, revision: 1, percentages: { o1: '50' } }, created.id);
  assert.equal(edited.revision, 2); assert.equal(edited.content.percentages.o1, '50');
  assert.equal(edited.createdBy, 'actor@example.com'); assert.equal(edited.updatedBy, 'other@example.com');
  await assert.rejects(deleteInvoiceDraft(db, 7, created.id, 1), /STALE_EDIT/);
  await deleteInvoiceDraft(db, 7, created.id, 2); assert.equal(db.state().rows.length, 0);
});

test('foreign orders, changed orders, ambiguous public IDs and forged/omitted line keys cannot be saved', async () => {
  for (const source of [[], [{ ...order, sellerOrgId: 9 }], [{ ...order, buyerOrgId: 9 }],
    [{ ...order, updatedAt: new Date(0) }], [order, { ...order, id: 2 }]]) {
    const db = database({ source }); await assert.rejects(saveInvoiceDraft(db, 7, 'a', body()), /SOURCE_CHANGED/);
    assert.equal(db.state().rows.length, 0);
  }
  const input = body(); input.lines[0].key = JSON.stringify(['o1', '99:']);
  await assert.rejects(saveInvoiceDraft(database(), 7, 'a', input), /SOURCE_CHANGED/);
});

test('seller scope and revision guard prevent overwrites/deletes; failed link writes roll back draft edits', async () => {
  const db = database(); const created = await saveInvoiceDraft(db, 7, 'a', body());
  await assert.rejects(saveInvoiceDraft(db, 9, 'b', { ...body(), revision: 1 }, created.id), /NOT_FOUND/);
  await assert.rejects(deleteInvoiceDraft(db, 9, created.id, 1), /STALE_EDIT/);
  await saveInvoiceDraft(db, 7, 'b', { ...body(), revision: 1 }, created.id);
  await assert.rejects(saveInvoiceDraft(db, 7, 'a', { ...body(), revision: 1 }, created.id), /STALE_EDIT/);
  const before = db.state(); db.failLines = true;
  await assert.rejects(saveInvoiceDraft(db, 7, 'a', { ...body(), revision: 2 }, created.id), /line write failed/);
  assert.deepEqual(db.state(), before);
  const raced = database({ conflict: true }); await assert.rejects(saveInvoiceDraft(raced, 7, 'a', body()), /STALE_EDIT/);
  assert.equal(raced.state().rows.length, 0);
});

test('all draft routes require invoice access before reading or writing; reads are seller scoped', async () => {
  const routes = [];
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (path, handler) => routes.push({ method, path, handler })]));
  registerInvoiceDraftRoutes(app, { db: {}, requireAccess: async () => null });
  assert.equal(routes.length, 9);
  for (const route of routes) await route.handler({}, {});
  routes.length = 0;
  const scopes = [];
  registerInvoiceDraftRoutes(app, { db: { invoiceDraft: {
    findFirst: async ({ where }) => { scopes.push(where); return null; },
    findMany: async ({ where }) => { scopes.push(where); return []; },
  }, invoice: { findMany: async ({ where }) => { scopes.push(where); return []; }, findFirst: async ({ where }) => { scopes.push(where); return null; } },
  }, requireAccess: async () => ({ organization: { id: 7 } }) });
  const res = { setHeader() {}, status() { return this; }, json(value) { return value; } };
  for (const route of routes.filter(row => row.method === 'get')) await route.handler({ query: {}, params: { id: 'foreign' } }, res);
  assert.ok(scopes.every(where => where.sellerOrgId === 7));
});

test('restoring a draft preserves edits but refreshes authoritative source data and refuses mismatched sources', () => {
  const content = normalizeInvoiceDraftContent(body());
  const source = { buyerOrgId: 8, orders: content.orders, lines: [{ key, itemId: 11, orderedQuantity: 100, unitPrice: '5.00' }] };
  const restored = restoreInvoiceDraftLines(content, source);
  assert.equal(restored[0].quantity, '80'); assert.equal(restored[0].remark, 'partial');
  assert.equal(restored[0].unitPrice, '5.00'); assert.equal(restored[0].itemId, 11);
  for (const changed of [{ ...source, buyerOrgId: 9 }, { ...source, lines: [] },
    { ...source, orders: [{ orderId: 'o1', sourceUpdatedAt: new Date(0).toISOString() }] }]) {
    assert.throws(() => restoreInvoiceDraftLines(content, changed), /SOURCE_CHANGED/);
  }
  assert.equal(content.lines[0].quantity, '80');
});

test('additive SQL migration preserves draft input after source deletion and revision CAS has one winner', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE TABLE "Organization" (id INTEGER PRIMARY KEY); CREATE TABLE "WorkOrder" (id INTEGER PRIMARY KEY); CREATE TABLE "WorkOrderItem" (id INTEGER PRIMARY KEY);');
    const migration = readFileSync('backend/prisma/migrations/20260917190000_add_invoice_drafts/migration.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration);
    assert.match(readFileSync('backend/migration_fix.sql', 'utf8'), /Resumable invoice drafts/);
    await db.exec(`INSERT INTO "Organization" VALUES (7),(8); INSERT INTO "WorkOrder" VALUES (1); INSERT INTO "WorkOrderItem" VALUES (11);
      INSERT INTO "InvoiceDraft" (id,"sellerOrgId","buyerOrgId","clientKey",content,"createdBy","updatedBy","updatedAt") VALUES ('d',7,8,'key','{"notes":"keep"}','a','a',now());
      INSERT INTO "InvoiceDraftOrder" ("draftId","workOrderId","sourceOrderId","sourceUpdatedAt") VALUES ('d',1,'o1',now());
      INSERT INTO "InvoiceDraftLine" ("draftId","workOrderItemId","sourceItemId","lineKey") VALUES ('d',11,11,'key');`);
    const update = () => db.query('UPDATE "InvoiceDraft" SET revision=revision+1 WHERE id=$1 AND revision=$2 RETURNING revision', ['d', 1]);
    const outcomes = await Promise.all([update(), update()]); assert.equal(outcomes.reduce((sum, result) => sum + result.rows.length, 0), 1);
    await db.exec('DELETE FROM "WorkOrderItem"; DELETE FROM "WorkOrder";');
    assert.equal((await db.query('SELECT "workOrderItemId", "sourceItemId" FROM "InvoiceDraftLine"')).rows[0].workOrderItemId, null);
    assert.equal((await db.query('SELECT "sourceItemId" FROM "InvoiceDraftLine"')).rows[0].sourceItemId, 11);
    assert.equal((await db.query('SELECT "workOrderId" FROM "InvoiceDraftOrder"')).rows[0].workOrderId, null);
    assert.equal((await db.query('SELECT content FROM "InvoiceDraft"')).rows[0].content.notes, 'keep');
    await db.exec('DELETE FROM "InvoiceDraft";');
    assert.equal((await db.query('SELECT * FROM "InvoiceDraftLine"')).rows.length, 0);
  } finally { await db.close(); }
});
