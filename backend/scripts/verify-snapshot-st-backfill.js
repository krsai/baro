#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.DIRECT_URL = String(process.env.DIRECT_URL || process.env.DATABASE_URL || "").trim();
process.env.DATABASE_URL = String(process.env.DATABASE_URL || process.env.DIRECT_URL || "").trim();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const toNumber = (value) => {
  if (typeof value === "bigint") return Number(value);
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const printRows = (title, rows) => {
  if (!rows || rows.length === 0) return;
  console.log(`\n${title}`);
  rows.forEach((row, index) => {
    console.log(`${index + 1}. ${JSON.stringify(row)}`);
  });
};

const main = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL or DIRECT_URL is required");
  }

  const [summary] = await prisma.$queryRawUnsafe(`
WITH snapshot_process_rows AS (
  SELECT
    plan."id" AS "planDbId",
    plan."externalId",
    plan."orgId",
    COALESCE(plan."cardId", plan."originOrderId", '') AS "cardIdentityText",
    NULLIF(SPLIT_PART(COALESCE(plan."cardId", plan."originOrderId", ''), '::', 2), '') AS "styleId",
    CASE
      WHEN COALESCE(plan."quantity", 1) >= 10000 THEN 10000
      WHEN COALESCE(plan."quantity", 1) >= 5000 THEN 5000
      WHEN COALESCE(plan."quantity", 1) >= 3000 THEN 3000
      WHEN COALESCE(plan."quantity", 1) >= 1000 THEN 1000
      WHEN COALESCE(plan."quantity", 1) >= 500 THEN 500
      WHEN COALESCE(plan."quantity", 1) >= 300 THEN 300
      WHEN COALESCE(plan."quantity", 1) >= 100 THEN 100
      WHEN COALESCE(plan."quantity", 1) >= 50 THEN 50
      WHEN COALESCE(plan."quantity", 1) >= 30 THEN 30
      WHEN COALESCE(plan."quantity", 1) >= 10 THEN 10
      WHEN COALESCE(plan."quantity", 1) >= 5 THEN 5
      WHEN COALESCE(plan."quantity", 1) >= 3 THEN 3
      ELSE 1
    END AS "bucketQuantity",
    ROUND((process ->> 'stSeconds')::numeric)::double precision AS "bucketStSeconds",
    LOWER(BTRIM(COALESCE(process ->> 'processCode', process ->> 'code', ''))) AS "processCodeKey",
    LOWER(BTRIM(COALESCE(process ->> 'processKey', ''))) AS "processKey",
    LOWER(BTRIM(REGEXP_REPLACE(COALESCE(process ->> 'processKey', ''), '-[0-9]+-[0-9]+$', ''))) AS "processKeyBase",
    LOWER(BTRIM(COALESCE(process ->> 'name', process ->> 'processName', process ->> 'label', ''))) AS "processNameKey"
  FROM "AssignmentPlan" plan
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
        THEN plan."assignmentCtSnapshot"::jsonb -> 'processes'
      ELSE '[]'::jsonb
    END
  ) process
  WHERE plan."isCompleted" = FALSE
    AND plan."assignmentCtSnapshot" IS NOT NULL
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
    AND process ? 'stSeconds'
    AND (process ->> 'stSeconds') ~ '^[0-9]+(\\.[0-9]+)?$'
    AND (process ->> 'stSeconds')::numeric > 0
),
style_targets AS (
  SELECT
    target.*,
    style."uid" AS "styleUid"
  FROM snapshot_process_rows target
  LEFT JOIN "Style" style
    ON style."orgId" = target."orgId"
   AND style."styleId" = target."styleId"
),
matched_process_targets AS (
  SELECT DISTINCT
    target."orgId",
    target."styleUid",
    target."bucketQuantity",
    style_process."id" AS "styleProcessId"
  FROM style_targets target
  JOIN "StyleProcess" style_process
    ON style_process."orgId" = target."orgId"
   AND style_process."styleUid" = target."styleUid"
   AND (
      LOWER(BTRIM(style_process."processCode")) = target."processCodeKey"
      OR LOWER(BTRIM(style_process."processCode")) = target."processKey"
      OR LOWER(BTRIM(style_process."processCode")) = target."processKeyBase"
      OR LOWER(BTRIM(style_process."processName")) = target."processNameKey"
   )
)
SELECT
  (SELECT COUNT(*) FROM snapshot_process_rows) AS "snapshotStProcessRows",
  (SELECT COUNT(*) FROM style_targets WHERE "styleUid" IS NULL) AS "styleLookupFailures",
  (
    SELECT COUNT(*)
    FROM style_targets target
    WHERE target."styleUid" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "StyleProcess" style_process
        WHERE style_process."orgId" = target."orgId"
          AND style_process."styleUid" = target."styleUid"
          AND (
            LOWER(BTRIM(style_process."processCode")) = target."processCodeKey"
            OR LOWER(BTRIM(style_process."processCode")) = target."processKey"
            OR LOWER(BTRIM(style_process."processCode")) = target."processKeyBase"
            OR LOWER(BTRIM(style_process."processName")) = target."processNameKey"
          )
      )
  ) AS "unmatchedProcesses",
  (
    SELECT COUNT(*)
    FROM matched_process_targets matched
    LEFT JOIN "StyleProcessStandard" sps
      ON sps."styleProcessId" = matched."styleProcessId"
     AND sps."bucketQuantity" = matched."bucketQuantity"
    WHERE sps."id" IS NULL
       OR sps."bucketStSeconds" <= 0
  ) AS "missingOrZeroStandards",
  (
    SELECT COUNT(*)
    FROM "AssignmentPlan"
    WHERE "isCompleted" = FALSE
      AND "completedAt" IS NOT NULL
  ) AS "completionInconsistencyRows";
`);

  const counts = {
    snapshotStProcessRows: toNumber(summary?.snapshotStProcessRows),
    styleLookupFailures: toNumber(summary?.styleLookupFailures),
    unmatchedProcesses: toNumber(summary?.unmatchedProcesses),
    missingOrZeroStandards: toNumber(summary?.missingOrZeroStandards),
    completionInconsistencyRows: toNumber(summary?.completionInconsistencyRows),
  };

  console.log("Snapshot ST backfill verification");
  Object.entries(counts).forEach(([key, value]) => {
    console.log(`${key}: ${value}`);
  });

  const blockers =
    counts.styleLookupFailures +
    counts.unmatchedProcesses +
    counts.missingOrZeroStandards +
    counts.completionInconsistencyRows;

  if (blockers === 0) {
    console.log("\nPASS: Phase 7 snapshot ST field removal can proceed.");
    return;
  }

  const styleSamples = await prisma.$queryRawUnsafe(`
WITH snapshot_process_rows AS (
  SELECT
    plan."externalId",
    plan."orgId",
    COALESCE(plan."cardId", plan."originOrderId", '') AS "cardIdentityText",
    NULLIF(SPLIT_PART(COALESCE(plan."cardId", plan."originOrderId", ''), '::', 2), '') AS "styleId"
  FROM "AssignmentPlan" plan
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
        THEN plan."assignmentCtSnapshot"::jsonb -> 'processes'
      ELSE '[]'::jsonb
    END
  ) process
  WHERE plan."isCompleted" = FALSE
    AND plan."assignmentCtSnapshot" IS NOT NULL
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
    AND process ? 'stSeconds'
    AND (process ->> 'stSeconds') ~ '^[0-9]+(\\.[0-9]+)?$'
    AND (process ->> 'stSeconds')::numeric > 0
)
SELECT DISTINCT target."externalId", target."orgId", target."cardIdentityText", target."styleId"
FROM snapshot_process_rows target
LEFT JOIN "Style" style
  ON style."orgId" = target."orgId"
 AND style."styleId" = target."styleId"
WHERE style."uid" IS NULL
LIMIT 10;
`);

  const processSamples = await prisma.$queryRawUnsafe(`
WITH snapshot_process_rows AS (
  SELECT
    plan."externalId",
    plan."orgId",
    NULLIF(SPLIT_PART(COALESCE(plan."cardId", plan."originOrderId", ''), '::', 2), '') AS "styleId",
    LOWER(BTRIM(COALESCE(process ->> 'processCode', process ->> 'code', ''))) AS "processCodeKey",
    LOWER(BTRIM(COALESCE(process ->> 'processKey', ''))) AS "processKey",
    LOWER(BTRIM(REGEXP_REPLACE(COALESCE(process ->> 'processKey', ''), '-[0-9]+-[0-9]+$', ''))) AS "processKeyBase",
    LOWER(BTRIM(COALESCE(process ->> 'name', process ->> 'processName', process ->> 'label', ''))) AS "processNameKey"
  FROM "AssignmentPlan" plan
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
        THEN plan."assignmentCtSnapshot"::jsonb -> 'processes'
      ELSE '[]'::jsonb
    END
  ) process
  WHERE plan."isCompleted" = FALSE
    AND plan."assignmentCtSnapshot" IS NOT NULL
    AND jsonb_typeof(plan."assignmentCtSnapshot"::jsonb -> 'processes') = 'array'
    AND process ? 'stSeconds'
    AND (process ->> 'stSeconds') ~ '^[0-9]+(\\.[0-9]+)?$'
    AND (process ->> 'stSeconds')::numeric > 0
),
style_targets AS (
  SELECT target.*, style."uid" AS "styleUid"
  FROM snapshot_process_rows target
  JOIN "Style" style
    ON style."orgId" = target."orgId"
   AND style."styleId" = target."styleId"
)
SELECT target."externalId", target."orgId", target."styleId",
  target."processCodeKey", target."processKey", target."processKeyBase", target."processNameKey"
FROM style_targets target
WHERE NOT EXISTS (
  SELECT 1
  FROM "StyleProcess" style_process
  WHERE style_process."orgId" = target."orgId"
    AND style_process."styleUid" = target."styleUid"
    AND (
      LOWER(BTRIM(style_process."processCode")) = target."processCodeKey"
      OR LOWER(BTRIM(style_process."processCode")) = target."processKey"
      OR LOWER(BTRIM(style_process."processCode")) = target."processKeyBase"
      OR LOWER(BTRIM(style_process."processName")) = target."processNameKey"
    )
)
LIMIT 10;
`);

  printRows("Style lookup failure samples", styleSamples);
  printRows("Unmatched process samples", processSamples);
  throw new Error("Snapshot ST backfill verification failed; do not remove snapshot ST fields.");
};

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
