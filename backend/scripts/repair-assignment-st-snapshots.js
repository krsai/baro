const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const orgArgIndex = process.argv.indexOf('--org-id');
const inlineOrgArg = process.argv.find((item) => item.startsWith('--org-id='));
const positionalOrgArg = process.argv.slice(2).find((item) => /^\d+$/.test(item));
const orgId = Number(
  orgArgIndex >= 0
    ? process.argv[orgArgIndex + 1]
    : inlineOrgArg
      ? inlineOrgArg.split('=')[1]
      : positionalOrgArg ?? 0
);
const relationshipArgIndex = process.argv.indexOf('--relationship-id');
const inlineRelationshipArg = process.argv.find((item) => item.startsWith('--relationship-id='));
const relationshipId = Number(
  relationshipArgIndex >= 0
    ? process.argv[relationshipArgIndex + 1]
    : inlineRelationshipArg
      ? inlineRelationshipArg.split('=')[1]
      : 0
);

if (
  !Number.isInteger(orgId) ||
  orgId <= 0 ||
  !Number.isInteger(relationshipId) ||
  relationshipId <= 0
) {
  throw new Error(
    'Usage: node scripts/repair-assignment-st-snapshots.js --org-id <id> --relationship-id <id> [--apply]'
  );
}

const asPositiveInt = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const asPositiveSeconds = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const resolveFrozenProcessIds = (plan, styleProcessById) => {
  const processes = Array.isArray(plan.assignmentCtSnapshot?.processes)
    ? plan.assignmentCtSnapshot.processes
    : [];
  const seen = new Set();
  const ids = [];
  for (const process of processes) {
    const styleProcessId = asPositiveInt(process?.styleProcessId);
    if (styleProcessId === null || seen.has(styleProcessId)) continue;
    const row = styleProcessById.get(styleProcessId);
    if (!row || row.styleId !== plan.styleId || row.orgId !== plan.orgId) continue;
    if (row.createdAt > plan.createdAt) continue;
    seen.add(styleProcessId);
    ids.push(styleProcessId);
  }
  return ids;
};

const buildRepairPlan = async (db) => {
  const relationship = await db.orgRelationship.findFirst({
    where: { id: relationshipId, manufacturerOrgId: orgId },
    select: { id: true },
  });
  if (!relationship) throw new Error(`No manufacturer relationship found for org ${orgId}`);

  const bucketSetName = `RELATIONSHIP_TIME_BUCKETS_${relationship.id}`;
  const bootstrapVersion = await db.quantityBucketSetVersion.findFirst({
    where: {
      orgId,
      createdBy: 'SYSTEM:RELATIONSHIP_TIME_BUCKET_BACKFILL',
      quantityBucketSet: { name: bucketSetName },
    },
    orderBy: [{ versionNumber: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      versionNumber: true,
      entries: { orderBy: { bucketQuantity: 'asc' } },
    },
  });
  if (!bootstrapVersion || bootstrapVersion.versionNumber !== 1) {
    throw new Error(`Exact relationship bootstrap version is missing for ${bucketSetName}`);
  }

  const allPlans = await db.assignmentPlan.findMany({
    where: { orgId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      externalId: true,
      orgId: true,
      styleId: true,
      orgRelationshipId: true,
      assignmentQuantity: true,
      assignmentStTotalSeconds: true,
      assignmentStSnapshot: true,
      assignmentCtSnapshot: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  const plans = allPlans.filter((plan) => plan.assignmentStSnapshot == null);
  const styleIds = Array.from(new Set(plans.map((plan) => plan.styleId).filter(Boolean)));
  const styleProcesses = await db.styleProcess.findMany({
    where: { orgId, styleId: { in: styleIds } },
    orderBy: [{ styleId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      standards: {
        where: { quantityBucketSetVersionId: bootstrapVersion.id },
        include: { quantityBucketEntry: true },
      },
    },
  });
  const styleProcessById = new Map(styleProcesses.map((row) => [row.id, row]));
  const entriesDescending = [...bootstrapVersion.entries].sort(
    (left, right) => right.bucketQuantity - left.bucketQuantity
  );

  const repairable = [];
  const blocked = [];
  for (const plan of plans) {
    const quantity = asPositiveInt(plan.assignmentQuantity);
    const persistedTotal = asPositiveSeconds(plan.assignmentStTotalSeconds);
    if (quantity === null || persistedTotal === null) {
      blocked.push({ planId: plan.id, reason: 'missing assignment quantity or ST total' });
      continue;
    }
    if (plan.orgRelationshipId !== relationship.id) {
      blocked.push({ planId: plan.id, reason: 'relationship mismatch' });
      continue;
    }
    const entry = entriesDescending.find((item) => item.bucketQuantity <= quantity);
    if (!entry) {
      blocked.push({ planId: plan.id, reason: 'no exact bootstrap bucket entry' });
      continue;
    }
    const processIds = resolveFrozenProcessIds(plan, styleProcessById);
    if (processIds.length === 0) {
      blocked.push({ planId: plan.id, reason: 'no frozen style-process FK set' });
      continue;
    }
    const snapshotProcesses = [];
    for (const styleProcessId of processIds) {
      const row = styleProcessById.get(styleProcessId);
      const standard = row?.standards.find(
        (item) =>
          item.quantityBucketEntryId === entry.id &&
          item.quantityBucketSetVersionId === bootstrapVersion.id
      );
      const stSeconds = asPositiveSeconds(standard?.bucketStSeconds);
      if (!row || !standard || stSeconds === null) {
        snapshotProcesses.length = 0;
        break;
      }
      snapshotProcesses.push({
        styleProcessId: row.id,
        processCode: row.processCode,
        processName: row.processName,
        bucketQuantity: entry.bucketQuantity,
        stSeconds,
        stSource: standard.setBy ?? null,
      });
    }
    if (snapshotProcesses.length !== processIds.length) {
      blocked.push({ planId: plan.id, reason: 'bootstrap standard coverage mismatch' });
      continue;
    }
    const calculatedTotal = Math.round(
      snapshotProcesses.reduce((sum, process) => sum + process.stSeconds, 0) * quantity
    );
    if (calculatedTotal !== Math.round(persistedTotal)) {
      blocked.push({
        planId: plan.id,
        reason: 'persisted total does not match exact bootstrap standards',
        persistedTotal: Math.round(persistedTotal),
        calculatedTotal,
      });
      continue;
    }
    repairable.push({
      planId: plan.id,
      externalId: plan.externalId,
      expectedUpdatedAt: plan.updatedAt,
      snapshot: {
        version: 1,
        quantityBucketSetVersionId: bootstrapVersion.id,
        quantityBucketEntryId: entry.id,
        bucketQuantity: entry.bucketQuantity,
        assignmentQuantity: quantity,
        snapshotAt: plan.createdAt.toISOString(),
        snapshotBy: 'SYSTEM:ASSIGNMENT_ST_SNAPSHOT_REPAIR',
        processes: snapshotProcesses,
      },
    });
  }
  return {
    relationshipId: relationship.id,
    bootstrapVersionId: bootstrapVersion.id,
    missingCount: plans.length,
    repairable,
    blocked,
  };
};

const main = async () => {
  const repairPlan = await buildRepairPlan(prisma);
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    orgId,
    relationshipId: repairPlan.relationshipId,
    bootstrapVersionId: repairPlan.bootstrapVersionId,
    missingCount: repairPlan.missingCount,
    repairableCount: repairPlan.repairable.length,
    blockedCount: repairPlan.blocked.length,
    blocked: repairPlan.blocked,
  }, null, 2));
  if (!apply) return;
  if (repairPlan.repairable.length === 0) {
    throw new Error('No exact ST snapshots are repairable');
  }

  const backupDir = path.resolve(__dirname, '..', '..', 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `assignment-st-snapshot-repair-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ orgId, ...repairPlan }, null, 2));

  await prisma.$transaction(async (tx) => {
    for (const item of repairPlan.repairable) {
      const result = await tx.assignmentPlan.updateMany({
        where: {
          id: item.planId,
          orgId,
          updatedAt: item.expectedUpdatedAt,
          assignmentStSnapshot: { equals: Prisma.DbNull },
        },
        data: { assignmentStSnapshot: item.snapshot },
      });
      if (result.count !== 1) {
        throw new Error(`Concurrent change or non-null snapshot for plan ${item.planId}`);
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 90_000 });

  const after = await buildRepairPlan(prisma);
  if (after.missingCount !== repairPlan.blocked.length) {
    throw new Error(`Post-repair missing count mismatch: ${after.missingCount}`);
  }
  console.log(JSON.stringify({
    applied: repairPlan.repairable.length,
    remainingBlocked: after.blocked,
    backupPath,
  }, null, 2));
};

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
