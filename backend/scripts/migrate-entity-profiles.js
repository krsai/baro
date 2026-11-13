// The shared entity profile rollout path. Only immutable, versioned migration files execute.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');
const versions = ['20261020200000_entity_bank_accounts','20261020210000_industry_expense_type','20261021230000_partner_industry_roles','20261022200000_partner_industry_canonical','20261023090000_industry_production_policy','20261023100000_logistics_vendor_enum','20261023100100_logistics_partner_role','20261023110000_customer_industry_categories','20261023140000_expense_code_link_policy','20261023140100_baro_expense_code_links','20261025100000_localized_name_primary_english','20261025160000_pay_type_constraints','20261027160000_service_tenant_enum','20261027160100_bank_ledger','20261027190000_business_accounts_order','20261027210000_ledger_evidence','20261027210100_ledger_evidence_delete','20261027220000_ledger_batch','20261028090000_expense_approval_settings','20261028140000_document_management_numbers','20261029160000_code_base_rename','20261029170000_partner_industry_code_rename','20261029190000_expense_link_hierarchy','20261029200000_expense_multiline_remark','20261030090000_expense_units_references','20261030120000_expense_approval_rejection','20261030150000_ledger_settlement_lines','20261030170000_admin_drafter_final_authority','20261030190000_ledger_entry_revisions','20261030210000_employee_expense_payees','20261030220000_ledger_accounting_codes','20261030230000_industry_management_category','20261030233000_retire_other_accounting_type','20261031010000_accounting_input_defaults','20261031010100_accounting_tax_variants','20261031190000_ledger_change_acknowledgement','20261031210000_partner_classification','20261031220000_accounting_code_industries','20261031230000_remove_empty_management_role','20261101230000_company_partner_links','20261101231000_company_links_self_owned_tenants','20261102110000_editable_account_identity','20261102130000_partner_party_kind','20261102150000_linked_partner_identity','20261103140000_configurable_expense_approvals','20261103190000_common_company_identity','20261103210000_expense_deletion_requests','20261103220000_approved_expense_deletion','20261104140000_service_customer_relationship_owner','20261104150000_service_partner_data_owner','20261104160000_ledger_parties_and_change_approvals','20261105010000_accounting_cash_direction','20261105020000_highest_expense_deletion_authority','20261105030000_freight_operations','20261105040000_company_industries_and_billing','20261105050000_distribution_category_name','20261105060000_industry_groups_and_open_billing','20261105060000_ledger_registration_approvals','20261105070000_business_legal_form','20261105110000_employee_tenure_recognition','20261105140000_job_bills','20261106110000_cash_schedule_dates','20261106150000_approval_vacancy_delegation','20261106160000_final_drafter_approval','20261106170000_order_shipments','20261106200000_paid_holiday_calendar','20261106210000_employee_leave_calendar','20261106220000_retire_legacy_logistics_customer','20261106230000_system_entity_management','20261107010000_linked_payee_accounts','20261107020000_cash_direction_anomalies','20261107030000_current_expense_inputs','20261107040000_transport_exchange','20261108010000_style_product_ownership','20261108020000_connected_style_product_edit','20261108030000_shipping_request_jobs','20261110010000_expense_payment_schedule','20261110020000_general_invoices','20261110030000_internal_ledger_transfers','20261110040000_uppercase_company_names','20261111010000_dashboard_work_requests','20261111020000_bank_fee_without_evidence','20261111030000_invoice_cancellation_approval','20261111040000_accounting_compact_defaults','20261111050000_accounting_opening_balances','20261111060000_payroll_payables','20261112010000_work_time_requests','20261112010000_dashboard_work_request_edit','20261112020000_opening_bill_replacement','20261113010000_ledger_vat_breakdown','20261113020000_accounting_dimensions','20261113030000_bank_fee_bnf_link','20261113040000_payroll_payable_management','20261113050000_independent_management_targets','20261113060000_change_request_reason_required','20261113070000_shipping_editor_presets','20261113080000_shipping_port_catalog','20261114010000_shipping_port_management','20261114020000_shipping_port_restore'];
const literal = s => `'${s.replaceAll("'", "''")}'`;
const migrations = () => versions.map(version => {
  const sql = fs.readFileSync(path.join(__dirname,'../prisma/migrations',version,'migration.sql'),'utf8').replace(/\r\n/g,'\n');
  return {version,sql,checksum:createHash('sha256').update(sql).digest('hex')};
});
const migrationSql = () => migrations().map(m => `BEGIN; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='60s';
 SELECT pg_advisory_xact_lock(2026102002);
 CREATE TABLE IF NOT EXISTS "EntitySchemaMigration"(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,"appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
 DO $step$ BEGIN
 IF EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(m.version)} AND checksum<>${literal(m.checksum)}) THEN
 RAISE EXCEPTION 'ENTITY_MIGRATION_CHECKSUM_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "EntitySchemaMigration" WHERE version=${literal(m.version)}) THEN
 EXECUTE ${literal(m.sql)};
 INSERT INTO "EntitySchemaMigration"(version,checksum) VALUES(${literal(m.version)},${literal(m.checksum)});
 END IF; END $step$;
 COMMIT;`).join('\n');
async function runEntityProfileMigrations({env=process.env,run=spawnSync,db,log=console.log}={}) {
  assertSafeApplicationDatabaseEnv(env);
  const url=String(env.DIRECT_URL||env.DATABASE_URL||'').trim();
  if(!url) throw Error('[entity-migrations] Application database URL is required.');
  if(db) {
    const exists=await db.$queryRawUnsafe(`SELECT to_regclass('"EntitySchemaMigration"') IS NOT NULL AS present`);
    if(exists[0]?.present) {
      const rows=await db.$queryRawUnsafe('SELECT version,checksum FROM "EntitySchemaMigration"');
      for(const m of migrations()) {
        const row=rows.find(r=>r.version===m.version);
        if(row&&row.checksum!==m.checksum) throw Error('[entity-migrations] Applied migration checksum mismatch.');
      }
      if(migrations().every(m=>rows.some(r=>r.version===m.version))) return;
    }
  }
  const result=await run(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../prisma/schema.prisma')],{
    cwd:path.resolve(__dirname,'..'),env:{...env,DATABASE_URL:url,DIRECT_URL:url},encoding:'utf8',stdio:'pipe',timeout:90000,input:migrationSql(),
  });
  if(result.error||result.signal||result.status!==0) throw Error('[entity-migrations] Migration failed; the failing step was rolled back. Earlier versioned steps may already be committed. Check connectivity, locks and entity scope and schema integrity.');
  log('[entity-migrations] Pending versioned entity migrations applied.');
}
if(require.main===module)runEntityProfileMigrations().catch(()=>{console.error('[entity-migrations] Migration failed; database details suppressed.');process.exitCode=1;});
module.exports={versions,migrations,migrationSql,runEntityProfileMigrations};
