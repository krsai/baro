import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../backend/dist/index.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const text = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
  assert.ok(text.length > 0, start);
  return text;
};
function harness({ existing = null, failOrg = null, conflict = null, alwaysConflict = false } = {}) {
  let stored = { order: existing, items: [], cards: {} };
  let attempts = 0;
  const seen = [];
  const db = { $transaction: async (run, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    attempts++;
    const draft = structuredClone(stored);
    const tx = { draft,
      workOrder: {
        findFirst: async () => draft.order,
        create: async ({ data }) => (draft.order = { id: 1, ...data }),
        update: async ({ data }) => (draft.order = { ...draft.order, ...data }),
        findUnique: async () => ({ ...draft.order, workOrderItems: draft.items }),
      },
      workOrderItem: { createMany: async ({ data }) => { draft.items = data; } },
    };
    const result = await run(tx);
    if (conflict && (attempts === 1 || alwaysConflict)) throw Object.assign(new Error('conflict'), { code: conflict });
    stored = draft;
    return result;
  } };
  const positive = value => Number.isSafeInteger(value) && value > 0 ? value : null;
  const context = {
    db_1: { prisma: db }, common_1: { toPositiveIntOrNull: positive },
    http_1: { createHttpError: (status, message) => Object.assign(new Error(message), { status }), getErrorCode: error => error.code },
    client_1: { Prisma: { JsonNull: null, TransactionIsolationLevel: { Serializable: 'Serializable' } } },
    ORDER_CREATE_SERIALIZABLE_RETRIES: 2, WORK_ORDER_RESPONSE_INCLUDE: {},
    normalizeOrderItems: items => items, normalizeWorkOrderItemGender: value => value,
    toNonNegativeInt: value => value,
    rebuildAssignmentCardsForOrgTx: async (orgId, tx) => {
      assert.ok(tx.draft.order, 'order must be saved before card rebuild');
      seen.push(orgId);
      tx.draft.cards[orgId] = { workOrderId: tx.draft.order.id };
      if (orgId === failOrg) throw new Error('second organization failed');
      return { syncedCards: [] };
    },
  };
  vm.runInNewContext(section('const rebuildOrderPartyCardsTx =', 'const ASSIGNMENT_CARD_REBUILD_RETRYABLE_PRISMA_CODES') +
    section('const createOrReuseSharedOrder =', 'const workOrderItemToItemShape =') +
    '\nthis.create = createOrReuseSharedOrder;', context);
  return { create: () => context.create({ normalized: {
    buyerOrgId: 2, sellerOrgId: 3, orderNumber: 'test', orderId: 'test',
    items: [{ id: 'row1', styleId: 7, colorId: 8, gender: 'M', totalQuantity: 10 }],
  } }), state: () => stored, attempts: () => attempts, seen };
}

test('order creation persists both parties and items in the same transaction', async () => {
  const app = harness();
  assert.equal((await app.create()).created, true);
  assert.deepEqual(app.seen, [2, 3]);
  assert.equal(app.state().items.length, 1);
  assert.deepEqual(Object.keys(app.state().cards), ['2', '3']);
});
test('second party failure rolls back order, items and first party cards', async () => {
  const app = harness({ failOrg: 3 });
  await assert.rejects(app.create(), /second organization failed/);
  assert.deepEqual(app.state(), { order: null, items: [], cards: {} });
});
test('reuse normalizes legacy owner and rebuilds old and current parties once', async () => {
  const app = harness({ existing: { id: 1, orgId: 1, buyerOrgId: 2, sellerOrgId: 3 } });
  assert.equal((await app.create()).created, false);
  assert.equal(app.state().order.orgId, 2);
  assert.deepEqual(app.seen, [1, 2, 3]);
  await app.create();
  assert.deepEqual(app.seen.slice(3), [2, 3]);
});
test('reuse failure rolls back owner normalization too', async () => {
  const existing = { id: 1, orgId: 1, buyerOrgId: 2, sellerOrgId: 3 };
  const app = harness({ existing, failOrg: 3 });
  await assert.rejects(app.create(), /second organization failed/);
  assert.deepEqual(app.state().order, existing);
  assert.deepEqual(app.state().cards, {});
});
test('serialization and unique conflicts retry the entire order and both parties', async () => {
  for (const conflict of ['P2034', 'P2002']) {
    const app = harness({ conflict });
    await app.create();
    assert.equal(app.attempts(), 2);
    assert.deepEqual(app.seen, [2, 3, 2, 3]);
    assert.equal(app.state().items.length, 1);
  }
});
test('POST no longer has a separate card rebuild after the order commit', () => {
  const source = readFileSync(new URL('../backend/src/index.ts', import.meta.url), 'utf8');
  const route = source.slice(source.indexOf('app.post("/orders",'), source.indexOf('app.put("/orders/:orderId",'));
  assert.match(route, /createOrReuseSharedOrder/);
  assert.doesNotMatch(route, /rebuildAssignmentCardsForOrgIds/);
});

test('persistent unique conflicts never return an existing order as a false success', async () => {
  const existing = { id: 1, orgId: 2, buyerOrgId: 2, sellerOrgId: 3 };
  const app = harness({ existing, conflict: 'P2002', alwaysConflict: true });
  await assert.rejects(app.create(), error => error.code === 'P2002');
  assert.equal(app.attempts(), 3);
  assert.deepEqual(app.state(), { order: existing, items: [], cards: {} });
});

test('order-save card cleanup retains rows referenced by assignments while deleting unused cards', async () => {
  let cards = [{ cardId: 'linked', assigned: true }, { cardId: 'unused', assigned: false }];
  const db = { assignmentCard: { deleteMany: async ({ where }) => {
    assert.equal(where.orgId, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(where.assignmentPlans)), { none: {} });
    cards = cards.filter(card => card.assigned);
  } } };
  const context = { normalizeAssignmentCardsForStore: () => [], loadAssignmentCardsForOrg: async () => cards };
  vm.runInNewContext(section('const syncAssignmentCardsForOrg =', 'const hydrateAssignmentFkRefsFromCards =') + '\nglobalThis.sync = syncAssignmentCardsForOrg;', context);
  const result = await context.sync({ orgId: 3, cards: [], db, preserveAssignedCards: true });
  assert.deepEqual(result, [{ cardId: 'linked', assigned: true }]);
});
