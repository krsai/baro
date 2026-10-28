import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { PGlite } from '@electric-sql/pglite';
import { expenseLineAmounts, expenseDocumentTotals } from '../frontend/src/utils/expenseRequest.mjs';
import { exactLookupCode, normalizeLookupText } from '../frontend/src/utils/expenseLookup.mjs';
import { expenseTotalsByCurrency } from '../frontend/src/utils/expenseRequest.mjs';
import { formatEditableDecimal } from '../frontend/src/utils/editableDecimal.mjs';
import { expenseLineDescription, expenseRequestSummary } from '../frontend/src/utils/expenseCodePresentation.mjs';
const require = createRequire(import.meta.url);
const { registerExpenseRequest } = require('../backend/dist/services/expenseRequest.js');
const { calculateRequestAmounts } = require('../backend/dist/services/transactionRequest.js');
const ts = require('../backend/node_modules/typescript');
const input = () => ({ remark: 'Factory expenses', requestDate: '2026-10-17', partnerOrgId: 11, currency: 'VND', clientKey: 'document-001', items: [
  { transactionCodeId: 7, transactionDate: '2026-10-17', description: 'Transport', quantity: '2', unitPrice: '100000', vatRate: '10', details: {} },
  { transactionCodeId: 7, transactionDate: '2026-10-17', description: 'Materials', quantity: '1', unitPrice: '50000', vatRate: '10', details: {} },
] });
function harness({sourceEnabled=true}={}) {
  let state = { documents: [], costs: [], logs: [], production: [], audits: [] };
  const client = data => {
    const readDocument = where => {
      const document = data.documents.find(row => where.id ? row.id === where.id : row.orgId === where.orgId_clientKey.orgId && row.clientKey === where.orgId_clientKey.clientKey);
      return document ? { ...document, items: data.costs.filter(row => row.expenseRequestId === document.id).map(row => ({ ...row, outsourcedWorkRecord: data.production.find(record => record.id === row.outsourcedWorkRecordId) || null })) } : null;
    };
    return {
      expenseCodeLinkPolicy:{findUnique:async({where})=>({target:where.orgId_baseId.baseId===2?'PROCESS':'NONE',auditId:null})},
      organizationBankAccount: {findFirst:async()=>({id:"test-bank"})},
      employee: {findFirst:async({where})=>({id:where.id,orgId:where.orgId,status:'ACTIVE',orgRole:'ACCOUNTANT',gradeId:1,grade:{isActive:true,set:{isActive:true}}})},
      factory: { findMany: async () => [{ id: 1, managementStartDate: '2026-04-01' }] },
      expenseRequest: { findUnique: async ({ where }) => readDocument(where),findFirst:async({where})=>readDocument(where), create: async ({ data: row }) => { const document = { id: data.documents.length + 1,version:1, ...row }; data.documents.push(document); return document; } },
      partnerTransactionCost: {
        findUnique: async () => null,
        create: async ({ data: row }) => { const cost = { id: `cost-${data.costs.length + 1}`, ...JSON.parse(JSON.stringify(row)) }; data.costs.push(cost); return cost; },
        update: async ({ where, data: patch }) => Object.assign(data.costs.find(row => row.id === where.id), patch),
      },
      transactionCode: { findFirst: async ({ where }) => ({ id: where.id, isActive:true, baseId: where.id===8?2:1, serviceTypeId: 4, taxTreatmentId: where.id === 8 ? 3 : 1, vatEnabled: where.id !== 8,
        taxTreatment:{code:where.id===8?'EXEMPT':'VAT',suffix:where.id===8?'E':'V'},
        serviceType: { id: 4 }, base: {nameEn:'Transport',isActive:true,code:'TRK',expenseType:{isActive:true},variants:[{id:2,taxTreatmentId:where.id===8?3:1,isActive:true,isEnabled:sourceEnabled}], entryMode: where.id === 8 ? 'PROCESS' : 'LOGISTICS', orderInput: 'OPTIONAL', styleInput: 'HIDDEN', processInput: 'HIDDEN', requiredFields: [] } }) },
      expenseRequestAudit:{create:async({data:row})=>{data.audits.push(row);return row;}},
      systemSetting: { findUnique: async ({where}) => ({ value: where.key.startsWith('EXPENSE_APPROVAL_POLICY:') ? {limits:{VND:{senior:'20000000',lead:'100000000'},USD:{senior:'1000',lead:'5000'},KRW:{senior:'1000000',lead:'5000000'}},seniorGradeId:1,leadGradeId:2} : { defaultVatRate: '10' } }) },
      organization: { findFirst: async () => ({ id: 11 }), findUnique: async () => ({ name: 'Vendor' }) },
      workOrder: { findFirst: async () => ({ id: 30 }) }, workOrderItem: { findFirst: async () => ({ id: 1 }) }, styleProcess: { findFirst: async () => ({ id: 50 }) },
      assignmentPlan: { findMany: async () => [{ id: 60, factoryId: 1, isCompleted: false, assignmentCtSnapshot: { processes: [{ styleProcessId: 50 }] }, assignmentStSnapshot: { processes: [{ styleProcessId: 50 }] } }] },
      workLog: { create: async ({ data: row }) => { const log = { id: data.logs.length + 1, ...row }; data.logs.push(log); return log; } },
      outsourcedWorkRecord: { create: async ({ data: row }) => { const record = { id: data.production.length + 1, ...row }; data.production.push(record); return record; } },
      $queryRaw: async () => [], $queryRawUnsafe: async()=>[],
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
test('live FK descriptions and first-item summaries follow the language and item order',()=>{
  const code={id:7,base:{expenseType:{nameKo:'제작 외주',nameEn:'Production outsourcing',nameVi:'Gia công sản xuất'},entryMode:'PROCESS',nameKo:'단춧구멍',nameEn:'BUTTON HOLE',nameVi:'Thùa khuyết'}};
  const first={transactionCodeId:7,transactionCode:code,description:'Old copied text'};
  const second={transactionCodeId:8,transactionCode:{id:8,base:{expenseType:{nameEn:'Production outsourcing'},entryMode:'PROCESS',nameEn:'CUTTING'}}};
  assert.equal(expenseLineDescription(first,'ko'),'제작 외주 - 단춧구멍');
  assert.equal(expenseRequestSummary({items:[first,second]},'en'),'Production outsourcing - BUTTON HOLE and 1 more');
  assert.equal(expenseRequestSummary({items:[first,second]},'ko'),'제작 외주 - 단춧구멍 외 1건');
  assert.equal(expenseRequestSummary({items:[first,second]},'vi'),'Gia công sản xuất - Thùa khuyết và 1 mục khác');
  assert.equal(expenseRequestSummary({items:[second,first]},'en'),'Production outsourcing - CUTTING and 1 more');
  code.base.nameEn='Updated master';assert.equal(expenseLineDescription(first,'en'),'Production outsourcing - Updated master');
  assert.equal(first.description,'Old copied text');
});
test('lookup only resolves unique exact codes and supports Vietnamese search', () => {
  const options = [{id:1,code:'ABC',name:'Same'},{id:2,code:'XYZ',name:'Same'}];
  assert.equal(exactLookupCode(options,' abc ').id,1);
  assert.equal(exactLookupCode(options,'Same'),null);
  assert.equal(exactLookupCode(options,'AB'),null);
  assert.equal(exactLookupCode([...options,{id:3,code:'abc'}],'ABC'),null);
  assert.equal(normalizeLookupText('Đối tác'), 'doi tac');
});

test('editable price formatting retains exact precision and unfinished decimals', () => {
  assert.equal(formatEditableDecimal('5000'),'5,000');
  assert.equal(formatEditableDecimal('999999999999.0001'),'999,999,999,999.0001');
  assert.equal(formatEditableDecimal('5000.2500'),'5,000.2500');
  assert.equal(formatEditableDecimal('0.'),'0.');assert.equal(formatEditableDecimal(''),'');
});
function routeHarness(options) {
  const db = harness(options), effects = [];
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
test('confirmed approval selection is snapshotted and retries cannot change it',async()=>{
  const {route,db}=routeHarness(),body={...input(),approvalSelection:{}};
  await route({body},response());
  assert.deepEqual(db.state().audits[0].afterSnapshot.approvalPolicy.selection,{});
  await route({body},response());assert.equal(db.state().documents.length,1);
  await assert.rejects(route({body:{...body,approvalSelection:{seniorVacant:true}}},response()),/RETRY_MISMATCH/);
});
test('a bad later row rolls back the header, preceding costs and process production together', async () => {
  const { route,db,effects } = routeHarness(), body = input();
  body.items[0] = { ...body.items[0], transactionCodeId: 8, vatRate: '0', workOrderId: 30, styleId: 40, styleProcessId: 50, assignmentPlanId: 60 };
  body.items[1].unitPrice = '0';
  await assert.rejects(route({ body },response()),/EXPENSE_LINE:2:INVALID_PRICE_OR_QUANTITY/);
  assert.deepEqual(db.state(),{ documents: [], costs: [], logs: [], production: [], audits: [] }); assert.equal(effects.length,0);
  body.items[1].unitPrice = '50000'; await route({ body },response());
  assert.equal(db.state().production.length,1); assert.deepEqual(effects[0].assignmentPlanIds,[60]);
  await route({ body },response()); assert.equal(db.state().production.length,1);
});

test('mixed base policies validate each line independently and report the failing row',async()=>{
 const {route,db}=routeHarness(),body=input();
 body.items[1]={...body.items[1],transactionCodeId:8,vatRate:'0',workOrderId:30,styleId:40};
 await assert.rejects(route({body},response()),/EXPENSE_LINE:2:REQUIRED_REQUEST_PROCESS/);
 assert.equal(db.state().documents.length,0);assert.equal(db.state().costs.length,0);
 body.items[1].styleProcessId=50;body.items[1].assignmentPlanId=60;
 await route({body},response());
 assert.deepEqual(db.state().costs.map(row=>row.linkTarget),['NONE','PROCESS']);
 assert.equal(db.state().production.length,1);
});

test('one header date applies to all new costs and conflicting item dates are rejected atomically', async () => {
  const { route, db } = routeHarness(), body = input();
  body.requestDate = '2026-10-18';
  for (const item of body.items) delete item.transactionDate;
  await route({ body }, response());
  assert.deepEqual(db.state().costs.map(row => row.transactionDate), ['2026-10-18','2026-10-18']);
  const other = routeHarness();
  body.items[1].transactionDate = '2026-10-17';
  await assert.rejects(other.route({ body }, response()), /EXPENSE_REQUEST_DATE_MISMATCH/);
  assert.deepEqual(other.db.state(), { documents: [], costs: [], logs: [], production: [], audits: [] });
});
test('documents reject conflicting payees, invalid currencies, empty or excessive lines and unauthorized access', async () => {
  const { route,db } = routeHarness();
  for (const patch of [{ remark: 'x'.repeat(501) },{ currency: 'EUR' },{ items: [] },{ items: Array(51).fill(input().items[0]) },{ items: [{ ...input().items[0], currency: 'EUR' }] },{ items: [{ ...input().items[0], partnerOrgId: 99 }] },{ requestDate: '2026-03-31' }]) await assert.rejects(route({ body: { ...input(), ...patch } },response()));
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
test('document SQL is repeatable, preserves old costs and enforces tenant/payee and line pairing FKs while allowing per-line currencies', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Organization"(id INT PRIMARY KEY,"ownerOrgId" INT,UNIQUE(id,"ownerOrgId"));
      CREATE TABLE "Employee"(id INT PRIMARY KEY,"orgId" INT,UNIQUE(id,"orgId"));
      CREATE TABLE "PartnerTransactionCost"(id TEXT PRIMARY KEY,"orgId" INT,"partnerOrgId" INT,currency TEXT,amount NUMERIC);
      INSERT INTO "Organization" VALUES(1,NULL),(2,NULL),(11,1),(12,2);INSERT INTO "Employee" VALUES(20,1),(21,2);
      INSERT INTO "PartnerTransactionCost" VALUES('legacy',1,11,'VND',123);`);
    const sql = fs.readFileSync('backend/prisma/migrations/20261017120000_expense_request_documents/migration.sql','utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec(`INSERT INTO "ExpenseRequest" (id,"orgId","partnerOrgId","createdByEmployeeId","requestDate",title,currency,"clientKey","submissionHash") VALUES(1,1,11,20,'2026-10-17','Expenses','VND','key','hash');`);
    for (const [org,payee,currency,line] of [[2,11,'VND',1],[1,12,'VND',1],[1,11,'VND','NULL'],[1,11,'VND',0]]) await assert.rejects(db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('bad',${org},${payee},'${currency}',1,1,${line})`));
    await db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('item',1,11,'VND',100,1,1)`);
    await db.exec('ALTER TABLE "PartnerTransactionCost" DROP CONSTRAINT "PartnerTransactionCost_expense_request_fkey"; ALTER TABLE "PartnerTransactionCost" ADD CONSTRAINT "PartnerTransactionCost_expense_request_fkey" FOREIGN KEY ("expenseRequestId","orgId","partnerOrgId",currency) REFERENCES "ExpenseRequest"(id,"orgId","partnerOrgId",currency)');
    await db.exec(sql);await db.exec(sql);
    await db.exec(`INSERT INTO "PartnerTransactionCost" VALUES('usd-item',1,11,'USD',10,1,2)`);
    await assert.rejects(db.exec(`DELETE FROM "ExpenseRequest" WHERE id=1`));
    assert.deepEqual((await db.query(`SELECT amount::text,"expenseRequestId","expenseRequestLine" FROM "PartnerTransactionCost" WHERE id='legacy'`)).rows,[{ amount:'123',expenseRequestId:null,expenseRequestLine:null }]);
  } finally { await db.close(); }
});

test('mixed currencies are persisted per line and returned as separate totals without a cross-currency sum', async () => {
  const { route, db } = routeHarness(), body=input();
  delete body.currency;
  body.items[0].currency='VND'; body.items[1].currency='USD';body.items[1].unitPrice='1.25';body.items[1].vatRate='8';
  const result=response();await route({body},result);
  assert.equal(result.body.currency,null);assert.equal(result.body.amount,null);
  assert.deepEqual(result.body.currencyTotals.map(row=>[row.currency,row.amount]),[['USD','1.35'],['VND','220000']]);
  assert.deepEqual(db.state().costs.map(row=>row.currency),['VND','USD']);
  assert.deepEqual(expenseTotalsByCurrency(body.items).map(row=>[row.currency,row.amount]),[['USD','1.35'],['VND','220000']]);
  await route({body},response());assert.equal(db.state().costs.length,2);
  await assert.rejects(route({body:{...body,items:body.items.map((row,index)=>index?{...row,currency:'KRW'}:row)}},response()),/RETRY_MISMATCH/);
});

test('a non-VND process line rolls the whole mixed request back', async () => {
  const {route,db}=routeHarness(),body=input();
  body.items[1]={...body.items[1],transactionCodeId:8,currency:'USD',vatRate:'0',workOrderId:30,styleId:40,styleProcessId:50,assignmentPlanId:60};
  await assert.rejects(route({body},response()));
  assert.equal(db.state().costs.length,0);assert.equal(db.state().documents.length,0);assert.equal(db.state().production.length,0);
});

test('VAT defaults inherit from system settings and organization overrides take precedence', async () => {
  const {loadAppSettings}=require('../backend/dist/services/applicationSettings.js');
  const db={systemSetting:{findUnique:async({where})=>({value:where.key==='APP_SETTINGS:DEFAULT'?{defaultVatRate:'10'}:{defaultVatRate:'8'}})}};
  assert.equal((await loadAppSettings(db,1)).defaultVatRate,'8');
  db.systemSetting.findUnique=async({where})=>where.key==='APP_SETTINGS:DEFAULT'?{value:{defaultVatRate:'10'}}:null;
  assert.equal((await loadAppSettings(db,1)).defaultVatRate,'10');
});

test('expense inputs resolve SaaS masters by base and tax FKs without rewriting tenant identities', () => {
  const {resolveSystemExpenseCode}=require('../backend/dist/services/systemExpenseCode.js');
  const row={id:7,isActive:true,baseId:40,taxTreatmentId:1,code:'LEGACY',nameEn:'Local',taxTreatment:{code:'VAT',suffix:'V'},base:{id:40,code:'TRK',nameEn:'Master trucking',isActive:true,expenseType:{isActive:true},variants:[{id:22,taxTreatmentId:1,isActive:true,isEnabled:true}]}};
  const result=resolveSystemExpenseCode(row);
  assert.equal(result.id,7);assert.equal(result.systemSourceId,22);assert.equal(result.code,'TRKV');assert.equal(result.nameEn,'Master trucking');assert.equal(row.code,'LEGACY');
  assert.equal(resolveSystemExpenseCode({...row,taxTreatmentId:2}),null);
  assert.equal(resolveSystemExpenseCode({...row,base:{...row.base,variants:[]}}),null);
});

test('disabled SaaS variants cannot be submitted and the transaction leaves no costs behind', async () => {
  const {route,db}=routeHarness({sourceEnabled:false});
  await assert.rejects(route({body:input()},response()),/INVALID_TRANSACTION_CODE/);
  assert.equal(db.state().documents.length,0);assert.equal(db.state().costs.length,0);
});

test('issuer and author come from authorized server context rather than request fields', async () => {
  const {route,db}=routeHarness();
  await route({body:{...input(),orgId:999,createdByEmployeeId:999}},response());
  assert.equal(db.state().documents[0].orgId,1);assert.equal(db.state().documents[0].createdByEmployeeId,20);
  assert.ok(db.state().costs.every(row=>row.orgId===1&&row.createdByEmployeeId===20));
});
