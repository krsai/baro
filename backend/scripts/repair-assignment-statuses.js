#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const AUTO_WORKLOG_COMPLETED_BY = "system:auto-worklog";
const STATUS_IN_PROGRESS = "IN_PROGRESS";
const STATUS_REVIEW_REQUIRED = "REVIEW_REQUIRED";
const STATUS_PRODUCTION_COMPLETED = "PRODUCTION_COMPLETED";

const normalizeDateKey = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
};

const toPositiveIntOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const toNonNegativeInt = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.max(0, Math.round(parsed));
};

const toOptionalDateValue = (value, fallback = null) => {
  if (value == null || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const toDateValueFromDateKey = (dateKeyInput) => {
  const dateKey = normalizeDateKey(dateKeyInput);
  if (!dateKey) return null;
  const [year, month, day] = dateKey.split("-").map((value) => Number(value));
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
};

const parseOrgIdArg = () => {
  const arg = process.argv.find((value) => String(value).startsWith("--orgId="));
  if (!arg) return null;
  const parsed = Number(String(arg).split("=")[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`invalid orgId argument: ${arg}`);
  }
  return Math.trunc(parsed);
};

const shouldApply = process.argv.includes("--apply");

const parseAssignmentSnapshot = (value) => {
  if (!value) return null;
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed;
};

const resolveRequiredProcessGroups = (plan) => {
  const snapshot = parseAssignmentSnapshot(plan?.assignmentCtSnapshot);
  const processes = Array.isArray(snapshot?.processes) ? snapshot.processes : [];
  return processes
    .map((process) => {
      const styleProcessId = toPositiveIntOrNull(process?.styleProcessId);
      return styleProcessId ? [`style-process:${styleProcessId}`] : [];
    })
    .filter((group) => group.length > 0);
};

const resolveAssignmentProcessGroupTotals = ({ processTotalsByKey, processKeyGroups }) =>
  processKeyGroups.map((group) =>
    group.reduce(
      (max, key) => Math.max(max, toNonNegativeInt(processTotalsByKey.get(key), 0)),
      0
    )
  );

const resolveProducedQuantityFromProcessTotals = (processTotals) => {
  if (!Array.isArray(processTotals) || processTotals.length === 0) return 0;
  return processTotals.reduce(
    (min, value) => Math.min(min, toNonNegativeInt(value, 0)),
    Number.POSITIVE_INFINITY
  );
};

const resolveWorkRecordCoverageStartDate = (record) =>
  normalizeDateKey(record?.effectiveCoverageStartDate) ||
  normalizeDateKey(record?.workLog?.coverageStartDate) ||
  null;

const resolveWorkRecordCoverageEndDate = (record) =>
  normalizeDateKey(record?.effectiveCoverageEndDate) ||
  normalizeDateKey(record?.workLog?.coverageEndDate) ||
  normalizeDateKey(record?.workLog?.displayDate) ||
  null;

const resolveAssignmentPlanCloseMode = ({ closedQty, targetQty }) => {
  if (closedQty == null) return null;
  if (targetQty == null || targetQty <= 0) return "FULL";
  if (closedQty === targetQty) return "FULL";
  if (closedQty < targetQty) return "SHORT";
  return "OVER";
};

const buildPlanStats = (plan) => {
  const processTotalsByKey = new Map();
  const dailyProcessTotalsByDate = new Map();
  let firstWorkDate = null;
  let lastWorkDate = null;
  let hasRangeCoverage = false;
  let totalDone = 0;

  for (const record of Array.isArray(plan?.workRecords) ? plan.workRecords : []) {
    const quantity = toNonNegativeInt(record?.quantity, 0);
    if (quantity <= 0) continue;

    const styleProcessId = toPositiveIntOrNull(record?.styleProcessId);
    if (!styleProcessId) continue;
    const processKey = `style-process:${styleProcessId}`;

    totalDone += quantity;
    processTotalsByKey.set(processKey, (processTotalsByKey.get(processKey) || 0) + quantity);

    const coverageStartDate = resolveWorkRecordCoverageStartDate(record);
    const coverageEndDate = resolveWorkRecordCoverageEndDate(record);
    if (coverageStartDate && (!firstWorkDate || coverageStartDate < firstWorkDate)) {
      firstWorkDate = coverageStartDate;
    }
    if (coverageEndDate && (!lastWorkDate || coverageEndDate > lastWorkDate)) {
      lastWorkDate = coverageEndDate;
    }
    if (coverageStartDate && coverageEndDate && coverageStartDate !== coverageEndDate) {
      hasRangeCoverage = true;
    }
    const entryMode = String(record?.workLog?.entryMode || "").trim().toLowerCase();
    if (entryMode === "period_summary") {
      hasRangeCoverage = true;
    }
    if (!coverageEndDate) continue;
    const byDate = dailyProcessTotalsByDate.get(coverageEndDate) || new Map();
    byDate.set(processKey, (byDate.get(processKey) || 0) + quantity);
    dailyProcessTotalsByDate.set(coverageEndDate, byDate);
  }

  return {
    processTotalsByKey,
    dailyProcessTotalsByDate,
    firstWorkDate,
    lastWorkDate,
    hasRangeCoverage,
    totalDone,
  };
};

const resolveActualProducedCompletedDateKey = ({
  baselineQuantity,
  producedQuantity,
  hasRangeCoverage,
  lastWorkDate,
  dailyProcessTotalsByDate,
  processKeyGroups,
}) => {
  if (
    baselineQuantity == null ||
    baselineQuantity <= 0 ||
    producedQuantity < baselineQuantity
  ) {
    return null;
  }
  if (hasRangeCoverage) {
    return lastWorkDate || null;
  }

  const cumulativeProcessTotalsByKey = new Map();
  const sortedDateKeys = Array.from(dailyProcessTotalsByDate.keys()).sort((left, right) =>
    left.localeCompare(right)
  );

  for (const dateKey of sortedDateKeys) {
    const dailyTotals = dailyProcessTotalsByDate.get(dateKey);
    if (!dailyTotals) continue;
    dailyTotals.forEach((value, processKey) => {
      cumulativeProcessTotalsByKey.set(
        processKey,
        (cumulativeProcessTotalsByKey.get(processKey) || 0) + toNonNegativeInt(value, 0)
      );
    });
    const producedAtDate = resolveProducedQuantityFromProcessTotals(
      resolveAssignmentProcessGroupTotals({
        processTotalsByKey: cumulativeProcessTotalsByKey,
        processKeyGroups,
      })
    );
    if (producedAtDate >= baselineQuantity) {
      return dateKey;
    }
  }

  return lastWorkDate || null;
};

const buildDesiredPlanState = (plan) => {
  const stats = buildPlanStats(plan);
  const baselineQuantity = toPositiveIntOrNull(plan?.assignmentQuantity);
  const processKeyGroups = resolveRequiredProcessGroups(plan);
  const processCountFromSnapshot = processKeyGroups.length > 0 ? processKeyGroups.length : null;
  const processCountFromRecords =
    stats.processTotalsByKey.size > 0 ? stats.processTotalsByKey.size : null;
  const processCount = processCountFromSnapshot ?? processCountFromRecords;
  const processGroupTotals = resolveAssignmentProcessGroupTotals({
    processTotalsByKey: stats.processTotalsByKey,
    processKeyGroups,
  });
  const producedQuantity = resolveProducedQuantityFromProcessTotals(processGroupTotals);
  const totalExpected =
    baselineQuantity != null && processCount != null && processCount > 0
      ? baselineQuantity * processCount
      : null;
  const hasExactProcessCompletion = Boolean(
    baselineQuantity != null &&
      baselineQuantity > 0 &&
      processCount != null &&
      processCount > 0 &&
      processGroupTotals.length === processCount &&
      producedQuantity >= baselineQuantity &&
      processGroupTotals.every((value) => value === producedQuantity)
  );
  const hasWorkProgressReachedCompletion =
    totalExpected != null && totalExpected > 0 && stats.totalDone >= totalExpected;
  const currentReadyDate =
    toOptionalDateValue(plan?.productionCompletedAt) ||
    toOptionalDateValue(plan?.closedAt) ||
    null;
  const desiredStatus = Boolean(plan?.isCompleted) || currentReadyDate || hasExactProcessCompletion
    ? STATUS_PRODUCTION_COMPLETED
    : hasWorkProgressReachedCompletion
      ? STATUS_REVIEW_REQUIRED
      : STATUS_IN_PROGRESS;
  const actualProducedCompletedDateKey = resolveActualProducedCompletedDateKey({
    baselineQuantity,
    producedQuantity,
    hasRangeCoverage: stats.hasRangeCoverage,
    lastWorkDate: stats.lastWorkDate,
    dailyProcessTotalsByDate: stats.dailyProcessTotalsByDate,
    processKeyGroups,
  });
  const autoReadyDate =
    currentReadyDate ||
    toDateValueFromDateKey(actualProducedCompletedDateKey) ||
    toDateValueFromDateKey(stats.lastWorkDate);

  return {
    desiredStatus,
    producedQuantity,
    baselineQuantity,
    totalDone: stats.totalDone,
    processCount,
    currentReadyDate,
    autoReadyDate,
  };
};

const main = async () => {
  const orgId = parseOrgIdArg();
  const plans = await prisma.assignmentPlan.findMany({
    where: orgId ? { orgId } : undefined,
    select: {
      id: true,
      orgId: true,
      externalId: true,
      assignmentQuantity: true,
      finalQuantity: true,
      isCompleted: true,
      scheduleStatus: true,
      productionCompletedAt: true,
      completedAt: true,
      closedQty: true,
      closedAt: true,
      closedBy: true,
      closeMode: true,
      closeBasis: true,
      assignmentCtSnapshot: true,
      workRecords: {
        select: {
          quantity: true,
          styleProcessId: true,
          effectiveCoverageStartDate: true,
          effectiveCoverageEndDate: true,
          workLog: {
            select: {
              coverageStartDate: true,
              coverageEndDate: true,
              displayDate: true,
              entryMode: true,
            },
          },
        },
      },
    },
    orderBy: [{ orgId: "asc" }, { id: "asc" }],
  });

  const changes = [];
  for (const plan of plans) {
    const desired = buildDesiredPlanState(plan);
    const storedStatus = String(plan?.scheduleStatus || "").trim() || null;
    const storedCompleted = Boolean(plan?.isCompleted);
    const nextData = {};

    if (storedStatus !== desired.desiredStatus) {
      nextData.scheduleStatus = desired.desiredStatus;
    }
    const shouldBeCompleted = desired.desiredStatus === STATUS_PRODUCTION_COMPLETED;
    if (storedCompleted !== shouldBeCompleted) {
      nextData.isCompleted = shouldBeCompleted;
    }

    if (shouldBeCompleted) {
      const resolvedReadyDate =
        desired.currentReadyDate || desired.autoReadyDate || null;
      const resolvedClosedQty =
        desired.producedQuantity > 0 ? desired.producedQuantity : toPositiveIntOrNull(plan?.closedQty);
      const resolvedCloseMode = resolveAssignmentPlanCloseMode({
        closedQty: resolvedClosedQty,
        targetQty: desired.baselineQuantity,
      });

      if (!plan.productionCompletedAt && resolvedReadyDate) {
        nextData.productionCompletedAt = resolvedReadyDate;
      }
      if (!plan.completedAt && resolvedReadyDate) {
        nextData.completedAt = resolvedReadyDate;
      }
      if (plan.finalQuantity == null && resolvedClosedQty != null) {
        nextData.finalQuantity = resolvedClosedQty;
      }
      if (plan.closedQty == null && resolvedClosedQty != null) {
        nextData.closedQty = resolvedClosedQty;
      }
      if (!plan.closedAt && resolvedReadyDate) {
        nextData.closedAt = resolvedReadyDate;
      }
      if (!plan.closedBy && resolvedReadyDate) {
        nextData.closedBy = AUTO_WORKLOG_COMPLETED_BY;
      }
      if (!plan.closeMode && resolvedCloseMode) {
        nextData.closeMode = resolvedCloseMode;
      }
    }

    if (Object.keys(nextData).length === 0) continue;

    changes.push({
      id: plan.id,
      orgId: plan.orgId,
      externalId: plan.externalId,
      fromStatus: storedStatus,
      toStatus: desired.desiredStatus,
      fromCompleted: storedCompleted,
      producedQuantity: desired.producedQuantity,
      totalDone: desired.totalDone,
      processCount: desired.processCount,
      data: nextData,
    });
  }

  const summary = changes.reduce(
    (acc, change) => {
      const key = `${change.fromStatus || "NULL"} -> ${change.toStatus}`;
      acc.statusTransitions[key] = (acc.statusTransitions[key] || 0) + 1;
      if (!change.fromCompleted && change.toStatus === STATUS_PRODUCTION_COMPLETED) {
        acc.completedUpgrades += 1;
      }
      return acc;
    },
    { total: changes.length, completedUpgrades: 0, statusTransitions: {} }
  );

  console.log(
    JSON.stringify(
      {
        apply: shouldApply,
        orgId: orgId || null,
        summary,
        changes: changes.map((change) => ({
          id: change.id,
          orgId: change.orgId,
          externalId: change.externalId,
          fromStatus: change.fromStatus,
          toStatus: change.toStatus,
          fromCompleted: change.fromCompleted,
          producedQuantity: change.producedQuantity,
          totalDone: change.totalDone,
          processCount: change.processCount,
          data: change.data,
        })),
      },
      null,
      2
    )
  );

  if (!shouldApply || changes.length === 0) return;

  await prisma.$transaction(
    changes.map((change) =>
      prisma.assignmentPlan.update({
        where: { id: change.id },
        data: {
          ...change.data,
          updatedAt: new Date(),
        },
      })
    )
  );
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
