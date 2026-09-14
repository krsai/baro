import dayjs from 'dayjs';
import * as XLSX from 'xlsx';

const EXCEL_EPOCH_OFFSET = 25569;
const EXCEL_DAY_MS = 24 * 60 * 60 * 1000;

const VIETNAMESE_DIACRITIC_PATTERN = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]/g;

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

// "Đ/đ" (Latin letter D with stroke) is not a combining accent, so NFD does
// not split it into "d" + a mark - it must be mapped explicitly or it gets
// silently dropped by the alphanumeric-only strip below.
const normalizeAscii = (value) =>
  normalizeLoose(value)
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(VIETNAMESE_DIACRITIC_PATTERN, '')
    .replace(NON_ALPHANUMERIC_PATTERN, '');

// Vietnamese timekeeping devices commonly abbreviate the middle "chữ đệm"
// (Thị/Như/Thanh/...) to a single initial or drop it, while Baro's employee
// master keeps the full name. Comparing surname (first token) + given name
// (last token) only tolerates that gap without guessing at the middle name.
const buildSurnameGivenNameKey = (value) => {
  const tokens = normalizeLoose(value)
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(VIETNAMESE_DIACRITIC_PATTERN, '')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length < 2) return '';
  return `${tokens[0]}::${tokens[tokens.length - 1]}`;
};

// 사번 앞의 접두어(과거 공장 접두어 "HN-", 조직 코드 "BRVN" 등)는 형태를 가리지 않고
// 문자열 끝의 숫자만 추출해 선행 0을 지운다. 출퇴근 기기가 내보내는 raw ID는 접두어 없는
// 순수 숫자(예: "23")이므로, 사번이 "0023"이든 "BRVN0023"이든 같은 값으로 정규화되어야
// 매칭된다. 끝에 숫자가 전혀 없는 값(순수 이름 매칭 등)은 원문 그대로 반환한다.
const normalizeEmployeeNumber = (value) => {
  const text = toText(value).replace(/^'/, '');
  const match = text.match(/(\d+)$/);
  return match ? match[1].replace(/^0+(?=\d)/, '') : text;
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
    // 사번(직원 ID) 열은 유일한 매칭 근거이므로 반드시 있어야 한다. 이름 열은
    // 매칭에 쓰지 않고, 사번으로 찾은 직원과 이름이 실제로 맞는지 확인하는
    // 참고용 검증에만 쓰이므로 없어도 파일 자체는 유효하다.
    valid: timestampIndex >= 0 && workerIdIndex >= 0,
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
    throw new Error('Could not detect a time column and an employee ID/code column. Both are required.');
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

// 엑셀에서 추출한 사번(직원 ID)이 유일한 매칭 근거다. 이름은 매칭에 쓰지 않고,
// 사번으로 찾은 직원의 실제 이름과 엑셀에 적힌 이름이 그럴듯하게 맞는지
// 검증하는 용도로만 쓴다(오타·다른 직원 사번 오입력 등을 잡아내기 위함).
const buildEmployeeResolver = (employees = [], languageCode = 'ko') => {
  const byEmployeeNumber = new Map();
  const byNameBuckets = new Map();

  employees.forEach((employee) => {
    const numericIdKey = normalizeEmployeeNumber(employee?.employeeNo);
    if (numericIdKey) {
      if (!byEmployeeNumber.has(numericIdKey)) byEmployeeNumber.set(numericIdKey, []);
      byEmployeeNumber.get(numericIdKey).push(employee);
    }

    const normalizedName = normalizeAscii(employee?.name);
    if (normalizedName) {
      if (!byNameBuckets.has(normalizedName)) {
        byNameBuckets.set(normalizedName, []);
      }
      byNameBuckets.get(normalizedName).push(employee);
    }
  });

  return (event) => {
    const idDigits = normalizeEmployeeNumber(event?.workerCode);
    if (!idDigits) {
      // 사번 열이 비었거나 숫자로 끝나지 않으면, 이름이 함께 적혀 있어도
      // 이름으로 대신 매칭하지 않는다. 사번만이 유일한 매칭 근거다.
      return { employee: null, reason: 'missing_employee_code' };
    }

    // Excel IDs are employee numbers, never database primary keys.
    const candidates = byEmployeeNumber.get(idDigits) || [];
    if (!candidates.length) return { employee: null, reason: 'unmatched_worker' };
    const byId = candidates[0];
    const name = normalizeAscii(event?.workerName);
    const key = buildSurnameGivenNameKey(event?.workerName);
    const compatible = !name || name === normalizeAscii(byId.name) || (
      !(byNameBuckets.get(name) || []).length && key && key === buildSurnameGivenNameKey(byId.name)
    );
    if (candidates.length !== 1 || !compatible) {
      const message = {
        ko: '사번·이름 불일치 또는 사번 중복입니다. 직원 정보와 엑셀을 확인하세요',
        en: 'Employee number/name mismatch or duplicate number. Check employees and the spreadsheet',
        vi: 'Mã nhân viên và tên không khớp hoặc mã bị trùng. Kiểm tra nhân viên và tệp Excel',
      };
      const error = new Error(`${message[languageCode] || message.en}: ${event.workerCode} / ${event.workerName}`);
      error.code = 'ATTENDANCE_EMPLOYEE_CONFLICT';
      throw error;
    }
    return { employee: byId, reason: 'matched_employee_number' };
  };
};

export const buildAttendanceImportPlan = ({
  events = [],
  employees = [],
  languageCode = 'ko',
}) => {
  const resolveEmployee = buildEmployeeResolver(employees, languageCode);
  const groupedByDateWorker = new Map();
  const unmatchedReasonCount = {
    missing_employee_code: 0,
    unmatched_worker: 0,
  };
  const unmatchedDetails = [];
  let matchedEventCount = 0;

  events.forEach((event) => {
    const { employee, reason } = resolveEmployee(event);
    if (!employee?.id) {
      const resolvedReason = Object.prototype.hasOwnProperty.call(unmatchedReasonCount, reason)
        ? reason
        : 'unmatched_worker';
      unmatchedReasonCount[resolvedReason] += 1;
      unmatchedDetails.push({
        workerCode: toText(event?.workerCode),
        workerName: toText(event?.workerName),
        occurredAt: event?.occurredAt,
        reason: resolvedReason,
      });
      return;
    }

    const dateKey = event.occurredAt.format('YYYY-MM-DD');
    const minuteOfDay = event.occurredAt.hour() * 60 + event.occurredAt.minute();
    const workerId = Number(employee.id);
    if (!Number.isFinite(workerId) || workerId <= 0) {
      unmatchedReasonCount.unmatched_worker += 1;
      unmatchedDetails.push({
        workerCode: toText(event?.workerCode),
        workerName: toText(event?.workerName),
        occurredAt: event?.occurredAt,
        reason: 'unmatched_worker',
      });
      return;
    }

    const signature = `${dateKey}::${workerId}`;
    const current = groupedByDateWorker.get(signature);
    if (!current) {
      groupedByDateWorker.set(signature, {
        dateKey,
        workerId: Math.trunc(workerId),
        workerName: toText(employee.name) || toText(event.workerName),
        minMinute: minuteOfDay,
        maxMinute: minuteOfDay,
        timestamps: new Set([event.occurredAt.valueOf()]),
      });
    } else {
      current.timestamps.add(event.occurredAt.valueOf());
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

    const singlePunch = item.timestamps.size === 1;
    const missingIn = singlePunch && item.minMinute >= 12 * 60;
    const missingOut = singlePunch && !missingIn;
    const notes = {
      ko: missingIn ? '출근 기록 없음 → 08:00 출근 자동 생성' : '퇴근 기록 없음 → 17:00 퇴근 자동 생성',
      en: missingIn ? 'Missing clock-in → 08:00 clock-in auto-filled' : 'Missing clock-out → 17:00 clock-out auto-filled',
      vi: missingIn ? 'Thiếu giờ vào → tự động bổ sung giờ vào 08:00' : 'Thiếu giờ ra → tự động bổ sung giờ ra 17:00',
    };
    byDate.get(item.dateKey).push({
      workerId: item.workerId,
      clockIn: missingIn ? '08:00' : toMinuteText(item.minMinute),
      clockOut: missingOut ? '17:00' : (missingIn || item.maxMinute > item.minMinute ? toMinuteText(item.maxMinute) : null),
      note: singlePunch ? `${item.workerName}: ${notes[languageCode] || notes.en}` : null,
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
    unmatchedDetails,
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
      note: [...new Set([...toText(current.note).split('\n'), toText(entry?.note)].filter(Boolean))].join('\n') || null,
    });
  });

  return Array.from(mergedByWorker.values()).sort(
    (left, right) => left.workerId - right.workerId
  );
};
