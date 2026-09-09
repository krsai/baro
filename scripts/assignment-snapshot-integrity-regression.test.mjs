import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../backend/package.json', import.meta.url));
const { snapshotProcessIds, hasValidAssignmentProcessRefs, assertAssignmentProcessRefs, invalidAssignmentProcessRefIds } = require('../backend/dist/utils/assignmentSnapshotIntegrity.js');
const backend = fs.readFileSync(new URL('../backend/src/index.ts', import.meta.url), 'utf8');
const plan = () => ({ id: 1, orgId: 1, styleId: 5, styleProcessVersionId: 7,
  assignmentCtSnapshot: { styleProcessVersionId: 7, processes: [11, 22, 33].map(styleProcessId => ({ styleProcessId, snapshotCtSeconds: 12 })) },
  assignmentStSnapshot: { styleProcessVersionId: 7, processes: [11, 22, 33].map((styleProcessId, index) => ({ styleProcessId, stSeconds: (index + 1) * 10 })) },
});
const db = () => ({
  styleProcess: { findMany: async () => [11, 22, 33].map(id => ({ id, styleId: 5 })) },
  styleProcessVersion: { findMany: async () => [{ id: 7, styleId: 5, processSnapshot: [11, 22, 33].map(id => ({ id })) }] },
});

test('missing, duplicate and disagreeing snapshot references are rejected without mutation', async () => {
  for (const corrupt of [p => { p.assignmentCtSnapshot.processes[1].styleProcessId = null; }, p => { p.assignmentCtSnapshot.processes[1].styleProcessId = 11; }, p => p.assignmentStSnapshot.processes.pop(), p => { p.assignmentStSnapshot.styleProcessVersionId = 8; }]) {
    const item = plan(); corrupt(item); const before = structuredClone(item);
    assert.equal(hasValidAssignmentProcessRefs(item), false);
    await assert.rejects(assertAssignmentProcessRefs(db(), 1, [item]), error => error.status === 409);
    assert.deepEqual(item, before);
  }
});

test('canonical lookup rejects a foreign style and a missing confirmed-version process', async () => {
  const item = plan(); const foreign = db();
  foreign.styleProcess.findMany = async () => [11, 22, 33].map(id => ({ id, styleId: 99 }));
  assert.deepEqual([...await invalidAssignmentProcessRefIds(foreign, 1, [item])], [1]);
  const missing = db(); missing.styleProcessVersion.findMany = async () => [];
  await assert.rejects(assertAssignmentProcessRefs(missing, 1, [item]), /SNAPSHOT_REFERENCE_INVALID/);
  item.assignmentCtSnapshot.processes.pop(); item.assignmentStSnapshot.processes.pop();
  await assert.rejects(assertAssignmentProcessRefs(db(), 1, [item]), /SNAPSHOT_REFERENCE_INVALID/);
});

test('valid references keep historical manual CT and ST untouched, independent of row order', async () => {
  const item = plan(); item.assignmentCtSnapshot.processes[0].snapshotCtSeconds = 123.45;
  item.assignmentStSnapshot.processes.reverse(); const before = structuredClone(item);
  assert.equal(hasValidAssignmentProcessRefs(item), true);
  await assertAssignmentProcessRefs(db(), 1, [item]);
  assert.deepEqual(item, before);
});

const extract = (name, next) => backend.slice(backend.indexOf(`const ${name} =`), backend.indexOf(`const ${next} =`, backend.indexOf(`const ${name} =`)));
const context = {
  snapshotProcessIds, ensureArray: value => Array.isArray(value) ? value : [],
  resolveNormalizedAssignmentCtSnapshot: value => value.assignmentCtSnapshot,
  toPositiveIntOrNull: value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null,
  toOptionalNonNegativeInt: (value, fallback) => value == null ? fallback : Number(value),
  toOptionalProcessSeconds: value => Number(value) > 0 ? Number(value) : null,
  resolveStyleProcessIdFromAssignmentProcessKey: key => Number(key.split(':')[1]),
};
vm.createContext(context);
vm.runInContext(require('typescript').transpileModule(
  extract('resolveAssignmentPlanRequiredProcessGroups', 'resolveAssignmentPlanStyleQueryValues') +
  extract('calculateRemainingStTotalSecondsFromProcessProgress', 'buildAssignmentStSnapshot') +
  '\nglobalThis.groups = resolveAssignmentPlanRequiredProcessGroups; globalThis.remaining = calculateRemainingStTotalSecondsFromProcessProgress;',
  { compilerOptions: { target: require('typescript').ScriptTarget.ES2022 } }
).outputText, context);

test('partial reference loss cannot turn 3800 seconds of remaining work into 1800', () => {
  const item = plan(); const totals = new Map([['style-process:11', 100], ['style-process:33', 40]]);
  const calculate = groups => context.remaining({ processTotalsByKey: totals, processKeyGroups: groups, plannedQuantity: 100, assignmentStSnapshot: item.assignmentStSnapshot });
  assert.equal(calculate(context.groups(item)), 3800);
  item.assignmentCtSnapshot.processes[1].styleProcessId = null;
  assert.equal(context.groups(item).length, 0);
  assert.equal(calculate(context.groups(item)), null);
  assert.equal(calculate([['style-process:11'], ['style-process:33']]), null);
});

test('version window load is read-only and review quantities use process IDs, not shifted indexes', () => {
  const ui = fs.readFileSync(new URL('../frontend/src/pages/App/style/styleDetail/ProcessVersionManager.jsx', import.meta.url), 'utf8');
  const load = ui.slice(ui.indexOf('const load ='), ui.indexOf('useEffect(() =>'));
  assert.doesNotMatch(load, /saveStyleProcessVersionBoundaries/);
  assert.match(ui, /integrityWarning/);
  const rows = backend.slice(backend.indexOf('const reviewProcessTotals ='), backend.indexOf('const operationalProgressPercent =', backend.indexOf('const reviewProcessTotals =')));
  assert.doesNotMatch(rows, /requiredProcessGroups\[index\]/);
  assert.match(rows, /style-process:\$\{processId\}/);
});
