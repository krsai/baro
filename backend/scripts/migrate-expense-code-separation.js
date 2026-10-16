// Only this additive migration; never run the entire historical migration_fix.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');
async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw Error('Session database URL required');
  assertSafeApplicationDatabaseEnv({ DATABASE_URL: url, DIRECT_URL: url });
  const apply = process.argv.includes('--apply');
  const sql = fs.readFileSync(path.join(__dirname,'../prisma/migrations/20261016090000_expense_code_separation/migration.sql'),'utf8');
  const tables = ['PartnerTransactionCost','OutsourcedWorkRecord','WorkLog','AssignmentPlan','WorkOrder','Invoice','AttendanceEntry','Employee','TransactionCode','SettingTransactionCodeDefault','OrganizationOutsourcingServiceType','Organization','SettingServiceDefault','OutsourcingServiceType','TransactionCodeBase'];
  const hash = table => {
    const extra = table === 'Organization' ? ` - 'partnerExpenseTypeId'` : table === 'TransactionCodeBase' ? ` - ARRAY['expenseTypeId','entryMode','requiredFields','orderInput','styleInput','processInput']::text[]` : '';
    return `SELECT md5(coalesce(string_agg((to_jsonb(row)${extra})::text, '' ORDER BY (to_jsonb(row)${extra})::text),'')) FROM "${table}" row`;
  };
  const before = `CREATE TEMP TABLE expense_preservation(table_name text, digest text) ON COMMIT DROP;\n` + tables.map(table => `INSERT INTO expense_preservation SELECT '${table}',(${hash(table)});`).join('\n');
  const after = tables.map(table => `IF (SELECT digest FROM expense_preservation WHERE table_name='${table}') IS DISTINCT FROM (${hash(table)}) THEN RAISE EXCEPTION 'Business data changed: ${table}'; END IF;`).join('\n');
  const transaction = `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='90s';\n${before}\n${sql}\nDO $verify$ BEGIN ${after} END $verify$;\n${apply ? 'COMMIT' : 'ROLLBACK'};`;
  const result = spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../prisma/schema.prisma')], { env: { ...process.env, DATABASE_URL:url,DIRECT_URL:url }, input:transaction,encoding:'utf8' });
  if (result.status !== 0) { console.error((result.stderr || result.stdout).replaceAll(url,'[database]')); throw Error('Migration failed'); }
  console.log(JSON.stringify({ mode:apply?'apply':'rollback-validation', businessTablesPreserved:tables.length }));
  if (apply) {
    const db = new PrismaClient({ datasourceUrl:url });
    try { console.log(JSON.stringify({ verified: await db.$queryRawUnsafe(`SELECT (SELECT count(*)::int FROM "ExpenseType") AS types,(SELECT count(*)::int FROM "TransactionCodeBase" WHERE "expenseTypeId" IS NOT NULL) AS bases,(SELECT count(*)::int FROM "Organization" WHERE "partnerExpenseTypeId" IS NOT NULL) AS partners`) })); }
    finally { await db.$disconnect(); }
  }
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
