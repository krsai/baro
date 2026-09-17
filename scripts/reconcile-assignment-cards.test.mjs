import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { reconcileAssignmentCards: reconcile } = require('../backend/dist/utils/reconcileAssignmentCards.js');
const card = (id, quantity, extra = {}) => ({ id, workOrderId: 1, styleId: 10, cardQuantity: quantity,
  cardPtTotalSeconds: quantity * 3, cardStTotalSeconds: quantity * 4, cardAtTotalSeconds: null, ...extra });
const plan = (id, quantity, cardId, extra = {}) => ({ id, workOrderId: 1, styleId: 10,
  assignmentQuantity: quantity, assignmentCard: { cardId }, ...extra });
const run = (baseCards, savedCards = [], plans = [], sourceOrderIds = [1]) => reconcile({ baseCards, savedCards, plans, sourceOrderIds });

test('new order creates one pool card and a repeated save creates no duplicates', () => {
  const base = [card('o1', 100)];
  const first = run(base);
  assert.deepEqual(run(base, first), first);
  assert.equal(first[0].cardQuantity, 100);
});
test('partial and multiple allocations retain IDs, quantities and frozen fields as order increases/decreases', () => {
  const saved = [card('o1', 30, { frozen: { ct: 987 } }), card('o1-S1', 40), card('o1-S2', 30)];
  const plans = [plan(1,30,'o1',{ isCompleted:true }), plan(2,40,'o1-S1',{ isPayrollLocked:true })];
  const before = JSON.stringify({ saved, plans });
  for (const total of [150, 100, 80, 70]) {
    const result = run([card('o1',total)],saved,plans);
    assert.equal(result.reduce((sum,row) => sum + row.cardQuantity,0),total);
    assert.equal(result[0],saved[0]);
    assert.equal(result[1],saved[1]);
    assert.deepEqual(run([card('o1',total)],result,plans),result);
    assert.equal(JSON.stringify({ saved, plans }),before);
  }
});
test('increase after full allocation makes a distinct remainder and does not inflate allocated card', () => {
  const saved=[card('o1',100)];
  const result=run([card('o1',150)],saved,[plan(1,100,'o1')]);
  assert.deepEqual(result.map(row=>[row.id,row.cardQuantity]),[['o1',100],['o1-R',50]]);
  assert.equal(result[1].cardStTotalSeconds,200);
  assert.equal(result[1].cardAtTotalSeconds,null);
});
test('remainder IDs never collide with an already assigned remainder', () => {
  const result=run([card('o1',160)],[card('o1',100),card('o1-R',50)],
    [plan(1,100,'o1'),plan(2,50,'o1-R')]);
  assert.deepEqual(result.map(row=>row.id),['o1','o1-R','o1-R-R']);
});
test('unchanged unassigned split is preserved and its reference time follows updated base totals', () => {
  const result=run([card('o1',100,{ cardStTotalSeconds:1000 })],[card('o1',40,{note:'keep'}),card('o1-S1',60)]);
  assert.deepEqual(result.map(row=>[row.id,row.cardQuantity,row.cardStTotalSeconds]),[['o1',40,400],['o1-S1',60,600]]);
  assert.equal(result[0].note,'keep');
});
test('removed unassigned style disappears, historical assigned style and excluded orders survive', () => {
  const history=card('historical',0,{styleId:11});
  const excluded=card('other',20,{workOrderId:2});
  const result=run([card('o1',100)],[card('deleted',20,{styleId:12}),history,excluded],
    [plan(1,0,'historical',{styleId:11})]);
  assert.deepEqual(result.map(row=>row.id),['historical','other','o1']);
  assert.equal(result[0],history);
  assert.equal(result[1],excluded);
});
test('over-allocation refuses regeneration rather than changing a placed plan', () => {
  assert.throws(()=>run([card('o1',99)],[card('o1',100)],[plan(1,100,'o1')]),/more assigned/);
});
test('broken references, duplicate assignment references and quantity drift require review', () => {
  for (const plans of [[plan(1,10,'missing')],[plan(1,10,'o1',{styleId:11})],
    [plan(1,10,'o1'),plan(2,10,'o1')],[plan(1,9,'o1')],[plan(1,null,'o1')]]) {
    assert.throws(()=>run([card('o1',100)],[card('o1',10)],plans), error=>error.status===409);
  }
});
test('a different order or style cannot consume another group quantity', () => {
  const result=run([card('a',100),card('b',60,{styleId:11}),card('c',80,{workOrderId:2})],
    [card('a',30)],[plan(1,30,'a')],[1,2]);
  for (const [order,style,total] of [[1,10,100],[1,11,60],[2,10,80]]) {
    assert.equal(result.filter(row=>row.workOrderId===order&&row.styleId===style).reduce((s,r)=>s+r.cardQuantity,0),total);
  }
});
test('real rebuild reads plans through the caller transaction before card synchronization', () => {
  const source=readFileSync(new URL('../backend/src/index.ts',import.meta.url),'utf8');
  const body=source.split('const rebuildAssignmentCardsForOrgTx =')[1].split('const rebuildAssignmentCardsForOrg =')[0];
  assert.match(body,/await db.assignmentPlan.findMany/);
  assert.match(body,/reconcileAssignmentCards\(\{ baseCards/);
  assert.ok(body.indexOf('reconcileAssignmentCards') < body.indexOf('await syncAssignmentCardsForOrg'));
  assert.doesNotMatch(body,/assignmentPlan\.(update|delete|create)/);
});
