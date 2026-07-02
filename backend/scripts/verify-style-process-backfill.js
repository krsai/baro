#!/usr/bin/env node
"use strict";

// Diagnostic only — this does NOT backfill anything. Style.processes JSON has
// multi-tier fallback normalization (code resolution, composition-derived names,
// PT-derived ST buckets) that only the app's own syncStyleProcessStorageForStyle
// logic reproduces safely. The real backfill mechanism is the app itself: calling
// GET /styles?includeProcesses=1 (or opening+saving a style) for any styleId this
// script reports runs that logic and permanently migrates the style to relational
// storage. This script only tells you which styles still need that trigger.

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
SELECT
  (
    SELECT COUNT(*)
    FROM "Style" s
    WHERE s."processes" IS NOT NULL
      AND jsonb_typeof(s."processes"::jsonb) = 'array'
      AND jsonb_array_length(s."processes"::jsonb) > 0
      AND NOT EXISTS (
        SELECT 1 FROM "StyleProcess" sp WHERE sp."styleId" = s.id
      )
  ) AS "stylesMissingRelationalProcesses"
`);

  const stylesMissingRelationalProcesses = toNumber(
    summary?.stylesMissingRelationalProcesses
  );

  console.log("Style.processes -> StyleProcess self-heal backfill diagnostic");
  console.log(`stylesMissingRelationalProcesses: ${stylesMissingRelationalProcesses}`);

  if (stylesMissingRelationalProcesses === 0) {
    console.log(
      "\nPASS: every style with non-empty processes JSON already has StyleProcess rows. Safe to drop Style.processes after a final manual review."
    );
    return;
  }

  const samples = await prisma.$queryRawUnsafe(`
SELECT s."orgId", s.id AS "styleId", s."code", s."name", jsonb_array_length(s."processes"::jsonb) AS "jsonProcessCount"
FROM "Style" s
WHERE s."processes" IS NOT NULL
  AND jsonb_typeof(s."processes"::jsonb) = 'array'
  AND jsonb_array_length(s."processes"::jsonb) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "StyleProcess" sp WHERE sp."styleId" = s.id
  )
LIMIT 20;
`);

  printRows(
    "Styles still relying on Style.processes JSON (call GET /styles?includeProcesses=1 for these orgs, or open+save the style, to migrate)",
    samples
  );
  console.log(
    "\nNOT A FAILURE by itself — this is expected until every legacy style has been touched once. Do not drop Style.processes until this count reaches 0."
  );
  process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
