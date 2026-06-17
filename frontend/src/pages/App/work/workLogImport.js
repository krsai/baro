import * as XLSX from 'xlsx';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const toText = (value) => String(value ?? '').trim();
const normalizeHeader = (value) => toText(value).toUpperCase();

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
  const firstJobIndex = normalizedHeaders.indexOf('JOB');
  const secondJobIndex =
    firstJobIndex >= 0
      ? normalizedHeaders.indexOf('JOB', firstJobIndex + 1)
      : -1;

  return {
    startDate: normalizedHeaders.indexOf('DATE(START)'),
    endDate: normalizedHeaders.indexOf('DATE(END)'),
    staff: normalizedHeaders.indexOf('STAFF'),
    employeeNo: normalizedHeaders.indexOf('CODE'),
    orderNo: normalizedHeaders.indexOf('ORDER#'),
    styleId: normalizedHeaders.indexOf('STYLE'),
    processCode: firstJobIndex,
    quantity: secondJobIndex,
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

  workbook.SheetNames.forEach((sheetName) => {
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

export const formatWorkLogImportError = (error) => {
  const baseMessage = toText(error?.message || error?.details?.error);
  const issues = Array.isArray(error?.details?.issues) ? error.details.issues : [];
  if (issues.length === 0) {
    return baseMessage || 'Work-log import failed.';
  }

  const preview = issues
    .slice(0, 5)
    .map((issue) => toText(issue?.message || issue?.label))
    .filter(Boolean)
    .join(' | ');
  const extraCount = issues.length - 5;
  return `${baseMessage || 'Work-log import failed.'} ${preview}${
    extraCount > 0 ? ` | +${extraCount} more` : ''
  }`.trim();
};
