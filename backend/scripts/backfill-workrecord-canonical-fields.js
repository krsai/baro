#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const LEGACY_COLUMNS = [
  "workerName",
  "customerName",
  "orderNo",
  "styleUid",
  "styleName",
  "processId",
  "processCode",
  "colorId",
  "colorCode",
];

const quoteIdent = (value) => `"${String(value).replace(/"/g, "\"\"")}"`;

async function loadColumns() {
  return prisma.$queryRawUnsafe(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'WorkRecord'
    ORDER BY ordinal_position
  `);
}

async function loadNullSummary(columnSet) {
  const counters = [];
  ["assignmentPlanId", "workerId", "styleId", "styleProcessId"].forEach((column) => {
    if (!columnSet.has(column)) return;
    counters.push(
      `COUNT(*) FILTER (WHERE ${quoteIdent(column)} IS NULL)::int AS ${column.toLowerCase()}_nulls`
    );
  });
  if (counters.length === 0) return {};
  const rows = await prisma.$queryRawUnsafe(`
    SELECT ${counters.join(", ")}
    FROM "WorkRecord"
  `);
  return rows?.[0] || {};
}

async function main() {
  const columns = await loadColumns();
  const columnSet = new Set(columns.map((row) => String(row.column_name)));
  const legacyColumnsPresent = LEGACY_COLUMNS.filter((column) => columnSet.has(column));
  const styleIdColumn = columns.find((row) => row.column_name === "styleId") || null;
  const nullSummary = await loadNullSummary(columnSet);

  const report = {
    checkedAt: new Date().toISOString(),
    message:
      "This command no longer writes WorkRecord data. Exact backfill and legacy column drops are managed only by backend/migration_fix.sql.",
    workRecord: {
      styleIdDataType: styleIdColumn?.data_type || null,
      legacyColumnsPresent,
      requiredColumnsPresent: {
        assignmentPlanId: columnSet.has("assignmentPlanId"),
        workerId: columnSet.has("workerId"),
        styleId: columnSet.has("styleId"),
        styleProcessId: columnSet.has("styleProcessId"),
      },
      nullSummary,
    },
    nextStep:
      legacyColumnsPresent.length > 0 || styleIdColumn?.data_type !== "integer"
        ? "Run the deploy/predeploy migration path that applies backend/migration_fix.sql against the target DB."
        : "Schema is canonical. Investigate any nullSummary values before accepting new WorkRecord writes.",
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error("[backfill-workrecord-canonical-fields] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
