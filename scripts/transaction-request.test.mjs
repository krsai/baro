import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import service from '../backend/dist/services/transactionRequest.js';
const { calculateRequestAmounts: amounts, registerTransactionRequest: register, validateVatRate, loadAppSettings } = service;
const input = () => ({ partnerOrgId: 11, transactionCodeId: 7, transactionDate: '2026-10-11', description: 'Trucking', unitPrice: '100000', quantity: '2', currency: 'VND', vatRate: '10', workOrderId: 30, styleId: null, styleProcessId: null, assignmentPlanId: null, details: {}, clientKey: 'request-001' });
function store(process = false) {
  const writes = [];
  const code = { id: 7, baseId: 1, taxTreatmentId: process ? 3 : 1, vatEnabled: !process, serviceType: { id: 4, entryMode: process ? 'PROCESS' : 'GENERAL', orderInput: 'OPTIONAL', styleInput: 'HIDDEN', processInput: 'HIDDEN', requiredFields: [] } };
  code.base = { ...code.serviceType, expenseTypeId: 1 };
  const snapshot = { processes: [{ styleProcessId: 50 }] };
  const plan = { id: 60, orgId: 1, workOrderId: 30, styleId: 40, factoryId: 1, isCompleted: false, ctReviewRequired: false, assignmentCtSnapshot: snapshot, assignmentStSnapshot: snapshot };
  return { writes, code, plan,
    expenseCodeLinkPolicy:{findUnique:async()=>({target:process?'PROCESS':'NONE',auditId:null})},
    factory: { findMany: async () => [{id:1,managementStartDate:"2026-04-01"}] },
    $queryRaw: async () => [],
    systemSetting: { findUnique: async () => ({ value: { defaultVatRate: '10' } }) },
    partnerTransactionCost: { findUnique: async () => null, create: async ({ data }) => { writes.push(['cost',data]); return data; } },
    transactionCode: { findFirst: async () => code },
    organizationOutsourcingServiceType: { findFirst: async () => ({}) },
    organization: { findFirst: async () => ({ id: 11 }), findUnique: async () => ({ name: 'QQ' }) },
    workOrder: { findFirst: async () => ({ id: 30, invoiceFinalLockedAt: null }) },
    workOrderItem: { findFirst: async () => ({ id: 1 }) },
    styleProcess: { findFirst: async () => ({ id: 50 }) },
    assignmentPlan: { findMany: async () => [plan] },
    workLog: { create: async ({ data }) => { writes.push(['log',data]); return { id: 80 }; } },
    outsourcedWorkRecord: { create: async ({ data }) => { writes.push(['production',data]); return { id: 90 }; } },
  };
}

test('style-scope sewing selects zero or multiple processes without recording production or multiplying its cost',async()=>{
 for(const ids of [[],[50,51]]){
  const db=store(true);db.expenseCodeLinkPolicy.findUnique=async()=>({target:'STYLE',auditId:1});
  const links=[];let saved;
  db.styleProcess.findMany=async({where})=>{assert.equal(where.orgId,1);assert.equal(where.styleId,40);return where.id.in.map(id=>({id}));};
  db.expenseCostProcess={deleteMany:async()=>{},createMany:async({data})=>links.push(...data)};
  db.partnerTransactionCost.create=async({data})=>{db.writes.push(['cost',data]);saved={id:'multi-cost',...data};return saved;};
  db.partnerTransactionCost.findUnique=async()=>saved?{...saved,processLinks:links}:null;
  const row=await register(db,1,20,{...input(),workOrderId:30,styleId:40,styleProcessId:null,styleProcessIds:ids,vatRate:'0',currency:'USD'});
  assert.deepEqual(db.writes.map(([kind])=>kind),['cost']);assert.equal(row.amount.toString(),'200000');assert.equal(links.length,ids.length);assert.equal(row.outsourcedWorkRecordId,null);
 }
});

test('multiple references reject duplicates and inactive, wrong-style or cross-company process IDs',async()=>{
 for(const ids of [[50,50],[0],[50,51]]){
  const db=store(true);db.expenseCodeLinkPolicy.findUnique=async()=>({target:'STYLE'});db.styleProcess.findMany=async()=>[{id:50}];
  await assert.rejects(register(db,1,20,{...input(),styleId:40,styleProcessIds:ids,vatRate:'0'}),/INVALID_REQUEST_PROCESSES/);
  assert.equal(db.writes.length,0);
 }
});
test('VAT calculation uses currency rounding and rejects malformed values', () => {
  assert.equal(amounts('100000','2','VND','10').amount.toString(),'220000');
  assert.equal(amounts('0.05','3','USD','10').vatAmount.toString(),'0.02');
  assert.equal(amounts('1.5','1','VND','10').subtotal.toString(),'2');
  for (const rate of ['101','-1','NaN','1e1','0.001']) assert.throws(() => validateVatRate(rate));
  for (const value of ['0','-1','1e5','NaN']) assert.throws(() => amounts(value,'1','VND','10'));
});
test('logistics records cost only, and snapshots VAT independently of later defaults', async () => {
  const db = store(); const row = await register(db,1,20,input());
  assert.deepEqual(db.writes.map(([kind]) => kind),['cost']);
  assert.equal(row.amount.toString(),'220000'); assert.equal(row.vatRate.toString(),'10');
  assert.equal(row.outsourcedWorkRecordId,null);
  assert.equal((await loadAppSettings({ systemSetting: { findUnique: async () => null } },1)).defaultVatRate,'10');
});

test('tenant base-code policy permits cost-only printing and requires configured process inputs', async () => {
  const costOnly=store(true);
  costOnly.code.serviceType.systemDefaultId=10;
  costOnly.expenseCodeLinkPolicy={findUnique:async({where})=>{
    assert.deepEqual(where,{orgId_baseId:{orgId:1,baseId:1}});
    return {target:'NONE',auditId:null};
  }};
  const result=await register(costOnly,1,20,{...input(),workOrderId:null,vatRate:'0',currency:'USD',quantity:'1.5'});
  assert.equal(result.outsourcedWorkRecordId,null);
  assert.deepEqual(costOnly.writes.map(([kind])=>kind),['cost']);
  const required=store(false);
  required.code.base.serviceTypeId=10;
  required.expenseCodeLinkPolicy={findUnique:async()=>({target:'PROCESS',auditId:null})};
  await assert.rejects(register(required,1,20,input()),/REQUIRED_REQUEST_STYLE/);
  assert.equal(required.writes.length,0);
  await register(required,1,20,{...input(),styleId:40,styleProcessId:50});
  assert.deepEqual(required.writes.map(([kind])=>kind),['cost']);
});

test('a later required-link policy never converts a saved cost-only row into production on edit', async()=>{
  const db=store(true);db.code.base.serviceTypeId=10;
  db.expenseCodeLinkPolicy={findUnique:async()=>({target:'PROCESS',auditId:null})};
  db.partnerTransactionCost.update=async({data})=>{db.writes.push(['cost',data]);return data;};
  const body={...input(),workOrderId:null,vatRate:'0'};
  await register(db,1,20,body,undefined,false,{cost:{id:'saved-cost',description:'Preserved'}});
  assert.deepEqual(db.writes.map(([kind])=>kind),['cost']);
  assert.equal(db.writes[0][1].outsourcedWorkRecordId,null);
});

test('unset base policy overrides legacy PROCESS defaults without consulting industry configuration',async()=>{
 const db=store(true);db.expenseCodeLinkPolicy.findUnique=async()=>null;
 db.industryProductionPolicy={findUnique:()=>{throw Error('No industry fallback');}};
 const row=await register(db,1,20,{...input(),vatRate:'0',quantity:'1.5',currency:'USD',workOrderId:null});
 assert.equal(row.linkTarget,'NONE');assert.equal(row.outsourcedWorkRecordId,null);assert.deepEqual(db.writes.map(([kind])=>kind),['cost']);
});

test('saved cost-only references survive inactive process and removed order-item candidates',async()=>{
 const db=store();db.workOrderItem.findFirst=async()=>null;
 db.styleProcess.findFirst=async({where})=>{assert.equal(where.orgId,1);assert.equal(where.styleId,40);assert.equal(where.isActive,undefined);return{id:50};};
 db.partnerTransactionCost.update=async({data})=>data;
 const row=await register(db,1,20,{...input(),styleId:40,styleProcessId:50},undefined,false,{cost:{id:'old',workOrderId:30,styleId:40,styleProcessId:50}});
 assert.equal(row.styleProcessId,50);assert.equal(row.linkTarget,'NONE');assert.equal(row.outsourcedWorkRecordId,null);
});

test('disabling base-code process links preserves an existing production FK and its required references',async()=>{
  const db=store(true);db.code.base.serviceTypeId=10;
  db.expenseCodeLinkPolicy={findUnique:async()=>({target:'NONE',auditId:null})};
  db.assignmentPlan.findFirst=async()=>db.plan;
  db.partnerTransactionCost.update=async({data})=>{db.writes.push(['cost',data]);return data;};
  const record={id:90,orgId:1,styleId:40,styleProcessId:50,assignmentPlanId:60,assignmentPlan:{workOrderId:30},outsourcingPartnerId:11,quantity:2,outsourceUnitPrice:'100000'};
  const body={...input(),vatRate:'0',styleId:40,styleProcessId:50,assignmentPlanId:60};
  await register(db,1,20,body,undefined,false,{cost:{id:'saved-cost',description:'Preserved'},record});
  assert.equal(db.writes[0][1].outsourcedWorkRecordId,90);
  assert.deepEqual(db.writes.map(([kind])=>kind),['cost']);
  await assert.rejects(register(db,1,20,{...body,styleProcessId:null},undefined,false,{cost:{id:'saved-cost'},record}),/EXISTING_PRODUCTION_IDENTITY_IMMUTABLE/);
});
test('process request writes one dated production record and linked cost, never employee records or AT', async () => {
  const db = store(true); const body = { ...input(), vatRate: '0', styleId: 40, styleProcessId: 50, quantity: '12' };
  const row = await register(db,1,20,body);
  assert.deepEqual(db.writes.map(([kind])=>kind),['log','production','cost']);
  assert.equal(db.writes[0][1].displayDate,'2026-10-11');
  assert.equal(db.writes[0][1].coverageStartDate,db.writes[0][1].coverageEndDate);
  assert.equal(db.writes[1][1].quantity,12); assert.equal(db.writes[1][1].styleProcessId,50);
  assert.equal(db.writes[1][1].assignmentPlanId,60); assert.equal(row.outsourcedWorkRecordId,90);
});
test('process rejects missing references, fractional quantities, completed/ambiguous assignment and final lock before writes', async () => {
  const body = { ...input(), vatRate: '0', styleId: 40, styleProcessId: 50 };
  for (const patch of [{ styleId: null }, { workOrderId: null }, { styleProcessId: null }, { quantity: '1.5' }, { currency: 'USD' }]) { const db = store(true); await assert.rejects(register(db,1,20,{ ...body,...patch })); assert.equal(db.writes.length,0); }
  const completed = store(true); completed.plan.isCompleted = true; await assert.rejects(register(completed,1,20,body),/ELIGIBLE_ASSIGNMENT_REQUIRED/);
  const ambiguous = store(true); ambiguous.assignmentPlan.findMany = async () => [ambiguous.plan,{ ...ambiguous.plan,id: 61 }]; await assert.rejects(register(ambiguous,1,20,body),/SELECT_ASSIGNMENT_PLAN/);
  const locked = store(true); locked.workOrder.findFirst = async () => ({ id:30,invoiceFinalLockedAt:new Date() }); await assert.rejects(register(locked,1,20,body),/ORDER_FINALLY_LOCKED/);
});
test('code scope, industry options and order/style/process membership are enforced', async () => {
  const missing = store(); missing.transactionCode.findFirst = async () => null; await assert.rejects(register(missing,1,20,input()),/INVALID_TRANSACTION_CODE/);
  const vendor = store(); vendor.organization.findFirst = async () => null; await assert.rejects(register(vendor,1,20,input()),/INVALID_PARTNER_SERVICE/);
  const hidden = store(); await assert.rejects(register(hidden,1,20,{ ...input(),styleId:40,styleProcessId:50 }),/UNEXPECTED_REQUEST_PROCESS/);
  const taxable = store(); taxable.code.vatEnabled = false; await assert.rejects(register(taxable,1,20,input()),/VAT_NOT_ENABLED/);
  const mismatch = store(true); mismatch.workOrderItem.findFirst = async () => null; await assert.rejects(register(mismatch,1,20,{ ...input(),vatRate:'0',styleId:40,styleProcessId:50 }),/INVALID_REQUEST_STYLE/);
});
test('retry preserves recorded production and VAT even after code defaults change', async () => {
  const db = store(); const data = await register(db,1,20,input());
  db.partnerTransactionCost.findUnique = async () => data;
  db.transactionCode.findFirst = async () => { throw Error('must not re-read a disabled code on retry'); };
  assert.equal(await register(db,1,20,input()),data);
  await assert.rejects(register(db,1,20,{ ...input(),unitPrice:'200000' }),/TRANSACTION_RETRY_MISMATCH/);
  assert.equal(db.writes.length,1);
});
test('repeatable SQL preserves old records and enforces production linkage, totals and rollback', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Organization" (id INTEGER PRIMARY KEY,"ownerOrgId" INTEGER,type TEXT,"isActive" BOOLEAN DEFAULT true,UNIQUE(id,"ownerOrgId"));
    CREATE TABLE "Employee" (id INTEGER PRIMARY KEY,"orgId" INTEGER,UNIQUE(id,"orgId"));
    CREATE TABLE "WorkOrder" (id INTEGER PRIMARY KEY,"orgId" INTEGER,UNIQUE(id,"orgId"));
    CREATE TABLE "Style" (id INTEGER PRIMARY KEY,"orgId" INTEGER,UNIQUE(id,"orgId"));
    CREATE TABLE "StyleProcess" (id INTEGER PRIMARY KEY,"styleId" INTEGER,"orgId" INTEGER,UNIQUE(id,"styleId","orgId"));
    CREATE TABLE "AssignmentPlan" (id INTEGER PRIMARY KEY,"workOrderId" INTEGER);
    CREATE TABLE "OutsourcedWorkRecord" (id SERIAL PRIMARY KEY,"orgId" INTEGER,"outsourcingPartnerId" INTEGER,"styleId" INTEGER,"styleProcessId" INTEGER,"assignmentPlanId" INTEGER,quantity INTEGER,"outsourceUnitPrice" DECIMAL(18,4));
    CREATE TABLE "OutsourcingServiceType" (id SERIAL PRIMARY KEY,"ownerOrgId" INTEGER,code TEXT,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"sortOrder" INTEGER,"isActive" BOOLEAN DEFAULT true,UNIQUE(id,"ownerOrgId"),UNIQUE("ownerOrgId",code));
    CREATE TABLE "OrganizationOutsourcingServiceType" ("partnerOrgId" INTEGER,"serviceTypeId" INTEGER,"ownerOrgId" INTEGER);
    INSERT INTO "Organization" VALUES (1,NULL,'MANUFACTURER',true),(11,1,'PROCESS_OUTSOURCING',true);
    INSERT INTO "Employee" VALUES (20,1); INSERT INTO "WorkOrder" VALUES (30,1); INSERT INTO "Style" VALUES(40,1); INSERT INTO "StyleProcess" VALUES(50,40,1); INSERT INTO "AssignmentPlan" VALUES(60,30);
    INSERT INTO "OutsourcedWorkRecord" VALUES(99,1,11,40,50,60,7,123.4567);`);
    const old = await db.query('SELECT * FROM "OutsourcedWorkRecord"');
    await db.exec(fs.readFileSync('backend/prisma/migrations/20261010090000_partner_transaction_cost/migration.sql','utf8'));
    await db.exec(`INSERT INTO "OutsourcingServiceType" ("ownerOrgId",code,"nameKo","nameEn","nameVi","entryMode") VALUES(1,'BUTTONHOLE','단춧구멍','Buttonhole','Khuy','PROCESS');`);
    const sql = fs.readFileSync('backend/prisma/migrations/20261011090000_transaction_request_codes/migration.sql','utf8');
    await db.exec(sql); await db.exec(sql);
    assert.deepEqual((await db.query('SELECT * FROM "OutsourcedWorkRecord"')).rows,old.rows);
    const rows = (await db.query('SELECT id,"serviceTypeId",code FROM "TransactionCode"')).rows;
    const trucking = rows.find(row => row.code==='TRKV'), process = rows.find(row => row.code==='BUTTONHOLE');
    await db.exec(`INSERT INTO "OrganizationOutsourcingServiceType" VALUES(11,${trucking.serviceTypeId},1),(11,${process.serviceTypeId},1); UPDATE "OutsourcingServiceType" SET "requiredFields"='{}';`);
    const insert = (key, code, total, record=null) => db.query(`INSERT INTO "PartnerTransactionCost" (id,"orgId","partnerOrgId","serviceTypeId","transactionCodeId","workOrderId","styleId","styleProcessId","outsourcedWorkRecordId","transactionDate",description,amount,currency,details,"clientKey","createdByEmployeeId","unitPrice",quantity,subtotal,"vatRate","vatAmount") VALUES($1,1,11,$2,$3,30,$4,$5,$6,'2026-10-11','Service',$7,'VND','{}',$1,20,100,2,200,$8,$9)`,[key,code.serviceTypeId,code.id,record?40:null,record?50:null,record,total,record?0:10,record?0:20]);
    await insert('trucking',trucking,220);
    await assert.rejects(insert('wrong-total',trucking,999));
    await assert.rejects(insert('no-production',process,200));
    await db.exec('BEGIN');
    await db.exec('INSERT INTO "OutsourcedWorkRecord" VALUES(100,1,11,40,50,60,2,100)');
    await assert.rejects(insert('bad-process',process,999,100));
    await db.exec('ROLLBACK');
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "OutsourcedWorkRecord" WHERE id=100')).rows[0].n,0);
    await db.exec('INSERT INTO "OutsourcedWorkRecord" VALUES(101,1,11,40,50,60,2,100)');
    await insert('process',process,200,101);
    await assert.rejects(db.exec('UPDATE "OutsourcedWorkRecord" SET quantity=1 WHERE id=101'));
    await assert.rejects(db.exec('DELETE FROM "OutsourcedWorkRecord" WHERE id=101'));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "PartnerTransactionCost"')).rows[0].n,2);
    const preserved = (await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows;
    for (const file of ['20261011120000_setting_inheritance','20261013090000_code_bases_tax','20261013120000_code_base_usage_fk','20261016090000_expense_code_separation']) await db.exec(fs.readFileSync(`backend/prisma/migrations/${file}/migration.sql`,'utf8'));
    const separation = fs.readFileSync('backend/prisma/migrations/20261016090000_expense_code_separation/migration.sql','utf8');
    await db.exec(separation);
    assert.deepEqual((await db.query('SELECT * FROM "PartnerTransactionCost" ORDER BY id')).rows,preserved);
    // No partner industry membership is required. Accounting and FK checks remain.
    await db.exec(`DELETE FROM "OrganizationOutsourcingServiceType"; UPDATE "TransactionCodeBase" SET "requiredFields"='{}' WHERE code='TRK'; UPDATE "Organization" SET type='MATERIAL_SUPPLIER' WHERE id=11;`);
    await insert('independent-payee',trucking,220);
    await assert.rejects(insert('invalid-independent-total',trucking,999));
    await db.exec(`UPDATE "OutsourcingServiceType" SET "requiredFields"=ARRAY['reference'];`);
    await insert('independent-inputs',trucking,220);
    await assert.rejects(db.exec(`UPDATE "PartnerTransactionCost" SET amount=0 WHERE id='independent-payee'`));
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "PartnerTransactionCost"')).rows[0].n,4);
  } finally { await db.close(); }
});
