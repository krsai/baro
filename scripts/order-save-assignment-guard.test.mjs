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
  for (const quantity of [100, 150, 70, 20]) {
    const a = app(); const result = await a.run([item(quantity)]);
    assert.equal(result[0].impacts[0].remainingQuantity, Math.max(0, quantity - 70));
    assert.equal(result[0].impacts[0].overAssignedQuantity, Math.max(0, 70 - quantity));
    assert.deepEqual(result[0].impacts[0].payrollLockedAssignmentIds, [1, 2]); a.unchanged();
  }
});
test('removing an assigned style still requires explicit assignment review', async () => {
  for (const items of [[], [item(100, 'M', 2)]]) {
    const a = app(); await assert.rejects(a.run(items), /ORDER_ASSIGNMENT_REVIEW/); a.unchanged();
  }
});
test('mixed gender reductions on completed production preserve assignment and payroll history', async () => {
  const a = app({ items: [item(50), item(50, 'W')], plans: [plan(1,100,3,{isCompleted:true})] });
  const result = await a.run([item(20),item(30,'W')]);
  assert.equal(result[0].impacts[0].overAssignedQuantity,50);
  assert.deepEqual(result[0].impacts[0].completedAssignmentIds,[1]);
  a.unchanged();
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
