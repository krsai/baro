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

const resolveAssignmentScheduleRange = (assignment) => {
  const startDateKey = normalizeDateKey(assignment?.startDateKey);
  const endDateKey = normalizeDateKey(assignment?.endDateKey);
  if (!startDateKey || !endDateKey || startDateKey > endDateKey) return null;
  return { startDateKey, endDateKey };
};

export const resolvePlanningMonthKeys = ({
  assignments,
  visibleMonthKeys,
  maxMonthSpan = MAX_PLANNING_MONTH_SPAN,
}) => {
  const normalizedVisibleMonthKeys = (Array.isArray(visibleMonthKeys) ? visibleMonthKeys : [])
    .map((monthKey) => normalizeMonthKey(monthKey))
    .filter(Boolean);
  if (normalizedVisibleMonthKeys.length === 0) return [];
  const visibleStartMonthKey = normalizedVisibleMonthKeys[0];
  const visibleEndMonthKey =
    normalizedVisibleMonthKeys[normalizedVisibleMonthKeys.length - 1];
  const eligibleStartMonthKeys = (Array.isArray(assignments) ? assignments : [])
    .filter((assignment) => {
      const scheduleRange = resolveAssignmentScheduleRange(assignment);
      if (!scheduleRange) return false;
      const plannedStTotalSeconds = Number(
        assignment?.plannedStTotalSeconds ?? assignment?.stTotalSeconds
      );
      if (!Number.isFinite(plannedStTotalSeconds) || plannedStTotalSeconds <= 0) {
        return false;
      }
      if (assignment?.isCompleted) {
        return scheduleRange.endDateKey.slice(0, 7) >= visibleStartMonthKey;
      }
      return true;
    })
    .map((assignment) => normalizeMonthKey(String(assignment?.startDateKey || '').slice(0, 7)))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
  const earliestMonthKey =
    eligibleStartMonthKeys[0] && eligibleStartMonthKeys[0] < visibleStartMonthKey
      ? eligibleStartMonthKeys[0]
      : visibleStartMonthKey;
  let planningMonthKeys = buildMonthKeyRange(earliestMonthKey, visibleEndMonthKey);
  if (planningMonthKeys.length > maxMonthSpan) {
    planningMonthKeys = planningMonthKeys.slice(planningMonthKeys.length - maxMonthSpan);
  }
  return planningMonthKeys;
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
}) => {
  const normalizedPlanningMonthKeys = (Array.isArray(planningMonthKeys) ? planningMonthKeys : [])
    .map((monthKey) => normalizeMonthKey(monthKey))
    .filter(Boolean);
  const normalizedVisibleMonthKeys = (Array.isArray(visibleMonthKeys) ? visibleMonthKeys : [])
    .map((monthKey) => normalizeMonthKey(monthKey))
    .filter(Boolean);
  const backendRowByKey = new Map(
    (Array.isArray(backendRows) ? backendRows : [])
      .map((row) => {
        const lineId = String(row?.lineId || '').trim();
        const monthKey = normalizeMonthKey(row?.monthKey);
        return lineId && monthKey ? [`${lineId}:${monthKey}`, row] : null;
      })
      .filter(Boolean)
  );
  const visibleMonthKeySet = new Set(normalizedVisibleMonthKeys);
  const assignmentPlannedByLineMonthKey = new Map();
  const assignmentVisiblePlanById = new Map();

  (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
    const assignmentId = String(assignment?.id || '').trim();
    const lineId = String(assignment?.lineId || '').trim();
    const scheduleRange = resolveAssignmentScheduleRange(assignment);
    const plannedStTotalSeconds = Math.max(
      0,
      Math.round(Number(assignment?.plannedStTotalSeconds ?? assignment?.stTotalSeconds) || 0)
    );
    if (!lineId || !scheduleRange || plannedStTotalSeconds <= 0) return;
    const weightedRows = buildMonthWeightRows({
      startDateKey: scheduleRange.startDateKey,
      endDateKey: scheduleRange.endDateKey,
      monthKeys: normalizedPlanningMonthKeys,
      holidaySet,
    });
    const allocations = distributeIntegerTotalByWeights({
      total: plannedStTotalSeconds,
      weightedRows,
    });
    let visiblePlannedStTotalSeconds = 0;
    allocations.forEach(({ monthKey, allocatedTotal }) => {
      const compositeKey = `${lineId}:${monthKey}`;
      assignmentPlannedByLineMonthKey.set(
        compositeKey,
        (assignmentPlannedByLineMonthKey.get(compositeKey) || 0) + allocatedTotal
      );
      if (visibleMonthKeySet.has(monthKey)) {
        visiblePlannedStTotalSeconds += allocatedTotal;
      }
    });
    if (assignmentId) {
      assignmentVisiblePlanById.set(assignmentId, visiblePlannedStTotalSeconds);
    }
  });

  return (Array.isArray(lines) ? lines : []).map((line) => {
    const lineId = String(line?.id || '').trim();
    let previousCarryOutStSeconds = 0;
    const months = normalizedPlanningMonthKeys.map((monthKey) => {
      const backendRow = backendRowByKey.get(`${lineId}:${monthKey}`) || null;
      const lineMonthlyCapacitySeconds =
        Number(backendRow?.lineMonthlyCapacitySeconds) > 0
          ? Math.round(Number(backendRow.lineMonthlyCapacitySeconds))
          : buildFallbackLineMonthlyCapacitySeconds(line, monthKey, holidaySet);
      const lineMonthlyActualOutputStSeconds = Math.max(
        0,
        Math.round(Number(backendRow?.lineMonthlyActualOutputStSeconds) || 0)
      );
      const carryInStSeconds = previousCarryOutStSeconds;
      const newPlannedStSeconds = Math.max(
        0,
        Math.round(Number(assignmentPlannedByLineMonthKey.get(`${lineId}:${monthKey}`) || 0))
      );
      const lineMonthlyPlannedLoadStSeconds =
        carryInStSeconds + newPlannedStSeconds;
      const carryOutStSeconds = Math.max(
        0,
        lineMonthlyPlannedLoadStSeconds - lineMonthlyActualOutputStSeconds
      );
      previousCarryOutStSeconds = carryOutStSeconds;
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
        carryInStSeconds,
        newPlannedStSeconds,
        lineMonthlyPlannedLoadStSeconds,
        plannedLoadPercent: roundPercent(
          lineMonthlyPlannedLoadStSeconds,
          lineMonthlyCapacitySeconds
        ),
        carryOutStSeconds,
        overflowStSeconds: Math.max(
          0,
          lineMonthlyPlannedLoadStSeconds - lineMonthlyCapacitySeconds
        ),
      };
    });

    const assignmentsForLine = (Array.isArray(assignments) ? assignments : [])
      .filter((assignment) => String(assignment?.lineId || '').trim() === lineId)
      .map((assignment) => {
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
          plannedStTotalSeconds: Math.max(
            0,
            Math.round(Number(assignment?.plannedStTotalSeconds ?? assignment?.stTotalSeconds) || 0)
          ),
          remainingStTotalSeconds:
            assignment?.remainingStTotalSeconds == null
              ? null
              : Math.max(0, Math.round(Number(assignment.remainingStTotalSeconds) || 0)),
          progressPercent:
            assignment?.progressPercent == null
              ? null
              : Math.max(0, Math.min(100, Number(assignment.progressPercent) || 0)),
          visiblePlannedStTotalSeconds:
            assignmentVisiblePlanById.get(assignmentId) || 0,
          isCompleted: Boolean(assignment?.isCompleted),
          hasOrphanWorkRecords: Boolean(assignment?.hasOrphanWorkRecords),
        };
      })
      .sort((left, right) => {
        if (left.startDateKey !== right.startDateKey) {
          return String(left.startDateKey || '').localeCompare(String(right.startDateKey || ''));
        }
        return String(left.id || '').localeCompare(String(right.id || ''), undefined, {
          numeric: true,
        });
      });

    return {
      lineId,
      lineName: line?.name || `Line ${lineId}`,
      headcount: Math.max(0, Math.round(Number(line?.headcount) || 0)),
      months: months.filter((row) => visibleMonthKeySet.has(row.monthKey)),
      assignments: assignmentsForLine,
    };
  });
};
