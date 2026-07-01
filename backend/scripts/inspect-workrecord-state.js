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
  "styleName",
  "processId",
  "processCode",
  "colorId",
  "colorCode",
];

const CANONICAL_COLUMNS = [
  "assignmentPlanId",
  "styleId",
  "styleProcessId",
  "workerId",
  "lineId",
  "effectiveCoverageStartDate",
  "effectiveCoverageEndDate",
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

async function loadRowCount() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT COUNT(*)::int AS total
    FROM "WorkRecord"
  `);
  return Number(rows?.[0]?.total || 0);
}

async function loadNullSummary(columnSet, styleIdDataType) {
  const counters = [];

  if (columnSet.has("assignmentPlanId")) {
    counters.push(
      `COUNT(*) FILTER (WHERE ${quoteIdent("assignmentPlanId")} IS NULL)::int AS assignment_plan_nulls`
    );
  }
  if (columnSet.has("workerId")) {
    counters.push(
      `COUNT(*) FILTER (WHERE ${quoteIdent("workerId")} IS NULL)::int AS worker_id_nulls`
    );
  }
  if (columnSet.has("styleId")) {
    const styleIdIsText = styleIdDataType === "text";
    counters.push(
      `COUNT(*) FILTER (WHERE ${quoteIdent("styleId")} IS NULL)::int AS style_id_nulls`
    );
    if (styleIdIsText) {
      counters.push(
        `COUNT(*) FILTER (WHERE COALESCE(BTRIM(${quoteIdent("styleId")}), '') = '')::int AS style_id_blank_or_nulls`
      );
    }
  }
  if (columnSet.has("styleProcessId")) {
    counters.push(
      `COUNT(*) FILTER (WHERE ${quoteIdent("styleProcessId")} IS NULL)::int AS style_process_nulls`
    );
  }
  if (columnSet.has("processCode")) {
    counters.push(
      `COUNT(*) FILTER (WHERE COALESCE(BTRIM(${quoteIdent("processCode")}), '') = '')::int AS process_code_blank_or_nulls`
    );
  }
  if (columnSet.has("lineId")) {
    counters.push(
      `COUNT(*) FILTER (WHERE ${quoteIdent("lineId")} IS NULL)::int AS line_id_nulls`
    );
  }
  if (columnSet.has("orderNo")) {
    counters.push(
      `COUNT(*) FILTER (WHERE COALESCE(BTRIM(${quoteIdent("orderNo")}), '') = '')::int AS order_no_blank_or_nulls`
    );
  }
  if (columnSet.has("customerName")) {
    counters.push(
      `COUNT(*) FILTER (WHERE COALESCE(BTRIM(${quoteIdent("customerName")}), '') = '')::int AS customer_name_blank_or_nulls`
    );
  }
  if (columnSet.has("colorId")) {
    counters.push(
      `COUNT(*) FILTER (WHERE ${quoteIdent("colorId")} IS NULL)::int AS color_id_nulls`
    );
  }

  if (counters.length === 0) return {};

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      ${counters.join(",\n      ")}
    FROM "WorkRecord"
  `);
  return rows?.[0] || {};
}

async function loadSamples(columnSet) {
  const whereClauses = [];
  const selectColumns = ["id", "orgId", "workLogId"];

  if (columnSet.has("assignmentPlanId")) {
    whereClauses.push(`${quoteIdent("assignmentPlanId")} IS NULL`);
    selectColumns.push("assignmentPlanId");
  }
  if (columnSet.has("workerId")) {
    whereClauses.push(`${quoteIdent("workerId")} IS NULL`);
    selectColumns.push("workerId");
  }
  if (columnSet.has("styleId")) {
    whereClauses.push(`${quoteIdent("styleId")} IS NULL`);
    selectColumns.push("styleId");
  }
  if (columnSet.has("styleProcessId")) {
    whereClauses.push(`${quoteIdent("styleProcessId")} IS NULL`);
    selectColumns.push("styleProcessId");
  }
  if (columnSet.has("processCode")) {
    whereClauses.push(`COALESCE(BTRIM(${quoteIdent("processCode")}), '') = ''`);
    selectColumns.push("processCode");
  }
  if (columnSet.has("styleName")) selectColumns.push("styleName");
  if (columnSet.has("orderNo")) selectColumns.push("orderNo");
  if (columnSet.has("lineId")) selectColumns.push("lineId");

  if (whereClauses.length === 0) return [];

  const rows = await prisma.$queryRawUnsafe(`
    SELECT
      ${selectColumns.map((column) => quoteIdent(column)).join(", ")}
    FROM "WorkRecord"
    WHERE ${whereClauses.join(" OR ")}
    ORDER BY "id" ASC
    LIMIT 20
  `);
  return rows;
}

async function main() {
  const columns = await loadColumns();
  const columnSet = new Set(columns.map((row) => String(row.column_name)));
  const styleIdColumn = columns.find((row) => row.column_name === "styleId") || null;
  const styleIdDataType = styleIdColumn?.data_type || null;

  const total = await loadRowCount();
  const nullSummary = await loadNullSummary(columnSet, styleIdDataType);
  const samples = await loadSamples(columnSet);

  const hasLegacyColumns = LEGACY_COLUMNS.filter((column) => columnSet.has(column));
  const hasCanonicalColumns = CANONICAL_COLUMNS.filter((column) => columnSet.has(column));

  const report = {
    checkedAt: new Date().toISOString(),
    workRecord: {
      total,
      styleIdDataType,
      columns: columns.map((row) => ({
        columnName: row.column_name,
        dataType: row.data_type,
      })),
      legacyColumnsPresent: hasLegacyColumns,
      canonicalColumnsPresent: hasCanonicalColumns,
      isLegacySchema:
        hasLegacyColumns.length > 0 ||
        styleIdDataType === "text" ||
        !columnSet.has("styleProcessId"),
      isCanonicalSchema:
        hasLegacyColumns.length === 0 &&
        styleIdDataType === "integer" &&
        columnSet.has("styleProcessId"),
      nullSummary,
      samples,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error("[inspect-workrecord-state] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
