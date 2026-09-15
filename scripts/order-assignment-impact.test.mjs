import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { analyzeOrderAssignmentImpact: analyze } = require('../backend/dist/utils/orderAssignmentImpact.js');
const item = (totalQuantity, gender = 'M', styleId = 1) => ({ styleId, totalQuantity, gender });
const plan = (id, assignmentQuantity, extra = {}) => ({ id, styleId: 1, assignmentQuantity,
  hasWorkRecords: false, isCompleted: false, isPayrollLocked: false, ...extra });
const impact = (beforeItems, afterItems, assignments = []) => analyze({ beforeItems, afterItems, assignments });

test('new order leaves all quantity unassigned; display-only changes do not require assignment review', () => {
  assert.equal(impact([], [item(100)])[0].remainingQuantity, 100);
  const row = impact([item(100)], [{ ...item(100), label: 'new label', dueDate: '2026-10-01' }], [plan(1, 60)])[0];
  assert.equal(row.remainingQuantity, 40);
  assert.equal(row.requiresAssignmentReview, false);
});
test('split allocations remain intact while increased and decreased order quantities change the remainder', () => {
  const assignments = [plan(1, 30), plan(2, 40)];
  for (const [quantity, remaining, excess] of [[120, 50, 0], [80, 10, 0], [50, 0, 20]]) {
    const row = impact([item(100)], [item(quantity)], assignments)[0];
    assert.equal(row.assignedQuantity, 70);
    assert.equal(row.remainingQuantity, remaining);
    assert.equal(row.overAssignedQuantity, excess);
    assert.equal(row.isSplit, true);
    assert.equal(row.requiresAssignmentReview, true);
  }
  assert.deepEqual(assignments.map(p => p.assignmentQuantity), [30, 40]);
});
test('same-total gender changes are detected, including unspecified gender', () => {
  const row = impact([item(60), item(40, 'W')], [item(40), item(60, 'W')], [plan(1, 100)])[0];
  assert.equal(row.quantityChanged, false);
  assert.equal(row.genderQuantitiesChanged, true);
  assert.equal(row.requiresAssignmentReview, true);
  assert.equal(impact([item(100, null)], [item(100)], [plan(1, 100)])[0].genderQuantitiesChanged, true);
  assert.equal(impact([item(100, null)], [item(100, 'U')])[0].genderQuantitiesChanged, false);
});
test('removed styles retain work-record, completed and payroll-locked identities, including zero plans', () => {
  const row = impact([item(100)], [], [plan(1, 20, { hasWorkRecords: true }),
    plan(2, 80, { isCompleted: true }), plan(3, 0, { isPayrollLocked: true })])[0];
  assert.equal(row.styleRemoved, true);
  assert.equal(row.overAssignedQuantity, 100);
  assert.deepEqual(row.workRecordAssignmentIds, [1]);
  assert.deepEqual(row.completedAssignmentIds, [2]);
  assert.deepEqual(row.payrollLockedAssignmentIds, [3]);
  const zero = impact([item(0)], [], [plan(1, 0, { hasWorkRecords: true })])[0];
  assert.equal(zero.requiresAssignmentReview, true);
});
test('styles never cancel each other out and existing orphan allocations remain visible', () => {
  const rows = impact([item(100)], [item(100, 'M', 2)], [plan(1, 100), plan(2, 20, { styleId: 3 })]);
  assert.deepEqual(rows.map(r => [r.styleId, r.remainingQuantity, r.overAssignedQuantity]), [[1, 0, 100], [2, 100, 0], [3, 0, 20]]);
});
test('inputs and snapshots are untouched and row ordering does not change results', () => {
  const assignments = [plan(2, 40, { snapshot: { seconds: 123 } }), plan(1, 60)];
  const before = [item(60), item(40, 'W')];
  const copy = structuredClone({ before, assignments });
  const a = impact(before, [item(120)], assignments);
  const b = impact([...before].reverse(), [item(120)], [...assignments].reverse());
  assert.deepEqual(a, b);
  assert.deepEqual({ before, assignments }, copy);
});
test('invalid quantities, missing identities and protection flags fail instead of becoming zero', () => {
  for (const bad of [-1, NaN, null, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => impact([], [item(bad)]), /INVALID_INPUT/);
    assert.throws(() => impact([], [], [plan(1, bad)]), /INVALID_INPUT/);
  }
  assert.throws(() => impact([], [item(1, 'unknown')]), /INVALID_INPUT/);
  assert.throws(() => impact([], [item(1, 'M', 0)]), /INVALID_INPUT/);
  assert.throws(() => impact([], [], [plan(1, 1), plan(1, 2)]), /INVALID_INPUT/);
  assert.throws(() => impact([], [], [plan(1, 1, { isPayrollLocked: undefined })]), /INVALID_INPUT/);
  assert.throws(() => impact([], [item(Number.MAX_SAFE_INTEGER), item(1)]), /INVALID_INPUT/);
});
