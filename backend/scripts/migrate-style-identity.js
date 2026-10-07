const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');

// Snapshot tables are fingerprinted before and after; no repair or recalculation.
const preserved = ['StyleProcessStandard','StyleProcessVersion','AssignmentPlan','WorkRecord','OutsourcedWorkRecord','PayrollSnapshot','Invoice','InvoiceCredit'];
const fingerprint = name => `SELECT md5(coalesce(string_agg(to_jsonb(t)::TEXT,'' ORDER BY t.id),'')) FROM "${name}" t`;
const preservedCurrent={Style:'categoryId',StyleProcess:'processComposition'};
const currentFingerprint=(name,field)=>`SELECT md5(coalesce(string_agg((to_jsonb(t)-'${field}')::TEXT,'' ORDER BY t.id),'')) FROM "${name}" t`;
const preservationBefore = `CREATE TEMP TABLE fk_preservation(name TEXT PRIMARY KEY,digest TEXT) ON COMMIT DROP;
CREATE TEMP TABLE fk_original_master_ids ON COMMIT DROP AS SELECT id FROM "ProcessMasterOption";
INSERT INTO fk_preservation VALUES ('ProcessMasterOption',(${fingerprint('ProcessMasterOption')}));
${Object.entries(preservedCurrent).map(([name,field])=>`INSERT INTO fk_preservation VALUES ('${name}',(${currentFingerprint(name,field)}));`).join('\n')}
${preserved.map(name=>`INSERT INTO fk_preservation VALUES ('${name}',(${fingerprint(name)}));`).join('\n')}`;
const preservationAfter = `DO $$ BEGIN
IF (SELECT md5(coalesce(string_agg(to_jsonb(t)::TEXT,'' ORDER BY t.id),'')) FROM "ProcessMasterOption" t WHERE id IN (SELECT id FROM fk_original_master_ids)) IS DISTINCT FROM (SELECT digest FROM fk_preservation WHERE name='ProcessMasterOption') THEN RAISE EXCEPTION 'STYLE_IDENTITY_ORIGINAL_MASTER_CHANGED'; END IF;
${Object.entries(preservedCurrent).map(([name,field])=>`IF (${currentFingerprint(name,field)}) IS DISTINCT FROM (SELECT digest FROM fk_preservation WHERE name='${name}') THEN RAISE EXCEPTION 'STYLE_IDENTITY_CURRENT_VALUES_CHANGED: ${name}'; END IF;`).join('\n')}
${preserved.map(name=>`IF (${fingerprint(name)}) IS DISTINCT FROM (SELECT digest FROM fk_preservation WHERE name='${name}') THEN RAISE EXCEPTION 'STYLE_IDENTITY_SNAPSHOT_CHANGED: ${name}'; END IF;`).join('\n')}
END $$;`;
async function main() {
  const url=process.env.DIRECT_URL || process.env.DATABASE_URL;
  if(!url) throw Error('Explicit session database URL required');
  assertSafeApplicationDatabaseEnv({ DATABASE_URL:url, DIRECT_URL:url });
  const apply=process.argv.includes('--apply');
  const sql=fs.readFileSync(path.join(__dirname,'style-identity-fk.sql'),'utf8');
  const result=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'db','execute','--stdin','--schema',path.join(__dirname,'../prisma/schema.prisma')], {
    env:{...process.env,DATABASE_URL:url,DIRECT_URL:url}, encoding:'utf8',
    input:`BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='120s';
      LOCK TABLE "Style","AttrCategory","StyleProcess","ProcessMasterOption" IN SHARE ROW EXCLUSIVE MODE;
      ${preservationBefore}\n${sql}\n${preservationAfter}\n${apply?'COMMIT':'ROLLBACK'};`,
  });
  if(result.status!==0) {
    const reason=String(result.stderr).match(/STYLE_IDENTITY_[A-Z_]+[^\r\n]*/)?.[0];
    throw Error(reason || 'Identity migration failed; transaction rolled back, credentials suppressed');
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',verified:true,rolledBack:!apply,snapshotsPreserved:true}));
  if(apply) {
    const db=new PrismaClient({datasourceUrl:url});
    try { console.log(JSON.stringify(await db.$queryRawUnsafe(`SELECT
      (SELECT count(*)::int FROM "Style" WHERE "categoryId" IS NOT NULL) AS categories,
      (SELECT count(*)::int FROM "StyleProcessComponent") AS components,
      (SELECT count(*)::int FROM "StyleIdentityArchive") AS archives`))); }
    finally { await db.$disconnect(); }
  }
}
if(require.main===module) main().catch(error=>{console.error(error.message.startsWith('STYLE_IDENTITY_')?error.message:'Identity migration failed; credentials suppressed');process.exitCode=1;});
module.exports={preservationBefore,preservationAfter};
