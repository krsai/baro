import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { shiftVersionMonth, versionTimelineMonths } from '../frontend/src/utils/versionApplication.mjs';
const require = createRequire(import.meta.url);
const { resolveVersionStartMonth, compareVersionStarts } = require('../backend/dist/utils/versionApplication.js');

test('new versions default to a valid current month and reject invalid explicit dates', () => {
  assert.match(resolveVersionStartMonth(), /^\d{4}-(0[1-9]|1[0-2])$/);
  assert.equal(resolveVersionStartMonth('2026-11'), '2026-11');
  assert.throws(() => resolveVersionStartMonth('2026-13'));
  assert.equal(shiftVersionMonth('2026-12', 1), '2027-01');
  assert.deepEqual(versionTimelineMonths(['2026-09'], '2026-10', { 3: '2027-02' }), ['2026-09', '2026-10', '2026-11', '2027-02']);
});

test('same-month revisions retain history while the newest version takes precedence', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE "SalarySystemVersion" ("id" serial, "factoryId" int, "effectiveMonth" text, "versionNumber" int, "snapshot" jsonb);
      CREATE UNIQUE INDEX "SalarySystemVersion_factoryId_effectiveMonth_key" ON "SalarySystemVersion"("factoryId","effectiveMonth");
      CREATE TABLE "FactoryProductionAllowanceRate" ("factoryId" int, "effectiveMonth" text);
      CREATE UNIQUE INDEX "FactoryProductionAllowanceRate_factoryId_effectiveMonth_key" ON "FactoryProductionAllowanceRate"("factoryId","effectiveMonth");
      INSERT INTO "SalarySystemVersion" VALUES (1,1,'2026-10',1,'{"wage":100}');`);
    const sql = readFileSync('backend/prisma/migrations/20261014150000_version_default_application/migration.sql', 'utf8');
    await db.exec(sql);
    await db.exec(`INSERT INTO "SalarySystemVersion" VALUES (2,1,'2026-10',2,'{"wage":200}');`);
    await db.exec(sql);
    const { rows } = await db.query(`SELECT * FROM "SalarySystemVersion" WHERE "effectiveMonth" <= '2026-11' ORDER BY "effectiveMonth" DESC,"versionNumber" DESC`);
    assert.equal(rows[0].versionNumber, 2);
    assert.deepEqual(rows[1].snapshot, { wage: 100 });
    const versions = new Map(rows.map(row => [row.id, row]));
    assert.deepEqual([{ versionId: 2, startMonth: '2026-10' }, { versionId: 1, startMonth: '2026-10' }].sort((a,b) => compareVersionStarts(a,b,versions)).map(row=>row.versionId), [1,2]);
  } finally { await db.close(); }
});
