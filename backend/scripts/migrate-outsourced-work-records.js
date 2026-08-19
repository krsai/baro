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

  // A WorkLog's children must live in exactly one table (WorkRecord XOR
  // OutsourcedWorkRecord - see AGENTS.md). The source WorkLog for a legacy
  // isOutsourced=true row predates that rule and may still have real
  // employee WorkRecord rows alongside it (a mixed monthly batch). Moving
  // the row without also fixing up its WorkLog parent leaves an
  // EMPLOYEE-kind WorkLog with OutsourcedWorkRecord children, which the
  // 외주 내역 list (filtered by WorkLog.recordKind=OUTSOURCING) then can't
  // find even though GET /business-partners/:id/history (reads
  // OutsourcedWorkRecord directly) shows it fine - this bit us for real in
  // production on 2026-08-19.
  const sourceWorkLogIds = Array.from(new Set(migratable.map((row) => row.workLogId)));
  const sourceWorkLogs = await prisma.workLog.findMany({
    where: { id: { in: sourceWorkLogIds } },
  });
  const sourceWorkLogById = new Map(sourceWorkLogs.map((workLog) => [workLog.id, workLog]));
  const remainingEmployeeCounts = await prisma.workRecord.groupBy({
    by: ["workLogId"],
    where: { workLogId: { in: sourceWorkLogIds }, isOutsourced: false },
    _count: { _all: true },
  });
  const remainingEmployeeCountByWorkLogId = new Map(
    remainingEmployeeCounts.map((row) => [row.workLogId, row._count._all])
  );

  const targetWorkLogIdBySourceId = new Map();
  for (const workLogId of sourceWorkLogIds) {
    const sourceWorkLog = sourceWorkLogById.get(workLogId);
    if (!sourceWorkLog) {
      // Source WorkLog missing entirely - leave the row pointed at its
      // current (dangling) workLogId rather than guessing a replacement.
      targetWorkLogIdBySourceId.set(workLogId, workLogId);
      continue;
    }
    const hasRemainingEmployeeRows =
      (remainingEmployeeCountByWorkLogId.get(workLogId) || 0) > 0;
    if (!hasRemainingEmployeeRows) {
      // Nothing employee-side left on this WorkLog - it was entirely
      // outsourced, so just flip it to OUTSOURCING in place instead of
      // creating a redundant sibling.
      if (sourceWorkLog.recordKind !== "OUTSOURCING") {
        await prisma.workLog.update({
          where: { id: workLogId },
          data: { recordKind: "OUTSOURCING" },
        });
      }
      targetWorkLogIdBySourceId.set(workLogId, workLogId);
    } else {
      const rowCountForThisWorkLog = migratable.filter(
        (row) => row.workLogId === workLogId
      ).length;
      const newWorkLog = await prisma.workLog.create({
        data: {
          orgId: sourceWorkLog.orgId,
          displayDate: sourceWorkLog.displayDate,
          factoryId: sourceWorkLog.factoryId,
          ctBasis: sourceWorkLog.ctBasis,
          note: `[외주 분리 마이그레이션] WorkLog#${workLogId}에서 이관된 외주 작업기록 전용 헤더 (${stamp.slice(0, 10)})`,
          records: sourceWorkLog.records ?? undefined,
          coverageStartDate: sourceWorkLog.coverageStartDate,
          coverageEndDate: sourceWorkLog.coverageEndDate,
          entryMode: sourceWorkLog.entryMode,
          recordKind: "OUTSOURCING",
          itemCount: rowCountForThisWorkLog,
        },
      });
      targetWorkLogIdBySourceId.set(workLogId, newWorkLog.id);
    }
  }

  let migratedCount = 0;
  for (const row of migratable) {
    const targetWorkLogId = targetWorkLogIdBySourceId.get(row.workLogId) ?? row.workLogId;
    await prisma.$transaction(async (tx) => {
      await tx.outsourcedWorkRecord.create({
        data: {
          orgId: row.orgId,
          workLogId: targetWorkLogId,
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
