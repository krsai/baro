#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const toSignedInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const toOptionalFloat = (value, fallback = null) => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDateKey = (value) => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : "";
};

const normalizeText = (value) => String(value ?? "").trim();

const normalizeSnapshotSchedule = (value, fallback = null) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const fallbackStartIndex = toSignedInt(fallback?.startIndex, 0);
  const startIndex = toSignedInt(value?.startIndex, fallbackStartIndex);
  const endIndex = Math.max(startIndex, toSignedInt(value?.endIndex, startIndex));
  const startDateKey = normalizeDateKey(value?.startDateKey) || null;
  const endDateKey = normalizeDateKey(value?.endDateKey) || startDateKey;

  return {
    startIndex,
    endIndex,
    startDayOffsetPercent: toOptionalFloat(value?.startDayOffsetPercent, null),
    startDayPercent: toOptionalFloat(value?.startDayPercent, null),
    endDayPercent: toOptionalFloat(value?.endDayPercent, null),
    startDateKey,
    endDateKey,
  };
};
const DEFAULT_DAILY_CAPACITY_SECONDS = 8 * 60 * 60;

const normalizeCtSnapshot = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const quantity = Number(value?.quantity);
  const totalStPerPieceSeconds = Number(value?.totalStPerPieceSeconds);
  const totalStSeconds =
    Number.isFinite(quantity) &&
    quantity > 0 &&
    Number.isFinite(totalStPerPieceSeconds) &&
    totalStPerPieceSeconds > 0
      ? Math.max(0, Math.round(quantity * totalStPerPieceSeconds))
      : null;
  return {
    ...value,
    schedule: normalizeSnapshotSchedule(value?.schedule),
    totalStSeconds,
    totalCtSeconds:
      Number.isFinite(Number(value?.totalCtSeconds))
        ? Math.max(0, Math.round(Number(value.totalCtSeconds)))
        : Number.isFinite(Number(value?.totalAgreedSeconds))
          ? Math.max(0, Math.round(Number(value.totalAgreedSeconds)))
          : null,
  };
};

const resolveStTotalSeconds = (item) => {
  const snapshot = normalizeCtSnapshot(item?.ctSnapshot ?? item?.ctAgreedSnapshot);
  if (snapshot?.totalStSeconds != null) return snapshot.totalStSeconds;
  const stTotalSeconds = Number(item?.stTotalSeconds);
  if (Number.isFinite(stTotalSeconds) && stTotalSeconds >= 0) {
    return Math.round(stTotalSeconds);
  }
  return null;
};

const parseDateKeyToUtc = (value) => {
  const dateKey = normalizeDateKey(value);
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-").map((item) => Number(item));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKeyFromUtc = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const shiftDateKeyByDays = (value, days) => {
  const date = parseDateKeyToUtc(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + Math.trunc(days));
  return toDateKeyFromUtc(date);
};

const diffDateKeysByDays = (fromValue, toValue) => {
  const fromDate = parseDateKeyToUtc(fromValue);
  const toDate = parseDateKeyToUtc(toValue);
  if (!fromDate || !toDate) return null;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
};

const countDateRangeDaysInclusive = (startValue, endValue) => {
  const diffDays = diffDateKeysByDays(startValue, endValue);
  if (diffDays == null || diffDays < 0) return 0;
  return diffDays + 1;
};

const getLineCapacitySeconds = (lineId, lineCapacityById) => {
  const key = normalizeText(lineId);
  if (!key) return DEFAULT_DAILY_CAPACITY_SECONDS;
  const resolved = Number(lineCapacityById.get(key));
  if (!Number.isFinite(resolved) || resolved <= 0) {
    return DEFAULT_DAILY_CAPACITY_SECONDS;
  }
  return resolved;
};

const isNonWorkingDateKey = (dateKey, holidaySet) => {
  const normalized = normalizeDateKey(dateKey);
  const date = parseDateKeyToUtc(normalized);
  if (!date) return false;
  return date.getUTCDay() === 0 || holidaySet.has(normalized);
};

const getDayCapacitySeconds = ({ lineId, dateKey, lineCapacityById, holidaySet }) =>
  isNonWorkingDateKey(dateKey, holidaySet)
    ? 0
    : getLineCapacitySeconds(lineId, lineCapacityById);

const calculateScheduledSeconds = ({
  schedule,
  lineId,
  lineCapacityById,
  holidaySet,
}) => {
  const normalized = normalizeSnapshotSchedule(schedule);
  if (!normalized?.startDateKey) return null;
  const startPercent = (normalized.startDayPercent ?? 100) / 100;
  const endPercent = (normalized.endDayPercent ?? 100) / 100;
  const spanDays = countDateRangeDaysInclusive(
    normalized.startDateKey,
    normalized.endDateKey ?? normalized.startDateKey
  );
  if (spanDays <= 0) return null;

  let total = 0;
  for (let offset = 0; offset < spanDays; offset += 1) {
    const dayKey = shiftDateKeyByDays(normalized.startDateKey, offset);
    if (!dayKey) continue;
    const dailyCapacity = getDayCapacitySeconds({
      lineId,
      dateKey: dayKey,
      lineCapacityById,
      holidaySet,
    });
    if (dailyCapacity <= 0) continue;

    if (spanDays === 1) {
      total += dailyCapacity * startPercent;
      continue;
    }
    if (offset === 0) {
      total += dailyCapacity * startPercent;
    } else if (offset === spanDays - 1) {
      total += dailyCapacity * endPercent;
    } else {
      total += dailyCapacity;
    }
  }

  return total;
};

const recomputeScheduleFromCurrentStart = ({
  schedule,
  lineId,
  stTotalSeconds,
  lineCapacityById,
  holidaySet,
  fallback = null,
}) => {
  const normalized = normalizeSnapshotSchedule(schedule, fallback);
  const plannedSeconds = Math.max(0, Math.round(Number(stTotalSeconds) || 0));
  if (!normalized?.startDateKey || plannedSeconds <= 0) return normalized;

  const startIndex = toSignedInt(normalized.startIndex, toSignedInt(fallback?.startIndex, 0));
  const startDayOffsetPercent = toOptionalFloat(normalized.startDayOffsetPercent, 0);
  const resolvedStartDayOffsetPercent =
    startDayOffsetPercent == null
      ? 0
      : Math.max(0, Math.min(99.999, startDayOffsetPercent));
  const startCapacity = getDayCapacitySeconds({
    lineId,
    dateKey: normalized.startDateKey,
    lineCapacityById,
    holidaySet,
  });
  const startOffsetSeconds = (resolvedStartDayOffsetPercent / 100) * startCapacity;
  const startAvailable = Math.max(startCapacity - startOffsetSeconds, 0);
  let remaining = plannedSeconds;
  const startUse = Math.min(startAvailable, remaining);
  const startDayPercent = startCapacity > 0 ? (startUse / startCapacity) * 100 : 0;
  remaining -= startUse;

  if (remaining <= 0) {
    return {
      startIndex,
      endIndex: startIndex,
      startDayOffsetPercent: resolvedStartDayOffsetPercent,
      startDayPercent,
      endDayPercent: startDayPercent,
      startDateKey: normalized.startDateKey,
      endDateKey: normalized.startDateKey,
    };
  }

  const fallbackDailyCapacity = Math.max(
    1,
    getLineCapacitySeconds(lineId, lineCapacityById)
  );
  const projectedWorkingDays = Math.max(
    1,
    Math.ceil(plannedSeconds / fallbackDailyCapacity)
  );
  const maxIterations = Math.max(projectedWorkingDays + 60, 120);

  let endDateKey = normalized.startDateKey;
  let cursorDateKey = normalized.startDateKey;
  for (let step = 0; step < maxIterations; step += 1) {
    const nextDateKey = shiftDateKeyByDays(cursorDateKey, 1);
    if (!nextDateKey) break;
    cursorDateKey = nextDateKey;
    endDateKey = nextDateKey;

    const dailyCapacity = getDayCapacitySeconds({
      lineId,
      dateKey: nextDateKey,
      lineCapacityById,
      holidaySet,
    });
    if (dailyCapacity <= 0) continue;
    if (remaining <= dailyCapacity) {
      const endDayPercent = (remaining / dailyCapacity) * 100;
      const dayDelta = diffDateKeysByDays(normalized.startDateKey, nextDateKey) ?? 0;
      return {
        startIndex,
        endIndex: Math.max(startIndex, startIndex + Math.max(0, dayDelta)),
        startDayOffsetPercent: resolvedStartDayOffsetPercent,
        startDayPercent,
        endDayPercent,
        startDateKey: normalized.startDateKey,
        endDateKey: nextDateKey,
      };
    }
    remaining -= dailyCapacity;
  }

  const dayDelta = diffDateKeysByDays(normalized.startDateKey, endDateKey) ?? 0;
  return {
    startIndex,
    endIndex: Math.max(startIndex, startIndex + Math.max(0, dayDelta)),
    startDayOffsetPercent: resolvedStartDayOffsetPercent,
    startDayPercent,
    endDayPercent: 100,
    startDateKey: normalized.startDateKey,
    endDateKey,
  };
};

const scheduleNeedsRecompute = ({
  schedule,
  lineId,
  stTotalSeconds,
  lineCapacityById,
  holidaySet,
}) => {
  const plannedSeconds = Number(stTotalSeconds);
  if (!Number.isFinite(plannedSeconds) || plannedSeconds <= 0) return false;
  const scheduledSeconds = calculateScheduledSeconds({
    schedule,
    lineId,
    lineCapacityById,
    holidaySet,
  });
  if (scheduledSeconds == null) return false;
  return Math.abs(scheduledSeconds - plannedSeconds) > 1;
};

const buildTargetSchedule = ({
  primary,
  secondary = null,
  lineCapacityById,
  holidaySet,
}) => {
  const currentSchedule = extractCurrentSchedule(primary);
  const secondarySchedule = extractCurrentSchedule(secondary);
  const snapshotSchedule =
    normalizeCtSnapshot(
      primary?.ctSnapshot ??
        primary?.ctAgreedSnapshot ??
        secondary?.ctSnapshot ??
        secondary?.ctAgreedSnapshot
    )?.schedule ?? null;
  const stTotalSeconds =
    resolveStTotalSeconds(primary) ?? resolveStTotalSeconds(secondary);
  const repairSourceSchedule =
    currentSchedule?.startDateKey
      ? currentSchedule
      : secondarySchedule?.startDateKey
        ? secondarySchedule
        : snapshotSchedule;

  if (
    repairSourceSchedule &&
    scheduleNeedsRecompute({
      schedule: repairSourceSchedule,
      lineId: primary?.lineId ?? secondary?.lineId,
      stTotalSeconds,
      lineCapacityById,
      holidaySet,
    })
  ) {
    return recomputeScheduleFromCurrentStart({
      schedule: repairSourceSchedule,
      lineId: primary?.lineId ?? secondary?.lineId,
      stTotalSeconds,
      lineCapacityById,
      holidaySet,
      fallback: primary ?? secondary,
    });
  }

  return (
    normalizeSnapshotSchedule(snapshotSchedule, primary) ||
    normalizeSnapshotSchedule(currentSchedule, primary) ||
    normalizeSnapshotSchedule(secondarySchedule, secondary)
  );
};

const applyScheduleToCtSnapshot = (item, schedule, fallbackSnapshotSource = null) => {
  if (!schedule) return null;
  const normalizedSnapshot = normalizeCtSnapshot(
    item?.ctSnapshot ??
      item?.ctAgreedSnapshot ??
      fallbackSnapshotSource?.ctSnapshot ??
      fallbackSnapshotSource?.ctAgreedSnapshot
  );
  if (!normalizedSnapshot) return null;
  return {
    ...normalizedSnapshot,
    schedule: normalizeSnapshotSchedule(schedule, item),
  };
};

const extractCurrentSchedule = (item) =>
  normalizeSnapshotSchedule(
    {
      startIndex: item?.startIndex,
      endIndex: item?.endIndex,
      startDayOffsetPercent: item?.startDayOffsetPercent,
      startDayPercent: item?.startDayPercent,
      endDayPercent: item?.endDayPercent,
      startDateKey: item?.startDateKey,
      endDateKey: item?.endDateKey,
    },
    item
  );

const extractSnapshotSchedule = (value, fallback = null) => {
  const schedule = value?.ctSnapshot?.schedule ?? value?.ctAgreedSnapshot?.schedule;
  return normalizeSnapshotSchedule(schedule, fallback);
};

const sameSchedule = (left, right) =>
  JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const applySchedule = (item, schedule) => ({
  ...item,
  ...schedule,
});

const parseOrgIdArg = () => {
  const arg = process.argv.find((value) => String(value).startsWith("--orgId="));
  if (!arg) return null;
  const raw = String(arg).split("=")[1];
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid orgId argument: ${raw}`);
  }
  return Math.trunc(parsed);
};

const repairOrganization = async (orgId) => {
  const [boardState, plans] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId },
      select: { id: true, assignments: true },
    }),
    prisma.assignmentPlan.findMany({
      where: { orgId },
      select: {
        id: true,
        externalId: true,
        assignmentCtSnapshot: true,
        startIndex: true,
        endIndex: true,
        startDayOffsetPercent: true,
        startDayPercent: true,
        endDayPercent: true,
      },
      orderBy: [{ lineId: "asc" }, { startIndex: "asc" }, { id: "asc" }],
    }),
  ]);

  const assignments = Array.isArray(boardState?.assignments)
    ? boardState.assignments
    : [];
  const repairLineIds = Array.from(
    new Set(
      [...assignments, ...plans]
        .map((item) => {
          const parsed = Number(item?.lineId);
          return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
        })
        .filter(Boolean)
    )
  );
  const [activeLineAssignments, holidayRows] = await Promise.all([
    repairLineIds.length > 0
      ? prisma.lineAssignment.findMany({
          where: {
            lineId: { in: repairLineIds },
            endAt: null,
          },
          select: { lineId: true },
        })
      : [],
    prisma.organizationHoliday
      ? prisma.organizationHoliday
          .findMany({
            where: { orgId },
            select: { holidayDate: true },
          })
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const activeHeadcountByLineId = activeLineAssignments.reduce((map, row) => {
    const lineId = Number(row?.lineId);
    if (!Number.isFinite(lineId) || lineId <= 0) return map;
    map.set(lineId, (map.get(lineId) || 0) + 1);
    return map;
  }, new Map());
  const lineCapacityById = repairLineIds.reduce((map, lineId) => {
    const headcount = activeHeadcountByLineId.get(lineId) || 0;
    map.set(String(lineId), Math.max(1, headcount) * DEFAULT_DAILY_CAPACITY_SECONDS);
    return map;
  }, new Map());
  const holidaySet = new Set(
    (Array.isArray(holidayRows) ? holidayRows : [])
      .map((row) => normalizeDateKey(row?.holidayDate))
      .filter(Boolean)
  );
  const planByExternalId = new Map(
    plans
      .map((plan) => [normalizeText(plan?.externalId), plan])
      .filter((entry) => entry[0])
  );
  const assignmentByExternalId = new Map(
    assignments
      .map((assignment) => [normalizeText(assignment?.id || assignment?.externalId), assignment])
      .filter((entry) => entry[0])
  );

  const nowIso = new Date().toISOString();
  const nowDate = new Date(nowIso);

  let updatedAssignmentCount = 0;
  const nextAssignments = assignments.map((assignment) => {
    const externalId = normalizeText(assignment?.id || assignment?.externalId);
    const linkedPlan = externalId ? planByExternalId.get(externalId) || null : null;
    const targetSchedule = buildTargetSchedule({
      primary: assignment,
      secondary: linkedPlan,
      lineCapacityById,
      holidaySet,
    });
    if (!targetSchedule) return assignment;

    const currentSchedule = extractCurrentSchedule(assignment);
    const nextCtSnapshot = applyScheduleToCtSnapshot(
      assignment,
      targetSchedule,
      linkedPlan
    );
    const currentCtSnapshot = normalizeCtSnapshot(
      assignment?.assignmentCtSnapshot ??
        assignment?.ctSnapshot ??
        assignment?.ctAgreedSnapshot ??
        linkedPlan?.assignmentCtSnapshot
    );
    if (
      sameSchedule(currentSchedule, targetSchedule) &&
      sameSchedule(currentCtSnapshot?.schedule, nextCtSnapshot?.schedule)
    ) {
      return assignment;
    }

    updatedAssignmentCount += 1;
    return {
      ...applySchedule(assignment, targetSchedule),
      ...(nextCtSnapshot ? { assignmentCtSnapshot: nextCtSnapshot } : {}),
      version: Math.max(0, toSignedInt(assignment?.version, 0)) + 1,
      versionUpdatedAt: nowIso,
    };
  });

  let updatedPlanCount = 0;
  const planUpdates = plans
    .map((plan) => {
      const linkedAssignment = assignmentByExternalId.get(normalizeText(plan?.externalId)) || null;
      const targetSchedule = buildTargetSchedule({
        primary: plan,
        secondary: linkedAssignment,
        lineCapacityById,
        holidaySet,
      });
      if (!targetSchedule) return null;

      const currentSchedule = extractCurrentSchedule(plan);
      const nextCtSnapshot = applyScheduleToCtSnapshot(plan, targetSchedule, linkedAssignment);
      const currentCtSnapshot = normalizeCtSnapshot(
        plan?.assignmentCtSnapshot ??
          linkedAssignment?.assignmentCtSnapshot ??
          linkedAssignment?.ctSnapshot
      );
      if (
        sameSchedule(currentSchedule, targetSchedule) &&
        sameSchedule(currentCtSnapshot?.schedule, nextCtSnapshot?.schedule)
      ) {
        return null;
      }

      updatedPlanCount += 1;
      return {
        id: plan.id,
        data: {
          ...targetSchedule,
          ...(nextCtSnapshot ? { assignmentCtSnapshot: nextCtSnapshot } : {}),
          updatedAt: nowDate,
        },
      };
    })
    .filter(Boolean);

  if (boardState && updatedAssignmentCount > 0) {
    await prisma.assignmentBoardState.update({
      where: { id: boardState.id },
      data: {
        assignments: nextAssignments,
      },
    });
  }

  if (planUpdates.length > 0) {
    await prisma.$transaction(
      planUpdates.map((row) =>
        prisma.assignmentPlan.update({
          where: { id: row.id },
          data: row.data,
        })
      )
    );
  }

  return {
    orgId,
    updatedAssignmentCount,
    updatedPlanCount,
  };
};

async function main() {
  const targetOrgId = parseOrgIdArg();
  const orgIds = targetOrgId
    ? [targetOrgId]
    : (
        await prisma.organization.findMany({
          select: { id: true },
          orderBy: { id: "asc" },
        })
      ).map((org) => org.id);

  const results = [];
  for (const orgId of orgIds) {
    results.push(await repairOrganization(orgId));
  }

  const summary = results.reduce(
    (acc, row) => {
      acc.organizations += 1;
      acc.updatedAssignmentCount += row.updatedAssignmentCount;
      acc.updatedPlanCount += row.updatedPlanCount;
      return acc;
    },
    {
      organizations: 0,
      updatedAssignmentCount: 0,
      updatedPlanCount: 0,
    }
  );

  console.log(JSON.stringify({ summary, results }, null, 2));
}

main()
  .catch((error) => {
    console.error("[repair-assignment-schedule] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
