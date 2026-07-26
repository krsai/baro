const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const collectStBucketFkViolations = (result) => {
  const first = (rows) => (Array.isArray(rows) ? rows[0] || {} : {});
  return [
    ['missing_bucket_fk', first(result.standards).missing_bucket_fk],
    ['missing_entry', first(result.entryMatches).missing_entry],
    ['process_org_mismatch', first(result.entryMatches).process_org_mismatch],
    ['missing_relationship_time_bucket', first(result.relationshipTimeBuckets).missing_or_mismatched],
    ['invalid_time_bucket_override', first(result.timeBucketOverrides).invalid_scope],
    ['invalid_assignment_relationship', first(result.assignmentRelationships).invalid_scope],
    ['missing_active_relationship_standard', first(result.activeRelationshipStandards).missing_standard],
    [
      'unresolved_cross_org',
      first(result.standardRelationshipMatches).unresolved_cross_org,
    ],
    ['legacy_columns', first(result.legacyColumns).count],
  ].filter(([, count]) => Number(count) > 0);
};

const main = async () => {
  const query = (sql) => prisma.$queryRawUnsafe(sql);
  const result = {
    organizations: await prisma.organization.findMany({
      select: { id: true, type: true },
      orderBy: { id: 'asc' },
    }),
    relationships: await prisma.orgRelationship.findMany({
      select: { id: true, manufacturerOrgId: true, brandOrgId: true },
      orderBy: { id: 'asc' },
    }),
    relationshipTimeBuckets: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (
          WHERE v.id IS NULL OR v."orgId" <> r."manufacturerOrgId"
        )::int missing_or_mismatched
      FROM "OrgRelationship" r
      LEFT JOIN "QuantityBucketSetVersion" v
        ON v.id = r."timeBucketSetVersionId"
    `),
    timeBucketOverrides: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (
          WHERE r.id IS NULL OR s.id IS NULL OR v.id IS NULL
             OR t."manufacturerOrgId" <> r."manufacturerOrgId"
             OR t."brandOrgId" <> r."brandOrgId"
             OR s."orgId" <> r."brandOrgId"
             OR v."orgId" <> r."manufacturerOrgId"
        )::int invalid_scope
      FROM "OrgRelationshipStyleTimeBucket" t
      LEFT JOIN "OrgRelationship" r ON r.id = t."orgRelationshipId"
      LEFT JOIN "Style" s ON s.id = t."styleId"
      LEFT JOIN "QuantityBucketSetVersion" v
        ON v.id = t."quantityBucketSetVersionId"
    `),
    assignmentRelationships: await query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (
          WHERE p."orgRelationshipId" IS NULL OR r.id IS NULL
             OR r."manufacturerOrgId" <> p."orgId"
             OR r."brandOrgId" <> p."buyerOrgId"
        )::int invalid_scope
      FROM "AssignmentPlan" p
      LEFT JOIN "OrgRelationship" r ON r.id = p."orgRelationshipId"
      WHERE p."styleId" IS NOT NULL AND p."buyerOrgId" IS NOT NULL
    `),
    activeRelationshipStandards: await query(`
      SELECT COUNT(*)::int expected,
        COUNT(*) FILTER (WHERE x.id IS NULL)::int missing_standard
      FROM "OrgRelationship" r
      JOIN "Style" s ON s."orgId" = r."brandOrgId"
      JOIN "StyleProcess" sp
        ON sp."styleId" = s.id AND sp."orgId" = r."manufacturerOrgId"
      LEFT JOIN "OrgRelationshipStyleTimeBucket" override
        ON override."orgRelationshipId" = r.id AND override."styleId" = s.id
      JOIN "QuantityBucketEntry" e
        ON e."quantityBucketSetVersionId" = COALESCE(
          override."quantityBucketSetVersionId",
          r."timeBucketSetVersionId"
        )
      LEFT JOIN "StyleProcessStandard" x
        ON x."styleProcessId" = sp.id
       AND x."orgId" = r."manufacturerOrgId"
       AND x."quantityBucketEntryId" = e.id
       AND x."quantityBucketSetVersionId" = e."quantityBucketSetVersionId"
    `),
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
  const violations = collectStBucketFkViolations(result);
  if (violations.length > 0) {
    throw new Error(
      `ST bucket FK verification failed: ${violations
        .map(([name, count]) => `${name}=${count}`)
        .join(', ')}`
    );
  }
};

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error?.message || error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = { collectStBucketFkViolations };
