import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const { isOrderReadyForAssignment: ready } = require('../backend/dist/utils/orderAssignmentReadiness.js');
const { editTransaction, STALE_EDIT } = require('../backend/dist/utils/editRevision.js');
const source = readFileSync('backend/src/index.ts', 'utf8').replace(/\r\n/g, '\n');
const section = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, start);
  return source.slice(a, b);
};
const execute = (code, deps) => new Function(...Object.keys(deps), ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText)(...Object.values(deps));
const order = (extra = {}) => ({ id: 1, workOrderItems: [{ styleId: 10, totalQuantity: 100 }], ...extra });
const positive = value => Number.isSafeInteger(value) && value > 0 ? value : null;
const httpError = (status, message) => Object.assign(new Error(message), { status });

test('saved relational items prepare both legacy locked and unlocked orders', () => {
  for (const modificationLockedAt of [null, new Date()]) {
    assert.equal(ready(order({ modificationLockedAt })), true);
  }
  for (const invalid of [null, {}, order({ id: null }), order({ workOrderItems: [] }),
    order({ workOrderItems: [{ styleId: null, totalQuantity: 10 }] }),
    order({ workOrderItems: [{ styleId: 10, totalQuantity: -1 }] }),
    order({ workOrderItems: [{ styleId: 10, totalQuantity: 0 }] }),
    order({ workOrderItems: [{ styleId: 10, totalQuantity: 1.5 }] })]) assert.equal(ready(invalid), false);
});

test('real card builder includes unlocked saved orders and excludes incomplete relational items', () => {
  const build = execute(section('const buildAssignmentCardsFromOrders =', 'type AssignmentCardStoreClient') +
    '\nreturn buildAssignmentCardsFromOrders;', {
    isOrderReadyForAssignment: ready, ensureArray: value => Array.isArray(value) ? value : [],
    toPositiveIntOrNull: positive, workOrderItemToItemShape: value => value,
    sumOrderItemQuantity: item => item.totalQuantity, resolveOptionalString: (value, fallback) => value ?? fallback,
    normalizeStyleProcesses: value => value || [], calculateAssignmentCardTotalForOrderQuantity: () => 300,
    calculateAssignmentCardStTotalForOrderQuantity: () => 400, resolveAssignmentCardStatus: () => 'ST',
    createAssignmentCardId: (orderId, styleId) => `${orderId}-${styleId}`,
  });
  const orders = [order({ orderId: 'saved', modificationLockedAt: null }),
    order({ id: 2, orderId: 'incomplete', workOrderItems: [{ styleId: null, totalQuantity: 5 }] })];
  const cards = build({ orders, styles: [{ id: 10, name: 'shirt' }] });
  assert.deepEqual(cards.map(row => [row.workOrderId, row.styleId, row.cardQuantity]), [[1, 10, 100]]);
  assert.deepEqual(build({ orders, styles: [{ id: 10, name: 'shirt' }] }), cards);
  assert.doesNotMatch(section('const rebuildAssignmentCardsForOrgTx =', 'const rebuildAssignmentCardsForOrg ='), /modificationLockedAt/);
});

test('board write gate uses transaction-scoped authorized orders and rejects missing/incomplete sources', async () => {
  const code = section('    if (changedIncomingAssignments.some(item =>', '    const nextAssignmentExternalIds =');
  for (const row of [order(), order({ modificationLockedAt: new Date() }), null, order({ workOrderItems: [] })]) {
    let read = false;
    const run = execute(`return async () => { ${code} };`, {
      changedIncomingAssignments: [{ workOrderId: 1 }],
      tx: { workOrder: { findMany: async ({ where, select }) => {
        read = true; assert.deepEqual(where.OR, [{ sellerOrgId: 7 }]);
        assert.ok(select.workOrderItems); return row ? [row] : [];
      } } }, organization: { id: 7 }, getOrderAccessWhere: id => [{ sellerOrgId: id }],
      toPositiveIntOrNull: positive, resolveOptionalString: (v, fallback) => v || fallback,
      isOrderReadyForAssignment: ready, createHttpError: httpError,
    });
    if (ready(row)) await run(); else await assert.rejects(run(), /ORDER_NOT_READY_FOR_ASSIGNMENT/);
    assert.equal(read, true);
  }
  const run = execute(`return async () => { ${code} };`, {
    changedIncomingAssignments: [{ workOrderId: null }], toPositiveIntOrNull: positive, createHttpError: httpError,
  });
  await assert.rejects(run(), /missing workOrderId/);
});

test('manual lock timestamps cannot reset production status or block guarded order editing', () => {
  const deps = {
    resolveWorkOrderStatus: (value, fallback) => value || fallback,
    AUTO_MANAGED_WORK_ORDER_PROGRESS_STATUSES: new Set(['EDITING', 'ORDER_RECEIVED', 'IN_PROGRESS']),
  };
  const canonical = execute(section('const resolveCanonicalWorkOrderProgressStatus', 'const resolveWorkOrderConfirmationStatus') +
    '\nreturn resolveCanonicalWorkOrderProgressStatus;', deps);
  const auto = execute(section('const resolveAutoOrderProgressStatus =', 'const syncOrderProgressStatusesForOrg =') +
    '\nreturn resolveAutoOrderProgressStatus;', {});
  const lock = execute(section('const buildOrderModificationLockState =', 'const loadOrderAssignmentModificationLockMap =') +
    '\nreturn buildOrderModificationLockState;', {});
  for (const isManualLocked of [true, false]) {
    for (const status of ['IN_PROGRESS', 'PRODUCTION_DONE', 'SHIPPED', 'SETTLED']) {
      assert.equal(canonical({ status, isManualLocked }), status);
    }
    assert.equal(auto({ isManualLocked, coverage: { hasAssignments: true, hasUnassignedCards: false } }), 'IN_PROGRESS');
    assert.equal(auto({ isManualLocked, coverage: { hasAssignments: true, hasUnassignedCards: true } }), 'ORDER_RECEIVED');
  }
  assert.equal(lock({ order: { modificationLockedAt: new Date() }, isAssignmentLocked: true }).isLocked, false);
});

test('retired manual lock endpoint never invokes the old assignment quantity/ST sync', async () => {
  let handler;
  execute(section('app.post("/orders/:orderId/modification-lock"', 'app.delete("/orders/:orderId"'), {
    app: { post: (_path, callback) => { handler = callback; } }, requireOrgRole: async () => ({}),
    ORG_MANAGEMENT_ROLES: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'],
  });
  let status;
  const response = await handler({}, { status: value => { status = value; return { json: value => value }; } });
  assert.equal(status, 410); assert.equal(response.error, 'ORDER_MANUAL_LOCK_RETIRED');
});

function deletion({ assigned = false, stale = false, failCards = false, conflict = false } = {}) {
  let handler, committed = false, deleted = false;
  const existing = { id: 1, updatedAt: new Date('2026-09-17'), buyerOrgId: 8, sellerOrgId: 7 };
  const tx = {
    assignmentCard: { deleteMany: async ({ where }) => {
      assert.deepEqual(where, { workOrderId: 1 }); assert.equal(deleted, false);
    } },
    workOrder: {
      findFirst: async () => ({ ...existing, updatedAt: stale ? new Date(0) : existing.updatedAt }),
      delete: async () => { deleted = true; },
    }, assignmentPlan: { findFirst: async ({ where }) => {
      assert.deepEqual(where.OR, [{ workOrderId: 1 }, { assignmentCard: { is: { workOrderId: 1 } } }]);
      return assigned ? { id: 55 } : null;
    } },
  };
  execute(section('app.delete("/orders/:orderId"', 'app.post("/customers"'), {
    app: { delete: (_path, callback) => { handler = callback; } },
    requireOrgRole: async () => ({ organization: { id: 7 } }), getOrderAccessWhere: () => [{ sellerOrgId: 7 }],
    ORG_MANAGEMENT_ROLES: ['ADMIN', 'OPERATOR', 'ACCOUNTANT'],
    prisma: { workOrder: { findFirst: async () => existing }, $transaction: async (run, options) => {
      assert.equal(options.isolationLevel, 'Serializable'); await run(tx);
      if (conflict) throw Object.assign(new Error(), { code: 'P2034' });
      committed = true;
    } }, editTransaction, STALE_EDIT, createHttpError: httpError, ORDER_MODIFICATION_LOCK_ERROR: 'locked',
    isOrderModificationLocked: async (_order, db) => { assert.equal(db, tx); return false; },
    rebuildOrderPartyCardsTx: async (db, ids) => {
      assert.equal(db, tx); assert.deepEqual(ids, [8, 7]); if (failCards) throw Error('card failure');
    },
  });
  return { run: () => handler({ params: { orderId: 'a' } }, { status: () => ({ send() {} }) }),
    state: () => ({ committed, deleted }) };
}

test('order deletion protects all assignments and rejects changed source before any deletion', async () => {
  for (const options of [{ assigned: true }, { stale: true }]) {
    const app = deletion(options); await assert.rejects(app.run(), /ORDER_ASSIGNMENT_REVIEW|STALE_EDIT/);
    assert.deepEqual(app.state(), { committed: false, deleted: false });
  }
});

test('order deletion commits with both party cards or fails atomically on rebuild/serialization', async () => {
  const valid = deletion(); await valid.run(); assert.equal(valid.state().committed, true);
  for (const options of [{ failCards: true }, { conflict: true }]) {
    const app = deletion(options); await assert.rejects(app.run(), /card failure|STALE_EDIT/);
    assert.equal(app.state().committed, false);
  }
});

test('frontend fails closed on absent readiness and refreshes saved orders through dirty-tab protection', () => {
  const board = readFileSync('frontend/src/pages/App/assign/AssignBoard.jsx', 'utf8');
  const gate = board.match(/const isCardOrderAssignmentReady =[^;]+;/)[0];
  const isReady = new Function(`${gate}; return isCardOrderAssignmentReady;`)();
  assert.equal(isReady({ isOrderAssignmentReady: true }), true);
  assert.equal(isReady({ isManualOrderLocked: true }), false);
  assert.equal(isReady({}), false);
  assert.match(board, /topics: \[WORKSPACE_DATA_TOPICS.ORDERS,/);
  assert.match(board, /isBlocked: loading \|\| persisting \|\| isDirty/);
  assert.doesNotMatch(board, /subscribeOrderModificationLockChanged|ORDER_UNLOCKED/);
  const ui = readFileSync('frontend/src/pages/App/order/OrderList.jsx', 'utf8');
  assert.doesNotMatch(ui, /<LockToggleSwitch|handleModificationLockToggle\(/);
});
