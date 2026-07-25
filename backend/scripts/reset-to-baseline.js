#!/usr/bin/env node
'use strict';

require('dotenv').config();
process.env.PRISMA_CLIENT_ENGINE_TYPE ||= 'binary';
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { normalizeProcessNaming } = require('./lib/processNamingRules.js');
const DEFAULT_TIME_REF_QUANTITY = 1000;
const ST_STANDARD_BUCKETS = Object.freeze([
  1,
  3,
  5,
  10,
  30,
  50,
  100,
  300,
  500,
  1000,
  3000,
  5000,
  10000,
]);
const DEFAULT_UPDATED_BY = 'SYSTEM_REALIGN';

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

const sortJsonValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((result, key) => {
        result[key] = sortJsonValue(value[key]);
        return result;
      }, {});
  }
  return value ?? null;
};

const normalizeJson = (value) => JSON.stringify(sortJsonValue(value ?? null));

const clampProcessSeconds = (value) => {
  const parsed = roundToScale(value);
  if (parsed === null) return null;
  if (parsed <= 0) return 0;
  return Math.max(0, Math.round(parsed));
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
  const setBy = String(row?.setBy || '').trim().toUpperCase();
  const rank =
    setBy === 'MANUAL'
      ? 4
      : setBy === 'LEGACY'
        ? 3
        : setBy === 'SEED'
          ? 2
          : setBy === 'PT_DERIVED'
            ? 1
            : 0;
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
  `${processCode || 'PROC'}-${rowId || index}-${index}`;

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
          const seconds = clampProcessSeconds(standard?.bucketStSeconds ?? standard?.stSeconds);
          if (seconds === null) return null;
          return {
            bucketQuantity: resolveStBucketQuantity(
              standard?.bucketQuantity ?? standard?.quantity
            ),
            bucketStSeconds: seconds,
            setBy:
              typeof standard?.setBy === 'string' && standard.setBy.trim()
                ? standard.setBy.trim()
                : null,
            setAt: standard?.setAt ? new Date(standard.setAt).toISOString() : null,
            updatedAt: standard?.updatedAt ? new Date(standard.updatedAt).toISOString() : null,
          };
        })
        .filter(Boolean)
        .sort((left, right) => left.bucketQuantity - right.bucketQuantity);

      return {
        code: row?.processCode || '',
        name: row?.processName || row?.processCode || `Process ${index + 1}`,
        description: row?.processDescription ?? null,
        timesPerPiece: toPositiveInt(row?.timesPerPiece ?? row?.processQuantity, 1),
        pt: clampProcessSeconds(row?.ptSeconds),
        atParams:
          row?.atParams && typeof row.atParams === 'object' && !Array.isArray(row.atParams)
            ? row.atParams
            : null,
        stBuckets: standards,
        timeRefQuantity: standards[0]?.bucketQuantity ?? DEFAULT_TIME_REF_QUANTITY,
        instanceId: resolveProcessInstanceId(row?.processCode, row?.id, index),
      };
    });

const resolveStyleRefIdFromAssignment = (plan) => sampleToPositiveIntOrNull(plan?.styleId);

const resolveColorCodeFromAssignment = (plan) => {
  const splitCandidate = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const parts = raw.split('::');
    return String(parts[2] || '').trim();
  };

  return (
    splitCandidate(plan?.externalId) ||
    splitCandidate(plan?.originOrderId) ||
    splitCandidate(plan?.cardId)
  );
};

const normalizeAssignmentSchedule = (plan, existingSnapshot) => {
  const existing = existingSnapshot?.schedule;
  if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
    return {
      startIndex: Number.isFinite(Number(existing.startIndex)) ? Number(existing.startIndex) : 0,
      endIndex: Number.isFinite(Number(existing.endIndex)) ? Number(existing.endIndex) : 0,
      startDayOffsetPercent: Number.isFinite(Number(existing.startDayOffsetPercent))
        ? Number(existing.startDayOffsetPercent)
        : null,
      startDayPercent: Number.isFinite(Number(existing.startDayPercent))
        ? Number(existing.startDayPercent)
        : null,
      endDayPercent: Number.isFinite(Number(existing.endDayPercent))
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
  const standards = Array.isArray(process?.stBuckets)
    ? process.stBuckets
    : Array.isArray(process?.stValues)
      ? process.stValues
      : [];
  const exact = standards.find(
    (value) => resolveStBucketQuantity(value?.bucketQuantity ?? value?.quantity) === bucketQuantity
  );
  const exactSeconds = exact?.bucketStSeconds ?? exact?.seconds;
  if (exactSeconds != null) {
    return clampProcessSeconds(exactSeconds);
  }
  return clampProcessSeconds(process?.pt);
};

const buildAssignmentSnapshot = ({ plan, styleProcesses, updatedAtIso, updatedBy }) => {
  const existingSnapshot =
    plan?.assignmentCtSnapshot && typeof plan.assignmentCtSnapshot === 'object' && !Array.isArray(plan.assignmentCtSnapshot)
      ? plan.assignmentCtSnapshot
      : plan?.ctSnapshot && typeof plan.ctSnapshot === 'object' && !Array.isArray(plan.ctSnapshot)
        ? plan.ctSnapshot
      : null;
  const orderQuantity = toPositiveInt(
    plan?.finalQuantity ?? plan?.assignmentQuantity ?? plan?.quantity ?? existingSnapshot?.quantity ?? 1,
    1
  );
  const snapshotProcesses = styleProcesses
    .map((process, index) => {
      const stSeconds = resolveStPerPieceSeconds(process, orderQuantity);
      if (stSeconds == null) return null;
      const timesPerPiece = toPositiveInt(process?.timesPerPiece ?? process?.quantity, 1);
      return {
        processKey: String(
          process?.instanceId || process?.id || process?.code || `PROCESS-${index + 1}`
        ).trim(),
        name: process?.name || process?.processName || process?.code || `Process ${index + 1}`,
        timesPerPiece,
        basis: 'ST',
        snapshotCtSeconds: stSeconds,
        pieceCtSeconds: stSeconds,
      };
    })
    .filter(Boolean);

  if (snapshotProcesses.length === 0) return null;

  const pieceCtTotalSeconds = snapshotProcesses.reduce(
    (sum, process) => sum + (Number(process?.pieceCtSeconds) || 0),
    0
  );
  const assignmentCtTotalSeconds = Math.max(
    0,
    Math.round(pieceCtTotalSeconds * orderQuantity)
  );

  return {
    updatedAt: updatedAtIso,
    updatedBy,
    quantity: orderQuantity,
    schedule: normalizeAssignmentSchedule(plan, existingSnapshot),
    pieceCtTotalSeconds,
    assignmentCtTotalSeconds,
    processes: snapshotProcesses,
  };
};

const normalizeAssignmentSnapshotForComparison = (snapshot) => {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return snapshot ?? null;
  }

  const nextSnapshot = { ...snapshot };
  delete nextSnapshot.updatedAt;
  delete nextSnapshot.updatedBy;
  return nextSnapshot;
};

const normalizeBoardAssignmentForComparison = (assignment) => {
  if (!assignment || typeof assignment !== 'object' || Array.isArray(assignment)) {
    return assignment ?? null;
  }

  const nextAssignment = {
    ...assignment,
    assignmentCtSnapshot: normalizeAssignmentSnapshotForComparison(
      assignment.assignmentCtSnapshot ?? assignment.ctSnapshot
    ),
  };
  delete nextAssignment.ctSnapshot;
  delete nextAssignment.version;
  delete nextAssignment.versionUpdatedAt;
  return nextAssignment;
};

const toPositiveIdList = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );

const toStringIdList = (values) =>
  Array.from(
    new Set(
      (Array.isArray(values) ? values : [values])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

async function runTimeModelRealignment(prisma, options = {}) {
  const updatedAt = options.updatedAt instanceof Date ? options.updatedAt : new Date();
  const updatedAtIso = updatedAt.toISOString();
  const updatedBy =
    typeof options.updatedBy === 'string' && options.updatedBy.trim()
      ? options.updatedBy.trim()
      : DEFAULT_UPDATED_BY;
  const orgIds = toPositiveIdList(options.orgIds);
  const styleIds = toPositiveIdList(options.styleIds);
  const shouldLog = options.log !== false;

  const styleProcessWhere = {};
  if (orgIds.length > 0) {
    styleProcessWhere.orgId = { in: orgIds };
  }
  if (styleIds.length > 0) {
    styleProcessWhere.styleId = { in: styleIds };
  }

  const styleProcessRows = await prisma.styleProcess.findMany({
    where: Object.keys(styleProcessWhere).length > 0 ? styleProcessWhere : undefined,
    include: {
      style: {
        select: {
          id: true,
          orgId: true,
          code: true,
          name: true,
        },
      },
      standards: {
        orderBy: [{ bucketQuantity: 'asc' }, { id: 'asc' }],
      },
    },
    orderBy: [{ styleId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });

  const touchedStyleProcessIds = new Set();
  const touchedStyleIds = new Set();
  const candidateStyleIds = new Set(styleProcessRows.map((row) => row.styleId));

  for (const row of styleProcessRows) {
    const nextPtSeconds = clampProcessSeconds(row?.ptSeconds);
    const groupedStandards = new Map();

    for (const standard of Array.isArray(row?.standards) ? row.standards : []) {
      const stSeconds = clampProcessSeconds(standard?.bucketStSeconds ?? standard?.stSeconds);
      if (stSeconds === null) continue;
      const quantity = resolveStBucketQuantity(standard?.bucketQuantity ?? standard?.quantity);
      const candidate = {
        id: standard.id,
        quantity,
        stSeconds,
        setBy:
          typeof standard?.setBy === 'string' && standard.setBy.trim()
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
          const stSeconds = clampProcessSeconds(
            standard?.bucketStSeconds ?? standard?.stSeconds
          );
          if (stSeconds === null) return null;
          return {
            quantity: resolveStBucketQuantity(standard?.bucketQuantity ?? standard?.quantity),
            stSeconds,
            setBy:
              typeof standard?.setBy === 'string' && standard.setBy.trim()
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

    const styleBucketEntries = await prisma.quantityBucketEntry.findMany({
      where: {
        quantityBucketSetVersion: {
          timeStyles: { some: { id: row.styleId } },
        },
      },
      select: { id: true, quantityBucketSetVersionId: true, bucketQuantity: true },
    });
    const bucketEntryByQuantity = new Map(
      styleBucketEntries.map((entry) => [entry.bucketQuantity, entry])
    );
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
          data: nextStandards.map((standard) => {
            const entry = bucketEntryByQuantity.get(standard.quantity);
            if (!entry) throw new Error(`missing bucket entry ${standard.quantity}`);
            return {
              orgId: row.orgId,
              styleProcessId: row.id,
              quantityBucketEntryId: entry.id,
              quantityBucketSetVersionId: entry.quantityBucketSetVersionId,
              bucketStSeconds: standard.stSeconds,
              setBy: standard.setBy,
              setAt: standard.setAt ? new Date(standard.setAt) : undefined,
            };
          }),
        });
      }
    });

    touchedStyleProcessIds.add(row.id);
    touchedStyleIds.add(row.styleId);
  }

  const refreshedStyleProcessWhere = {};
  if (styleIds.length > 0) {
    refreshedStyleProcessWhere.styleId = { in: styleIds };
  } else if (candidateStyleIds.size > 0) {
    refreshedStyleProcessWhere.styleId = { in: Array.from(candidateStyleIds) };
  } else if (orgIds.length > 0) {
    refreshedStyleProcessWhere.orgId = { in: orgIds };
  }

  const refreshedStyleProcessRows = await prisma.styleProcess.findMany({
    where: Object.keys(refreshedStyleProcessWhere).length > 0
      ? refreshedStyleProcessWhere
      : undefined,
    include: {
      standards: {
        orderBy: [{ quantityBucketEntry: { bucketQuantity: 'asc' } }, { id: 'asc' }],
        include: { quantityBucketEntry: true },
      },
    },
    orderBy: [{ styleId: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
  });

  const styleProcessRowsByStyleId = refreshedStyleProcessRows.reduce((map, row) => {
    const current = map.get(row.styleId) || [];
    current.push(row);
    map.set(row.styleId, current);
    return map;
  }, new Map());

  const styleWhere = {};
  if (orgIds.length > 0) {
    styleWhere.orgId = { in: orgIds };
  }
  if (styleIds.length > 0) {
    styleWhere.id = { in: styleIds };
  } else if (candidateStyleIds.size > 0) {
    styleWhere.id = { in: Array.from(candidateStyleIds) };
  }

  const styles = await prisma.style.findMany({
    where: Object.keys(styleWhere).length > 0 ? styleWhere : undefined,
    select: {
      id: true,
      orgId: true,
      code: true,
      name: true,
      processes: true,
    },
  });

  const styleById = new Map();
  styles.forEach((style) => {
    if (!Number.isFinite(Number(style?.id))) return;
    styleById.set(Number(style.id), style);
  });

  const processMirrorByStyleId = new Map();
  Array.from(styleProcessRowsByStyleId.entries()).forEach(([styleId, rows]) => {
    processMirrorByStyleId.set(styleId, buildProcessMirror(rows));
  });

  let updatedStyleMirrorCount = 0;
  for (const style of styles) {
    const nextProcesses = processMirrorByStyleId.get(style.id);
    if (!nextProcesses) continue;
    if (normalizeJson(style?.processes ?? null) === normalizeJson(nextProcesses)) {
      continue;
    }
    await prisma.style.update({
      where: { id: style.id },
      data: {
        processes: nextProcesses,
      },
    });
    updatedStyleMirrorCount += 1;
  }

  const assignmentPlanWhere = {};
  if (orgIds.length > 0) {
    assignmentPlanWhere.orgId = { in: orgIds };
  }

  const assignmentPlans = await prisma.assignmentPlan.findMany({
    where: Object.keys(assignmentPlanWhere).length > 0 ? assignmentPlanWhere : undefined,
    select: {
      id: true,
      orgId: true,
      externalId: true,
      cardId: true,
      originOrderId: true,
      label: true,
      styleId: true,
      assignmentQuantity: true,
      finalQuantity: true,
      lineId: true,
      startIndex: true,
      endIndex: true,
      assignmentStTotalSeconds: true,
      assignmentCtTotalSeconds: true,
      assignmentCtSnapshot: true,
    },
    orderBy: [{ orgId: 'asc' }, { id: 'asc' }],
  });

  const nextSnapshotByExternalId = new Map();
  let assignmentPlanUpdateCount = 0;

  for (const plan of assignmentPlans) {
    const styleId = resolveStyleRefIdFromAssignment(plan);
    if (!styleId) continue;
    const style = styleById.get(styleId);
    if (!style) continue;
    const styleProcesses = processMirrorByStyleId.get(style.id) || [];
    if (styleProcesses.length === 0) continue;

    const nextSnapshot = buildAssignmentSnapshot({
      plan,
      styleProcesses,
      updatedAtIso,
      updatedBy,
    });
    if (!nextSnapshot) continue;

    const nextStTotalSeconds = Math.max(
      0,
      Math.round(Number(nextSnapshot.pieceCtTotalSeconds || 0) * Number(nextSnapshot.quantity || 0))
    );
    const nextCtTotalSeconds = nextSnapshot.assignmentCtTotalSeconds;
    const comparableCurrent = {
      ctTotalSeconds: Number(plan?.assignmentCtTotalSeconds) || 0,
      stTotalSeconds: Number(plan?.assignmentStTotalSeconds) || 0,
      ctSnapshot: normalizeAssignmentSnapshotForComparison(plan?.assignmentCtSnapshot),
    };
    const comparableNext = {
      ctTotalSeconds: nextCtTotalSeconds,
      stTotalSeconds: nextStTotalSeconds,
      ctSnapshot: normalizeAssignmentSnapshotForComparison(nextSnapshot),
    };
    if (normalizeJson(comparableCurrent) === normalizeJson(comparableNext)) {
      nextSnapshotByExternalId.set(
        plan.externalId,
        plan?.assignmentCtSnapshot && typeof plan.assignmentCtSnapshot === 'object' && !Array.isArray(plan.assignmentCtSnapshot)
          ? plan.assignmentCtSnapshot
          : nextSnapshot
      );
      continue;
    }

    await prisma.assignmentPlan.update({
      where: { id: plan.id },
      data: {
        assignmentCtTotalSeconds: nextCtTotalSeconds,
        assignmentStTotalSeconds: nextStTotalSeconds,
        assignmentCtSnapshot: nextSnapshot,
      },
    });
    assignmentPlanUpdateCount += 1;
    nextSnapshotByExternalId.set(plan.externalId, nextSnapshot);
  }

  const boardStateWhere = {};
  if (orgIds.length > 0) {
    boardStateWhere.orgId = { in: orgIds };
  }

  const boardStates = await prisma.assignmentBoardState.findMany({
    where: Object.keys(boardStateWhere).length > 0 ? boardStateWhere : undefined,
    select: {
      id: true,
      orgId: true,
      assignments: true,
    },
    orderBy: { id: 'asc' },
  });

  let boardStateUpdateCount = 0;

  for (const state of boardStates) {
    if (!Array.isArray(state?.assignments) || state.assignments.length === 0) continue;
    let changed = false;
    const nextAssignments = state.assignments.map((assignment) => {
      if (!assignment || typeof assignment !== 'object') return assignment;
      const externalId = String(assignment?.id || assignment?.externalId || '').trim();
      if (!externalId || !nextSnapshotByExternalId.has(externalId)) return assignment;
      const nextSnapshot = nextSnapshotByExternalId.get(externalId);
      const nextStTotalSeconds = Math.max(
        0,
        Math.round(Number(nextSnapshot.pieceCtTotalSeconds || 0) * Number(nextSnapshot.quantity || 0))
      );
      const nextCtTotalSeconds = nextSnapshot.assignmentCtTotalSeconds;
      const nextAssignment = {
        ...assignment,
        ctTotalSeconds: nextCtTotalSeconds,
        stTotalSeconds: nextStTotalSeconds,
        basis: 'ST',
        assignmentCtSnapshot: nextSnapshot,
        version: toPositiveInt(assignment?.version ?? 1, 1) + 1,
        versionUpdatedAt: updatedAtIso,
      };
      delete nextAssignment.ctSnapshot;
      const isMeaningfullyChanged =
        normalizeJson(normalizeBoardAssignmentForComparison(assignment)) !==
        normalizeJson(normalizeBoardAssignmentForComparison(nextAssignment));
      if (!isMeaningfullyChanged) {
        return assignment;
      }
      changed = true;
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

  const result = {
    ok: true,
    updatedAt: updatedAtIso,
    summary: {
      touchedStyleProcesses: touchedStyleProcessIds.size,
      touchedStyles: touchedStyleIds.size,
      updatedStyleMirrors: updatedStyleMirrorCount,
      updatedAssignmentPlans: assignmentPlanUpdateCount,
      updatedBoardStates: boardStateUpdateCount,
    },
  };

  if (shouldLog) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}


const prisma = new PrismaClient();

const runReplaceStyleProcessMaster = (() => {
  const DEFAULT_ORG_ID = 2;
  const DEFAULT_CUSTOMER_NAME = "TSBR";
  const TIME_REF_QUANTITY = 1000;
  const SEEDED_ST_BUCKETS = [300, TIME_REF_QUANTITY];
  const round4 = (value) => Math.round(Number(value || 0) * 10000) / 10000;
  const clampProcessSeconds = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    if (parsed <= 0) return 0;
    return Math.max(0, Math.round(parsed));
  };
  const toSeedSeconds = (value) => clampProcessSeconds(value) ?? 0;
  
  const masterProcess = (code, nameEn, nameKo, nameVi) =>
    normalizeProcessNaming({
      code,
      name: nameEn,
      nameEn,
      nameKo,
      nameVi,
    });
  
  const row = (
    code,
    totalSeconds,
    {
      quantity = 1,
      sectionVi = "",
      sectionKo = "",
      detailVi = "",
      detailKo = "",
    } = {}
  ) => ({
    code,
    totalSeconds,
    quantity,
    sectionVi,
    sectionKo,
    detailVi,
    detailKo,
  });
  
  const MASTER_PROCESSES = [
    masterProcess(
      "PKT_FLAP_TURN_CHEST",
      "Turn chest pocket flap",
      "가슴 포켓 덮개 뒤집어 박기",
      "May lon nap tui nguc"
    ),
    masterProcess(
      "PKT_FLAP_TOPSTITCH_1N",
      "Single-needle topstitch chest pocket flap",
      "가슴 포켓 덮개 1줄 상침",
      "Mi 1 ly nap tui nguc"
    ),
    masterProcess(
      "PKT_OPENING_FOLD",
      "Fold pocket opening",
      "포켓 입구 접기",
      "Gap mieng tui"
    ),
    masterProcess(
      "FRONT_PLACKET_TURN_REINFORCE_TOPSTITCH",
      "Turn front placket and reinforce topstitch",
      "앞단작 뒤집어 박기 + 보강 상침",
      "May lon nep than truoc + mi tang cuong"
    ),
    masterProcess(
      "FRONT_PLACKET_TOPSTITCH",
      "Topstitch front placket",
      "앞단작 상침",
      "Tran nep than truoc"
    ),
    masterProcess(
      "BODY_HEM",
      "Hem body",
      "몸판 밑단 봉제",
      "May gau than"
    ),
    masterProcess(
      "PKT_ATTACH_FRONT",
      "Attach pocket to front body",
      "앞판 포켓 부착",
      "Dan tui vao than truoc"
    ),
    masterProcess(
      "FRONT_COLLAR_FACING_FOLD_5MM",
      "Fold front collar facing 5 mm",
      "앞목 페이싱 5mm 접기",
      "Gap dap co truoc 5 ly"
    ),
    masterProcess(
      "PKT_FLAP_BASTE_CHEST",
      "Baste chest pocket flap",
      "가슴 포켓 덮개 가봉",
      "Ghim nap tui nguc"
    ),
    masterProcess(
      "SIZE_LABEL_ATTACH",
      "Attach size label",
      "사이즈 라벨 부착",
      "May mac size"
    ),
    masterProcess(
      "BACK_COLLAR_FACING_TURN",
      "Turn back collar facing",
      "뒤목 페이싱 뒤집어 박기",
      "May lon dap co sau"
    ),
    masterProcess(
      "SHOULDER_JOIN",
      "Join shoulder seam",
      "어깨 연결",
      "Chap vai than truoc + than sau"
    ),
    masterProcess(
      "SHOULDER_OVERLOCK_5T",
      "5-thread overlock shoulder seam",
      "어깨 5실 오버록",
      "Vat so 5 chi vai"
    ),
    masterProcess(
      "NECKLINE_TOPSTITCH_BACK",
      "Single-needle neckline topstitch and back neck topstitch",
      "목둘레 1줄 상침 + 뒤목 상침",
      "Mi 1 ly vong co + tran co sau"
    ),
    masterProcess(
      "SLEEVE_ATTACH_OVERLOCK_5T",
      "5-thread overlock sleeve attachment",
      "소매 달기 5실 오버록",
      "Vat so 5 chi tra tay"
    ),
    masterProcess(
      "SLIT_OVERLOCK_3T",
      "3-thread overlock slit",
      "트임 3실 오버록",
      "Vat so 3 chi xe"
    ),
    masterProcess(
      "PKT_FLAP_OVERLOCK_3T",
      "3-thread overlock pocket flap",
      "포켓 덮개 3실 오버록",
      "Vat so 3 chi nap tui"
    ),
    masterProcess(
      "SIDE_SEAM_OVERLOCK_5T_WITH_LABEL",
      "5-thread overlock side seam with label",
      "옆선 + 라벨 5실 오버록",
      "Vat so 5 chi suon + mac"
    ),
    masterProcess(
      "SLIT_BARTACK_TOPSTITCH",
      "Bartack and topstitch slit",
      "트임 바텍 + 상침",
      "Chan xe + dieu xe"
    ),
    masterProcess(
      "SLEEVE_HEM",
      "Hem sleeve",
      "소매 밑단 봉제",
      "May gau tay"
    ),
    masterProcess("BARTACK", "Bartack", "바텍", "Bo"),
    masterProcess("BUTTON_ATTACH", "Attach button", "단추 달기", "Dong cuc"),
    masterProcess(
      "WELT_OVERLOCK_3T",
      "3-thread overlock welt",
      "웰트 3실 오버록",
      "Vat so 3 chi coi"
    ),
    masterProcess(
      "WELT_RELEASE",
      "Release welt pocket",
      "웰트 벌리기",
      "Tha coi"
    ),
    masterProcess(
      "WELT_BAG_TURN_TOPSTITCH_BARTACK",
      "Bartack welt, topstitch, turn pocket bag and topstitch",
      "웰트 바텍 + 상침 + 주머니 뒤집기 + 상침",
      "Chan coi + mi coi + may lon tui + dieu tui"
    ),
    masterProcess(
      "SLANT_POCKET_TURN_TOPSTITCH",
      "Turn slant pocket and topstitch",
      "사선 포켓 뒤집어 박기 + 상침",
      "May lon tui xeo + dieu"
    ),
    masterProcess(
      "POCKET_BAG_ATTACH_FRONT",
      "Attach front pocket bag",
      "앞판 포켓감 부착",
      "May dap vao lot tui than truoc"
    ),
    masterProcess(
      "POCKET_FACING_TURN_TOPSTITCH_FRONT",
      "Turn pocket facing and topstitch front",
      "앞판 포켓 페이싱 뒤집어 박기 + 상침",
      "May lon dap tui + mi than truoc"
    ),
    masterProcess(
      "FRONT_POCKET_OPENING_TOPSTITCH",
      "Topstitch front pocket opening",
      "앞판 포켓 입구 상침",
      "Dieu mieng tui than truoc"
    ),
    masterProcess(
      "FRONT_POCKET_END_BARTACK",
      "Bartack both ends of front pocket",
      "앞판 포켓 양끝 바텍",
      "Chan 2 dau tui than truoc"
    ),
    masterProcess("LABEL_BASTE", "Baste label", "라벨 가봉", "Ghim mac"),
    masterProcess(
      "FRONT_POCKET_FACING_OVERLOCK_3T",
      "3-thread overlock front pocket facing",
      "앞판 포켓 페이싱 3실 오버록",
      "Vat so 3 chi dap tui than truoc"
    ),
    masterProcess(
      "SIDE_ZIPPER_POCKET_BAG_EDGE_OVERLOCK_3T",
      "3-thread overlock side zipper pocket bag edge",
      "옆지퍼 포켓감 가장자리 3실 오버록",
      "Vat so 3 chi canh tui lot khoa suon"
    ),
    masterProcess(
      "SIDE_ZIPPER_DROP_EDGE_OVERLOCK_3T",
      "3-thread overlock side zipper edge",
      "옆지퍼 부속 가장자리 3실 오버록",
      "Vat so 3 chi mep khoa suon"
    ),
    masterProcess(
      "FLY_EDGE_OVERLOCK_3T",
      "3-thread overlock fly edge",
      "앞여밈 가장자리 3실 오버록",
      "Vat so 3 chi mep moi"
    ),
    masterProcess(
      "FRONT_FLY_EXTENSION_OVERLOCK_3T",
      "3-thread overlock front fly extension",
      "앞여밈 연장부 3실 오버록",
      "Vat so 3 chi moi thua truoc"
    ),
    masterProcess(
      "FLY_FACING_OVERLOCK_3T",
      "3-thread overlock fly facing",
      "앞여밈 페이싱 3실 오버록",
      "Vat so 3 chi dap moi"
    ),
    masterProcess(
      "SIDE_POCKET_BAG_LINING_TURN",
      "Turn side pocket bag lining",
      "옆 포켓 안감 뒤집기",
      "Quay lon lot dau tui suon"
    ),
    masterProcess(
      "SIDE_ZIPPER_STOP_BARTACK",
      "Bartack side zipper stops",
      "옆지퍼 고정점 바텍",
      "Chan 2 chot khoa suon"
    ),
    masterProcess(
      "SIDE_ZIPPER_ATTACH",
      "Attach side zipper",
      "옆지퍼 달기",
      "Tra khoa suon"
    ),
    masterProcess(
      "SIDE_ZIPPER_LINING_TURN",
      "Turn side zipper lining",
      "옆지퍼 안감 뒤집어 박기",
      "May lon lot khoa suon"
    ),
    masterProcess(
      "FLY_FACING_TURN_TOPSTITCH",
      "Turn fly facing and topstitch",
      "앞여밈 페이싱 뒤집어 박기 + 상침",
      "May lon dap moi + mi"
    ),
    masterProcess(
      "ZIPPER_GUARD_TURN",
      "Turn zipper guard",
      "지퍼 가드 뒤집어 박기",
      "May lon do khoa"
    ),
    masterProcess(
      "FLY_BARTACK_TURN",
      "Bartack and turn fly",
      "앞여밈 바텍 + 뒤집기",
      "Chan moi + quay moi"
    ),
    masterProcess(
      "FLY_ZIPPER_ATTACH_FACING_TOPSTITCH",
      "Attach zipper and fly facing, then topstitch",
      "지퍼 + 지퍼 페이싱 달기 + 상침",
      "Tra khoa + dap khoa + mi"
    ),
    masterProcess(
      "SIDE_SEAM_FRONT_OVERLOCK_5T",
      "5-thread overlock front side seam",
      "앞판 옆선 5실 오버록",
      "Vat so 5 chi suon than truoc"
    ),
    masterProcess(
      "SIDE_SEAM_BACK_OVERLOCK_5T",
      "5-thread overlock back side seam",
      "뒤판 옆선 5실 오버록",
      "Vat so 5 chi suon than sau"
    ),
    masterProcess(
      "FRONT_FLY_OVERLOCK_5T",
      "5-thread overlock front fly",
      "앞여밈 5실 오버록",
      "Vat so 5 chi moi than truoc"
    ),
    masterProcess(
      "CROTCH_INSEAM_OVERLOCK_5T",
      "5-thread overlock crotch and inseam",
      "샅 + 인심 5실 오버록",
      "Vat so 5 chi dang + dung"
    ),
    masterProcess(
      "WAISTBAND_BIND_DRAWSTRING_JOIN",
      "Bind waistband and join drawstring",
      "허리밴드 바인딩 + 끈 연결",
      "Vien cap + noi day vien"
    ),
    masterProcess(
      "WAISTBAND_CENTER_JOIN",
      "Join waistband center seam",
      "허리밴드 중심 연결",
      "Chap song cap"
    ),
    masterProcess(
      "MAIN_LABEL_ATTACH",
      "Attach main label",
      "메인 라벨 부착",
      "May mac chinh"
    ),
    masterProcess(
      "BUTTONHOLE",
      "Make buttonhole",
      "단춧구멍 만들기",
      "Thua khuy"
    ),
    masterProcess(
      "ELASTIC_KANSAI_STITCH",
      "Kansai stitch elastic",
      "고무줄 간사이 봉제",
      "Chay Kansai chun"
    ),
    masterProcess(
      "ELASTIC_BARTACK",
      "Bartack elastic",
      "고무줄 바텍",
      "Chan chun"
    ),
    masterProcess(
      "DRAWSTRING_BIND",
      "Bind drawstring",
      "끈 바인딩",
      "Vien day"
    ),
    masterProcess(
      "DRAWSTRING_END_BARTACK",
      "Bartack both drawstring ends",
      "끈 양끝 바텍",
      "Chan 2 dau day"
    ),
    masterProcess(
      "WAISTBAND_ATTACH",
      "Attach waistband",
      "허리밴드 달기",
      "Tra cap"
    ),
    masterProcess(
      "WAISTBAND_TOPSTITCH_FINISH",
      "Topstitch finished waistband",
      "허리밴드 완성 상침",
      "Mi thanh pham cap"
    ),
    masterProcess(
      "PANTS_HEM",
      "Hem pants",
      "바지 밑단 봉제",
      "May gau quan"
    ),
    masterProcess(
      "PEN_LOOP_CUT_BARTACK",
      "Cut pen loop and bartack",
      "펜 고리 재단 + 바텍",
      "Cat day but + chan"
    ),
    masterProcess(
      "PLACKET_EDGE_FOLD",
      "Fold placket edge",
      "단작 가장자리 접기",
      "Gap mep nep"
    ),
    masterProcess(
      "PLACKET_BUTTON_TAPE_SEW",
      "Sew placket button tape",
      "단작 단추 테이프 봉제",
      "May day cuc nep"
    ),
    masterProcess(
      "FRONT_PLACKET_FACING_ATTACH_MARK",
      "Attach front placket facing and mark",
      "앞단작 페이싱 부착 + 표시",
      "May dap vao tru than truoc + lay dau"
    ),
    masterProcess(
      "FRONT_PLACKET_OPEN_TOPSTITCH",
      "Open placket and topstitch",
      "단작 열기 + 상침",
      "Mo tru + mi tru"
    ),
    masterProcess(
      "BACK_DART",
      "Sew back darts",
      "뒤판 다트 봉제",
      "Chiet ly than sau"
    ),
    masterProcess(
      "BACK_YOKE_JOIN",
      "Join back yoke",
      "뒤 요크 연결",
      "Chap cau vai than sau"
    ),
    masterProcess(
      "BACK_YOKE_TOPSTITCH_1N",
      "Single-needle topstitch back yoke",
      "뒤 요크 1줄 상침",
      "Mi 1 ly cau vai than sau"
    ),
    masterProcess(
      "COLLAR_TURN_TOPSTITCH_1N",
      "Turn collar and single-needle topstitch",
      "칼라 뒤집어 박기 + 1줄 상침",
      "May lon co + mi 1 ly"
    ),
    masterProcess(
      "PLACKET_BARTACK_SHOULDER_TURN",
      "Bartack placket and turn shoulder seam",
      "단작 바텍 + 어깨 뒤집어 박기",
      "Chan tru + may lon vai"
    ),
    masterProcess(
      "WELT_BARTACK_TOPSTITCH",
      "Bartack welt and topstitch",
      "웰트 바텍 + 상침",
      "Chan coi + mi coi"
    ),
    masterProcess(
      "FRONT_NECK_FACING_TURN_TOPSTITCH",
      "Turn front neck facing and topstitch",
      "앞목 페이싱 뒤집어 박기 + 상침",
      "May lon dap co than truoc + mi dap"
    ),
    masterProcess(
      "SHOULDER_TAPE_SEW_3CM",
      "Sew 3 cm shoulder tape",
      "어깨 테이프 3cm 봉제",
      "May nep vai 3 cm"
    ),
    masterProcess(
      "FRONT_NECK_FACING_ATTACH",
      "Attach front neck facing",
      "앞목 페이싱 부착",
      "Tra dap co vao than truoc"
    ),
    masterProcess(
      "FRONT_NECKLINE_TOPSTITCH_1N_2N",
      "Single-needle and double-needle topstitch front neckline",
      "앞목 1줄 + 2줄 상침",
      "Mi 1 ly + 2 ly vong co than truoc"
    ),
    masterProcess(
      "POCKET_EDGESTITCH_AROUND",
      "Edge stitch around pocket",
      "포켓 둘레 상침",
      "Tran vong quanh tui"
    ),
    masterProcess(
      "BACK_YOKE_CONTRAST_TURN",
      "Turn back yoke contrast",
      "뒤 요크 배색 뒤집어 박기",
      "May lon phoi cau vai than sau"
    ),
    masterProcess(
      "BACK_YOKE_CONTRAST_TOPSTITCH_1N_2N",
      "Single-needle and double-needle topstitch back yoke contrast",
      "뒤 요크 배색 1줄 + 2줄 상침",
      "Mi 1 ly + 2 ly phoi cau vai"
    ),
    masterProcess(
      "BACK_NECKLINE_TURN_TOPSTITCH",
      "Turn back neckline and topstitch",
      "뒤목 뒤집어 박기 + 상침",
      "May lon vong co than sau + mi"
    ),
    masterProcess(
      "SHOULDER_TURN_BARTACK",
      "Turn shoulder seam and bartack",
      "어깨 뒤집어 박기 + 바텍",
      "May lon vai + chan vai"
    ),
    masterProcess(
      "FRONT_NECK_FACING_OVERLOCK_3T",
      "3-thread overlock front neck facing",
      "앞목 페이싱 3실 오버록",
      "Vat so 3 chi dap co than truoc"
    ),
    masterProcess(
      "FRONT_POCKET_OVERLOCK_5T",
      "5-thread overlock front pocket",
      "앞판 포켓 5실 오버록",
      "Vat so 5 chi tui than truoc"
    ),
    ];
  
  const STYLES = [
    {
      styleId: "BL20",
      styleCode: "BL20",
      name: "BL20",
      expectedTotalSeconds: 1956,
      rows: [
        row("PKT_FLAP_TURN_CHEST", 80, { sectionVi: "Than truoc", sectionKo: "앞판" }),
        row("PKT_FLAP_TOPSTITCH_1N", 40, { sectionVi: "Than truoc", sectionKo: "앞판" }),
        row("PKT_OPENING_FOLD", 80, {
          quantity: 3,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_PLACKET_TURN_REINFORCE_TOPSTITCH", 150, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_PLACKET_TOPSTITCH", 130, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("BODY_HEM", 150, { quantity: 2, sectionVi: "Than ao", sectionKo: "몸판" }),
        row("PKT_ATTACH_FRONT", 268, {
          quantity: 3,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_COLLAR_FACING_FOLD_5MM", 70, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("PKT_FLAP_BASTE_CHEST", 40, { sectionVi: "Than truoc", sectionKo: "앞판" }),
        row("SIZE_LABEL_ATTACH", 50, { sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("BACK_COLLAR_FACING_TURN", 80, { sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("SHOULDER_JOIN", 100, { sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("SHOULDER_OVERLOCK_5T", 40, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("NECKLINE_TOPSTITCH_BACK", 130, { sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("SLEEVE_ATTACH_OVERLOCK_5T", 110, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("SLIT_OVERLOCK_3T", 40, {
          quantity: 4,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("PKT_FLAP_OVERLOCK_3T", 30, { sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("SIDE_SEAM_OVERLOCK_5T_WITH_LABEL", 113, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("SLIT_BARTACK_TOPSTITCH", 60, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("SLEEVE_HEM", 105, { sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("BARTACK", 90, {
          quantity: 6,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
          detailVi: "Bo thanh pham",
          detailKo: "완성 바텍",
        }),
        row("BUTTON_ATTACH", 0, {
          quantity: 6,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
      ],
    },
    {
      styleId: "AM01160",
      styleCode: "AM01160",
      name: "AM01160",
      expectedTotalSeconds: 4301,
      rows: [
        row("WELT_OVERLOCK_3T", 30, { quantity: 2, sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("WELT_RELEASE", 280, { quantity: 2, sectionVi: "Than sau", sectionKo: "뒤판" }),
        row("WELT_BAG_TURN_TOPSTITCH_BARTACK", 580, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("SLANT_POCKET_TURN_TOPSTITCH", 275, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("POCKET_BAG_ATTACH_FRONT", 50, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("POCKET_FACING_TURN_TOPSTITCH_FRONT", 70, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_POCKET_OPENING_TOPSTITCH", 55, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_POCKET_END_BARTACK", 60, {
          quantity: 4,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("LABEL_BASTE", 35, { sectionVi: "Than truoc", sectionKo: "앞판" }),
        row("FRONT_POCKET_FACING_OVERLOCK_3T", 40, {
          quantity: 2,
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("SIDE_ZIPPER_POCKET_BAG_EDGE_OVERLOCK_3T", 40, {
          quantity: 2,
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("SIDE_ZIPPER_DROP_EDGE_OVERLOCK_3T", 40, {
          quantity: 2,
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("FLY_EDGE_OVERLOCK_3T", 35, {
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("FRONT_FLY_EXTENSION_OVERLOCK_3T", 40, {
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("FLY_FACING_OVERLOCK_3T", 20, {
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("SIDE_POCKET_BAG_LINING_TURN", 162, {
          sectionVi: "Tra khoa suon",
          sectionKo: "옆지퍼",
        }),
        row("SIDE_ZIPPER_STOP_BARTACK", 40, {
          sectionVi: "Tra khoa suon",
          sectionKo: "옆지퍼",
        }),
        row("SIDE_ZIPPER_ATTACH", 140, {
          sectionVi: "Tra khoa suon",
          sectionKo: "옆지퍼",
        }),
        row("SIDE_ZIPPER_LINING_TURN", 140, {
          sectionVi: "Tra khoa suon",
          sectionKo: "옆지퍼",
        }),
        row("FLY_FACING_TURN_TOPSTITCH", 40, {
          sectionVi: "Tra khoa moi",
          sectionKo: "앞지퍼",
        }),
        row("ZIPPER_GUARD_TURN", 60, {
          sectionVi: "Tra khoa moi",
          sectionKo: "앞지퍼",
        }),
        row("FLY_BARTACK_TURN", 70, {
          sectionVi: "Tra khoa moi",
          sectionKo: "앞지퍼",
        }),
        row("FLY_ZIPPER_ATTACH_FACING_TOPSTITCH", 180, {
          sectionVi: "Tra khoa moi",
          sectionKo: "앞지퍼",
        }),
        row("SIDE_SEAM_FRONT_OVERLOCK_5T", 140, {
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("SIDE_SEAM_BACK_OVERLOCK_5T", 120, {
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("FRONT_FLY_OVERLOCK_5T", 40, {
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("CROTCH_INSEAM_OVERLOCK_5T", 200, {
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("WAISTBAND_BIND_DRAWSTRING_JOIN", 100, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("WAISTBAND_CENTER_JOIN", 30, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("MAIN_LABEL_ATTACH", 50, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("BUTTONHOLE", 40, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("ELASTIC_KANSAI_STITCH", 170, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("ELASTIC_BARTACK", 30, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("DRAWSTRING_BIND", 130, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("DRAWSTRING_END_BARTACK", 95, { sectionVi: "Cap", sectionKo: "허리밴드" }),
        row("WAISTBAND_ATTACH", 150, {
          sectionVi: "Hoan thien quan",
          sectionKo: "바지 마감",
        }),
        row("WAISTBAND_TOPSTITCH_FINISH", 187, {
          sectionVi: "Hoan thien quan",
          sectionKo: "바지 마감",
        }),
        row("PANTS_HEM", 197, {
          quantity: 2,
          sectionVi: "Hoan thien quan",
          sectionKo: "바지 마감",
        }),
        row("BARTACK", 140, {
          quantity: 11,
          sectionVi: "Hoan thien quan",
          sectionKo: "바지 마감",
          detailVi: "Bo thanh pham quan",
          detailKo: "바지 완성 바텍",
        }),
      ],
    },
    {
      styleId: "AM01622",
      styleCode: "AM01622",
      name: "AM01622",
      expectedTotalSeconds: 1863,
      rows: [
        row("PKT_OPENING_FOLD", 70, {
          quantity: 3,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("PEN_LOOP_CUT_BARTACK", 57, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("PKT_ATTACH_FRONT", 260, {
          quantity: 3,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("PLACKET_EDGE_FOLD", 60, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("PLACKET_BUTTON_TAPE_SEW", 120, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_PLACKET_FACING_ATTACH_MARK", 170, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_PLACKET_OPEN_TOPSTITCH", 154, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("SIZE_LABEL_ATTACH", 46, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("BACK_DART", 56, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("BACK_YOKE_JOIN", 50, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("BACK_YOKE_TOPSTITCH_1N", 50, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("COLLAR_TURN_TOPSTITCH_1N", 115, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("PLACKET_BARTACK_SHOULDER_TURN", 125, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("SLIT_OVERLOCK_3T", 40, {
          quantity: 4,
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("SLEEVE_ATTACH_OVERLOCK_5T", 100, {
          quantity: 2,
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("SIDE_SEAM_OVERLOCK_5T_WITH_LABEL", 110, {
          quantity: 2,
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("SLIT_BARTACK_TOPSTITCH", 80, {
          quantity: 2,
          sectionVi: "Hoan thien ao",
          sectionKo: "상의 마감",
        }),
        row("BODY_HEM", 100, {
          sectionVi: "Hoan thien ao",
          sectionKo: "상의 마감",
        }),
        row("SLEEVE_HEM", 100, {
          sectionVi: "Hoan thien ao",
          sectionKo: "상의 마감",
        }),
      ],
    },
    {
      styleId: "AM02053",
      styleCode: "AM02053",
      name: "AM02053",
      expectedTotalSeconds: 2247,
      rows: [
        row("WELT_RELEASE", 90, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
          detailVi: "Tui nguc",
          detailKo: "가슴 포켓",
        }),
        row("WELT_RELEASE", 190, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
          detailVi: "Tui duoi",
          detailKo: "아래 포켓",
        }),
        row("DRAWSTRING_END_BARTACK", 65, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
          detailVi: "Day",
          detailKo: "끈",
        }),
        row("WELT_BARTACK_TOPSTITCH", 85, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
          detailVi: "Tui nguc",
          detailKo: "가슴 포켓",
        }),
        row("WELT_BARTACK_TOPSTITCH", 150, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
          detailVi: "Tui duoi",
          detailKo: "아래 포켓",
        }),
        row("FRONT_NECK_FACING_TURN_TOPSTITCH", 120, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("SHOULDER_TAPE_SEW_3CM", 80, {
          quantity: 2,
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_NECK_FACING_ATTACH", 90, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("FRONT_NECKLINE_TOPSTITCH_1N_2N", 90, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("POCKET_EDGESTITCH_AROUND", 100, {
          sectionVi: "Than truoc",
          sectionKo: "앞판",
        }),
        row("SIZE_LABEL_ATTACH", 35, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("BACK_DART", 50, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("BACK_YOKE_CONTRAST_TURN", 57, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("BACK_YOKE_CONTRAST_TOPSTITCH_1N_2N", 80, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("BACK_NECKLINE_TURN_TOPSTITCH", 110, {
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("SHOULDER_TURN_BARTACK", 80, {
          quantity: 2,
          sectionVi: "Than sau",
          sectionKo: "뒤판",
        }),
        row("FRONT_NECK_FACING_OVERLOCK_3T", 30, {
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("SLIT_OVERLOCK_3T", 50, {
          quantity: 4,
          sectionVi: "Vat so 3 chi",
          sectionKo: "3실 오버록",
        }),
        row("FRONT_POCKET_OVERLOCK_5T", 90, {
          quantity: 3,
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("SLEEVE_ATTACH_OVERLOCK_5T", 90, {
          quantity: 2,
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("SIDE_SEAM_OVERLOCK_5T_WITH_LABEL", 115, {
          quantity: 2,
          sectionVi: "Vat so 5 chi",
          sectionKo: "5실 오버록",
        }),
        row("SLIT_BARTACK_TOPSTITCH", 70, {
          quantity: 2,
          sectionVi: "Hoan thien ao",
          sectionKo: "상의 마감",
        }),
        row("BODY_HEM", 115, {
          quantity: 2,
          sectionVi: "Hoan thien ao",
          sectionKo: "상의 마감",
        }),
        row("SLEEVE_HEM", 120, {
          quantity: 2,
          sectionVi: "Hoan thien ao",
          sectionKo: "상의 마감",
        }),
        row("BARTACK", 95, {
          quantity: 8,
          sectionVi: "Hoan thien ao",
          sectionKo: "상의 마감",
          detailVi: "Bo ao",
          detailKo: "상의 바텍",
        }),
      ],
    },
  ];
  
  const buildStyleRowMap = (rows) => {
    const aggregated = new Map();
  
    rows.forEach((item) => {
      const totalSeconds = Number(item.totalSeconds) || 0;
      const quantity = Number(item.quantity) || 0;
      if (totalSeconds <= 0 || quantity <= 0) {
        return;
      }
      const current = aggregated.get(item.code) || {
        code: item.code,
        totalSeconds: 0,
        quantity: 0,
        sectionsVi: new Set(),
        sectionsKo: new Set(),
        detailsVi: new Set(),
        detailsKo: new Set(),
      };
      current.totalSeconds += totalSeconds;
      current.quantity += quantity;
      if (item.sectionVi) current.sectionsVi.add(item.sectionVi);
      if (item.sectionKo) current.sectionsKo.add(item.sectionKo);
      if (item.detailVi) current.detailsVi.add(item.detailVi);
      if (item.detailKo) current.detailsKo.add(item.detailKo);
      aggregated.set(item.code, current);
    });
  
    return Array.from(aggregated.values()).map((item) => {
      const quantity = Math.max(1, Math.round(item.quantity || 1));
      const totalSeconds = round4(item.totalSeconds);
      const detailsKo = Array.from(item.detailsKo).join(", ");
      const detailsVi = Array.from(item.detailsVi).join(", ");
      const sectionsKo = Array.from(item.sectionsKo).join(", ");
      const sectionsVi = Array.from(item.sectionsVi).join(", ");
      const detailLine = [detailsKo, detailsVi].filter(Boolean).join(" / ");
      const sectionLine = [sectionsKo, sectionsVi].filter(Boolean).join(" / ");
  
      return {
        ...item,
        totalSeconds,
        quantity,
        perOccurrenceSeconds: round4(totalSeconds / quantity),
        seededPtSeconds: toSeedSeconds(totalSeconds / quantity),
        description: [detailLine, sectionLine].filter(Boolean).join(" | "),
      };
    });
  };

  const summarizeRowsTotalSeconds = (rows) =>
    (Array.isArray(rows) ? rows : []).reduce(
      (sum, row) =>
        sum + (Number(row.quantity) || 0) * (Number(row.calibratedPtSeconds ?? row.seededPtSeconds) || 0),
      0
    );

  const calibrateStyleRows = (rows, expectedTotalSeconds) => {
    const normalizedRows = (Array.isArray(rows) ? rows : [])
      .filter((row) => Number.isFinite(Number(row?.seededPtSeconds)) && Number(row.seededPtSeconds) > 0)
      .map((row) => ({
        ...row,
        calibratedPtSeconds: Number(row.seededPtSeconds),
      }));

    if (normalizedRows.length === 0) {
      return normalizedRows;
    }

    const diff = Number(expectedTotalSeconds) - summarizeRowsTotalSeconds(normalizedRows);
    if (Math.abs(diff) < 0.000001) {
      return normalizedRows;
    }

    const targetIndex = normalizedRows.length - 1;
    const targetRow = normalizedRows[targetIndex];
    const quantity = Math.max(1, Number(targetRow.quantity) || 1);
    normalizedRows[targetIndex] = {
      ...targetRow,
      calibratedPtSeconds: Number(targetRow.calibratedPtSeconds) + diff / quantity,
    };

    return normalizedRows;
  };
  
  const buildStyleProcessPayload = ({
    styleId,
    processIdByCode,
    row,
    master,
    sortOrder,
  }) => {
    if (!master) {
      throw new Error(`Unknown master process code: ${row.code}`);
    }
  
    return {
      id: processIdByCode.get(master.code) ?? null,
      code: master.code,
      name: `${master.nameKo} / ${master.nameVi}`,
      description: row.description || null,
      timesPerPiece: row.quantity,
      pt: (row.calibratedPtSeconds ?? row.seededPtSeconds) * row.quantity,
      stBuckets: [
        ...SEEDED_ST_BUCKETS.map((bucketQuantity) => ({
          bucketQuantity,
          bucketStSeconds: (row.calibratedPtSeconds ?? row.seededPtSeconds) * row.quantity,
          setBy: "SEED",
          setAt: null,
          updatedAt: null,
        })),
      ],
      timeRefQuantity: TIME_REF_QUANTITY,
      ct: null,
      stManual: false,
      atParams: null,
      instanceId: `${master.code}-${styleId}-${sortOrder + 1}`,
    };
  };
  
  const summarizeTotalSeconds = (processes) =>
    processes.reduce(
      (sum, process) => sum + (Number(process.pt) || 0),
      0
    );
  
  const buildStyleDrafts = () =>
    STYLES.map((style) => {
      const aggregatedRows = calibrateStyleRows(
        buildStyleRowMap(style.rows),
        style.expectedTotalSeconds
      );
      const totalSeconds = round4(
        aggregatedRows.reduce(
          (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.calibratedPtSeconds ?? item.seededPtSeconds) || 0),
          0
        )
      );
      return {
        ...style,
        aggregatedRows,
        totalSeconds,
      };
    });
  
  const validateSeedDefinition = (styleDrafts) => {
    const masterCodes = new Set(MASTER_PROCESSES.map((item) => item.code));
  
    styleDrafts.forEach((style) => {
      style.aggregatedRows.forEach((item) => {
        if (!masterCodes.has(item.code)) {
          throw new Error(
            `Style ${style.styleId} references unknown master process ${item.code}`
          );
        }
      });
  
      if (Math.abs(Number(style.totalSeconds) - Number(style.expectedTotalSeconds)) >= 0.001) {
        throw new Error(
          `Style ${style.styleId} total mismatch: expected ${style.expectedTotalSeconds}, got ${style.totalSeconds}`
        );
      }
    });
  };
  
  const runReplaceStyleProcessMaster = async ({
    prismaClient = null,
    orgId = Number(process.env.ORG_ID || DEFAULT_ORG_ID),
    customerName =
      String(process.env.CUSTOMER_NAME || DEFAULT_CUSTOMER_NAME).trim() || DEFAULT_CUSTOMER_NAME,
    runTimeModelRealignment = null,
    log = true,
  } = {}) => {
    const prisma = prismaClient || new PrismaClient();
    const shouldDisconnect = !prismaClient;
    const resolvedOrgId = Number.isFinite(Number(orgId)) && Number(orgId) > 0
      ? Math.trunc(Number(orgId))
      : DEFAULT_ORG_ID;
    const resolvedCustomerName = String(customerName || DEFAULT_CUSTOMER_NAME).trim() || DEFAULT_CUSTOMER_NAME;
  
    try {
      const styleDrafts = buildStyleDrafts();
      validateSeedDefinition(styleDrafts);
  
      await prisma.$transaction(
        async (tx) => {
          await tx.style.deleteMany({
            where: { orgId: resolvedOrgId },
          });
  
          await tx.attrProcess.deleteMany({
            where: { orgId: resolvedOrgId },
          });
  
          await tx.attrProcess.createMany({
            data: MASTER_PROCESSES.map((item) => ({
              orgId: resolvedOrgId,
              code: item.code,
              name: item.name,
              nameKo: item.nameKo,
              nameEn: item.nameEn,
              nameVi: item.nameVi,
            })),
          });
  
          const createdProcesses = await tx.attrProcess.findMany({
            where: { orgId: resolvedOrgId },
            orderBy: { id: "asc" },
            select: { id: true, code: true },
          });
          const processIdByCode = new Map(
            createdProcesses.map((item) => [item.code, item.id])
          );
          const masterByCode = new Map(MASTER_PROCESSES.map((item) => [item.code, item]));
  
          for (const style of styleDrafts) {
            const processes = style.aggregatedRows.map((item, index) =>
              buildStyleProcessPayload({
                styleId: style.styleId,
                processIdByCode,
                row: item,
                master: masterByCode.get(item.code),
                sortOrder: index,
              })
            );
  
            const createdStyle = await tx.style.create({
              data: {
                orgId: resolvedOrgId,
                code: style.styleCode || style.styleId,
                name: style.name,
                customer: resolvedCustomerName,
                registrationDate: new Date().toISOString().slice(0, 10),
                collection: "VN_MASTER",
                season: "ALL",
                imageUrls: [],
                processes,
                bom: [],
                bomNotes: "Unified common process master seed",
              },
            });
  
            for (let index = 0; index < processes.length; index += 1) {
              const process = processes[index];
              const createdStyleProcess = await tx.styleProcess.create({
                data: {
                  orgId: resolvedOrgId,
                  styleId: createdStyle.id,
                  processCode: process.code,
                  processName: process.name,
                  processDescription: process.description,
                  timesPerPiece: process.timesPerPiece ?? process.quantity,
                  sortOrder: index,
                  ptSeconds: process.pt,
                  atParams: null,
                },
              });
  
              await tx.styleProcessStandard.createMany({
                data: (Array.isArray(process.stBuckets) ? process.stBuckets : process.stValues || []).map((standard) => ({
                  orgId: resolvedOrgId,
                  styleProcessId: createdStyleProcess.id,
                  bucketQuantity: standard.bucketQuantity ?? standard.quantity,
                  bucketStSeconds: standard.bucketStSeconds ?? standard.seconds,
                  setBy: standard.setBy ?? "SEED",
                })),
              });
            }
          }
        },
        {
          maxWait: 10000,
          timeout: 60000,
        }
      );
  
      const timeModelRealign =
        typeof runTimeModelRealignment === "function"
          ? await runTimeModelRealignment({
              orgIds: [resolvedOrgId],
              updatedBy: "SYSTEM_RESET_BASELINE",
            })
          : null;
  
      const [styles, processCount] = await Promise.all([
        prisma.style.findMany({
          where: {
            orgId: resolvedOrgId,
            code: { in: STYLES.map((style) => style.styleCode || style.styleId) },
          },
          orderBy: { code: "asc" },
          select: {
            code: true,
            name: true,
            processes: true,
          },
        }),
        prisma.attrProcess.count({
          where: { orgId: resolvedOrgId },
        }),
      ]);
  
      const summary = styles.map((style) => ({
        styleCode: style.code,
        name: style.name,
        processCount: Array.isArray(style.processes) ? style.processes.length : 0,
        totalPt1000: summarizeTotalSeconds(
          Array.isArray(style.processes) ? style.processes : []
        ),
      }));
  
      const result = {
        replacedProcessMasterCount: processCount,
        timeModelRealign: timeModelRealign?.summary ?? null,
        styles: summary,
      };
  
      if (log) {
        console.log(JSON.stringify(result, null, 2));
      }
  
      return result;
    } finally {
      if (shouldDisconnect) {
        await prisma.$disconnect();
      }
    }
  };
  

  return runReplaceStyleProcessMaster;
})();

const COMPOSED_TIME_REF_QUANTITY = 1000;
const COMPOSED_PROCESS_MASTER = [
  {
    code: 'FRONT_OPENING_ZIPPER_ATTACH_TOPSTITCH_1LINE',
    nameKo: '앞여밈: 지퍼 - 부착·상침 (1줄)',
    nameEn: 'Front opening: Zipper - Attach·Topstitch (1 line)',
    nameVi: 'Nep truoc: Day keo - Gan·Di top (1 duong)',
    defaultPtSeconds: 110,
  },
  {
    code: 'FRONT_OPENING_FACING_ATTACH_TOPSTITCH_1LINE',
    nameKo: '앞여밈: 페이싱 - 부착·상침 (1줄)',
    nameEn: 'Front opening: Facing - Attach·Topstitch (1 line)',
    nameVi: 'Nep truoc: Nep lot - Gan·Di top (1 duong)',
    defaultPtSeconds: 105,
  },
  {
    code: 'FRONT_NECKLINE_FACING_FOLD_5MM',
    nameKo: '앞목: 페이싱 - 접기 (5mm)',
    nameEn: 'Front neckline: Facing - Fold (5mm)',
    nameVi: 'Co truoc: Nep lot - Gap (5mm)',
    defaultPtSeconds: 60,
  },
  {
    code: 'FRONT_NECKLINE_FACING_TOPSTITCH_1LINE',
    nameKo: '앞목: 페이싱 - 상침 (1줄)',
    nameEn: 'Front neckline: Facing - Topstitch (1 line)',
    nameVi: 'Co truoc: Nep lot - Di top (1 duong)',
    defaultPtSeconds: 70,
  },
  {
    code: 'BACK_NECKLINE_FACING_ATTACH_TOPSTITCH_1LINE',
    nameKo: '뒤목: 페이싱 - 부착·상침 (1줄)',
    nameEn: 'Back neckline: Facing - Attach·Topstitch (1 line)',
    nameVi: 'Co sau: Nep lot - Gan·Di top (1 duong)',
    defaultPtSeconds: 78,
  },
  {
    code: 'SHOULDER_YOKE_JOIN_SEAM_FINISH_5MM',
    nameKo: '어깨: 요크 - 연결·시접정리 (5mm)',
    nameEn: 'Shoulder: Yoke - Join·Seam finish (5mm)',
    nameVi: 'Vai: Cau vai - Noi·Hoan tat duong may (5mm)',
    defaultPtSeconds: 80,
  },
  {
    code: 'SIDE_SEAM_OUTER_FABRIC_SEW_SEAM_FINISH_7MM',
    nameKo: '옆선: 겉감 - 봉제·시접정리 (7mm)',
    nameEn: 'Side seam: Outer fabric - Sew·Seam finish (7mm)',
    nameVi: 'Suon: Lot ngoai - May·Hoan tat duong may (7mm)',
    defaultPtSeconds: 95,
  },
  {
    code: 'SLEEVE_OUTER_FABRIC_ATTACH_OVERLOCK_3THREADS',
    nameKo: '소매: 겉감 - 부착·오버록 (3실)',
    nameEn: 'Sleeve: Outer fabric - Attach·Overlock (3 threads)',
    nameVi: 'Tay: Lot ngoai - Gan·Vat so (3 soi)',
    defaultPtSeconds: 84,
  },
  {
    code: 'HEM_OUTER_FABRIC_FOLD_TOPSTITCH_10MM',
    nameKo: '밑단: 겉감 - 접기·상침 (10mm)',
    nameEn: 'Hem: Outer fabric - Fold·Topstitch (10mm)',
    nameVi: 'Lai: Lot ngoai - Gap·Di top (10mm)',
    defaultPtSeconds: 94,
  },
  {
    code: 'POCKET_OUTER_FABRIC_ATTACH_TOPSTITCH_1LINE',
    nameKo: '주머니: 겉감 - 부착·상침 (1줄)',
    nameEn: 'Pocket: Outer fabric - Attach·Topstitch (1 line)',
    nameVi: 'Tui: Lot ngoai - Gan·Di top (1 duong)',
    defaultPtSeconds: 88,
  },
  {
    code: 'WAIST_ELASTIC_ATTACH_TOPSTITCH_FINISHED',
    nameKo: '허리: 고무줄 - 부착·상침 (완성)',
    nameEn: 'Waist: Elastic - Attach·Topstitch (Finished)',
    nameVi: 'Eo: Thun - Gan·Di top (Hoan tat)',
    defaultPtSeconds: 125,
  },
  {
    code: 'FRONT_OPENING_BUTTON_ATTACH_FINISHED',
    nameKo: '앞여밈: 단추 - 부착 (완성)',
    nameEn: 'Front opening: Button - Attach (Finished)',
    nameVi: 'Nep truoc: Nut - Gan (Hoan tat)',
    defaultPtSeconds: 35,
  },
];

const COMPOSED_STYLE_SEEDS = [
  {
    styleId: 'BL20',
    styleCode: 'BL20',
    name: 'BL20',
    processes: [
      { code: 'FRONT_OPENING_ZIPPER_ATTACH_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'FRONT_NECKLINE_FACING_FOLD_5MM', quantity: 1 },
      { code: 'POCKET_OUTER_FABRIC_ATTACH_TOPSTITCH_1LINE', quantity: 2 },
      { code: 'SHOULDER_YOKE_JOIN_SEAM_FINISH_5MM', quantity: 1 },
      { code: 'SLEEVE_OUTER_FABRIC_ATTACH_OVERLOCK_3THREADS', quantity: 2 },
      { code: 'HEM_OUTER_FABRIC_FOLD_TOPSTITCH_10MM', quantity: 1 },
    ],
  },
  {
    styleId: 'AM01160',
    styleCode: 'AM01160',
    name: 'AM01160',
    processes: [
      { code: 'FRONT_OPENING_FACING_ATTACH_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'BACK_NECKLINE_FACING_ATTACH_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'SIDE_SEAM_OUTER_FABRIC_SEW_SEAM_FINISH_7MM', quantity: 2 },
      { code: 'WAIST_ELASTIC_ATTACH_TOPSTITCH_FINISHED', quantity: 1 },
      { code: 'HEM_OUTER_FABRIC_FOLD_TOPSTITCH_10MM', quantity: 2 },
      { code: 'FRONT_OPENING_BUTTON_ATTACH_FINISHED', quantity: 5 },
    ],
  },
  {
    styleId: 'AM01622',
    styleCode: 'AM01622',
    name: 'AM01622',
    processes: [
      { code: 'FRONT_OPENING_FACING_ATTACH_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'FRONT_NECKLINE_FACING_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'POCKET_OUTER_FABRIC_ATTACH_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'SHOULDER_YOKE_JOIN_SEAM_FINISH_5MM', quantity: 1 },
      { code: 'SLEEVE_OUTER_FABRIC_ATTACH_OVERLOCK_3THREADS', quantity: 2 },
      { code: 'SIDE_SEAM_OUTER_FABRIC_SEW_SEAM_FINISH_7MM', quantity: 2 },
      { code: 'HEM_OUTER_FABRIC_FOLD_TOPSTITCH_10MM', quantity: 1 },
    ],
  },
  {
    styleId: 'AM02053',
    styleCode: 'AM02053',
    name: 'AM02053',
    processes: [
      { code: 'FRONT_OPENING_ZIPPER_ATTACH_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'FRONT_NECKLINE_FACING_FOLD_5MM', quantity: 1 },
      { code: 'BACK_NECKLINE_FACING_ATTACH_TOPSTITCH_1LINE', quantity: 1 },
      { code: 'POCKET_OUTER_FABRIC_ATTACH_TOPSTITCH_1LINE', quantity: 2 },
      { code: 'SLEEVE_OUTER_FABRIC_ATTACH_OVERLOCK_3THREADS', quantity: 2 },
      { code: 'WAIST_ELASTIC_ATTACH_TOPSTITCH_FINISHED', quantity: 1 },
      { code: 'FRONT_OPENING_BUTTON_ATTACH_FINISHED', quantity: 4 },
      { code: 'HEM_OUTER_FABRIC_FOLD_TOPSTITCH_10MM', quantity: 1 },
    ],
  },
];

const resolveComposedProcessLabel = (process) => {
  const ko = String(process?.nameKo || '').trim();
  const vi = String(process?.nameVi || '').trim();
  return [ko, vi].filter(Boolean).join(' / ') || String(process?.nameEn || process?.code || '').trim();
};

const resolveComposedPtSeconds = (value, fallback) => {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed * 10000) / 10000;
  const nextFallback = Number(fallback);
  if (Number.isFinite(nextFallback) && nextFallback > 0) {
    return Math.round(nextFallback * 10000) / 10000;
  }
  return 30;
};
const summarizeComposedTotalSeconds = (processes) =>
  (Array.isArray(processes) ? processes : []).reduce(
    (sum, process) =>
      sum + (Number(process?.quantity) || 0) * (Number(process?.pt) || 0),
    0
  );

async function runComposedStyleProcessReplacement({
  prismaClient = null,
  orgId = Number(process.env.ORG_ID || 2),
  customerName = 'TSBR',
  runTimeModelRealignment = null,
  log = true,
} = {}) {
  const prisma = prismaClient || new PrismaClient();
  const shouldDisconnect = !prismaClient;
  const resolvedOrgId =
    Number.isFinite(Number(orgId)) && Number(orgId) > 0 ? Math.trunc(Number(orgId)) : 2;
  const resolvedCustomerName = String(customerName || 'TSBR').trim() || 'TSBR';

  try {
    await prisma.style.deleteMany({ where: { orgId: resolvedOrgId } });
    await prisma.attrProcess.deleteMany({ where: { orgId: resolvedOrgId } });

    await prisma.attrProcess.createMany({
      data: COMPOSED_PROCESS_MASTER.map((process) => ({
        orgId: resolvedOrgId,
        code: process.code,
        name: process.nameEn,
        nameKo: process.nameKo,
        nameEn: process.nameEn,
        nameVi: process.nameVi,
      })),
    });

    const processRows = await prisma.attrProcess.findMany({
      where: { orgId: resolvedOrgId },
      select: { id: true, code: true },
    });
    const processIdByCode = new Map(processRows.map((item) => [item.code, item.id]));
    const masterByCode = new Map(COMPOSED_PROCESS_MASTER.map((item) => [item.code, item]));

    for (const style of COMPOSED_STYLE_SEEDS) {
      const processPayloads = style.processes.map((item, index) => {
        const master = masterByCode.get(item.code);
        if (!master) {
          throw new Error(`unknown composed process code: ${item.code}`);
        }
        const quantity = Math.max(1, toPositiveInt(item.quantity, 1));
        const pt = resolveComposedPtSeconds(item.ptSeconds, master.defaultPtSeconds);
        const name = resolveComposedProcessLabel(master);
        return {
          id: processIdByCode.get(master.code) ?? null,
          code: master.code,
          name,
          nameKo: master.nameKo,
          nameEn: master.nameEn,
          nameVi: master.nameVi,
          description: null,
          timesPerPiece: quantity,
          pt,
          stBuckets: [
            {
              bucketQuantity: COMPOSED_TIME_REF_QUANTITY,
              bucketStSeconds: pt,
              setBy: 'SEED',
              setAt: null,
              updatedAt: null,
            },
          ],
          timeRefQuantity: COMPOSED_TIME_REF_QUANTITY,
          ct: null,
          stManual: false,
          atParams: null,
          instanceId: `${master.code}-${style.styleId}-${index + 1}`,
        };
      });

      const createdStyle = await prisma.style.create({
        data: {
          orgId: resolvedOrgId,
          code: style.styleCode || style.styleId,
          name: style.name,
          customer: resolvedCustomerName,
          registrationDate: new Date().toISOString().slice(0, 10),
          collection: 'VN_COMPOSED',
          season: 'ALL',
          imageUrls: [],
          processes: processPayloads,
          bom: [],
          bomNotes: 'Composed process seed',
        },
      });

      for (let index = 0; index < processPayloads.length; index += 1) {
        const process = processPayloads[index];
        const createdStyleProcess = await prisma.styleProcess.create({
          data: {
            orgId: resolvedOrgId,
            styleId: createdStyle.id,
            processCode: process.code,
            processName: process.name,
            processDescription: process.description,
            timesPerPiece: process.timesPerPiece ?? process.quantity,
            sortOrder: index,
            ptSeconds: process.pt,
            atParams: null,
          },
        });

        await prisma.styleProcessStandard.create({
          data: {
            orgId: resolvedOrgId,
            styleProcessId: createdStyleProcess.id,
            bucketQuantity: COMPOSED_TIME_REF_QUANTITY,
            bucketStSeconds: process.pt,
            setBy: 'SEED',
          },
        });
      }
    }

    const timeModelRealign =
      typeof runTimeModelRealignment === 'function'
        ? await runTimeModelRealignment({
            orgIds: [resolvedOrgId],
            updatedBy: 'SYSTEM_RESET_BASELINE',
          })
        : null;

    const [styles, processCount] = await Promise.all([
      prisma.style.findMany({
        where: {
          orgId: resolvedOrgId,
          code: { in: COMPOSED_STYLE_SEEDS.map((style) => style.styleCode || style.styleId) },
        },
        orderBy: { code: 'asc' },
        select: {
          code: true,
          name: true,
          processes: true,
        },
      }),
      prisma.attrProcess.count({
        where: { orgId: resolvedOrgId },
      }),
    ]);

    const summary = styles.map((style) => ({
      styleCode: style.code,
      name: style.name,
      processCount: Array.isArray(style.processes) ? style.processes.length : 0,
      totalPt1000: summarizeComposedTotalSeconds(
        Array.isArray(style.processes) ? style.processes : []
      ),
    }));

    const result = {
      replacedProcessMasterCount: processCount,
      timeModelRealign: timeModelRealign?.summary ?? null,
      styles: summary,
    };

    if (log) {
      console.log(JSON.stringify(result, null, 2));
    }

    return result;
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

async function runStyleProcessMasterReplacement({ orgId, customerName }) {
  return runReplaceStyleProcessMaster({
    prismaClient: prisma,
    orgId,
    customerName,
    runTimeModelRealignment: (options = {}) =>
      runTimeModelRealignment(prisma, {
        ...options,
        log: false,
      }),
    log: false,
  });
}

const BASELINE_COLORS = [
  { code: 'WHITE', name: 'White', nameEn: 'White', nameKo: 'White', nameVi: 'Trang' },
  { code: 'BLACK', name: 'Black', nameEn: 'Black', nameKo: 'Black', nameVi: 'Den' },
  { code: 'NAVY', name: 'Navy', nameEn: 'Navy', nameKo: 'Navy', nameVi: 'Xanh Navy' },
  {
    code: 'DARK-MELANGE',
    name: 'Dark Melange',
    nameEn: 'Dark Melange',
    nameKo: 'Dark Melange',
    nameVi: 'Dark Melange',
  },
  {
    code: 'LT-BLUE',
    name: 'Light Blue',
    nameEn: 'Light Blue',
    nameKo: 'Light Blue',
    nameVi: 'Xanh Nhat',
  },
  {
    code: 'MID-BLUE',
    name: 'Mid Blue',
    nameEn: 'Mid Blue',
    nameKo: 'Mid Blue',
    nameVi: 'Xanh trung',
  },
  { code: 'INDIGO', name: 'Indigo', nameEn: 'Indigo', nameKo: 'Indigo', nameVi: 'Indigo' },
];

const LEGACY_CATEGORY_CODE_ALIASES = [
  { legacyCode: 'CHEF UNIFORM', canonicalCode: '01-CHEF' },
  { legacyCode: 'APRON', canonicalCode: '02-APRON' },
  { legacyCode: 'WINDBREAKER', canonicalCode: '03-WINDBREAKER' },
  { legacyCode: 'SS-TSHIRT', canonicalCode: '04-SS-TSHIRT' },
  { legacyCode: 'LS-TSHIRT', canonicalCode: '05-LS-TSHIRT' },
  { legacyCode: 'SCRUB', canonicalCode: '06-SCRUB' },
];

const BASELINE_PROCESSES = COMPOSED_PROCESS_MASTER.map((process) => ({
  code: process.code,
  name: process.nameEn,
  nameEn: process.nameEn,
  nameKo: process.nameKo,
  nameVi: process.nameVi,
}));
const LEGACY_BASELINE_PROCESS_CODES = Array.from({ length: 10 }, (_, index) =>
  `P${String(index + 1).padStart(2, '0')}`
);

const BASELINE_ROLES = [
  { code: 'WORKER_CUTTING', name: '\uC7AC\uB2E8', defaultPayType: 'CT', sortOrder: 1 },
  { code: 'WORKER_SEWING', name: '\uBD09\uC81C', defaultPayType: 'CT', sortOrder: 2 },
  { code: 'WORKER_IRONING', name: '\uB2E4\uB9BC', defaultPayType: 'CT', sortOrder: 3 },
  { code: 'WORKER_INSPECTION', name: '\uAC80\uC218', defaultPayType: 'CT', sortOrder: 4 },
  { code: 'WORKER_PACKING', name: '\uD3EC\uC7A5', defaultPayType: 'CT', sortOrder: 5 },
  { code: 'WORKER_OTHER', name: '\uAE30\uD0C0', defaultPayType: 'CT', sortOrder: 6 },
];

const TARGET_MONTHLY_WAGE = 8000000;
const WAGE_PER_SECOND = TARGET_MONTHLY_WAGE / (26 * 8 * 3600);
const SAMPLE_FACTORY_NAME = 'Sample Factory';
const SAMPLE_FACTORY_ADDRESS = 'Sample Factory Address';
const LEGACY_SAMPLE_FACTORY_NAMES = Object.freeze(['Sample Factory', '샘플 공장']);
const LEGACY_SAMPLE_FACTORY_NAME_KEYS = new Set(
  LEGACY_SAMPLE_FACTORY_NAMES.map((name) =>
    String(name || '')
      .normalize('NFKC')
      .trim()
      .toLowerCase()
  )
);
const SAMPLE_WORKER_COUNT = 10;
const LEGACY_BASELINE_STYLE_IDS = [
  'S-2025SS-T001',
  'S-2025SS-P002',
  'S-2025FW-J003',
];

const BASELINE_STYLES = [];

const STAFF_MEMBERSHIPS = [
  {
    email: 'manufacturer-admin@test.local',
    role: 'ADMIN',
    name: 'Manager',
    payType: 'FIXED',
    position: 'ADMIN',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSMF-ADMIN-0001',
  },
  {
    email: 'manufacturer-operator@test.local',
    role: 'OPERATOR',
    name: 'Operator',
    payType: 'FIXED',
    position: 'OPERATOR',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSMF-OPER-0002',
  },
  {
    email: 'manufacturer-accountant@test.local',
    role: 'ACCOUNTANT',
    name: 'Accountant',
    payType: 'FIXED',
    position: 'ACCOUNTANT',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSMF-ACCT-0003',
  },
];

const BRAND_MEMBERSHIPS = [
  {
    email: 'brand-admin@test.local',
    role: 'ADMIN',
    name: 'Brand Admin',
    payType: 'FIXED',
    position: 'ADMIN',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSBR-ADMIN-0001',
  },
  {
    email: 'brand-operator@test.local',
    role: 'OPERATOR',
    name: 'Brand Operator',
    payType: 'FIXED',
    position: 'OPERATOR',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSBR-OPER-0002',
  },
  {
    email: 'brand-accountant@test.local',
    role: 'ACCOUNTANT',
    name: 'Brand Accountant',
    payType: 'FIXED',
    position: 'ACCOUNTANT',
    bankName: 'Test Bank',
    bankAccountNumber: 'TSBR-ACCT-0003',
  },
];

const LINE_CONFIGS = [
  {
    key: 'sample-line',
    lineName: 'Sample Line',
    workerPrefix: 'sample-worker-',
    workerLabel: 'Sample Worker',
  },
];

const SAMPLE_API_BASE = process.env.API_BASE ?? 'http://localhost:4000';
const SAMPLE_MANUFACTURER_CODE = 'TSMF';
const SAMPLE_BRAND_CODE = 'TSBR';
const SAMPLE_MANUFACTURER_ADMIN_EMAIL = 'manufacturer-admin@test.local';
const SAMPLE_BRAND_ADMIN_EMAIL = 'brand-admin@test.local';
const SAMPLE_MANUFACTURER_OPERATOR_EMAIL = 'manufacturer-operator@test.local';
const SAMPLE_LEGACY_ORDER_PREFIX = 'LOAD-26';
const SAMPLE_DEMO_ORDER_ID = 'order-tsbr-po-260322-01';
const SAMPLE_DEMO_ORDER_NUMBER = 'TSBR-PO-260322-01';
const SAMPLE_ORDER_DUE_OFFSET_DAYS = 47;
const SAMPLE_ORDER_STYLE_ITEMS = [
  {
    styleId: 'BL20',
    colorCode: 'BLACK',
    gender: 'U',
    quantity: 1500,
    sizeQuantities: { S: 300, M: 525, L: 450, XL: 225 },
  },
  {
    styleId: 'AM01160',
    colorCode: 'NAVY',
    gender: 'M',
    quantity: 950,
    sizeQuantities: { S: 150, M: 330, L: 280, XL: 190 },
  },
  {
    styleId: 'AM01622',
    colorCode: 'WHITE',
    gender: 'U',
    quantity: 1350,
    sizeQuantities: { S: 200, M: 470, L: 410, XL: 270 },
  },
  {
    styleId: 'AM02053',
    colorCode: 'INDIGO',
    gender: 'U',
    quantity: 1650,
    sizeQuantities: { S: 250, M: 580, L: 500, XL: 320 },
  },
];
const BASELINE_ASSIGNMENT_SNAPSHOT = {
  updatedAt: '2026-03-28T13:09:51.020Z',
  assignments: [
    {
      id: 'A-order-tsbr-po-260322-01::BL20::BLACK::U-16-27',
      basis: 'ST',
      color: '#DCE9FF',
      label: 'BL20',
      cardId: 'order-tsbr-po-260322-01::BL20::BLACK::U',
      gender: 'U',
      lineId: '16',
      orderNo: 'TSBR-PO-260322-01',
      version: 2,
      customer: 'TSBR',
      endIndex: 12,
      quantity: 1500,
      colorName: 'Black',
      ctSnapshot: {
        quantity: 1500,
        schedule: {
          endIndex: 12,
          endDateKey: '2026-03-12',
          startIndex: 0,
          startDateKey: '2026-02-28',
          endDayPercent: 18.75,
          startDayPercent: 100,
          startDayOffsetPercent: 0,
        },
        processes: [],
        updatedAt: '2026-03-28T13:09:43.511Z',
        updatedBy: 'SYSTEM_RESET_BASELINE',
        totalCtSeconds: 2934000,
        totalCtPerPieceSeconds: 1956,
        totalStPerPieceSeconds: 1956,
      },
      endDateKey: '2026-03-12',
      previewUrl: '',
      startIndex: 0,
      stripeColor: '#9FB9F2',
      startDateKey: '2026-02-28',
      stTotalSeconds: 2934000,
      endDayPercent: 18.75,
      originOrderId: 'order-tsbr-po-260322-01::BL20::BLACK::U',
      startDayPercent: 100,
      ctTotalSeconds: 2934000,
      startDayOffsetPercent: 0,
    },
    {
      id: 'A-order-tsbr-po-260322-01::AM01160::NAVY::M-16-6',
      basis: 'ST',
      color: '#DCE9FF',
      label: 'AM01160',
      cardId: 'order-tsbr-po-260322-01::AM01160::NAVY::M',
      gender: 'M',
      lineId: '16',
      orderNo: 'TSBR-PO-260322-01',
      version: 2,
      customer: 'TSBR',
      endIndex: 30,
      quantity: 950,
      colorName: 'Navy',
      ctSnapshot: {
        quantity: 950,
        schedule: {
          endIndex: 30,
          endDateKey: '2026-03-30',
          startIndex: 12,
          startDateKey: '2026-03-12',
          endDayPercent: 37.48263888888889,
          startDayPercent: 81.25,
          startDayOffsetPercent: 18.75,
        },
        processes: [],
        updatedAt: '2026-03-28T13:09:43.511Z',
        updatedBy: 'SYSTEM_RESET_BASELINE',
        totalCtSeconds: 4085950,
        totalCtPerPieceSeconds: 4301.0003,
        totalStPerPieceSeconds: 4301.0003,
      },
      endDateKey: '2026-03-30',
      previewUrl: '',
      startIndex: 12,
      stripeColor: '#9FB9F2',
      startDateKey: '2026-03-12',
      stTotalSeconds: 4085950,
      endDayPercent: 37.48263888888889,
      originOrderId: 'order-tsbr-po-260322-01::AM01160::NAVY::M',
      startDayPercent: 81.25,
      ctTotalSeconds: 4085950,
      startDayOffsetPercent: 18.75,
    },
    {
      id: 'A-order-tsbr-po-260322-01::AM01622::WHITE::U-16-27',
      basis: 'ST',
      color: '#DCE9FF',
      label: 'AM01622',
      cardId: 'order-tsbr-po-260322-01::AM01622::WHITE::U',
      gender: 'U',
      lineId: '16',
      orderNo: 'TSBR-PO-260322-01',
      version: 2,
      customer: 'TSBR',
      endIndex: 40,
      quantity: 1350,
      colorName: 'White',
      ctSnapshot: {
        quantity: 1350,
        schedule: {
          endIndex: 40,
          endDateKey: '2026-04-09',
          startIndex: 30,
          startDateKey: '2026-03-30',
          endDayPercent: 10.76388888888889,
          startDayPercent: 62.51736111111111,
          startDayOffsetPercent: 37.48263888888889,
        },
        processes: [],
        updatedAt: '2026-03-28T13:09:43.511Z',
        updatedBy: 'SYSTEM_RESET_BASELINE',
        totalCtSeconds: 2515050,
        totalCtPerPieceSeconds: 1863,
        totalStPerPieceSeconds: 1863,
      },
      endDateKey: '2026-04-09',
      previewUrl: '',
      startIndex: 30,
      stripeColor: '#9FB9F2',
      startDateKey: '2026-03-30',
      stTotalSeconds: 2515050,
      endDayPercent: 10.76388888888889,
      originOrderId: 'order-tsbr-po-260322-01::AM01622::WHITE::U',
      startDayPercent: 62.51736111111111,
      ctTotalSeconds: 2515050,
      startDayOffsetPercent: 37.48263888888889,
    },
    {
      id: 'A-order-tsbr-po-260322-01::AM02053::INDIGO::U-16-6',
      basis: 'ST',
      color: '#DCE9FF',
      label: 'AM02053',
      cardId: 'order-tsbr-po-260322-01::AM02053::INDIGO::U',
      gender: 'U',
      lineId: '16',
      orderNo: 'TSBR-PO-260322-01',
      version: 2,
      customer: 'TSBR',
      endIndex: 54,
      quantity: 1650,
      colorName: 'Indigo',
      ctSnapshot: {
        quantity: 1650,
        schedule: {
          endIndex: 54,
          endDateKey: '2026-04-23',
          startIndex: 40,
          startDateKey: '2026-04-09',
          endDayPercent: 98.10763888888889,
          startDayPercent: 89.23611111111111,
          startDayOffsetPercent: 10.76388888888889,
        },
        processes: [],
        updatedAt: '2026-03-28T13:09:43.511Z',
        updatedBy: 'SYSTEM_RESET_BASELINE',
        totalCtSeconds: 3707550,
        totalCtPerPieceSeconds: 2246.9998,
        totalStPerPieceSeconds: 2246.9998,
      },
      endDateKey: '2026-04-23',
      previewUrl: '',
      startIndex: 40,
      stripeColor: '#9FB9F2',
      startDateKey: '2026-04-09',
      stTotalSeconds: 3707550,
      endDayPercent: 98.10763888888889,
      originOrderId: 'order-tsbr-po-260322-01::AM02053::INDIGO::U',
      startDayPercent: 89.23611111111111,
      ctTotalSeconds: 3707550,
      startDayOffsetPercent: 10.76388888888889,
    },
  ],
  boardCards: [],
  cards: [
    {
      cardId: 'order-tsbr-po-260322-01::BL20::BLACK::U',
      sortOrder: 0,
      payload: {
        id: 'order-tsbr-po-260322-01::BL20::BLACK::U',
        gender: 'U',
        status: 'ST',
        colorId: 'BLACK',
        dueDate: '2026-05-14',
        orderNo: 'TSBR-PO-260322-01',
        styleId: 'BL20',
        totalAt: 0,
        totalPt: 2934000,
        cardStTotalSeconds: 2934000,
        customer: 'TSBR',
        quantity: 1500,
        colorName: 'Black',
        styleCode: 'BL20',
        styleName: 'BL20',
        previewUrl: '',
        processCount: 21,
        stTotalSeconds: 2934000,
        originOrderId: 'order-tsbr-po-260322-01::BL20::BLACK::U',
      },
    },
    {
      cardId: 'order-tsbr-po-260322-01::AM01160::NAVY::M',
      sortOrder: 1,
      payload: {
        id: 'order-tsbr-po-260322-01::AM01160::NAVY::M',
        gender: 'M',
        status: 'ST',
        colorId: 'NAVY',
        dueDate: '2026-05-14',
        orderNo: 'TSBR-PO-260322-01',
        styleId: 'AM01160',
        totalAt: 0,
        totalPt: 4085950,
        cardStTotalSeconds: 4085950,
        customer: 'TSBR',
        quantity: 950,
        colorName: 'Navy',
        styleCode: 'AM01160',
        styleName: 'AM01160',
        previewUrl: '',
        processCount: 39,
        stTotalSeconds: 4085950,
        originOrderId: 'order-tsbr-po-260322-01::AM01160::NAVY::M',
      },
    },
    {
      cardId: 'order-tsbr-po-260322-01::AM01622::WHITE::U',
      sortOrder: 2,
      payload: {
        id: 'order-tsbr-po-260322-01::AM01622::WHITE::U',
        gender: 'U',
        status: 'ST',
        colorId: 'WHITE',
        dueDate: '2026-05-14',
        orderNo: 'TSBR-PO-260322-01',
        styleId: 'AM01622',
        totalAt: 0,
        totalPt: 2515050,
        cardStTotalSeconds: 2515050,
        customer: 'TSBR',
        quantity: 1350,
        colorName: 'White',
        styleCode: 'AM01622',
        styleName: 'AM01622',
        previewUrl: '',
        processCount: 19,
        stTotalSeconds: 2515050,
        originOrderId: 'order-tsbr-po-260322-01::AM01622::WHITE::U',
      },
    },
    {
      cardId: 'order-tsbr-po-260322-01::AM02053::INDIGO::U',
      sortOrder: 3,
      payload: {
        id: 'order-tsbr-po-260322-01::AM02053::INDIGO::U',
        gender: 'U',
        status: 'ST',
        colorId: 'INDIGO',
        dueDate: '2026-05-14',
        orderNo: 'TSBR-PO-260322-01',
        styleId: 'AM02053',
        totalAt: 0,
        totalPt: 3707550,
        cardStTotalSeconds: 3707550,
        customer: 'TSBR',
        quantity: 1650,
        colorName: 'Indigo',
        styleCode: 'AM02053',
        styleName: 'AM02053',
        previewUrl: '',
        processCount: 23,
        stTotalSeconds: 3707550,
        originOrderId: 'order-tsbr-po-260322-01::AM02053::INDIGO::U',
      },
    },
  ],
};
const SAMPLE_WORK_LOG_ORG_ID = Number(process.env.ORG_ID ?? 2);
const SAMPLE_WORK_LOG_SHIFT_SECONDS = Number(process.env.SHIFT_SECONDS ?? 8 * 60 * 60);
const SAMPLE_WORK_LOG_TARGET_VARIANCE = Math.max(
  0,
  Math.round(Number(process.env.TARGET_VARIANCE ?? 0))
);
const SAMPLE_WORK_LOG_TARGET_VARIANCE_PERCENT = Math.max(
  0,
  Math.min(1, Number(process.env.TARGET_VARIANCE_PERCENT ?? 1))
);
const SAMPLE_WORK_LOG_SEED = Number(process.env.SEED ?? 20260306);
const SAMPLE_WORK_LOG_DRY_RUN = /^(1|true|yes)$/i.test(process.env.DRY_RUN ?? '');
const SAMPLE_WORK_LOG_NOTE_PREFIX = 'AUTO_SAMPLE_WORK_LOG';
const SAMPLE_WORK_LOG_CLOCK_IN = '08:00';
const SAMPLE_WORK_LOG_CLOCK_OUT = '17:00';
const SAMPLE_WORK_LOG_ATTENDANCE_NOTE = '12:00-13:00 lunch break excluded';
const SAMPLE_WORK_LOG_EXTRA_HOLIDAY_KEYS = String(process.env.HOLIDAYS ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
const SAMPLE_WORK_LOG_EXTRA_HOLIDAY_SET = new Set(SAMPLE_WORK_LOG_EXTRA_HOLIDAY_KEYS);
const SAMPLE_LINE_ASSIGNMENT_START_AT = new Date(
  process.env.LINE_ASSIGNMENT_START_AT ?? '2026-02-01T00:00:00Z'
);

const toWorkerEmail = (prefix, index) => `${prefix}${String(index).padStart(2, '0')}@baro.local`;
const toWorkerName = (label, index) => `${label} ${String(index).padStart(2, '0')}`;

async function upsertOrganization(data) {
  const existing = await prisma.organization.findUnique({ where: { code: data.code } });
  if (existing) {
    return prisma.organization.update({
      where: { id: existing.id },
      data: {
        name: data.name,
        type: data.type,
        businessNumber: data.businessNumber ?? null,
        representative: data.representative ?? null,
        industry: data.industry ?? null,
        address: data.address ?? null,
        phone: data.phone ?? null,
        email: data.email ?? null,
      },
    });
  }
  return prisma.organization.create({ data });
}

async function ensureSubscription(orgId, membershipEmail) {
  return prisma.organizationSubscription.upsert({
    where: { orgId },
    update: {
      status: 'ACTIVE',
      membershipEmail,
      billingEmail: membershipEmail,
      trialStartedAt: null,
      trialEndsAt: null,
      activatedAt: new Date(),
      activeEndsAt: null,
      suspendedAt: null,
    },
    create: {
      orgId,
      membershipEmail,
      billingEmail: membershipEmail,
      status: 'ACTIVE',
      activatedAt: new Date(),
      activeEndsAt: null,
    },
  });
}

async function ensureMembership(orgId, data) {
  return prisma.employee.upsert({
    where: { orgId_email: { orgId, email: data.email } },
    update: {
      orgRole: data.role,
      status: 'ACTIVE',
      approvedBy: 'reset-to-baseline',
      approvedAt: new Date(),
      leftAt: null,
    },
    create: {
      orgId,
      email: data.email,
      orgRole: data.role,
      status: 'ACTIVE',
      approvedBy: 'reset-to-baseline',
      approvedAt: new Date(),
      requestedAt: new Date(),
      joinedAt: new Date(),
    },
  });
}

async function ensureFactory(orgId) {
  const existing = await prisma.factory.findFirst({
    where: { orgId, name: SAMPLE_FACTORY_NAME },
    orderBy: { id: 'asc' },
  });
  const data = {
    address: SAMPLE_FACTORY_ADDRESS,
    country: 'VN',
    countryCode: '+84',
    phoneNumber: '010-0000-0000',
    manager: 'Manager',
    targetMonthlyWage: TARGET_MONTHLY_WAGE,
    wagePerSecond: WAGE_PER_SECOND,
  };

  if (existing) {
    return prisma.factory.update({
      where: { id: existing.id },
      data,
    });
  }

  return prisma.factory.create({
    data: {
      orgId,
      name: SAMPLE_FACTORY_NAME,
      ...data,
    },
  });
}

async function ensureLine(orgId, factoryId, name) {
  return prisma.line.upsert({
    where: { factoryId_name: { factoryId, name } },
    update: { orgId, isActive: true },
    create: { orgId, factoryId, name, isActive: true },
  });
}

async function cleanupSampleFactoryData(orgId) {
  const sampleFactories = (await prisma.factory.findMany({
    where: { orgId },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  })).filter((factory) =>
    LEGACY_SAMPLE_FACTORY_NAME_KEYS.has(
      String(factory?.name || '')
        .normalize('NFKC')
        .trim()
        .toLowerCase()
    )
  );
  const sampleFactoryIds = sampleFactories.map((factory) => factory.id);

  const baselineWorkerEmployees = await prisma.employee.findMany({
    where: {
      orgId,
      OR: [
        { email: { startsWith: 'line1-worker' } },
        { email: { startsWith: 'line2-worker' } },
        { email: { startsWith: 'sample-worker-' } },
      ],
    },
    select: {
      id: true,
    },
  });
  const baselineWorkerIds = baselineWorkerEmployees.map((employee) => employee.id);

  if (sampleFactoryIds.length === 0 && baselineWorkerIds.length === 0) {
    return {
      deletedFactories: 0,
      deletedLines: 0,
      deletedWorkers: 0,
      deletedWorkerAccounts: 0,
    };
  }

  const sampleLines = sampleFactoryIds.length
    ? await prisma.line.findMany({
        where: { orgId, factoryId: { in: sampleFactoryIds } },
        select: { id: true },
      })
    : [];
  const sampleLineIds = sampleLines.map((line) => line.id);

  await prisma.$transaction(async (tx) => {
    if (baselineWorkerIds.length > 0) {
      await tx.line.updateMany({
        where: { orgId, managerEmployeeId: { in: baselineWorkerIds } },
        data: { managerEmployeeId: null },
      });
    }

    if (sampleFactoryIds.length > 0) {
      await tx.employee.updateMany({
        where: { orgId, factoryId: { in: sampleFactoryIds } },
        data: { factoryId: null },
      });
    }

    const attendanceDeleteOr = [];
    if (sampleFactoryIds.length > 0) {
      attendanceDeleteOr.push({ factoryId: { in: sampleFactoryIds } });
    }
    if (baselineWorkerIds.length > 0) {
      attendanceDeleteOr.push({ workerId: { in: baselineWorkerIds } });
    }
    if (attendanceDeleteOr.length > 0) {
      await tx.attendanceEntry.deleteMany({
        where: {
          orgId,
          OR: attendanceDeleteOr,
        },
      });
    }

    const assignmentDeleteOr = [];
    if (sampleLineIds.length > 0) {
      assignmentDeleteOr.push({ lineId: { in: sampleLineIds } });
      await tx.assignmentPlan.deleteMany({
        where: { orgId, lineId: { in: sampleLineIds } },
      });
    }
    if (baselineWorkerIds.length > 0) {
      assignmentDeleteOr.push({ employeeId: { in: baselineWorkerIds } });
    }
    if (assignmentDeleteOr.length > 0) {
      await tx.lineAssignment.deleteMany({
        where: { OR: assignmentDeleteOr },
      });
    }

    if (sampleLineIds.length > 0) {
      await tx.line.deleteMany({
        where: { orgId, id: { in: sampleLineIds } },
      });
    }

    if (baselineWorkerIds.length > 0) {
      await tx.employee.deleteMany({
        where: { orgId, id: { in: baselineWorkerIds } },
      });
    }

    if (sampleFactoryIds.length > 0) {
      await tx.factory.deleteMany({
        where: { orgId, id: { in: sampleFactoryIds } },
      });
    }
  });

  return {
    deletedFactories: sampleFactoryIds.length,
    deletedLines: sampleLineIds.length,
    deletedWorkers: baselineWorkerIds.length,
    deletedWorkerAccounts: baselineWorkerIds.length,
  };
}

async function syncGlobalColors() {
  for (const color of BASELINE_COLORS) {
    await prisma.attrColor.upsert({
      where: { code: color.code },
      update: {
        name: color.name,
        nameEn: color.nameEn,
        nameKo: color.nameKo,
        nameVi: color.nameVi,
      },
      create: color,
    });
  }
}

async function syncManufacturerAttributes(orgId) {
  for (const process of BASELINE_PROCESSES) {
    await prisma.attrProcess.upsert({
      where: { orgId_code: { orgId, code: process.code } },
      update: {
        name: process.name,
        nameEn: process.nameEn,
        nameKo: process.nameKo,
        nameVi: process.nameVi,
      },
      create: { orgId, ...process },
    });
  }

  for (const role of BASELINE_ROLES) {
    await prisma.attrRole.upsert({
      where: { orgId_code: { orgId, code: role.code } },
      update: {
        name: role.name,
        defaultPayType: role.defaultPayType,
        sortOrder: role.sortOrder,
      },
      create: { orgId, ...role },
    });
  }
}

async function cleanupLegacyProcessAliases(orgId) {
  const deletedByCode = await prisma.attrProcess.deleteMany({
    where: {
      orgId,
      code: { in: LEGACY_BASELINE_PROCESS_CODES },
    },
  });
  const deletedByName = await prisma.attrProcess.deleteMany({
    where: {
      orgId,
      code: { notIn: BASELINE_PROCESSES.map((item) => item.code) },
      name: { startsWith: 'Test Process' },
    },
  });
  return {
    deletedProcesses: (deletedByCode?.count || 0) + (deletedByName?.count || 0),
  };
}

async function cleanupLegacyCategoryAliases(orgId) {
  let deletedCount = 0;
  for (const alias of LEGACY_CATEGORY_CODE_ALIASES) {
    const canonicalExists = await prisma.attrCategory.findUnique({
      where: { orgId_code: { orgId, code: alias.canonicalCode } },
      select: { id: true },
    });
    if (!canonicalExists) continue;

    const result = await prisma.attrCategory.deleteMany({
      where: {
        orgId,
        code: alias.legacyCode,
      },
    });
    deletedCount += result.count;
  }
  return { deletedCategories: deletedCount };
}

async function ensureEmployee({
  orgId,
  employeeId,
  factoryId,
  roleId,
  payType,
  name,
  position,
  phone,
  bankName,
  bankAccountNumber,
}) {
  const existing = await prisma.employee.findUnique({ where: { id: employeeId } });
  const data = {
    orgId,
    factoryId,
    roleId,
    payType,
    name,
    position,
    phone: phone ?? null,
    bankName: bankName ?? null,
    bankAccountNumber: bankAccountNumber ?? null,
  };
  if (existing) {
    return prisma.employee.update({ where: { id: existing.id }, data });
  }
  return prisma.employee.create({ data });
}

async function ensureStyles(orgId) {
  for (const style of BASELINE_STYLES) {
    const { styleId, styleCode, customer: _customer, ...styleData } = style;
    const code = styleCode || styleId;
    await prisma.style.upsert({
      where: { orgId_code: { orgId, code } },
      update: {
        code,
        name: style.name,
        registrationDate: style.registrationDate,
        designer: style.designer,
        collection: style.collection,
        season: style.season,
        imageUrls: style.imageUrls,
        processes: style.processes,
        bom: style.bom,
        bomNotes: style.bomNotes,
      },
      create: { orgId, code, ...styleData },
    });
  }
}

async function cleanupLegacyBaselineStyles(orgId) {
  if (LEGACY_BASELINE_STYLE_IDS.length === 0) {
    return { deletedStyles: 0 };
  }

  const result = await prisma.style.deleteMany({
    where: {
      orgId,
      code: { in: LEGACY_BASELINE_STYLE_IDS },
    },
  });

  return { deletedStyles: result.count };
}

async function clearOrderAndAssignmentData(orgId = null) {
  const resolvedOrgId = sampleToPositiveIntOrNull(orgId);
  const scopedWhere = resolvedOrgId ? { orgId: resolvedOrgId } : undefined;

  const detachedRecords = await prisma.workRecord.updateMany({
    where: {
      ...(scopedWhere || {}),
      assignmentPlanId: { not: null },
    },
    data: { assignmentPlanId: null },
  });
  const deletedWorkLogs = await prisma.workLog.deleteMany({ where: scopedWhere });
  const deletedWorkRecords = await prisma.workRecord.deleteMany({ where: scopedWhere });
  const deletedCards = await prisma.assignmentCard.deleteMany({ where: scopedWhere });
  const deletedPlans = await prisma.assignmentPlan.deleteMany({ where: scopedWhere });
  const deletedBoardStates = await prisma.assignmentBoardState.deleteMany({ where: scopedWhere });
  const deletedOrders = await prisma.workOrder.deleteMany({ where: scopedWhere });

  return {
    detachedWorkRecords: detachedRecords.count,
    workLogs: deletedWorkLogs.count,
    workRecords: deletedWorkRecords.count,
    assignmentCards: deletedCards.count,
    assignmentPlans: deletedPlans.count,
    assignmentBoardStates: deletedBoardStates.count,
    workOrders: deletedOrders.count,
  };
}

function cloneJsonValue(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

async function captureAssignmentBoardSnapshot(orgId) {
  const [boardState, assignmentCards] = await Promise.all([
    prisma.assignmentBoardState.findUnique({
      where: { orgId },
      select: { assignments: true, cards: true, updatedAt: true },
    }),
    prisma.assignmentCard.findMany({
      where: { orgId },
      select: { cardId: true, sortOrder: true, payload: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const assignments = Array.isArray(boardState?.assignments)
    ? cloneJsonValue(boardState.assignments)
    : [];
  const boardCards = Array.isArray(boardState?.cards) ? cloneJsonValue(boardState.cards) : [];
  const cards = (Array.isArray(assignmentCards) ? assignmentCards : []).map((row) => ({
    cardId: String(row?.cardId || ''),
    sortOrder: sampleToPositiveInt(row?.sortOrder, 0),
    payload: cloneJsonValue(row?.payload ?? {}),
  }));

  return {
    updatedAt: boardState?.updatedAt ?? null,
    assignments,
    boardCards,
    cards,
  };
}

function resolveBaselineAssignmentSnapshot(capturedSnapshot) {
  const scriptSnapshot =
    BASELINE_ASSIGNMENT_SNAPSHOT &&
    Array.isArray(BASELINE_ASSIGNMENT_SNAPSHOT.assignments) &&
    BASELINE_ASSIGNMENT_SNAPSHOT.assignments.length > 0
      ? cloneJsonValue(BASELINE_ASSIGNMENT_SNAPSHOT)
      : null;

  if (scriptSnapshot) {
    return {
      source: 'script',
      snapshot: {
        updatedAt: scriptSnapshot.updatedAt ?? null,
        assignments: Array.isArray(scriptSnapshot.assignments) ? scriptSnapshot.assignments : [],
        boardCards: Array.isArray(scriptSnapshot.boardCards) ? scriptSnapshot.boardCards : [],
        cards: Array.isArray(scriptSnapshot.cards) ? scriptSnapshot.cards : [],
      },
    };
  }

  return {
    source: 'captured',
    snapshot: {
      updatedAt: capturedSnapshot?.updatedAt ?? null,
      assignments: Array.isArray(capturedSnapshot?.assignments)
        ? cloneJsonValue(capturedSnapshot.assignments)
        : [],
      boardCards: Array.isArray(capturedSnapshot?.boardCards)
        ? cloneJsonValue(capturedSnapshot.boardCards)
        : [],
      cards: Array.isArray(capturedSnapshot?.cards) ? cloneJsonValue(capturedSnapshot.cards) : [],
    },
  };
}

function remapAssignmentExternalIdLineSegment(externalId, previousLineId, nextLineId) {
  const raw = String(externalId || '').trim();
  if (!raw) return raw;

  const prev = sampleToPositiveIntOrNull(previousLineId);
  const next = sampleToPositiveIntOrNull(nextLineId);
  if (!prev || !next || prev === next) return raw;

  const suffixPattern = new RegExp(`-${prev}-(\\d+)$`);
  if (!suffixPattern.test(raw)) return raw;
  return raw.replace(suffixPattern, `-${next}-$1`);
}

function remapAssignmentSnapshotLines(assignments, targetLineId) {
  const nextLineId = sampleToPositiveIntOrNull(targetLineId);
  if (!nextLineId) return [];

  return (Array.isArray(assignments) ? assignments : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const previousLineId = sampleToPositiveIntOrNull(row.lineId);
      const nextRow = { ...row };
      nextRow.lineId = String(nextLineId);
      nextRow.id = remapAssignmentExternalIdLineSegment(
        nextRow.id,
        previousLineId,
        nextLineId
      );
      return nextRow;
    })
    .filter(Boolean);
}

function sampleBuildQuery(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    query.set(key, String(value));
  });
  const encoded = query.toString();
  return encoded ? `?${encoded}` : '';
}

async function sampleApiRequest(path, { method = 'GET', body, userEmail, orgId } = {}) {
  const headers = new Headers();
  if (userEmail) headers.set('x-user-email', String(userEmail).trim().toLowerCase());
  if (orgId) headers.set('x-org-id', String(orgId));
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${SAMPLE_API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
  }

  if (!response.ok) {
    const message =
      typeof data?.error === 'string' ? data.error : `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.details = data;
    error.path = path;
    throw error;
  }

  return data;
}

function sampleAssert(condition, message) {
  if (!condition) throw new Error(message);
}

function sampleToDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function sampleAddDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function sampleToFiniteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sampleToPositiveIntOrNull(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
}

function sampleToPositiveInt(value, fallback = 0) {
  return sampleToPositiveIntOrNull(value) ?? fallback;
}

function sampleClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sampleCreateRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function sampleRandomInt(random, min, max) {
  const lower = Math.ceil(min);
  const upper = Math.floor(max);
  return Math.floor(random() * (upper - lower + 1)) + lower;
}

function sampleRandomFloat(random, min, max) {
  return random() * (max - min) + min;
}

function sampleSumBy(items, selector) {
  return items.reduce((total, item, index) => total + selector(item, index), 0);
}

function sampleAllocateByWeights(total, weights) {
  const safeTotal = Math.max(0, Math.round(Number(total) || 0));
  if (safeTotal === 0 || weights.length === 0) {
    return Array.from({ length: weights.length }, () => 0);
  }

  const normalized = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0
  );
  const sumWeights = normalized.reduce((acc, weight) => acc + weight, 0);
  const basis = sumWeights > 0 ? normalized : normalized.map(() => 1);
  const denominator = sumWeights > 0 ? sumWeights : basis.length;
  const raw = basis.map((weight) => (safeTotal * weight) / denominator);
  const floorValues = raw.map((value) => Math.floor(value));
  let remaining = safeTotal - floorValues.reduce((acc, value) => acc + value, 0);

  const order = raw
    .map((value, index) => ({
      index,
      fraction: value - floorValues[index],
      weight: basis[index],
    }))
    .sort(
      (left, right) =>
        right.fraction - left.fraction ||
        right.weight - left.weight ||
        left.index - right.index
    );

  for (let index = 0; index < order.length && remaining > 0; index += 1) {
    floorValues[order[index].index] += 1;
    remaining -= 1;
  }

  return floorValues;
}

function sampleSplitQuantity(total, parts, random) {
  if (parts <= 0) return [];
  if (parts === 1) return [total];
  if (parts > total) {
    throw new Error(`cannot split quantity ${total} into ${parts} positive parts`);
  }

  const weights = Array.from({ length: parts }, () => 0.9 + random() * 0.2);
  const base = Array.from({ length: parts }, () => 1);
  const remaining = sampleAllocateByWeights(total - parts, weights);
  return base.map((value, index) => value + remaining[index]);
}

function sampleSumStylePt(style) {
  return Array.isArray(style?.processes)
    ? style.processes.reduce((sum, process) => {
        const pt = Number(process?.pt || 0);
        const quantity = Number(process?.quantity || 1);
        return sum + pt * Math.max(1, quantity);
      }, 0)
    : 0;
}

async function sampleLoadOrganizations() {
  const organizations = await sampleApiRequest('/organizations');
  const manufacturer = organizations.find(
    (organization) => organization?.code === SAMPLE_MANUFACTURER_CODE
  );
  const brand = organizations.find((organization) => organization?.code === SAMPLE_BRAND_CODE);
  sampleAssert(manufacturer, `organization not found: ${SAMPLE_MANUFACTURER_CODE}`);
  sampleAssert(brand, `organization not found: ${SAMPLE_BRAND_CODE}`);
  return { manufacturer, brand };
}

async function sampleLoadManufacturingContext(manufacturer, brand) {
  const [customers, attributes, factories] = await Promise.all([
    sampleApiRequest(`/customers${sampleBuildQuery({ orgId: manufacturer.id })}`, {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }),
    sampleApiRequest(`/attributes${sampleBuildQuery({ orgId: manufacturer.id })}`, {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }),
    sampleApiRequest(`/factories${sampleBuildQuery({ orgId: manufacturer.id })}`, {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }),
  ]);

  const linkedCustomer = Array.isArray(customers)
    ? customers.find((item) => Number(item?.brandOrgId) === Number(brand.id))
    : null;
  sampleAssert(linkedCustomer, 'manufacturer-brand relationship not found');

  const colors = Array.isArray(attributes?.colors) ? attributes.colors : [];
  sampleAssert(colors.length > 0, 'at least one color is required');
  sampleAssert(Array.isArray(factories) && factories.length > 0, 'no factory found for manufacturer');

  const preferredFactoryName = String(SAMPLE_FACTORY_NAME || '').trim();
  const factory =
    factories.find((item) => String(item?.name || '').trim() === preferredFactoryName) ||
    factories[0];
  const lines = await sampleApiRequest(
    `/lines${sampleBuildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );
  const preferredLineName = String(LINE_CONFIGS[0]?.lineName || '').trim();
  const line =
    (Array.isArray(lines) ? lines : []).find(
      (item) => String(item?.name || '').trim() === preferredLineName
    ) || ((Array.isArray(lines) && lines.length > 0) ? lines[0] : null);
  sampleAssert(line, 'no line found for selected factory');

  const lineWorkers = await sampleApiRequest(
    `/line-workers${sampleBuildQuery({ orgId: manufacturer.id, factoryId: factory.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const assignedWorkerCount = Array.isArray(lineWorkers)
    ? lineWorkers.filter((worker) => Number(worker?.currentLineId) === Number(line.id)).length
    : 0;

  return {
    colorByCode: colors.reduce((map, color) => {
      const code = String(color?.code || '').trim().toUpperCase();
      if (code) map.set(code, color);
      return map;
    }, new Map()),
    factory,
    line,
    assignedWorkerCount: assignedWorkerCount || SAMPLE_WORKER_COUNT,
  };
}

async function sampleCleanupLegacyOrders(manufacturer) {
  const existingOrders = await sampleApiRequest(
    `/orders${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const legacyOrders = (Array.isArray(existingOrders) ? existingOrders : []).filter((order) => {
    const orderNumber = String(order?.orderNumber || '');
    const orderId = String(order?.id || '');
    return orderNumber.startsWith(SAMPLE_LEGACY_ORDER_PREFIX) || orderId.startsWith('order-load-26');
  });

  for (const order of legacyOrders) {
    await sampleApiRequest(
      `/orders/${encodeURIComponent(order.id)}${sampleBuildQuery({ orgId: manufacturer.id })}`,
      {
        method: 'DELETE',
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
      }
    );
  }

  return legacyOrders.length;
}

async function sampleCleanupLegacyStyles(organizationId, userEmail) {
  const existingStyles = await sampleApiRequest(
    `/styles${sampleBuildQuery({ orgId: organizationId, compact: 1 })}`,
    {
      userEmail,
      orgId: organizationId,
    }
  );

  const legacyStyles = (Array.isArray(existingStyles) ? existingStyles : []).filter((style) =>
    String(style?.id || '').startsWith(SAMPLE_LEGACY_ORDER_PREFIX)
  );

  for (const style of legacyStyles) {
    await sampleApiRequest(
      `/styles/${encodeURIComponent(style.id)}${sampleBuildQuery({ orgId: organizationId })}`,
      {
        method: 'DELETE',
        userEmail,
        orgId: organizationId,
      }
    );
  }

  return legacyStyles.length;
}

async function sampleLoadRegisteredStyles(manufacturer, colorByCode) {
  const styles = [];
  for (const item of SAMPLE_ORDER_STYLE_ITEMS) {
    const style = await sampleApiRequest(
      `/styles/${encodeURIComponent(item.styleId)}${sampleBuildQuery({ orgId: manufacturer.id })}`,
      {
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
      }
    );
    const color = colorByCode.get(item.colorCode);
    sampleAssert(color, `color not found: ${item.colorCode}`);
    styles.push({
      definition: item,
      style,
      color,
      ptPerPiece: sampleSumStylePt(style),
    });
  }
  return styles;
}

async function sampleCreateOrUpdateConsolidatedOrder({ manufacturer, brand, registeredStyles }) {
  const today = new Date();
  const existingOrders = await sampleApiRequest(
    `/orders${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const existingOrder = (Array.isArray(existingOrders) ? existingOrders : []).find(
    (order) =>
      String(order?.id || '') === SAMPLE_DEMO_ORDER_ID ||
      String(order?.orderNumber || '') === SAMPLE_DEMO_ORDER_NUMBER
  );

  const payload = {
    id: SAMPLE_DEMO_ORDER_ID,
    orderNumber: SAMPLE_DEMO_ORDER_NUMBER,
    buyerOrgId: brand.id,
    sellerOrgId: manufacturer.id,
    customerId: brand.id,
    dueDate: sampleToDateKey(sampleAddDays(today, SAMPLE_ORDER_DUE_OFFSET_DAYS)),
    status: 'ORDER_RECEIVED',
    confirmationStatus: 'PLANNED',
    items: registeredStyles.map(({ definition, style, color }, index) => ({
      id: `item-${String(index + 1).padStart(2, '0')}`,
      styleId: style.id,
      styleCode: style.styleCode,
      styleName: style.name,
      colorId: color.id,
      colorName: color.name,
      gender: definition.gender,
      sizeQuantities: definition.sizeQuantities,
      totalQuantity: definition.quantity,
    })),
    totalQuantity: registeredStyles.reduce(
      (sum, item) => sum + Number(item.definition.quantity || 0),
      0
    ),
  };

  if (existingOrder?.isManualModificationLocked) {
    await sampleApiRequest(
      `/orders/${encodeURIComponent(existingOrder.id)}/modification-lock${sampleBuildQuery({
        orgId: manufacturer.id,
      })}`,
      {
        method: 'POST',
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
        body: {
          locked: false,
          lockedBy: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        },
      }
    );
  }

  const order = await sampleApiRequest(
    existingOrder
      ? `/orders/${encodeURIComponent(existingOrder.id)}${sampleBuildQuery({ orgId: manufacturer.id })}`
      : `/orders${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      method: existingOrder ? 'PUT' : 'POST',
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
      body: payload,
    }
  );

  if (existingOrder) {
    await sampleApiRequest(
      `/orders/${encodeURIComponent(order.id)}/modification-lock${sampleBuildQuery({
        orgId: manufacturer.id,
      })}`,
      {
        method: 'POST',
        userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        orgId: manufacturer.id,
        body: {
          locked: true,
          lockedBy: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
        },
      }
    );
  }

  return {
    order,
    mode: existingOrder ? 'updated' : 'created',
  };
}

async function runSampleOrders(options = {}) {
  const silent = Boolean(options?.silent);
  const { manufacturer, brand } = await sampleLoadOrganizations();
  const context = await sampleLoadManufacturingContext(manufacturer, brand);

  const deletedLegacyOrderCount = await sampleCleanupLegacyOrders(manufacturer);
  const deletedLegacyBrandStyleCount = await sampleCleanupLegacyStyles(
    brand.id,
    SAMPLE_BRAND_ADMIN_EMAIL
  );
  const deletedLegacyManufacturerStyleCount = await sampleCleanupLegacyStyles(
    manufacturer.id,
    SAMPLE_MANUFACTURER_ADMIN_EMAIL
  );

  const registeredStyles = await sampleLoadRegisteredStyles(
    manufacturer,
    context.colorByCode
  );
  const consolidatedOrder = await sampleCreateOrUpdateConsolidatedOrder({
    manufacturer,
    brand,
    registeredStyles,
  });

  const assignmentCardsResponse = await sampleApiRequest(
    `/assignment-cards${sampleBuildQuery({ orgId: manufacturer.id })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_ADMIN_EMAIL,
      orgId: manufacturer.id,
    }
  );

  const cards = Array.isArray(assignmentCardsResponse?.cards)
    ? assignmentCardsResponse.cards
    : [];
  const orderCards = cards.filter((card) => String(card?.orderNo || '') === SAMPLE_DEMO_ORDER_NUMBER);

  const totalPtSeconds = registeredStyles.reduce(
    (sum, item) => sum + item.ptPerPiece * Number(item.definition.quantity || 0),
    0
  );
  const estimatedLineDays =
    totalPtSeconds / (Math.max(1, context.assignedWorkerCount) * SAMPLE_WORK_LOG_SHIFT_SECONDS);
  const timeModelRealign = await runTimeModelRealignment(prisma, {
    orgIds: [manufacturer.id],
    updatedBy: 'SYSTEM_SAMPLE_ORDERS',
    log: false,
  });

  const result = {
    ok: true,
    apiBase: SAMPLE_API_BASE,
    cleanup: {
      deletedLegacyOrderCount,
      deletedLegacyBrandStyleCount,
      deletedLegacyManufacturerStyleCount,
    },
    factory: {
      id: context.factory.id,
      name: context.factory.name,
    },
    line: {
      id: context.line.id,
      name: context.line.name,
      assignedWorkerCount: context.assignedWorkerCount,
    },
    summary: {
      orderCount: 1,
      cardCount: orderCards.length,
      totalQuantity: registeredStyles.reduce(
        (sum, item) => sum + Number(item.definition.quantity || 0),
        0
      ),
      totalPtSeconds,
      estimatedLineDays: Number(estimatedLineDays.toFixed(2)),
      orderMode: consolidatedOrder.mode,
      timeModelRealign: timeModelRealign.summary,
    },
    order: {
      orderId: consolidatedOrder.order.id,
      orderNumber: consolidatedOrder.order.orderNumber,
      buyerOrgName: consolidatedOrder.order.buyerOrgName,
      sellerOrgName: consolidatedOrder.order.sellerOrgName,
      dueDate: consolidatedOrder.order.dueDate,
    },
  };

  if (!silent) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

function buildAssignmentPlanWriteDataFromSnapshot(orgId, assignment, timestamp = new Date()) {
  const externalId = String(assignment?.id || '').trim();
  const lineId = sampleToPositiveIntOrNull(assignment?.lineId);
  if (!externalId || !lineId) return null;

  const startIndex = sampleToPositiveInt(assignment?.startIndex, 0);
  const endIndex = sampleToPositiveInt(assignment?.endIndex, startIndex);
  const completedAtRaw = assignment?.completedAt ? new Date(assignment.completedAt) : null;
  const completedAt =
    completedAtRaw && Number.isFinite(completedAtRaw.getTime()) ? completedAtRaw : null;

  return {
    orgId,
    lineId,
    externalId,
    cardId: assignment?.cardId ? String(assignment.cardId) : null,
    orderNo: assignment?.orderNo ? String(assignment.orderNo) : null,
    customer: assignment?.customer ? String(assignment.customer) : null,
    label: assignment?.label ? String(assignment.label) : null,
    colorId: sampleToPositiveIntOrNull(assignment?.colorId),
    colorName: assignment?.colorName ? String(assignment.colorName) : null,
    previewUrl: assignment?.previewUrl ? String(assignment.previewUrl) : null,
    imageUrl: assignment?.imageUrl ? String(assignment.imageUrl) : null,
    thumbnailUrl: assignment?.thumbnailUrl ? String(assignment.thumbnailUrl) : null,
    assignmentQuantity: sampleToPositiveIntOrNull(
      assignment?.assignmentQuantity ?? assignment?.quantity
    ),
    originOrderId: assignment?.originOrderId ? String(assignment.originOrderId) : null,
    basis: assignment?.basis ? String(assignment.basis) : null,
    assignmentCtTotalSeconds: sampleToPositiveIntOrNull(
      assignment?.assignmentCtTotalSeconds ?? assignment?.ctTotalSeconds
    ),
    assignmentCtSnapshot:
      assignment?.assignmentCtSnapshot && typeof assignment.assignmentCtSnapshot === 'object'
          ? cloneJsonValue(assignment.assignmentCtSnapshot)
          : assignment?.ctSnapshot && typeof assignment.ctSnapshot === 'object'
            ? cloneJsonValue(assignment.ctSnapshot)
        : null,
    color: assignment?.color ? String(assignment.color) : null,
    stripeColor: assignment?.stripeColor ? String(assignment.stripeColor) : null,
    assignmentStTotalSeconds: sampleToPositiveIntOrNull(
      assignment?.assignmentStTotalSeconds ?? assignment?.stTotalSeconds
    ),
    startIndex,
    endIndex,
    startDayOffsetPercent: sampleToFiniteNumber(assignment?.startDayOffsetPercent, null),
    startDayPercent: sampleToFiniteNumber(assignment?.startDayPercent, null),
    endDayPercent: sampleToFiniteNumber(assignment?.endDayPercent, null),
    isCompleted: Boolean(assignment?.isCompleted),
    finalQuantity: sampleToPositiveIntOrNull(assignment?.finalQuantity),
    completedAt,
    updatedAt: timestamp,
  };
}

async function restoreAssignmentSnapshotWithPrisma({
  manufacturerId,
  assignments,
  boardCards,
  cards,
  targetLineId,
}) {
  const normalizedAssignments = remapAssignmentSnapshotLines(assignments, targetLineId);
  if (normalizedAssignments.length === 0) {
    return {
      attempted: false,
      method: 'prisma',
      reason: 'empty-snapshot-or-missing-target-line',
      restoredAssignmentCount: 0,
      restoredCardCount: 0,
      restoredPlanCount: 0,
    };
  }

  const now = new Date();
  const planByExternalId = new Map();
  normalizedAssignments.forEach((item) => {
    const row = buildAssignmentPlanWriteDataFromSnapshot(manufacturerId, item, now);
    if (row) planByExternalId.set(row.externalId, row);
  });
  const planRows = Array.from(planByExternalId.values());

  const cardById = new Map();
  (Array.isArray(cards) ? cards : []).forEach((item, index) => {
    const cardId = String(item?.cardId || '').trim();
    if (!cardId) return;
    cardById.set(cardId, {
      orgId: manufacturerId,
      cardId,
      sortOrder: sampleToPositiveInt(item?.sortOrder, index),
      payload: cloneJsonValue(item?.payload ?? {}),
    });
  });
  const cardRows = Array.from(cardById.values());

  await prisma.$transaction(async (tx) => {
    await tx.assignmentPlan.deleteMany({ where: { orgId: manufacturerId } });
    if (planRows.length > 0) {
      await tx.assignmentPlan.createMany({ data: planRows });
    }

    await tx.assignmentCard.deleteMany({ where: { orgId: manufacturerId } });
    if (cardRows.length > 0) {
      await tx.assignmentCard.createMany({ data: cardRows });
    }

    const safeBoardCards = Array.isArray(boardCards) ? cloneJsonValue(boardCards) : [];
    await tx.assignmentBoardState.upsert({
      where: { orgId: manufacturerId },
      update: {
        cards: safeBoardCards,
        assignments: cloneJsonValue(normalizedAssignments),
      },
      create: {
        orgId: manufacturerId,
        cards: safeBoardCards,
        assignments: cloneJsonValue(normalizedAssignments),
      },
    });
  });

  return {
    attempted: true,
    method: 'prisma',
    restoredAssignmentCount: normalizedAssignments.length,
    restoredCardCount: cardRows.length,
    restoredPlanCount: planRows.length,
    targetLineId: sampleToPositiveIntOrNull(targetLineId),
  };
}

async function sampleRestoreAssignmentSnapshot({
  manufacturerId,
  assignments,
  targetLineId,
}) {
  const normalizedAssignments = remapAssignmentSnapshotLines(assignments, targetLineId);
  if (normalizedAssignments.length === 0) {
    return {
      attempted: false,
      reason: 'empty-snapshot-or-missing-target-line',
      restoredAssignmentCount: 0,
    };
  }

  await sampleApiRequest(
    `/assignment-board-state${sampleBuildQuery({ orgId: manufacturerId })}`,
    {
      method: 'PUT',
      userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
      orgId: manufacturerId,
      body: {
        assignments: normalizedAssignments,
      },
    }
  );

  const persistedPlans = await prisma.assignmentPlan.count({
    where: { orgId: manufacturerId },
  });

  return {
    attempted: true,
    restoredAssignmentCount: normalizedAssignments.length,
    persistedPlanCount: persistedPlans,
    targetLineId: sampleToPositiveIntOrNull(targetLineId),
  };
}

function sampleParseDateKey(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`);
}

function sampleListDateKeysInclusive(startDateKey, endDateKey) {
  const result = [];
  const start = sampleParseDateKey(startDateKey);
  const end = sampleParseDateKey(endDateKey);
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    result.push(sampleToDateKey(cursor));
  }
  return result;
}

function sampleIsSunday(dateKey) {
  return sampleParseDateKey(dateKey).getUTCDay() === 0;
}

function sampleIsNonWorkingDate(dateKey) {
  return sampleIsSunday(dateKey) || SAMPLE_WORK_LOG_EXTRA_HOLIDAY_SET.has(dateKey);
}

function sampleResolveWorkStartAt(dateKey) {
  return new Date(`${dateKey}T00:00:00Z`);
}

function sampleExtractProcessCode(process, index) {
  const rawKey =
    typeof process?.processKey === 'string' && process.processKey.trim()
      ? process.processKey.trim()
      : '';
  if (rawKey) return rawKey.split('-')[0];

  const rawCode =
    typeof process?.code === 'string' && process.code.trim()
      ? process.code.trim()
      : '';
  if (rawCode) return rawCode;

  return `P${String(index + 1).padStart(2, '0')}`;
}

function sampleNormalizePlanProcesses(rows, orderQuantity) {
  return (Array.isArray(rows) ? rows : [])
    .map((process, index) => {
      const ctSeconds = sampleToPositiveInt(
        process?.ctPerPieceSeconds ??
          process?.agreedPerPieceSeconds ??
          process?.agreedSeconds ??
          process?.requestedSeconds ??
          (process?.stSeconds != null ? Number(process.stSeconds) : null) ??
          (resolveStPerPieceSeconds(process, orderQuantity) != null
            ? Number(resolveStPerPieceSeconds(process, orderQuantity))
            : null) ??
          (process?.pt != null ? Number(process.pt) : null),
        0
      );
      if (!ctSeconds) return null;

      return {
        processCode: sampleExtractProcessCode(process, index),
        processName:
          typeof process?.name === 'string' && process.name.trim()
            ? process.name.trim()
            : `Process ${index + 1}`,
        ctSeconds,
        processIndex: index,
      };
    })
    .filter(Boolean);
}

function sampleBuildPlanProcesses(plan, processMirrorByStyleId) {
  const orderQuantity = sampleToPositiveInt(
    plan?.finalQuantity ??
      plan?.assignmentQuantity ??
      plan?.quantity ??
      plan?.assignmentCtSnapshot?.quantity ??
      plan?.ctSnapshot?.quantity,
    1
  );
  const snapshotProcesses = sampleNormalizePlanProcesses(
    (plan?.assignmentCtSnapshot ?? plan?.ctSnapshot)?.processes,
    orderQuantity
  );
  if (snapshotProcesses.length > 0) {
    return snapshotProcesses;
  }

  const styleId = resolveStyleRefIdFromAssignment(plan);
  if (!styleId || !(processMirrorByStyleId instanceof Map)) {
    return [];
  }

  return sampleNormalizePlanProcesses(processMirrorByStyleId.get(styleId) || [], orderQuantity);
}

function sampleBuildDailyWeights(plan) {
  const schedule = plan?.ctSnapshot?.schedule;
  if (!schedule?.startDateKey || !schedule?.endDateKey) return [];

  const allDateKeys = sampleListDateKeysInclusive(
    schedule.startDateKey,
    schedule.endDateKey
  );
  const dateKeys = allDateKeys.filter((dateKey) => !sampleIsNonWorkingDate(dateKey));
  const effectiveDateKeys = dateKeys.length > 0 ? dateKeys : allDateKeys;
  const startShare = sampleClamp(sampleToFiniteNumber(schedule.startDayPercent, 100), 1, 100);
  const endShare = sampleClamp(sampleToFiniteNumber(schedule.endDayPercent, 100), 1, 100);

  return effectiveDateKeys.map((dateKey, index) => {
    if (effectiveDateKeys.length === 1) {
      return { dateKey, weight: Math.max(startShare, endShare) / 100 };
    }
    if (index === 0) {
      return {
        dateKey,
        weight: dateKey === schedule.startDateKey ? startShare / 100 : 1,
      };
    }
    if (index === effectiveDateKeys.length - 1) {
      return {
        dateKey,
        weight: dateKey === schedule.endDateKey ? endShare / 100 : 1,
      };
    }
    return { dateKey, weight: 1 };
  });
}

function sampleNormalizePlan(plan, random, processMirrorByStyleId) {
  const lineId = sampleToPositiveInt(plan?.lineId, 0);
  const baselineQuantity = sampleToPositiveInt(plan?.finalQuantity ?? plan?.quantity, 0);
  const processes = sampleBuildPlanProcesses(plan, processMirrorByStyleId);
  const dailyWeights = sampleBuildDailyWeights(plan);

  if (!lineId || !baselineQuantity || processes.length === 0 || dailyWeights.length === 0) {
    return null;
  }

  const varianceLimit = Math.min(
    SAMPLE_WORK_LOG_TARGET_VARIANCE,
    Math.floor((baselineQuantity * SAMPLE_WORK_LOG_TARGET_VARIANCE_PERCENT) / 100),
    Math.max(0, baselineQuantity - 1)
  );
  const variance =
    varianceLimit > 0 ? sampleRandomInt(random, -varianceLimit, varianceLimit) : 0;
  const targetQuantity = baselineQuantity + variance;
  const dailyQuantities = sampleAllocateByWeights(
    targetQuantity,
    dailyWeights.map((item) => item.weight)
  );

  return {
    dbId: sampleToPositiveInt(plan?.dbId, 0),
    externalId: String(plan?.id || ''),
    lineId,
    styleId: sampleToPositiveIntOrNull(plan?.styleId),
    styleName: String(plan?.label || ''),
    orderNo: String(plan?.orderNo || ''),
    customerName: String(plan?.customer || ''),
    colorId: sampleToPositiveIntOrNull(plan?.colorId),
    colorCode: resolveColorCodeFromAssignment(plan),
    colorName: String(plan?.colorName || ''),
    baselineQuantity,
    targetQuantity,
    totalPerPieceSeconds: sampleSumBy(processes, (process) => process.ctSeconds),
    processes,
    dailyRows: dailyWeights
      .map((weight, index) => ({
        dateKey: weight.dateKey,
        weight: weight.weight,
        quantity: dailyQuantities[index] ?? 0,
      }))
      .filter((row) => row.quantity > 0),
  };
}

function sampleAllocateWorkerCounts(tasks, workerCount) {
  if (tasks.length === 0 || workerCount <= 0) {
    return Array.from({ length: tasks.length }, () => 0);
  }

  const counts = Array.from({ length: tasks.length }, () => 0);
  let remaining = workerCount;

  if (tasks.length <= workerCount) {
    for (let index = 0; index < tasks.length; index += 1) {
      counts[index] = 1;
      remaining -= 1;
    }
  }

  while (remaining > 0) {
    let bestIndex = -1;
    let bestScore = -1;

    for (let index = 0; index < tasks.length; index += 1) {
      if (counts[index] >= tasks[index].quantity) continue;
      const score = tasks[index].totalSeconds / (counts[index] + 1);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) break;
    counts[bestIndex] += 1;
    remaining -= 1;
  }

  return counts;
}

function sampleBuildLineDayEntries(plans) {
  const entryMap = new Map();

  plans.forEach((plan, planOrder) => {
    plan.dailyRows.forEach((row) => {
      const key = `${plan.lineId}::${row.dateKey}`;
      if (!entryMap.has(key)) {
        entryMap.set(key, {
          lineId: plan.lineId,
          dateKey: row.dateKey,
          items: [],
        });
      }

      entryMap.get(key).items.push({
        plan,
        quantity: row.quantity,
        planOrder,
      });
    });
  });

  return Array.from(entryMap.values()).sort(
    (left, right) =>
      left.lineId - right.lineId || left.dateKey.localeCompare(right.dateKey)
  );
}

function sampleResolvePlanDateWindow(plans) {
  const dateKeys = plans.flatMap((plan) =>
    Array.isArray(plan?.dailyRows) ? plan.dailyRows.map((row) => row.dateKey) : []
  );
  if (dateKeys.length === 0) {
    return {
      earliestDateKey: null,
      latestDateKey: null,
    };
  }

  const sorted = Array.from(new Set(dateKeys)).sort();
  return {
    earliestDateKey: sorted[0] ?? null,
    latestDateKey: sorted[sorted.length - 1] ?? null,
  };
}

function sampleNormalizeLookupKey(value) {
  return String(value || '').trim().toUpperCase();
}

async function sampleLoadWorkRecordRefMaps(orgId, plans) {
  const styleIds = Array.from(
    new Set(
      plans
        .map((plan) => sampleToPositiveIntOrNull(plan?.styleId))
        .filter((styleId) => Number.isFinite(styleId))
    )
  );
  const processCodes = Array.from(
    new Set(
      plans
        .flatMap((plan) =>
          Array.isArray(plan?.processes)
            ? plan.processes.map((process) => String(process?.processCode || '').trim())
            : []
        )
        .filter(Boolean)
    )
  );

  const styleProcessRows =
    styleIds.length > 0 && processCodes.length > 0
      ? await prisma.styleProcess.findMany({
          where: {
            orgId,
            styleId: { in: styleIds },
            processCode: { in: processCodes },
          },
          select: {
            id: true,
            styleId: true,
            processCode: true,
          },
        })
      : [];

  return {
    styleProcessIdByStyleProcessKey: new Map(
      styleProcessRows.map((process) => [
        `${Number(process.styleId)}::${sampleNormalizeLookupKey(process.processCode)}`,
        Number(process.id),
      ])
    ),
  };
}

async function sampleEnsureLineAssignmentsCoverPlanDates(plans) {
  const lineIds = Array.from(
    new Set(
      plans
        .map((plan) => sampleToPositiveIntOrNull(plan?.lineId))
        .filter((lineId) => Number.isFinite(lineId))
    )
  );
  const { earliestDateKey, latestDateKey } = sampleResolvePlanDateWindow(plans);
  if (lineIds.length === 0 || !earliestDateKey) {
    return {
      lineIds,
      earliestDateKey,
      latestDateKey,
      updatedLineAssignmentCount: 0,
    };
  }

  const earliestStartAt = sampleResolveWorkStartAt(earliestDateKey);
  const updated = await prisma.lineAssignment.updateMany({
    where: {
      lineId: { in: lineIds },
      startAt: { gt: earliestStartAt },
      OR: [{ endAt: null }, { endAt: { gte: earliestStartAt } }],
    },
    data: {
      startAt: earliestStartAt,
    },
  });

  return {
    lineIds,
    earliestDateKey,
    latestDateKey,
    updatedLineAssignmentCount: updated.count,
  };
}

async function sampleSeedAttendanceEntries({
  orgId,
  factoryId,
  entries,
  getWorkersForLineDate,
  replaceExisting,
  isDryRun,
}) {
  const draftByWorkerDate = new Map();

  for (const entry of entries) {
    const workers = await getWorkersForLineDate(entry.lineId, entry.dateKey);
    workers.forEach((worker) => {
      const workerId = sampleToPositiveIntOrNull(worker?.id);
      if (!workerId) return;
      draftByWorkerDate.set(`${entry.dateKey}::${workerId}`, {
        orgId,
        factoryId,
        workerId,
        workDate: entry.dateKey,
        clockIn: SAMPLE_WORK_LOG_CLOCK_IN,
        clockOut: SAMPLE_WORK_LOG_CLOCK_OUT,
        workedSeconds: SAMPLE_WORK_LOG_SHIFT_SECONDS,
        note: `${SAMPLE_WORK_LOG_NOTE_PREFIX} ${SAMPLE_WORK_LOG_ATTENDANCE_NOTE}`,
      });
    });
  }

  const rows = Array.from(draftByWorkerDate.values());
  if (rows.length === 0) {
    return {
      createdAttendanceCount: 0,
      replacedAttendanceCount: 0,
      attendanceDateCount: 0,
    };
  }

  if (isDryRun) {
    return {
      createdAttendanceCount: rows.length,
      replacedAttendanceCount: 0,
      attendanceDateCount: new Set(rows.map((row) => row.workDate)).size,
    };
  }

  let replacedAttendanceCount = 0;
  if (replaceExisting) {
    const workerIds = Array.from(
      new Set(rows.map((row) => row.workerId).filter((workerId) => Number.isFinite(workerId)))
    );
    const workDates = Array.from(new Set(rows.map((row) => row.workDate).filter(Boolean)));
    const deleted = await prisma.attendanceEntry.deleteMany({
      where: {
        orgId,
        factoryId,
        workerId: { in: workerIds },
        workDate: { in: workDates },
      },
    });
    replacedAttendanceCount = deleted.count;
  }

  const created = await prisma.attendanceEntry.createMany({
    data: rows,
    skipDuplicates: true,
  });

  return {
    createdAttendanceCount: created.count,
    replacedAttendanceCount,
    attendanceDateCount: new Set(rows.map((row) => row.workDate)).size,
  };
}

function sampleBuildTaskUnits(tasks) {
  const units = [];

  tasks.forEach((task, taskIndex) => {
    const quantity = sampleToPositiveInt(task?.quantity, 0);
    for (let unitIndex = 0; unitIndex < quantity; unitIndex += 1) {
      units.push({
        ...task,
        taskIndex,
        unitIndex,
      });
    }
  });

  return units.sort(
    (left, right) =>
      right.ctSeconds - left.ctSeconds ||
      left.plan.dbId - right.plan.dbId ||
      left.taskIndex - right.taskIndex ||
      left.unitIndex - right.unitIndex
  );
}

function sampleAssignTaskUnitToWorker(unit, slot, recordsByKey) {
  slot.totalSeconds += unit.ctSeconds;
  slot.unitCount += 1;

  const key = [
    slot.worker.id,
    unit.plan.dbId,
    unit.processCode,
    unit.colorId ?? '',
    unit.styleId ?? '',
  ].join('::');
  if (!recordsByKey.has(key)) {
    recordsByKey.set(key, {
      workerId: slot.worker.id,
      workerName: slot.worker.name,
      styleId: unit.plan.styleId,
      processCode: unit.processCode,
      colorCode: unit.plan.colorCode || null,
      ctSeconds: unit.ctSeconds,
      quantity: 0,
      assignmentPlanId: unit.plan.dbId,
    });
  }

  recordsByKey.get(key).quantity += 1;
}

function sampleAllocateTaskUnitsToWorkers(tasks, workers) {
  if (!Array.isArray(tasks) || tasks.length === 0 || !Array.isArray(workers) || workers.length === 0) {
    return {
      records: [],
      workerSeconds: [],
    };
  }

  const units = sampleBuildTaskUnits(tasks);
  if (units.length === 0) {
    return {
      records: [],
      workerSeconds: workers.map((worker) => ({
        workerId: worker.id,
        workerName: worker.name,
        totalSeconds: 0,
        unitCount: 0,
      })),
    };
  }

  const slots = workers.map((worker, index) => ({
    worker,
    index,
    totalSeconds: 0,
    unitCount: 0,
  }));
  const recordsByKey = new Map();
  const seedCount = Math.min(slots.length, units.length);

  for (let index = 0; index < seedCount; index += 1) {
    sampleAssignTaskUnitToWorker(units[index], slots[index], recordsByKey);
  }

  for (let index = seedCount; index < units.length; index += 1) {
    let bestSlot = slots[0];
    for (let slotIndex = 1; slotIndex < slots.length; slotIndex += 1) {
      const candidate = slots[slotIndex];
      if (
        candidate.totalSeconds < bestSlot.totalSeconds ||
        (candidate.totalSeconds === bestSlot.totalSeconds &&
          candidate.unitCount < bestSlot.unitCount) ||
        (candidate.totalSeconds === bestSlot.totalSeconds &&
          candidate.unitCount === bestSlot.unitCount &&
          candidate.index < bestSlot.index)
      ) {
        bestSlot = candidate;
      }
    }
    sampleAssignTaskUnitToWorker(units[index], bestSlot, recordsByKey);
  }

  return {
    records: Array.from(recordsByKey.values()),
    workerSeconds: slots.map((slot) => ({
      workerId: slot.worker.id,
      workerName: slot.worker.name,
      totalSeconds: slot.totalSeconds,
      unitCount: slot.unitCount,
    })),
  };
}

function sampleSummarizeProgress(rows, planByExternalId) {
  return rows
    .map((row) => {
      const plan = planByExternalId.get(String(row.id || ''));
      return {
        dbId: row.dbId,
        orderNo: row.orderNo,
        label: row.label,
        colorName: plan?.colorName ?? '',
        plannedQuantity: row.plannedQuantity,
        producedQuantity: row.producedQuantity,
        diff:
          Number.isFinite(row.producedQuantity) && Number.isFinite(plan?.baselineQuantity)
            ? row.producedQuantity - plan.baselineQuantity
            : null,
      };
    })
    .sort((left, right) => left.dbId - right.dbId);
}

async function runSampleWorkLogs(options = {}) {
  const workLogOrgId =
    sampleToPositiveIntOrNull(options?.orgId) || SAMPLE_WORK_LOG_ORG_ID;
  const isDryRun =
    options?.dryRun === true || options?.dryRun === false
      ? Boolean(options.dryRun)
      : SAMPLE_WORK_LOG_DRY_RUN;
  const replaceExisting = Boolean(options?.replaceExisting);
  const silent = Boolean(options?.silent);
  const random = sampleCreateRng(SAMPLE_WORK_LOG_SEED);
  const timeModelRealign = await runTimeModelRealignment(prisma, {
    orgIds: [workLogOrgId],
    updatedBy: 'SYSTEM_SAMPLE_WORK_LOG',
    log: false,
  });
  const factoryIdFromEnv = sampleToPositiveIntOrNull(process.env.FACTORY_ID);
  const factories = await sampleApiRequest(
    `/factories${sampleBuildQuery({ orgId: workLogOrgId })}`,
    {
      userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
      orgId: workLogOrgId,
    }
  );
  const preferredFactoryName = String(SAMPLE_FACTORY_NAME || '').trim();
  const factory =
    (Array.isArray(factories) ? factories : []).find(
      (item) => Number(item?.id) === Number(factoryIdFromEnv)
    ) ||
    (Array.isArray(factories) ? factories : []).find(
      (item) => String(item?.name || '').trim() === preferredFactoryName
    ) ||
    (Array.isArray(factories) ? factories[0] : null);
  sampleAssert(factory, `factory not found for org ${workLogOrgId}`);

  const styles = await prisma.style.findMany({
    where: { orgId: workLogOrgId },
    select: { id: true, processes: true },
  });
  const processMirrorByStyleId = new Map(
    styles
      .map((style) => [Number(style?.id), style?.processes])
      .filter(([styleId, processes]) => Number.isFinite(styleId) && Array.isArray(processes))
  );

  const [rawPlans, existingLogs] = await Promise.all([
    sampleApiRequest(
      `/assignment-plans${sampleBuildQuery({
        orgId: workLogOrgId,
        factoryId: factory.id,
      })}`,
      {
        userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
        orgId: workLogOrgId,
      }
    ),
    sampleApiRequest(
      `/work-logs${sampleBuildQuery({
        orgId: workLogOrgId,
        factoryId: factory.id,
      })}`,
      {
        userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
        orgId: workLogOrgId,
      }
    ),
  ]);

  const plans = (Array.isArray(rawPlans) ? rawPlans : [])
    .filter((plan) => Number(plan?.ctTotalSeconds) > 0)
    .map((plan) => sampleNormalizePlan(plan, random, processMirrorByStyleId))
    .filter(Boolean);

  sampleAssert(plans.length > 0, 'no agreed assignment plans found');
  const workRecordRefMaps = await sampleLoadWorkRecordRefMaps(workLogOrgId, plans);
  const scheduleWindow = await sampleEnsureLineAssignmentsCoverPlanDates(plans);

  const existingLogRows = Array.isArray(existingLogs) ? existingLogs : [];
  let replacedLogCount = 0;
  if (replaceExisting && !isDryRun) {
    const existingLogIds = existingLogRows
      .map((log) => sampleToPositiveIntOrNull(log?.id))
      .filter((id) => Number.isFinite(id));
    if (existingLogIds.length > 0) {
      const deleted = await prisma.workLog.deleteMany({
        where: { orgId: workLogOrgId, id: { in: existingLogIds } },
      });
      replacedLogCount = deleted.count;
    }
  }
  const existingKeys = replaceExisting
    ? new Set()
    : new Set(existingLogRows.map((log) => `${log.lineId ?? '?'}::${log.workDate ?? ''}`));

  const workerCache = new Map();
  const getWorkersForLineDate = async (lineId, dateKey) => {
    const cacheKey = `${lineId}::${dateKey}`;
    if (!workerCache.has(cacheKey)) {
      workerCache.set(
        cacheKey,
        sampleApiRequest(
          `/line-workers${sampleBuildQuery({
            orgId: workLogOrgId,
            factoryId: factory.id,
            lineId,
            workDate: dateKey,
          })}`,
          {
            userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
            orgId: workLogOrgId,
          }
        )
      );
    }
    const rows = await workerCache.get(cacheKey);
    return Array.isArray(rows) ? rows.slice().sort((left, right) => left.id - right.id) : [];
  };

  const entries = sampleBuildLineDayEntries(plans);
  const planByExternalId = new Map(plans.map((plan) => [plan.externalId, plan]));
  const attendanceSeed = await sampleSeedAttendanceEntries({
    orgId: workLogOrgId,
    factoryId: factory.id,
    entries,
    getWorkersForLineDate,
    replaceExisting,
    isDryRun,
  });

  let createdCount = 0;
  let skippedCount = 0;
  const failureSamples = [];

  for (const entry of entries) {
    const logKey = `${entry.lineId}::${entry.dateKey}`;
    if (existingKeys.has(logKey)) {
      skippedCount += 1;
      continue;
    }

    const workers = await getWorkersForLineDate(entry.lineId, entry.dateKey);
    if (workers.length === 0) {
      skippedCount += 1;
      continue;
    }

    const tasks = entry.items
      .sort((left, right) => left.planOrder - right.planOrder || left.plan.dbId - right.plan.dbId)
      .flatMap((item) =>
        item.plan.processes.map((process) => ({
          plan: item.plan,
          quantity: item.quantity,
          totalSeconds: item.quantity * process.ctSeconds,
          processCode: process.processCode,
          processName: process.processName,
          ctSeconds: process.ctSeconds,
          processIndex: process.processIndex ?? 0,
        }))
      );
    const allocated = sampleAllocateTaskUnitsToWorkers(tasks, workers);
    const records = allocated.records;
    if (records.length === 0) {
      skippedCount += 1;
      continue;
    }
    const requestRecords = records.map((record) => {
      const normalizedStyleId = sampleToPositiveIntOrNull(record.styleId);
      const normalizedProcessCode = sampleNormalizeLookupKey(record.processCode);
      const styleProcessId =
        normalizedStyleId !== null
          ? workRecordRefMaps.styleProcessIdByStyleProcessKey.get(
              `${normalizedStyleId}::${normalizedProcessCode}`
            ) || null
          : null;

      return {
        workerId: record.workerId,
        workerName: record.workerName,
        styleId: normalizedStyleId,
        styleProcessId,
        ctSeconds: record.ctSeconds,
        quantity: record.quantity,
        assignmentPlanId: record.assignmentPlanId,
      };
    });

    const totalCtSeconds = sampleSumBy(
      requestRecords,
      (record) => record.ctSeconds * record.quantity
    );
    const body = {
      workDate: entry.dateKey,
      factoryId: factory.id,
      factoryWagePerSecond: sampleToFiniteNumber(factory.wagePerSecond, null),
      lineId: entry.lineId,
      ctBasis: 'CT',
      workerCount: workers.length,
      itemCount: requestRecords.length,
      totalCtSeconds,
      records: requestRecords,
      note:
        `${SAMPLE_WORK_LOG_NOTE_PREFIX} shift=${SAMPLE_WORK_LOG_CLOCK_IN}-${SAMPLE_WORK_LOG_CLOCK_OUT} ` +
        `workedSeconds=${SAMPLE_WORK_LOG_SHIFT_SECONDS} lunch=12:00-13:00 seed=${SAMPLE_WORK_LOG_SEED}`,
    };

    if (isDryRun) {
      skippedCount += 1;
      continue;
    }

    try {
      await sampleApiRequest(`/work-logs${sampleBuildQuery({ orgId: workLogOrgId })}`, {
        method: 'POST',
        userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
        orgId: workLogOrgId,
        body,
      });
    } catch (error) {
      if (failureSamples.length < 10) {
        failureSamples.push({
          workDate: entry.dateKey,
          lineId: entry.lineId,
          message: error?.message || 'failed to create work log',
        });
      }
      skippedCount += 1;
      continue;
    }

    existingKeys.add(logKey);
    createdCount += 1;
  }

  const ids = plans.map((plan) => plan.externalId).filter(Boolean).join(',');
  const progressRows = isDryRun
    ? []
    : await sampleApiRequest(
        `/assignment-plan-progress${sampleBuildQuery({
          orgId: workLogOrgId,
          ids,
        })}`,
        {
          userEmail: SAMPLE_MANUFACTURER_OPERATOR_EMAIL,
          orgId: workLogOrgId,
        }
      );
  const summary = sampleSummarizeProgress(
    Array.isArray(progressRows) ? progressRows : [],
    planByExternalId
  );

  const result = {
    ok: true,
    dryRun: isDryRun,
    factory: { id: factory.id, name: factory.name },
    summary: {
      planCount: plans.length,
      lineDayCount: entries.length,
      earliestWorkDate: scheduleWindow.earliestDateKey,
      latestWorkDate: scheduleWindow.latestDateKey,
      replacedLogCount,
      createdCount,
      skippedCount,
      failureSamples,
      updatedLineAssignmentCount: scheduleWindow.updatedLineAssignmentCount,
      attendanceSeed,
      timeModelRealign: timeModelRealign.summary,
    },
    verification: summary,
  };

  if (!silent) {
    console.log(JSON.stringify(result, null, 2));
  }

  return result;
}

async function runBaselineReset() {
  const summary = {};

  await prisma.systemUser.upsert({
    where: { email: 'system-admin@test.local' },
    update: { systemRole: 'SYSTEM_ADMIN' },
    create: { email: 'system-admin@test.local', systemRole: 'SYSTEM_ADMIN' },
  });

  const manufacturer = await upsertOrganization({
    code: 'TSMF',
    name: 'TSMF',
    type: 'MANUFACTURER',
    representative: 'Manager',
    industry: 'Garment Manufacturing',
    address: 'Sample Factory Address',
    email: 'manufacturer-admin@test.local',
  });
  const brand = await upsertOrganization({
    code: 'TSBR',
    name: 'TSBR',
    type: 'BRAND',
    representative: 'Brand Manager',
    industry: 'Fashion Brand',
    address: 'Sample Brand Address',
    email: 'brand-admin@test.local',
  });

  await ensureSubscription(manufacturer.id, 'manufacturer-admin@test.local');
  await ensureSubscription(brand.id, 'brand-admin@test.local');

  await prisma.orgRelationship.upsert({
    where: {
      manufacturerOrgId_brandOrgId: {
        manufacturerOrgId: manufacturer.id,
        brandOrgId: brand.id,
      },
    },
    update: {},
    create: {
      manufacturerOrgId: manufacturer.id,
      brandOrgId: brand.id,
      customerCode: 'TSBR',
    },
  });

  const capturedAssignmentSnapshot = await captureAssignmentBoardSnapshot(manufacturer.id);
  const baselineAssignmentSnapshot = resolveBaselineAssignmentSnapshot(capturedAssignmentSnapshot);
  const assignmentSnapshot = baselineAssignmentSnapshot.snapshot;

  await syncGlobalColors();
  await syncManufacturerAttributes(manufacturer.id);
  const manufacturerProcessCleanup = await cleanupLegacyProcessAliases(manufacturer.id);
  const brandProcessCleanup = await cleanupLegacyProcessAliases(brand.id);
  const manufacturerCategoryCleanup = await cleanupLegacyCategoryAliases(manufacturer.id);
  const brandCategoryCleanup = await cleanupLegacyCategoryAliases(brand.id);
  const sampleCleanup = await cleanupSampleFactoryData(manufacturer.id);
  const legacyStyleCleanup = await cleanupLegacyBaselineStyles(manufacturer.id);
  const sewingRole = await prisma.attrRole.findUnique({
    where: { orgId_code: { orgId: manufacturer.id, code: 'WORKER_SEWING' } },
  });
  const factory = await ensureFactory(manufacturer.id);
  const lineRows = [];
  for (const lineConfig of LINE_CONFIGS) {
    lineRows.push({
      config: lineConfig,
      line: await ensureLine(manufacturer.id, factory.id, lineConfig.lineName),
    });
  }

  for (const membership of STAFF_MEMBERSHIPS) {
    const createdMembership = await ensureMembership(manufacturer.id, membership);
    await ensureEmployee({
      orgId: manufacturer.id,
      employeeId: createdMembership.id,
      factoryId: null,
      roleId: null,
      payType: membership.payType,
      name: membership.name,
      position: membership.position ?? membership.role,
      bankName: membership.bankName,
      bankAccountNumber: membership.bankAccountNumber,
    });
  }

  for (const membership of BRAND_MEMBERSHIPS) {
    const createdMembership = await ensureMembership(brand.id, membership);
    await ensureEmployee({
      orgId: brand.id,
      employeeId: createdMembership.id,
      factoryId: null,
      roleId: null,
      payType: membership.payType,
      name: membership.name,
      position: membership.position ?? membership.role,
      bankName: membership.bankName,
      bankAccountNumber: membership.bankAccountNumber,
    });
  }

  const workerEmployeeIdsByLine = new Map();
  for (const { config } of lineRows) {
    workerEmployeeIdsByLine.set(config.key, []);
    for (let index = 1; index <= SAMPLE_WORKER_COUNT; index += 1) {
      const email = toWorkerEmail(config.workerPrefix, index);
      const membership = await ensureMembership(manufacturer.id, {
        email,
        role: 'WORKER',
      });
      const employee = await ensureEmployee({
        orgId: manufacturer.id,
        employeeId: membership.id,
        factoryId: factory.id,
        roleId: sewingRole ? sewingRole.id : null,
        payType: 'CT',
        name: toWorkerName(config.workerLabel, index),
        position: index === 1 ? 'LINE_LEADER' : 'WORKER',
      });
      workerEmployeeIdsByLine.get(config.key).push(employee.id);
    }
  }

  const baselineWorkerIds = Array.from(workerEmployeeIdsByLine.values()).flat();
  await prisma.lineAssignment.deleteMany({
    where: { employeeId: { in: baselineWorkerIds } },
  });

  for (const { config, line } of lineRows) {
    const workerIds = workerEmployeeIdsByLine.get(config.key) || [];
    if (workerIds.length === 0) continue;

    await prisma.line.update({
      where: { id: line.id },
      data: { managerEmployeeId: workerIds[0], isActive: true },
    });

    await prisma.lineAssignment.createMany({
      data: workerIds.map((employeeId) => ({
        lineId: line.id,
        employeeId,
        startAt: SAMPLE_LINE_ASSIGNMENT_START_AT,
      })),
    });
  }

  const styleMasterReset = await runStyleProcessMasterReplacement({
    orgId: manufacturer.id,
    customerName: brand.code,
  });
  await ensureStyles(manufacturer.id);
  const cleanup = await clearOrderAndAssignmentData(manufacturer.id);
  let sampleOrderSeed = null;
  let sampleWorkLogSeed = null;
  let assignmentRestore = {
    source: baselineAssignmentSnapshot.source,
    capturedAssignmentCount: Array.isArray(assignmentSnapshot?.assignments)
      ? assignmentSnapshot.assignments.length
      : 0,
    sourceUpdatedAt: assignmentSnapshot?.updatedAt ?? null,
    attempted: false,
    restoredAssignmentCount: 0,
  };

  try {
    sampleOrderSeed = await runSampleOrders({ silent: true });
  } catch (error) {
    sampleOrderSeed = {
      ok: false,
      reason: 'sample-order-seed-failed',
      error: error?.message || 'failed to seed sample orders',
    };
  }

  if (assignmentRestore.capturedAssignmentCount > 0 && sampleOrderSeed?.ok !== false) {
    try {
      assignmentRestore = {
        ...assignmentRestore,
        ...(await sampleRestoreAssignmentSnapshot({
          manufacturerId: manufacturer.id,
          assignments: assignmentSnapshot.assignments,
          targetLineId: lineRows[0]?.line?.id ?? null,
        })),
      };
    } catch (error) {
      assignmentRestore = {
        ...assignmentRestore,
        attempted: false,
        reason: 'restore-through-api-failed',
        error: error?.message || 'failed to restore assignment snapshot through api',
      };

      assignmentRestore = {
        ...assignmentRestore,
        ...(await restoreAssignmentSnapshotWithPrisma({
          manufacturerId: manufacturer.id,
          assignments: assignmentSnapshot.assignments,
          boardCards: assignmentSnapshot.boardCards,
          cards: assignmentSnapshot.cards,
          targetLineId: lineRows[0]?.line?.id ?? null,
        })),
      };
    }
  } else if (assignmentRestore.capturedAssignmentCount === 0) {
    assignmentRestore = {
      ...assignmentRestore,
      attempted: false,
      reason:
        baselineAssignmentSnapshot.source === 'script'
          ? 'no-script-assignment-snapshot'
          : 'no-assignment-snapshot',
    };
  }

  const timeModelRealign = await runTimeModelRealignment(prisma, {
    orgIds: [manufacturer.id],
    updatedBy: 'SYSTEM_RESET_BASELINE',
    log: false,
  });

  const assignmentPlanCount = await prisma.assignmentPlan.count({
    where: { orgId: manufacturer.id },
  });
  if (assignmentPlanCount > 0) {
    try {
      sampleWorkLogSeed = await runSampleWorkLogs({
        orgId: manufacturer.id,
        replaceExisting: true,
        silent: true,
      });
    } catch (error) {
      sampleWorkLogSeed = {
        ok: false,
        reason: 'sample-work-log-seed-failed',
        error: error?.message || 'failed to regenerate sample work logs',
      };
    }
  } else {
    sampleWorkLogSeed = {
      ok: false,
      reason: 'no-assignment-plans',
      assignmentPlanCount,
    };
  }

  summary.organizations = [manufacturer.code, brand.code].join(', ');
  summary.globalColors = BASELINE_COLORS.length;
  summary.processes = styleMasterReset?.replacedProcessMasterCount ?? BASELINE_PROCESSES.length;
  summary.roles = BASELINE_ROLES.length;
  summary.categoryCleanup = {
    manufacturerDeleted: manufacturerCategoryCleanup.deletedCategories,
    brandDeleted: brandCategoryCleanup.deletedCategories,
  };
  summary.processCleanup = {
    manufacturerDeleted: manufacturerProcessCleanup.deletedProcesses,
    brandDeleted: brandProcessCleanup.deletedProcesses,
  };
  summary.styles = Array.isArray(styleMasterReset?.styles)
    ? styleMasterReset.styles.length
    : COMPOSED_STYLE_SEEDS.length;
  summary.workers = baselineWorkerIds.length;
  summary.sampleFactoryCleanup = sampleCleanup;
  summary.legacyStyleCleanup = legacyStyleCleanup;
  summary.cleanup = cleanup;
  summary.styleMasterReset = styleMasterReset;
  summary.sampleOrderSeed = sampleOrderSeed
    ? {
        orderNumber: sampleOrderSeed?.order?.orderNumber ?? null,
        cardCount: sampleOrderSeed?.summary?.cardCount ?? 0,
      }
    : null;
  summary.assignmentSnapshotRestore = assignmentRestore;
  summary.timeModelRealign = timeModelRealign.summary;
  summary.sampleWorkLogs = sampleWorkLogSeed;

  console.log('Baseline reset completed.');
  console.log(JSON.stringify(summary, null, 2));
}

async function main() {
  const command = String(process.argv[2] || 'baseline').trim().toLowerCase();

  if (command === 'baseline' || command === 'reset' || command === 'initialize' || command === 'init') {
    await runBaselineReset();
    return;
  }

  if (command === 'orders') {
    await runSampleOrders();
    return;
  }

  if (command === 'work-logs') {
    await runSampleWorkLogs({ replaceExisting: true });
    return;
  }

  if (command === 'sample-all') {
    await runSampleOrders();
    await runSampleWorkLogs({ replaceExisting: true });
    return;
  }

  if (command === 'time-model' || command === 'realign-time-model') {
    const orgIdFromEnv = sampleToPositiveIntOrNull(process.env.ORG_ID);
    await runTimeModelRealignment(prisma, {
      orgIds: orgIdFromEnv ? [orgIdFromEnv] : undefined,
      updatedBy: 'SYSTEM_RESET_BASELINE',
    });
    return;
  }

  throw new Error(
    `unknown command "${command}". expected one of: baseline, initialize, orders, work-logs, sample-all, time-model`
  );
}

main()
  .catch((error) => {
    console.error('Baseline reset failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


