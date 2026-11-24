import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { summarizeStyleProduction: summarize } = require('../backend/dist/services/productionProgress.js');
const { invoiceOrderProgress } = require('../backend/dist/services/invoiceOrderProgress.js');
const { readBrandSewingOrders } = require('../backend/dist/services/brandSewing.js');

function permutations(rows) {
  if (rows.length < 2) return [rows];
  return rows.flatMap((row, i) => permutations(rows.filter((_, j) => i !== j)).map(rest => [row, ...rest]));
}

test('all six allocation orders agree across 1,000 mixed completion and actual quantity cases', () => {
  const states = [0, 10, 30, 50, 70].flatMap(producedQuantity => [false, true].map(isCompleted => ({
    plannedQuantity: 50, producedQuantity, isCompleted, completionTargetQuantity: 50,
    operationalProgressRatio: producedQuantity / 50,
  })));
  let comparisons = 0;
  for (const a of states) for (const b of states) for (const c of states) {
    const rows = [a, b, c], before = structuredClone(rows);
    for (const quantity of [0, 20, 100, 150]) {
      const expected = summarize(150, rows, [{ quantity }]);
      for (const shuffled of permutations(rows)) {
        assert.deepEqual(summarize(150, shuffled, [{ quantity }]), expected);
        comparisons++;
      }
      assert.ok(expected.producedQuantity >= quantity + rows.reduce((sum, row) => sum + row.producedQuantity, 0));
      assert.equal(expected.isCompleted, quantity === 150 || rows.every(row => row.isCompleted));
    }
    assert.deepEqual(rows, before, 'aggregation must not modify source records');
  }
  assert.equal(comparisons, 24000);
});

test('independent garment examples preserve actual excess and historical cancellation', () => {
  const completed = actual => ({ plannedQuantity: 50, completionTargetQuantity: 50, producedQuantity: actual, isCompleted: true });
  const open = { plannedQuantity: 50, producedQuantity: 10, operationalProgressRatio: .2 };
  const examples = [
    { rows: [completed(0), open], prior: 20, produced: 60, percent: 60 },
    { rows: [completed(50), open], prior: 20, produced: 80, percent: 60 },
    { rows: [completed(70), open], prior: 20, produced: 100, percent: 80 },
    { rows: [completed(0), completed(50)], prior: 20, produced: 100, percent: 100 },
    { rows: [completed(70), completed(50)], prior: 20, produced: 140, percent: 120 },
  ];
  for (const example of examples) {
    const result = summarize(100, example.rows, [{ quantity: example.prior }, { quantity: 999, canceledAt: '2026-11-01' }]);
    assert.equal(result.producedQuantity, example.produced);
    assert.equal(result.progressPercent, example.percent);
    assert.equal(result.priorQuantity, example.prior);
  }
});

test('historical credit never clears unknown actuals, broken references or missing allocations', () => {
  for (const quantity of [20, 100]) for (const producedQuantity of [0, 10, 120]) {
    for (const flag of ['isProgressUnknown', 'isProductionProgressUnknown', 'hasInvalidProcessReferences', 'hasInvalidProductionProcessReferences']) {
      const row = { plannedQuantity: 100, producedQuantity, operationalProgressRatio: .4, [flag]: true };
      const result = summarize(100, [row], [{ quantity }]);
      const historicalOnly = quantity === 100 && producedQuantity === 0 && flag.startsWith('is');
      assert.equal(result.isProgressUnknown, !historicalOnly, JSON.stringify({ quantity, producedQuantity, flag }));
      assert.equal(result.producedQuantity, historicalOnly ? 100 : null);
    }
  }
  assert.equal(summarize(100, [], [{ quantity: 100 }], 1).producedQuantity, null);
  assert.equal(summarize(100, [], [{ quantity: 100 }], 0).producedQuantity, 100);
});

test('brand projection and invoice selection agree for corrected mixed and unknown production', async () => {
  const order = { id: 1, orderId: 'ORDER-1', sellerOrgId: 1, totalQuantity: 100,
    workOrderItems: [{ styleId: 7, totalQuantity: 100, style: { id: 7, customerOrgId: 2, productStyle: { id: 9, ownerOrgId: 2 } } }],
    priorCompletions: [{ styleId: 7, quantity: 20 }] };
  const plans = ['a', 'b'].map(externalId => ({ externalId, orgId: 1, workOrderId: 1, styleId: 7 }));
  const rows = [{ id: 'a', plannedQuantity: 50, producedQuantity: 0, completionTargetQuantity: 50, isCompleted: true },
    { id: 'b', plannedQuantity: 50, producedQuantity: 10, operationalProgressRatio: .2 }];
  const db = { workOrder: { findMany: async () => [order] }, assignmentPlan: { findMany: async () => plans } };
  for (const unknown of [false, true]) {
    rows[1].isProductionProgressUnknown = unknown;
    for (const reverse of [false, true]) {
      if (reverse) plans.reverse();
      const [brand] = await readBrandSewingOrders(db, 2, async () => rows);
      const invoice = invoiceOrderProgress(order, plans, rows);
      assert.equal(brand.producedQuantity, unknown ? null : 60);
      assert.equal(brand.progressPercent, unknown ? null : 60);
      assert.equal(brand.producedQuantity, invoice.producedQuantity);
      assert.equal(brand.styles[0].isProgressUnknown, unknown);
      assert.equal(brand.isCompleted, false);
    }
  }
});
