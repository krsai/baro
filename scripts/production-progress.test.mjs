import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadSourceBindings } from './helpers/source-bindings.mjs';
const require = createRequire(import.meta.url);
const { displayProductionProgress, summarizeStyleProduction } = require('../backend/dist/services/productionProgress.js');
const { invoiceOrderProgress } = require('../backend/dist/services/invoiceOrderProgress.js');
const { orderWorkflowStatus, orderAssignmentPlans } = require('../backend/dist/services/orderWorkflow.js');
const ts = require('../backend/node_modules/typescript');
const row = (overrides = {}) => ({ id: 'a', plannedQuantity: 100, producedQuantity: 25, operationalProgressRatio: .75, isCompleted: false, ...overrides });
const order = { id: 1, orderId: 'o', totalQuantity: 100, workOrderItems: [{ styleId: 7, totalQuantity: 100 }], priorCompletions: [] };
const plan = { id: 1, externalId: 'a', workOrderId: 1, styleId: 7, assignmentQuantity: 100, isCompleted: false, _count: { workRecords: 1 } };

test('one display rule reserves 100 for completion and preserves genuine excess and unknown values', () => {
  for (const value of [99.5, 99.99, 100]) assert.equal(displayProductionProgress(value, false), 99);
  assert.equal(displayProductionProgress(100, true), 100);
  assert.equal(displayProductionProgress(0, true), 100);
  assert.equal(displayProductionProgress(null, true), 100);
  assert.equal(displayProductionProgress(105.2, false), 105.2);
  assert.equal(displayProductionProgress(100.01, false), 100.1);
  assert.equal(displayProductionProgress(null, false), null);
  assert.equal(displayProductionProgress(NaN, false), null);
});

test('public process progress does not substitute finished garment quantities', () => {
  const summary = invoiceOrderProgress(order, [plan], [row()]);
  assert.equal(summary.progressPercent, 75);
  assert.equal(summary.producedQuantity, 25);
  assert.equal(summary.styles[0].progressPercent, 75);
  assert.equal(summary.assignments[0].progressPercent, 75);
  const approvedWithoutQuantity = invoiceOrderProgress(order, [plan], [row({ isCompleted: true, producedQuantity: 0 })]);
  assert.equal(approvedWithoutQuantity.producedQuantity, 0);
  assert.equal(approvedWithoutQuantity.assignments[0].producedQuantity, 0);
  assert.equal(approvedWithoutQuantity.progressPercent, 100);
});

test('unassigned quantities remain in the denominator and a completed allocation is not a completed order', () => {
  const partial = row({ plannedQuantity: 50, producedQuantity: 50, isCompleted: true });
  const result = invoiceOrderProgress(order, [plan], [partial]);
  assert.equal(result.progressPercent, 50);
  assert.equal(result.isCompleted, false);
  assert.equal(invoiceOrderProgress(order, [plan], [row({ operationalProgressRatio: 1 })]).progressPercent, 99);
});

test('L17-1-like aggregation cannot round a large completed style and small open style to 100', () => {
  const mixed = { ...order, workOrderItems: [{ styleId: 7, totalQuantity: 99 }, { styleId: 8, totalQuantity: 1 }] };
  const plans = [plan, { ...plan, externalId: 'b', styleId: 8 }];
  const rows = [row({ plannedQuantity: 99, isCompleted: true }), row({ id: 'b', plannedQuantity: 1, operationalProgressRatio: .99 })];
  assert.equal(invoiceOrderProgress(mixed, plans, rows).progressPercent, 99);
  rows[1].isCompleted = true;
  assert.equal(invoiceOrderProgress(mixed, plans, rows).progressPercent, 100);
});

test('extra allocation in one style cannot make another unassigned style completed', () => {
  const mixed = { ...order, workOrderItems: [{ styleId: 7, totalQuantity: 50 }, { styleId: 8, totalQuantity: 50 }] };
  const result = invoiceOrderProgress(mixed, [plan], [row({ isCompleted: true })]);
  assert.equal(result.progressPercent, 50);
  assert.equal(result.isCompleted, false);
});

test('missing or invalid progress never becomes a fabricated zero and excess remains visible', () => {
  for (const rows of [[], [row({ isProgressUnknown: true })], [row({ hasInvalidProcessReferences: true })], [row({ plannedQuantity: null })]]) {
    const result = invoiceOrderProgress(order, [plan], rows);
    assert.equal(result.progressPercent, null); assert.equal(result.producedQuantity, null);
  }
  const result = invoiceOrderProgress(order, [plan], [row({ operationalProgressRatio: 1.2, producedQuantity: 120 })]);
  assert.equal(result.progressPercent, 120); assert.equal(result.assignments[0].progressPercent, 120);
  assert.equal(result.isCompleted, false);
});

test('L16-1 production remains 2245/2245 when two ST snapshots need review, without modifying snapshots', () => {
  const quantities=[400,340,760,440,200,105];
  const workOrder={id:16,totalQuantity:2245,workOrderItems:quantities.map((q,i)=>({styleId:i+1,totalQuantity:q}))};
  const plans=quantities.map((q,i)=>({id:i+1,externalId:`L16-1:${i}`,workOrderId:16,styleId:i+1,assignmentQuantity:q,isCompleted:false}));
  const rows=quantities.map((quantity,i)=>{
    const bindings=loadSourceBindings('backend/src/index.ts',['hasExactProcessCompletion','isProductionProgressUnknown','scheduleStatus'],{
      hasInvalidProductionProcessReferences:false,hasInvalidProcessReferences:i===3||i===4,
      baselineQuantityRaw:quantity,processCount:3,processGroupTotals:[quantity,quantity,quantity],producedQuantity:quantity,
      requiredProcessGroups:[[1],[2],[3]],ratioProgressUnknownCandidate:false,isMarkedCompleted:false,productionCompletedDateKey:null,
      hasWorkProgressReachedCompletion:true,ASSIGNMENT_STATUS_PRODUCTION_COMPLETED:'PRODUCTION_COMPLETED',
      ASSIGNMENT_STATUS_REVIEW_REQUIRED:'REVIEW_REQUIRED',ASSIGNMENT_STATUS_IN_PROGRESS:'IN_PROGRESS',
    });
    assert.equal(bindings.scheduleStatus,'PRODUCTION_COMPLETED');
    return {id:plans[i].externalId,plannedQuantity:quantity,producedQuantity:quantity,operationalProgressRatio:1,
      isCompleted:bindings.scheduleStatus==='PRODUCTION_COMPLETED',isProductionProgressUnknown:bindings.isProductionProgressUnknown,
      hasInvalidProductionProcessReferences:false,isProgressUnknown:i===3||i===4,hasInvalidProcessReferences:i===3||i===4};
  });
  const result=invoiceOrderProgress(workOrder,plans,rows);
  assert.equal(result.producedQuantity,2245);assert.equal(result.progressPercent,100);assert.equal(result.isCompleted,true);
  assert.ok(result.styles.every(style=>style.isCompleted));
  assert.equal(orderWorkflowStatus(workOrder,plans,result),'BILLING');
  const partial=row({producedQuantity:40,operationalProgressRatio:.5,hasInvalidProcessReferences:true,isProgressUnknown:true,
    hasInvalidProductionProcessReferences:false,isProductionProgressUnknown:false});
  assert.equal(invoiceOrderProgress(order,[plan],[partial]).producedQuantity,40);
  const broken={...partial,hasInvalidProductionProcessReferences:true,isProductionProgressUnknown:true};
  assert.equal(invoiceOrderProgress(order,[plan],[broken]).producedQuantity,null);
});

test('historical credit does not turn unfinished allocations into approved completion or double count a baseline', () => {
  const prior = [{ quantity: 20 }];
  assert.equal(summarizeStyleProduction(100, [row({ producedQuantity: 80, operationalProgressRatio: .8 })], prior).isCompleted, false);
  assert.equal(summarizeStyleProduction(100, [row({ producedQuantity: 80, operationalProgressRatio: .8 })], prior).progressPercent, 99);
  const completed = summarizeStyleProduction(100, [row({ producedQuantity: 80, isCompleted: true, completionTargetQuantity: 100 })], prior);
  assert.equal(completed.producedQuantity, 100); assert.equal(completed.progressPercent, 100);
  assert.equal(summarizeStyleProduction(100, [], [{ quantity: 100 }]).isCompleted, true);
});

test('direct order FK prevents card fallback from attributing another order to this order', () => {
  const conflicting = { ...plan, workOrderId: 2, assignmentCard: { workOrderId: 1 }, isCompleted: true };
  assert.equal(orderWorkflowStatus(order, [conflicting]), 'RECEIVED');
  assert.equal(invoiceOrderProgress(order, [conflicting], [row()]).progressPercent, null);
  assert.equal(orderWorkflowStatus(order, [{ ...conflicting, workOrderId: null }]), 'BILLING');
});

test('client status cannot modify historical storage or force a new order into production', () => {
  const { normalizeOrderPayload } = loadSourceBindings('backend/src/index.ts', ['normalizeOrderPayload'], {
    normalizeOrderItems: value => value || [], toPositiveIntOrNull: value => Number(value) || null,
    toNumberOrNull: value => value == null ? null : Number(value),
    resolveWorkOrderConfirmationStatus: value => value || 'PLANNED',
    resolveOptionalString: (value, fallback) => value ?? fallback,
    toNonNegativeInt: (value, fallback) => value == null ? fallback : Number(value),
  });
  assert.equal(normalizeOrderPayload({ id: 'o', status: 'SETTLED' }).status, 'ORDER_RECEIVED');
  for (const status of ['EDITING', 'PRODUCTION_DONE', 'SHIPPED', 'SETTLED']) {
    assert.equal(normalizeOrderPayload({ id: 'o', status: 'IN_PROGRESS' }, { status }).status, status);
  }
});

test('order editing does not round-trip server workflow or historical status in form inputs', () => {
  const { normalizeOrderForm } = loadSourceBindings('frontend/src/pages/App/order/OrderList.jsx', ['normalizeOrderForm'], {
    buildInitialFormData: () => ({ items: [{}] }),
    DEFAULT_SIZE_SET_CODE: 'INT', getDefaultSizeSetCodeForCustomer: () => 'INT',
    resolveOrderSizeSetCodeFromItems: () => 'INT', normalizeOrderItem: item => item,
  });
  const result = normalizeOrderForm({ id: 'o', status: 'SHIPPED', workflowStatus: 'PRODUCTION' });
  assert.equal(result.id, 'o');
  assert.equal('status' in result, false);
  assert.equal('workflowStatus' in result, false);
});

test('actual customer report route uses the same order and style aggregates as invoice selection', async () => {
  const source = readFileSync('backend/src/index.ts', 'utf8');
  const section = source.slice(source.indexOf('app.get("/customer-production-reports"'), source.indexOf('app.post("/orders"'));
  let handler;
  const rows = [row()];
  const deps = {
    ...require('../backend/dist/services/invoiceWorkflow.js'),
    app: { get: (_path, callback) => { handler = callback; } },
    getOrganizationByQuery: async () => ({ id: 1 }), toPositiveIntOrNull: value => Number(value) || null,
    getOrderAccessWhere: () => [{ orgId: 1 }], WORK_ORDER_RESPONSE_INCLUDE: {},
    prisma: { invoiceOrder: { findMany: async () => [] }, workOrder: { findMany: async () => [order] }, assignmentPlan: { findMany: async () => [plan] } },
    buildAssignmentPlanProgressRows: async () => rows, invoiceOrderProgress, orderWorkflowStatus, orderAssignmentPlans,
    ensureArray: value => Array.isArray(value) ? value : [],
    invoiceProducedQuantity: value => value.producedQuantity, normalizeDateKey: () => '',
    resolveOptionalString: (value, fallback) => value ?? fallback,
    ASSIGNMENT_STATUS_REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  };
  const code = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function(...Object.keys(deps), code)(...Object.values(deps));
  let response;
  await handler({ query: {} }, { json: value => { response = value; } });
  const canonical = invoiceOrderProgress(order, [plan], rows);
  assert.equal(response.rows[0].progressPercent, canonical.styles[0].progressPercent);
  assert.equal(response.rows[0].orderProgressPercent, canonical.progressPercent);
  assert.equal(response.rows[0].producedQuantity, canonical.styles[0].producedQuantity);
  assert.equal(response.rows[0].orderStatus, 'PRODUCTION');
  assert.equal(response.rows[0].status, 'IN_PROGRESS');
  // A valid card FK must produce the same result when the direct FK is absent.
  plan.workOrderId = null;
  plan.assignmentCard = { workOrderId: 1 };
  await handler({ query: {} }, { json: value => { response = value; } });
  assert.equal(response.rows[0].orderProgressPercent, 75);
  assert.equal(response.rows[0].progressPercent, 75);
  plan.workOrderId = 1;
  delete plan.assignmentCard;
});

test('actual assignment display uses approval instead of a rounded operational 100', () => {
  for (const [operationalProgressPercent, scheduleStatus, expected] of [
    [100, 'IN_PROGRESS', 99], [100, 'REVIEW_REQUIRED', 99],
    [0, 'PRODUCTION_COMPLETED', 100], [125, 'REVIEW_REQUIRED', 125], [null, 'IN_PROGRESS', null],
  ]) {
    const actual = loadSourceBindings('backend/src/index.ts', ['displayProgressPercent'], {
      operationalProgressPercent, scheduleStatus, displayProductionProgress,
      ASSIGNMENT_STATUS_PRODUCTION_COMPLETED: 'PRODUCTION_COMPLETED',
    });
    assert.equal(actual.displayProgressPercent, expected);
  }
});

test('assignment cards preserve unknown values and keep the visible percentage above the bounded bar', () => {
  for (const [progressPercent, expected, bar] of [[null, null, 0], [0, 0, 0], [99, 99, 99], [125.2, 125.2, 100]]) {
    const actual = loadSourceBindings('frontend/src/pages/App/assign/components/CompactBoardCard.jsx', ['displayProgress', 'progressBarValue'], {
      progressPercent, parsedProgress: Number(progressPercent),
    });
    assert.equal(actual.displayProgress, expected);
    assert.equal(actual.progressBarValue, bar);
  }
});
