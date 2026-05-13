#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
process.env.DIRECT_URL = String(process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
process.env.DATABASE_URL = String(process.env.DATABASE_URL || process.env.DIRECT_URL || "").trim();

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const SPEC_TYPES = ["TARGET_SPEC", "ACTION_SPEC", "SPEC"];

const ensureProcessMasterSpecEnumValues = async () => {
  for (const enumValue of ["TARGET_SPEC", "ACTION_SPEC"]) {
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'ProcessMasterOptionType'
            AND e.enumlabel = '${enumValue}'
        ) THEN
          ALTER TYPE "ProcessMasterOptionType" ADD VALUE '${enumValue}';
        END IF;
      END
      $$;
    `);
  }
};

const buildSummary = async () => {
  const typeSql = SPEC_TYPES.map((type) => `'${type}'`).join(", ");
  const [options, relationCount, styleProcessCount] = await Promise.all([
    prisma.$queryRawUnsafe(`
      SELECT
        "id",
        "type"::text AS "type",
        "code",
        "label",
        "nameKo",
        "nameEn",
        "nameVi"
      FROM "ProcessMasterOption"
      WHERE "type"::text IN (${typeSql})
      ORDER BY "type" ASC, "code" ASC, "id" ASC
    `),
    prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int AS "count"
      FROM "ProcessMasterOptionRelation" relation
      JOIN "ProcessMasterOption" child ON child."id" = relation."childOptionId"
      WHERE child."type"::text IN (${typeSql})
    `).catch(() => [{ count: 0 }]),
    prisma.styleProcess.count(),
  ]);

  return {
    options,
    relationCount: Number(relationCount?.[0]?.count ?? 0),
    styleProcessCount,
  };
};

const main = async () => {
  await ensureProcessMasterSpecEnumValues();
  const before = await buildSummary();

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    specOptionCount: before.options.length,
    relationCount: before.relationCount,
    styleProcessCount: before.styleProcessCount,
    sample: before.options.slice(0, 20).map((item) => ({
      id: item.id,
      type: item.type,
      code: item.code,
      label: item.label || item.nameKo || item.nameEn || item.nameVi || "",
    })),
  }, null, 2));

  if (!APPLY) return;

  const typeSql = SPEC_TYPES.map((type) => `'${type}'`).join(", ");
  const deleteResult = await prisma.$executeRawUnsafe(`
    DELETE FROM "ProcessMasterOption"
    WHERE "type"::text IN (${typeSql})
  `);

  const after = await buildSummary();
  console.log(JSON.stringify({
    deletedCount: Number(deleteResult || 0),
    remainingSpecOptionCount: after.options.length,
    remainingRelationCount: after.relationCount,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
