import test from 'node:test';
import assert from 'node:assert/strict';
import { auditAtExtrapolation } from './audit-at-extrapolation.mjs';

test('withholds the entire largest quantity and never leaks stored fitted parameters', () => {
  const process = { id: 1, atParams: { a: 999, b: 999 }, atV2Observations: [100, 200, 1000, 1000].map(quantity => ({ quantity, allocatedLaborInputSeconds: 40 * quantity + 2000 })) };
  const [result] = auditAtExtrapolation([process]);
  assert.equal(result.trainingCount, 2);
  assert.equal(result.heldOutCount, 2);
  assert.ok(Math.abs(result.predictedPerPieceSeconds - 42) < 0.001);
  assert.ok(result.absolutePercentageError < result.baselineAbsolutePercentageError);
});

test('one training quantity permits a provisional prediction, but one total quantity cannot validate extrapolation', () => {
  const observation = quantity => ({ quantity, allocatedLaborInputSeconds: 60 * quantity });
  const [result, insufficient] = auditAtExtrapolation([
    { id: 1, atV2Observations: [observation(100), observation(100), observation(1000)] },
    { id: 2, atV2Observations: [observation(100), observation(100)] },
  ]);
  assert.equal(result.predictedPerPieceSeconds, 60);
  assert.equal(insufficient.status, 'NO_SMALLER_QUANTITY_FOR_HOLDOUT');
});
