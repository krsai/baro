import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import service from '../backend/dist/services/partnerTransactionCost.js';
const { validateCostInput, validateServiceDefinition, registerPartnerCost } = service;
test('unified history preserves original process FKs, quantities and exact unit price without approving or mutating data', () => {
  const original = [{ id: 77, workLogId: 12, outsourcingPartnerId: 11, outsourcingPartner: { id: 11, name: 'QQ' }, styleProcessId: 901, quantity: 3, outsourceUnitPrice: '1.2345', workLog: { displayDate: '2026-09-20' }, assignmentPlan: { workOrderId: 30, workOrder: { id: 30, orderNumber: 'L18-1' } }, style: { name: 'Style' }, styleProcess: { id: 901, processName: 'Sewing' } }];
  const before = structuredClone(original);
  const [row] = service.historicalOutsourcingRows(original);
  assert.deepEqual(original, before);
  assert.equal(row.outsourcedWorkRecordId,77); assert.equal(row.styleProcessId,901); assert.equal(row.quantity,3);
  assert.equal(row.workOrderId,30); assert.equal(row.amount,'3.7035');
  assert.equal(row.sourceKind,'HISTORICAL_WORK_RECORD'); assert.ok(!('approvedAt' in row));
});
const input = () => ({ partnerOrgId: 11, serviceTypeId: 4, workOrderId: 30, transactionDate: '2026-10-10', description: 'Delivery', amount: '250000', currency: 'VND', details: { transportDate: '2026-10-10', origin: 'Factory', destination: 'Port' }, clientKey: 'delivery-001' });
const tx = (mode = 'LOGISTICS') => ({
  partnerTransactionCost: { findUnique: async () => null, create: async ({ data }) => data },
  organizationOutsourcingServiceType: { findFirst: async () => ({ serviceType: { entryMode: mode, requiredFields: mode === 'LOGISTICS' ? ['transportDate', 'origin', 'destination'] : [] } }) },
  workOrder: { findFirst: async () => ({ id: 30 }) },
});
test('cost input rejects invalid dates, foreign identifiers, unsupported currency and fractional VND', () => {
  for (const patch of [{ transactionDate: '2026-02-30' }, { amount: '0' }, { amount: '-1' }, { amount: '1.01' }, { amount: '1e5' }, { currency: 'EUR' }, { partnerOrgId: '11' }, { serviceTypeId: null }, { workOrderId: 'public-order-id' }]) assert.throws(() => validateCostInput({ ...input(), ...patch }));
  assert.equal(validateCostInput({ ...input(), currency: 'USD', amount: '1.25' }).amount.toString(), '1.25');
});
test('industry definition forces logistics fields and rejects arbitrary field keys', () => {
  const definition = { code: 'DELIVERY', nameKo: '배송', nameEn: 'Delivery', nameVi: 'Giao hàng', entryMode: 'LOGISTICS', requiredFields: ['reference'] };
  assert.deepEqual(new Set(validateServiceDefinition(definition).requiredFields), new Set(['reference', 'transportDate', 'origin', 'destination']));
  assert.throws(() => validateServiceDefinition({ ...definition, requiredFields: ['employeeEmail'] }));
});
test('process outsourcing must continue through process work records', async () => {
  await assert.rejects(registerPartnerCost(tx('PROCESS'), 1, 20, input()), /PROCESS_WORK_RECORD_REQUIRED/);
});
test('required logistics details, partner service and order scope are verified before saving', async () => {
  await assert.rejects(registerPartnerCost(tx(), 1, 20, { ...input(), details: { origin: 'Factory' } }), /REQUIRED_TRANSACTION_FIELD/);
  const missing = tx(); missing.organizationOutsourcingServiceType.findFirst = async () => null;
  await assert.rejects(registerPartnerCost(missing, 1, 20, input()), /INVALID_PARTNER_SERVICE/);
  const otherOrder = tx(); otherOrder.workOrder.findFirst = async () => null;
  await assert.rejects(registerPartnerCost(otherOrder, 1, 20, input()), /INVALID_TRANSACTION_ORDER/);
  const saved = await registerPartnerCost(tx(), 1, 20, { ...input(), createdByEmployeeId: 999 });
  assert.equal(saved.createdByEmployeeId, 20); assert.equal(saved.orgId, 1);
});
test('same retry returns existing cost, altered retry is rejected', async () => {
  const existing = { ...validateCostInput(input()), orgId: 1, createdByEmployeeId: 20 };
  const db = tx(); db.partnerTransactionCost.findUnique = async () => existing;
  assert.equal(await registerPartnerCost(db, 1, 20, input()), existing);
  await assert.rejects(registerPartnerCost(db, 1, 20, { ...input(), amount: '300000' }), /TRANSACTION_RETRY_MISMATCH/);
  await assert.rejects(registerPartnerCost(db, 1, 21, input()), /TRANSACTION_RETRY_MISMATCH/);
});
test('SQL is repeatable, protects organization FKs and prevents process bypass and history mutation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "Organization" (id INTEGER PRIMARY KEY,"ownerOrgId" INTEGER,type TEXT,"isActive" BOOLEAN DEFAULT true,UNIQUE(id,"ownerOrgId"));
      CREATE TABLE "Employee" (id INTEGER PRIMARY KEY,"orgId" INTEGER,UNIQUE(id,"orgId"));
      CREATE TABLE "WorkOrder" (id INTEGER PRIMARY KEY,"orgId" INTEGER,UNIQUE(id,"orgId"));
      CREATE TABLE "OutsourcingServiceType" (id SERIAL PRIMARY KEY,"ownerOrgId" INTEGER,code TEXT,"nameKo" TEXT,"nameEn" TEXT,"nameVi" TEXT,"sortOrder" INTEGER,"isActive" BOOLEAN DEFAULT true,UNIQUE(id,"ownerOrgId"),UNIQUE("ownerOrgId",code));
      CREATE TABLE "OrganizationOutsourcingServiceType" ("partnerOrgId" INTEGER,"serviceTypeId" INTEGER,"ownerOrgId" INTEGER);
      INSERT INTO "Organization" VALUES (1,NULL,'MANUFACTURER',true),(2,NULL,'MANUFACTURER',true),(11,1,'PROCESS_OUTSOURCING',true),(12,2,'PROCESS_OUTSOURCING',true);
      INSERT INTO "Employee" VALUES (20,1),(21,2); INSERT INTO "WorkOrder" VALUES (30,1),(31,2);`);
    const sql = fs.readFileSync('backend/prisma/migrations/20261010090000_partner_transaction_cost/migration.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    const id = (await db.query(`SELECT id FROM "OutsourcingServiceType" WHERE "ownerOrgId"=1`)).rows[0].id;
    await db.exec(`INSERT INTO "OrganizationOutsourcingServiceType" VALUES (11,${id},1);`);
    const insert = (key, partner = 11, employee = 20, order = 30, details = '{"transportDate":"2026-10-10","origin":"Factory","destination":"Port"}') => db.query(`INSERT INTO "PartnerTransactionCost" (id,"orgId","partnerOrgId","serviceTypeId","workOrderId","transactionDate",description,amount,currency,details,"clientKey","createdByEmployeeId") VALUES ($1,1,$2,$3,$4,'2026-10-10','Delivery',250000,'VND',$5,$1,$6)`, [key,partner,id,order,details,employee]);
    await insert('good');
    await assert.rejects(insert('other-partner',12));
    await assert.rejects(insert('other-employee',11,21));
    await assert.rejects(insert('other-order',11,20,31));
    await assert.rejects(insert('missing-details',11,20,30,'{}'));
    await assert.rejects(insert('good'));
    await assert.rejects(db.exec(`UPDATE "PartnerTransactionCost" SET amount=1`));
    await assert.rejects(db.exec(`DELETE FROM "PartnerTransactionCost"`));
    await db.exec(`UPDATE "OutsourcingServiceType" SET "entryMode"='PROCESS' WHERE id=${id}`);
    await assert.rejects(insert('process-bypass'));
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM "PartnerTransactionCost"`)).rows[0].count, 1);
  } finally { await db.close(); }
});

test('partner mutations require system administrator, production input remains registered', () => {
  const source = fs.readFileSync('backend/src/index.ts','utf8');
  assert.match(source, /type === "PROCESS_OUTSOURCING" && !\(await requireSystemAdmin/);
  assert.match(source, /existing\.type === "PROCESS_OUTSOURCING" \|\| type === "PROCESS_OUTSOURCING"/);
  const router = fs.readFileSync('frontend/src/router.jsx','utf8');
  assert.match(router, /path: 'outsourcing-record\/new',[\s\S]*?WorkEntry recordKind="OUTSOURCING"/);
});
