// Read-only audit. Never print connection strings or business payloads.
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
const { PrismaClient } = require('@prisma/client');
const { assertSafeApplicationDatabaseEnv } = require('../src/config/databaseTargetGuard');
async function main() {
  assertSafeApplicationDatabaseEnv();
  const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL });
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      const groups = await tx.$queryRawUnsafe(`SELECT s."orgId" AS "productionOwnerOrgId",s."customerOrgId" AS "productOwnerOrgId",o.type::text AS "productionType",b.type::text AS "productType",count(*)::int AS count FROM "Style" s JOIN "Organization" o ON o.id=s."orgId" JOIN "Organization" b ON b.id=s."customerOrgId" GROUP BY s."orgId",s."customerOrgId",o.type,b.type ORDER BY s."orgId",s."customerOrgId"`);
      const links = await tx.$queryRawUnsafe(`SELECT s."customerOrgId",count(DISTINCT l."targetOrgId")::int AS targets FROM "Style" s JOIN "CompanyPartnerLink" l ON l."orgId"=s."orgId" AND l."entityId"=s."customerOrgId" GROUP BY s."customerOrgId"`);
      const schema = await tx.$queryRawUnsafe(`SELECT to_regclass('"StyleProduct"') IS NOT NULL AS present`);
      const verification = schema[0]?.present ? {
        migration: await tx.$queryRawUnsafe(`SELECT version,checksum FROM "EntitySchemaMigration" WHERE version IN ('20261108010000_style_product_ownership','20261108020000_connected_style_product_edit') ORDER BY version`),
        examples: await tx.$queryRawUnsafe(`SELECT s.id,s.code,s.name,p.id AS "productId",p."ownerOrgId" AS "productOwnerOrgId",b.name AS "productOwner",s."orgId" AS "productionOwnerOrgId",m.name AS "productionOwner",s."appliedProductRevision",p.fields=baro_style_product_fields(to_jsonb(s)) AS "specPreserved" FROM "Style" s JOIN "StyleProduct" p ON p.id=s."productStyleId" JOIN "Organization" b ON b.id=p."ownerOrgId" JOIN "Organization" m ON m.id=s."orgId" WHERE s.code='AM01160' OR s.name='AM01160'`),
        integrity: await tx.$queryRawUnsafe(`SELECT count(*)::int AS total,count(*) FILTER(WHERE s."productOwnerOrgId"=p."ownerOrgId" AND r.fields=baro_style_product_fields(to_jsonb(s)))::int AS verified FROM "Style" s JOIN "StyleProduct" p ON p.id=s."productStyleId" JOIN "StyleProductRevision" r ON r."productId"=p.id AND r.revision=s."appliedProductRevision"`),
      } : null;
      console.log(JSON.stringify({ groups, explicitSubscriberLinks: links, schema, verification }, null, 2));
    });
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(JSON.stringify({ error: 'Read-only style ownership audit failed; credentials suppressed.', code: error.code || error.name, databaseCode: error.meta?.code, targetGuard: String(error.message).startsWith('[database-target]'), configured: { DATABASE_URL: !!process.env.DATABASE_URL, DIRECT_URL: !!process.env.DIRECT_URL } })); process.exitCode = 1; });
