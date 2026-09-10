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

test('capacity and progress query projections retain style ownership for valid remaining ST', async () => {
  const scope = vm.createContext({});
  vm.runInContext(require('typescript').transpileModule(
    extract('ASSIGNMENT_PLAN_SELECT_CORE', 'isAssignmentPlanMissingColumnError') +
    '\nglobalThis.selects = [ASSIGNMENT_PLAN_SELECT_CORE, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE, ASSIGNMENT_PLAN_SELECT_WITH_SCHEDULE_REALIZATION, ASSIGNMENT_PLAN_SELECT_LEGACY, ASSIGNMENT_PLAN_SELECT_WITH_CLOSE_LEGACY];',
    { compilerOptions: { target: require('typescript').ScriptTarget.ES2022 } }
  ).outputText, scope);
  for (const select of scope.selects) {
    assert.equal(select.styleId, true);
  }
  const stored = { ...plan(), style: { id: 5 } };
  const select = scope.selects[2];
  const projected = Object.fromEntries(Object.entries(stored).filter(([key]) => select[key]));
  const before = structuredClone(projected);
  const { styleId: omittedStyleId, ...previousProjection } = projected;
  assert.deepEqual([...await invalidAssignmentProcessRefIds(db(), 1, [previousProjection])], [1]);
  assert.deepEqual([...await invalidAssignmentProcessRefIds(db(), 1, [projected])], []);
  assert.equal(context.remaining({
    processTotalsByKey: new Map([['style-process:11', 100], ['style-process:33', 40]]),
    processKeyGroups: context.groups(projected), plannedQuantity: 100,
    assignmentStSnapshot: projected.assignmentStSnapshot,
  }), 3800);
  assert.deepEqual(projected, before);
});
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

const changeDetectionScope = vm.createContext({});
vm.runInContext(require('typescript').transpileModule(
  extract('toStableJsonText', 'buildAssignmentByExternalId') +
  '\nglobalThis.hasChange = hasProcessReferenceRelevantAssignmentChange;',
  { compilerOptions: { target: require('typescript').ScriptTarget.ES2022 } }
).outputText, changeDetectionScope);

test('reflow-only schedule moves do not retrigger process-reference validation on untouched assignments', () => {
  const base = plan();
  const reflowedOnly = { ...base, startIndex: base.startIndex ?? 0, endIndex: 5, startDayOffsetPercent: 40, lineId: 9 };
  // A pre-existing broken assignment (e.g. already flagged for review) that
  // only had its schedule position nudged by a serial-line reflow (AGENTS.md
  // "Scheduler Serial Reflow Lock") must not be re-validated - otherwise an
  // unrelated save on the same line (dropping a new card elsewhere) would
  // fail the whole board save with SNAPSHOT_REFERENCE_INVALID because of a
  // record this save never touched.
  assert.equal(changeDetectionScope.hasChange(base, reflowedOnly), false);

  const ctChanged = { ...base, assignmentCtSnapshot: { ...base.assignmentCtSnapshot, processes: base.assignmentCtSnapshot.processes.slice(0, 2) } };
  assert.equal(changeDetectionScope.hasChange(base, ctChanged), true);

  const styleChanged = { ...base, styleId: base.styleId + 1 };
  assert.equal(changeDetectionScope.hasChange(base, styleChanged), true);

  const quantityChanged = { ...base, assignmentQuantity: (base.assignmentQuantity ?? 0) + 1 };
  assert.equal(changeDetectionScope.hasChange(base, quantityChanged), true);

  const versionChanged = { ...base, styleProcessVersionId: (base.styleProcessVersionId ?? 0) + 1 };
  assert.equal(changeDetectionScope.hasChange(base, versionChanged), true);
});

test('board save process-reference gate is scoped to process-relevant changes, not every synced assignment', () => {
  const saveHandler = backend.slice(backend.indexOf('const processReferenceCheckTargets ='), backend.indexOf('await assertAssignmentProcessRefs(tx, organization.id, processReferenceCheckTargets)'));
  assert.match(saveHandler, /hasProcessReferenceRelevantAssignmentChange\(currentItem, item\)/);
  assert.doesNotMatch(saveHandler, /planSyncTargetAssignments\.filter\(item => existingPlanByExternalIdForStTotals\.has/);
});

test('review reason distinguishes a broken process link from a genuine quantity mismatch', () => {
  // A REVIEW_REQUIRED plan whose process references are broken
  // (hasInvalidProcessReferences) can legitimately have every per-process
  // quantity already matching its target - the assignment is blocked from
  // completing because its CT/ST snapshot itself cannot be trusted, not
  // because of a real count mismatch. reviewReason.code must say so
  // distinctly, or the operator is misled into re-checking quantities that
  // are already correct instead of the actual process version warning.
  const reviewReasonBlock = backend.slice(
    backend.indexOf('reviewReason:\n        scheduleStatus === ASSIGNMENT_STATUS_REVIEW_REQUIRED'),
    backend.indexOf('quantityReview: includeQuantityReviewDetails')
  );
  assert.match(reviewReasonBlock, /hasInvalidProcessReferences\s*\n\s*\?\s*"PROCESS_REFERENCE_INVALID"/);
  assert.match(reviewReasonBlock, /:\s*"PROCESS_QUANTITY_MISMATCH"/);
});

test('saving process version boundaries can repair assignments its own warning flags, and never touches locked ones', () => {
  // An assignment made before a style's processes were reorganized (e.g.
  // split into MALE_ONLY/FEMALE_ONLY variants) will not match whatever
  // confirmed version the just-saved boundaries now assign it to - that
  // mismatch is exactly what this endpoint exists to repair by rebuilding
  // the assignment's CT/ST from the live style under that version. A
  // precheck that rejects the save whenever ANY existing plan is already
  // flagged would make this endpoint unable to ever fix the thing it exists
  // to fix, so it must not run against the plans' pre-rebuild state.
  const endpoint = backend.slice(
    backend.indexOf('app.put("/styles/:styleId/process-version-boundaries"'),
    backend.indexOf('app.delete("/styles/:styleId"')
  );
  assert.doesNotMatch(endpoint, /assertAssignmentProcessRefs\(prisma, organization\.id, plans\.map/);
  assert.match(endpoint, /annotateAssignmentPlanRowsWithPayrollLocks\(organization\.id, rawPlans\)/);
  // Completed or payroll-locked assignments stay read-only even when their
  // stored version no longer matches the newly-saved boundary - they are
  // left flagged instead of silently rewritten.
  assert.match(endpoint, /if \(plan\.isCompleted \|\| plan\.isPayrollLocked\) return \[\];/);
  // A second, narrower precheck (hasValidAssignmentProcessRefs on the plan's
  // OWN pre-rebuild snapshot) reproduced the exact same deadlock for plans
  // whose stored CT/ST are not even internally self-consistent with each
  // other (not just "different version than the boundary now assigns") -
  // reproduced live: saving boundaries for a style with exactly this kind of
  // plan failed with SNAPSHOT_REFERENCE_INVALID even after the first
  // precheck was removed. buildEditableAssignmentCtSnapshotFromLiveStyle
  // only reads the old snapshot per-process, keyed by matching the live
  // version's own process list, so an inconsistent old snapshot cannot
  // corrupt the rebuilt result - there is nothing left for this check to
  // protect once the rebuild itself is what's about to run.
  assert.doesNotMatch(endpoint, /if \(!hasValidAssignmentProcessRefs\(plan\)\) throw createHttpError\(409, SNAPSHOT_REFERENCE_ERROR\);/);
});

test('the version manager Save button stays reachable when a style has only one version', () => {
  // boundaries/savedBoundaries are both derived from each assignment's
  // CURRENTLY stored versionId on load, so they start out identical every
  // time the dialog opens. hasBoundaryChanges can only become true by
  // dragging a version onto a different assignment - a style with a single
  // version (the common case) has nothing to drag, since that version's
  // boundary is already pinned to the oldest assignment. Gating Save on
  // hasBoundaryChanges alone would mean Save can never be pressed for a
  // single-version style, so the one screen that can repair a
  // needsSnapshotRefresh assignment could never actually be used for it.
  const ui = fs.readFileSync(new URL('../frontend/src/pages/App/style/styleDetail/ProcessVersionManager.jsx', import.meta.url), 'utf8');
  const disabledExpr = ui.slice(ui.indexOf('disabled={busy'), ui.indexOf('>저장</Button>'));
  assert.match(disabledExpr, /hasRefreshableAssignments/);
  assert.doesNotMatch(disabledExpr, /disabled=\{busy \|\| assignments\.length === 0 \|\| !hasBoundaryChanges\}/);
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
