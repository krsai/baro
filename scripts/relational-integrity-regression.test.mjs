import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('WorkRecord canonical relations are required and cross-org constrained', async () => {
  const schema = await read('backend/prisma/schema.prisma');
  assert.match(schema, /assignmentPlanId\s+Int\b/);
  assert.match(schema, /styleId\s+Int\b/);
  assert.match(schema, /styleProcessId\s+Int\b/);
  assert.match(schema, /fields: \[assignmentPlanId, orgId\]/);
  assert.match(schema, /fields: \[styleProcessId, styleId, orgId\]/);
  assert.match(schema, /style\s+Style\s+@relation\(fields: \[styleId\], references: \[id\]/);
});

test('runtime migration validates the canonical FK set atomically', async () => {
  const migration = await read('backend/migration_fix.sql');
  assert.match(migration, /BEGIN;[\s\S]*WorkRecord_assignmentPlan_org_fkey[\s\S]*COMMIT;/);
  assert.match(migration, /WorkRecord_styleId_fkey[\s\S]*ON DELETE RESTRICT/);
  assert.match(migration, /WorkRecord_styleProcess_style_org_fkey[\s\S]*ON DELETE RESTRICT/);
  assert.doesNotMatch(migration, /WorkRecord_(?:assignmentPlan_org|styleProcess_style_org)_fkey[\s\S]{0,200}NOT VALID/);
});

test('warehouse localized names are covered by runtime drift recovery', async () => {
  const [migration, backend] = await Promise.all([
    read('backend/migration_fix.sql'),
    read('backend/src/index.ts'),
  ]);
  assert.match(
    migration,
    /ALTER TABLE "Warehouse"[\s\S]*ADD COLUMN IF NOT EXISTS "nameKo" TEXT[\s\S]*ADD COLUMN IF NOT EXISTS "nameVi" TEXT/
  );
  assert.match(backend, /tableName: "Warehouse", columnName: "nameKo"/);
  assert.match(backend, /tableName: "Warehouse", columnName: "nameVi"/);
});

test('runtime migration has balanced, non-nested anonymous PostgreSQL blocks', async () => {
  const migration = await read('backend/migration_fix.sql');
  let anonymousBlockOpen = false;

  migration.split(/\r?\n/).forEach((line, index) => {
    if (/\bDO \$\$/.test(line)) {
      assert.equal(
        anonymousBlockOpen,
        false,
        `nested DO $$ block starts at migration_fix.sql:${index + 1}`
      );
      anonymousBlockOpen = true;
    }
    if (/\bEND \$\$;/.test(line)) {
      assert.equal(
        anonymousBlockOpen,
        true,
        `unmatched END $$ at migration_fix.sql:${index + 1}`
      );
      anonymousBlockOpen = false;
    }
  });

  assert.equal(anonymousBlockOpen, false, 'migration_fix.sql has an unclosed DO $$ block');
});

test('line and factory deletion never detach WorkRecords', async () => {
  const [lines, factories] = await Promise.all([
    read('backend/src/lines/line.routes.ts'),
    read('backend/src/factories/factory.routes.ts'),
  ]);
  for (const source of [lines, factories]) {
    assert.doesNotMatch(source, /data:\s*\{\s*assignmentPlanId:\s*null/);
    assert.match(source, /workRecord\.count/);
    assert.match(source, /createHttpError\(409/);
  }
});

test('dashboard order KPI uses the WorkOrder FK only', async () => {
  const dashboard = await read('frontend/src/pages/App/WorkspaceDashboard.jsx');
  const resolver = dashboard.match(
    /const resolveAssignmentOrderKey = \(assignment\) => \{[\s\S]*?\n\};/
  )?.[0];
  assert.ok(resolver);
  assert.match(resolver, /assignment\?\.workOrderId/);
  assert.doesNotMatch(resolver, /originOrderId|cardId|orderNo|split/);
});

test('WorkRecord normalization loads customer-owned Styles by canonical PK', async () => {
  const backend = await read('backend/src/index.ts');
  const start = backend.indexOf('const syncWorkRecordRefs = async (');
  const end = backend.indexOf('const resolveAssignmentPlanStyleMetaById', start);
  assert.ok(start >= 0 && end > start);
  const helper = backend.slice(start, end);
  assert.match(helper, /prisma\.style\.findMany\(\{\s*where: \{ id: \{ in: styleIds \} \}/);
  assert.doesNotMatch(helper, /prisma\.style\.findMany\(\{[\s\S]{0,160}orgId/);
  assert.doesNotMatch(helper, /linkedStyle\?\.(?:code|name) \?\? record\?\.style/);
  assert.doesNotMatch(helper, /planStyleMeta\?\.styleId \?\? recordStyleId/);
});

test('AssignmentPlan timestamps are automatic and split quantity drift is rejected', async () => {
  const [schema, backend] = await Promise.all([
    read('backend/prisma/schema.prisma'),
    read('backend/src/index.ts'),
  ]);
  const model = schema.match(/model AssignmentPlan \{[\s\S]*?\n\}/)?.[0];
  assert.ok(model);
  assert.match(model, /updatedAt\s+DateTime\s+@updatedAt/);
  assert.doesNotMatch(backend, /if \(group\.length > 1\) return/);
  assert.match(backend, /split across multiple assignment plans/);
  const start = backend.indexOf('const syncAssignmentPlansForOrderLock = async (');
  const end = backend.indexOf('const buildOrderModificationLockState', start);
  assert.ok(start >= 0 && end > start);
  const helper = backend.slice(start, end);
  assert.doesNotMatch(
    helper,
    /if \(annotatedPlan\.isCompleted === true \|\| annotatedPlan\.isPayrollLocked\) return;/
  );
  assert.doesNotMatch(helper, /resolveAssignmentQuantity\(row\) \?\? 0/);
  assert.match(helper, /missing assignmentQuantity/);
  assert.match(helper, /completed or payroll-locked assignment/);
});

test('WorkRecord canonical style display never falls back to request text', async () => {
  const backend = await read('backend/src/index.ts');
  const start = backend.indexOf('const attachCanonicalFieldsToWorkRecords = async (');
  const end = backend.indexOf('const collectWorkLogCrossLineAssignmentWarnings', start);
  assert.ok(start >= 0 && end > start);
  const helper = backend.slice(start, end);
  assert.doesNotMatch(helper, /planStyleMeta\?\.styleCode \?\? record\?\.styleCode/);
  assert.doesNotMatch(helper, /planStyleMeta\?\.styleName \?\? record\?\.styleName/);
});

test('scheduler never treats the first visible day as today', async () => {
  const board = await read('frontend/src/pages/App/assign/AssignBoard.jsx');
  const helper = board.match(
    /const getTodayDayIndex = \(days, targetDate = new Date\(\)\) => \{[\s\S]*?\n\};/
  )?.[0];
  assert.ok(helper);
  assert.match(helper, /index >= 0 \? index : null/);
});
