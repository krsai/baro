import test from 'node:test';
import assert from 'node:assert/strict';
import prior from '../backend/dist/services/atSharedPrior.js';
const { buildSharedAtPrediction, buildValidatedSharedAtPrediction } = prior;
const row = (styleId, category = 'JACKET', a = 50, b = 10000, quantities = [100, 500, 1000]) => ({
  id: styleId, styleId, orgId: 1, productionStage: 'SEWING', genderScope: 'UNISEX', ptSeconds: 50,
  style: { categoryId: ({ JACKET: 1, SHIRT: 2, NEW: 3 })[category] ?? category, collection: category }, atObservations: quantities.map((quantity, index) => ({ assignmentPlanId: styleId * 100 + index, quantity, allocatedLaborInputSeconds: a * quantity + b })),
});
const target = (id = 20, category = 'JACKET') => ({ ...row(id, category), atObservations: [] });
const seconds = (p, q) => p.a + p.b * (q < p.smallQuantityBoundary ? (2 - q / p.smallQuantityBoundary) / p.smallQuantityBoundary : 1 / q);

test('category grouping uses immutable IDs across renames and isolates same-name categories',()=>{
  const donors=[row(1),row(2),{...row(3),style:{categoryId:2,collection:'JACKET'}}];
  const first=buildSharedAtPrediction(target(),donors);
  const renamed=buildSharedAtPrediction({...target(),style:{categoryId:1,collection:'Renamed'}},donors);
  assert.equal(first.categoryStyleCount,2);assert.equal(renamed.categoryStyleCount,2);
  assert.equal(first.a,renamed.a);assert.equal(first.b,renamed.b);
  assert.equal(buildSharedAtPrediction({...target(),style:{collection:'JACKET'}},donors).categoryStyleCount,0);
});

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

test('tiny quantities are bounded, continuous and monotonic in both unit and total time', () => {
  const p = buildSharedAtPrediction(target(), [row(1), row(2)]);
  assert.equal(p.smallQuantityBoundary, 100);
  assert.ok(seconds(p, 1) < 250);
  assert.ok(seconds(p, 10) < 250);
  assert.equal(seconds(p, 100), 150);
  assert.equal(seconds(p, 1000), 60);
  let lastUnit = Infinity, lastTotal = 0;
  for (let q = 1; q <= 10000; q++) {
    const unit = seconds(p, q);
    assert.ok(unit <= lastUnit && unit * q >= lastTotal);
    lastUnit = unit; lastTotal = unit * q;
  }
});
test('nearby large batches cannot identify shared setup; own small evidence is preserved', () => {
  assert.equal(buildSharedAtPrediction(target(), [row(1, 'JACKET', 50, 10000, [3000, 3100])]).donorStyleCount, 0);
  const p = buildSharedAtPrediction(row(20, 'JACKET', 50, 10000, [10]), [row(1)]);
  assert.equal(p.smallQuantityBoundary, 10);
  assert.equal(seconds(p, 10), 1050);
});

test('validated prediction preserves estimates and gains support beyond old sparse score ceilings', () => {
  const small = Array.from({ length: 3 }, (_, i) => row(i + 1));
  const large = Array.from({ length: 25 }, (_, i) => row(i + 1));
  const before = JSON.stringify(large);
  const a = buildValidatedSharedAtPrediction(target(100), small);
  const b = buildValidatedSharedAtPrediction(target(100), large);
  assert.equal(b.a, buildSharedAtPrediction(target(100), large).a);
  assert.equal(b.b, buildSharedAtPrediction(target(100), large).b);
  assert.ok(b.validation.reference.score > a.validation.reference.score);
  assert.ok(b.validation.reference.score > 90);
  assert.equal(b.validation.reference.relativeError, 0);
  assert.equal(b.validation.reference.errorP80, 0);
  assert.ok(b.validation.reference.reliabilityPercent > 90);
  assert.ok(b.validation.reference.reliabilityPercent > a.validation.reference.reliabilityPercent);
  assert.equal(b.validation.reference.toleranceRelativeError, 0.2);
  assert.equal(b.validation.donorStyleCount, 25);
  assert.equal(JSON.stringify(large), before);
});

test('own assignment holdout does not validate against itself or same-assignment donor rows', () => {
  const own = row(20, 'JACKET', 50, 10000, [1000]);
  const donor = row(1);
  donor.atObservations.forEach(o => { o.assignmentPlanId = own.atObservations[0].assignmentPlanId; });
  const p = buildValidatedSharedAtPrediction(own, [own, donor]);
  assert.equal(p.validation.ownAssignmentCount, 0);
});

test('many process copies do not inflate independent donor style evidence or error ranges', () => {
  const donors = [row(1), row(2)];
  const copies = [...donors, ...Array.from({ length: 15 }, (_, i) => ({ ...row(1), id: 100 + i }))];
  const a = buildValidatedSharedAtPrediction(target(), donors).validation;
  const b = buildValidatedSharedAtPrediction(target(), copies).validation;
  assert.equal(a.reference.score, b.reference.score);
  assert.equal(a.reference.reliabilityPercent, b.reference.reliabilityPercent);
  assert.equal(b.reference.independentCount, 2);
  assert.equal(b.reference.errorP80, null);
});

test('transfer mismatch and far-away quantities cannot earn high AT1000 evidence', () => {
  const heterogeneous = Array.from({ length: 20 }, (_, i) => row(i + 1, 'JACKET', i % 2 ? 100 : 25));
  const result = buildValidatedSharedAtPrediction(target(100), heterogeneous);
  assert.ok(result.validation.reference.score < 70);
  assert.ok(result.validation.reference.reliabilityPercent < 50);
  const far = Array.from({ length: 30 }, (_, i) => row(i + 1, 'JACKET', 50, 100, [10, 20, 30]));
  const p = buildValidatedSharedAtPrediction(target(100), far);
  assert.ok(p.validation.reference.score < 10);
  assert.ok(p.validation.reference.reliabilityPercent < 10);
  assert.equal(p.validation.reference.errorP80, null);
});

test('category peers validate the full mixture without unrelated category error dominating', () => {
  const donors = [...Array.from({ length: 15 }, (_, i) => row(i + 1)),
    ...Array.from({ length: 20 }, (_, i) => row(i + 30, 'SHIRT', i % 2 ? 100 : 25))];
  const p = buildValidatedSharedAtPrediction(target(100), donors);
  assert.equal(p.validation.sharedValidationScope, 'CATEGORY');
  assert.equal(p.validation.donorStyleCount, 15);
  assert.ok(p.validation.reference.score > 70);
});

test('repeated independent batches at 1000 become highly supported without quantity diversity', () => {
  const make = n => row(20, 'JACKET', 50, 10000, Array(n).fill(1000));
  const small = buildValidatedSharedAtPrediction(make(2), []).validation.reference;
  const large = buildValidatedSharedAtPrediction(make(20), []).validation.reference;
  assert.ok(large.score > small.score);
  assert.ok(large.score >= 95);
  assert.equal(large.independentCount, 20);
  assert.equal(large.errorP80, 0);
  assert.ok(large.reliabilityPercent >= 95);
  assert.ok(large.reliabilityPercent > small.reliabilityPercent);
});

test('reliability measures successful predictions, not a renamed evidence score', () => {
  const donors = Array.from({length: 25}, (_, i) => row(i + 1));
  // Transfer to the held-out odd style misses by 15%: within the stated 20%
  // tolerance, so success remains high despite nonzero prediction error.
  donors.push(row(50, 'JACKET', 58, 11600));
  const p = buildValidatedSharedAtPrediction(target(100), donors).validation.reference;
  assert.ok(p.relativeError > 0);
  assert.ok(p.reliabilityPercent > 90);
  assert.notEqual(p.reliabilityPercent, p.score);
  assert.equal(buildValidatedSharedAtPrediction(target(), []).validation.reference.reliabilityPercent, null);
});
