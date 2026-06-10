const MAX_PLANNING_MONTH_SPAN = 18;

export const normalizeDateKey = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
    ? value.trim()
    : '';

export const normalizeMonthKey = (value) =>
  typeof value === 'string' && /^\d{4}-\d{2}$/.test(value.trim())
    ? value.trim()
    : '';

const parseDateKeyParts = (dateKey) => {
  const normalized = normalizeDateKey(dateKey);
  if (!normalized) return null;
  const [yearText, monthText, dayText] = normalized.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return { year, month, day };
};

const toUtcDate = (dateKey) => {
  const parts = parseDateKeyParts(dateKey);
  if (!parts) return null;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return Number.isNaN(next.getTime()) ? null : next;
};

const shiftDateKeyByDays = (dateKey, offset) => {
  const baseDate = toUtcDate(dateKey);
  if (!baseDate) return '';
  baseDate.setUTCDate(baseDate.getUTCDate() + Math.trunc(offset));
  return baseDate.toISOString().slice(0, 10);
};

export const shiftMonthKey = (monthKey, offset) => {
  const normalized = normalizeMonthKey(monthKey);
  if (!normalized) return '';
  const [yearText, monthText] = normalized.split('-');
  let year = Number(yearText);
  let month = Number(monthText);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return '';
  let remain = Math.trunc(offset);
  while (remain !== 0) {
    if (remain > 0) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
      remain -= 1;
      continue;
    }
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    remain += 1;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
};

export const buildMonthKeyRange = (monthFromInput, monthToInput) => {
  const monthFrom = normalizeMonthKey(monthFromInput);
  const monthTo = normalizeMonthKey(monthToInput);
  if (!monthFrom || !monthTo || monthFrom > monthTo) return [];
  const monthKeys = [];
  let cursor = monthFrom;
  for (let index = 0; index < MAX_PLANNING_MONTH_SPAN; index += 1) {
    monthKeys.push(cursor);
    if (cursor === monthTo) break;
    const nextMonthKey = shiftMonthKey(cursor, 1);
    if (!nextMonthKey || nextMonthKey === cursor) break;
    cursor = nextMonthKey;
  }
  return monthKeys;
};

export const getMonthStartDateKey = (monthKeyInput) => {
  const monthKey = normalizeMonthKey(monthKeyInput);
  return monthKey ? `${monthKey}-01` : '';
};

export const getMonthEndDateKey = (monthKeyInput) => {
  const monthKey = normalizeMonthKey(monthKeyInput);
  if (!monthKey) return '';
  const nextMonthKey = shiftMonthKey(monthKey, 1);
  if (!nextMonthKey) return '';
  return shiftDateKeyByDays(`${nextMonthKey}-01`, -1);
};

const listDateKeysInclusive = (startDateKeyInput, endDateKeyInput) => {
  const startDateKey = normalizeDateKey(startDateKeyInput);
  const endDateKey = normalizeDateKey(endDateKeyInput);
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return [];
  const dateKeys = [];
  let cursor = startDateKey;
  for (let index = 0; index < 366 * 4; index += 1) {
    dateKeys.push(cursor);
    if (cursor === endDateKey) break;
    const nextDateKey = shiftDateKeyByDays(cursor, 1);
    if (!nextDateKey || nextDateKey === cursor) break;
    cursor = nextDateKey;
  }
  return dateKeys;
};

export const isWorkingDateKey = (dateKey, holidaySet = new Set()) => {
  const date = toUtcDate(dateKey);
  if (!date) return false;
  return date.getUTCDay() !== 0 && !holidaySet.has(dateKey);
};

const countWorkingDaysInRange = (startDateKey, endDateKey, holidaySet = new Set()) =>
  listDateKeysInclusive(startDateKey, endDateKey).reduce(
    (sum, dateKey) => (isWorkingDateKey(dateKey, holidaySet) ? sum + 1 : sum),
    0
  );

const countCalendarDaysInRange = (startDateKey, endDateKey) =>
  listDateKeysInclusive(startDateKey, endDateKey).length;

const buildMonthWeightRows = ({
  startDateKey,
  endDateKey,
  monthKeys,
  holidaySet,
}) => {
  const rows = (Array.isArray(monthKeys) ? monthKeys : [])
    .map((monthKey) => {
      const monthStartDateKey = getMonthStartDateKey(monthKey);
      const monthEndDateKey = getMonthEndDateKey(monthKey);
      if (!monthStartDateKey || !monthEndDateKey) return null;
      const overlapStartDateKey =
        startDateKey > monthStartDateKey ? startDateKey : monthStartDateKey;
      const overlapEndDateKey =
        endDateKey < monthEndDateKey ? endDateKey : monthEndDateKey;
      if (overlapStartDateKey > overlapEndDateKey) return null;
      return {
        monthKey,
        workingDays: countWorkingDaysInRange(
          overlapStartDateKey,
          overlapEndDateKey,
          holidaySet
        ),
        calendarDays: countCalendarDaysInRange(
          overlapStartDateKey,
          overlapEndDateKey
        ),
      };
    })
    .filter(Boolean);

  const totalWorkingDays = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row?.workingDays) || 0),
    0
  );
  const totalCalendarDays = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row?.calendarDays) || 0),
    0
  );
  const useCalendarFallback = totalWorkingDays <= 0 && totalCalendarDays > 0;

  return rows
    .map((row) => ({
      monthKey: row.monthKey,
      weight: useCalendarFallback
        ? Math.max(0, Number(row.calendarDays) || 0)
        : Math.max(0, Number(row.workingDays) || 0),
    }))
    .filter((row) => row.weight > 0);
};

const distributeIntegerTotalByWeights = ({ total, weightedRows }) => {
  const normalizedTotal = Math.max(0, Math.round(Number(total) || 0));
  const normalizedRows = (Array.isArray(weightedRows) ? weightedRows : []).filter(
    (row) =>
      normalizeMonthKey(row?.monthKey) &&
      Number.isFinite(Number(row?.weight)) &&
      Number(row.weight) > 0
  );
  if (normalizedTotal <= 0 || normalizedRows.length === 0) return [];
  const weightSum = normalizedRows.reduce(
    (sum, row) => sum + Number(row.weight),
    0
  );
  if (!Number.isFinite(weightSum) || weightSum <= 0) return [];

  const rawRows = normalizedRows.map((row, index) => {
    const rawValue = (normalizedTotal * Number(row.weight)) / weightSum;
    const flooredValue = Math.floor(rawValue);
    return {
      monthKey: row.monthKey,
      allocatedTotal: flooredValue,
      fraction: rawValue - flooredValue,
      order: index,
    };
  });

  let remainder =
    normalizedTotal -
    rawRows.reduce((sum, row) => sum + row.allocatedTotal, 0);
  rawRows
    .slice()
    .sort((left, right) => {
      if (right.fraction !== left.fraction) {
        return right.fraction - left.fraction;
      }
      return left.order - right.order;
    })
    .forEach((row) => {
      if (remainder <= 0) return;
      row.allocatedTotal += 1;
      remainder -= 1;
    });

  return rawRows
    .map((row) => ({
      monthKey: row.monthKey,
      allocatedTotal: row.allocatedTotal,
    }))
    .filter((row) => row.allocatedTotal > 0);
};

const roundPercent = (numerator, denominator) => {
  const safeDenominator = Number(denominator);
  if (!Number.isFinite(safeDenominator) || safeDenominator <= 0) return null;
  return Math.round((Number(numerator || 0) / safeDenominator) * 1000) / 10;
};

const resolveLineDailyCapacitySeconds = (line) => {
  const explicitDailyCapacity = Number(line?.dailyCapacitySeconds);
  if (Number.isFinite(explicitDailyCapacity) && explicitDailyCapacity > 0) {
    return Math.round(explicitDailyCapacity);
  }
  const headcount = Math.max(0, Math.round(Number(line?.headcount) || 0));
  return headcount > 0 ? headcount * 8 * 60 * 60 : 0;
};

const resolveWorkingDateCursor = (
  dateKeyInput,
  holidaySet = new Set(),
  { allowSameDay = true } = {}
) => {
  let cursor = normalizeDateKey(dateKeyInput);
  if (!cursor) return '';
  if (allowSameDay && isWorkingDateKey(cursor, holidaySet)) return cursor;
  for (let index = 0; index < 366 * 3; index += 1) {
    cursor = shiftDateKeyByDays(cursor, 1);
    if (!cursor) return '';
    if (isWorkingDateKey(cursor, holidaySet)) return cursor;
  }
  return '';
};

const addWorkingDaysToDateKey = (dateKeyInput, workingDaysToAdd, holidaySet = new Set()) => {
  const startDateKey = resolveWorkingDateCursor(dateKeyInput, holidaySet, {
    allowSameDay: true,
  });
  if (!startDateKey) return '';
  let remaining = Math.max(0, Math.trunc(workingDaysToAdd));
  let cursor = startDateKey;
  while (remaining > 0) {
    cursor = resolveWorkingDateCursor(shiftDateKeyByDays(cursor, 1), holidaySet, {
      allowSameDay: true,
    });
    if (!cursor) return '';
    remaining -= 1;
  }
  return cursor;
};

const roundDaysEstimate = (seconds, dailyCapacitySeconds) => {
  const normalizedSeconds = Math.max(0, Number(seconds) || 0);
  const normalizedDailyCapacity = Math.max(0, Number(dailyCapacitySeconds) || 0);
  if (normalizedSeconds <= 0 || normalizedDailyCapacity <= 0) return 0;
  return Math.round((normalizedSeconds / normalizedDailyCapacity) * 10) / 10;
};

const buildLineQueueForecast = ({
  assignments,
  line,
  holidaySet,
  todayDateKey,
  anchorDateKey,
}) => {
  const normalizedAnchorDateKey =
    normalizeDateKey(anchorDateKey) ||
    normalizeDateKey(todayDateKey) ||
    new Date().toISOString().slice(0, 10);
  const dailyCapacitySeconds = resolveLineDailyCapacitySeconds(line);
  const queuedAssignments = [];
  const completedAssignments = [];
  let queuedCount = 0;
  let completedCount = 0;
  let readyToCompleteCount = 0;

  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const rawRemainingStTotalSeconds =
      assignment?.remainingStTotalSeconds ??
      assignment?.plannedStTotalSeconds ??
      assignment?.stTotalSeconds ??
      null;
    const remainingStTotalSeconds =
      rawRemainingStTotalSeconds == null
        ? null
        : Math.max(0, Math.round(Number(rawRemainingStTotalSeconds) || 0));
    const isCompleted = Boolean(assignment?.isCompleted);
    const actualProducedCompletedAt = normalizeDateKey(
      assignment?.actualProducedCompletedAt
    );
    const productionCompletedAt = normalizeDateKey(
      assignment?.productionCompletedAt
    );
    const persistedCompletedAt =
      productionCompletedAt || normalizeDateKey(assignment?.completedAt);
    const completedAt = persistedCompletedAt || actualProducedCompletedAt || null;
    const isReadyToComplete =
      !isCompleted && Boolean(actualProducedCompletedAt);
    const elapsedDays = Math.max(0, Number(assignment?.elapsedDays) || 0);
    const baseAssignment = {
      ...assignment,
      remainingStTotalSeconds,
      actualProducedCompletedAt: actualProducedCompletedAt || null,
      productionCompletedAt: productionCompletedAt || null,
      completedAt: completedAt || null,
      completionDateIsEstimated:
        Boolean(completedAt) && !Boolean(persistedCompletedAt),
      isWorkFinished: isCompleted,
      elapsedDays: elapsedDays > 0 ? elapsedDays : null,
      dailyCapacitySeconds,
    };

    if (isCompleted) {
      completedCount += 1;
      completedAssignments.push({
        ...baseAssignment,
        queuePosition: completedCount,
        queueStatus: 'completed',
        estimatedRemainingWorkDays: 0,
        forecastStartDateKey: null,
        forecastEndDateKey: completedAt || null,
      });
      return;
    }
    if (isReadyToComplete) {
      readyToCompleteCount += 1;
    }

    const estimatedRemainingWorkDays =
      remainingStTotalSeconds == null
        ? null
        : roundDaysEstimate(remainingStTotalSeconds, dailyCapacitySeconds);

    queuedCount += 1;
    queuedAssignments.push({
      ...baseAssignment,
      queuePosition: queuedCount,
      queueStatus: isReadyToComplete ? 'ready_to_complete' : 'queued',
      estimatedRemainingWorkDays,
      forecastStartDateKey: null,
      forecastEndDateKey: null,
    });
  });

  const totalRemainingStTotalSeconds = queuedAssignments.reduce(
    (sum, assignment) =>
      sum +
      Math.max(
        0,
        assignment?.remainingStTotalSeconds == null
          ? 0
          : Number(assignment.remainingStTotalSeconds) || 0
      ),
    0
  );
  const totalRequiredWorkingDays =
    dailyCapacitySeconds > 0
      ? Math.max(1, Math.ceil(totalRemainingStTotalSeconds / dailyCapacitySeconds))
      : 0;
  const lineFreeDateKey =
    totalRemainingStTotalSeconds > 0 && totalRequiredWorkingDays > 0
      ? addWorkingDaysToDateKey(
          normalizedAnchorDateKey,
          Math.max(0, totalRequiredWorkingDays - 1),
          holidaySet
        ) || ''
      : '';

  return {
    dailyCapacitySeconds,
    queuedAssignments,
    completedAssignments,
    completedCount,
    readyToCompleteCount,
    totalRemainingStTotalSeconds,
    queueBacklogDays: roundDaysEstimate(totalRemainingStTotalSeconds, dailyCapacitySeconds),
    lineFreeDateKey,
  };
};

const resolveAssignmentScheduleRange = (assignment) => {
  const startDateKey = normalizeDateKey(assignment?.startDateKey);
  const endDateKey = normalizeDateKey(assignment?.endDateKey);
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return null;
  return { startDateKey, endDateKey };
};

export const resolvePlanningMonthKeys = ({
  visibleMonthKeys,
}) => {
  const normalizedVisibleMonthKeys = (Array.isArray(visibleMonthKeys) ? visibleMonthKeys : [])
    .map((monthKey) => normalizeMonthKey(monthKey))
    .filter(Boolean);
  return normalizedVisibleMonthKeys;
};

const buildFallbackLineMonthlyCapacitySeconds = (line, monthKey, holidaySet) => {
  const monthStartDateKey = getMonthStartDateKey(monthKey);
  const monthEndDateKey = getMonthEndDateKey(monthKey);
  if (!monthStartDateKey || !monthEndDateKey) return 0;
  const workingDayCount = countWorkingDaysInRange(
    monthStartDateKey,
    monthEndDateKey,
    holidaySet
  );
  const dailyCapacitySeconds = Number(line?.dailyCapacitySeconds);
  if (!Number.isFinite(dailyCapacitySeconds) || dailyCapacitySeconds <= 0) {
    return 0;
  }
  return Math.max(0, Math.round(dailyCapacitySeconds * workingDayCount));
};

const resolveAssignmentForecastStTotalSeconds = (assignment) => {
  const rawValue =
    assignment?.remainingStTotalSeconds ??
    assignment?.plannedStTotalSeconds ??
    assignment?.stTotalSeconds ??
    null;
  if (rawValue == null) return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
};

const resolveCarryOutDateKey = ({ monthKey, carryOutStSeconds, holidaySet }) => {
  if (Math.max(0, Number(carryOutStSeconds) || 0) <= 0) return '';
  const monthEndDateKey = getMonthEndDateKey(monthKey);
  if (!monthEndDateKey) return '';
  return (
    resolveWorkingDateCursor(shiftDateKeyByDays(monthEndDateKey, 1), holidaySet, {
      allowSameDay: true,
    }) || ''
  );
};

const resolveForecastWindowRange = ({
  monthKey,
  monthType,
  forecastAnchorDateKey,
}) => {
  if (monthType !== 'anchor') {
    return {
      forecastWindowStartDateKey: '',
      forecastWindowEndDateKey: '',
    };
  }
  const forecastWindowStartDateKey = normalizeDateKey(forecastAnchorDateKey);
  const forecastWindowEndDateKey = getMonthEndDateKey(monthKey);
  if (
    !forecastWindowStartDateKey ||
    !forecastWindowEndDateKey ||
    forecastWindowStartDateKey > forecastWindowEndDateKey
  ) {
    return {
      forecastWindowStartDateKey: '',
      forecastWindowEndDateKey: '',
    };
  }
  return {
    forecastWindowStartDateKey,
    forecastWindowEndDateKey,
  };
};

export const buildLineMonthCapacityBoardRows = ({
  lines,
  assignments,
  planningMonthKeys,
  visibleMonthKeys,
  holidaySet,
  backendRows,
  todayDateKey,
}) => {
  const normalizedPlanningMonthKeys = (Array.isArray(planningMonthKeys) ? planningMonthKeys : [])
    .map((monthKey) => normalizeMonthKey(monthKey))
    .filter(Boolean);
  const normalizedVisibleMonthKeys = (Array.isArray(visibleMonthKeys) ? visibleMonthKeys : [])
    .map((monthKey) => normalizeMonthKey(monthKey))
    .filter(Boolean);
  const monthKeysForDisplay =
    normalizedVisibleMonthKeys.length > 0
      ? normalizedVisibleMonthKeys
      : normalizedPlanningMonthKeys;
  const backendRowByKey = new Map(
    (Array.isArray(backendRows) ? backendRows : [])
      .map((row) => {
        const lineId = String(row?.lineId || '').trim();
        const monthKey = normalizeMonthKey(row?.monthKey);
        return lineId && monthKey ? [`${lineId}:${monthKey}`, row] : null;
      })
      .filter(Boolean)
  );
  const backendRowsByLineId = new Map();
  (Array.isArray(backendRows) ? backendRows : []).forEach((row) => {
    const lineId = String(row?.lineId || '').trim();
    if (!lineId) return;
    const current = backendRowsByLineId.get(lineId) || [];
    current.push(row);
    backendRowsByLineId.set(lineId, current);
  });
  backendRowsByLineId.forEach((rows, lineId) => {
    rows.sort((left, right) =>
      String(left?.monthKey || '').localeCompare(String(right?.monthKey || ''))
    );
  });
  const lineBackendMetaByLineId = new Map();
  backendRowsByLineId.forEach((rows, lineId) => {
    const sourceRow = rows[0] || null;
    lineBackendMetaByLineId.set(lineId, {
      latestActualCoverageEndDateKey: normalizeDateKey(sourceRow?.latestActualCoverageEndDateKey),
      forecastAnchorDateKey: normalizeDateKey(sourceRow?.forecastAnchorDateKey),
      lineRemainingBacklogStSeconds:
        sourceRow?.lineRemainingBacklogStSeconds == null
          ? null
          : Math.max(0, Math.round(Number(sourceRow.lineRemainingBacklogStSeconds) || 0)),
      stUnknownAssignmentCount: Math.max(
        0,
        Math.round(Number(sourceRow?.stUnknownAssignmentCount) || 0)
      ),
    });
  });

  return (Array.isArray(lines) ? lines : []).map((line) => {
    const lineId = String(line?.id || '').trim();
    const lineMeta = lineBackendMetaByLineId.get(lineId) || null;
    const assignmentsForLine = (Array.isArray(assignments) ? assignments : [])
      .filter((assignment) => String(assignment?.lineId || '').trim() === lineId)
      .map((assignment, sourceOrderIndex) => {
        const assignmentId = String(assignment?.id || '').trim();
        return {
          id: assignmentId,
          label: assignment?.label || '',
          orderNo: assignment?.orderNo || '',
          customer: assignment?.customer || '',
          colorName: assignment?.colorName || '',
          quantity: Math.max(0, Math.round(Number(assignment?.quantity) || 0)),
          previewUrl: assignment?.previewUrl || assignment?.imageUrl || assignment?.thumbnailUrl || '',
          startDateKey: normalizeDateKey(assignment?.startDateKey),
          endDateKey: normalizeDateKey(assignment?.endDateKey),
          startIndex: Number.isFinite(Number(assignment?.startIndex))
            ? Number(assignment.startIndex)
            : null,
          endIndex: Number.isFinite(Number(assignment?.endIndex))
            ? Number(assignment.endIndex)
            : null,
          plannedStTotalSeconds: Math.max(
            0,
            Math.round(Number(assignment?.plannedStTotalSeconds ?? assignment?.stTotalSeconds) || 0)
          ),
          producedQuantity:
            assignment?.producedQuantity == null
              ? null
              : Math.max(0, Math.round(Number(assignment.producedQuantity) || 0)),
          remainingStTotalSeconds:
            assignment?.remainingStTotalSeconds == null
              ? null
              : Math.max(0, Math.round(Number(assignment.remainingStTotalSeconds) || 0)),
          progressPercent:
            assignment?.progressPercent == null
              ? null
              : Math.max(0, Math.min(100, Number(assignment.progressPercent) || 0)),
          visiblePlannedStTotalSeconds: 0,
          isCompleted: Boolean(assignment?.isCompleted),
          completedAt: normalizeDateKey(assignment?.completedAt),
          productionCompletedAt: normalizeDateKey(assignment?.productionCompletedAt),
          actualProducedCompletedAt: normalizeDateKey(assignment?.actualProducedCompletedAt),
          candidateEndDate: normalizeDateKey(assignment?.candidateEndDate),
          renderEndDate: normalizeDateKey(assignment?.renderEndDate),
          forecastCompletedAt: normalizeDateKey(assignment?.forecastCompletedAt),
          firstWorkDate: normalizeDateKey(assignment?.firstWorkDate),
          lastWorkDate: normalizeDateKey(assignment?.lastWorkDate),
          elapsedDays:
            assignment?.elapsedDays == null
              ? null
              : Math.max(0, Number(assignment.elapsedDays) || 0),
          confidence: assignment?.confidence || null,
          forecastBasis: assignment?.forecastBasis || null,
          hasOrphanWorkRecords: Boolean(assignment?.hasOrphanWorkRecords),
          sourceOrderIndex,
        };
      })
      .sort((left, right) => {
        const leftStartIndex =
          left.startIndex == null ? Number.MAX_SAFE_INTEGER : Number(left.startIndex);
        const rightStartIndex =
          right.startIndex == null ? Number.MAX_SAFE_INTEGER : Number(right.startIndex);
        if (leftStartIndex !== rightStartIndex) {
          return leftStartIndex - rightStartIndex;
        }
        const leftEndIndex =
          left.endIndex == null ? leftStartIndex : Number(left.endIndex);
        const rightEndIndex =
          right.endIndex == null ? rightStartIndex : Number(right.endIndex);
        if (leftEndIndex !== rightEndIndex) {
          return leftEndIndex - rightEndIndex;
        }
        if (left.sourceOrderIndex !== right.sourceOrderIndex) {
          return left.sourceOrderIndex - right.sourceOrderIndex;
        }
        return String(left.id || '').localeCompare(String(right.id || ''), undefined, {
          numeric: true,
        });
      });

    const lineBackendRows = backendRowsByLineId.get(lineId) || [];
    const internalMonthKeys = Array.from(
      new Set([
        ...lineBackendRows
          .map((row) => normalizeMonthKey(row?.monthKey))
          .filter(Boolean),
        ...normalizedPlanningMonthKeys,
      ])
    ).sort((left, right) => left.localeCompare(right));
    const forecastAnchorDateKey = lineMeta?.forecastAnchorDateKey || null;
    const forecastAnchorMonthKey = normalizeMonthKey(
      forecastAnchorDateKey ? forecastAnchorDateKey.slice(0, 7) : ''
    );
    const currentBoardRemainingBacklogStSeconds = assignmentsForLine.reduce(
      (sum, assignment) => {
        if (assignment?.isCompleted) return sum;
        return sum + Math.max(0, resolveAssignmentForecastStTotalSeconds(assignment) || 0);
      },
      0
    );
    const currentBoardStUnknownAssignmentCount = assignmentsForLine.reduce(
      (count, assignment) => {
        if (assignment?.isCompleted) return count;
        return resolveAssignmentForecastStTotalSeconds(assignment) == null ? count + 1 : count;
      },
      0
    );
    const monthSummaryByKey = new Map();
    let previousCarryOutStSeconds = 0;
    internalMonthKeys.forEach((monthKey) => {
      const backendRow = backendRowByKey.get(`${lineId}:${monthKey}`) || null;
      const lineMonthlyCapacitySeconds =
        Number(backendRow?.lineMonthlyCapacitySeconds) > 0
          ? Math.round(Number(backendRow.lineMonthlyCapacitySeconds))
          : buildFallbackLineMonthlyCapacitySeconds(line, monthKey, holidaySet);
      const lineMonthlyActualOutputStSeconds = Math.max(
        0,
        Math.round(Number(backendRow?.lineMonthlyActualOutputStSeconds) || 0)
      );
      const latestActualCoverageEndDateKey =
        normalizeDateKey(backendRow?.latestActualCoverageEndDateKey) ||
        lineMeta?.latestActualCoverageEndDateKey ||
        null;
      const actualOutputRecordedThroughDateKey =
        normalizeDateKey(backendRow?.actualOutputRecordedThroughDateKey) || null;
      const rowForecastAnchorDateKey =
        normalizeDateKey(backendRow?.forecastAnchorDateKey) || forecastAnchorDateKey;
      const inferredMonthType =
        forecastAnchorMonthKey && monthKey >= forecastAnchorMonthKey
          ? monthKey === forecastAnchorMonthKey
            ? 'anchor'
            : 'forecast'
          : 'historical';
      const forecastAvailableCapacitySeconds =
        inferredMonthType === 'historical'
          ? 0
          : backendRow?.forecastAvailableCapacitySeconds == null
            ? lineMonthlyCapacitySeconds
            : Math.max(
                0,
                Math.round(Number(backendRow.forecastAvailableCapacitySeconds) || 0)
              );
      const forecastWorkingDayCount =
        inferredMonthType === 'historical'
          ? 0
          : Math.max(0, Math.round(Number(backendRow?.forecastWorkingDayCount) || 0));
      const carryInStSeconds = inferredMonthType === 'forecast' ? previousCarryOutStSeconds : 0;
      const backlogEnteringStSeconds =
        inferredMonthType === 'anchor'
          ? currentBoardRemainingBacklogStSeconds
          : inferredMonthType === 'forecast'
            ? carryInStSeconds
            : 0;
      const forecastLoadStSeconds =
        inferredMonthType === 'historical'
          ? 0
          : Math.max(
              0,
              Math.min(backlogEnteringStSeconds, forecastAvailableCapacitySeconds)
            );
      const carryOutStSeconds =
        inferredMonthType === 'historical'
          ? 0
          : Math.max(0, backlogEnteringStSeconds - forecastAvailableCapacitySeconds);
      if (inferredMonthType !== 'historical') {
        previousCarryOutStSeconds = carryOutStSeconds;
      }
      const totalEstimatedLoadStSeconds =
        inferredMonthType === 'historical'
          ? lineMonthlyActualOutputStSeconds
          : lineMonthlyActualOutputStSeconds + forecastLoadStSeconds;
      const { forecastWindowStartDateKey, forecastWindowEndDateKey } =
        resolveForecastWindowRange({
          monthKey,
          monthType: inferredMonthType,
          forecastAnchorDateKey: rowForecastAnchorDateKey || null,
        });
      const carryOutDateKey = resolveCarryOutDateKey({
        monthKey,
        carryOutStSeconds,
        holidaySet,
      });
      monthSummaryByKey.set(monthKey, {
        lineId,
        monthKey,
        workingDayCount: Math.max(
          0,
          Math.round(Number(backendRow?.workingDayCount) || 0)
        ),
        averageHeadcount: Number(backendRow?.averageHeadcount) || 0,
        orphanWorkRecordCount: Math.max(
          0,
          Math.round(Number(backendRow?.orphanWorkRecordCount) || 0)
        ),
        lineMonthlyCapacitySeconds,
        lineMonthlyActualOutputStSeconds,
        actualOutputPercent:
          backendRow?.actualOutputPercent != null
            ? Number(backendRow.actualOutputPercent)
            : roundPercent(
                lineMonthlyActualOutputStSeconds,
                lineMonthlyCapacitySeconds
              ),
        actualOutputRecordedThroughDateKey,
        latestActualCoverageEndDateKey,
        forecastAnchorDateKey: rowForecastAnchorDateKey || null,
        forecastWindowStartDateKey,
        forecastWindowEndDateKey,
        forecastAvailableCapacitySeconds,
        forecastWorkingDayCount,
        forecastLoadStSeconds,
        plannedLoadPercent: roundPercent(
          forecastLoadStSeconds,
          inferredMonthType === 'historical'
            ? lineMonthlyCapacitySeconds
            : forecastAvailableCapacitySeconds
        ),
        carryInStSeconds,
        carryOutStSeconds,
        carryOutDateKey,
        totalEstimatedLoadStSeconds,
        totalEstimatedLoadPercent: roundPercent(
          totalEstimatedLoadStSeconds,
          lineMonthlyCapacitySeconds
        ),
        monthType: inferredMonthType,
        isAnchorMonth: inferredMonthType === 'anchor',
        isForecastMonth:
          inferredMonthType === 'anchor' || inferredMonthType === 'forecast',
        isHistoricalMonth: inferredMonthType === 'historical',
      });
    });
    const months = monthKeysForDisplay.map((monthKey) => {
      const summary = monthSummaryByKey.get(monthKey);
      if (summary) return summary;
      const backendRow = backendRowByKey.get(`${lineId}:${monthKey}`) || null;
      const lineMonthlyCapacitySeconds =
        Number(backendRow?.lineMonthlyCapacitySeconds) > 0
          ? Math.round(Number(backendRow.lineMonthlyCapacitySeconds))
          : buildFallbackLineMonthlyCapacitySeconds(line, monthKey, holidaySet);
      const lineMonthlyActualOutputStSeconds = Math.max(
        0,
        Math.round(Number(backendRow?.lineMonthlyActualOutputStSeconds) || 0)
      );
      return {
        lineId,
        monthKey,
        workingDayCount: Math.max(
          0,
          Math.round(Number(backendRow?.workingDayCount) || 0)
        ),
        averageHeadcount: Number(backendRow?.averageHeadcount) || 0,
        orphanWorkRecordCount: Math.max(
          0,
          Math.round(Number(backendRow?.orphanWorkRecordCount) || 0)
        ),
        lineMonthlyCapacitySeconds,
        lineMonthlyActualOutputStSeconds,
        actualOutputPercent:
          backendRow?.actualOutputPercent != null
            ? Number(backendRow.actualOutputPercent)
            : roundPercent(
                lineMonthlyActualOutputStSeconds,
                lineMonthlyCapacitySeconds
              ),
        actualOutputRecordedThroughDateKey:
          normalizeDateKey(backendRow?.actualOutputRecordedThroughDateKey) || null,
        latestActualCoverageEndDateKey:
          normalizeDateKey(backendRow?.latestActualCoverageEndDateKey) ||
          lineMeta?.latestActualCoverageEndDateKey ||
          null,
        forecastAnchorDateKey:
          normalizeDateKey(backendRow?.forecastAnchorDateKey) ||
          forecastAnchorDateKey ||
          null,
        forecastWindowStartDateKey: '',
        forecastWindowEndDateKey: '',
        forecastAvailableCapacitySeconds: 0,
        forecastWorkingDayCount: 0,
        forecastLoadStSeconds: 0,
        plannedLoadPercent: 0,
        carryInStSeconds: 0,
        carryOutStSeconds: 0,
        carryOutDateKey: '',
        totalEstimatedLoadStSeconds: lineMonthlyActualOutputStSeconds,
        totalEstimatedLoadPercent: roundPercent(
          lineMonthlyActualOutputStSeconds,
          lineMonthlyCapacitySeconds
        ),
        monthType: 'historical',
        isAnchorMonth: false,
        isForecastMonth: false,
        isHistoricalMonth: true,
      };
    });

    const queueForecast = buildLineQueueForecast({
      assignments: assignmentsForLine,
      line,
      holidaySet,
      todayDateKey,
      anchorDateKey: lineMeta?.forecastAnchorDateKey || null,
    });

    return {
      lineId,
      lineName: line?.name || `Line ${lineId}`,
      headcount: Math.max(0, Math.round(Number(line?.headcount) || 0)),
      latestActualCoverageEndDateKey: lineMeta?.latestActualCoverageEndDateKey || null,
      forecastAnchorDateKey: forecastAnchorDateKey,
      lineRemainingBacklogStSeconds: queueForecast.totalRemainingStTotalSeconds,
      stUnknownAssignmentCount: currentBoardStUnknownAssignmentCount,
      dailyCapacitySeconds: queueForecast.dailyCapacitySeconds,
      totalRemainingStTotalSeconds: queueForecast.totalRemainingStTotalSeconds,
      queueBacklogDays: queueForecast.queueBacklogDays,
      lineFreeDateKey: queueForecast.lineFreeDateKey || null,
      activeAssignmentCount: queueForecast.queuedAssignments.length,
      completedAssignmentCount: queueForecast.completedCount,
      readyToCompleteAssignmentCount: queueForecast.readyToCompleteCount,
      finishedAssignmentCount: queueForecast.completedAssignments.length,
      months,
      assignments: assignmentsForLine,
      queuedAssignments: queueForecast.queuedAssignments,
      completedAssignments: queueForecast.completedAssignments,
    };
  });
};
