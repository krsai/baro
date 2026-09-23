import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { calculateMonetaryInstallment } from '../frontend/src/utils/invoiceBilling.mjs';
import { buildInvoicePrintHtml } from '../frontend/src/utils/invoiceDraft.mjs';
import { canAccessPath } from '../frontend/src/utils/accessControl.js';
import { sanitizeRoleAccessPolicy, ROLE_ACCESS_POLICY_SCHEMA_VERSION } from '../frontend/src/utils/roleAccessPolicyCore.mjs';

const calculate = (overrides = {}) => calculateMonetaryInstallment({ mode: 'PERCENTAGE', currency: 'USD',
  contractAmount: '10000.00', percentage: '30', agreementNote: 'Advance agreed with buyer', ...overrides });

test('30/40/30 percent installments total the contract without consuming garment quantities', () => {
  const rows = ['30', '40', '30'].map((percentage) => calculate({ percentage }));
  assert.deepEqual(rows.map((row) => row.total), ['3000.00', '4000.00', '3000.00']);
  rows.forEach((row) => {
    assert.equal(row.invoiceQuantity, null);
    assert.deepEqual(row.lines, []);
    assert.deepEqual(row.issues, []);
    assert.equal(row.isCompleted, undefined);
    assert.equal(row.isLocked, undefined);
  });
});
test('100% does not generate a completion or lock event', () => {
  const result = calculate({ percentage: '100' });
  assert.equal(result.total, '10000.00');
  assert.deepEqual(Object.keys(result).sort(), ['mode', 'contractAmount', 'percentage', 'agreementNote', 'total', 'invoiceQuantity', 'lines', 'styles', 'issues'].sort());
});
test('fixed amount does not require a price table, production or a contract total', () => {
  const result = calculate({ mode: 'FIXED_AMOUNT', contractAmount: '', fixedAmount: '3000.01' });
  assert.equal(result.total, '3000.01');
  assert.deepEqual(result.issues, []);
  assert.equal(result.contractAmount, null);
});
test('currency precision, invalid amounts and percentage boundaries are enforced', () => {
  for (const percentage of ['', '0', '-1', '100.01', 'NaN', '1e2', '1.001']) {
    assert.ok(calculate({ percentage }).issues.includes('PERCENTAGE'));
  }
  for (const fixedAmount of ['', '-1', '0', '1e3', 'Infinity', '1.001']) {
    assert.ok(calculate({ mode: 'FIXED_AMOUNT', fixedAmount }).issues.includes('AMOUNT'));
  }
  assert.ok(calculate({ agreementNote: ' ' }).issues.includes('AGREEMENT'));
  assert.equal(calculate({ currency: 'VND', contractAmount: '101', percentage: '50' }).total, '51');
  assert.ok(calculate({ currency: 'VND', contractAmount: '101.01' }).issues.includes('CONTRACT_AMOUNT'));
  assert.equal(calculate({ currency: 'KWD', contractAmount: '1.001', percentage: '50' }).total, '0.501');
  assert.equal(calculate({ contractAmount: '99999999999999.99', percentage: '100' }).total, '99999999999999.99');
  assert.ok(calculate({ currency: '' }).issues.includes('CURRENCY'));
});
test('payment PDF contains amount and agreement but no garment quantity table', () => {
  const result = calculate({ agreementNote: '<script>alert(1)</script>' });
  const html = buildInvoicePrintHtml({ source: { orderNumber: 'PO-1' }, calculation: result,
    pricingBasis: 'FINISHED_GOODS_PRICE', currencyCode: 'USD',
    fields: { number: 'DRAFT-1', seller: { name: 'Seller' }, buyer: { name: 'Buyer' } } });
  assert.match(html, /PAYMENT REQUEST/);
  assert.match(html, /30% of agreed total USD 10000.00/);
  assert.match(html, /3000.00/);
  assert.match(html, /DRAFT — NOT ISSUED/);
  assert.ok(!html.includes('Qty (PCS)'));
  assert.ok(!html.includes('COMMERCIAL INVOICE'));
  assert.ok(!html.includes('<script>'));
});

test('invoice route permission is independent of ORDER and saved revocation remains effective', () => {
  const auth = (features, orgType = 'MANUFACTURER') => ({ isAuthenticated: true, accessProfile: {
    entryType: 'ORG', orgType, orgRole: 'ACCOUNTANT',
    accessPolicy: { __schemaVersion: ROLE_ACCESS_POLICY_SCHEMA_VERSION, [orgType]: { ACCOUNTANT: features } },
  } });
  assert.equal(canAccessPath('/invoices', auth(['ORDER'])), false);
  assert.equal(canAccessPath('/invoices', auth(['INVOICE'])), true);
  assert.equal(canAccessPath('/order', auth(['INVOICE'])), false);
  assert.equal(canAccessPath('/invoices', auth(['INVOICE'], 'BRAND')), false);
  const legacy = sanitizeRoleAccessPolicy({ __schemaVersion: 10, MANUFACTURER: { ADMIN: [], ACCOUNTANT: [], OPERATOR: ['ORDER'] } });
  assert.ok(legacy.MANUFACTURER.ADMIN.includes('INVOICE'));
  assert.ok(legacy.MANUFACTURER.ACCOUNTANT.includes('INVOICE'));
  assert.ok(!legacy.MANUFACTURER.OPERATOR.includes('INVOICE'));
  const current = sanitizeRoleAccessPolicy({ __schemaVersion: 11, MANUFACTURER: { ADMIN: [] } });
  assert.ok(!current.MANUFACTURER.ADMIN.includes('INVOICE'));
});

// Exercise the actual route definitions with an isolated read-only database double.
const require = createRequire(import.meta.url);
const ts = require('../backend/node_modules/typescript');
const backend = readFileSync('backend/src/index.ts', 'utf8');
const section = backend.slice(backend.indexOf('const requireInvoiceAccess ='), backend.indexOf('app.post("/orders/:orderId/modification-lock"'));
const routeCode = ts.transpileModule(section, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const createRoutes = ({ type = 'MANUFACTURER', allowed = true, found = true, orders = [], plans = [], progress = [] } = {}) => {
  const routes = new Map();
  const queries = [];
  const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, setHeader() {} };
  const prisma = {
    organization: { async findMany(query) { queries.push(query); return []; } },
    workOrder: { async findFirst(query) { queries.push(query); return found ? { id: 10, orderId: 'o', buyerOrgId: null, workOrderItems: [] } : null; },
      async findMany(query) { queries.push(query); return orders; } },
    assignmentPlan: { async findMany(query) { queries.push(query); return plans; } },
    invoiceOrder: { async findMany(query) { queries.push(query); return []; } },
    currency: { async findMany() { return [{ code: 'USD' }]; } },
  };
  new Function('requireOrgRole', 'hasRoleAccessPolicyFeature', 'prisma', 'buildInvoiceSource', 'buildAssignmentPlanProgressRows', 'WORK_ORDER_ITEM_WITH_COLOR_INCLUDE', 'app', 'invoiceOrderProgress', 'registerInvoiceDraftRoutes', 'getRequesterEmail', routeCode)(
    async () => ({ organization: { id: 7, type }, orgMembership: { role: 'ACCOUNTANT' } }),
    async ({ feature }) => { assert.equal(feature, 'INVOICE'); return allowed; }, prisma,
    () => ({ ready: false }), (orgId, ids) => { assert.equal(orgId, 7); assert.ok(ids.length); return progress; }, {},
    Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [method, (paths, handler) => {
      for (const path of [paths].flat()) routes.set(method === 'get' ? path : `${method} ${path}`, handler);
    }])),
    require('../backend/dist/services/invoiceOrderProgress.js').invoiceOrderProgress,
    require('../backend/dist/routes/invoiceDraft.routes.js').registerInvoiceDraftRoutes,
    () => 'invoice-test@example.com');
  return { routes, response, queries };
};
test('invoice APIs reject missing permission and brand tenants before any order query', async () => {
  for (const options of [{ allowed: false }, { type: 'BRAND' }]) {
    for (const path of ['/invoices/orders', '/invoices/customers', '/invoices/drafts', '/invoices/drafts/:id',
      'post /invoices/drafts', 'put /invoices/drafts/:id', 'delete /invoices/drafts/:id']) {
    const { routes, response, queries } = createRoutes(options);
    await routes.get(path)({ query: {} }, response);
    assert.equal(response.statusCode, 403);
    assert.equal(queries.length, 0);
    }
  }
});
test('source lookup always scopes seller, including the old endpoint alias', async () => {
  for (const path of ['/invoices/order-source/:orderId', '/orders/:orderId/invoice-source']) {
    const { routes, response, queries } = createRoutes({ found: false });
    await routes.get(path)({ params: { orderId: 'foreign-order' }, query: {} }, response);
    assert.deepEqual(queries[0].where, { orderId: 'foreign-order', sellerOrgId: 7 });
    assert.equal(response.statusCode, 404);
  }
});
test('list queries are paginated and preserve seller scope when searching', async () => {
  const { routes, response, queries } = createRoutes();
  await routes.get('/invoices/orders')({ query: { buyerOrgId: '8', search: 'PO', page: '2' } }, response);
  assert.equal(queries[0].where.sellerOrgId, 7);
  assert.equal(queries[0].where.buyerOrgId, 8);
  assert.deepEqual(queries[0].where.orderNumber, { contains: 'PO', mode: 'insensitive' });
  assert.equal(queries[0].take, 51);
  assert.equal(queries[0].skip, 100);
  assert.deepEqual(response.body, { rows: [], hasMore: false });
});

test('invoice order list scopes and batches assignment progress for only its visible orders', async () => {
  const orders = Array.from({ length: 51 }, (_, i) => ({ id: i + 1, orderId: `o${i}`, totalQuantity: 100 }));
  const { routes, response, queries } = createRoutes({ orders,
    plans: [{ workOrderId: 1, externalId: 'a' }], progress: [{ id: 'a', producedQuantity: 30, displayProgressPercent: 60 }] });
  await routes.get('/invoices/orders')({ query: { buyerOrgId: '8' } }, response);
  assert.equal(queries[1].where.orgId, 7);
  assert.equal(queries[1].where.workOrderId.in.length, 50);
  assert.equal(response.body.rows[0].progressPercent, 30);
  assert.equal(response.body.rows[0].assignments[0].progressPercent, 60);
  assert.equal(response.body.hasMore, true);
});

test('customer options contain only buyers with orders sold by the active factory', async () => {
  const { routes, response, queries } = createRoutes();
  await routes.get('/invoices/customers')({ query: {} }, response);
  assert.deepEqual(queries[0].where, { buyerWorkOrders: { some: { sellerOrgId: 7 } } });
  assert.deepEqual(queries[0].select, { id: true, name: true, nameKo: true, nameVi: true });
  assert.deepEqual(response.body, { rows: [] });
});

test('order list requires a valid selected customer before querying orders', async () => {
  for (const buyerOrgId of [undefined, '', '0', '-1', 'NaN', '1.5', '9007199254740992']) {
    const { routes, response, queries } = createRoutes();
    await routes.get('/invoices/orders')({ query: { buyerOrgId } }, response);
    assert.equal(response.statusCode, 400);
    assert.equal(queries.length, 0);
  }
});

test('draft source validates both selected customer and selling factory', async () => {
  const { routes, response, queries } = createRoutes({ found: false });
  await routes.get('/invoices/order-source/:orderId')({ params: { orderId: 'other-customer' }, query: { buyerOrgId: '8' } }, response);
  assert.deepEqual(queries[0].where, { orderId: 'other-customer', sellerOrgId: 7, buyerOrgId: 8 });
  assert.equal(response.statusCode, 404);
});
