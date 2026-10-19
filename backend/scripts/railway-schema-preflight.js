// Deployment-only fallback: this service's Railway settings skip preDeployCommand.
// Local npm start and start:api never migrate. No historical repairs or db push.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');

const columns = [
  ...['id','orgId','partnerOrgId','createdByEmployeeId','requestDate','title','currency','clientKey','submissionHash','createdAt'].map(column => ['ExpenseRequest',column]),
  ['PartnerTransactionCost','expenseRequestId'], ['PartnerTransactionCost','expenseRequestLine'],
];
const constraints = ['ExpenseRequest_id_orgId_partnerOrgId_key','ExpenseRequest_orgId_clientKey_key','ExpenseRequest_orgId_fkey',
  'ExpenseRequest_partnerOrgId_orgId_fkey','ExpenseRequest_createdByEmployeeId_orgId_fkey',
  'PartnerTransactionCost_expense_request_fkey','PartnerTransactionCost_expenseRequestId_expenseRequestLine_key','ExpenseRequestLine_pair_check',
  'ExpenseRequestEdit_cost_audit','ExpenseRequestEdit_production_audit'];

async function missingSchema(db) {
  const existingColumns = await db.$queryRawUnsafe(`SELECT table_name,column_name,is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('ExpenseRequest','PartnerTransactionCost')`);
  const existingConstraints = await db.$queryRawUnsafe(`SELECT conname AS name,array_length(conkey,1) AS column_count FROM pg_constraint WHERE connamespace='public'::regnamespace
    UNION SELECT indexname AS name,NULL::integer AS column_count FROM pg_indexes WHERE schemaname='public'`);
  const columnSet = new Set(existingColumns.map(row => `${row.table_name}.${row.column_name}`));
  const constraintSet = new Set(existingConstraints.map(row => row.name));
  return [...columns.filter(([table,column]) => !columnSet.has(`${table}.${column}`)).map(([table,column]) => `${table}.${column}`),
    ...constraints.filter(name => !constraintSet.has(name)),
    ...existingColumns.filter(row=>row.table_name==='ExpenseRequest'&&row.column_name==='currency'&&row.is_nullable==='NO').map(()=> 'ExpenseRequest.currency:nullable'),
    ...existingConstraints.filter(row=>row.name==='PartnerTransactionCost_expense_request_fkey'&&row.column_count===4).map(()=> 'PartnerTransactionCost.expenseRequest:line-currency')];
}

async function runRailwayPreflight({ env = process.env, run = spawnSync, createClient, log = console.log } = {}) {
  if (!env.RAILWAY_ENVIRONMENT_ID || !env.RAILWAY_SERVICE_ID) {
    log('[railway-schema] Skipped outside Railway. API startup remains read-only.');
    return;
  }
  const url = String(env.DIRECT_URL || env.DATABASE_URL || '').trim();
  if (!url) throw new Error('[railway-schema] Railway application database URL is missing.');
  assertSafeApplicationDatabaseEnv(env);
  const db = createClient ? createClient(url) : new (require('@prisma/client').PrismaClient)({ datasourceUrl: url });
  try {
    if (!(await missingSchema(db)).length) {
      log('[railway-schema] Expense document schema already prepared.');
      return;
    }
    log('[railway-schema] Preparing missing expense document schema. Existing cost and production values are preserved.');
    const sql = ['apply-expense-request-documents.sql','apply-expense-request-editor.sql'].map(file=>fs.readFileSync(path.join(__dirname,file),'utf8')).join('\n');
    const result = await run(process.execPath, [require.resolve('prisma/build/index.js'), 'db','execute','--stdin','--schema',path.join(__dirname,'../prisma/schema.prisma')], {
      cwd: path.resolve(__dirname,'..'), env: { ...env, DATABASE_URL: url, DIRECT_URL: url },
      encoding: 'utf8', stdio: 'pipe', timeout: 90000,
      input: `BEGIN; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='60s';
        SELECT pg_advisory_xact_lock(2026101701);
        ${sql}
        COMMIT;`,
    });
    // Prisma diagnostics may contain connection credentials. Never echo subprocess output.
    if (result.error || result.signal || result.status !== 0) throw new Error('[railway-schema] Expense schema preparation failed. API will not start. Check database connectivity, DDL permissions and lock contention.');
    if ((await missingSchema(db)).length) throw new Error('[railway-schema] Required expense schema is still missing after preparation. API will not start.');
    log('[railway-schema] Expense document schema prepared and verified.');
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) runRailwayPreflight().catch(error => {
  console.error(error.message?.startsWith('[railway-schema]') || error.message?.startsWith('[database-target]')
    ? error.message : '[railway-schema] Database preflight failed. API will not start. Check deployment database connectivity and permissions.');
  process.exitCode = 1;
});
module.exports = { runRailwayPreflight, missingSchema, columns, constraints };
