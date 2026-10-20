// The sole expense rollout path. Only immutable, versioned migration files execute.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');
const versions = ['20261017120000_expense_request_documents','20261019180000_expense_request_editor',
  '20261020120000_expense_style_manufacturer_fk','20261020160000_expense_audit_versions'];
const literal = s => `'${s.replaceAll("'", "''")}'`;
const migrations = () => versions.map(version => {
  const sql = fs.readFileSync(path.join(__dirname,'../prisma/migrations',version,'migration.sql'),'utf8').replace(/\r\n/g,'\n');
  return {version,sql,checksum:createHash('sha256').update(sql).digest('hex')};
});
const migrationSql = () => `BEGIN; SET LOCAL lock_timeout='15s'; SET LOCAL statement_timeout='60s';
 SELECT pg_advisory_xact_lock(2026101701);
 CREATE TABLE IF NOT EXISTS "ExpenseSchemaMigration"(version TEXT PRIMARY KEY,checksum TEXT NOT NULL,"appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
 ${migrations().map(m => `DO $step$ BEGIN
 IF EXISTS(SELECT 1 FROM "ExpenseSchemaMigration" WHERE version=${literal(m.version)} AND checksum<>${literal(m.checksum)}) THEN
 RAISE EXCEPTION 'EXPENSE_MIGRATION_CHECKSUM_MISMATCH'; END IF;
 IF NOT EXISTS(SELECT 1 FROM "ExpenseSchemaMigration" WHERE version=${literal(m.version)}) THEN
 EXECUTE ${literal(m.sql)};
 INSERT INTO "ExpenseSchemaMigration"(version,checksum) VALUES(${literal(m.version)},${literal(m.checksum)});
 END IF; END $step$;`).join('\n')}
 COMMIT;`;
async function runExpenseMigrations({env=process.env,run=spawnSync,db,log=console.log}={}) {
  assertSafeApplicationDatabaseEnv(env);
  const url=String(env.DIRECT_URL||env.DATABASE_URL||'').trim();
  if(!url) throw Error('[expense-migrations] Application database URL is required.');
  if(db) {
    const exists=await db.$queryRawUnsafe(`SELECT to_regclass('"ExpenseSchemaMigration"') IS NOT NULL AS present`);
    if(exists[0]?.present) {
      const rows=await db.$queryRawUnsafe('SELECT version,checksum FROM "ExpenseSchemaMigration"');
      for(const m of migrations()) {
        const row=rows.find(r=>r.version===m.version);
        if(row&&row.checksum!==m.checksum) throw Error('[expense-migrations] Applied migration checksum mismatch.');
      }
      if(migrations().every(m=>rows.some(r=>r.version===m.version))) return;
    }
  }
  const result=await run(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../prisma/schema.prisma')],{
    cwd:path.resolve(__dirname,'..'),env:{...env,DATABASE_URL:url,DIRECT_URL:url},encoding:'utf8',stdio:'pipe',timeout:90000,input:migrationSql(),
  });
  if(result.error||result.signal||result.status!==0) throw Error('[expense-migrations] Migration failed and was rolled back. Check connectivity, locks and legacy audit integrity.');
  log('[expense-migrations] Pending versioned expense migrations applied.');
}
if(require.main===module)runExpenseMigrations().catch(()=>{console.error('[expense-migrations] Migration failed; database details suppressed.');process.exitCode=1;});
module.exports={versions,migrations,migrationSql,runExpenseMigrations};
