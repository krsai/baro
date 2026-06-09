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
  const lineBackendMetaByLineId = new Map();
  (Array.isArray(backendRows) ? backendRows : []).forEach((row) => {
    const lineId = String(row?.lineId || '').trim();
    if (!lineId || lineBackendMetaByLineId.has(lineId)) return;
    lineBackendMetaByLineId.set(lineId, {
      latestActualCoverageEndDateKey: normalizeDateKey(row?.latestActualCoverageEndDateKey),
      forecastAnchorDateKey: normalizeDateKey(row?.forecastAnchorDateKey),
      lineRemainingBacklogStSeconds:
        row?.lineRemainingBacklogStSeconds == null
          ? null
          : Math.max(0, Math.round(Number(row.lineRemainingBacklogStSeconds) || 0)),
      stUnknownAssignmentCount: Math.max(
        0,
        Math.round(Number(row?.stUnknownAssignmentCount) || 0)
      ),
    });
  });

  return (Array.isArray(lines) ? lines : []).map((line) => {
    const lineId = String(line?.id || '').trim();
    const lineMeta = lineBackendMetaByLineId.get(lineId) || null;
    const months = monthKeysForDisplay.map((monthKey) => {
      const backendRow = backendRowByKey.get(`${lineId}:${monthKey}`) || null;
      const lineMonthlyCapacitySeconds =
        Number(backendRow?.lineMonthlyCapacitySeconds) > 0
          ? Math.round(Number(backendRow.lineMonthlyCapacitySeconds))
          : buildFallbackLineMonthlyCapacitySeconds(line, monthKey, holidaySet);
      const lineMonthlyActualOutputStSeconds = Math.max(
        0,
        Math.round(Number(backendRow?.lineMonthlyActualOutputStSeconds) || 0)
      );
      const forecastLoadStSeconds = Math.max(
        0,
        Math.round(Number(backendRow?.forecastLoadStSeconds) || 0)
      );
      const totalEstimatedLoadStSeconds = Math.max(
        lineMonthlyActualOutputStSeconds,
        Math.round(
          Number(
            backendRow?.totalEstimatedLoadStSeconds ??
              lineMonthlyActualOutputStSeconds + forecastLoadStSeconds
          ) || 0
        )
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
        latestActualCoverageEndDateKey:
          normalizeDateKey(backendRow?.latestActualCoverageEndDateKey) ||
          lineMeta?.latestActualCoverageEndDateKey ||
          null,
        forecastAnchorDateKey:
          normalizeDateKey(backendRow?.forecastAnchorDateKey) ||
          lineMeta?.forecastAnchorDateKey ||
          null,
        forecastAvailableCapacitySeconds:
          backendRow?.forecastAvailableCapacitySeconds == null
            ? lineMonthlyCapacitySeconds
            : Math.max(
                0,
                Math.round(Number(backendRow.forecastAvailableCapacitySeconds) || 0)
              ),
        forecastWorkingDayCount: Math.max(
          0,
          Math.round(Number(backendRow?.forecastWorkingDayCount) || 0)
        ),
        forecastLoadStSeconds,
        plannedLoadPercent:
          backendRow?.forecastLoadPercent != null
            ? Number(backendRow.forecastLoadPercent)
            : roundPercent(forecastLoadStSeconds, lineMonthlyCapacitySeconds),
        carryInStSeconds: Math.max(
          0,
          Math.round(Number(backendRow?.carryInStSeconds) || 0)
        ),
        carryOutStSeconds: Math.max(
          0,
          Math.round(Number(backendRow?.carryOutStSeconds) || 0)
        ),
        totalEstimatedLoadStSeconds,
        totalEstimatedLoadPercent:
          backendRow?.totalEstimatedLoadPercent != null
            ? Number(backendRow.totalEstimatedLoadPercent)
            : roundPercent(totalEstimatedLoadStSeconds, lineMonthlyCapacitySeconds),
        monthType: backendRow?.monthType || 'historical',
        isAnchorMonth: backendRow?.monthType === 'anchor',
        isForecastMonth:
          backendRow?.monthType === 'anchor' || backendRow?.monthType === 'forecast',
        isHistoricalMonth:
          !backendRow?.monthType || backendRow?.monthType === 'historical',
      };
    });

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
      forecastAnchorDateKey: lineMeta?.forecastAnchorDateKey || null,
      lineRemainingBacklogStSeconds:
        lineMeta?.lineRemainingBacklogStSeconds ?? queueForecast.totalRemainingStTotalSeconds,
      stUnknownAssignmentCount: lineMeta?.stUnknownAssignmentCount || 0,
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
