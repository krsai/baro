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
  // 하루 단위 요약 표(출근/퇴근이 별도 열로 나뉜 형태)에서 쓰는 열이다. "thoigian"
  // 하나만으로는 "Thời gian biểu"(근무 시간대, 실제 펀치 시각이 아님) 같은 열과
  // 겹치므로, "vao"/"ra"(들어옴/나감)까지 붙은 더 구체적인 키워드만 인정한다.
  clockIn: {
    loose: ['time in', 'check in', 'clock in'],
    ascii: ['giovao', 'thoigianvao', 'checkin', 'clockin', 'timein'],
  },
  clockOut: {
    loose: ['time out', 'check out', 'clock out'],
    ascii: ['giora', 'thoigianra', 'checkout', 'clockout', 'timeout'],
  },
  date: {
    loose: ['date', 'work date', 'ngay'],
    ascii: ['ngay', 'date', 'workdate'],
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

// "day-summary" 형태의 출근/퇴근 열은 날짜 없이 시각만 담고 있다("07:37:40").
// 값이 없거나("-" 등) 시각 형식이 아니면 그 날은 해당 펀치가 없는 것으로 본다.
const PLACEHOLDER_TIME_VALUES = new Set(['', '-', '--', 'n/a', 'na']);
const parseTimeOfDayMinutes = (value) => {
  const text = toText(value);
  if (!text || PLACEHOLDER_TIME_VALUES.has(text.toLowerCase())) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

const matchesKeywords = (value, keywordBundle) => {
  const loose = normalizeLoose(value);
  const ascii = normalizeAscii(value);
  const looseMatched = keywordBundle.loose.some((keyword) => loose.includes(normalizeLoose(keyword)));
  if (looseMatched) return true;
  return keywordBundle.ascii.some((keyword) => ascii.includes(normalizeAscii(keyword)));
};

// 출퇴근 파일은 두 형태를 모두 지원한다.
//  - "event" 형태: 한 행 = 펀치 한 번(사번 + 단일 시각 열). 여러 행을 모아
//    하루의 출근/퇴근을 추론한다(기존 방식).
//  - "day-summary" 형태: 한 행 = 한 사람의 하루(날짜 열 + 출근/퇴근 열이 각각
//    분리). 츨근·퇴근 중 하나만 있거나 둘 다 있을 수 있다. 이 형태를 쓰는
//    기기는 대개 별도 사번 열이 없어 "이름" 열에 직접 사번을 적어 넣으므로,
//    이 형태에서는 사번 열이 없으면 이름 열 값을 사번으로 취급한다(실제
//    이름 대조 검증은 생략 — 애초에 진짜 이름 데이터가 없기 때문).
const detectHeaderColumns = (row = []) => {
  let workerIdIndex = -1;
  let workerNameIndex = -1;
  let timestampIndex = -1;
  let clockInIndex = -1;
  let clockOutIndex = -1;
  let dateIndex = -1;

  row.forEach((cell, index) => {
    if (clockInIndex < 0 && matchesKeywords(cell, HEADER_KEYWORDS.clockIn)) {
      clockInIndex = index;
      return;
    }
    if (clockOutIndex < 0 && matchesKeywords(cell, HEADER_KEYWORDS.clockOut)) {
      clockOutIndex = index;
      return;
    }
    if (timestampIndex < 0 && matchesKeywords(cell, HEADER_KEYWORDS.timestamp)) {
      timestampIndex = index;
      return;
    }
    if (dateIndex < 0 && matchesKeywords(cell, HEADER_KEYWORDS.date)) {
      dateIndex = index;
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

  const hasEventShape = timestampIndex >= 0 && workerIdIndex >= 0;
  const daySummaryIdentifierIndex = workerIdIndex >= 0 ? workerIdIndex : workerNameIndex;
  const hasDaySummaryShape =
    dateIndex >= 0 && (clockInIndex >= 0 || clockOutIndex >= 0) && daySummaryIdentifierIndex >= 0;

  const score =
    (timestampIndex >= 0 ? 4 : 0) +
    (workerIdIndex >= 0 ? 2 : 0) +
    (workerNameIndex >= 0 ? 1 : 0) +
    (dateIndex >= 0 ? 3 : 0) +
    (clockInIndex >= 0 ? 3 : 0) +
    (clockOutIndex >= 0 ? 3 : 0);

  return {
    workerIdIndex,
    workerNameIndex,
    timestampIndex,
    clockInIndex,
    clockOutIndex,
    dateIndex,
    daySummaryIdentifierIndex,
    // event 형태를 우선한다. 두 형태 신호가 동시에 잡히는 경우는 실제로는
    // 없을 것으로 보지만, event 형태(사번 열이 명확히 있는 쪽)가 더 신뢰할
    // 수 있는 근거이므로 그쪽을 우선한다.
    shape: hasEventShape ? 'event' : (hasDaySummaryShape ? 'day-summary' : null),
    score,
    valid: hasEventShape || hasDaySummaryShape,
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
    throw new Error(
      'Could not detect a valid layout. Need either a time column + employee ID/code column, ' +
      'or a date column + clock-in/clock-out column(s) with an identifier column.'
    );
  }

  const events = [];
  let skippedInvalidTimeCount = 0;
  let skippedMissingWorkerCount = 0;

  for (let rowIndex = header.headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];

    if (header.shape === 'day-summary') {
      // 이 형태는 사번 전용 열이 없는 기기가 많아, 없으면 이름 열 값을 그대로
      // 사번으로 취급한다(그 경우 실제 이름 데이터가 없으므로 이름 대조 검증은
      // 하지 않는다).
      const identifierValue = toText(row[header.daySummaryIdentifierIndex]);
      const hasRealNameColumn = header.workerIdIndex >= 0 && header.workerNameIndex >= 0;
      const workerCode = identifierValue;
      const workerName = hasRealNameColumn ? toText(row[header.workerNameIndex]) : '';
      const dateRaw = toText(row[header.dateIndex]);
      const clockInRaw = header.clockInIndex >= 0 ? row[header.clockInIndex] : '';
      const clockOutRaw = header.clockOutIndex >= 0 ? row[header.clockOutIndex] : '';

      if (!identifierValue && !dateRaw) continue;
      if (!identifierValue) {
        skippedMissingWorkerCount += 1;
        continue;
      }

      const dayAnchor = parseTimestamp(dateRaw);
      if (!dayAnchor) {
        skippedInvalidTimeCount += 1;
        continue;
      }

      const clockInMinutes = parseTimeOfDayMinutes(clockInRaw);
      const clockOutMinutes = parseTimeOfDayMinutes(clockOutRaw);
      if (clockInMinutes === null && clockOutMinutes === null) continue;

      if (clockInMinutes !== null) {
        events.push({
          workerCode,
          workerName,
          occurredAt: dayAnchor.hour(0).minute(0).second(0).millisecond(0).add(clockInMinutes, 'minute'),
          punchType: 'in',
        });
      }
      if (clockOutMinutes !== null) {
        events.push({
          workerCode,
          workerName,
          occurredAt: dayAnchor.hour(0).minute(0).second(0).millisecond(0).add(clockOutMinutes, 'minute'),
          punchType: 'out',
        });
      }
      continue;
    }

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
    const explicitInMinute = event.punchType === 'in' ? minuteOfDay : null;
    const explicitOutMinute = event.punchType === 'out' ? minuteOfDay : null;
    if (!current) {
      groupedByDateWorker.set(signature, {
        dateKey,
        workerId: Math.trunc(workerId),
        workerName: toText(employee.name) || toText(event.workerName),
        minMinute: minuteOfDay,
        maxMinute: minuteOfDay,
        timestamps: new Set([event.occurredAt.valueOf()]),
        // "day-summary" 형태(출근/퇴근 열이 이미 분리된 원본)에서만 채워진다.
        // 이 값이 있으면 아래에서 min/max 추론 대신 이 값을 그대로 쓴다.
        explicitInMinute,
        explicitOutMinute,
        hasExplicitPunch: explicitInMinute !== null || explicitOutMinute !== null,
      });
    } else {
      current.timestamps.add(event.occurredAt.valueOf());
      current.minMinute = Math.min(current.minMinute, minuteOfDay);
      current.maxMinute = Math.max(current.maxMinute, minuteOfDay);
      if (explicitInMinute !== null) {
        current.explicitInMinute = explicitInMinute;
        current.hasExplicitPunch = true;
      }
      if (explicitOutMinute !== null) {
        current.explicitOutMinute = explicitOutMinute;
        current.hasExplicitPunch = true;
      }
    }

    matchedEventCount += 1;
  });

  const byDate = new Map();
  groupedByDateWorker.forEach((item) => {
    if (!byDate.has(item.dateKey)) {
      byDate.set(item.dateKey, []);
    }

    if (item.hasExplicitPunch) {
      // 원본에 출근/퇴근이 이미 분리돼 있으므로 시각의 이르고 늦음으로
      // 추측하지 않고 원본이 명시한 값을 그대로 쓴다.
      const hasIn = item.explicitInMinute !== null && item.explicitInMinute !== undefined;
      const hasOut = item.explicitOutMinute !== null && item.explicitOutMinute !== undefined;
      const missingIn = !hasIn && hasOut;
      const missingOut = hasIn && !hasOut;
      const notes = {
        ko: missingIn ? '출근 기록 없음 → 08:00 출근 자동 생성' : '퇴근 기록 없음 → 17:00 퇴근 자동 생성',
        en: missingIn ? 'Missing clock-in → 08:00 clock-in auto-filled' : 'Missing clock-out → 17:00 clock-out auto-filled',
        vi: missingIn ? 'Thiếu giờ vào → tự động bổ sung giờ vào 08:00' : 'Thiếu giờ ra → tự động bổ sung giờ ra 17:00',
      };
      byDate.get(item.dateKey).push({
        workerId: item.workerId,
        clockIn: hasIn ? toMinuteText(item.explicitInMinute) : (missingIn ? '08:00' : null),
        clockOut: hasOut ? toMinuteText(item.explicitOutMinute) : (missingOut ? '17:00' : null),
        note: (missingIn || missingOut) ? `${item.workerName}: ${notes[languageCode] || notes.en}` : null,
      });
      return;
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
