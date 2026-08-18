#!/usr/bin/env node
"use strict";

// Creates the missing Ver.1 `StyleProcessVersion` snapshot for every style
// that already has `StyleProcess` rows but has never had any
// `StyleProcessVersion` created. Normally Ver.1 is only created lazily the
// moment a style's first `AssignmentPlan` is created (see
// `ensureInitialStyleProcessVersion` in src/index.ts). Styles that have
// processes registered but were never assigned to a line therefore have no
// version at all, which is why the "공정 버전 관리" dialog shows an empty
// state for them.
//
// This script mirrors the exact snapshot shape that
// `ensureInitialStyleProcessVersion`/`buildStyleProcessMirrorFromRows`
// build in the running app (including the manufacturer<->brand relationship
// active quantity-bucket-version resolution used to select which
// `StyleProcessStandard` rows are "active" ST buckets), so freshly created
// assignments for these styles compute the same PT/ST/CT as they would if
// Ver.1 had been created the normal way.
//
// Usage:
//   node scripts/backfill-initial-style-process-versions.js [--org-id <id>] [--apply]
//
// Dry-run by default. Pass --apply to actually write rows. A JSON backup of
// every row this script intends to create is written to ../../backups
// before any write happens.

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
  throw new Error("Usage: node scripts/backfill-initial-style-process-versions.js [--org-id <id>] [--apply]");
}

const DEFAULT_TIME_REF_QUANTITY = 1000;

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const toOptionalProcessSeconds = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed));
};

const isoOrNull = (value) => (value instanceof Date ? value.toISOString() : value ?? null);

const todayDateKey = () => new Date().toISOString().slice(0, 10);

// Mirrors `loadRelationshipTimeBucketContextByStyleId` in src/index.ts: for a
// (manufacturerOrgId, styleId) pair, the "active" ST bucket version is the
// style-specific override on the manufacturer<->brand OrgRelationship if one
// exists, otherwise the relationship's default `timeBucketSetVersion`. If no
// relationship exists at all, there is no active version and the style has
// no usable ST buckets (matches production behavior exactly).
const resolveActiveVersionIdsByStyleScope = async (styleProcessRows) => {
  const scopeByKey = new Map(); // "orgId:styleId" -> { orgId, styleId, brandOrgId }
  for (const row of styleProcessRows) {
    const key = `${row.orgId}:${row.styleId}`;
    if (!scopeByKey.has(key)) {
      scopeByKey.set(key, { orgId: row.orgId, styleId: row.styleId, brandOrgId: row.style.orgId });
    }
  }
  const scopes = Array.from(scopeByKey.values());
  const manufacturerOrgIds = Array.from(new Set(scopes.map((s) => s.orgId)));
  const brandOrgIds = Array.from(new Set(scopes.map((s) => s.brandOrgId)));
  const relationships = await prisma.orgRelationship.findMany({
    where: {
      manufacturerOrgId: { in: manufacturerOrgIds },
      brandOrgId: { in: brandOrgIds },
    },
    select: {
      id: true,
      manufacturerOrgId: true,
      brandOrgId: true,
      timeBucketSetVersionId: true,
      timeBucketOverrides: {
        select: { styleId: true, quantityBucketSetVersionId: true },
      },
    },
  });
  const relByManufacturerBrand = new Map(
    relationships.map((r) => [`${r.manufacturerOrgId}:${r.brandOrgId}`, r])
  );
  const activeVersionIdByScope = new Map(); // "orgId:styleId" -> versionId | null
  for (const scope of scopes) {
    const relationship = relByManufacturerBrand.get(`${scope.orgId}:${scope.brandOrgId}`);
    if (!relationship) {
      activeVersionIdByScope.set(`${scope.orgId}:${scope.styleId}`, null);
      continue;
    }
    const override = relationship.timeBucketOverrides.find((o) => o.styleId === scope.styleId);
    const versionId = override ? override.quantityBucketSetVersionId : relationship.timeBucketSetVersionId;
    activeVersionIdByScope.set(`${scope.orgId}:${scope.styleId}`, versionId ?? null);
  }
  return activeVersionIdByScope;
};

// Mirrors `buildStyleProcessMirrorFromRows` + `normalizeStyleProcess` for the
// fields that actually drive PT/ST/CT computation and process identity.
// Cosmetic fields (localized display names derived from processComposition)
// self-heal on every future read because `processComposition` is copied
// through unmodified and the app re-derives names from it on read.
const buildProcessSnapshotEntry = (row, activeVersionId, index) => {
  const standards = row.standards.filter(
    (standard) => activeVersionId !== null && standard.quantityBucketSetVersionId === activeVersionId
  );
  const stBuckets = standards.map((standard) => ({
    bucketQuantity: toPositiveIntOrNull(standard.quantityBucketEntry?.bucketQuantity),
    bucketStSeconds: toOptionalProcessSeconds(standard.bucketStSeconds),
    setBy: standard.setBy ?? null,
    setAt: isoOrNull(standard.setAt),
    updatedAt: isoOrNull(standard.updatedAt),
  }));
  return {
    id: row.id,
    styleProcessId: row.id,
    code: row.processCode ?? null,
    storageCode: row.processCode ?? null,
    productionStage: row.productionStage,
    name: row.processName ?? null,
    nameKo: row.processName ?? null,
    nameEn: row.processName ?? null,
    nameVi: row.processName ?? null,
    processComposition: row.processComposition ?? null,
    description: row.processDescription ?? null,
    timesPerPiece: row.timesPerPiece ?? 1,
    pt: toOptionalProcessSeconds(row.ptSeconds),
    atParams: row.atParams ?? null,
    atStFallbackApproved: row.atStFallbackApproved === true,
    atStFallbackSourceAssignmentPlanId: toPositiveIntOrNull(row.atStFallbackSourceAssignmentPlanId),
    atStFallbackApprovedAt: isoOrNull(row.atStFallbackApprovedAt),
    atV2Observations: row.atObservations.map((observation) => ({
      assignmentPlanId: toPositiveIntOrNull(observation.assignmentPlanId),
      quantity: toPositiveIntOrNull(observation.quantity),
      allocatedLaborInputSeconds: observation.allocatedLaborInputSeconds ?? null,
      sourceLaborInputSeconds: observation.sourceLaborInputSeconds ?? null,
      unexplainedLaborInputSeconds: observation.unexplainedLaborInputSeconds ?? null,
      perPieceObservedSeconds: observation.perPieceObservedSeconds ?? null,
      workerCount: observation.workerCount ?? 0,
      eventCountMax: observation.eventCountMax ?? null,
      eventCountWeighted: observation.eventCountWeighted ?? null,
      attendanceCoverage: observation.attendanceCoverage ?? null,
      singleProcessLaborShare: observation.singleProcessLaborShare ?? null,
      observationPeriodStartDate: observation.observationPeriodStartDate ?? null,
      observationPeriodEndDate: observation.observationPeriodEndDate ?? null,
      trainedPeriod: observation.trainedPeriod ?? null,
    })),
    stBuckets,
    timeRefQuantity: stBuckets[0]?.bucketQuantity ?? DEFAULT_TIME_REF_QUANTITY,
    workRecordCount: row._count?.workRecords ?? 0,
    hasWorkRecords: (row._count?.workRecords ?? 0) > 0,
    instanceId: `${row.processCode || "PROC"}-${row.id || index}-${index}`,
  };
};

const buildBackfillPlan = async () => {
  const styleProcessRows = await prisma.styleProcess.findMany({
    where: orgIdFilter !== null ? { orgId: orgIdFilter } : {},
    include: {
      standards: {
        orderBy: [{ quantityBucketEntry: { bucketQuantity: "asc" } }, { id: "asc" }],
        include: { quantityBucketEntry: true },
      },
      atObservations: true,
      _count: { select: { workRecords: true } },
      style: { select: { id: true, orgId: true } },
    },
    orderBy: [{ orgId: "asc" }, { styleId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  if (styleProcessRows.length === 0) {
    return { scopes: [], skippedAlreadyVersioned: 0 };
  }

  const scopeKeys = Array.from(new Set(styleProcessRows.map((row) => `${row.orgId}:${row.styleId}`)));
  const existingVersions = await prisma.styleProcessVersion.findMany({
    where: {
      OR: scopeKeys.map((key) => {
        const [orgId, styleId] = key.split(":").map(Number);
        return { orgId, styleId };
      }),
    },
    select: { orgId: true, styleId: true },
  });
  const alreadyVersionedKeys = new Set(existingVersions.map((v) => `${v.orgId}:${v.styleId}`));
  const targetKeys = scopeKeys.filter((key) => !alreadyVersionedKeys.has(key));

  const activeVersionIdByScope = await resolveActiveVersionIdsByStyleScope(styleProcessRows);

  const rowsByScope = new Map();
  for (const row of styleProcessRows) {
    const key = `${row.orgId}:${row.styleId}`;
    if (!targetKeys.includes(key)) continue;
    if (!rowsByScope.has(key)) rowsByScope.set(key, []);
    rowsByScope.get(key).push(row);
  }

  const scopes = [];
  for (const key of targetKeys) {
    const [orgId, styleId] = key.split(":").map(Number);
    const rows = rowsByScope.get(key) ?? [];
    const activeVersionId = activeVersionIdByScope.get(key) ?? null;
    const processSnapshot = rows.map((row, index) => buildProcessSnapshotEntry(row, activeVersionId, index));
    const processesMissingStBuckets = processSnapshot.filter((p) => p.stBuckets.length === 0).length;
    scopes.push({
      orgId,
      styleId,
      processCount: rows.length,
      activeVersionId,
      processesMissingStBuckets,
      processSnapshot,
    });
  }

  return { scopes, skippedAlreadyVersioned: alreadyVersionedKeys.size };
};

const main = async () => {
  const plan = await buildBackfillPlan();
  const summary = {
    mode: apply ? "apply" : "dry-run",
    orgIdFilter,
    targetStyleCount: plan.scopes.length,
    alreadyVersionedStyleCount: plan.skippedAlreadyVersioned,
    stylesWithNoActiveTimeBucketVersion: plan.scopes.filter((s) => s.activeVersionId === null).length,
    stylesWithProcessesMissingStBuckets: plan.scopes.filter((s) => s.processesMissingStBuckets > 0).length,
  };
  console.log(JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(
    plan.scopes.map((s) => ({
      orgId: s.orgId,
      styleId: s.styleId,
      processCount: s.processCount,
      activeVersionId: s.activeVersionId,
      processesMissingStBuckets: s.processesMissingStBuckets,
    })),
    null,
    2
  ));

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to write Ver.1 rows.");
    return;
  }
  if (plan.scopes.length === 0) {
    console.log("Nothing to backfill.");
    return;
  }

  const backupDir = path.resolve(__dirname, "..", "..", "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `initial-style-process-version-backfill-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(plan.scopes, null, 2));

  const results = { created: [], failed: [] };
  for (const scope of plan.scopes) {
    try {
      const created = await prisma.styleProcessVersion.create({
        data: {
          orgId: scope.orgId,
          styleId: scope.styleId,
          versionNumber: 1,
          confirmedDate: todayDateKey(),
          processSnapshot: scope.processSnapshot,
          confirmedBy: "SYSTEM_MIGRATION",
        },
      });
      await prisma.assignmentPlan.updateMany({
        where: { orgId: scope.orgId, styleId: scope.styleId, styleProcessVersionId: null },
        data: { styleProcessVersionId: created.id },
      });
      results.created.push({ orgId: scope.orgId, styleId: scope.styleId, versionId: created.id });
    } catch (error) {
      results.failed.push({
        orgId: scope.orgId,
        styleId: scope.styleId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({
    createdCount: results.created.length,
    failedCount: results.failed.length,
    failed: results.failed,
    backupPath,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
