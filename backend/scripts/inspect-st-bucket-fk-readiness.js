const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const main = async () => {
  const query = (sql) => prisma.$queryRawUnsafe(sql);
  const result = {
    organizations: await prisma.organization.findMany({
      select: { id: true, name: true, type: true },
      orderBy: { id: 'asc' },
    }),
    relationships: await prisma.orgRelationship.findMany({
      select: { id: true, manufacturerOrgId: true, brandOrgId: true },
      orderBy: { id: 'asc' },
    }),
    standards: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (
          WHERE x."quantityBucketEntryId" IS NULL
             OR x."quantityBucketSetVersionId" IS NULL
        )::int missing_bucket_fk
      FROM "StyleProcessStandard" x
      JOIN "StyleProcess" sp ON sp.id = x."styleProcessId"
      JOIN "Style" s ON s.id = sp."styleId"
    `),
    entryMatches: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE e.id IS NOT NULL)::int exact_match,
        COUNT(*) FILTER (WHERE e.id IS NULL)::int missing_entry,
        COUNT(*) FILTER (WHERE e.id IS NOT NULL AND sp."orgId" <> x."orgId")::int process_org_mismatch
      FROM "StyleProcessStandard" x
      JOIN "StyleProcess" sp ON sp.id = x."styleProcessId"
      LEFT JOIN "QuantityBucketEntry" e
        ON e.id = x."quantityBucketEntryId"
       AND e."quantityBucketSetVersionId" = x."quantityBucketSetVersionId"
    `),
    orders: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE "buyerOrgId" IS NULL)::int buyer_null
      FROM "WorkOrder"
    `),
    orderRelationships: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE r.id IS NOT NULL)::int exact_relationship,
        COUNT(*) FILTER (WHERE r.id IS NULL)::int missing_relationship
      FROM "WorkOrder" w
      LEFT JOIN "OrgRelationship" r
        ON r."manufacturerOrgId" = w."orgId"
       AND r."brandOrgId" = w."buyerOrgId"
    `),
    multiManufacturerBrands: await query(`
      SELECT COUNT(*)::int brands
      FROM (
        SELECT "brandOrgId"
        FROM "OrgRelationship"
        GROUP BY "brandOrgId"
        HAVING COUNT(*) > 1
      ) grouped
    `),
    orderRelationshipCandidates: await query(`
      SELECT w."orgId", w."buyerOrgId", COUNT(*)::int orders,
        direct.id AS direct_id, reverse.id AS reverse_id
      FROM "WorkOrder" w
      LEFT JOIN "OrgRelationship" direct
        ON direct."manufacturerOrgId" = w."orgId"
       AND direct."brandOrgId" = w."buyerOrgId"
      LEFT JOIN "OrgRelationship" reverse
        ON reverse."manufacturerOrgId" = w."buyerOrgId"
       AND reverse."brandOrgId" = w."orgId"
      GROUP BY w."orgId", w."buyerOrgId", direct.id, reverse.id
      ORDER BY w."orgId", w."buyerOrgId"
    `),
    standardOrgShapes: await query(`
      SELECT x."orgId" standard_org, sp."orgId" process_org, e."orgId" entry_org,
        COUNT(*)::int rows
      FROM "StyleProcessStandard" x
      JOIN "StyleProcess" sp ON sp.id = x."styleProcessId"
      JOIN "QuantityBucketEntry" e
        ON e.id = x."quantityBucketEntryId"
       AND e."quantityBucketSetVersionId" = x."quantityBucketSetVersionId"
      GROUP BY x."orgId", sp."orgId", e."orgId"
      ORDER BY rows DESC
    `),
    standardRelationshipMatches: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE r.id IS NOT NULL)::int relationship_match,
        COUNT(*) FILTER (WHERE r.id IS NULL AND e."orgId" = sp."orgId")::int same_org_internal,
        COUNT(*) FILTER (WHERE r.id IS NULL AND e."orgId" <> sp."orgId")::int unresolved_cross_org
      FROM "StyleProcessStandard" x
      JOIN "StyleProcess" sp ON sp.id = x."styleProcessId"
      JOIN "QuantityBucketEntry" e
        ON e.id = x."quantityBucketEntryId"
       AND e."quantityBucketSetVersionId" = x."quantityBucketSetVersionId"
      LEFT JOIN "OrgRelationship" r
        ON r."manufacturerOrgId" = sp."orgId"
       AND r."brandOrgId" = e."orgId"
    `),
    legacyColumns: await query(`
      SELECT COUNT(*)::int count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'StyleProcessStandard'
        AND column_name IN ('bucketQuantity', 'quantity', 'stSeconds')
    `),
  };
  console.log(JSON.stringify(result, null, 2));
};

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
