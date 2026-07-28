import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backend = await readFile(
  new URL('../backend/src/index.ts', import.meta.url),
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
