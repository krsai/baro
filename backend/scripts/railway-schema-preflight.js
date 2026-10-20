// Deployment-only fallback: this service's Railway settings skip preDeployCommand.
// Local npm start and start:api never migrate. No historical repairs or db push.
const { runExpenseMigrations } = require('./migrate-expenses');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');

const columns = [
  ...['id','orgId','partnerOrgId','createdByEmployeeId','requestDate','title','currency','clientKey','submissionHash','createdAt'].map(column => ['ExpenseRequest',column]),
  ...['version','updatedAt','updatedByEmployeeId'].map(column=>['ExpenseRequest',column]),
  ['ExpenseRequestAudit','requestId'], ['ExpenseSchemaMigration','version'],
  ['PartnerTransactionCost','expenseRequestId'], ['PartnerTransactionCost','expenseRequestLine'],
];
const constraints = ['ExpenseRequest_id_orgId_partnerOrgId_key','ExpenseRequest_orgId_clientKey_key','ExpenseRequest_orgId_fkey',
  'ExpenseRequest_partnerOrgId_orgId_fkey','ExpenseRequest_createdByEmployeeId_orgId_fkey',
  'PartnerTransactionCost_expense_request_fkey','PartnerTransactionCost_expenseRequestId_expenseRequestLine_key','ExpenseRequestLine_pair_check',
  'ExpenseRequestEdit_cost_audit','ExpenseRequestEdit_production_audit','TransactionCost_style_scope_fkey','ExpenseRequestAudit_requestId_orgId_fkey','ExpenseRequestAudit_actorId_orgId_fkey','ExpenseRequestAudit_requestId_version_key','ExpenseRequest_write_guard','ExpenseRequest_audit_guard','ExpenseRequestAudit_append_only','baro_transaction_cost_guard','baro_request_production_guard'];

async function missingSchema(db) {
  const existingColumns = await db.$queryRawUnsafe(`SELECT table_name,column_name,is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('ExpenseRequest','PartnerTransactionCost','ExpenseRequestAudit','ExpenseSchemaMigration')`);
  const existingConstraints = await db.$queryRawUnsafe(`SELECT conname AS name,array_length(conkey,1) AS column_count,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace
    UNION SELECT indexname AS name,NULL::integer AS column_count,NULL::text AS definition FROM pg_indexes WHERE schemaname='public'
    UNION SELECT tgname AS name,NULL::integer AS column_count,NULL::text AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D'`);
  const columnSet = new Set(existingColumns.map(row => `${row.table_name}.${row.column_name}`));
  const constraintSet = new Set(existingConstraints.map(row => row.name));
  return [...columns.filter(([table,column]) => !columnSet.has(`${table}.${column}`)).map(([table,column]) => `${table}.${column}`),
    ...constraints.filter(name => !constraintSet.has(name)),
    ...existingConstraints.filter(row=>row.name==='TransactionCost_style_scope_fkey'&&!String(row.definition).includes('REFERENCES "Style"(id, "orgId")')).map(()=> 'TransactionCost_style_scope_fkey:manufacturer'),
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
    await runExpenseMigrations({env,run,db,log});
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
