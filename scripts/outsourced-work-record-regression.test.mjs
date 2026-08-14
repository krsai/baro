import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [schema, migration, partnerMigration, migrationFix, backend, payroll, page, partnerPage, router, layout] = await Promise.all([
  readFile(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8'),
  readFile(new URL('../backend/prisma/migrations/20260814090000_add_outsourced_work_records/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../backend/prisma/migrations/20260814170000_add_business_partners/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../backend/migration_fix.sql', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/payroll/payroll.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/work/WorkDetail.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/BusinessPartners.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/router.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/layouts/MainLayout.jsx', import.meta.url), 'utf8'),
]);

test('outsourced work records preserve vendor and unit-price snapshots', () => {
  assert.match(schema, /isOutsourced\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /outsourceVendorName\s+String\?/);
  assert.match(schema, /outsourceUnitPrice\s+Decimal\?/);
  assert.match(migration, /WorkRecord_outsource_actor_check/);
  assert.match(migrationFix, /ADD COLUMN IF NOT EXISTS "isOutsourced"/);
  assert.match(migrationFix, /WorkRecord_outsource_actor_check/);
  assert.match(backend, /\{ tableName: "WorkRecord", columnName: "isOutsourced" \}/);
  assert.match(backend, /"WorkRecord_outsource_actor_check"/);
});

test('outsourced output remains in progress but is excluded at AT and payroll sources', () => {
  assert.match(backend, /isOutsourced:\s*false/);
  assert.match(backend, /must never enter AT training allocation/);
  assert.match(payroll, /where:\s*\{ isOutsourced: false \}/);
});

test('worker picker exposes visually distinct outsourced entry and price', () => {
  assert.match(page, /name: '＋ 외주 업체'/);
  assert.match(page, /\.\.\.outsourcingPartners\.map/);
  assert.doesNotMatch(page, /if \(lineWorkers\.length === 0\) \{\s*setRows\(\[\]\)/);
  assert.match(page, /return selectedLineId \? \[createBlankRow\(\)\] : \[\]/);
  assert.match(page, /외주 개당 단가/);
  assert.match(page, /warning\.main/);
});

test('process outsourcing partners are organization-scoped and linked by id with snapshots', () => {
  assert.match(schema, /model BusinessPartner/);
  assert.match(schema, /PROCESS_OUTSOURCING/);
  assert.match(schema, /outsourcingPartnerId\s+Int\?/);
  assert.match(partnerMigration, /CREATE TABLE "BusinessPartner"/);
  assert.match(partnerMigration, /WorkRecord_outsourcingPartnerId_fkey/);
  assert.match(backend, /app\.post\("\/business-partners"/);
  assert.match(backend, /app\.get\("\/business-partners\/:id\/history"/);
  assert.match(page, /outsourcingPartnerId: row\?\.worker\?\.isOutsourced/);
  assert.match(page, /type: 'PROCESS_OUTSOURCING'/);
});

test('sales partner screen lists process outsourcing partners and exposes history', () => {
  assert.match(partnerPage, /title="거래처"/);
  assert.match(partnerPage, /외주 작업 이력/);
  assert.match(partnerPage, /record\.unitPrice/);
  assert.match(partnerPage, /record\.quantity/);
  assert.match(router, /path: 'business-partner'/);
  assert.match(layout, /path: '\/business-partner'/);
});

test('work detail truncates worker names with a tooltip and hides the wage display', () => {
  assert.match(page, /<Tooltip title=\{toText\(row\?\.worker\?\.name\) \|\| '-'\}/);
  assert.match(page, /textOverflow: 'ellipsis'/);
  assert.doesNotMatch(page, /<TextField label=\{LABELS\.wagePerSecond\}/);
});
