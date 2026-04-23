#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient, Prisma } = require("@prisma/client");

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
process.env.DIRECT_URL = String(process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
process.env.DATABASE_URL = String(process.env.DATABASE_URL || process.env.DIRECT_URL || "").trim();

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

const normalizeText = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeCode = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase();

const signatureOfOption = (row) => {
  const ko = normalizeText(row?.nameKo ?? row?.label);
  const en = normalizeText(row?.nameEn);
  const vi = normalizeText(row?.nameVi);
  return `${row?.type || ""}|ko:${ko}|en:${en}|vi:${vi}`;
};

const sortByCanonicalPriority = (left, right) => {
  if (right.usedByCount !== left.usedByCount) return right.usedByCount - left.usedByCount;
  if (right.referenceCount !== left.referenceCount) return right.referenceCount - left.referenceCount;
  if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
  return left.id - right.id;
};

const hasRelationTable = async () => {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'ProcessMasterOptionRelation'
    ) AS "exists"
  `;
  return Boolean(rows?.[0]?.exists);
};

const buildUsageMap = async () => {
  const styleProcesses = await prisma.styleProcess.findMany({
    select: { id: true, processComposition: true },
    orderBy: { id: "asc" },
  });
  const usageByTypeAndCode = new Map();

  const compositionKeyByType = {
    LOCATION: "locations",
    TARGET: "targets",
    TARGET_SPEC: "targetSpecs",
    ACTION: "actions",
    ACTION_SPEC: "actionSpecs",
  };

  for (const process of styleProcesses) {
    const composition =
      process?.processComposition && typeof process.processComposition === "object"
        ? process.processComposition
        : null;
    if (!composition) continue;

    for (const [type, key] of Object.entries(compositionKeyByType)) {
      const entries = Array.isArray(composition[key]) ? composition[key] : [];
      for (const entry of entries) {
        const code = normalizeCode(entry?.code);
        if (!code) continue;
        const mapKey = `${type}:${code}`;
        if (!usageByTypeAndCode.has(mapKey)) {
          usageByTypeAndCode.set(mapKey, new Set());
        }
        usageByTypeAndCode.get(mapKey).add(process.id);
      }
    }
  }

  return usageByTypeAndCode;
};

const rewireRelationsForDuplicate = async ({
  duplicateId,
  canonicalId,
  relationTableExists,
}) => {
  if (!relationTableExists) return;

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ProcessMasterOptionRelation" (
        "type",
        "parentOptionId",
        "childOptionId",
        "createdAt",
        "updatedAt"
      )
      SELECT
        relation."type",
        ${canonicalId},
        relation."childOptionId",
        NOW(),
        NOW()
      FROM "ProcessMasterOptionRelation" relation
      WHERE relation."parentOptionId" = ${duplicateId}
      ON CONFLICT ("type", "parentOptionId", "childOptionId") DO NOTHING
    `
  );

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "ProcessMasterOptionRelation" (
        "type",
        "parentOptionId",
        "childOptionId",
        "createdAt",
        "updatedAt"
      )
      SELECT
        relation."type",
        relation."parentOptionId",
        ${canonicalId},
        NOW(),
        NOW()
      FROM "ProcessMasterOptionRelation" relation
      WHERE relation."childOptionId" = ${duplicateId}
      ON CONFLICT ("type", "parentOptionId", "childOptionId") DO NOTHING
    `
  );

  await prisma.$executeRaw(
    Prisma.sql`
      DELETE FROM "ProcessMasterOptionRelation"
      WHERE "parentOptionId" = ${duplicateId}
         OR "childOptionId" = ${duplicateId}
    `
  );
};

const main = async () => {
  const [options, usageMap, relationTableExists] = await Promise.all([
    prisma.processMasterOption.findMany({
      select: {
        id: true,
        type: true,
        code: true,
        label: true,
        nameKo: true,
        nameEn: true,
        nameVi: true,
        sortOrder: true,
      },
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
    }),
    buildUsageMap(),
    hasRelationTable(),
  ]);

  const bySignature = new Map();
  for (const row of options) {
    const signature = signatureOfOption(row);
    if (!bySignature.has(signature)) bySignature.set(signature, []);
    bySignature.get(signature).push(row);
  }

  const duplicateGroups = [];
  for (const group of bySignature.values()) {
    if (group.length < 2) continue;
    const enriched = group.map((row) => {
      const usageKey = `${row.type}:${normalizeCode(row.code)}`;
      const usageSet = usageMap.get(usageKey) || new Set();
      return {
        ...row,
        usedByCount: usageSet.size,
        referenceCount: usageSet.size,
      };
    });
    duplicateGroups.push(enriched.sort(sortByCanonicalPriority));
  }

  let removedCount = 0;
  const removedRows = [];
  const keptUsedRows = [];
  const plans = [];

  if (APPLY) {
    await prisma.$transaction(async (tx) => {
      for (const group of duplicateGroups) {
        const [canonical, ...candidates] = group;
        for (const candidate of candidates) {
          const isUsed = Number(candidate.usedByCount || 0) > 0;
          if (isUsed) {
            keptUsedRows.push({
              id: candidate.id,
              type: candidate.type,
              code: candidate.code,
              keptBecause: "USED_IN_STYLE_PROCESS",
              usedByCount: candidate.usedByCount,
              canonicalId: canonical.id,
              canonicalCode: canonical.code,
            });
            continue;
          }

          plans.push({
            id: candidate.id,
            type: candidate.type,
            code: candidate.code,
            canonicalId: canonical.id,
            canonicalCode: canonical.code,
          });

          await rewireRelationsForDuplicate({
            duplicateId: candidate.id,
            canonicalId: canonical.id,
            relationTableExists,
          });

          await tx.processMasterOption.delete({
            where: { id: candidate.id },
          });

          removedCount += 1;
          removedRows.push({
            id: candidate.id,
            type: candidate.type,
            code: candidate.code,
            canonicalId: canonical.id,
            canonicalCode: canonical.code,
          });
        }
      }
    });
  } else {
    for (const group of duplicateGroups) {
      const [canonical, ...candidates] = group;
      for (const candidate of candidates) {
        const isUsed = Number(candidate.usedByCount || 0) > 0;
        if (isUsed) {
          keptUsedRows.push({
            id: candidate.id,
            type: candidate.type,
            code: candidate.code,
            keptBecause: "USED_IN_STYLE_PROCESS",
            usedByCount: candidate.usedByCount,
            canonicalId: canonical.id,
            canonicalCode: canonical.code,
          });
          continue;
        }
        plans.push({
          id: candidate.id,
          type: candidate.type,
          code: candidate.code,
          canonicalId: canonical.id,
          canonicalCode: canonical.code,
        });
      }
    }
  }

  const summary = {
    mode: APPLY ? "apply" : "dry-run",
    optionCount: options.length,
    duplicateGroupCount: duplicateGroups.length,
    plannedRemovalCount: plans.length,
    removedCount,
    keptUsedCount: keptUsedRows.length,
    relationTableExists,
    plannedRemovals: plans,
    removedRows,
    keptUsedRows,
  };

  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error("[cleanup-process-master-duplicates] failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
