const { runEntityProfileMigrations } = require('./migrate-entity-profiles');
// Deployment-only fallback: this service's Railway settings skip preDeployCommand.
// Local npm start and start:api never migrate. No historical repairs or db push.
const { runExpenseMigrations } = require('./migrate-expenses');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');

const columns = [
  ['TransactionCodeBase','industryRevision'],['AccountingCodeIndustry','baseId'],['AccountingCodeIndustry','systemIndustryId'],
  ...['orgId','entityId','revision','updatedByEmployeeId'].map(column=>['PartnerClassification',column]),...['orgId','entityId','systemIndustryId'].map(column=>['PartnerClassificationIndustry',column]),
  ['LedgerChangeAcknowledgement','employeeId'],['LedgerChangeAcknowledgement','confirmedAt'],['BankLedgerEntry','revisesEntryId'],['ExpenseCodeLinkPolicy','inputSettings'],['ExpenseCodeLinkAudit','inputSettings'],['BankLedgerEntry','accountingCodeId'],['BankLedgerSettlementLine','accountingCodeId'],['ExpenseRequest','payeeEmployeeId'],['PartnerTransactionCost','payeeEmployeeId'],...['id','orgId','employeeId','currencyCode','bankName','accountNumber','accountHolder','createdByEmployeeId'].map(column=>['EmployeeExpenseBankAccount',column]),['BankLedgerEntry','writeOffAmount'],['BankLedgerEntry','settlementMode'],['BankLedgerSettlementLine','entryId'],['ExpenseApprovalDecision','decision'],['ExpenseApprovalDecision','reason'],['ExpenseUnit','id'],['PartnerTransactionCost','unitId'],['ExpenseItemReference','costId'],...['costId','orgId','styleId','styleProcessId'].map(column=>['ExpenseCostProcess',column]),
  ['ExpenseRequest','managementNumber'],
  ['BankLedgerBatch','requestHash'],
  ['BankLedgerEntry','evidenceType'],['BankLedgerEntry','bankFee'],['BankLedgerEvidenceAllocation','expenseItemId'],['ExpenseApprovalDecision','version'],
  ...['accountKind','displayName','sortOrder'].map(column=>['OrganizationBankAccount',column]),['BankLedgerAccount','entityAccountId'],
  ...['orgId','baseId','target','auditId'].map(column=>['ExpenseCodeLinkPolicy',column]),
  ...['id','orgId','baseId','target','actorId'].map(column=>['ExpenseCodeLinkAudit',column]),
  ['PartnerTransactionCost','linkTarget'],['PartnerTransactionCost','linkPolicyAuditId'],
  ...['orgId','systemIndustryId','productionLinkRequired','updatedAt'].map(column=>['IndustryProductionPolicy',column]),
  ['OrgRelationship','systemIndustryId'],
  ['SettingServiceDefault','partnerRoleId'],
  ['SettingServiceDefault','expenseTypeId'],
  ['OrganizationBankAccount','entityId'],['OrganizationBankAccount','currencyId'],['EntitySchemaMigration','version'],
  ...['id','orgId','partnerOrgId','createdByEmployeeId','requestDate','legacyTitle','remark','currency','clientKey','submissionHash','createdAt'].map(column => ['ExpenseRequest',column]),
  ...['version','updatedAt','updatedByEmployeeId'].map(column=>['ExpenseRequest',column]),
  ['ExpenseRequestApprovalStep','employeeId'], ['ExpenseRequestAudit','requestId'], ['ExpenseSchemaMigration','version'],
  ['PartnerTransactionCost','expenseRequestId'], ['PartnerTransactionCost','expenseRequestLine'],
];
const payTypeConstraints = ['SalaryItemRate_payType_check','EmployeeCompensationPolicy_payType_check','EmployeePayTypePolicy_payType_check'];
const constraints = ['AccountingCodeIndustry_pkey','AccountingCodeIndustry_baseId_fkey','AccountingCodeIndustry_systemIndustryId_fkey','PartnerClassification_actor_scope_fkey','PartnerClassificationIndustry_scope_fkey','PartnerClassification_scope_guard','PartnerClassificationIndustry_guard','PartnerClassification_required','PartnerClassificationIndustry_required','LedgerChangeAcknowledgement_entry_scope_fkey','LedgerChangeAcknowledgement_employee_scope_fkey','LedgerChangeAcknowledgement_scope_guard','LedgerChangeAcknowledgement_append_only','BankLedgerEntry_revision_scope_fkey','BankLedgerEntry_revision_guard','ExpenseCodeLinkPolicy_inputs_check','ExpenseCodeLinkAudit_inputs_check','ExpenseType_other_retired','SettingServiceDefault_category_required','BankLedgerEntry_accounting_code_scope_fkey','BankLedgerSettlementLine_accounting_code_scope_fkey','BankLedgerEntry_accounting_code_guard','BankLedgerSettlementLine_accounting_code_guard','EmployeeExpenseBankAccount_write_guard','ExpenseRequest_payee_kind_check','TransactionCost_payee_kind_check','TransactionCost_request_scope_fkey','TransactionCost_employee_request_fkey','TransactionCost_payee_match_guard','baro_admin_drafter_exempt','BankLedgerEntry_settlement_check','BankLedgerSettlementLine_entry_scope_fkey','BankLedgerSettlementLine_values_check','BankLedgerSettlementLine_guard','BankLedgerSettlementLine_append_only','ExpenseApprovalDecision_result_check','BankLedgerExpenseRejection_guard','ExpenseItemReference_guard','ExpenseItemReference_audit_guard','ExpenseItemReference_cost_scope_fkey','ExpenseItemReference_order_scope_fkey','ExpenseItemReference_style_scope_fkey','ExpenseRequest_remark_multiline_check','ExpenseCostProcess_cost_scope_fkey','ExpenseCostProcess_process_scope_fkey','ExpenseCostProcess_write_guard','ServiceDefaultRenamePropagation','CodeDefaultRenamePropagation','ExpenseRequest_orgId_managementNumber_key','ExpenseRequest_number_guard','ExpenseApprovalDecision_role_guard','BankLedgerBatch_append_only','BankLedgerEntry_evidence_guard','BankLedgerEvidenceAllocation_guard','BankLedgerEntry_allocation_total','ExpenseApprovalDecision_guard','BankLedgerAccount_entity_account_fkey','BankLedgerAccount_master_guard','OrganizationBankAccount_ledger_identity_guard',...payTypeConstraints,'ExpenseCodeLinkPolicy_pkey','ExpenseCodeLinkPolicy_baseId_fkey','ExpenseCodeLinkAudit_actorId_orgId_fkey','ExpenseCodeLinkPolicy_audit_guard','ExpenseCodeLinkAudit_append_only','TransactionCost_link_target_check','PartnerTransactionCost_linkPolicyAuditId_orgId_fkey','IndustryProductionPolicy_pkey','IndustryProductionPolicy_orgId_fkey','IndustryProductionPolicy_systemIndustryId_fkey','OrgRelationship_systemIndustryId_fkey','SettingServiceDefault_expenseTypeId_fkey','OrganizationBankAccount_scope_guard','ExpenseRequest_payee_bank_guard','ExpenseRequest_id_orgId_partnerOrgId_key','ExpenseRequest_orgId_clientKey_key','ExpenseRequest_orgId_fkey',
  'ExpenseRequest_partnerOrgId_orgId_fkey','ExpenseRequest_createdByEmployeeId_orgId_fkey',
  'PartnerTransactionCost_expense_request_fkey','PartnerTransactionCost_expenseRequestId_expenseRequestLine_key','ExpenseRequestLine_pair_check',
  'ExpenseRequestEdit_cost_audit','ExpenseRequestEdit_production_audit','TransactionCost_style_scope_fkey','ExpenseRequestAudit_requestId_orgId_fkey','ExpenseRequestAudit_actorId_orgId_fkey','ExpenseRequestAudit_requestId_version_key','ExpenseRequest_write_guard','ExpenseRequest_audit_guard','ExpenseRequestAudit_append_only','baro_transaction_cost_guard','baro_request_production_guard','ExpenseRequestApprovalStep_employeeId_orgId_fkey','ExpenseRequestApprovalStep_write_guard','ExpenseRequestApprovalStep_audit_guard'];

async function missingSchema(db) {
  const existingColumns = await db.$queryRawUnsafe(`SELECT table_name,column_name,is_nullable FROM information_schema.columns
    WHERE table_schema='public' AND table_name IN ('AccountingCodeIndustry','TransactionCodeBase','PartnerClassification','PartnerClassificationIndustry','LedgerChangeAcknowledgement','EmployeeExpenseBankAccount','ExpenseUnit','ExpenseItemReference','ExpenseCostProcess','ExpenseCodeLinkPolicy','ExpenseCodeLinkAudit','IndustryProductionPolicy','ExpenseRequest','PartnerTransactionCost','ExpenseRequestAudit','ExpenseSchemaMigration','ExpenseRequestApprovalStep','OrganizationBankAccount','EntitySchemaMigration','SettingServiceDefault','OrgRelationship','BankLedgerAccount','BankLedgerEntry','BankLedgerEvidenceAllocation','ExpenseApprovalDecision','BankLedgerBatch','BankLedgerSettlementLine')`);
  const existingConstraints = await db.$queryRawUnsafe(`SELECT conname AS name,array_length(conkey,1) AS column_count,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace
    UNION SELECT indexname AS name,NULL::integer AS column_count,NULL::text AS definition FROM pg_indexes WHERE schemaname='public'
    UNION SELECT tgname AS name,NULL::integer AS column_count,NULL::text AS definition FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D'
    UNION SELECT proname AS name,NULL::integer AS column_count,NULL::text AS definition FROM pg_proc WHERE pronamespace='public'::regnamespace`);
  const columnSet = new Set(existingColumns.map(row => `${row.table_name}.${row.column_name}`));
  const constraintSet = new Set(existingConstraints.map(row => row.name));
  return [...columns.filter(([table,column]) => !columnSet.has(`${table}.${column}`)).map(([table,column]) => `${table}.${column}`),
    ...constraints.filter(name => !constraintSet.has(name)),
    ...existingConstraints.filter(row=>payTypeConstraints.includes(row.name)&&!String(row.definition).includes('OUTPUT_FIXED')).map(row=>row.name+':OUTPUT_FIXED'),
    ...existingConstraints.filter(row=>row.name==='TransactionCost_style_scope_fkey'&&!String(row.definition).includes('REFERENCES "Style"(id, "orgId")')).map(()=> 'TransactionCost_style_scope_fkey:manufacturer'),
    ...existingColumns.filter(row=>row.table_name==='ExpenseRequest'&&row.column_name==='currency'&&row.is_nullable==='NO').map(()=> 'ExpenseRequest.currency:nullable'),
    ...existingColumns.filter(row=>row.table_name==='SettingServiceDefault'&&row.column_name==='partnerRoleId'&&row.is_nullable==='YES').map(()=> 'SettingServiceDefault.partnerRoleId:required'),
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
    await runEntityProfileMigrations({env,run,db,log});
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
