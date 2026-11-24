import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { prismaPGlite } from './helpers/prisma-pglite.mjs';
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

test('actual Prisma queries preserve normal registration, card completion rejection, retry and batch rollback', async () => {
  const f = await prismaPGlite();
  try {
    const schema = execFileSync(process.execPath, [path.resolve('backend/node_modules/prisma/build/index.js'),
      'migrate', 'diff', '--from-empty', '--to-schema-datamodel', path.resolve('backend/prisma/schema.prisma'), '--script'],
    { encoding: 'utf8', env: { ...process.env, DIRECT_URL: 'postgresql://test:local@127.0.0.1:5432/test' }, maxBuffer: 20 * 1024 * 1024 });
    await f.pg.exec(schema);
    await f.pg.exec(readFileSync('backend/prisma/migrations/20261009180000_prior_production_completion/migration.sql', 'utf8'));
    const db = f.db;
    const company = await db.organization.create({ data: { name: 'Review Factory', type: 'MANUFACTURER' } });
    const buyer = await db.organization.create({ data: { name: 'Review Brand', type: 'BRAND' } });
    const gradeSet = await db.employeeGradeSet.create({ data: { orgId: company.id, code: 'REVIEW', name: 'Review Grades' } });
    const grade = await db.employeeGrade.create({ data: { orgId: company.id, setId: gradeSet.id, code: 'ADMIN', name: 'Admin', nameKo: 'Admin', nameEn: 'Admin', nameVi: 'Admin', sortOrder: 0 } });
    const actor = await db.employee.create({ data: { orgId: company.id, gradeId: grade.id, name: 'Reviewer', status: 'ACTIVE', orgRole: 'ADMIN' } });
    const product = await db.styleProduct.create({ data: { ownerOrgId: buyer.id, fields: {} } });
    await db.styleProductRevision.create({ data: { productId: product.id, revision: 1, ownerOrgId: buyer.id, actorOrgId: buyer.id, fields: {} } });
    const style = await db.style.create({ data: { orgId: company.id, customerOrgId: buyer.id, code: 'REVIEW', name: 'Review Style',
      productStyleId: product.id, productOwnerOrgId: buyer.id, appliedProductRevision: 1 } });
    const makeOrder = key => db.workOrder.create({ data: { orgId: company.id, orderId: key, orderNumber: key, totalQuantity: 100,
      workOrderItems: { create: { itemId: 'item', styleId: style.id, totalQuantity: 100 } } } });
    const normal = await makeOrder('normal'), blocked = await makeOrder('blocked');
    const factory = await db.factory.create({ data: { orgId: company.id, name: 'Review Factory' } });
    const card = await db.assignmentCard.create({ data: { orgId: company.id, cardId: 'review-card', workOrderId: blocked.id, payload: {} } });
    const plan = await db.assignmentPlan.create({ data: { orgId: company.id, externalId: 'review-plan', factoryId: factory.id,
      assignmentCardId: card.id, styleId: style.id, startIndex: 0, endIndex: 1, assignmentQuantity: 100 } });
    const request = (order, key) => ({ ...input, workOrderId: order.id, styleId: style.id, clientKey: key });
    const openProgress = async (tx, orgId, ids) => {
      assert.equal(orgId, company.id);
      const plans = await tx.assignmentPlan.findMany({ where: { orgId, externalId: { in: ids } } });
      return plans.map(row => ({ id: row.externalId, isCompleted: false }));
    };
    for (const field of ['isCompleted', 'productionCompletedAt', 'completedAt', 'closedAt', 'scheduleStatus']) {
      await db.assignmentPlan.update({ where: { id: plan.id }, data: { [field]: field === 'isCompleted' ? true : field === 'scheduleStatus' ? 'PRODUCTION_COMPLETED' : new Date() } });
      await assert.rejects(registerPriorCompletion(db, company.id, actor.id, request(blocked, 'blocked-' + field), openProgress), /EXISTING_COMPLETION_REQUIRES_REVIEW/);
      assert.equal(await db.priorProductionCompletion.count(), 0);
      await db.assignmentPlan.update({ where: { id: plan.id }, data: { [field]: field === 'isCompleted' ? false : null } });
    }
    await assert.rejects(db.$transaction(async tx => {
      await registerPriorCompletion(tx, company.id, actor.id, request(normal, 'rolled-back'), openProgress);
      await registerPriorCompletion(tx, company.id, actor.id, request(blocked, 'canonical-block'), async () => [{ id: plan.externalId, isCompleted: true }]);
    }), /EXISTING_COMPLETION_REQUIRES_REVIEW/);
    assert.equal(await db.priorProductionCompletion.count(), 0, 'later batch failure rolls back earlier history');
    assert.equal((await db.workOrder.findUnique({ where: { id: normal.id } })).updatedAt.getTime(), normal.updatedAt.getTime());
    const saved = await registerPriorCompletion(db, company.id, actor.id, request(blocked, 'open-card'), openProgress);
    assert.equal(saved.quantity, 100);
    await db.assignmentPlan.update({ where: { id: plan.id }, data: { isCompleted: true } });
    const retry = await registerPriorCompletion(db, company.id, actor.id, request(blocked, 'open-card'), async () => assert.fail('retry must not re-register production'));
    assert.equal(retry.id, saved.id);
    assert.equal(await db.priorProductionCompletion.count(), 1);
    const snapshot = await db.$transaction(tx => recordOrderQuantityReduction(tx, blocked,
      [{ id: 'item', styleId: style.id, totalQuantity: 80 }], '', 'review', rows => rows.map(row => ({
        orgId: row.orgId, styleId: row.styleId, assignedQuantity: row.assignmentQuantity, producedQuantity: 100,
      }))));
    assert.equal(snapshot.snapshot.production[0].excessQuantity, 20);
    assert.equal(snapshot.snapshot.assignments.length, 1);
    assert.equal((await db.assignmentPlan.findUnique({ where: { id: plan.id } })).assignmentQuantity, 100);
  } finally { await f.close(); }
});
