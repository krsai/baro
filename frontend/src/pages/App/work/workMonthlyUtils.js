import dayjs from 'dayjs';

const SEWING_WORKER_ROLE_CODE = 'WORKER_SEWING';

export const normalizePositiveId = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
};

export const normalizeDateKey = (value) => {
  const text = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
};

export const normalizeMonthKey = (value) => {
  const text = String(value || '').trim().slice(0, 7);
  return /^\d{4}-\d{2}$/.test(text) ? text : '';
};

export const buildMonthRange = (value = dayjs()) => {
  const normalized = dayjs(value);
  const monthValue = normalized.isValid() ? normalized.startOf('month') : dayjs().startOf('month');
  return {
    monthValue,
    monthKey: monthValue.format('YYYY-MM'),
    dateFrom: monthValue.format('YYYY-MM-DD'),
    dateTo: monthValue.endOf('month').format('YYYY-MM-DD'),
  };
};

export const resolveEmploymentDateKey = (value) => {
  if (!value) return '';
  const normalizedText = normalizeDateKey(value);
  if (normalizedText) return normalizedText;
  const normalized = dayjs(value);
  return normalized.isValid() ? normalized.format('YYYY-MM-DD') : '';
};

const normalizeLabel = (value) => String(value || '').trim();

const normalizeRoleCode = (value) => normalizeLabel(value).toUpperCase();

const normalizeKoreanRoleName = (value) => normalizeLabel(value).replace(/\s+/g, '');

export const isSewingWorkerEmployee = (employee) => {
  const roleCode = normalizeRoleCode(employee?.roleCode || employee?.role?.code);
  if (roleCode === SEWING_WORKER_ROLE_CODE) return true;

  const roleName = normalizeKoreanRoleName(
    employee?.roleName || employee?.role?.name || employee?.position
  );
  return roleName === '봉제';
};

export const hasEmploymentDateOverlap = ({
  periodStart,
  periodEnd,
  joinedDateKey = '',
  leftDateKey = '',
}) => {
  const startKey = normalizeDateKey(periodStart);
  const endKey = normalizeDateKey(periodEnd);
  if (!startKey || !endKey || endKey < startKey) return false;

  const joinedKey = resolveEmploymentDateKey(joinedDateKey);
  const leftKey = resolveEmploymentDateKey(leftDateKey);
  if (joinedKey && joinedKey > endKey) return false;
  if (leftKey && leftKey < startKey) return false;
  return true;
};

export const isEligibleMonthlyWorker = (employee, monthRange) =>
  isSewingWorkerEmployee(employee) &&
  hasEmploymentDateOverlap({
    periodStart: monthRange?.dateFrom,
    periodEnd: monthRange?.dateTo,
    joinedDateKey: employee?.joinedAt,
    leftDateKey: employee?.leftAt,
  });

const incrementLabelCount = (counts, value) => {
  const label = normalizeLabel(value);
  if (!label) return;
  counts.set(label, (counts.get(label) || 0) + 1);
};

const resolveDominantLabel = (counts, fallback = '-') => {
  let winner = '';
  let winnerCount = -1;
  counts.forEach((count, label) => {
    if (count > winnerCount) {
      winner = label;
      winnerCount = count;
      return;
    }
    if (count === winnerCount && label.localeCompare(winner, 'ko') < 0) {
      winner = label;
    }
  });
  return winner || fallback;
};

export const hasWorkedAttendance = (row) => {
  const workedSeconds = Number(row?.workedSeconds);
  if (Number.isFinite(workedSeconds) && workedSeconds > 0) return true;
  if (String(row?.clockIn || '').trim()) return true;
  if (String(row?.clockOut || '').trim()) return true;
  return false;
};

export const buildAttendanceWorkedDateMap = (attendanceRows = []) => {
  const workedDateMap = new Map();

  (Array.isArray(attendanceRows) ? attendanceRows : []).forEach((row) => {
    const workerId = normalizePositiveId(row?.workerId);
    const workDate = normalizeDateKey(row?.workDate);
    if (!workerId || !workDate || !hasWorkedAttendance(row)) return;

    const key = String(workerId);
    if (!workedDateMap.has(key)) {
      workedDateMap.set(key, new Set());
    }
    workedDateMap.get(key).add(workDate);
  });

  return workedDateMap;
};

const isNonWorkingDate = (dateKey, holidaySet) => {
  const date = dayjs(dateKey);
  if (!date.isValid()) return true;
  if (date.day() === 0) return true;
  return holidaySet.has(dateKey);
};

export const countWorkingDaysForEmployment = ({
  monthStart,
  monthEnd,
  holidaySet,
  joinedDateKey = '',
  leftDateKey = '',
}) => {
  const start = dayjs(monthStart);
  const end = dayjs(monthEnd);
  if (!start.isValid() || !end.isValid() || end.isBefore(start, 'day')) return 0;

  let count = 0;
  let cursor = start.startOf('day');
  while (!cursor.isAfter(end, 'day')) {
    const dateKey = cursor.format('YYYY-MM-DD');
    if (joinedDateKey && dateKey < joinedDateKey) {
      cursor = cursor.add(1, 'day');
      continue;
    }
    if (leftDateKey && dateKey > leftDateKey) {
      cursor = cursor.add(1, 'day');
      continue;
    }
    if (!isNonWorkingDate(dateKey, holidaySet)) {
      count += 1;
    }
    cursor = cursor.add(1, 'day');
  }

  return count;
};

const maxDateKey = (...values) => {
  const dateKeys = values.map((value) => normalizeDateKey(value)).filter(Boolean).sort();
  return dateKeys[dateKeys.length - 1] || '';
};

const minDateKey = (...values) =>
  values.map((value) => normalizeDateKey(value)).filter(Boolean).sort()[0] || '';

const addWorkingDateRange = ({
  targetDates,
  startDateKey,
  endDateKey,
  monthRange,
  holidaySet,
  joinedDateKey = '',
  leftDateKey = '',
}) => {
  if (!targetDates || typeof targetDates.add !== 'function') return;
  const startKey = maxDateKey(startDateKey, monthRange?.dateFrom, joinedDateKey);
  const endKey = minDateKey(endDateKey, monthRange?.dateTo, leftDateKey);
  if (!startKey || !endKey || endKey < startKey) return;

  let cursor = dayjs(startKey);
  const end = dayjs(endKey);
  while (cursor.isValid() && !cursor.isAfter(end, 'day')) {
    const dateKey = cursor.format('YYYY-MM-DD');
    if (!isNonWorkingDate(dateKey, holidaySet)) {
      targetDates.add(dateKey);
    }
    cursor = cursor.add(1, 'day');
  }
};

const buildWorkerRowKey = (workerId, workerName = '') => {
  if (workerId) return `id:${workerId}`;
  const safeName = normalizeLabel(workerName).toLowerCase();
  return safeName ? `name:${safeName}` : '';
};

export const aggregateMonthlyWorkerRows = ({
  employees = [],
  logs = [],
  attendanceRows = [],
  holidayKeys = [],
  monthKey = '',
  factoryName = '',
}) => {
  const normalizedMonthKey = normalizeMonthKey(monthKey);
  const monthRange = buildMonthRange(normalizedMonthKey || dayjs());
  const holidaySet = new Set(
    (Array.isArray(holidayKeys) ? holidayKeys : []).map((key) => normalizeDateKey(key)).filter(Boolean)
  );
  const hasAttendanceRows = Array.isArray(attendanceRows) && attendanceRows.length > 0;
  const attendanceWorkedDateMap = buildAttendanceWorkedDateMap(attendanceRows);
  const eligibleEmployeeById = new Map();
  const rowByKey = new Map();

  const ensureRow = ({ workerId, workerName = '' }) => {
    const key = buildWorkerRowKey(workerId, workerName);
    if (!key) return null;
    if (!rowByKey.has(key)) {
      rowByKey.set(key, {
        key,
        workerId: workerId || null,
        workerName: workerName || '',
        workMonth: monthRange.monthKey,
        factoryName: factoryName || '',
        lineNameCounts: new Map(),
        lineNameFallback: '',
        recordCount: 0,
        totalCtSeconds: 0,
        workDates: new Set(),
      });
    }
    const row = rowByKey.get(key);
    if (!row.workerName && workerName) {
      row.workerName = workerName;
    }
    return row;
  };

  (Array.isArray(employees) ? employees : []).forEach((employee) => {
    const workerId = normalizePositiveId(employee?.id);
    if (!workerId) return;
    if (!isEligibleMonthlyWorker(employee, monthRange)) return;
    eligibleEmployeeById.set(String(workerId), employee);
    const row = ensureRow({
      workerId,
      workerName: normalizeLabel(employee?.name),
    });
    if (!row) return;
    row.lineNameFallback = normalizeLabel(employee?.lineName);
  });

  (Array.isArray(logs) ? logs : []).forEach((log) => {
    const workDate = normalizeDateKey(log?.workDate);
    const logCoverageStartDate = normalizeDateKey(log?.coverageStartDate) || workDate;
    const logCoverageEndDate = normalizeDateKey(log?.coverageEndDate) || workDate;
    const logFactoryName = normalizeLabel(log?.factoryName);
    const logLineName = normalizeLabel(log?.lineName);

    (Array.isArray(log?.records) ? log.records : []).forEach((record) => {
      const workerId = normalizePositiveId(record?.workerId);
      const employee = workerId ? eligibleEmployeeById.get(String(workerId)) || null : null;
      if (!employee) return;
      const row = ensureRow({
        workerId,
        workerName: normalizeLabel(record?.workerName) || normalizeLabel(employee?.name),
      });
      if (!row) return;

      if (!row.factoryName && logFactoryName) {
        row.factoryName = logFactoryName;
      }

      if (logLineName) {
        incrementLabelCount(row.lineNameCounts, logLineName);
      }

      const ctSeconds = Math.max(0, Math.round(Number(record?.ctSeconds) || 0));
      const quantity = Math.max(0, Math.round(Number(record?.quantity) || 0));
      row.totalCtSeconds += ctSeconds * quantity;
      row.recordCount += 1;

      addWorkingDateRange({
        targetDates: row.workDates,
        startDateKey:
          normalizeDateKey(record?.effectiveCoverageStartDate) || logCoverageStartDate,
        endDateKey:
          normalizeDateKey(record?.effectiveCoverageEndDate) || logCoverageEndDate,
        monthRange,
        holidaySet,
        joinedDateKey: resolveEmploymentDateKey(employee?.joinedAt),
        leftDateKey: resolveEmploymentDateKey(employee?.leftAt),
      });
    });
  });

  return Array.from(rowByKey.values()).map((row) => {
    const employee = row.workerId ? eligibleEmployeeById.get(String(row.workerId)) || null : null;
    const lineName =
      resolveDominantLabel(row.lineNameCounts, '') ||
      normalizeLabel(employee?.lineName) ||
      row.lineNameFallback ||
      '-';
    const workDayCount = row.workDates.size;
    const joinedDateKey = resolveEmploymentDateKey(employee?.joinedAt);
    const leftDateKey = resolveEmploymentDateKey(employee?.leftAt);
    const attendanceTargetDays = countWorkingDaysForEmployment({
      monthStart: monthRange.dateFrom,
      monthEnd: monthRange.dateTo,
      holidaySet,
      joinedDateKey,
      leftDateKey,
    });
    const workedAttendanceDates =
      row.workerId ? attendanceWorkedDateMap.get(String(row.workerId)) || new Set() : new Set();
    const attendanceWorkedDays =
      hasAttendanceRows ? workedAttendanceDates.size : null;
    const averageDayCount =
      attendanceWorkedDays !== null ? attendanceWorkedDays : workDayCount;

    return {
      key: row.key,
      workerId: row.workerId,
      workerName: row.workerName || '-',
      workMonth: row.workMonth,
      factoryName: row.factoryName || factoryName || '-',
      lineName,
      workDayCount,
      recordCount: row.recordCount,
      averageCtPerDaySeconds:
        averageDayCount > 0 ? Math.round(row.totalCtSeconds / averageDayCount) : null,
      attendanceWorkedDays,
      attendanceTargetDays,
      attendanceDisplay:
        attendanceWorkedDays === null
          ? `-/${attendanceTargetDays}`
          : `${attendanceWorkedDays}/${attendanceTargetDays}`,
    };
  });
};

export const buildMonthlyWorkerDetail = ({
  workerId,
  logs = [],
  attendanceRows = [],
  holidayKeys = [],
  monthKey = '',
  employee = null,
  factoryName = '',
}) => {
  const normalizedWorkerId = normalizePositiveId(workerId);
  if (!normalizedWorkerId) {
    return {
      summary: null,
      rows: [],
    };
  }

  const summaryRows = aggregateMonthlyWorkerRows({
    employees: employee ? [employee] : [],
    logs,
    attendanceRows,
    holidayKeys,
    monthKey,
    factoryName,
  });
  const summary =
    summaryRows.find((row) => Number(row.workerId) === normalizedWorkerId) || null;
  const attendanceWorkedDateMap = buildAttendanceWorkedDateMap(attendanceRows);
  const attendanceWorkedDates =
    attendanceWorkedDateMap.get(String(normalizedWorkerId)) || new Set();
  const bucketByDate = new Map();

  (Array.isArray(logs) ? logs : []).forEach((log) => {
    const workDate = normalizeDateKey(log?.workDate);
    const logLineName = normalizeLabel(log?.lineName);
    if (!workDate) return;

    (Array.isArray(log?.records) ? log.records : []).forEach((record) => {
      if (normalizePositiveId(record?.workerId) !== normalizedWorkerId) return;

      if (!bucketByDate.has(workDate)) {
        bucketByDate.set(workDate, {
          workDate,
          lineNameCounts: new Map(),
          recordCount: 0,
          totalCtSeconds: 0,
        });
      }

      const bucket = bucketByDate.get(workDate);
      if (logLineName) {
        incrementLabelCount(bucket.lineNameCounts, logLineName);
      }
      const ctSeconds = Math.max(0, Math.round(Number(record?.ctSeconds) || 0));
      const quantity = Math.max(0, Math.round(Number(record?.quantity) || 0));
      bucket.totalCtSeconds += ctSeconds * quantity;
      bucket.recordCount += 1;
    });
  });

  const allDateKeys = new Set([
    ...Array.from(bucketByDate.keys()),
    ...Array.from(attendanceWorkedDates),
  ]);
  const rows = Array.from(allDateKeys)
    .sort((left, right) => right.localeCompare(left))
    .map((dateKey) => {
      const bucket = bucketByDate.get(dateKey) || null;
      return {
        workDate: dateKey,
        lineName:
          resolveDominantLabel(bucket?.lineNameCounts || new Map(), '') ||
          normalizeLabel(employee?.lineName) ||
          '-',
        recordCount: bucket?.recordCount || 0,
        recordTotalCtSeconds: bucket && bucket.recordCount > 0 ? bucket.totalCtSeconds : null,
        attendanceWorked: attendanceWorkedDates.has(dateKey),
      };
    });

  return {
    summary,
    rows,
  };
};
