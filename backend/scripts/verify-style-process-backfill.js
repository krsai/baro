#!/usr/bin/env node
"use strict";

// Diagnostic only — this does NOT backfill anything. Style.processes JSON has
// multi-tier fallback normalization (code resolution, composition-derived names,
// PT-derived ST buckets) that only the app's own syncStyleProcessStorageForStyle
// logic reproduces safely. The real backfill mechanism is the app itself: calling
// GET /styles?includeProcesses=1 (or opening+saving a style) for any styleId this
// script reports runs that logic and permanently migrates the style to relational
// storage. This script only tells you which styles still need that trigger.
//
// This checks a JSON-item-count vs. StyleProcess-row-count mismatch, not just
// "zero relational rows" — a style with 5 JSON processes but only 3 StyleProcess
// rows is just as unsafe to drop Style.processes over as one with zero rows, and
// a "only checks for zero" version of this script would silently pass that case.

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

// jsonb_array_length raises an error on non-array jsonb, so every call is wrapped in
// this CASE guard rather than trusting AND-clause evaluation order to filter
// non-array rows out first (Postgres does not guarantee that order).
const SAFE_PROCESSES_ARRAY = `CASE WHEN s."processes" IS NOT NULL AND jsonb_typeof(s."processes"::jsonb) = 'array' THEN s."processes"::jsonb ELSE '[]'::jsonb END`;
const MISMATCH_QUERY = `
SELECT
  s.id AS "styleId",
  s."orgId",
  s."code",
  s."name",
  jsonb_array_length(${SAFE_PROCESSES_ARRAY}) AS "jsonProcessCount",
  COUNT(sp.id) AS "relationProcessCount"
FROM "Style" s
LEFT JOIN "StyleProcess" sp ON sp."styleId" = s.id
WHERE s."processes" IS NOT NULL
  AND jsonb_typeof(s."processes"::jsonb) = 'array'
  AND jsonb_array_length(${SAFE_PROCESSES_ARRAY}) > 0
GROUP BY s.id, s."orgId", s."code", s."name", s."processes"
HAVING jsonb_array_length(${SAFE_PROCESSES_ARRAY}) <> COUNT(sp.id)
`;

const main = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL or DIRECT_URL is required");
  }

  const mismatches = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS "count" FROM (${MISMATCH_QUERY}) m`
  );
  const stylesWithProcessCountMismatch = toNumber(mismatches?.[0]?.count);

  console.log("Style.processes -> StyleProcess self-heal backfill diagnostic");
  console.log(`stylesWithProcessCountMismatch: ${stylesWithProcessCountMismatch}`);

  if (stylesWithProcessCountMismatch === 0) {
    console.log(
      "\nPASS (count check only, not a full field-by-field comparison): every style with non-empty processes JSON has a matching StyleProcess row count. Recommend a final manual review before dropping Style.processes."
    );
    return;
  }

  const samples = await prisma.$queryRawUnsafe(`${MISMATCH_QUERY} ORDER BY s.id LIMIT 20;`);
  printRows(
    "Styles still relying on Style.processes JSON (call GET /styles?includeProcesses=1 for these orgs, or open+save the style, to migrate)",
    samples
  );
  console.log(
    "\nNOT necessarily a failure by itself — this is expected until every legacy style has been touched once. Do not drop Style.processes until this count reaches 0."
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
