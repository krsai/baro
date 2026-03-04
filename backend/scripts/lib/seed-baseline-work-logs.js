'use strict';

const BASELINE_ASSIGNMENT_AGREEMENTS = require('../reset-to-baseline.assignment-agreements.json');

const WORK_LOG_QTY_VARIANCE_LIMIT = 5;
const WORK_LOG_SEED_NOTE_PREFIX = 'Baseline seed';
const WORK_SECONDS_PER_WORKER_PER_DAY = 8 * 60 * 60;

const normalizeDateKey = (value) => {
  const text = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

const toStartOfDay = (dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const listWorkingDateKeysInclusive = (startDateKey, endDateKey) => {
  const startAt = toStartOfDay(startDateKey);
  if (!startAt) return [];

  const endAt = toStartOfDay(endDateKey) || startAt;
  const from = startAt <= endAt ? startAt : endAt;
  const to = startAt <= endAt ? endAt : startAt;
  const values = [];
  const cursor = new Date(from);

  while (cursor <= to) {
    if (!isWeekend(cursor)) {
      values.push(toDateKey(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return values.length > 0 ? values : [toDateKey(startAt)];
};

const resolveRoundedPositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded > 0 ? rounded : null;
};

const parseCardIdentity = (value) => {
  const [orderId = '', styleId = '', colorCode = '', gender = ''] = String(
    value || ''
  ).split('::');
  return { orderId, styleId, colorCode, gender };
};

const resolveProcessCodeFromSeed = (processKey, fallback = '') => {
  const [code = ''] = String(processKey || '').split('-');
  return code || fallback;
};

const createStableVariance = (seed, limit = WORK_LOG_QTY_VARIANCE_LIMIT) => {
  const text = String(seed || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  const size = limit * 2 + 1;
  return (Math.abs(hash) % size) - limit;
};

const resolveBaselineSeedDateKey = (seed) => {
  const explicit = normalizeDateKey(seed?.startDateKey);
  if (explicit) return explicit;
  const fallbackDate = new Date(seed?.createdAt || seed?.ctAgreedAt || '');
  if (Number.isNaN(fallbackDate.getTime())) return '';
  const year = fallbackDate.getFullYear();
  const month = String(fallbackDate.getMonth() + 1).padStart(2, '0');
  const day = String(fallbackDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getStableOffset = (seed, size) => {
  if (!size || size <= 1) return 0;
  const text = String(seed || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % size;
};

const splitIntegerAcrossBuckets = (total, bucketCount, offsetSeed = '') => {
  const quantity = Math.max(0, Math.round(Number(total || 0) || 0));
  if (quantity <= 0) return [];
  const safeBucketCount = Math.max(1, Math.round(Number(bucketCount || 0) || 0));
  const buckets = Array.from({ length: safeBucketCount }, () => 0);
  const base = Math.floor(quantity / safeBucketCount);
  const remainder = quantity % safeBucketCount;
  const startIndex = getStableOffset(offsetSeed, safeBucketCount);

  for (let index = 0; index < safeBucketCount; index += 1) {
    buckets[index] = base;
  }
  for (let index = 0; index < remainder; index += 1) {
    const targetIndex = (startIndex + index) % safeBucketCount;
    buckets[targetIndex] += 1;
  }

  return buckets;
};

const allocateQuantityAcrossDates = ({
  quantity,
  perPieceSeconds,
  dateKeys,
  resolveDailyCapacityPieces,
}) => {
  const remainingDates = Array.isArray(dateKeys) && dateKeys.length > 0 ? dateKeys : [];
  if (remainingDates.length === 0) return [];

  let quantityRemaining = Math.max(0, Math.round(Number(quantity || 0) || 0));
  const allocations = [];

  for (let index = 0; index < remainingDates.length && quantityRemaining > 0; index += 1) {
    const dateKey = remainingDates[index];
    const daysLeft = remainingDates.length - index;
    const desiredPieces = Math.max(1, Math.ceil(quantityRemaining / daysLeft));
    const dailyCapacityPieces = Math.max(
      0,
      Math.floor(Number(resolveDailyCapacityPieces(dateKey, perPieceSeconds)) || 0)
    );
    if (dailyCapacityPieces <= 0) continue;

    const allocatedPieces = Math.min(quantityRemaining, desiredPieces, dailyCapacityPieces);
    if (allocatedPieces <= 0) continue;

    allocations.push({ dateKey, quantity: allocatedPieces });
    quantityRemaining -= allocatedPieces;
  }

  let overflowDateCursor = toStartOfDay(remainingDates[remainingDates.length - 1]);
  while (quantityRemaining > 0 && overflowDateCursor) {
    overflowDateCursor.setDate(overflowDateCursor.getDate() + 1);
    if (isWeekend(overflowDateCursor)) continue;

    const overflowDateKey = toDateKey(overflowDateCursor);
    const dailyCapacityPieces = Math.max(
      1,
      Math.floor(Number(resolveDailyCapacityPieces(overflowDateKey, perPieceSeconds)) || 0)
    );
    const allocatedPieces = Math.min(quantityRemaining, dailyCapacityPieces);
    allocations.push({ dateKey: overflowDateKey, quantity: allocatedPieces });
    quantityRemaining -= allocatedPieces;
  }

  return allocations.filter((entry) => entry.quantity > 0);
};

const buildStyleProcessSeedList = (style) => {
  const processes = Array.isArray(style?.processes) ? style.processes : [];
  return processes
    .map((process) => ({
      processCode: String(process?.code || ''),
      processName: String(process?.name || ''),
      ctSeconds: Math.max(
        0,
        Math.round(
          Number(process?.at ?? process?.pt ?? process?.agreedPerPieceSeconds ?? 0) || 0
        )
      ),
    }))
    .filter((process) => process.processCode || process.processName);
};

const buildCardProcessSeedMap = (styleById) => {
  const byCardId = new Map();
  const cardSeeds = Array.isArray(BASELINE_ASSIGNMENT_AGREEMENTS.cards)
    ? BASELINE_ASSIGNMENT_AGREEMENTS.cards
    : [];

  for (const cardSeed of cardSeeds) {
    const cardId = String(cardSeed?.cardId || '');
    if (!cardId) continue;

    const { styleId } = parseCardIdentity(cardId);
    const style = styleById.get(styleId);
    const fallbackProcesses = buildStyleProcessSeedList(style);
    const seededProcesses = Array.isArray(cardSeed?.ctAgreedSnapshot?.processes)
      ? cardSeed.ctAgreedSnapshot.processes
      : [];

    const resolvedProcesses =
      seededProcesses.length > 0
        ? seededProcesses
            .map((process, index) => ({
              processCode: resolveProcessCodeFromSeed(
                process?.processKey,
                fallbackProcesses[index]?.processCode || ''
              ),
              processName:
                String(process?.name || '') || fallbackProcesses[index]?.processName || '',
              ctSeconds: Math.max(
                0,
                Math.round(
                  Number(
                    process?.agreedPerPieceSeconds ??
                      process?.agreedSeconds ??
                      process?.stSeconds ??
                      fallbackProcesses[index]?.ctSeconds ??
                      0
                  ) || 0
                )
              ),
            }))
            .filter((process) => process.processCode || process.processName)
        : fallbackProcesses;

    byCardId.set(cardId, resolvedProcesses);
  }

  return byCardId;
};

const resolveEarliestBaselineAssignmentStartAt = () => {
  const assignmentSeeds = Array.isArray(BASELINE_ASSIGNMENT_AGREEMENTS.assignments)
    ? BASELINE_ASSIGNMENT_AGREEMENTS.assignments
    : [];

  let earliest = null;
  for (const seed of assignmentSeeds) {
    const startAt = toStartOfDay(resolveBaselineSeedDateKey(seed));
    if (!startAt) continue;
    if (!earliest || startAt < earliest) {
      earliest = startAt;
    }
  }

  return earliest;
};

const isWorkerActiveOnDate = (assignment, workDate) => {
  const startAt = toStartOfDay(workDate);
  if (!startAt) return false;
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 1);
  endAt.setMilliseconds(endAt.getMilliseconds() - 1);

  if (!(assignment.startAt instanceof Date) || Number.isNaN(assignment.startAt.getTime())) {
    return false;
  }
  if (assignment.startAt > endAt) return false;
  if (assignment.endAt instanceof Date && !Number.isNaN(assignment.endAt.getTime())) {
    return assignment.endAt >= startAt;
  }
  return true;
};

async function seedBaselineWorkLogs({
  prisma,
  orgId,
  skipExistingAssignments = true,
  backfillLineAssignmentStartAt = true,
  replaceExistingSeededLogs = true,
} = {}) {
  if (!prisma || !orgId) {
    throw new Error('seedBaselineWorkLogs requires prisma and orgId');
  }

  const assignmentSeeds = Array.isArray(BASELINE_ASSIGNMENT_AGREEMENTS.assignments)
    ? BASELINE_ASSIGNMENT_AGREEMENTS.assignments
    : [];
  const externalIds = assignmentSeeds
    .map((seed) => String(seed?.id || ''))
    .filter(Boolean);

  if (externalIds.length === 0) {
    return {
      assignmentPlansMatched: 0,
      assignmentPlansSeeded: 0,
      assignmentPlansSkipped: 0,
      workLogsCreated: 0,
      workRecordsCreated: 0,
      lineAssignmentsBackfilled: 0,
    };
  }

  const seedByExternalId = new Map(
    assignmentSeeds.map((seed) => [String(seed.id), seed])
  );
  const earliestStartAt = resolveEarliestBaselineAssignmentStartAt();
  let deletedSeededWorkLogs = 0;

  if (replaceExistingSeededLogs) {
    const deleted = await prisma.workLog.deleteMany({
      where: {
        orgId,
        note: { startsWith: WORK_LOG_SEED_NOTE_PREFIX },
      },
    });
    deletedSeededWorkLogs = deleted.count;
  }

  const assignmentPlans = await prisma.assignmentPlan.findMany({
    where: {
      orgId,
      externalId: { in: externalIds },
    },
    select: {
      id: true,
      externalId: true,
      lineId: true,
      cardId: true,
      orderNo: true,
      customer: true,
      label: true,
      colorName: true,
      quantity: true,
      finalQuantity: true,
      contractedSeconds: true,
      originOrderId: true,
    },
    orderBy: [{ lineId: 'asc' }, { externalId: 'asc' }],
  });

  if (assignmentPlans.length === 0) {
    return {
      assignmentPlansMatched: 0,
      assignmentPlansSeeded: 0,
      assignmentPlansSkipped: 0,
      workLogsCreated: 0,
      workRecordsCreated: 0,
      lineAssignmentsBackfilled: 0,
    };
  }

  const lineIds = [...new Set(assignmentPlans.map((plan) => Number(plan.lineId)).filter(Boolean))];

  let lineAssignmentsBackfilled = 0;
  if (backfillLineAssignmentStartAt && earliestStartAt && lineIds.length > 0) {
    const updated = await prisma.lineAssignment.updateMany({
      where: {
        lineId: { in: lineIds },
        endAt: null,
        startAt: { gt: earliestStartAt },
      },
      data: { startAt: earliestStartAt },
    });
    lineAssignmentsBackfilled = updated.count;
  }

  const lineRows = await prisma.line.findMany({
    where: { orgId, id: { in: lineIds } },
    select: { id: true, name: true, factoryId: true },
  });
  const lineById = new Map(lineRows.map((line) => [line.id, line]));

  const factoryIds = [...new Set(lineRows.map((line) => Number(line.factoryId)).filter(Boolean))];
  const factories = factoryIds.length
    ? await prisma.factory.findMany({
        where: { id: { in: factoryIds } },
        select: { id: true, name: true, wagePerSecond: true },
      })
    : [];
  const factoryById = new Map(factories.map((factory) => [factory.id, factory]));

  const lineAssignments = lineIds.length
    ? await prisma.lineAssignment.findMany({
        where: {
          lineId: { in: lineIds },
          OR: earliestStartAt
            ? [{ endAt: null }, { endAt: { gte: earliestStartAt } }]
            : [{ endAt: null }],
        },
        select: {
          lineId: true,
          employeeId: true,
          startAt: true,
          endAt: true,
          employee: { select: { name: true } },
        },
        orderBy: [{ lineId: 'asc' }, { employeeId: 'asc' }],
      })
    : [];
  const lineAssignmentsByLineId = new Map();
  for (const assignment of lineAssignments) {
    const bucket = lineAssignmentsByLineId.get(assignment.lineId) || [];
    bucket.push(assignment);
    lineAssignmentsByLineId.set(assignment.lineId, bucket);
  }

  const styleIds = [
    ...new Set(
      assignmentPlans
        .map((plan) => parseCardIdentity(plan.cardId || plan.originOrderId).styleId)
        .filter(Boolean)
    ),
  ];
  const styles = styleIds.length
    ? await prisma.style.findMany({
        where: { orgId, styleId: { in: styleIds } },
        select: { styleId: true, name: true, processes: true },
      })
    : [];
  const styleById = new Map(styles.map((style) => [style.styleId, style]));
  const cardProcessSeedsByCardId = buildCardProcessSeedMap(styleById);

  const colorCodes = [
    ...new Set(
      assignmentPlans
        .map((plan) => parseCardIdentity(plan.cardId || plan.originOrderId).colorCode)
        .filter(Boolean)
    ),
  ];
  const colors = colorCodes.length
    ? await prisma.attrColor.findMany({
        where: { orgId, code: { in: colorCodes } },
        select: { id: true, code: true },
      })
    : [];
  const colorIdByCode = new Map(colors.map((color) => [color.code, color.id]));

  const existingAssignmentPlanIdSet = new Set();
  if (skipExistingAssignments) {
    const existingRows = await prisma.workRecord.groupBy({
      by: ['assignmentPlanId'],
      where: {
        orgId,
        assignmentPlanId: { in: assignmentPlans.map((plan) => plan.id) },
      },
      _count: { _all: true },
    });

    for (const row of existingRows) {
      if (row.assignmentPlanId) {
        existingAssignmentPlanIdSet.add(row.assignmentPlanId);
      }
    }
  }

  const groups = new Map();
  const lineCapacityRemainingByDate = new Map();
  let assignmentPlansSeeded = 0;
  let assignmentPlansSkipped = 0;

  for (const plan of assignmentPlans) {
    if (existingAssignmentPlanIdSet.has(plan.id)) {
      assignmentPlansSkipped += 1;
      continue;
    }

    const seed = seedByExternalId.get(plan.externalId);
    if (!seed) {
      assignmentPlansSkipped += 1;
      continue;
    }

    const line = lineById.get(plan.lineId);
    if (!line) {
      assignmentPlansSkipped += 1;
      continue;
    }

    const { styleId, colorCode } = parseCardIdentity(plan.cardId || plan.originOrderId);
    const style = styleById.get(styleId);
    const processSeeds =
      cardProcessSeedsByCardId.get(String(plan.cardId || '')) ||
      buildStyleProcessSeedList(style);
    const baselineQuantity =
      resolveRoundedPositiveInt(plan.finalQuantity) ??
      resolveRoundedPositiveInt(plan.quantity) ??
      resolveRoundedPositiveInt(seed.quantity);

    if (!baselineQuantity || processSeeds.length === 0) {
      assignmentPlansSkipped += 1;
      continue;
    }

    const totalPerPieceSeconds = processSeeds.reduce(
      (sum, process) => sum + Math.max(0, Math.round(Number(process.ctSeconds || 0) || 0)),
      0
    );
    if (totalPerPieceSeconds <= 0) {
      assignmentPlansSkipped += 1;
      continue;
    }

    const actualQuantity = Math.max(
      1,
      baselineQuantity + createStableVariance(plan.externalId)
    );
    const factory = factoryById.get(line.factoryId) || null;

    const startDateKey = resolveBaselineSeedDateKey(seed);
    const endDateKey = normalizeDateKey(seed?.endDateKey) || startDateKey;
    const scheduledDateKeys = listWorkingDateKeysInclusive(startDateKey, endDateKey);

    const dayAllocations = allocateQuantityAcrossDates({
      quantity: actualQuantity,
      perPieceSeconds: totalPerPieceSeconds,
      dateKeys: scheduledDateKeys,
      resolveDailyCapacityPieces: (dateKey) => {
        const lineWorkerPool = lineAssignmentsByLineId.get(line.id) || [];
        const activeWorkers = lineWorkerPool.filter((assignment) =>
          isWorkerActiveOnDate(assignment, dateKey)
        );
        const eligibleWorkers = activeWorkers.length > 0 ? activeWorkers : lineWorkerPool;
        const totalDailyCapacitySeconds =
          Math.max(1, eligibleWorkers.length || 1) * WORK_SECONDS_PER_WORKER_PER_DAY;
        const capacityKey = `${line.id}::${dateKey}`;
        if (!lineCapacityRemainingByDate.has(capacityKey)) {
          lineCapacityRemainingByDate.set(capacityKey, totalDailyCapacitySeconds);
        }
        return Math.floor(
          (lineCapacityRemainingByDate.get(capacityKey) || 0) / totalPerPieceSeconds
        );
      },
    });

    if (dayAllocations.length === 0) {
      assignmentPlansSkipped += 1;
      continue;
    }

    dayAllocations.forEach((allocation, allocationIndex) => {
      const workDate = allocation.dateKey;
      const lineWorkerPool = lineAssignmentsByLineId.get(line.id) || [];
      const activeWorkers = lineWorkerPool.filter((assignment) =>
        isWorkerActiveOnDate(assignment, workDate)
      );
      const eligibleWorkers = activeWorkers.length > 0 ? activeWorkers : lineWorkerPool;
      const dailyQuantity = allocation.quantity;
      const capacityKey = `${line.id}::${workDate}`;
      const existingRemainingSeconds = lineCapacityRemainingByDate.get(capacityKey);
      if (existingRemainingSeconds !== undefined) {
        lineCapacityRemainingByDate.set(
          capacityKey,
          Math.max(0, existingRemainingSeconds - dailyQuantity * totalPerPieceSeconds)
        );
      }

      const groupKey = `${factory?.id ?? 0}::${workDate}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          lineIds: new Set(),
          lineNames: new Set(),
          workDate,
          factory,
          assignmentPlanIds: new Set(),
          workerIds: new Set(),
          totalContractedSeconds: 0,
          records: [],
        });
      }

      const group = groups.get(groupKey);
      group.lineIds.add(line.id);
      group.lineNames.add(line.name);
      group.assignmentPlanIds.add(plan.id);
      group.totalContractedSeconds += dailyQuantity * totalPerPieceSeconds;
      eligibleWorkers.forEach((worker) => {
        if (worker?.employeeId) {
          group.workerIds.add(worker.employeeId);
        }
      });

      const workerShares = eligibleWorkers.length > 0
        ? splitIntegerAcrossBuckets(
            dailyQuantity,
            eligibleWorkers.length,
            `${plan.externalId}::${workDate}::${allocationIndex}`
          )
        : [dailyQuantity];

      processSeeds.forEach((process, processIndex) => {
        workerShares.forEach((workerQuantity, workerIndex) => {
          if (workerQuantity <= 0) return;
          const worker = eligibleWorkers[workerIndex] || null;

          group.records.push({
            workerId: worker?.employeeId ?? null,
            workerName: worker?.employee?.name || '',
            customerName: plan.customer || '',
            styleId: styleId || '',
            styleName: plan.label || style?.name || '',
            processCode: process.processCode || '',
            processName: process.processName || '',
            colorId: colorIdByCode.get(colorCode) ?? null,
            colorCode: colorCode || '',
            colorName: plan.colorName || '',
            ctSeconds: Math.max(0, Math.round(Number(process.ctSeconds || 0) || 0)),
            quantity: workerQuantity,
            assignmentPlanId: plan.id,
            _sortKey: `${plan.externalId}::${workDate}::${processIndex}::${workerIndex}`,
          });
        });
      });
    });

    assignmentPlansSeeded += 1;
  }

  let workLogsCreated = 0;
  let workRecordsCreated = 0;

  const sortedGroups = Array.from(groups.values()).sort((left, right) => {
    if (left.workDate !== right.workDate) {
      return left.workDate.localeCompare(right.workDate);
    }
    return Number(left.factory?.id || 0) - Number(right.factory?.id || 0);
  });

  for (const group of sortedGroups) {
    if (group.records.length === 0) continue;

    group.records.sort((left, right) =>
      String(left._sortKey || '').localeCompare(String(right._sortKey || ''))
    );
    const lineIds = Array.from(group.lineIds.values()).sort((left, right) => left - right);
    const lineNames = Array.from(group.lineNames.values()).sort((left, right) =>
      String(left).localeCompare(String(right))
    );

    const createdWorkLog = await prisma.workLog.create({
      data: {
        orgId,
        workDate: group.workDate,
        factoryId: group.factory?.id ?? null,
        factoryName: group.factory?.name ?? '',
        factoryWagePerSecond: Number.isFinite(Number(group.factory?.wagePerSecond))
          ? Number(group.factory.wagePerSecond)
          : null,
        ctBasis: 'CT',
        workerCount: Math.max(group.workerIds.size, 1),
        itemCount: group.assignmentPlanIds.size,
        totalContractedSeconds: Math.max(0, Math.round(group.totalContractedSeconds)),
        note:
          `${WORK_LOG_SEED_NOTE_PREFIX} from assignment schedule ` +
          `(qty variance +/-${WORK_LOG_QTY_VARIANCE_LIMIT}, max 8h/worker/day)`,
        records: {
          lineId: lineIds.length === 1 ? lineIds[0] : null,
          lineName: lineNames.length === 1 ? lineNames[0] : null,
          lineIds,
          lineNames,
        },
      },
    });

    await prisma.workRecord.createMany({
      data: group.records.map((record) => ({
        orgId,
        workLogId: createdWorkLog.id,
        workerId: record.workerId,
        workerName: record.workerName,
        customerName: record.customerName,
        styleId: record.styleId,
        styleName: record.styleName,
        processCode: record.processCode,
        processName: record.processName,
        colorId: record.colorId,
        colorCode: record.colorCode,
        colorName: record.colorName,
        ctSeconds: record.ctSeconds,
        quantity: record.quantity,
        assignmentPlanId: record.assignmentPlanId,
      })),
    });

    workLogsCreated += 1;
    workRecordsCreated += group.records.length;
  }

  return {
    assignmentPlansMatched: assignmentPlans.length,
    assignmentPlansSeeded,
    assignmentPlansSkipped,
    workLogsCreated,
    workRecordsCreated,
    lineAssignmentsBackfilled,
    deletedSeededWorkLogs,
  };
}

module.exports = {
  seedBaselineWorkLogs,
  resolveEarliestBaselineAssignmentStartAt,
};
