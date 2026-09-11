import test from 'node:test';
import assert from 'node:assert/strict';
import prior from '../backend/dist/services/atSharedPrior.js';
const { buildSharedAtPrediction } = prior;
const row = (styleId, category = 'JACKET', a = 50, b = 10000, quantities = [100, 500, 1000]) => ({
  id: styleId, styleId, orgId: 1, productionStage: 'SEWING', genderScope: 'UNISEX', ptSeconds: 50,
  style: { collection: category }, atObservations: quantities.map((quantity, index) => ({ assignmentPlanId: styleId * 100 + index, quantity, allocatedLaborInputSeconds: a * quantity + b })),
});
const target = (id = 20, category = 'JACKET') => ({ ...row(id, category), atObservations: [] });
const seconds = (p, q) => p.a + p.b / q;

test('new style borrows category/common setup and stays monotonic without mutating training data', () => {
  const donors = [row(1), row(2), row(3, 'SHIRT', 50, 2000)];
  const before = JSON.stringify(donors);
  const result = buildSharedAtPrediction(target(), donors);
  assert.equal(result.source, 'CATEGORY_PRIOR');
  assert.ok(seconds(result, 100) > seconds(result, 1000));
  assert.equal(result.categoryStyleCount, 2);
  assert.equal(JSON.stringify(donors), before);
  assert.equal(buildSharedAtPrediction(target(20, 'NEW'), donors).source, 'COMMON_PRIOR');
});
test('a single 3300 batch anchors a nonconstant shared curve at its own observed time', () => {
  const own = row(20, 'JACKET', 40, 6600, [3300]);
  const prediction = buildSharedAtPrediction(own, [row(1), row(2)]);
  assert.equal(prediction.source, 'OBSERVATION_ANCHORED');
  assert.ok(Math.abs(seconds(prediction, 3300) - 42) < 1e-8);
  assert.ok(seconds(prediction, 100) > seconds(prediction, 1000));
});
test('own observations gradually outweigh donors and categories remain style weighted', () => {
  const donors = [row(1), row(2)];
  const small = buildSharedAtPrediction(row(20), donors);
  const large = buildSharedAtPrediction(row(20, 'JACKET', 50, 10000, Array.from({ length: 30 }, (_, i) => 100 + i * 100)), donors);
  assert.ok(large.ownWeight > small.ownWeight);
  const duplicatedStyle = [...donors, ...Array.from({ length: 10 }, (_, i) => ({ ...row(1), id: 100 + i }))];
  assert.equal(buildSharedAtPrediction(target(), duplicatedStyle).donorStyleCount, 2);
});
test('foreign organizations, stages, own style and nonidentifiable donors cannot leak into a prior', () => {
  const result = buildSharedAtPrediction(target(), [row(20), { ...row(1), orgId: 2 }, { ...row(2), productionStage: 'IRONING' }, row(3, 'JACKET', 50, 10000, [100, 100])]);
  assert.equal(result.donorStyleCount, 0);
  assert.equal(result.source, 'PT_ST_PRIOR');
  assert.equal(result.b, 0);
  assert.equal(buildSharedAtPrediction({ ...target(), ptSeconds: null }, []), null);
  assert.equal(buildSharedAtPrediction({ ...target(), ptSeconds: null, standards: [{ bucketStSeconds: 70 }] }, []).a, 70);
});
test('leave-one-style-out prediction improves over a flat PT baseline on a known shared curve', () => {
  const styles = [row(1), row(2), row(3), row(4)];
  for (const heldOut of styles) {
    const prediction = buildSharedAtPrediction({ ...heldOut, atObservations: [] }, styles);
    assert.equal(prediction.donorStyleCount, 3);
    const expected = 50 + 10000 / 100;
    assert.ok(Math.abs(seconds(prediction, 100) - expected) < Math.abs(50 - expected));
  }
});
