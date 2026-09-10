import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../frontend/src/pages/App/assign/AssignBoard.jsx', import.meta.url), 'utf8');
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('reset restores saved ST values and drafts without API reconciliation', () => {
  const saved = { cards: [{ id: 'card', quantity: 120 }], assignments: [{ id: 'a', factoryId: '1', startDateKey: '2026-09-01', endDateKey: '2026-09-02', stTotalSeconds: 100, plannedStTotalSeconds: null, remainingStTotalSeconds: 0, assignmentCtSnapshot: { processes: [{ styleProcessId: 3, snapshotCtSeconds: 12 }] } }], detailDraftsByTarget: {}, detailStDraftsByTarget: {} };
  const state = {};
  const context = vm.createContext({
    useCallback: fn => fn, days: [], holidaySet: new Set(), languageCode: 'ko',
    toSignedInt: (v, fallback) => Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : fallback,
    toNonNegativeInt: (v, fallback) => Number.isFinite(Number(v)) ? Math.max(0, Math.trunc(Number(v))) : fallback,
    clampPercent: (v, fallback, max) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(0, Number(v))) : fallback,
    setCards: value => { state.cards = value; }, setAssignments: value => { state.assignments = value; },
    setDetailDraftsByTarget: value => { state.detailDraftsByTarget = value; }, setDetailStDraftsByTarget: value => { state.detailStDraftsByTarget = value; },
    setSelectedCardId: () => {}, setDays: () => {},
    resolvePersistedBoardState: () => { throw new Error('Must not reconcile local history as an API response'); },
  });
  vm.runInContext(extract('const normalizeAssignmentLayout =', 'const toStableJsonText ='), context);
  vm.runInContext(extract('const remapAssignmentToDayWindow =', 'const syncAssignmentDateKeys ='), context);
  vm.runInContext(extract('const applyBoardSnapshotText =', 'const applyLoadedBoardData =') + '\nglobalThis.restore = applyBoardSnapshotText;', context);
  assert.equal(context.restore(JSON.stringify(saved)), true);
  assert.equal(state.assignments[0].remainingStTotalSeconds, 0);
  assert.equal(state.assignments[0].plannedStTotalSeconds, null);
  for (const [key, value] of Object.entries(saved.assignments[0])) assert.equal(JSON.stringify(state.assignments[0][key]), JSON.stringify(value));
  assert.equal(JSON.stringify(state.cards), JSON.stringify(saved.cards));
  assert.equal(context.restore(JSON.stringify(saved)), true);
  assert.equal(state.assignments[0].remainingStTotalSeconds, 0);
});
