import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const EXCEL_EPOCH_OFFSET = 25569;
const EXCEL_DAY_MS = 24 * 60 * 60 * 1000;

const VIETNAMESE_DIACRITIC_PATTERN = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]/g;
const DIGIT_PATTERN = /\d+/g;

const HEADER_KEYWORDS = {
  workerId: {
    loose: ['id', 'employee id', 'user id', 'person id', 'staff id', 'worker id'],
    ascii: ['idnguoi', 'employeeid', 'userid', 'personid', 'manhanvien', 'staffid', 'workerid'],
  },
  workerName: {
    loose: ['name', 'full name', 'ten', 'hoten', 'worker name', 'employee name'],
    ascii: ['ten', 'hoten', 'fullname', 'workername', 'employeename'],
  },
  timestamp: {
    loose: ['time', 'datetime', 'check time', 'timestamp', 'thoi gian', 'ngay gio'],
    ascii: ['thoigian', 'ngaygio', 'datetime', 'timestamp', 'checktime', 'time'],
  },
};

const toText = (value) => String(value ?? '').trim();

const normalizeLoose = (value) => toText(value).toLowerCase();

const normalizeAscii = (value) =>
  normalizeLoose(value)
    .normalize('NFD')
    .replace(VIETNAMESE_DIACRITIC_PATTERN, '')
    .replace(NON_ALPHANUMERIC_PATTERN, '');

const toDigits = (value) => {
  const digits = toText(value).match(DIGIT_PATTERN);
  return digits ? digits.join('') : '';
};

const toMinuteText = (totalMinutes) => {
  const normalized = Math.max(0, Math.min(24 * 60 - 1, Math.round(Number(totalMinutes) || 0)));
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const tryParseExcelSerial = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 20000 || numeric > 90000) return null;
  const ms = (numeric - EXCEL_EPOCH_OFFSET) * EXCEL_DAY_MS;
  const parsed = dayjs(ms);
  return parsed.isValid() ? parsed : null;
};

const parseTimestamp = (value) => {
  const raw = toText(value);
  if (!raw) return null;

  const direct = dayjs(raw);
  if (direct.isValid()) return direct;

  const candidates = [
    raw,
    raw.replace('T', ' '),
    raw.replace(/\./g, '-'),
    raw.replace(/\//g, '-'),
    raw.replace(/\./g, '-').replace(/\//g, '-'),
  ];

  for (const candidate of candidates) {
    const parsed = dayjs(candidate);
    if (parsed.isValid()) return parsed;
    const date = new Date(candidate);
    if (!Number.isNaN(date.getTime())) {
      const byDate = dayjs(date);
      if (byDate.isValid()) return byDate;
    }
  }

  return tryParseExcelSerial(raw);
};

const matchesKeywords = (value, keywordBundle) => {
  const loose = normalizeLoose(value);
  const ascii = normalizeAscii(value);
  const looseMatched = keywordBundle.loose.some((keyword) => loose.includes(normalizeLoose(keyword)));
  if (looseMatched) return true;
  return keywordBundle.ascii.some((keyword) => ascii.includes(normalizeAscii(keyword)));
};

const detectHeaderColumns = (row = []) => {
  let workerIdIndex = -1;
  let workerNameIndex = -1;
  let timestampIndex = -1;

  row.forEach((cell, index) => {
    if (timestampIndex < 0 && matchesKeywords(cell, HEADER_KEYWORDS.timestamp)) {
      timestampIndex = index;
      return;
    }
    if (workerIdIndex < 0 && matchesKeywords(cell, HEADER_KEYWORDS.workerId)) {
      workerIdIndex = index;
      return;
    }
    if (workerNameIndex < 0 && matchesKeywords(cell, HEADER_KEYWORDS.workerName)) {
      workerNameIndex = index;
    }
  });

  const score =
    (timestampIndex >= 0 ? 4 : 0) +
    (workerIdIndex >= 0 ? 2 : 0) +
    (workerNameIndex >= 0 ? 1 : 0);

  return {
    workerIdIndex,
    workerNameIndex,
    timestampIndex,
    score,
    valid: timestampIndex >= 0 && (workerIdIndex >= 0 || workerNameIndex >= 0),
  };
};

const findHeaderInfo = (rows = []) => {
  let best = null;
  const maxScan = Math.min(rows.length, 40);

  for (let index = 0; index < maxScan; index += 1) {
    const row = Array.isArray(rows[index]) ? rows[index] : [];
    const detected = detectHeaderColumns(row);
    if (!detected.valid) continue;
    if (!best || detected.score > best.score) {
      best = {
        ...detected,
        headerRowIndex: index,
      };
    }
    if (detected.score >= 7) break;
  }

  return best;
};

const readSheetRows = async (file) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
};

export const parseAttendanceImportFile = async (file) => {
  if (!file) {
    throw new Error('File is missing.');
  }

  const rows = await readSheetRows(file);
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('The file has no rows.');
  }

  const header = findHeaderInfo(rows);
  if (!header) {
    throw new Error('Could not detect time/worker columns.');
  }

  const events = [];
  let skippedInvalidTimeCount = 0;
  let skippedMissingWorkerCount = 0;

  for (let rowIndex = header.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
    const workerCode =
      header.workerIdIndex >= 0 ? toText(row[header.workerIdIndex]) : '';
    const workerName =
      header.workerNameIndex >= 0 ? toText(row[header.workerNameIndex]) : '';
    const timestampRaw = toText(row[header.timestampIndex]);

    if (!workerCode && !workerName && !timestampRaw) continue;
    if (!workerCode && !workerName) {
      skippedMissingWorkerCount += 1;
      continue;
    }

    const timestamp = parseTimestamp(timestampRaw);
    if (!timestamp) {
      skippedInvalidTimeCount += 1;
      continue;
    }

    events.push({
      workerCode,
      workerName,
      occurredAt: timestamp,
    });
  }

  return {
    events,
    skippedInvalidTimeCount,
    skippedMissingWorkerCount,
  };
};

const buildEmployeeResolver = (employees = []) => {
  const byNumericId = new Map();
  const byNameBuckets = new Map();

  employees.forEach((employee) => {
    const numericIdKey = String(Number(employee?.id));
    if (numericIdKey && numericIdKey !== 'NaN') {
      byNumericId.set(numericIdKey, employee);
    }

    const normalizedName = normalizeAscii(employee?.name);
    if (!normalizedName) return;
    if (!byNameBuckets.has(normalizedName)) {
      byNameBuckets.set(normalizedName, []);
    }
    byNameBuckets.get(normalizedName).push(employee);
  });

  return (event) => {
    const idDigits = toDigits(event?.workerCode);
    if (idDigits) {
      const normalizedId = String(Number(idDigits));
      const byId = byNumericId.get(normalizedId);
      if (byId) {
        return { employee: byId, reason: 'matched_id' };
      }
    }

    const normalizedName = normalizeAscii(event?.workerName);
    if (!normalizedName) {
      return { employee: null, reason: 'missing_worker_key' };
    }

    const byNameList = byNameBuckets.get(normalizedName) || [];
    if (byNameList.length === 1) {
      return { employee: byNameList[0], reason: 'matched_name' };
    }
    if (byNameList.length > 1) {
      return { employee: null, reason: 'ambiguous_name' };
    }

    return { employee: null, reason: 'unmatched_worker' };
  };
};

export const buildAttendanceImportPlan = ({
  events = [],
  employees = [],
}) => {
  const resolveEmployee = buildEmployeeResolver(employees);
  const groupedByDateWorker = new Map();
  const unmatchedReasonCount = {
    missing_worker_key: 0,
    ambiguous_name: 0,
    unmatched_worker: 0,
  };
  let matchedEventCount = 0;

  events.forEach((event) => {
    const { employee, reason } = resolveEmployee(event);
    if (!employee?.id) {
      if (Object.prototype.hasOwnProperty.call(unmatchedReasonCount, reason)) {
        unmatchedReasonCount[reason] += 1;
      } else {
        unmatchedReasonCount.unmatched_worker += 1;
      }
      return;
    }

    const dateKey = event.occurredAt.format('YYYY-MM-DD');
    const minuteOfDay = event.occurredAt.hour() * 60 + event.occurredAt.minute();
    const workerId = Number(employee.id);
    if (!Number.isFinite(workerId) || workerId <= 0) {
      unmatchedReasonCount.unmatched_worker += 1;
      return;
    }

    const signature = `${dateKey}::${workerId}`;
    const current = groupedByDateWorker.get(signature);
    if (!current) {
      groupedByDateWorker.set(signature, {
        dateKey,
        workerId: Math.trunc(workerId),
        minMinute: minuteOfDay,
        maxMinute: minuteOfDay,
      });
    } else {
      current.minMinute = Math.min(current.minMinute, minuteOfDay);
      current.maxMinute = Math.max(current.maxMinute, minuteOfDay);
    }

    matchedEventCount += 1;
  });

  const byDate = new Map();
  groupedByDateWorker.forEach((item) => {
    if (!byDate.has(item.dateKey)) {
      byDate.set(item.dateKey, []);
    }

    byDate.get(item.dateKey).push({
      workerId: item.workerId,
      clockIn: toMinuteText(item.minMinute),
      clockOut: item.maxMinute > item.minMinute ? toMinuteText(item.maxMinute) : null,
      note: null,
    });
  });

  const dailyEntries = Array.from(byDate.entries())
    .map(([workDate, entries]) => ({
      workDate,
      entries: [...entries].sort((left, right) => left.workerId - right.workerId),
    }))
    .sort((left, right) => dayjs(left.workDate).valueOf() - dayjs(right.workDate).valueOf());

  return {
    dailyEntries,
    rawEventCount: events.length,
    matchedEventCount,
    unmatchedEventCount: events.length - matchedEventCount,
    unmatchedReasonCount,
  };
};

export const mergeImportedAttendanceEntries = (
  existingRows = [],
  importedEntries = []
) => {
  const mergedByWorker = new Map();

  existingRows.forEach((row) => {
    const workerId = Number(row?.workerId);
    if (!Number.isFinite(workerId) || workerId <= 0) return;
    mergedByWorker.set(Math.trunc(workerId), {
      workerId: Math.trunc(workerId),
      clockIn: toText(row?.clockIn) || null,
      clockOut: toText(row?.clockOut) || null,
      note: toText(row?.note) || null,
    });
  });

  importedEntries.forEach((entry) => {
    const workerId = Number(entry?.workerId);
    if (!Number.isFinite(workerId) || workerId <= 0) return;
    const normalizedWorkerId = Math.trunc(workerId);
    const current = mergedByWorker.get(normalizedWorkerId) || {
      workerId: normalizedWorkerId,
      clockIn: null,
      clockOut: null,
      note: null,
    };

    mergedByWorker.set(normalizedWorkerId, {
      workerId: normalizedWorkerId,
      clockIn: toText(entry?.clockIn) || current.clockIn || null,
      clockOut: toText(entry?.clockOut) || current.clockOut || null,
      note: current.note || null,
    });
  });

  return Array.from(mergedByWorker.values()).sort(
    (left, right) => left.workerId - right.workerId
  );
};
