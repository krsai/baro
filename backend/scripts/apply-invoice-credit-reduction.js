// Additive schema only. Never invokes the full historical migration_fix.sql.
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');
async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw Error('Explicit session database URL required');
  assertSafeApplicationDatabaseEnv({ DATABASE_URL: url, DIRECT_URL: url });
  const sql = readFileSync(path.join(__dirname, '../migration_fix.sql'), 'utf8');
  const section = (start, end) => {
    const first = sql.indexOf(start), last = sql.indexOf(end, first);
    if (first < 0 || last <= first) throw Error('Migration boundaries missing');
    return sql.slice(first, last);
  };
  const changes = section('CREATE OR REPLACE FUNCTION baro_assert_invoice_final_unlocked', 'CREATE OR REPLACE FUNCTION baro_guard_locked_work_order')
    + section('-- Immutable credit notes reduce receivables', '-- Factory-owned rows');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const before = await db.$queryRawUnsafe(`SELECT to_regclass('public."InvoiceCredit"')::text AS credits,
      to_regclass('public."OrderQuantityChange"')::text AS reductions`);
    console.log(JSON.stringify({ mode: process.argv.includes('--apply') ? 'apply' : 'dry-run', schema: before }));
    if (!process.argv.includes('--apply')) return;
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--stdin', '--schema', path.join(__dirname, '../prisma/schema.prisma')], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, encoding: 'utf8',
      input: `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';\n${changes}\nCOMMIT;`,
    });
    if (result.status !== 0) throw Error('Invoice schema application failed (no credentials logged)');
    const verified = await db.$queryRawUnsafe(`SELECT to_regclass('public."InvoiceCredit"')::text AS credits,
      to_regclass('public."OrderQuantityChange"')::text AS reductions,
      position('FOR UPDATE' in pg_get_functiondef('baro_assert_invoice_final_unlocked(integer)'::regprocedure)) > 0 AS serialized`);
    if (!verified[0]?.credits || !verified[0]?.reductions || !verified[0]?.serialized) throw Error('Schema verification failed');
    console.log(JSON.stringify({ verified }));
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error('Invoice schema operation failed. Check connection and schema; no business data is modified by this script.'); process.exitCode = 1; });
