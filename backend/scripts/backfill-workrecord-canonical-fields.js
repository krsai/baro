#!/usr/bin/env node
"use strict";

require("dotenv").config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary";
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

const resolveOptionalString = (value, fallback = null) => {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

const toPositiveIntOrNull = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const normalizeComparableText = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();

const normalizeDateKey = (value) => {
  const text = resolveOptionalString(value, null);
  if (!text) return null;
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const parseAssignmentCardIdentity = (value) => {
  const raw = resolveOptionalString(value, null);
  if (!raw) return null;
  const parts = raw.split("::");
  if (parts.length < 2) return null;
  const orderId = resolveOptionalString(parts[0], null);
  const styleId = resolveOptionalString(parts[1], null);
  if (!orderId || !styleId) return null;
  return { orderId, styleId };
};

const normalizeStateAssignments = (value) =>
  Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

const resolveAssignmentExternalId = (item) =>
  resolveOptionalString(item?.id ?? item?.externalId, null);

const resolveWorkLogLineMeta = (value) => {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? value
      : Array.isArray(value)
        ? value.find((item) => item && typeof item === "object")
        : null;
  return {
    lineId: toPositiveIntOrNull(source?.lineId),
    lineName: resolveOptionalString(source?.lineName, null),
  };
};

const resolveWorkRecordProcessBucketKey = (record) => {
  const processId = toPositiveIntOrNull(record?.processId);
  if (processId != null) return `id:${processId}`;
  const processCode = resolveOptionalString(record?.processCode, null);
  if (processCode) return `code:${normalizeComparableText(processCode)}`;
  return "unknown";
};

const resolveAssignmentPlanRequiredProcessGroups = (plan) => {
  const snapshot = plan?.assignmentCtSnapshot && typeof plan.assignmentCtSnapshot === "object"
    ? plan.assignmentCtSnapshot
    : plan?.ctSnapshot && typeof plan.ctSnapshot === "object"
      ? plan.ctSnapshot
      : null;
  const processRows = Array.isArray(snapshot?.processes) ? snapshot.processes : [];
  if (processRows.length === 0) return [];
  return processRows
    .map((process) => {
      const candidates = [];
      const processId = toPositiveIntOrNull(process?.processId ?? process?.id);
      if (processId) candidates.push(`id:${processId}`);
      const processCode = resolveOptionalString(process?.processCode ?? process?.code, null);
      if (processCode) candidates.push(`code:${normalizeComparableText(processCode)}`);
      return Array.from(new Set(candidates));
    })
    .filter((group) => Array.isArray(group) && group.length > 0);
};

const resolveAssignmentPlanStyleMatchKeys = (plan) => {
  const snapshot = plan?.assignmentCtSnapshot && typeof plan.assignmentCtSnapshot === "object"
    ? plan.assignmentCtSnapshot
    : plan?.ctSnapshot && typeof plan.ctSnapshot === "object"
      ? plan.ctSnapshot
      : null;
  return Array.from(
    new Set(
      [
        parseAssignmentCardIdentity(plan?.cardId)?.styleId,
        parseAssignmentCardIdentity(plan?.originOrderId)?.styleId,
        resolveOptionalString(snapshot?.styleId, null),
        resolveOptionalString(plan?.label, null),
      ]
        .filter(Boolean)
        .map((value) => normalizeComparableText(value))
        .filter(Boolean)
    )
  );
};

const resolveWorkRecordStyleMatchKeys = (record) =>
  Array.from(
    new Set(
      [record?.styleId, record?.styleName]
        .map((value) => resolveOptionalString(value, null))
        .filter(Boolean)
        .map((value) => normalizeComparableText(value))
        .filter(Boolean)
    )
  );

const doesAssignmentScheduleContainWorkDate = ({ startDateKey, endDateKey, workDateKey }) => {
  const normalizedWorkDateKey = normalizeDateKey(workDateKey);
  if (!normalizedWorkDateKey) return false;
  const normalizedStartDateKey = normalizeDateKey(startDateKey);
  const normalizedEndDateKey = normalizeDateKey(endDateKey);
  if (normalizedStartDateKey && normalizedWorkDateKey < normalizedStartDateKey) return false;
  if (normalizedEndDateKey && normalizedWorkDateKey > normalizedEndDateKey) return false;
  return Boolean(normalizedStartDateKey || normalizedEndDateKey);
};

const buildPlanMatchCandidates = (plans, assignmentsByExternalId) =>
  (Array.isArray(plans) ? plans : [])
    .map((plan) => {
      const planId = toPositiveIntOrNull(plan?.id);
      if (!planId) return null;
      const externalId = resolveOptionalString(plan?.externalId, null);
      const assignment = externalId ? assignmentsByExternalId.get(externalId) || null : null;
      const snapshot = plan?.assignmentCtSnapshot && typeof plan.assignmentCtSnapshot === "object"
        ? plan.assignmentCtSnapshot
        : plan?.ctSnapshot && typeof plan.ctSnapshot === "object"
          ? plan.ctSnapshot
          : null;
      const schedule = snapshot?.schedule && typeof snapshot.schedule === "object" ? snapshot.schedule : null;
      return {
        planId,
        orderNo: resolveOptionalString(plan?.orderNo, null),
        orderNoKey: resolveOptionalString(plan?.orderNo, null)
          ? normalizeComparableText(plan.orderNo)
          : null,
        lineId: toPositiveIntOrNull(plan?.lineId),
        styleKeys: resolveAssignmentPlanStyleMatchKeys(plan),
        processKeys: new Set(resolveAssignmentPlanRequiredProcessGroups(plan).flat()),
        startDateKey:
          normalizeDateKey(assignment?.startDateKey) ||
          normalizeDateKey(schedule?.startDateKey) ||
          null,
        endDateKey:
          normalizeDateKey(assignment?.endDateKey) ||
          normalizeDateKey(schedule?.endDateKey) ||
          null,
      };
    })
    .filter((candidate) => candidate && candidate.styleKeys.length > 0);

const resolveOrphanOrderNoMatch = ({ record, workLog, candidates }) => {
  const styleKeys = resolveWorkRecordStyleMatchKeys(record);
  if (styleKeys.length === 0) return null;

  let narrowed = candidates.filter((candidate) =>
    candidate.styleKeys.some((styleKey) => styleKeys.includes(styleKey))
  );
  if (narrowed.length === 0) return null;

  const lineId = toPositiveIntOrNull(record?.lineId) ?? resolveWorkLogLineMeta(workLog?.records).lineId;
  if (lineId) {
    const lineMatched = narrowed.filter((candidate) => candidate.lineId === lineId);
    if (lineMatched.length > 0) narrowed = lineMatched;
  }

  const workDateKey = normalizeDateKey(workLog?.workDate);
  if (workDateKey) {
    const dateMatched = narrowed.filter((candidate) =>
      doesAssignmentScheduleContainWorkDate({
        startDateKey: candidate.startDateKey,
        endDateKey: candidate.endDateKey,
        workDateKey,
      })
    );
    if (dateMatched.length > 0) narrowed = dateMatched;
  }

  const processKey = resolveWorkRecordProcessBucketKey(record);
  if (processKey && processKey !== "unknown") {
    const processMatched = narrowed.filter(
      (candidate) =>
        candidate.processKeys.size === 0 || candidate.processKeys.has(processKey)
    );
    if (processMatched.length > 0) narrowed = processMatched;
  }

  return narrowed.length === 1 ? narrowed[0] : null;
};

async function main() {
  let cursorId = null;
  let scanned = 0;
  let updated = 0;
  let directOrderNoUpdated = 0;
  let heuristicOrderNoUpdated = 0;
  let lineIdUpdated = 0;

  while (true) {
    const rows = await prisma.workRecord.findMany({
      where: {
        OR: [{ orderNo: null }, { lineId: null }],
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true,
        orgId: true,
        workLogId: true,
        assignmentPlanId: true,
        orderNo: true,
        lineId: true,
        styleId: true,
        styleName: true,
        processId: true,
        processCode: true,
      },
    });

    if (rows.length === 0) break;
    cursorId = rows[rows.length - 1].id;
    scanned += rows.length;

    const workLogIds = Array.from(new Set(rows.map((row) => row.workLogId).filter(Boolean)));
    const assignmentPlanIds = Array.from(
      new Set(rows.map((row) => toPositiveIntOrNull(row.assignmentPlanId)).filter(Boolean))
    );
    const orgIds = Array.from(new Set(rows.map((row) => row.orgId).filter(Boolean)));

    const [workLogs, planRows, boardStates, orgPlanRows] = await Promise.all([
      prisma.workLog.findMany({
        where: { id: { in: workLogIds } },
        select: { id: true, workDate: true, records: true },
      }),
      assignmentPlanIds.length > 0
        ? prisma.assignmentPlan.findMany({
            where: { id: { in: assignmentPlanIds } },
            select: { id: true, orderNo: true },
          })
        : Promise.resolve([]),
      orgIds.length > 0
        ? prisma.assignmentBoardState.findMany({
            where: { orgId: { in: orgIds } },
            select: { orgId: true, assignments: true },
          })
        : Promise.resolve([]),
      orgIds.length > 0
        ? prisma.assignmentPlan.findMany({
            where: { orgId: { in: orgIds } },
            select: {
              id: true,
              orgId: true,
              externalId: true,
              lineId: true,
              orderNo: true,
              label: true,
              cardId: true,
              originOrderId: true,
              assignmentCtSnapshot: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const workLogById = new Map(workLogs.map((workLog) => [workLog.id, workLog]));
    const planById = new Map(
      planRows.map((plan) => [toPositiveIntOrNull(plan.id), resolveOptionalString(plan.orderNo, null)])
    );
    const assignmentByExternalIdByOrg = new Map();
    boardStates.forEach((row) => {
      const map = new Map();
      normalizeStateAssignments(row.assignments).forEach((assignment) => {
        const externalId = resolveAssignmentExternalId(assignment);
        if (!externalId || map.has(externalId)) return;
        map.set(externalId, assignment);
      });
      assignmentByExternalIdByOrg.set(row.orgId, map);
    });
    const candidatePlansByOrg = orgPlanRows.reduce((map, plan) => {
      const orgId = toPositiveIntOrNull(plan?.orgId);
      if (!orgId) return map;
      const bucket = map.get(orgId) || [];
      bucket.push(plan);
      map.set(orgId, bucket);
      return map;
    }, new Map());
    const candidatesByOrg = new Map();
    orgIds.forEach((orgId) => {
      const plansForOrg = candidatePlansByOrg.get(orgId) || [];
      const assignmentsByExternalId = assignmentByExternalIdByOrg.get(orgId) || new Map();
      candidatesByOrg.set(
        orgId,
        buildPlanMatchCandidates(plansForOrg, assignmentsByExternalId)
      );
    });

    const updates = [];
    rows.forEach((row) => {
      const workLog = workLogById.get(row.workLogId) || null;
      const workLogLineId = resolveWorkLogLineMeta(workLog?.records).lineId;
      const nextLineId = toPositiveIntOrNull(row.lineId) ?? workLogLineId ?? null;

      let nextOrderNo = resolveOptionalString(row.orderNo, null);
      const assignmentPlanId = toPositiveIntOrNull(row.assignmentPlanId);
      let updateSource = null;

      if (!nextOrderNo && assignmentPlanId != null) {
        nextOrderNo = planById.get(assignmentPlanId) ?? null;
        if (nextOrderNo) updateSource = "direct";
      }

      if (!nextOrderNo && assignmentPlanId == null) {
        const matched = resolveOrphanOrderNoMatch({
          record: { ...row, lineId: nextLineId },
          workLog,
          candidates: candidatesByOrg.get(row.orgId) || [],
        });
        nextOrderNo = resolveOptionalString(matched?.orderNo, null);
        if (nextOrderNo) updateSource = "heuristic";
      }

      const lineChanged = (toPositiveIntOrNull(row.lineId) ?? null) !== nextLineId;
      const orderNoChanged = resolveOptionalString(row.orderNo, null) !== nextOrderNo;
      if (!lineChanged && !orderNoChanged) return;

      updates.push({
        id: row.id,
        data: {
          ...(lineChanged ? { lineId: nextLineId } : {}),
          ...(orderNoChanged ? { orderNo: nextOrderNo } : {}),
        },
        updateSource,
        lineChanged,
      });
    });

    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((update) =>
          prisma.workRecord.update({
            where: { id: update.id },
            data: update.data,
          })
        )
      );
      updated += updates.length;
      updates.forEach((update) => {
        if (update.lineChanged) lineIdUpdated += 1;
        if (update.updateSource === "direct") directOrderNoUpdated += 1;
        if (update.updateSource === "heuristic") heuristicOrderNoUpdated += 1;
      });
    }

    console.log(
      `[backfill-workrecord-canonical-fields] scanned=${scanned} updated=${updated} directOrderNoUpdated=${directOrderNoUpdated} heuristicOrderNoUpdated=${heuristicOrderNoUpdated} lineIdUpdated=${lineIdUpdated}`
    );
  }

  console.log(
    `[backfill-workrecord-canonical-fields] done scanned=${scanned} updated=${updated} directOrderNoUpdated=${directOrderNoUpdated} heuristicOrderNoUpdated=${heuristicOrderNoUpdated} lineIdUpdated=${lineIdUpdated}`
  );
}

main()
  .catch((error) => {
    console.error("[backfill-workrecord-canonical-fields] failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
