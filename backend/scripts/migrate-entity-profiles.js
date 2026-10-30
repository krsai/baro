// The shared entity profile rollout path. Only immutable, versioned migration files execute.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');
const versions = ['20261020200000_entity_bank_accounts','20261020210000_industry_expense_type','20261021230000_partner_industry_roles','20261022200000_partner_industry_canonical','20261023090000_industry_production_policy','20261023100000_logistics_vendor_enum','20261023100100_logistics_partner_role','20261023110000_customer_industry_categories','20261023140000_expense_code_link_policy','20261023140100_baro_expense_code_links','20261025100000_localized_name_primary_english','20261025160000_pay_type_constraints','20261027160000_service_tenant_enum','20261027160100_bank_ledger','20261027190000_business_accounts_order','20261027210000_ledger_evidence','20261027210100_ledger_evidence_delete','20261027220000_ledger_batch','20261028090000_expense_approval_settings','20261028140000_document_management_numbers','20261029160000_code_base_rename','20261029170000_partner_industry_code_rename','20261029190000_expense_link_hierarchy','20261029200000_expense_multiline_remark','20261030090000_expense_units_references','20261030120000_expense_approval_rejection'];
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
