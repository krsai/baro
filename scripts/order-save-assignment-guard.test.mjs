import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { guardOrderSaveAssignments: guard } = require('../backend/dist/services/orderSaveAssignmentGuard.js');
const item = (totalQuantity, gender = 'M', styleId = 1) => ({ styleId, totalQuantity, gender });
const order = { id: 1, buyerOrgId: 2, sellerOrgId: 3 };
const plan = (id, quantity, orgId = 3, extra = {}) => ({ id, orgId, workOrderId: 1, styleId: 1,
  externalId: `p${id}`, assignmentQuantity: quantity, _count: { workRecords: 1, outsourcedWorkRecords: 0 }, ...extra });
function app({ items = [item(100)], plans = [plan(1, 30), plan(2, 40)] } = {}) {
  const reads = [], payroll = [];
  const before = JSON.stringify({ items, plans });
  const db = {
    workOrderItem: { findMany: async query => { assert.deepEqual(query.where, { workOrderId: 1 }); reads.push(query); return items; } },
    assignmentPlan: { findMany: async query => { assert.deepEqual(query.where.OR, [{ workOrderId: 1 }, { assignmentCard: { is: { workOrderId: 1 } } }]); return plans; } },
  };
  return { run: (next, after = order) => guard(db, order, after, next, async (orgId, rows, tx) => {
    assert.equal(tx, db); assert.ok(rows.every(row => row.orgId === orgId)); payroll.push(orgId);
    return rows.map(row => ({ ...row, isPayrollLocked: true }));
  }), payroll, unchanged: () => assert.equal(JSON.stringify({ items, plans }), before) };
}
test('split, worked and payroll-protected plans remain untouched while only unallocated quantity changes', async () => {
  for (const quantity of [100, 150, 70]) {
    const a = app(); const result = await a.run([item(quantity)]);
    assert.equal(result[0].impacts[0].remainingQuantity, quantity - 70);
    assert.deepEqual(result[0].impacts[0].payrollLockedAssignmentIds, [1, 2]); a.unchanged();
  }
});
test('allocation reduction and style removal require explicit assignment review', async () => {
  for (const items of [[item(69)], [], [item(100, 'M', 2)]]) {
    const a = app(); await assert.rejects(a.run(items), /ORDER_ASSIGNMENT_REVIEW/); a.unchanged();
  }
});
test('same total gender swaps and mixed-gender quantity changes cannot silently change time targets', async () => {
  await assert.rejects(app().run([item(100, 'W')]), /ORDER_ASSIGNMENT_REVIEW/);
  await assert.rejects(app().run([item(50), item(50, 'W')]), /ORDER_ASSIGNMENT_REVIEW/);
  await assert.rejects(app({ items: [item(50), item(50, 'W')] }).run([item(60), item(50, 'W')]), /ORDER_ASSIGNMENT_REVIEW/);
});
test('each organization has its own quantity floor, never a combined cross-organization sum', async () => {
  const a = app({ plans: [plan(1, 80, 2), plan(2, 80, 3)] });
  const result = await a.run([item(80)]);
  assert.deepEqual(a.payroll, [2, 3]); assert.equal(result.length, 2);
  assert.ok(result.every(row => row.impacts[0].overAssignedQuantity === 0));
});
test('assigned party changes and ambiguous links fail before card reconstruction', async () => {
  await assert.rejects(app().run([item(100)], { ...order, buyerOrgId: 8 }), /buyer or seller/);
  for (const extra of [{ workOrderId: null }, { styleId: null }, { assignmentQuantity: null }, { assignmentCard: { workOrderId: 2 } }]) {
    await assert.rejects(app({ plans: [plan(1, 50, 3, extra)] }).run([item(100)]), /repair assignment/);
  }
});
test('unassigned styles may be added or removed and zero-quantity linked plans are preserved', async () => {
  const a = app({ items: [item(100), item(50, 'M', 2)] });
  await a.run([item(100), item(25, 'M', 3)]); a.unchanged();
  assert.deepEqual(await app({ plans: [] }).run([item(20, 'M', null)], { ...order, sellerOrgId: 8 }), []);
  await assert.rejects(app({ plans: [plan(1, 0)] }).run([]), /ORDER_ASSIGNMENT_REVIEW/);
});
