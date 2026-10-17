import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { expenseLineAmounts, expenseDocumentTotals } from '../frontend/src/utils/expenseRequest.mjs';
const require = createRequire(import.meta.url);
const { registerExpenseRequest } = require('../backend/dist/services/expenseRequest.js');
const { calculateRequestAmounts } = require('../backend/dist/services/transactionRequest.js');
const ts = require('../backend/node_modules/typescript');
const input = () => ({ title: 'Factory expenses', requestDate: '2026-10-17', partnerOrgId: 11, currency: 'VND', clientKey: 'document-001', items: [
  { transactionCodeId: 7, transactionDate: '2026-10-17', description: 'Transport', quantity: '2', unitPrice: '100000', vatRate: '10', details: {} },
  { transactionCodeId: 7, transactionDate: '2026-10-17', description: 'Materials', quantity: '1', unitPrice: '50000', vatRate: '10', details: {} },
] });
function harness() {
  let state = { documents: [], costs: [], logs: [], production: [] };
  const client = data => {
    const readDocument = where => {
      const document = data.documents.find(row => where.id ? row.id === where.id : row.orgId === where.orgId_clientKey.orgId && row.clientKey === where.orgId_clientKey.clientKey);
      return document ? { ...document, items: data.costs.filter(row => row.expenseRequestId === document.id).map(row => ({ ...row, outsourcedWorkRecord: data.production.find(record => record.id === row.outsourcedWorkRecordId) || null })) } : null;
    };
    return {
      factory: { findMany: async () => [{ id: 1, managementStartDate: '2026-04-01' }] },
      expenseRequest: { findUnique: async ({ where }) => readDocument(where), create: async ({ data: row }) => { const document = { id: data.documents.length + 1, ...row }; data.documents.push(document); return document; } },
      partnerTransactionCost: {
        findUnique: async () => null,
        create: async ({ data: row }) => { const cost = { id: `cost-${data.costs.length + 1}`, ...JSON.parse(JSON.stringify(row)) }; data.costs.push(cost); return cost; },
        update: async ({ where, data: patch }) => Object.assign(data.costs.find(row => row.id === where.id), patch),
      },
      transactionCode: { findFirst: async ({ where }) => ({ id: where.id, baseId: 1, serviceTypeId: 4, taxTreatmentId: where.id === 8 ? 3 : 1, vatEnabled: where.id !== 8,
        serviceType: { id: 4 }, base: { entryMode: where.id === 8 ? 'PROCESS' : 'LOGISTICS', orderInput: 'OPTIONAL', styleInput: 'HIDDEN', processInput: 'HIDDEN', requiredFields: [] } }) },
      systemSetting: { findUnique: async () => ({ value: { defaultVatRate: '10' } }) },
      organization: { findFirst: async () => ({ id: 11 }), findUnique: async () => ({ name: 'Vendor' }) },
      workOrder: { findFirst: async () => ({ id: 30 }) }, workOrderItem: { findFirst: async () => ({ id: 1 }) }, styleProcess: { findFirst: async () => ({ id: 50 }) },
      assignmentPlan: { findMany: async () => [{ id: 60, factoryId: 1, isCompleted: false, assignmentCtSnapshot: { processes: [{ styleProcessId: 50 }] }, assignmentStSnapshot: { processes: [{ styleProcessId: 50 }] } }] },
      workLog: { create: async ({ data: row }) => { const log = { id: data.logs.length + 1, ...row }; data.logs.push(log); return log; } },
      outsourcedWorkRecord: { create: async ({ data: row }) => { const record = { id: data.production.length + 1, ...row }; data.production.push(record); return record; } },
      $queryRaw: async () => [],
    };
  };
  return {
    state: () => state,
    $transaction: async (run, options) => { assert.equal(options.isolationLevel, 'Serializable'); const draft = JSON.parse(JSON.stringify(state)); const result = await run(client(draft)); state = draft; return result; },
  };
}
function postRoute(dependencies) {
  const source = fs.readFileSync('backend/src/index.ts','utf8'), tree = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true);
  const statement = tree.statements.find(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(tree) === 'app.post' && node.expression.arguments[0]?.text === '/expense-requests');
  assert.ok(statement);
  let handler;
  const bindings = { app: { post: (_path, callback) => { handler = callback; } }, ...dependencies };
  new Function(...Object.keys(bindings), ts.transpileModule(statement.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(bindings));
  return handler;
}
const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
function routeHarness() {
  const db = harness(), effects = [];
  return { db, effects, route: postRoute({ prisma: db, requireOrgRole: async () => ({ organization: { id: 1 } }), ORG_MANAGEMENT_ROLES: ['ADMIN'],
    getCurrentRequestActorEmployeeId: () => 20, registerExpenseRequest, appendWorkLogQuantityRemark: undefined,
    trySyncAssignmentPlanSideEffectsAfterWorkLogMutation: async value => effects.push(value) }) };
}

test('document registration persists ordered cost rows and server totals; identical retries create nothing', async () => {
  const { route, db } = routeHarness(), body = input(), res = response();
  await route({ body },res);
  assert.equal(res.code,201); assert.equal(res.body.amount,'275000'); assert.equal(res.body.items.length,2);
  assert.deepEqual(db.state().costs.map(row => row.expenseRequestLine),[1,2]);
  await route({ body: { ...body, items: body.items.map(item => Object.fromEntries(Object.entries(item).reverse())) } },response());
  assert.equal(db.state().documents.length,1); assert.equal(db.state().costs.length,2);
  await assert.rejects(route({ body: { ...body, items: body.items.slice(0,1) } },response()),/RETRY_MISMATCH/);
});
test('a bad later row rolls back the header, preceding costs and process production together', async () => {
  const { route,db,effects } = routeHarness(), body = input();
  body.items[0] = { ...body.items[0], transactionCodeId: 8, vatRate: '0', workOrderId: 30, styleId: 40, styleProcessId: 50, assignmentPlanId: 60 };
  body.items[1].unitPrice = '0';
  await assert.rejects(route({ body },response()),/INVALID_PRICE_OR_QUANTITY/);
  assert.deepEqual(db.state(),{ documents: [], costs: [], logs: [], production: [] }); assert.equal(effects.length,0);
  body.items[1].unitPrice = '50000'; await route({ body },response());
  assert.equal(db.state().production.length,1); assert.deepEqual(effects[0].assignmentPlanIds,[60]);
  await route({ body },response()); assert.equal(db.state().production.length,1);
});
test('documents reject conflicting payees/currencies, empty or excessive lines and unauthorized access', async () => {
  const { route,db } = routeHarness();
  for (const patch of [{ title: '' },{ currency: 'EUR' },{ items: [] },{ items: Array(51).fill(input().items[0]) },{ items: [{ ...input().items[0], currency: 'USD' }] },{ items: [{ ...input().items[0], partnerOrgId: 99 }] },{ requestDate: '2026-03-31' }]) await assert.rejects(route({ body: { ...input(), ...patch } },response()));
  assert.equal(db.state().documents.length,0);
  const forbidden = postRoute({ requireOrgRole: async () => null, ORG_MANAGEMENT_ROLES: ['ADMIN'] });
  await forbidden({ body: input() },response());
});
test('frontend row rounding and document sums match the server for fractional prices and quantities', () => {
  for (const currency of ['USD','VND','KRW']) for (const [unitPrice,quantity,vatRate] of [['0.05','3','10'],['1.5','1','10'],['123.4567','2.3456','8.25'],['999999999999','9999','0']]) {
    const line = { unitPrice,quantity,vatRate };
    let expected;
    try { expected = calculateRequestAmounts(unitPrice,quantity,currency,vatRate); }
    catch { assert.equal(expenseLineAmounts(line,currency),null); continue; }
    const actual = expenseLineAmounts(line,currency);
    if (expected.subtotal.isZero()) continue;
    for (const field of ['subtotal','vatAmount','amount']) assert.ok(expected[field].equals(actual[field]));
    assert.ok(expenseDocumentTotals([line,line],currency).amount);
  }
});
test('document SQL is repeatable, preserves old costs and enforces tenant/payee/currency and line pairing FKs', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,UNIQUE(id,"ownerOrgId"));
      CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,UNIQUE(id,"orgId"));
      CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"partnerOrgId" INT,currency TEXT,amount NUMERIC);
      INSERT INTO "Organization" VALUES(1,NULL),(2,NULL),(11,1),(12,2);INSERT INTO "Employee" VALUES(20,1),(21,2);
      INSERT INTO "PartnerTransactionCost" VALUES('legacy',1,11,'VND',123);`);
    const sql = fs.readFileSync('backend/scripts/apply-expense-request-documents.sql','utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`INSERT INTO "ExpenseRequest" (id,"orgId","partnerOrgId","createdByEmployeeId","requestDate",title,currency,"clientKey","submissionHash") VALUES(1,1,11,20,'2026-10-17','Expenses','VND','key','hash');`);
    for (const [org,payee,currency,line] of [[2,11,'VND',1],[1,12,'VND',1],[1,11,'USD',1],[1,11,'VND','NULL'],[1,11,'VND',0]]) await assert.rejects(db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('bad',${org},${payee},'${currency}',1,1,${line})`));
    await db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('item',1,11,'VND',100,1,1)`);
    await assert.rejects(db.exec(`DELETE FROM "ExpenseRequest" WHERE id=1`));
    assert.deepEqual((await db.query(`SELECT amount::text,"expenseRequestId","expenseRequestLine" FROM "PartnerTransactionCost" WHERE id='legacy'`)).rows,[{ amount:'123',expenseRequestId:null,expenseRequestLine:null }]);
  } finally { await db.close(); }
});
