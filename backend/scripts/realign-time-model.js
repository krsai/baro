#!/usr/bin/env node

const path = require("path");
const { PrismaClient } = require("@prisma/client");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const prisma = new PrismaClient();

const MIN_PROCESS_SECONDS = 30;
const DEFAULT_TIME_REF_QUANTITY = 1000;
const ST_STANDARD_BUCKETS = Object.freeze([
  1,
  10,
  30,
  100,
  300,
  1000,
  3000,
  10000,
  30000,
  100000,
]);
const REALIGN_UPDATED_BY = "SYSTEM_REALIGN";

const roundToScale = (value, digits = 4) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const toPositiveInt = (value, fallback = 1) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const normalizeJson = (value) => JSON.stringify(value ?? null);

const clampProcessSeconds = (value) => {
  const parsed = roundToScale(value);
  if (parsed === null || parsed <= 0) return null;
  return Math.max(MIN_PROCESS_SECONDS, parsed);
};

const resolveStBucketQuantity = (value) => {
  const resolvedQuantity = toPositiveInt(value, ST_STANDARD_BUCKETS[0]);
  let resolvedBucket = ST_STANDARD_BUCKETS[0];
  ST_STANDARD_BUCKETS.forEach((bucket) => {
    if (resolvedQuantity >= bucket) {
      resolvedBucket = bucket;
    }
  });
  return resolvedBucket;
};

const resolveStandardPreference = (row) => {
  const setBy = String(row?.setBy || "").trim().toUpperCase();
  const rank =
    setBy === "MANUAL" ? 4 :
    setBy === "LEGACY" ? 3 :
    setBy === "SEED" ? 2 :
    setBy === "PT_DERIVED" ? 1 :
    0;
  const updatedAtRaw = row?.updatedAt ?? row?.setAt ?? null;
  const updatedAt = updatedAtRaw ? new Date(updatedAtRaw).getTime() : 0;
  return {
    rank,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    id: Number(row?.id) || 0,
  };
};

const pickPreferredStandard = (current, candidate) => {
  if (!current) return candidate;
  const currentPref = resolveStandardPreference(current);
  const candidatePref = resolveStandardPreference(candidate);
  if (candidatePref.rank !== currentPref.rank) {
    return candidatePref.rank > currentPref.rank ? candidate : current;
  }
  if (candidatePref.updatedAt !== currentPref.updatedAt) {
    return candidatePref.updatedAt > currentPref.updatedAt ? candidate : current;
  }
  return candidatePref.id >= currentPref.id ? candidate : current;
};

const resolveProcessInstanceId = (processCode, rowId, index) =>
  `${processCode || "PROC"}-${rowId || index}-${index}`;

const buildProcessMirror = (rows = []) =>
  rows
    .slice()
    .sort(
      (left, right) =>
        Number(left?.sortOrder ?? 0) - Number(right?.sortOrder ?? 0) ||
        Number(left?.id ?? 0) - Number(right?.id ?? 0)
    )
    .map((row, index) => {
      const standards = (Array.isArray(row?.standards) ? row.standards : [])
        .map((standard) => {
          const seconds = clampProcessSeconds(standard?.stSeconds);
          if (seconds === null) return null;
          return {
            quantity: resolveStBucketQuantity(standard?.quantity),
            seconds,
            setBy: typeof standard?.setBy === "string" && standard.setBy.trim()
              ? standard.setBy.trim()
              : null,
            setAt: standard?.setAt ? new Date(standard.setAt).toISOString() : null,
            updatedAt: standard?.updatedAt ? new Date(standard.updatedAt).toISOString() : null,
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.quantity - right.quantity);

      return {
        code: row?.processCode || "",
        name: row?.processName || row?.processCode || `Process ${index + 1}`,
        description: row?.processDescription ?? null,
        quantity: toPositiveInt(row?.processQuantity, 1),
        pt: clampProcessSeconds(row?.ptSeconds),
        atParams:
          row?.atParams && typeof row.atParams === "object" && !Array.isArray(row.atParams)
            ? row.atParams
            : null,
        stValues: standards,
        timeRefQuantity: standards[0]?.quantity ?? DEFAULT_TIME_REF_QUANTITY,
        instanceId: resolveProcessInstanceId(row?.processCode, row?.id, index),
      };
    });

const resolveStyleIdFromAssignment = (plan) => {
  const splitCandidate = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const parts = raw.split("::");
    return String(parts[1] || "").trim();
  };

  return (
    splitCandidate(plan?.externalId) ||
    splitCandidate(plan?.originOrderId) ||
    splitCandidate(plan?.cardId) ||
    String(plan?.label || "").trim()
  );
};

const normalizeAssignmentSchedule = (plan, existingSnapshot) => {
  const existing = existingSnapshot?.schedule;
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return {
      startIndex: Number.isFinite(Number(existing.startIndex)) ? Number(existing.startIndex) : 0,
      endIndex: Number.isFinite(Number(existing.endIndex)) ? Number(existing.endIndex) : 0,
      startDayOffsetPercent:
        Number.isFinite(Number(existing.startDayOffsetPercent))
          ? Number(existing.startDayOffsetPercent)
          : null,
      startDayPercent:
        Number.isFinite(Number(existing.startDayPercent))
          ? Number(existing.startDayPercent)
          : null,
      endDayPercent:
        Number.isFinite(Number(existing.endDayPercent))
          ? Number(existing.endDayPercent)
          : null,
      startDateKey: existing.startDateKey || null,
      endDateKey: existing.endDateKey || null,
    };
  }

  return {
    startIndex: Math.max(0, Number(plan?.startIndex || 0)),
    endIndex: Math.max(Number(plan?.startIndex || 0), Number(plan?.endIndex || 0)),
    startDayOffsetPercent: null,
    startDayPercent: null,
    endDayPercent: null,
    startDateKey: null,
    endDateKey: null,
  };
};

const resolveStPerPieceSeconds = (process, orderQuantity) => {
  const bucketQuantity = resolveStBucketQuantity(orderQuantity);
  const standards = Array.isArray(process?.stValues) ? process.stValues : [];
  const exact = standards.find(
    (value) => resolveStBucketQuantity(value?.quantity) === bucketQuantity
  );
  if (exact?.seconds != null) {
    return clampProcessSeconds(exact.seconds);
  }
  return clampProcessSeconds(process?.pt);
};

const buildAssignmentSnapshot = ({ plan, styleProcesses, updatedAtIso }) => {
  const existingSnapshot =
    plan?.ctSnapshot && typeof plan.ctSnapshot === "object" && !Array.isArray(plan.ctSnapshot)
      ? plan.ctSnapshot
      : null;
  const orderQuantity = toPositiveInt(
    plan?.finalQuantity ?? plan?.quantity ?? existingSnapshot?.quantity ?? 1,
    1
  );
  const snapshotProcesses = styleProcesses
    .map((process, index) => {
      const stSeconds = resolveStPerPieceSeconds(process, orderQuantity);
      if (stSeconds == null) return null;
      const processQuantity = toPositiveInt(process?.quantity, 1);
      return {
        processKey: String(
          process?.instanceId || process?.id || process?.code || `PROCESS-${index + 1}`
        ).trim(),
        name: process?.name || process?.processName || process?.code || `Process ${index + 1}`,
        quantity: processQuantity,
        basis: "ST",
        stSeconds,
        ctSeconds: stSeconds,
        ctPerPieceSeconds: stSeconds * processQuantity,
      };
    })
    .filter(Boolean);

  if (snapshotProcesses.length === 0) return null;

  const totalStPerPieceSeconds = snapshotProcesses.reduce(
    (sum, process) => sum + (Number(process?.ctPerPieceSeconds) || 0),
    0
  );
  const totalCtSeconds = Math.max(0, Math.round(totalStPerPieceSeconds * orderQuantity));

  return {
    updatedAt: updatedAtIso,
    updatedBy: REALIGN_UPDATED_BY,
    quantity: orderQuantity,
    schedule: normalizeAssignmentSchedule(plan, existingSnapshot),
    totalStPerPieceSeconds,
    totalCtPerPieceSeconds: totalStPerPieceSeconds,
    totalCtSeconds,
    processes: snapshotProcesses,
  };
};

async function main() {
  const updatedAt = new Date();
  const updatedAtIso = updatedAt.toISOString();

  const styleProcessRows = await prisma.styleProcess.findMany({
    include: {
      style: {
        select: {
          uid: true,
          orgId: true,
          styleId: true,
          name: true,
          customer: true,
        },
      },
      standards: {
        orderBy: [{ quantity: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ styleUid: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });

  const touchedStyleProcessIds = new Set();
  const touchedStyleUids = new Set();

  for (const row of styleProcessRows) {
    const nextPtSeconds = clampProcessSeconds(row?.ptSeconds);
    const groupedStandards = new Map();

    for (const standard of Array.isArray(row?.standards) ? row.standards : []) {
      const stSeconds = clampProcessSeconds(standard?.stSeconds);
      if (stSeconds === null) continue;
      const quantity = resolveStBucketQuantity(standard?.quantity);
      const candidate = {
        id: standard.id,
        quantity,
        stSeconds,
        setBy: typeof standard?.setBy === "string" && standard.setBy.trim()
          ? standard.setBy.trim()
          : null,
        setAt: standard?.setAt ?? null,
        updatedAt: standard?.updatedAt ?? null,
      };
      groupedStandards.set(
        quantity,
        pickPreferredStandard(groupedStandards.get(quantity), candidate)
      );
    }

    const nextStandards = Array.from(groupedStandards.values()).sort(
      (left, right) => left.quantity - right.quantity
    );
    const comparableCurrent = {
      ptSeconds: clampProcessSeconds(row?.ptSeconds),
      standards: (Array.isArray(row?.standards) ? row.standards : [])
        .map((standard) => {
          const stSeconds = clampProcessSeconds(standard?.stSeconds);
          if (stSeconds === null) return null;
          return {
            quantity: resolveStBucketQuantity(standard?.quantity),
            stSeconds,
            setBy: typeof standard?.setBy === "string" && standard.setBy.trim()
              ? standard.setBy.trim()
              : null,
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.quantity - right.quantity),
    };
    const comparableNext = {
      ptSeconds: nextPtSeconds,
      standards: nextStandards.map((standard) => ({
        quantity: standard.quantity,
        stSeconds: standard.stSeconds,
        setBy: standard.setBy,
      })),
    };

    if (normalizeJson(comparableCurrent) === normalizeJson(comparableNext)) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.styleProcess.update({
        where: { id: row.id },
        data: {
          ptSeconds: nextPtSeconds,
        },
      });

      await tx.styleProcessStandard.deleteMany({
        where: { styleProcessId: row.id },
      });

      if (nextStandards.length > 0) {
        await tx.styleProcessStandard.createMany({
          data: nextStandards.map((standard) => ({
            orgId: row.orgId,
            styleProcessId: row.id,
            quantity: standard.quantity,
            stSeconds: standard.stSeconds,
            setBy: standard.setBy,
            setAt: standard.setAt ? new Date(standard.setAt) : undefined,
          })),
        });
      }
    });

    touchedStyleProcessIds.add(row.id);
    touchedStyleUids.add(row.styleUid);
  }

  const refreshedStyleProcessRows = await prisma.styleProcess.findMany({
    where: touchedStyleUids.size > 0 ? { styleUid: { in: Array.from(touchedStyleUids) } } : undefined,
    include: {
      standards: {
        orderBy: [{ quantity: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ styleUid: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });

  const styleProcessRowsByStyleUid = refreshedStyleProcessRows.reduce((map, row) => {
    const current = map.get(row.styleUid) || [];
    current.push(row);
    map.set(row.styleUid, current);
    return map;
  }, new Map());

  for (const styleUid of touchedStyleUids) {
    const rows = styleProcessRowsByStyleUid.get(styleUid) || [];
    if (rows.length === 0) continue;
    await prisma.style.update({
      where: { uid: styleUid },
      data: {
        processes: buildProcessMirror(rows),
      },
    });
  }

  const styles = await prisma.style.findMany({
    where: { orgId: { in: Array.from(new Set(styleProcessRows.map((row) => row.style.orgId))) } },
    select: {
      uid: true,
      orgId: true,
      styleId: true,
      name: true,
      customer: true,
    },
  });
  const styleByOrgAndStyleId = new Map();
  styles.forEach((style) => {
    const styleId = String(style?.styleId || "").trim();
    if (!styleId) return;
    styleByOrgAndStyleId.set(`${style.orgId}::${styleId}`, style);
  });

  const processMirrorByStyleUid = new Map();
  Array.from(styleProcessRowsByStyleUid.entries()).forEach(([styleUid, rows]) => {
    processMirrorByStyleUid.set(styleUid, buildProcessMirror(rows));
  });

  const assignmentPlans = await prisma.assignmentPlan.findMany({
    select: {
      id: true,
      orgId: true,
      externalId: true,
      cardId: true,
      originOrderId: true,
      label: true,
      quantity: true,
      finalQuantity: true,
      lineId: true,
      startIndex: true,
      endIndex: true,
      totalSeconds: true,
      contractedSeconds: true,
      ctSnapshot: true,
    },
    orderBy: [{ orgId: "asc" }, { id: "asc" }],
  });

  const nextSnapshotByExternalId = new Map();
  let assignmentPlanUpdateCount = 0;

  for (const plan of assignmentPlans) {
    const styleId = resolveStyleIdFromAssignment(plan);
    if (!styleId) continue;
    const style = styleByOrgAndStyleId.get(`${plan.orgId}::${styleId}`);
    if (!style) continue;
    const styleProcesses = processMirrorByStyleUid.get(style.uid) || [];
    if (styleProcesses.length === 0) continue;

    const nextSnapshot = buildAssignmentSnapshot({
      plan,
      styleProcesses,
      updatedAtIso,
    });
    if (!nextSnapshot) continue;

    const nextTotalSeconds = nextSnapshot.totalCtSeconds;
    const comparableCurrent = {
      contractedSeconds: Number(plan?.contractedSeconds) || 0,
      totalSeconds: Number(plan?.totalSeconds) || 0,
      ctSnapshot: plan?.ctSnapshot ?? null,
    };
    const comparableNext = {
      contractedSeconds: nextTotalSeconds,
      totalSeconds: nextTotalSeconds,
      ctSnapshot: nextSnapshot,
    };
    if (normalizeJson(comparableCurrent) === normalizeJson(comparableNext)) {
      nextSnapshotByExternalId.set(plan.externalId, nextSnapshot);
      continue;
    }

    await prisma.assignmentPlan.update({
      where: { id: plan.id },
      data: {
        contractedSeconds: nextTotalSeconds,
        totalSeconds: nextTotalSeconds,
        ctSnapshot: nextSnapshot,
      },
    });
    assignmentPlanUpdateCount += 1;
    nextSnapshotByExternalId.set(plan.externalId, nextSnapshot);
  }

  const boardStates = await prisma.assignmentBoardState.findMany({
    select: {
      id: true,
      orgId: true,
      assignments: true,
    },
    orderBy: { id: "asc" },
  });

  let boardStateUpdateCount = 0;

  for (const state of boardStates) {
    if (!Array.isArray(state?.assignments) || state.assignments.length === 0) continue;
    let changed = false;
    const nextAssignments = state.assignments.map((assignment) => {
      if (!assignment || typeof assignment !== "object") return assignment;
      const externalId = String(assignment?.id || assignment?.externalId || "").trim();
      if (!externalId || !nextSnapshotByExternalId.has(externalId)) return assignment;
      const nextSnapshot = nextSnapshotByExternalId.get(externalId);
      const nextTotalSeconds = nextSnapshot.totalCtSeconds;
      const nextAssignment = {
        ...assignment,
        contractedSeconds: nextTotalSeconds,
        totalSeconds: nextTotalSeconds,
        basis: "ST",
        ctSnapshot: nextSnapshot,
        version: toPositiveInt(assignment?.version ?? 1, 1) + 1,
        versionUpdatedAt: updatedAtIso,
      };
      if (normalizeJson(assignment) !== normalizeJson(nextAssignment)) {
        changed = true;
      }
      return nextAssignment;
    });

    if (!changed) continue;
    await prisma.assignmentBoardState.update({
      where: { id: state.id },
      data: {
        assignments: nextAssignments,
      },
    });
    boardStateUpdateCount += 1;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        updatedAt: updatedAtIso,
        summary: {
          touchedStyleProcesses: touchedStyleProcessIds.size,
          touchedStyles: touchedStyleUids.size,
          updatedAssignmentPlans: assignmentPlanUpdateCount,
          updatedBoardStates: boardStateUpdateCount,
        },
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
