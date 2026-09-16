import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const { editTransaction, STALE_EDIT } = require('../backend/dist/utils/editRevision.js');
const { planOrderItemWrites } = require('../backend/dist/utils/orderItemIdentity.js');
const source = readFileSync('backend/src/index.ts', 'utf8');
const start = source.indexOf('app.put("/orders/:orderId"');
const code = ts.transpileModule(source.slice(start, source.indexOf('const requireInvoiceAccess', start)), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ lock = false, stale = false, conflict = false } = {}) {
  let handler, writes = 0, checkedTx = false, committed = false;
  const existing = { id: 1, orderId: 'a', updatedAt: new Date('2026-09-16'), orderNumber: 'A', items: [] };
  const tx = {
    workOrder: {
      findFirst: async () => ({ ...existing, updatedAt: stale ? new Date('2026-09-17') : existing.updatedAt }),
      update: async () => { writes++; return existing; }, findUnique: async () => existing,
    }, workOrderItem: { findMany: async () => [] },
  };
  const deps = {
    app: { put: (_path, callback) => { handler = callback; } },
    prisma: { workOrder: { findFirst: async () => existing }, $transaction: async (run, options) => {
      assert.equal(options.isolationLevel, 'Serializable');
      const result = await run(tx);
      if (conflict) throw Object.assign(new Error(), { code: 'P2034' });
      committed = true; return result;
    } },
    requireOrgRole: async () => ({ organization: { id: 7 } }), getOrderAccessWhere: () => [{ sellerOrgId: 7 }],
    WORK_ORDER_RESPONSE_INCLUDE: {}, normalizeOrderPayload: () => ({ ...existing }),
    isOrderModificationLocked: async (_order, db) => { if (db) { assert.equal(db, tx); checkedTx = true; return lock; } return false; },
    toPositiveIntOrNull: Number, resolveOrderPartiesOrThrow: async () => ({ buyer: { id: 8 }, seller: { id: 7 } }),
    syncOrderItemColorSnapshots: async rows => rows, syncOrderItemStyleRefs: async rows => rows,
    findSharedOrderConflict: async () => null, normalizeOrderItems: rows => rows,
    editTransaction, STALE_EDIT, createHttpError: (status, message) => Object.assign(new Error(message), { status }),
    ORDER_MODIFICATION_LOCK_ERROR: 'locked', Prisma: { JsonNull: null }, planOrderItemWrites,
    getOrderModificationLockState: async () => ({}), toOrderResponse: value => value,
  };
  new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { run: () => handler({ params: { orderId: 'a' }, body: {} }, { json: value => value }),
    state: () => ({ writes, checkedTx, committed }) };
}

test('order edit rechecks a newly acquired lock inside the write transaction', async () => {
  const app = harness({ lock: true });
  await assert.rejects(app.run(), /locked/);
  assert.deepEqual(app.state(), { writes: 0, checkedTx: true, committed: false });
});
test('order edit refuses a source changed during normalization before writing items', async () => {
  const app = harness({ stale: true });
  await assert.rejects(app.run(), /STALE_EDIT/);
  assert.equal(app.state().writes, 0);
});
test('successful edit commits; serialization conflict never reports success', async () => {
  const app = harness(); await app.run(); assert.equal(app.state().committed, true);
  const raced = harness({ conflict: true }); await assert.rejects(raced.run(), /STALE_EDIT/);
  assert.equal(raced.state().committed, false);
});
