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
});

test('runtime migration stages legacy FK validation without weakening new writes', async () => {
  const migration = await read('backend/migration_fix.sql');
  assert.match(migration, /BEGIN;[\s\S]*WorkRecord_assignmentPlan_org_fkey[\s\S]*COMMIT;/);
  assert.match(migration, /WorkRecord_style_org_fkey[\s\S]*ON DELETE RESTRICT NOT VALID/);
  assert.match(migration, /WorkRecord_styleProcess_style_org_fkey[\s\S]*ON DELETE RESTRICT NOT VALID/);
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
