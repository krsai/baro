import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import service from '../backend/dist/services/priorProductionCompletion.js';
import invoice from '../backend/dist/services/invoiceOrderProgress.js';
const { summarizePriorProduction: summarize, validatePriorPeriod, registerPriorCompletion } = service;
const prior = quantity => [{ quantity, canceledAt: null }];

test('full historical completion needs no invented process/worker observations', () => {
  assert.deepEqual(summarize(440, [], prior(440)), { priorQuantity: 440, producedQuantity: 440, progressPercent: 100, isCompleted: true });
  const row = { plannedQuantity: 440, producedQuantity: 0, operationalProgressRatio: 0, isProgressUnknown: true };
  assert.equal(summarize(440, [row], prior(440)).isCompleted, true);
  assert.equal(summarize(440, [row], prior(440)).producedQuantity, 440);
});
test('partial completion adds distinct recorded production and cannot claim missing work as completed', () => {
  const row = { plannedQuantity: 100, producedQuantity: 50, operationalProgressRatio: 0.5 };
  assert.equal(summarize(100, [row], prior(20)).producedQuantity, 70);
  assert.equal(summarize(100, [row], prior(20)).progressPercent, 70);
  assert.equal(summarize(100, [row], prior(20)).isCompleted, false);
  assert.equal(summarize(100, [], prior(20)).progressPercent, 20);
});
test('later manual completion does not count baseline a second time, but actual excess remains visible', () => {
  const row = { plannedQuantity: 100, producedQuantity: 80, isCompleted: true, completionTargetQuantity: 100 };
  assert.equal(summarize(100, [row], prior(20)).producedQuantity, 100);
  assert.equal(summarize(100, [{ ...row, producedQuantity: 105 }], prior(20)).producedQuantity, 125);
  assert.equal(summarize(100, [], [{ quantity: 100, canceledAt: new Date() }]).priorQuantity, 0);
});
test('order aggregation credits all three historical styles without altering ordinary styles', () => {
  const order = { id: 1, totalQuantity: 2245, workOrderItems: [{ styleId: 1, totalQuantity: 1500 }, { styleId: 2, totalQuantity: 440 }, { styleId: 3, totalQuantity: 200 }, { styleId: 4, totalQuantity: 105 }],
    priorCompletions: [{ styleId: 2, quantity: 440 }, { styleId: 3, quantity: 200 }, { styleId: 4, quantity: 105 }] };
  const plans = [{ externalId: 'p', workOrderId: 1, styleId: 1 }];
  const progress = [{ id: 'p', plannedQuantity: 1500, completionTargetQuantity: 1500, producedQuantity: 0, isCompleted: true }];
  const result = invoice.invoiceOrderProgress(order, plans, progress);
  assert.equal(result.producedQuantity, 2245); assert.equal(result.progressPercent, 100);
  const unknown = invoice.invoiceOrderProgress(order, plans, [{ id: 'p', plannedQuantity: 1500, isProgressUnknown: true }]);
  assert.equal(unknown.producedQuantity, null); assert.equal(unknown.progressPercent, null);
});
test('period validates real dates and preserves month-only precision', () => {
  assert.equal(validatePriorPeriod('2026-03'), '2026-03');
  assert.equal(validatePriorPeriod('2026-03-31'), '2026-03-31');
  for (const value of ['2026-02-31', '2026-03-99', '2026-13', '2099-01', 'March', null]) assert.throws(() => validatePriorPeriod(value));
});

test('registration uses authenticated employee FK and enforces retry identity, quantity and lock checks', async () => {
  const stored = [];
  let locked = false, closed = false;
  const order = { id: 1, updatedAt: new Date('2026-01-01'), workOrderItems: [{ styleId: 1, totalQuantity: 100 }] };
  const db = {
    $queryRaw: async () => [],
    workOrder: { findFirst: async () => ({ ...order, invoiceFinalLockedAt: locked ? new Date() : null }), update: async () => order },
    employee: { findFirst: async ({ where }) => where.id === 7 && where.orgId === 1 ? { id: 7 } : null },
    priorCompletionReason: { findFirst: async ({ where }) => where.id === 17 ? { id: 17 } : null },
    assignmentPlan: { count: async () => closed ? 1 : 0 },
    priorProductionCompletion: {
      findUnique: async ({ where }) => stored.find(row => row.clientKey === where.orgId_clientKey.clientKey),
      aggregate: async () => ({ _sum: { quantity: stored.reduce((s, row) => s + row.quantity, 0) } }),
      create: async ({ data }) => { stored.push(data); return data; },
    },
  };
  const input = { workOrderId: 1, styleId: 1, quantity: 60, reasonId: 17, clientKey: 'stable-client-key', completedPeriod: '2026-03', acknowledgeSeparateRecords: true, createdByEmployeeId: 999 };
  const result = await registerPriorCompletion(db, 1, 7, input);
  assert.equal(result.createdByEmployeeId, 7);
  await registerPriorCompletion(db, 1, 7, input); assert.equal(stored.length, 1);
  await assert.rejects(registerPriorCompletion(db, 1, 7, { ...input, quantity: 61 }), /PRIOR_RETRY_MISMATCH/);
  await assert.rejects(registerPriorCompletion(db, 1, 999, input), /ACTIVE_EMPLOYEE_REQUIRED/);
  await assert.rejects(registerPriorCompletion(db, 1, 7, { ...input, clientKey: 'new-client-key', quantity: 50 }), /PRIOR_QUANTITY_EXCEEDS_ORDER/);
  closed = true;
  await assert.rejects(registerPriorCompletion(db, 1, 7, { ...input, clientKey: 'another-client-key', quantity: 10 }), /EXISTING_COMPLETION_REQUIRES_REVIEW/);
  closed = false; locked = true;
  await assert.rejects(registerPriorCompletion(db, 1, 7, input), /ORDER_FINALLY_LOCKED/);
  await assert.rejects(registerPriorCompletion(db, 1, 7, { ...input, quantity: '60' }), /INVALID_PRIOR_COMPLETION/);
  await assert.rejects(registerPriorCompletion(db, 1, 7, { ...input, acknowledgeSeparateRecords: false }), /SEPARATE_RECORDS_CONFIRMATION_REQUIRED/);
});

test('actual PostgreSQL-compatible ledger constraints enforce tenant FKs, immutable history and locks', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "WorkOrder" (id INT PRIMARY KEY, "orgId" INT NOT NULL, "invoiceFinalLockedAt" TIMESTAMP);
      CREATE TABLE "Style" (id INT PRIMARY KEY, "orgId" INT NOT NULL);
      CREATE TABLE "Employee" (id INT PRIMARY KEY, "orgId" INT NOT NULL);
      CREATE TABLE "WorkOrderItem" (id INT PRIMARY KEY, "workOrderId" INT, "styleId" INT);
      INSERT INTO "WorkOrder" VALUES (1,1,NULL),(2,2,NULL); INSERT INTO "Style" VALUES (1,1),(2,2),(3,1);
      INSERT INTO "Employee" VALUES (1,1),(2,2); INSERT INTO "WorkOrderItem" VALUES (1,1,1),(2,2,2);`);
    const sql = fs.readFileSync('backend/prisma/migrations/20261009180000_prior_production_completion/migration.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    const insert = (id, orgId = 1, employeeId = 1, styleId = 1, reasonId = 1) => db.query(`INSERT INTO "PriorProductionCompletion" (id,"orgId","workOrderId","styleId",quantity,"completedPeriod","reasonId","clientKey","createdByEmployeeId") VALUES ($1,$2,1,$3,440,'2026-03',$4,$1,$5)`, [id,orgId,styleId,reasonId,employeeId]);
    await insert('valid');
    await assert.rejects(insert('bad-actor',1,2));
    await assert.rejects(insert('bad-org',2,2));
    await assert.rejects(insert('bad-style',1,1,2));
    await assert.rejects(insert('not-in-order',1,1,3));
    await assert.rejects(insert('bad-reason',1,1,1,999));
    await assert.rejects(insert('valid'));
    await assert.rejects(db.exec(`DELETE FROM "Employee" WHERE id=1`));
    await assert.rejects(db.exec(`DELETE FROM "Style" WHERE id=1`));
    await assert.rejects(db.exec(`DELETE FROM "WorkOrderItem" WHERE id=1`));
    await assert.rejects(db.exec(`UPDATE "PriorProductionCompletion" SET quantity=441 WHERE id='valid'`));
    await assert.rejects(db.exec(`DELETE FROM "PriorProductionCompletion" WHERE id='valid'`));
    await db.exec(`UPDATE "WorkOrder" SET "invoiceFinalLockedAt"=CURRENT_TIMESTAMP WHERE id=1`);
    await assert.rejects(insert('locked'));
    await assert.rejects(db.exec(`UPDATE "PriorProductionCompletion" SET "canceledAt"=CURRENT_TIMESTAMP,"canceledByEmployeeId"=1,"cancellationNote"='correction' WHERE id='valid'`));
    await db.exec(`UPDATE "WorkOrder" SET "invoiceFinalLockedAt"=NULL WHERE id=1`);
    await assert.rejects(db.exec(`UPDATE "PriorProductionCompletion" SET "canceledAt"=CURRENT_TIMESTAMP,"canceledByEmployeeId"=1 WHERE id='valid'`));
    await db.exec(`UPDATE "PriorProductionCompletion" SET "canceledAt"=CURRENT_TIMESTAMP,"canceledByEmployeeId"=1,"cancellationNote"='correction' WHERE id='valid'`);
    await assert.rejects(db.exec(`UPDATE "PriorProductionCompletion" SET "cancellationNote"='changed' WHERE id='valid'`));
    const result = await db.query(`SELECT * FROM "PriorProductionCompletion" WHERE id='valid'`);
    assert.equal(result.rows[0].createdByEmployeeId, 1); assert.ok(result.rows[0].canceledAt);
  } finally { await db.close(); }
});
