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

// This compares jsonb_array_length(items) against COUNT(WorkOrderItem) per order,
// not just "zero relational rows". A partial mismatch (e.g. JSON has 3 items but
// only 1 WorkOrderItem row exists) is just as unsafe to drop the JSON column over
// as a fully-missing order, and the earlier "only checks for zero rows" version of
// this script would have silently passed that case.
const MISMATCH_QUERY = `
SELECT
  w.id,
  w."orgId",
  w."orderId",
  w."orderNumber",
  jsonb_array_length(w."items"::jsonb) AS "jsonItemCount",
  COUNT(wi.id) AS "relationItemCount"
FROM "WorkOrder" w
LEFT JOIN "WorkOrderItem" wi ON wi."workOrderId" = w.id
WHERE w."items" IS NOT NULL
  AND jsonb_typeof(w."items"::jsonb) = 'array'
  AND jsonb_array_length(w."items"::jsonb) > 0
GROUP BY w.id, w."orgId", w."orderId", w."orderNumber", w."items"
HAVING jsonb_array_length(w."items"::jsonb) <> COUNT(wi.id)
`;

const main = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL or DIRECT_URL is required");
  }

  const mismatches = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS "count" FROM (${MISMATCH_QUERY}) m`
  );
  const ordersWithItemCountMismatch = toNumber(mismatches?.[0]?.count);

  console.log("WorkOrderItem backfill verification");
  console.log(`ordersWithItemCountMismatch: ${ordersWithItemCountMismatch}`);

  if (ordersWithItemCountMismatch === 0) {
    console.log(
      "\nPASS: every WorkOrder with non-empty items JSON has a matching WorkOrderItem row count. Safe to drop WorkOrder.items after a final manual review."
    );
    return;
  }

  const samples = await prisma.$queryRawUnsafe(`${MISMATCH_QUERY} ORDER BY w.id LIMIT 20;`);
  printRows("Orders with WorkOrder.items JSON / WorkOrderItem row count mismatch", samples);
  throw new Error(
    "WorkOrderItem backfill verification failed; do not drop WorkOrder.items until every order above is resolved (rerun migration_fix.sql for zero-row cases; partial mismatches need manual review since automatic backfill cannot safely tell which JSON items are already represented)."
  );
};

main()
  .catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
