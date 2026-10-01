import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRequire } from 'node:module';
import { matchesAutocompleteSearch } from '../frontend/src/utils/autocompleteSearch.js';

const [page, statuses, backend] = await Promise.all([
  readFile(new URL('../frontend/src/pages/App/order/OrderList.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/constants/orderStatus.js', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
]);

test('order deletion flags include employee, outsourced and card-linked history across organizations', async () => {
  const require = createRequire(import.meta.url);
  const ts = require('../backend/node_modules/typescript');
  const route = backend.slice(backend.indexOf('app.get("/orders"'), backend.indexOf('app.get("/customer-production-reports"'));
  const orders = [1, 2, 3, 4, 5].map(id => ({ id, orderId: String(id) }));
  let handler, response;
  const deps = {
    app: { get: (_path, callback) => { handler = callback; } },
    getOrganizationByQuery: async () => ({ id: 99 }),
    getOrderAccessWhere: () => [], WORK_ORDER_RESPONSE_INCLUDE: {},
    loadOrderAssignmentModificationLockMap: async () => new Map(),
    loadCurrentOrderValueByOrderDbId: async () => new Map(),
    resolveOptionalString: value => value,
    invoiceOrderProgress: () => ({ progressPercent: 0, producedQuantity: 0, assignments: [] }),
    toOrderResponse: order => order,
    prisma: {
      workOrder: { findMany: async () => orders },
      assignmentPlan: { findMany: async query => {
        if (!query.select._count) return [];
        assert.equal(query.where.orgId, undefined);
        assert.deepEqual(query.where.OR[0].workOrderId.in, [1, 2, 3, 4, 5]);
        assert.deepEqual(query.where.OR[1].assignmentCard.is.workOrderId.in, [1, 2, 3, 4, 5]);
        return [
          { workOrderId: 1, _count: { workRecords: 1, outsourcedWorkRecords: 0 } },
          { workOrderId: 2, _count: { workRecords: 0, outsourcedWorkRecords: 1 } },
          { workOrderId: null, assignmentCard: { workOrderId: 3 }, _count: { workRecords: 1, outsourcedWorkRecords: 0 } },
          { workOrderId: 4, _count: { workRecords: 0, outsourcedWorkRecords: 0 } },
        ];
      } },
    },
  };
  const code = ts.transpileModule(route, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function(...Object.keys(deps), code)(...Object.values(deps));
  await handler({}, { json: value => { response = value; } });
  assert.deepEqual(response.map(order => order.hasProductionRecords), [true, true, true, false, false]);
  assert.deepEqual(response.map(order => order.hasAssignments), [true, true, true, true, false]);
  assert.match(page, /const deletable = !order\?\.isModificationLocked && !order.hasProductionRecords && !order.hasAssignments/);
});

test('order row style search matches style code/name only, not the shared customer name', () => {
  // availableStyleOptions is already narrowed to the order's one buyer, so
  // every candidate option shares the same option.customer value. The
  // default SearchableSelect filter matches against every primitive field on
  // the option object, so typing part of the customer name (e.g. "SAN"
  // matching "THE SAN") matched every style and made the filter look broken.
  // filterStyleAutocompleteOptions strips the option down to name/styleCode
  // before matching - reproduce that stripping here directly.
  const styleOption = { id: 3, name: 'AM01622', styleCode: 'AM01622', customer: 'THE SAN' };
  const matchesNarrowed = (option, inputValue) =>
    matchesAutocompleteSearch(
      { name: option.name, styleCode: option.styleCode },
      inputValue,
      (candidate) => candidate?.name || ''
    );
  assert.equal(matchesNarrowed(styleOption, 'SAN'), false);
  assert.equal(matchesNarrowed(styleOption, 'AM01622'), true);
  assert.equal(matchesNarrowed(styleOption, '01622'), true);

  // Also guard the actual wiring: both the vertical and horizontal order
  // detail layouts render a style SearchableSelect off availableStyleOptions,
  // and both must pass the narrowed filter, or this fix silently regresses
  // for whichever layout is currently rendered.
  const styleSelectBlocks = [...page.matchAll(/<SearchableSelect\s[\s\S]*?\/>/g)]
    .map((match) => match[0])
    .filter((block) => block.includes('options={availableStyleOptions}'));
  assert.equal(styleSelectBlocks.length, 2);
  styleSelectBlocks.forEach((block) => {
    assert.match(block, /filterOptions=\{filterStyleAutocompleteOptions\}/);
  });
});

test('order list exposes only all, in-progress, and completed filters', () => {
  assert.match(page, /ORDER_FILTER_ALL/);
  assert.match(page, /ORDER_FILTER_IN_PROGRESS/);
  assert.match(page, /ORDER_FILTER_COMPLETED/);
  assert.match(statuses, /filterInProgressLabel/);
  assert.match(statuses, /filterCompletedLabel/);
  assert.doesNotMatch(page, /ORDER_FILTER_EXCEPT_DONE|ORDER_STATUS_OPTIONS\.map\(\(option\) => \(\{/);
});

test('order list does not filter by a date or month range', () => {
  assert.doesNotMatch(page, /MonthRangeSelector|dueDateFilterStart|dueDateFilterEnd|shiftDueDateFilterMonth/);
});

test('order list displays the same batched production progress used by invoice preparation', () => {
  assert.match(page, /productionProgressPercent/);
  assert.match(page, /order\.producedQuantity/);
  const route = backend.slice(backend.indexOf('app.get("/orders"'), backend.indexOf('app.get("/customer-production-reports"'));
  assert.match(route, /buildAssignmentPlanProgressRows/);
  assert.match(route, /invoiceOrderProgress/);
  assert.doesNotMatch(route, /for \(const order[\s\S]*buildAssignmentPlanProgressRows/);
  const listTable = page.slice(page.indexOf('<Table stickyHeader'), page.indexOf('<Dialog open={Boolean(orderValueDetail)}'));
  assert.ok(listTable.indexOf('{orderPageText.dueDate}') < listTable.indexOf('{orderPageText.productionProgress}'));
  assert.ok(listTable.indexOf('{orderPageText.productionProgress}') < listTable.indexOf('{orderPageText.actions}'));
});

test('horizontal order detail can collapse each gender without removing its quantities', () => {
  assert.match(page, /collapsedHorizontalGenders/);
  assert.match(page, /toggleHorizontalGender/);
  assert.match(page, /KeyboardArrowRightIcon/);
  assert.match(page, /startViewTransition/);
  assert.match(page, /prefers-reduced-motion/);
  assert.match(page, /viewTransitionName: 'order-gender-table'/);
  assert.match(page, /rotate\(90deg\)/);
  assert.match(page, /colorRow\.sizeByGender/);
  assert.doesNotMatch(page, /toggleHorizontalGender[\s\S]{0,500}setFormData/);
});
