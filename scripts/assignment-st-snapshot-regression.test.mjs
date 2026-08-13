import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backend = await readFile(
  new URL('../backend/src/index.ts', import.meta.url),
  'utf8'
);
const assignBoard = await readFile(
  new URL('../frontend/src/pages/App/assign/AssignBoard.jsx', import.meta.url),
  'utf8'
);

test('board save carries the server-prepared ST snapshot through normalization', () => {
  const normalizeStart = backend.indexOf('const normalizeAssignmentPlanPayload =');
  const normalizeEnd = backend.indexOf('const assertFiniteAssignmentScheduleIndices', normalizeStart);
  assert.ok(normalizeStart >= 0 && normalizeEnd > normalizeStart);
  const normalize = backend.slice(normalizeStart, normalizeEnd);
  assert.match(normalize, /const assignmentStSnapshot =/);
  assert.match(normalize, /assignmentStSnapshot,\s*\n\s*stTotalSeconds/);
});

test('existing ST snapshots and totals come from persisted server state', () => {
  const prepareStart = backend.indexOf('const prepareAssignmentBoardStTotalsForSave =');
  const prepareEnd = backend.indexOf('const toAssignmentBoardStateResponse', prepareStart);
  assert.ok(prepareStart >= 0 && prepareEnd > prepareStart);
  const prepare = backend.slice(prepareStart, prepareEnd);
  assert.match(
    prepare,
    /target\.existingPlan\s*\? target\.existingAssignmentStTotalSeconds\s*: target\.incomingAssignmentStTotalSeconds/
  );
  assert.match(
    prepare,
    /targetByExternalId\.get\(externalId\)\?\.existingPlan\?\.assignmentStSnapshot/
  );
  assert.doesNotMatch(
    prepare,
    /assignmentStSnapshotByExternalId\.get\(externalId\) \?\?[\s\S]{0,100}assignment\?\.assignmentStSnapshot/
  );
});

test('legacy missing ST snapshots fail closed instead of using the active version as a backfill', () => {
  const prepareStart = backend.indexOf('const prepareAssignmentBoardStTotalsForSave =');
  const prepareEnd = backend.indexOf('const toAssignmentBoardStateResponse', prepareStart);
  const prepare = backend.slice(prepareStart, prepareEnd);
  assert.match(prepare, /isNewAssignment \|\|/);
  assert.doesNotMatch(prepare, /hasStDrafts \|\|\s*isExistingAssignmentStSnapshotMissing \|\|/);
  assert.match(prepare, /has no persisted ST snapshot; repair it from its exact historical bucket version/);
});

test('line and schedule movement never replace an existing historical ST snapshot', () => {
  const basisStart = backend.indexOf('const hasAssignmentStBasisChange =');
  const basisEnd = backend.indexOf('const prepareAssignmentBoardStTotalsForSave =', basisStart);
  assert.ok(basisStart >= 0 && basisEnd > basisStart);
  const basisChange = backend.slice(basisStart, basisEnd);
  assert.match(basisChange, /assignmentQuantity !== existingQuantity/);
  assert.match(basisChange, /existingPlan\?\.styleId/);
  assert.doesNotMatch(basisChange, /lineId|startIndex|endIndex/);
});

test('progress reads all required coverage columns and has no missing-column fallback', () => {
  const start = backend.indexOf('const loadAssignmentPlanProgressWorkRows =');
  const end = backend.indexOf('const resolveAssignmentProcessGroupTotals =', start);
  const loader = backend.slice(start, end);
  assert.match(loader, /effectiveCoverageStartDate: true/);
  assert.match(loader, /coverageStartDate: true/);
  assert.match(loader, /includeDiagnostics = false/);
  assert.match(loader, /includeDiagnostics \? \{ displayDate: true \} : \{\}/);
  assert.doesNotMatch(loader, /records: true/);
  assert.doesNotMatch(loader, /fallbackModes|fallback work-record projection|isWorkLogCoverageMissingColumnError/);
});

test('line month capacity only loads display relations and ST bucket diagnostics on demand', () => {
  const loaderStart = backend.indexOf('const loadAssignmentPlanProgressWorkRows =');
  const loaderEnd = backend.indexOf('const resolveAssignmentProcessGroupTotals =', loaderStart);
  const loader = backend.slice(loaderStart, loaderEnd);
  assert.match(loader, /includeDiagnostics\s*\?\s*\{[\s\S]*worker:/);
  assert.match(loader, /includeDiagnostics\s*\?\s*\{[\s\S]*styleProcess:/);

  const capacityStart = backend.indexOf('const buildLineMonthCapacityRows =');
  const capacityEnd = backend.indexOf('app.get("/assignment-plan-progress"', capacityStart);
  const capacity = backend.slice(capacityStart, capacityEnd);
  assert.match(capacity, /includeDiagnostics: includeActualOutputDebug/);
  assert.match(capacity, /includeActualOutputDebug\s*\?\s*\{[\s\S]*standards:/);
});

test('assignment board reads do not mutate plans and parallelize independent queries', () => {
  assert.doesNotMatch(backend, /repairAssignmentPlanFkRefsFromAssignmentCards/);

  const helperStart = backend.indexOf('const buildReadOnlyAssignmentBoardStateResponse =');
  const helperEnd = backend.indexOf('const closeActiveLineAssignments =', helperStart);
  const helper = backend.slice(helperStart, helperEnd);
  assert.match(helper, /await Promise\.all\(\[/);
  assert.match(helper, /loadAssignmentPlansForBoardState\(orgId\)\.then/);

  const routeStart = backend.indexOf('app.get("/assignment-board-view"');
  const routeEnd = backend.indexOf('app.get("/assignment-board-versions"', routeStart);
  const route = backend.slice(routeStart, routeEnd);
  assert.match(route, /const \[state, boardResponse\] = await Promise\.all\(\[/);
});

test('assignment card locks only inspect linked orders while styles load in parallel', () => {
  const routeStart = backend.indexOf('app.get("/assignment-cards"');
  const routeEnd = backend.indexOf('app.get("/assignment-board-state"', routeStart);
  const route = backend.slice(routeStart, routeEnd);
  assert.match(route, /const cardWorkOrderIds = collectPositiveIntSet/);
  assert.match(route, /const \[orderManualLockRows, styles\] = await Promise\.all\(\[/);
  assert.match(route, /id: \{ in: cardWorkOrderIds \}/);
});

test('large assignment bootstrap responses use HTTP compression', () => {
  assert.match(backend, /import compression from "compression"/);
  assert.match(backend, /const app = express\(\);\s*app\.use\(compression\(\)\);/);
});

test('style process mirrors fetch only standards from active relationship versions', () => {
  const start = backend.indexOf('const loadStyleProcessRowsByStyleId =');
  const end = backend.indexOf('const refreshStyleProcessMirrorForStyleIds =', start);
  const loader = backend.slice(start, end);
  assert.match(loader, /const activeVersionIds = Array\.from/);
  assert.match(
    loader,
    /quantityBucketSetVersionId: \{ in: activeVersionIds \}/
  );
  assert.ok(
    loader.indexOf('loadRelationshipTimeBucketContextByStyleId') <
      loader.indexOf('standards: {'),
    'active versions must be resolved before loading standards'
  );
});

test('style saves refresh unassigned cards without rewriting assigned snapshots', () => {
  const rebuildStart = backend.indexOf('const rebuildAssignmentCardsForOrg = async');
  const rebuildEnd = backend.indexOf('const ASSIGNMENT_CARD_REBUILD_RETRYABLE_PRISMA_CODES', rebuildStart);
  const rebuild = backend.slice(rebuildStart, rebuildEnd);
  assert.match(rebuild, /const baseCards = buildAssignmentCardsFromOrders/);
  assert.match(
    rebuild,
    /const hydratedStyles[\s\S]{0,220}timeBucketQuantities: ensureArray\(style\.timeBucketSetVersion\?\.entries\)/
  );
  assert.match(
    rebuild,
    /options\.refreshExistingAssignmentSnapshots !== false[\s\S]{0,180}refreshUnlinkedAssignmentPlanSnapshotsForOrg/
  );

  const updateStart = backend.indexOf('app.put("/styles/:styleId"');
  const updateEnd = backend.indexOf('app.delete("/styles/:styleId"', updateStart);
  const updateRoute = backend.slice(updateStart, updateEnd);
  assert.match(
    updateRoute,
    /rebuildAssignmentCardsForOrgIds\([\s\S]{0,180}refreshExistingAssignmentSnapshots: false/
  );
});

test('progress endpoint always rebuilds rows and the board bypasses request cache', () => {
  const routeStart = backend.indexOf('app.get("/assignment-plan-progress"');
  const routeEnd = backend.indexOf('app.get("/line-month-capacity"', routeStart);
  assert.match(backend.slice(routeStart, routeEnd), /await buildAssignmentPlanProgressRows\(organization\.id, externalIds\)/);
  assert.match(assignBoard, /requestJSON\([\s\S]{0,200}'\/assignment-plan-progress'[\s\S]{0,300}forceRefresh: true/);
  assert.match(assignBoard, /catch\(\(error\) => \{[\s\S]{0,160}setAssignmentProgressById\(\{\}\)/);
  const progressStart = assignBoard.indexOf("'/assignment-plan-progress'");
  const progressEnd = assignBoard.indexOf('const applySchedulerProgressToAssignments', progressStart);
  assert.doesNotMatch(assignBoard.slice(progressStart, progressEnd), /keeping previous data/);
  assert.match(assignBoard, /setLineMonthCapacityRows\(\[\]\)[\s\S]{0,100}setLineMonthCapacityError\(true\)/);
});

test('assignment workflow exposes review and production-completed states', () => {
  assert.match(backend, /isMarkedCompleted \|\| Boolean\(productionCompletedDateKey\) \|\| hasExactProcessCompletion[\s\S]{0,100}ASSIGNMENT_STATUS_PRODUCTION_COMPLETED/);
  assert.match(backend, /hasWorkProgressReachedCompletion[\s\S]{0,100}ASSIGNMENT_STATUS_REVIEW_REQUIRED/);
  assert.match(backend, /currentScheduleStatus !== ASSIGNMENT_STATUS_REVIEW_REQUIRED/);
  assert.match(assignBoard, /scheduleStatus \|\| ''\)\.trim\(\) === 'REVIEW_REQUIRED'\) return 'review'/);
  assert.match(assignBoard, /if \(isCompleted\) return 'completed'/);
  assert.doesNotMatch(backend, /READY_TO_COMPLETE/);
  assert.doesNotMatch(assignBoard, /READY_TO_COMPLETE/);
});

test('review-required progress includes the visible calculation basis and completes directly', () => {
  assert.match(backend, /reviewReason:[\s\S]{0,300}PROCESS_QUANTITY_MISMATCH/);
  assert.match(backend, /requiredTotalQuantity: totalExpected/);
  assert.match(backend, /recordedTotalQuantity: totalDone/);
  assert.match(backend, /processTotals: reviewProcessTotals/);
  assert.match(backend, /productionCompletedAt: completedAt,[\s\S]{0,80}isCompleted: true/);
  assert.match(assignBoard, /작업기록 합계[\s\S]{0,300}완료 기준/);
  assert.match(assignBoard, /공정별 수량의 최솟값/);
});
