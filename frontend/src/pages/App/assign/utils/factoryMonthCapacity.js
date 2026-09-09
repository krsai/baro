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

const resolveFactoryScopeDailyCapacitySeconds = (factoryScope) => {
  const explicitDailyCapacity = Number(factoryScope?.dailyCapacitySeconds);
  if (Number.isFinite(explicitDailyCapacity) && explicitDailyCapacity > 0) {
    return Math.round(explicitDailyCapacity);
  }
  const headcount = Math.max(0, Math.round(Number(factoryScope?.headcount) || 0));
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

const buildFactoryScopeQueueForecast = ({
  assignments,
  factoryScope,
  holidaySet,
  todayDateKey,
  anchorDateKey,
  // When provided (non-null), this replaces the per-card sum below as the basis for
  // totalRequiredWorkingDays/lineFreeDateKey/queueBacklogDays. Callers pass the
  // backend's lineRemainingBacklogStSeconds here so the line summary row's "완료
  // 예상" agrees with the per-month plannedLoadPercent cells, which are seeded from
  // the same backend value - see buildFactoryMonthCapacityBoardRows.
  remainingBacklogStSecondsOverride = null,
}) => {
  const normalizedAnchorDateKey =
    normalizeDateKey(anchorDateKey) ||
    normalizeDateKey(todayDateKey) ||
    new Date().toISOString().slice(0, 10);
  const dailyCapacitySeconds = resolveFactoryScopeDailyCapacitySeconds(factoryScope);
  const queuedAssignments = [];
  const reviewRequiredAssignments = [];
  const completedAssignments = [];
  const zeroQuantityOverflowAssignments = [];
  let queuedCount = 0;
  let completedCount = 0;
  let reviewRequiredCount = 0;
  let zeroQuantityOverflowCount = 0;

  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    // A style dropped from its order while already worked is kept at
    // quantity 0 instead of being deleted (AGENTS.md 40번). It never counts
    // as queued/review/ready/completed capacity - it sits in its own
    // "needs review" bucket until every linked work-record month is
    // payroll-settled, at which point it drops out entirely.
    if (
      Boolean(assignment?.isZeroQuantityOverflow) &&
      !Boolean(assignment?.isFullyPayrollSettled)
    ) {
      zeroQuantityOverflowCount += 1;
      zeroQuantityOverflowAssignments.push({
        ...assignment,
        queuePosition: zeroQuantityOverflowCount,
        queueStatus: 'zero_quantity_overflow',
      });
      return;
    }

    const isCompleted = Boolean(assignment?.isCompleted);
    const scheduleStatus = String(assignment?.scheduleStatus || '').trim();
    const isStUnknown = Boolean(assignment?.isStUnknown) && !isCompleted;
    const isProgressUnknown = Boolean(assignment?.isProgressUnknown) && !isCompleted;
    // Shares resolveAssignmentForecastStTotalSeconds with the line-level backlog sum
    // above so a card's own displayed remaining time can never disagree with what the
    // line total was built from (previously this duplicated the same fallback chain
    // and, unlike the line-level sum, did not know about isProgressUnknown at all).
    const remainingStTotalSeconds = resolveAssignmentForecastStTotalSeconds(assignment);
    const actualProducedCompletedAt = normalizeDateKey(
      assignment?.actualProducedCompletedAt
    );
    const productionCompletedAt = normalizeDateKey(
      assignment?.productionCompletedAt
    );
    const persistedCompletedAt =
      productionCompletedAt || normalizeDateKey(assignment?.completedAt);
    const completedAt = persistedCompletedAt || actualProducedCompletedAt || null;
    const isReviewRequired = !isCompleted && scheduleStatus === 'REVIEW_REQUIRED';
    const elapsedDays = Math.max(0, Number(assignment?.elapsedDays) || 0);
    const baseAssignment = {
      ...assignment,
      remainingStTotalSeconds,
      isStUnknown,
      isProgressUnknown,
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
    if (isReviewRequired) {
      reviewRequiredCount += 1;
      reviewRequiredAssignments.push({
        ...baseAssignment,
        queuePosition: reviewRequiredCount,
        queueStatus: 'review_required',
        estimatedRemainingWorkDays: 0,
        forecastStartDateKey: null,
        forecastEndDateKey: completedAt || null,
      });
      return;
    }

    const estimatedRemainingWorkDays =
      remainingStTotalSeconds == null
        ? null
        : roundDaysEstimate(remainingStTotalSeconds, dailyCapacitySeconds);

    queuedCount += 1;
    queuedAssignments.push({
      ...baseAssignment,
      queuePosition: queuedCount,
      queueStatus: isReviewRequired ? 'review_required' : 'queued',
      estimatedRemainingWorkDays,
      forecastStartDateKey: null,
      forecastEndDateKey: null,
    });
  });

  const liveQueuedRemainingStTotalSeconds = queuedAssignments.reduce(
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
  const totalRemainingStTotalSeconds =
    remainingBacklogStSecondsOverride != null
      ? Math.max(0, Math.round(Number(remainingBacklogStSecondsOverride) || 0))
      : liveQueuedRemainingStTotalSeconds;
  const totalRequiredWorkingDays =
    dailyCapacitySeconds > 0
      ? Math.max(1, Math.ceil(totalRemainingStTotalSeconds / dailyCapacitySeconds))
      : 0;
  const factoryScopeFreeDateKey =
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
    reviewRequiredAssignments,
    completedAssignments,
    completedCount,
    reviewRequiredCount,
    totalRemainingStTotalSeconds,
    queueBacklogDays: roundDaysEstimate(totalRemainingStTotalSeconds, dailyCapacitySeconds),
    factoryScopeFreeDateKey,
    zeroQuantityOverflowAssignments,
    zeroQuantityOverflowCount,
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

const resolveAssignmentForecastStTotalSeconds = (assignment) => {
  if (Boolean(assignment?.isCompleted)) {
    return assignment?.remainingStTotalSeconds != null
      ? Math.max(0, Math.round(Number(assignment.remainingStTotalSeconds) || 0))
      : 0;
  }
  if (Boolean(assignment?.isStUnknown)) {
    return null;
  }
  // Set by the backend when this plan has actual recorded work but its progress
  // ratio could not be resolved (assignmentCtSnapshot gap - see AGENTS.md /
  // isProgressUnknown). Falling back to plannedStTotalSeconds/stTotalSeconds here is
  // exactly the bug this flag exists to prevent: it silently re-treats a plan that
  // may already be 90%+ done as "0% done", inflating the whole line's forecast by
  // months. Exclude it from the sum instead - the caller counts these separately.
  if (Boolean(assignment?.isProgressUnknown)) {
    return null;
  }
  // remainingStTotalSeconds is only allowed to be missing here for an assignment
  // that never had a progress row resolved at all (e.g. a brand-new assignment with
  // no work records yet) - in that case planned ST is the correct "0% done" value.
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

export const buildFactoryMonthCapacityBoardRows = ({
  factoryScopes,
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
        const factoryId = String(row?.factoryId || '').trim();
        const monthKey = normalizeMonthKey(row?.monthKey);
        return factoryId && monthKey ? [`${factoryId}:${monthKey}`, row] : null;
      })
      .filter(Boolean)
  );
  const backendRowsByFactoryId = new Map();
  (Array.isArray(backendRows) ? backendRows : []).forEach((row) => {
    const factoryId = String(row?.factoryId || '').trim();
    if (!factoryId) return;
    const current = backendRowsByFactoryId.get(factoryId) || [];
    current.push(row);
    backendRowsByFactoryId.set(factoryId, current);
  });
  backendRowsByFactoryId.forEach((rows, factoryId) => {
    rows.sort((left, right) =>
      String(left?.monthKey || '').localeCompare(String(right?.monthKey || ''))
    );
  });
  const factoryScopeBackendMetaByFactoryId = new Map();
  backendRowsByFactoryId.forEach((rows, factoryId) => {
    const sourceRow = rows[0] || null;
    factoryScopeBackendMetaByFactoryId.set(factoryId, {
      latestActualCoverageEndDateKey: normalizeDateKey(sourceRow?.latestActualCoverageEndDateKey),
      forecastAnchorDateKey: normalizeDateKey(sourceRow?.forecastAnchorDateKey),
      factoryScopeRemainingBacklogStSeconds:
        sourceRow?.factoryScopeRemainingBacklogStSeconds == null
          ? null
          : Math.max(0, Math.round(Number(sourceRow.factoryScopeRemainingBacklogStSeconds) || 0)),
      stUnknownAssignmentCount: Math.max(
        0,
        Math.round(Number(sourceRow?.stUnknownAssignmentCount) || 0)
      ),
      progressUnknownAssignmentCount: Math.max(
        0,
        Math.round(Number(sourceRow?.progressUnknownAssignmentCount) || 0)
      ),
    });
  });

  return (Array.isArray(factoryScopes) ? factoryScopes : []).map((factoryScope) => {
    const factoryId = String(factoryScope?.id || '').trim();
    const factoryScopeMeta = factoryScopeBackendMetaByFactoryId.get(factoryId) || null;
    const assignmentsForFactoryScope = (Array.isArray(assignments) ? assignments : [])
      .filter((assignment) => String(assignment?.factoryId || '').trim() === factoryId)
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
          isStUnknown: Boolean(assignment?.isStUnknown),
          isProgressUnknown: Boolean(assignment?.isProgressUnknown),
          progressPercent:
            assignment?.progressPercent == null
              ? null
              : Math.max(0, Number(assignment.progressPercent) || 0),
          workProgressPercent:
            assignment?.workProgressPercent == null
              ? null
              : Math.max(0, Number(assignment.workProgressPercent) || 0),
          scheduleStatus: String(assignment?.scheduleStatus || '').trim() || null,
          reviewReason: assignment?.reviewReason || null,
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

    const factoryScopeBackendRows = backendRowsByFactoryId.get(factoryId) || [];
    // Forecast rows are server-owned calculations. Do not invent months that
    // the backend did not return; a missing response must remain unavailable.
    const internalMonthKeys = Array.from(
      new Set(
        factoryScopeBackendRows
          .map((row) => normalizeMonthKey(row?.monthKey))
          .filter(Boolean)
      )
    ).sort((left, right) => left.localeCompare(right));
    const forecastAnchorDateKey = factoryScopeMeta?.forecastAnchorDateKey || null;
    const forecastAnchorMonthKey = normalizeMonthKey(
      forecastAnchorDateKey ? forecastAnchorDateKey.slice(0, 7) : ''
    );
    // Live re-simulation from the current (possibly unsaved) board state. This is the
    // fallback source only - see resolvedRemainingBacklogStSeconds below. Kept because
    // it is still the only source for a line/month combo the backend response never
    // covered (e.g. backendRows fetch failed outright for this line).
    const liveBoardRemainingBacklogStSeconds = assignmentsForFactoryScope.reduce(
      (sum, assignment) => {
        if (assignment?.isCompleted) return sum;
        return sum + Math.max(0, resolveAssignmentForecastStTotalSeconds(assignment) || 0);
      },
      0
    );
    const liveBoardStUnknownAssignmentCount = assignmentsForFactoryScope.reduce(
      (count, assignment) => {
        if (assignment?.isCompleted) return count;
        return Boolean(assignment?.isStUnknown) ? count + 1 : count;
      },
      0
    );
    const liveBoardProgressUnknownAssignmentCount = assignmentsForFactoryScope.reduce(
      (count, assignment) => {
        if (assignment?.isCompleted) return count;
        return Boolean(assignment?.isProgressUnknown) ? count + 1 : count;
      },
      0
    );
    // The backend (buildFactoryMonthCapacityRows) computes this from actual WorkRecord
    // progress per assignment, the same source of truth used everywhere else on this
    // board (AGENTS.md: "실제 진행률 기반 remaining backlog의 소스오브트루스는
    // backend"). Prefer it whenever the API returned a value for this line; only fall
    // back to the live per-assignment re-simulation when the backend genuinely has no
    // data for this line (e.g. the /factory-month-capacity fetch failed). This trades
    // "anchor-month backlog reflects unsaved drag changes instantly" for "anchor-month
    // backlog can never silently balloon back to the full planned ST of an
    // already-mostly-produced assignment" - the latter was the actual bug (see
    // AGENTS.md), and the board still re-fetches /factory-month-capacity after every
    // save, so a save is enough to pick up drag changes.
    const currentBoardRemainingBacklogStSeconds =
      factoryScopeMeta?.factoryScopeRemainingBacklogStSeconds != null
        ? factoryScopeMeta.factoryScopeRemainingBacklogStSeconds
        : liveBoardRemainingBacklogStSeconds;
    const currentBoardStUnknownAssignmentCount =
      factoryScopeMeta != null
        ? factoryScopeMeta.stUnknownAssignmentCount
        : liveBoardStUnknownAssignmentCount;
    const currentBoardProgressUnknownAssignmentCount =
      factoryScopeMeta != null
        ? factoryScopeMeta.progressUnknownAssignmentCount
        : liveBoardProgressUnknownAssignmentCount;
    const monthSummaryByKey = new Map();
    let previousCarryOutStSeconds = 0;
    internalMonthKeys.forEach((monthKey) => {
      const backendRow = backendRowByKey.get(`${factoryId}:${monthKey}`) || null;
      const factoryMonthlyCapacitySeconds =
        Number(backendRow?.factoryMonthlyCapacitySeconds) > 0
          ? Math.round(Number(backendRow.factoryMonthlyCapacitySeconds))
          : 0;
      const factoryMonthlyActualOutputStSeconds = Math.max(
        0,
        Math.round(Number(backendRow?.factoryMonthlyActualOutputStSeconds) || 0)
      );
      const latestActualCoverageEndDateKey =
        normalizeDateKey(backendRow?.latestActualCoverageEndDateKey) ||
        factoryScopeMeta?.latestActualCoverageEndDateKey ||
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
            ? factoryMonthlyCapacitySeconds
            : Math.max(
                0,
                Math.round(Number(backendRow.forecastAvailableCapacitySeconds) || 0)
              );
      const forecastWorkingDayCount =
        inferredMonthType === 'historical'
          ? 0
          : Math.max(0, Math.round(Number(backendRow?.forecastWorkingDayCount) || 0));
      // Local re-simulation, used only as a fallback for a line/month the backend
      // response did not cover at all (e.g. the /factory-month-capacity fetch failed, or
      // this month is outside the requested range). previousCarryOutStSeconds always
      // advances from whichever value (backend or local) was actually used below, so
      // a mix of backend-covered and fallback months still chains correctly.
      const locallyComputedCarryInStSeconds =
        inferredMonthType === 'forecast' ? previousCarryOutStSeconds : 0;
      const locallyComputedBacklogEnteringStSeconds =
        inferredMonthType === 'anchor'
          ? currentBoardRemainingBacklogStSeconds
          : inferredMonthType === 'forecast'
            ? locallyComputedCarryInStSeconds
            : 0;
      const locallyComputedForecastLoadStSeconds =
        inferredMonthType === 'historical'
          ? 0
          : Math.max(
              0,
              Math.min(locallyComputedBacklogEnteringStSeconds, forecastAvailableCapacitySeconds)
            );
      const locallyComputedCarryOutStSeconds =
        inferredMonthType === 'historical'
          ? 0
          : Math.max(
              0,
              locallyComputedBacklogEnteringStSeconds - forecastAvailableCapacitySeconds
            );
      // buildFactoryMonthCapacityRows (backend/src/index.ts) runs this exact same
      // anchor-month + carry-forward simulation server-side, seeded from actual
      // WorkRecord progress. Prefer its numbers directly whenever this line/month was
      // covered by the API response, instead of trusting a second, independent
      // frontend implementation to never drift from it - the frontend one remains only
      // as a fallback for whatever the backend response did not cover.
      const carryInStSeconds =
        inferredMonthType === 'historical'
          ? 0
          : backendRow?.carryInStSeconds != null
            ? Math.max(0, Math.round(Number(backendRow.carryInStSeconds) || 0))
            : locallyComputedCarryInStSeconds;
      const forecastLoadStSeconds =
        inferredMonthType === 'historical'
          ? 0
          : backendRow?.forecastLoadStSeconds != null
            ? Math.max(0, Math.round(Number(backendRow.forecastLoadStSeconds) || 0))
            : locallyComputedForecastLoadStSeconds;
      const carryOutStSeconds =
        inferredMonthType === 'historical'
          ? 0
          : backendRow?.carryOutStSeconds != null
            ? Math.max(0, Math.round(Number(backendRow.carryOutStSeconds) || 0))
            : locallyComputedCarryOutStSeconds;
      if (inferredMonthType !== 'historical') {
        previousCarryOutStSeconds = carryOutStSeconds;
      }
      const totalEstimatedLoadStSeconds =
        inferredMonthType === 'historical'
          ? backendRow?.totalEstimatedLoadStSeconds != null
            ? Math.max(0, Math.round(Number(backendRow.totalEstimatedLoadStSeconds) || 0))
            : factoryMonthlyActualOutputStSeconds + currentBoardRemainingBacklogStSeconds
          : factoryMonthlyActualOutputStSeconds + forecastLoadStSeconds;
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
      const resolvedActualOutputPercent =
        backendRow?.actualOutputPercent != null
          ? Number(backendRow.actualOutputPercent)
          : roundPercent(factoryMonthlyActualOutputStSeconds, factoryMonthlyCapacitySeconds);
      monthSummaryByKey.set(monthKey, {
        factoryId,
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
        factoryMonthlyCapacitySeconds,
        factoryMonthlyActualOutputStSeconds,
        actualOutputPercent: resolvedActualOutputPercent,
        actualOutputRecordedThroughDateKey,
        latestActualCoverageEndDateKey,
        forecastAnchorDateKey: rowForecastAnchorDateKey || null,
        forecastWindowStartDateKey,
        forecastWindowEndDateKey,
        forecastAvailableCapacitySeconds,
        forecastWorkingDayCount,
        forecastLoadStSeconds,
        // Plan is capped at 100%. For historical months it combines actual output
        // with today's remaining assigned backlog, so sustained work that carries
        // into later months still shows the past month as fully loaded while actual
        // production remains an independent percentage.
        plannedLoadPercent:
          inferredMonthType === 'historical'
            ? (() => {
                const historicalPlanPercent =
                  backendRow?.totalEstimatedLoadPercent != null
                    ? Number(backendRow.totalEstimatedLoadPercent)
                    : roundPercent(totalEstimatedLoadStSeconds, factoryMonthlyCapacitySeconds);
                return historicalPlanPercent == null
                  ? null
                  : Math.min(100, Math.max(0, historicalPlanPercent));
              })()
            : backendRow?.forecastLoadPercent != null
              ? Math.min(100, Math.max(0, Number(backendRow.forecastLoadPercent) || 0))
              : (() => {
                  const localPercent = roundPercent(
                    forecastLoadStSeconds,
                    forecastAvailableCapacitySeconds
                  );
                  return localPercent == null ? null : Math.min(100, localPercent);
                })(),
        carryInStSeconds,
        carryOutStSeconds,
        carryOutDateKey,
        totalEstimatedLoadStSeconds,
        totalEstimatedLoadPercent: roundPercent(
          totalEstimatedLoadStSeconds,
          factoryMonthlyCapacitySeconds
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
      const backendRow = backendRowByKey.get(`${factoryId}:${monthKey}`) || null;
      const factoryMonthlyCapacitySeconds =
        Number(backendRow?.factoryMonthlyCapacitySeconds) > 0
          ? Math.round(Number(backendRow.factoryMonthlyCapacitySeconds))
          : 0;
      const factoryMonthlyActualOutputStSeconds = Math.max(
        0,
        Math.round(Number(backendRow?.factoryMonthlyActualOutputStSeconds) || 0)
      );
      const resolvedActualOutputPercent =
        backendRow?.actualOutputPercent != null
          ? Number(backendRow.actualOutputPercent)
          : roundPercent(factoryMonthlyActualOutputStSeconds, factoryMonthlyCapacitySeconds);
      return {
        factoryId,
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
        factoryMonthlyCapacitySeconds,
        factoryMonthlyActualOutputStSeconds,
        actualOutputPercent: resolvedActualOutputPercent,
        actualOutputRecordedThroughDateKey:
          normalizeDateKey(backendRow?.actualOutputRecordedThroughDateKey) || null,
        latestActualCoverageEndDateKey:
          normalizeDateKey(backendRow?.latestActualCoverageEndDateKey) ||
          factoryScopeMeta?.latestActualCoverageEndDateKey ||
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
        plannedLoadPercent: (() => {
          const historicalPlanPercent = roundPercent(
            factoryMonthlyActualOutputStSeconds + currentBoardRemainingBacklogStSeconds,
            factoryMonthlyCapacitySeconds
          );
          return historicalPlanPercent == null
            ? null
            : Math.min(100, Math.max(0, historicalPlanPercent));
        })(),
        carryInStSeconds: 0,
        carryOutStSeconds: 0,
        carryOutDateKey: '',
        totalEstimatedLoadStSeconds:
          factoryMonthlyActualOutputStSeconds + currentBoardRemainingBacklogStSeconds,
        totalEstimatedLoadPercent: roundPercent(
          factoryMonthlyActualOutputStSeconds + currentBoardRemainingBacklogStSeconds,
          factoryMonthlyCapacitySeconds
        ),
        monthType: 'historical',
        isAnchorMonth: false,
        isForecastMonth: false,
        isHistoricalMonth: true,
      };
    });

    const queueForecast = buildFactoryScopeQueueForecast({
      assignments: assignmentsForFactoryScope,
      factoryScope,
      holidaySet,
      todayDateKey,
      anchorDateKey: factoryScopeMeta?.forecastAnchorDateKey || null,
      remainingBacklogStSecondsOverride: currentBoardRemainingBacklogStSeconds,
    });

    return {
      factoryId,
      factoryName: factoryScope?.name || `Line ${factoryId}`,
      headcount: Math.max(0, Math.round(Number(factoryScope?.headcount) || 0)),
      latestActualCoverageEndDateKey: factoryScopeMeta?.latestActualCoverageEndDateKey || null,
      forecastAnchorDateKey: forecastAnchorDateKey,
      factoryScopeRemainingBacklogStSeconds: queueForecast.totalRemainingStTotalSeconds,
      stUnknownAssignmentCount: currentBoardStUnknownAssignmentCount,
      progressUnknownAssignmentCount: currentBoardProgressUnknownAssignmentCount,
      dailyCapacitySeconds: queueForecast.dailyCapacitySeconds,
      totalRemainingStTotalSeconds: queueForecast.totalRemainingStTotalSeconds,
      queueBacklogDays: queueForecast.queueBacklogDays,
      factoryScopeFreeDateKey: queueForecast.factoryScopeFreeDateKey || null,
      activeAssignmentCount: queueForecast.queuedAssignments.length,
      reviewRequiredAssignmentCount: queueForecast.reviewRequiredCount,
      completedAssignmentCount: queueForecast.completedCount,
      completionPendingAssignmentCount: queueForecast.reviewRequiredAssignments.length,
      finishedAssignmentCount: queueForecast.completedAssignments.length,
      zeroQuantityOverflowAssignmentCount: queueForecast.zeroQuantityOverflowAssignments.length,
      months,
      assignments: assignmentsForFactoryScope,
      queuedAssignments: queueForecast.queuedAssignments,
      reviewRequiredAssignments: queueForecast.reviewRequiredAssignments,
      completedAssignments: queueForecast.completedAssignments,
      zeroQuantityOverflowAssignments: queueForecast.zeroQuantityOverflowAssignments,
    };
  });
};
