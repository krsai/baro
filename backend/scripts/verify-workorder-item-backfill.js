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
SELECT
  (
    SELECT COUNT(*)
    FROM "WorkOrder" w
    WHERE w."items" IS NOT NULL
      AND jsonb_typeof(w."items"::jsonb) = 'array'
      AND jsonb_array_length(w."items"::jsonb) > 0
      AND NOT EXISTS (
        SELECT 1 FROM "WorkOrderItem" wi WHERE wi."workOrderId" = w.id
      )
  ) AS "ordersMissingRelationalItems"
`);

  const ordersMissingRelationalItems = toNumber(summary?.ordersMissingRelationalItems);

  console.log("WorkOrderItem backfill verification");
  console.log(`ordersMissingRelationalItems: ${ordersMissingRelationalItems}`);

  if (ordersMissingRelationalItems === 0) {
    console.log(
      "\nPASS: every WorkOrder with non-empty items JSON has matching WorkOrderItem rows. Safe to drop WorkOrder.items after a final manual review."
    );
    return;
  }

  const samples = await prisma.$queryRawUnsafe(`
SELECT w."orgId", w."orderId", w."orderNumber", jsonb_array_length(w."items"::jsonb) AS "jsonItemCount"
FROM "WorkOrder" w
WHERE w."items" IS NOT NULL
  AND jsonb_typeof(w."items"::jsonb) = 'array'
  AND jsonb_array_length(w."items"::jsonb) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "WorkOrderItem" wi WHERE wi."workOrderId" = w.id
  )
LIMIT 10;
`);

  printRows("Orders still missing WorkOrderItem rows", samples);
  throw new Error(
    "WorkOrderItem backfill verification failed; run migration_fix.sql against this database before dropping WorkOrder.items."
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
