import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [schema, migration, backend, payroll, page] = await Promise.all([
  readFile(new URL('../backend/prisma/schema.prisma', import.meta.url), 'utf8'),
  readFile(new URL('../backend/prisma/migrations/20260814090000_add_outsourced_work_records/migration.sql', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../backend/src/payroll/payroll.service.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frontend/src/pages/App/work/WorkDetail.jsx', import.meta.url), 'utf8'),
]);

test('outsourced work records preserve vendor and unit-price snapshots', () => {
  assert.match(schema, /isOutsourced\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /outsourceVendorName\s+String\?/);
  assert.match(schema, /outsourceUnitPrice\s+Decimal\?/);
  assert.match(migration, /WorkRecord_outsource_actor_check/);
});

test('outsourced output remains in progress but is excluded at AT and payroll sources', () => {
  assert.match(backend, /isOutsourced:\s*false/);
  assert.match(backend, /must never enter AT training allocation/);
  assert.match(payroll, /where:\s*\{ isOutsourced: false \}/);
});

test('worker picker exposes visually distinct outsourced entry and price', () => {
  assert.match(page, /＋ 외주 업체 입력/);
  assert.match(page, /외주 개당 단가/);
  assert.match(page, /warning\.main/);
});
