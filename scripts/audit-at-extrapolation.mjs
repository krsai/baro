// Read-only holdout audit. Input: { processes: [{ id, atV2Observations, stBuckets }] }.
// Withhold ALL observations at the largest quantity and refit from smaller batches.
import fs from 'node:fs';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const source = fs.readFileSync(new URL('../frontend/src/utils/processTime.js', import.meta.url), 'utf8');
const context = vm.createContext({ formatNumberWithCommas: String });
vm.runInContext(source.replace(/import[^\n]+\n/g, '').replace(/export const /g, 'const ').replace(/export \{[^}]+\};?/g, '') +
  '\nglobalThis.predict = resolveProcessAtPerPieceSeconds; globalThis.fit = fitConstrainedAtCurve;', context);

export const auditAtExtrapolation = (processes) => processes.map(process => {
  const observations = (process.atV2Observations || []).filter(row => Number(row.quantity) > 0 && Number(row.allocatedLaborInputSeconds) > 0);
  const maxQuantity = Math.max(...observations.map(row => Number(row.quantity)));
  const training = observations.filter(row => Number(row.quantity) < maxQuantity);
  const heldOut = observations.filter(row => Number(row.quantity) === maxQuantity);
  if (!training.length) return { id: process.id, status: 'NO_SMALLER_QUANTITY_FOR_HOLDOUT' };
  const params = context.fit(training.map(row => ({
    quantity: Number(row.quantity), perPieceSeconds: Number(row.allocatedLaborInputSeconds) / Number(row.quantity),
    attendanceCoverage: row.attendanceCoverage, singleProcessLaborShare: row.singleProcessLaborShare,
  })));
  // Never reuse params or scalar AT trained using the withheld observations.
  const predicted = context.predict({ atModelVersion: 'v2', atV2Observations: training, atParams: params, stBuckets: process.stBuckets }, maxQuantity);
  const actual = heldOut.reduce((sum, row) => sum + Number(row.allocatedLaborInputSeconds), 0) /
    heldOut.reduce((sum, row) => sum + Number(row.quantity), 0);
  const baseline = training.reduce((sum, row) => sum + Number(row.allocatedLaborInputSeconds), 0) /
    training.reduce((sum, row) => sum + Number(row.quantity), 0);
  return { id: process.id, status: predicted == null ? 'NO_ESTIMATE' : 'EVALUATED', heldOutQuantity: maxQuantity,
    trainingCount: training.length, heldOutCount: heldOut.length, predictedPerPieceSeconds: predicted,
    observedAllocatedPerPieceSeconds: actual, baselinePerPieceSeconds: baseline,
    absolutePercentageError: predicted == null ? null : Math.abs(predicted - actual) / actual * 100,
    baselineAbsolutePercentageError: Math.abs(baseline - actual) / actual * 100 };
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/audit-at-extrapolation.mjs observations.json');
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify({ basis: 'Held-out allocated labor observations; not independently measured process times', results: auditAtExtrapolation(input.processes || []) }, null, 2));
}
