import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { registerPriorCompletion } = require('../backend/dist/services/priorProductionCompletion');
const { recordOrderQuantityReduction } = require('../backend/dist/services/orderQuantityChange');

// Interpret Prisma's query predicates against explicit relational fixtures.
const matches = (row, where) => Object.entries(where).every(([key, value]) => {
  if (key === 'OR') return value.some(part => matches(row, part));
  if (key === 'AND') return value.every(part => matches(row, part));
  if (value && typeof value === 'object') {
    if ('not' in value) return (row[key] ?? null) !== value.not;
    if ('is' in value) return row[key] != null && matches(row[key], value.is);
  }
  return (row[key] ?? null) === value;
});
const input = { workOrderId: 1, styleId: 7, quantity: 100, reasonId: 1, clientKey: 'review-check-key', completedPeriod: '2026-10', acknowledgeSeparateRecords: true };
const basePlan = { orgId: 1, styleId: 7, externalId: 'p', workOrderId: 1, isCompleted: false };
function fixture(plans) {
  let writes = 0;
  const db = { $queryRaw: async () => [],
    workOrder: { findFirst: async () => ({ id: 1, updatedAt: new Date(), workOrderItems: [{ styleId: 7, totalQuantity: 100 }] }), update: async () => { writes++; } },
    employee: { findFirst: async () => ({ id: 1 }) }, priorCompletionReason: { findFirst: async () => ({ id: 1 }) },
    assignmentPlan: { count: async ({ where }) => plans.filter(row => matches(row, where)).length,
      findMany: async ({ where }) => plans.filter(row => matches(row, where)) },
    priorProductionCompletion: { findUnique: async () => null, aggregate: async () => ({ _sum: { quantity: 0 } }),
      create: async ({ data }) => { writes++; return data; } },
  };
  return { db, writes: () => writes };
}
test('all persisted completion evidence blocks duplicate historical credit including card-only links', async () => {
  for (const field of ['isCompleted', 'productionCompletedAt', 'completedAt', 'closedAt', 'scheduleStatus']) {
    for (const cardOnly of [false, true]) {
      const plan = { ...basePlan, [field]: field === 'isCompleted' ? true : field === 'scheduleStatus' ? 'PRODUCTION_COMPLETED' : new Date(),
        ...(cardOnly ? { workOrderId: null, assignmentCard: { workOrderId: 1, orgId: 1 } } : {}) };
      const f = fixture([plan]);
      await assert.rejects(registerPriorCompletion(f.db, 1, 1, input, async () => assert.fail('persisted completion must reject first')), /EXISTING_COMPLETION_REQUIRES_REVIEW/);
      assert.equal(f.writes(), 0);
    }
  }
});
test('canonical completion and missing progress reject before any history write', async () => {
  for (const rows of [[{ id: 'p', isCompleted: true }], []]) {
    const f = fixture([{ ...basePlan, workOrderId: null, assignmentCard: { workOrderId: 1, orgId: 1 } }]);
    await assert.rejects(registerPriorCompletion(f.db, 1, 1, input, async (tx, orgId, ids) => {
      assert.equal(tx, f.db); assert.equal(orgId, 1); assert.deepEqual(ids, ['p']); return rows;
    }), /EXISTING_COMPLETION_REQUIRES_REVIEW/);
    assert.equal(f.writes(), 0);
  }
  const open = fixture([basePlan]);
  await registerPriorCompletion(open.db, 1, 1, input, async () => [{ id: 'p', isCompleted: false }]);
  assert.equal(open.writes(), 2);
});
test('another company or conflicting direct order cannot block this company historical credit', async () => {
  const f = fixture([{ ...basePlan, orgId: 2, isCompleted: true },
    { ...basePlan, workOrderId: null, assignmentCard: { workOrderId: 1, orgId: 2 }, isCompleted: true },
    { ...basePlan, workOrderId: 2, assignmentCard: { workOrderId: 1, orgId: 1 }, isCompleted: true }]);
  await registerPriorCompletion(f.db, 1, 1, input, async () => assert.fail('no related plans'));
  assert.equal(f.writes(), 2);
});
test('quantity reduction audit keeps card-only production, direct precedence and source records', async () => {
  const plans = [basePlan, { ...basePlan, externalId: 'card', workOrderId: null, assignmentCard: { workOrderId: 1, orgId: 1 } },
    { ...basePlan, externalId: 'foreign-card', workOrderId: null, assignmentCard: { workOrderId: 1, orgId: 2 } },
    { ...basePlan, externalId: 'wrong', workOrderId: 2, assignmentCard: { workOrderId: 1, orgId: 1 } }];
  const before = structuredClone(plans);
  let saved;
  const db = { workOrderItem: { findMany: async () => [{ itemId: 'item', styleId: 7, totalQuantity: 100 }] },
    assignmentPlan: { findMany: async ({ where }) => plans.filter(row => matches(row, where)) },
    orderQuantityChange: { create: async ({ data }) => { saved = data; return data; } } };
  await recordOrderQuantityReduction(db, { id: 1, updatedAt: new Date() }, [{ id: 'item', styleId: 7, totalQuantity: 80 }], '', 'actor', rows => {
    assert.deepEqual(rows.map(row => row.externalId), ['p', 'card']);
    return rows.map(row => ({ orgId: row.orgId, styleId: 7, assignedQuantity: 50, producedQuantity: 50 }));
  });
  assert.equal(saved.snapshot.production[0].producedQuantity, 100);
  assert.equal(saved.snapshot.production[0].excessQuantity, 20);
  assert.deepEqual(plans, before);
});
