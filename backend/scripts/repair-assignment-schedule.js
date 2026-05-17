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
  const schedule = value?.ctSnapshot?.schedule;
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
        ctSnapshot: true,
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
    const targetSchedule =
      extractSnapshotSchedule(assignment, assignment) ||
      extractSnapshotSchedule(linkedPlan, assignment);
    if (!targetSchedule) return assignment;

    const currentSchedule = extractCurrentSchedule(assignment);
    if (sameSchedule(currentSchedule, targetSchedule)) return assignment;

    updatedAssignmentCount += 1;
    return {
      ...applySchedule(assignment, targetSchedule),
      version: Math.max(0, toSignedInt(assignment?.version, 0)) + 1,
      versionUpdatedAt: nowIso,
    };
  });

  let updatedPlanCount = 0;
  const planUpdates = plans
    .map((plan) => {
      const linkedAssignment = assignmentByExternalId.get(normalizeText(plan?.externalId)) || null;
      const targetSchedule =
        extractSnapshotSchedule(plan, plan) ||
        extractSnapshotSchedule(linkedAssignment, plan);
      if (!targetSchedule) return null;

      const currentSchedule = extractCurrentSchedule(plan);
      if (sameSchedule(currentSchedule, targetSchedule)) return null;

      updatedPlanCount += 1;
      return {
        id: plan.id,
        data: {
          ...targetSchedule,
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
