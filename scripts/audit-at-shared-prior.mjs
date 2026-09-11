// Input: raw StyleProcess rows with style.collection, ptSeconds and current-model
// atObservations. Read-only; no DB connection and no observation writes.
import fs from 'node:fs';
import prior from '../backend/dist/services/atSharedPrior.js';
const { buildSharedAtPrediction } = prior;
if (!process.argv[2]) throw new Error('Usage: node scripts/audit-at-shared-prior.mjs processes.json');
const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).processes;
if (!Array.isArray(rows)) throw new Error('Expected { processes: [...] }');
const results = rows.map(row => {
  const prediction = buildSharedAtPrediction({ ...row, atObservations: [] }, rows);
  const observations = (row.atObservations || []).filter(o => Number(o.quantity) > 0 && Number(o.allocatedLaborInputSeconds) > 0);
  const total = observations.reduce((sum, o) => sum + Number(o.allocatedLaborInputSeconds), 0);
  if (!prediction || !observations.length || !total) return { id: row.id, status: 'NOT_EVALUABLE' };
  const error = observations.reduce((sum, o) => sum + Math.abs((prediction.a + prediction.b * (Number(o.quantity) < prediction.smallQuantityBoundary ? (2 - Number(o.quantity) / prediction.smallQuantityBoundary) / prediction.smallQuantityBoundary : 1 / Number(o.quantity))) * Number(o.quantity) - Number(o.allocatedLaborInputSeconds)), 0);
  const baseline = observations.reduce((sum, o) => sum + Math.abs(Number(row.ptSeconds) * Number(o.quantity) - Number(o.allocatedLaborInputSeconds)), 0);
  return { id: row.id, source: prediction.source, donorStyleCount: prediction.donorStyleCount,
    categoryStyleCount: prediction.categoryStyleCount, observationCount: observations.length,
    weightedAbsolutePercentageError: error / total * 100,
    ptBaselineWeightedAbsolutePercentageError: Number(row.ptSeconds) > 0 ? baseline / total * 100 : null };
});
console.log(JSON.stringify({ basis: 'Leave-one-style-out, allocated labor observations (not independent stopwatch measurements)', results }, null, 2));
