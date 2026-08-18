#!/usr/bin/env node
"use strict";

// Copies existing WorkRecord rows with isOutsourced=true into the new
// OutsourcedWorkRecord table, then deletes the originals. Must run BEFORE
// the migration_fix.sql "Step 0s" block, which drops WorkRecord's legacy
// isOutsourced/outsourceVendorName/outsourceUnitPrice/outsourcingPartnerId
// columns (that block already skips the drop while any isOutsourced=true
// row remains, but this script is what actually clears them safely).
//
// Usage:
//   node scripts/migrate-outsourced-work-records.js [--org-id <id>] [--apply]
//
// Dry-run by default. Pass --apply to actually write/delete rows. A JSON
// backup of every row this script moves is written to ../../backups first.

const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const orgArgIndex = process.argv.indexOf("--org-id");
const inlineOrgArg = process.argv.find((item) => item.startsWith("--org-id="));
const orgIdFilter = orgArgIndex >= 0
  ? Number(process.argv[orgArgIndex + 1])
  : inlineOrgArg
    ? Number(inlineOrgArg.split("=")[1])
    : null;
if (orgIdFilter !== null && (!Number.isInteger(orgIdFilter) || orgIdFilter <= 0)) {
  throw new Error("Usage: node scripts/migrate-outsourced-work-records.js [--org-id <id>] [--apply]");
}

const main = async () => {
  const legacyRows = await prisma.$queryRaw`
    SELECT "id", "orgId", "workLogId", "outsourcingPartnerId", "outsourceVendorName",
           "outsourceUnitPrice", "lineId", "styleId", "styleProcessId", "assignmentPlanId",
           "quantity", "createdAt", "createdBy", "createdByEmployeeId", "updatedByEmployeeId"
    FROM "WorkRecord"
    WHERE "isOutsourced" = true
      AND (${orgIdFilter}::integer IS NULL OR "orgId" = ${orgIdFilter})
  `;

  const blocked = legacyRows.filter(
    (row) => !row.outsourcingPartnerId || !row.outsourceVendorName || row.outsourceUnitPrice === null
  );
  const migratable = legacyRows.filter((row) => !blocked.includes(row));

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    orgIdFilter,
    legacyRowCount: legacyRows.length,
    migratableCount: migratable.length,
    blockedCount: blocked.length,
    blocked: blocked.map((row) => ({
      id: row.id,
      reason: !row.outsourcingPartnerId
        ? "missing outsourcingPartnerId (free-text-only legacy row; register a business partner and re-enter manually under the new 외주 내역 menu instead)"
        : "missing vendor name or unit price",
    })),
  }, null, 2));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to migrate rows.");
    return;
  }
  if (migratable.length === 0) {
    console.log("Nothing to migrate.");
    return;
  }

  const backupDir = path.resolve(__dirname, "..", "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `outsourced-work-record-migration-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(legacyRows, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value, 2));

  let migratedCount = 0;
  for (const row of migratable) {
    await prisma.$transaction(async (tx) => {
      await tx.outsourcedWorkRecord.create({
        data: {
          orgId: row.orgId,
          workLogId: row.workLogId,
          outsourcingPartnerId: row.outsourcingPartnerId,
          outsourceVendorName: row.outsourceVendorName,
          outsourceUnitPrice: row.outsourceUnitPrice,
          lineId: row.lineId,
          styleId: row.styleId,
          styleProcessId: row.styleProcessId,
          assignmentPlanId: row.assignmentPlanId,
          quantity: row.quantity,
          createdAt: row.createdAt,
          createdBy: row.createdBy,
          createdByEmployeeId: row.createdByEmployeeId,
          updatedByEmployeeId: row.updatedByEmployeeId,
        },
      });
      await tx.workRecord.delete({ where: { id: row.id } });
    });
    migratedCount += 1;
  }

  console.log(JSON.stringify({
    migratedCount,
    blockedCount: blocked.length,
    backupPath,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
