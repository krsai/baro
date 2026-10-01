// Explicit session URL only. Default is a transactionally verified dry-run.
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');

const fingerprint = table => `SELECT md5(COALESCE(string_agg(md5((to_jsonb(t) - ARRAY['dataOwnerOrgId','ownerOrgId','customerOrgId'${table === 'WorkOrder' || table === 'Style' ? ",'orgId'" : ''}])::text),'' ORDER BY t.id),'')) FROM "${table}" t`;
const tables = ['Organization', 'Style', 'WorkOrder'];
const preservationBefore = `CREATE TEMP TABLE ownership_preservation (name text PRIMARY KEY, digest text) ON COMMIT DROP;
${tables.map(table => `INSERT INTO ownership_preservation VALUES ('${table}',(${fingerprint(table)}));`).join('\n')}`;
const preservationAfter = `DO $$ BEGIN
${tables.map(table => `IF (${fingerprint(table)}) IS DISTINCT FROM (SELECT digest FROM ownership_preservation WHERE name='${table}') THEN RAISE EXCEPTION 'OWNERSHIP_PRESERVATION_FAILED: ${table}'; END IF;`).join('\n')}
END $$;`;

async function main() {
  const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!url) throw Error('Explicit session database URL required');
  assertSafeApplicationDatabaseEnv({ DATABASE_URL: url, DIRECT_URL: url });
  const apply = process.argv.includes('--apply');
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    const before = await db.$queryRawUnsafe(`SELECT 'Style' entity, "orgId", count(*)::int count FROM "Style" GROUP BY "orgId"
      UNION ALL SELECT 'WorkOrder', "orgId", count(*)::int FROM "WorkOrder" GROUP BY "orgId" ORDER BY entity,"orgId"`);
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', before }));
    const sql = readFileSync(path.join(__dirname, 'transfer-manufacturer-ownership.sql'), 'utf8')
      + readFileSync(path.join(__dirname, 'transfer-baro-business-data.sql'), 'utf8');
    const result = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'db', 'execute', '--stdin', '--schema', path.join(__dirname, '../prisma/schema.prisma')], {
      env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url }, encoding: 'utf8',
      input: `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
        LOCK TABLE "Organization", "OrgRelationship", "Style", "WorkOrder" IN SHARE ROW EXCLUSIVE MODE;
        ${preservationBefore}\n${sql}\n${preservationAfter}\n${apply ? 'COMMIT' : 'ROLLBACK'};`,
    });
    if (result.status !== 0) {
      // Prisma may include a connection string in diagnostic output; never echo it.
      const reason = String(result.stderr).match(/OWNERSHIP_[A-Z_]+[^\r\n]*/)?.[0]
        || String(result.stderr).match(/ERROR: [^\r\n]*/)?.[0];
      throw Error(reason || 'Ownership migration failed; transaction rolled back');
    }
    if (apply) {
      const verified = await db.$queryRawUnsafe(`SELECT 'Style' entity,"orgId" owner,count(*)::int count FROM "Style" GROUP BY "orgId"
        UNION ALL SELECT 'WorkOrder',"orgId",count(*)::int FROM "WorkOrder" GROUP BY "orgId"
        UNION ALL SELECT 'OrganizationScope',"dataOwnerOrgId",count(*)::int FROM "Organization" GROUP BY "dataOwnerOrgId"`);
      console.log(JSON.stringify({ verified, businessFieldsPreserved: true }));
    } else console.log(JSON.stringify({ verified: true, rolledBack: true, businessFieldsPreserved: true }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(/^(OWNERSHIP_|ERROR:)/.test(error.message) ? error.message : 'Manufacturer ownership operation failed; no credentials logged.'); process.exitCode = 1; });
module.exports = { preservationBefore, preservationAfter };
