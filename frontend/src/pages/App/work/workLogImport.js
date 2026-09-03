import * as XLSX from 'xlsx';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const toText = (value) => String(value ?? '').trim();
const normalizeHeader = (value) => toText(value).toUpperCase();

const IMPORT_ERROR_TEXT = {
  failedTitle: {
    ko: '작업기록 파일 업로드 실패',
    en: 'Work-log import failed',
    vi: 'Nhap tep ghi chep that bai',
  },
  noRowsProvided: {
    ko: '가져올 행이 없습니다.',
    en: 'No rows were provided.',
    vi: 'Không có dong nao de nhap.',
  },
  noRowsFound: {
    ko: '파일에서 가져올 수 있는 작업기록 행을 찾지 못했습니다.',
    en: 'No importable work-log rows were found in the workbook.',
    vi: 'Không tìm thấy dong ghi chep co the nhap trong tep.',
  },
  skippedSheets: {
    ko: '건너뛴 시트',
    en: 'Skipped sheets',
    vi: 'Trang tinh da bo qua',
  },
  sheetMissingColumns: {
    ko: '필수 열이 없습니다',
    en: 'is missing required columns',
    vi: 'thieu cot bat buoc',
  },
  importRow: {
    ko: '가져오기 행',
    en: 'import row',
    vi: 'dong nhap',
  },
  row: {
    ko: '행',
    en: 'row',
    vi: 'dong',
  },
  more: {
    ko: '건 더 있음',
    en: 'more',
    vi: 'loi khac',
  },
  fallbackIssue: {
    ko: '가져오기 검증에 실패했습니다.',
    en: 'Import validation failed.',
    vi: 'Kiểm tra du lieu nhap khong thanh cong.',
  },
};

const resolveImportText = (key, languageCode, fallback = '') =>
  IMPORT_ERROR_TEXT[key]?.[languageCode] || IMPORT_ERROR_TEXT[key]?.ko || fallback;

const formatIssueCount = (count, languageCode) => {
  if (languageCode === 'en') return `${count} issue${count === 1 ? '' : 's'}`;
  if (languageCode === 'vi') return `${count} loi`;
  return `오류 ${count}건`;
};

const formatIssueLocation = (issue, languageCode) => {
  const parts = [];
  const sheetName = toText(issue?.sheetName);
  const rowNumber = Number(issue?.rowNumber);
  if (sheetName) parts.push(sheetName);
  if (Number.isFinite(rowNumber) && rowNumber > 0) {
    const rowLabel = resolveImportText('row', languageCode, 'row');
    parts.push(languageCode === 'ko' ? `${rowNumber}${rowLabel}` : `${rowLabel} ${rowNumber}`);
  }
  return parts.length > 0
    ? parts.join(' / ')
    : resolveImportText('importRow', languageCode, 'import row');
};

const stripIssueLocation = (issue) => {
  const message = toText(issue?.message || issue?.label);
  const marker = ': ';
  const markerIndex = message.indexOf(marker);
  return markerIndex >= 0 ? message.slice(markerIndex + marker.length).trim() : message;
};

const parseDetail = (detail, pattern, keys = []) => {
  const match = toText(detail).match(pattern);
  if (!match) return null;
  return keys.reduce((values, key, index) => {
    values[key] = toText(match[index + 1]);
    return values;
  }, {});
};

const wrapWithDetail = (message, detail) => {
  const normalizedDetail = toText(detail);
  return normalizedDetail ? `${message} (${normalizedDetail})` : message;
};

const translateLineResolutionIssue = (detail, languageCode) => {
  if (/multiple line assignments matched the work date/i.test(detail)) {
    if (languageCode === 'en') return 'Multiple employee assignments match the work date.';
    if (languageCode === 'vi') return 'Có nhiều phân công nhân viên khớp với ngày làm việc.';
    return '작업일자에 해당하는 직원 배정이 여러 개입니다.';
  }
  if (/employee line name matched multiple lines in the factory/i.test(detail)) {
    if (languageCode === 'en') {
      return 'The employee assignment information is ambiguous in the factory.';
    }
    if (languageCode === 'vi') {
      return 'Thông tin phân công của nhân viên không rõ ràng trong nhà máy.';
    }
    return '공장 안에서 직원의 배정 정보를 하나로 확인할 수 없습니다.';
  }
  if (/line could not be resolved for the employee on the work date/i.test(detail)) {
    if (languageCode === 'en') {
      return 'The employee assignment could not be resolved for the work date.';
    }
    if (languageCode === 'vi') {
      return 'Không xác định được phân công của nhân viên vào ngày làm việc.';
    }
    return '작업일자 기준 직원의 배정 정보를 찾을 수 없습니다.';
  }
  return wrapWithDetail(
    languageCode === 'en'
      ? 'Could not resolve the employee assignment.'
      : languageCode === 'vi'
        ? 'Không xác định được phân công của nhân viên.'
        : '직원의 배정 정보를 찾을 수 없습니다.',
    detail
  );
};

const translateAssignmentMatchIssue = (detail, languageCode) => {
  const orderUnassigned = parseDetail(
    detail,
    /^order (.+) \/ style (.+) has assignment cards but is not assigned to a line in the worker factory\.?$/i,
    ['orderNo', 'styleId']
  );
  if (orderUnassigned) {
    if (languageCode === 'en') {
      return `Order ${orderUnassigned.orderNo} - style ${orderUnassigned.styleId} is not assigned in the worker's factory.`;
    }
    if (languageCode === 'vi') {
      return `Don ${orderUnassigned.orderNo} - ma hang ${orderUnassigned.styleId} da co the nhung chua duoc phan vao chuyen trong nha may cua cong nhan.`;
    }
    return `주문 ${orderUnassigned.orderNo} - 스타일 ${orderUnassigned.styleId}은 미배정 상태입니다. 작업기록 업로드 전에 작업자 공장에 배정해 주세요.`;
  }

  const orderMissing = parseDetail(
    detail,
    /^order (.+) \/ style (.+) has no assignment card in the worker factory\.?$/i,
    ['orderNo', 'styleId']
  );
  if (orderMissing) {
    if (languageCode === 'en') {
      return `Order ${orderMissing.orderNo} - style ${orderMissing.styleId} has no matching assignment card in the worker's factory.`;
    }
    if (languageCode === 'vi') {
      return `Don ${orderMissing.orderNo} - ma hang ${orderMissing.styleId} khong co the phan cong phu hop nao trong nha may cua cong nhan.`;
    }
    return `주문 ${orderMissing.orderNo} - 스타일 ${orderMissing.styleId}에 연결된 배정 카드가 작업자 기준 공장 안에 없습니다.`;
  }

  const styleUnassigned = parseDetail(
    detail,
    /^style (.+) for order (.+) has an assignment card but is not assigned to a line in the worker factory\.?$/i,
    ['styleId', 'orderNo']
  );
  if (styleUnassigned) {
    if (languageCode === 'en') {
      return `Order ${styleUnassigned.orderNo} / style ${styleUnassigned.styleId} is not assigned in the worker's factory.`;
    }
    if (languageCode === 'vi') {
      return `Don ${styleUnassigned.orderNo} / ma hang ${styleUnassigned.styleId} da co the nhung chua duoc phan vao chuyen trong nha may cua cong nhan.`;
    }
    return `주문 ${styleUnassigned.orderNo} / 스타일 ${styleUnassigned.styleId}은 미배정 상태입니다. 작업기록 업로드 전에 작업자 공장에 배정해 주세요.`;
  }

  const styleMismatch = parseDetail(
    detail,
    /^style (.+) is not assigned for order (.+) in the worker factory\.?$/i,
    ['styleId', 'orderNo']
  );
  if (styleMismatch) {
    if (languageCode === 'en') {
      return `Order ${styleMismatch.orderNo} has no assignment card for style ${styleMismatch.styleId}.`;
    }
    if (languageCode === 'vi') {
      return `Don ${styleMismatch.orderNo} khong co the phan cong cho ma hang ${styleMismatch.styleId}.`;
    }
    if (languageCode === 'ko') {
      return `\uC8FC\uBB38 ${styleMismatch.orderNo}\uC5D0\uB294 \uC2A4\uD0C0\uC77C ${styleMismatch.styleId} \uBC30\uC815 \uCE74\uB4DC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`;
    }
    if (languageCode === 'ko') {
      return `주문 ${styleMismatch.orderNo} / 스타일 ${styleMismatch.styleId}의 배정 정보가 없습니다.`;
    }
    return `확인된 배정에서 스타일 ${styleMismatch.styleId}이 주문 ${styleMismatch.orderNo}와 일치하지 않습니다.`;
  }

  const processMismatch = parseDetail(
    detail,
    /^process (.+) is not assigned for order (.+) \/ style (.+) in the worker factory\.?$/i,
    ['processCode', 'orderNo', 'styleId']
  );
  if (processMismatch) {
    // The assignment card itself exists (order/style already matched) - only
    // this process is missing from the card's frozen snapshot, so say that
    // instead of implying the card is missing entirely.
    if (languageCode === 'en') {
      return `Order ${processMismatch.orderNo} / style ${processMismatch.styleId} assignment card has no info for process ${processMismatch.processCode}.`;
    }
    if (languageCode === 'vi') {
      return `The phan cong cua don ${processMismatch.orderNo} / ma hang ${processMismatch.styleId} khong co thong tin cong doan ${processMismatch.processCode}.`;
    }
    return `주문 ${processMismatch.orderNo} / 스타일 ${processMismatch.styleId} 배정 카드에 공정 ${processMismatch.processCode} 정보가 없습니다.`;
  }

  const multiplePlans = parseDetail(
    detail,
    /^multiple assignment plans matched order (.+) \/ style (.+) \/ process (.+)\.?$/i,
    ['orderNo', 'styleId', 'processCode']
  );
  if (multiplePlans) {
    if (languageCode === 'en') {
      return `Multiple assignment cards match order ${multiplePlans.orderNo} / style ${multiplePlans.styleId} / process ${multiplePlans.processCode}.`;
    }
    if (languageCode === 'vi') {
      return `Co nhieu the phan cong khop voi don ${multiplePlans.orderNo} / ma hang ${multiplePlans.styleId} / cong doan ${multiplePlans.processCode}.`;
    }
    return `주문 ${multiplePlans.orderNo} / 스타일 ${multiplePlans.styleId} / 공정 ${multiplePlans.processCode}에 일치하는 배정 카드가 여러 개입니다.`;
  }

  if (/order, style, and process are required to match an assignment/i.test(detail)) {
    if (languageCode === 'en') {
      return 'Order, style, and process are required to match an assignment card.';
    }
    if (languageCode === 'vi') {
      return 'Can co don hang, ma hang va cong doan de khop voi the phan cong.';
    }
    return '배정 카드를 찾으려면 주문, 스타일, 공정이 모두 필요합니다.';
  }

  return wrapWithDetail(
    languageCode === 'en'
      ? 'Could not match the row to an assignment card.'
      : languageCode === 'vi'
        ? 'Khong khop duoc dong nay voi the phan cong.'
        : '이 행을 배정 카드와 연결할 수 없습니다.',
    detail
  );
};

const translateImportIssueDetail = (issue, languageCode) => {
  const detail = stripIssueLocation(issue);
  const code = toText(issue?.code).toUpperCase();

  switch (code) {
    case 'MISSING_END_DATE':
      return languageCode === 'en'
        ? 'DATE(END) is required.'
        : languageCode === 'vi'
          ? 'Can nhap DATE(END).'
          : 'DATE(END)를 입력해야 합니다.';
    case 'MISSING_START_DATE':
      return languageCode === 'en'
        ? 'DATE(START) is invalid.'
        : languageCode === 'vi'
          ? 'DATE(START) khong hop le.'
          : 'DATE(START)가 올바르지 않습니다.';
    case 'INVALID_DATE_RANGE':
      return languageCode === 'en'
        ? 'DATE(START) cannot be later than DATE(END).'
        : languageCode === 'vi'
          ? 'DATE(START) khong duoc sau DATE(END).'
          : 'DATE(START)는 DATE(END)보다 늦을 수 없습니다.';
    case 'MISSING_EMPLOYEE_NO':
      return languageCode === 'en'
        ? 'Employee code is required.'
        : languageCode === 'vi'
          ? 'Can nhap ma nhan vien.'
          : '직원 코드가 필요합니다.';
    case 'MISSING_ORDER_NO':
      return languageCode === 'en'
        ? 'ORDER# is required.'
        : languageCode === 'vi'
          ? 'Can nhap ORDER#.'
          : 'ORDER#를 입력해야 합니다.';
    case 'MULTIPLE_ORDER_NUMBERS': {
      const parsed = parseDetail(
        detail,
        /^multiple order numbers were entered: (.+) \/ style (.+)\.?$/i,
        ['orderNo', 'styleId']
      );
      const orderNo = parsed?.orderNo || '';
      const styleId = parsed?.styleId || '';
      if (languageCode === 'en') {
        return `Enter only one order number per row: ${orderNo} - style ${styleId}.`;
      }
      if (languageCode === 'vi') {
        return `Moi dong chi duoc nhap mot ma don hang: ${orderNo} - ma hang ${styleId}.`;
      }
      return `한 행에는 주문번호 하나만 입력해 주세요: ${orderNo} - 스타일 ${styleId}.`;
    }
    case 'MISSING_STYLE_ID':
      return languageCode === 'en'
        ? 'STYLE is required.'
        : languageCode === 'vi'
          ? 'Can nhap STYLE.'
          : 'STYLE을 입력해야 합니다.';
    case 'MISSING_PROCESS_CODE':
      return languageCode === 'en'
        ? 'JOB(process) is required.'
        : languageCode === 'vi'
          ? 'Can nhap JOB(cong doan).'
          : 'JOB(공정)을 입력해야 합니다.';
    case 'INVALID_QUANTITY':
      return languageCode === 'en'
        ? 'JOB(quantity) must be greater than 0.'
        : languageCode === 'vi'
          ? 'JOB(so luong) phai lon hon 0.'
          : 'JOB(수량)은 0보다 커야 합니다.';
    case 'EMPLOYEE_NOT_FOUND': {
      const parsed = parseDetail(detail, /^Employee code (.+) was not found\.?$/i, [
        'employeeNo',
      ]);
      const employeeNo = parsed?.employeeNo || '';
      if (languageCode === 'en') return `Employee code ${employeeNo} was not found.`;
      if (languageCode === 'vi') return `Không tìm thấy ma nhan vien ${employeeNo}.`;
      return `직원 코드 ${employeeNo}를 찾을 수 없습니다.`;
    }
    case 'EMPLOYEE_NAME_MISMATCH': {
      const parsed = parseDetail(
        detail,
        /^Employee code (.+) belongs to (.+), not (.+)\.?$/i,
        ['employeeNo', 'actualName', 'importName']
      );
      if (!parsed) {
        return wrapWithDetail(
          languageCode === 'en'
            ? 'Employee code and name do not match.'
            : languageCode === 'vi'
              ? 'Ma nhan vien va ten khong khop.'
              : '직원 코드와 이름이 일치하지 않습니다.',
          detail
        );
      }
      if (languageCode === 'en') {
        return `Employee code ${parsed.employeeNo} belongs to ${parsed.actualName}, not ${parsed.importName}.`;
      }
      if (languageCode === 'vi') {
        return `Ma nhan vien ${parsed.employeeNo} thuoc ve ${parsed.actualName}, khong phai ${parsed.importName}.`;
      }
      return `직원 코드 ${parsed.employeeNo}는 ${parsed.importName}이 아니라 ${parsed.actualName} 직원입니다.`;
    }
    case 'LINE_RESOLUTION_FAILED':
      return translateLineResolutionIssue(detail, languageCode);
    case 'ASSIGNMENT_MATCH_FAILED':
      return translateAssignmentMatchIssue(detail, languageCode);
    case 'FACTORY_NOT_FOUND':
      return languageCode === 'en'
        ? 'The employee factory could not be resolved.'
        : languageCode === 'vi'
          ? 'Không tìm thấy nha may cua chuyen da xac dinh.'
          : '직원의 공장을 찾을 수 없습니다.';
    case 'INVALID_WORKER':
      return languageCode === 'en'
        ? 'Worker could not be resolved for this row.'
        : languageCode === 'vi'
          ? 'Khong xac dinh duoc cong nhan cho dong nay.'
          : '이 행의 작업자를 찾을 수 없습니다.';
    case 'EMPLOYMENT_VALIDATION_FAILED':
    case 'EMPLOYMENT_MISMATCH':
      return languageCode === 'en'
        ? 'Worker employment dates do not cover the imported period.'
        : languageCode === 'vi'
          ? 'Ngay vao/nghi viec cua cong nhan khong bao phu ky nhap.'
          : '작업자의 입사/퇴사 기간이 가져온 작업 기간을 포함하지 않습니다.';
    case 'LINE_VALIDATION_FAILED':
    case 'LINE_WORKER_MISMATCH':
      return languageCode === 'en'
        ? 'Worker is not assigned to the factory for the imported period.'
        : languageCode === 'vi'
          ? 'Cong nhan khong duoc phan vao chuyen da xac dinh trong ky nhap.'
          : '작업자가 가져온 기간에 해당 공장에 소속되어 있지 않습니다.';
    case 'MISSING_ASSIGNMENT_PLAN':
      return languageCode === 'en'
        ? 'Every imported row must be linked to an assignment card.'
        : languageCode === 'vi'
          ? 'Moi dong nhap phai duoc lien ket voi the phan cong.'
          : '가져온 모든 행은 배정 카드와 연결되어야 합니다.';
    case 'DUPLICATE_WORK_RECORD':
      return wrapWithDetail(
        languageCode === 'en'
          ? 'Duplicate worker/assignment/process records exist on the work date.'
          : languageCode === 'vi'
            ? 'Bi trung cong nhan/the phan cong/cong doan trong ngay lam viec.'
            : '같은 작업일자에 작업자/배정/공정이 중복되었습니다.',
        detail.replace(/^duplicate worker-style-process on workDate:\s*/i, '')
      );
    case 'CT_SNAPSHOT_VALIDATION_FAILED':
      if (/assignment plan already completed/i.test(detail)) {
        return languageCode === 'en'
          ? 'A completed assignment card is included.'
          : languageCode === 'vi'
            ? 'Co the phan cong da hoan tat.'
            : '이미 완료된 배정 카드가 포함되어 있습니다.';
      }
      if (/ct snapshot required before work log|ct agreement required before work log/i.test(detail)) {
        return languageCode === 'en'
          ? 'Only assignment cards with saved CT snapshots can be imported as work logs.'
          : languageCode === 'vi'
            ? 'Chi the nhap ghi chep cho the phan cong da luu CT snapshot.'
            : 'CT 스냅샷이 저장된 배정 카드만 작업기록으로 가져올 수 있습니다.';
      }
      return wrapWithDetail(
        languageCode === 'en'
          ? 'Assignment card CT validation failed.'
          : languageCode === 'vi'
            ? 'Kiểm tra CT cua the phan cong khong thanh cong.'
            : '배정 카드 CT 검증에 실패했습니다.',
        detail
      );
    case 'PAYROLL_LOCKED':
      return languageCode === 'en'
        ? 'A payroll-locked assignment card is included.'
        : languageCode === 'vi'
          ? 'Co the phan cong da khoa bang luong.'
          : '급여 마감된 배정 카드가 포함되어 있습니다.';
    case 'DUPLICATE_IMPORT_RECORD':
      return wrapWithDetail(
        languageCode === 'en'
          ? 'The same worker/assignment/process appears more than once in the import file.'
          : languageCode === 'vi'
            ? 'Cung cong nhan/the phan cong/cong doan xuat hien nhieu lan trong tep nhap.'
            : '파일 안에 같은 작업자/배정/공정 행이 중복되어 있습니다.',
        detail
      );
    default:
      return wrapWithDetail(
        resolveImportText('fallbackIssue', languageCode, 'Import validation failed.'),
        detail
      );
  }
};

const translateBaseImportError = (message, languageCode) => {
  const normalized = toText(message);
  if (!normalized) return '';

  if (/Work-log import failed:\s*no rows were provided\./i.test(normalized)) {
    return `${resolveImportText('failedTitle', languageCode)}: ${resolveImportText(
      'noRowsProvided',
      languageCode
    )}`;
  }

  const noRowsMatch = normalized.match(
    /^No importable work-log rows were found in the workbook\.(?:\s*Skipped sheets:\s*(.+)\.)?$/i
  );
  if (noRowsMatch) {
    const skippedSheets = toText(noRowsMatch[1]);
    const skippedText = skippedSheets
      ? ` ${resolveImportText('skippedSheets', languageCode)}: ${skippedSheets}.`
      : '';
    return `${resolveImportText('noRowsFound', languageCode)}${skippedText}`;
  }

  const missingColumnsMatch = normalized.match(
    /^Sheet "(.+)" is missing required columns:\s*(.+)$/i
  );
  if (missingColumnsMatch) {
    const sheetName = missingColumnsMatch[1];
    const columns = missingColumnsMatch[2];
    if (languageCode === 'en') return normalized;
    if (languageCode === 'vi') {
      return `Trang tinh "${sheetName}" ${resolveImportText(
        'sheetMissingColumns',
        languageCode
      )}: ${columns}`;
    }
    return `시트 "${sheetName}"에 ${resolveImportText(
      'sheetMissingColumns',
      languageCode
    )}: ${columns}`;
  }

  return normalized;
};

const REQUIRED_HEADERS = [
  'DATE(START)',
  'DATE(END)',
  'STAFF',
  'CODE',
  'ORDER#',
  'STYLE',
  'JOB',
];

const EXPECTED_HEADER_SET = new Set([
  'NO',
  'DATE(START)',
  'DATE(END)',
  'STAFF',
  'CODE',
  'CLIENT',
  'ORDER#',
  'STYLE',
  'PROCESS',
  'JOB',
  'INCENTIVE PER PCS',
  'INCENTIVE',
  'REMARK',
]);

const parseDateValue = (value) => {
  const text = toText(value);
  if (!text) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const day = slashMatch[1].padStart(2, '0');
    const month = slashMatch[2].padStart(2, '0');
    const year = slashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const dashMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const day = dashMatch[1].padStart(2, '0');
    const month = dashMatch[2].padStart(2, '0');
    const year = dashMatch[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toISOString().slice(0, 10);
};

const findColumnIndexes = (headerRow = []) => {
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const processHeaderIndex = normalizedHeaders.indexOf('PROCESS');
  const firstJobIndex = normalizedHeaders.indexOf('JOB');
  const secondJobIndex =
    firstJobIndex >= 0
      ? normalizedHeaders.indexOf('JOB', firstJobIndex + 1)
      : -1;
  // Two supported header shapes for the same 3 columns (style, process code, quantity):
  //   legacy: STYLE, JOB, JOB      -> process code = 1st JOB, quantity = 2nd JOB
  //   current: STYLE, PROCESS, JOB -> process code = PROCESS,  quantity = JOB
  const processCode = processHeaderIndex >= 0 ? processHeaderIndex : firstJobIndex;
  const quantity = processHeaderIndex >= 0 ? firstJobIndex : secondJobIndex;

  return {
    startDate: normalizedHeaders.indexOf('DATE(START)'),
    endDate: normalizedHeaders.indexOf('DATE(END)'),
    staff: normalizedHeaders.indexOf('STAFF'),
    employeeNo: normalizedHeaders.indexOf('CODE'),
    orderNo: normalizedHeaders.indexOf('ORDER#'),
    styleId: normalizedHeaders.indexOf('STYLE'),
    processCode,
    quantity,
    remark: normalizedHeaders.indexOf('REMARK'),
    hasAnyExpectedHeader: normalizedHeaders.some((header) =>
      EXPECTED_HEADER_SET.has(header)
    ),
  };
};

const collectMissingHeaders = (columnIndexes) => {
  const missing = [];
  if (columnIndexes.startDate < 0) missing.push('DATE(START)');
  if (columnIndexes.endDate < 0) missing.push('DATE(END)');
  if (columnIndexes.staff < 0) missing.push('STAFF');
  if (columnIndexes.employeeNo < 0) missing.push('CODE');
  if (columnIndexes.orderNo < 0) missing.push('ORDER#');
  if (columnIndexes.styleId < 0) missing.push('STYLE');
  if (columnIndexes.processCode < 0) missing.push('JOB(process)');
  if (columnIndexes.quantity < 0) missing.push('JOB(quantity)');
  return missing;
};

const isMeaningfulRow = (row = []) =>
  (Array.isArray(row) ? row : []).some((cell) => toText(cell));

export const parseWorkLogImportWorkbook = async (file) => {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellDates: true,
  });

  const parsedRows = [];
  const skippedSheets = [];
  const hiddenSheetNames = new Set(
    (Array.isArray(workbook?.Workbook?.Sheets)
      ? workbook.Workbook.Sheets
      : []
    )
      .filter((sheetInfo) => Number(sheetInfo?.Hidden) > 0)
      .map((sheetInfo) => sheetInfo?.name)
      .filter(Boolean)
  );

  workbook.SheetNames.forEach((sheetName) => {
    // Hidden sheets in operational workbooks are archived monthly data or
    // reference tables, not sheets selected by the user for this import.
    if (hiddenSheetNames.has(sheetName)) return;
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
    });
    if (!Array.isArray(rows) || rows.length === 0) return;

    const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
    const columnIndexes = findColumnIndexes(headerRow);
    const missingHeaders = collectMissingHeaders(columnIndexes);
    const dataRows = rows.slice(1).filter((row) => isMeaningfulRow(row));

    if (dataRows.length === 0) return;
    if (!columnIndexes.hasAnyExpectedHeader) {
      skippedSheets.push(sheetName);
      return;
    }
    if (missingHeaders.length > 0) {
      throw new Error(
        `Sheet "${sheetName}" is missing required columns: ${missingHeaders.join(', ')}`
      );
    }

    dataRows.forEach((row, index) => {
      const rowNumber = index + 2;
      parsedRows.push({
        sheetName,
        rowNumber,
        coverageStartDate: parseDateValue(row[columnIndexes.startDate]),
        coverageEndDate: parseDateValue(row[columnIndexes.endDate]),
        employeeName: toText(row[columnIndexes.staff]),
        employeeNo: toText(row[columnIndexes.employeeNo]),
        orderNo: toText(row[columnIndexes.orderNo]),
        styleId: toText(row[columnIndexes.styleId]),
        processCode: toText(row[columnIndexes.processCode]),
        quantity: toText(row[columnIndexes.quantity]),
        remark:
          columnIndexes.remark >= 0 ? toText(row[columnIndexes.remark]) : '',
      });
    });
  });

  if (parsedRows.length === 0) {
    const skippedText =
      skippedSheets.length > 0
        ? ` Skipped sheets: ${skippedSheets.join(', ')}.`
        : '';
    throw new Error(`No importable work-log rows were found in the workbook.${skippedText}`);
  }

  return parsedRows;
};

export const importWorkLogRows = async ({ orgId, fileName, rows }) => {
  const query = buildQueryString({ orgId });
  return requestJSON(`/work-logs/import${query}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: toText(fileName),
      rows: Array.isArray(rows) ? rows : [],
    }),
  });
};

export const extractWorkLogImportIssueRows = (error, languageCode = 'ko') => {
  const issues = Array.isArray(error?.details?.issues) ? error.details.issues : [];
  return issues.map((issue, index) => ({
    key: `${toText(issue?.sheetName)}-${toText(issue?.rowNumber)}-${index}`,
    location: formatIssueLocation(issue, languageCode),
    detail: translateImportIssueDetail(issue, languageCode),
    code: toText(issue?.code),
  }));
};

export const formatWorkLogImportError = (error, languageCode = 'ko') => {
  const baseMessage = toText(error?.message || error?.details?.error);
  const issues = Array.isArray(error?.details?.issues) ? error.details.issues : [];
  if (issues.length === 0) {
    return (
      translateBaseImportError(baseMessage, languageCode) ||
      resolveImportText('failedTitle', languageCode, 'Work-log import failed.')
    );
  }

  const preview = issues
    .slice(0, 5)
    .map((issue) => {
      const location = formatIssueLocation(issue, languageCode);
      const detail = translateImportIssueDetail(issue, languageCode);
      return `${location}: ${detail}`;
    })
    .filter(Boolean)
    .join('; ');
  const extraCount = issues.length - 5;
  return `${resolveImportText(
    'failedTitle',
    languageCode,
    'Work-log import failed'
  )} (${formatIssueCount(issues.length, languageCode)}): ${preview}${
    extraCount > 0
      ? `; +${extraCount} ${resolveImportText('more', languageCode, 'more')}`
      : ''
  }`.trim();
};
