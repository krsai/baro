import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import {
  enUS as datePickerEnUS,
  koKR as datePickerKoKR,
  viVN as datePickerViVN,
} from '@mui/x-date-pickers/locales';
import AppPageContainer from '../../../components/AppPageContainer';
import LastUpdaterLabel from '../../../components/LastUpdaterLabel';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
import SearchInput from '../../../components/SearchInput';
import SearchableSelect from '../../../components/SearchableSelect';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { fetchProcessAttributes } from '../../../utils/attributeApi';
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  clampDateToFactoryManagementStart,
  isDateBeforeFactoryManagementStart,
  resolveScopedFactoryManagementStartDateKey,
  resolveScopedFactoryManagementStartDay,
} from '../../../utils/factoryManagementStart';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { hasAssignmentCtSnapshot, resolveAssignmentCtSnapshot } from '../../../utils/assignmentCt';
import { resolveLocalizedProcessName } from '../../../utils/processDisplay';
import { formatSeconds } from '../../../utils/processTime';
import { loadWorkLogContext } from './workLogStorage';

const { useDeferredValue } = React;

const COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const AUTO_NOTE_PREFIX = '[자동 메모]';
const AUTO_NOTE_MARKER = `\n\n${AUTO_NOTE_PREFIX}\n`;
const EMPLOYMENT_AUTO_NOTE_PREFIX = '[재직기간 자동 조정]';
const EMPLOYMENT_AUTO_NOTE_MARKER = `\n\n${EMPLOYMENT_AUTO_NOTE_PREFIX}\n`;
const LABELS = {
  title: '기록 상세',
  workDate: '작업 종료일',
  coverageStartDate: '작업 시작일',
  factory: '공장',
  autoFactory: '공장 (자동선택)',
  line: '라인',
  wagePerSecond: '초당 공임',
  wagePerSecondUnit: '동/초',
  note: '비고',
  notePlaceholder: '메모를 입력하세요.',
  autoNote: '자동 메모',
  searchPlaceholder: '작업자/스타일/공정 검색',
  rowNumber: '행',
  worker: '작업자',
  workerPlaceholder: '작업자를 선택하세요.',
  style: '스타일',
  stylePlaceholder: '스타일을 선택하세요.',
  noStylesAvailable: '선택 가능한 스타일이 없습니다.',
  selectStyleFirst: '스타일을 먼저 선택하세요.',
  assignmentException: '예외',
  assignmentOtherLine: '다른 라인 배정',
  orderNo: '주문번호',
  orderQuantity: '주문수량',
  assignmentQuantityExceeded: '주문 수량 초과',
  selectWorkerFirst: '작업자를 먼저 선택하세요.',
  process: '공정',
  processPlaceholder: '공정을 선택하세요.',
  noProcessesAvailable: '선택 가능한 공정이 없습니다.',
  ctSeconds: 'CT',
  quantity: '생산량',
  quantityCtTotal: '수량 x CT',
  recordCount: '작업 행',
  totalQuantity: '총 생산량',
  totalQuantityCt: '총 수량 x CT',
  moveUp: '위로 이동',
  moveDown: '아래로 이동',
  addBelow: '아래 작업자 추가',
  remove: '작업자 삭제',
  entryMode: '입력 방식',
  entryModeDaily: '일별 입력',
  entryModePeriodSummary: '기간 입력',
  coverageSuggestionPrefix: '직전 작업기록 종료일',
  coverageSuggestionSuffix: '시작일을 자동 제안했습니다.',
  firstLineCoverage: '이 라인의 첫 작업기록입니다. 시작 날짜를 직접 입력하세요.',
  zeroCoverageHint: '직전 작업기록이 없으면 시작일을 직접 입력해 주세요.',
  coverageValidation: '작업 시작일은 종료일보다 늦을 수 없습니다.',
  assignmentLinkRequired: '배정카드 연결이 없는 작업은 저장할 수 없습니다.',
};
const WORK_DETAIL_LABELS = {
  ko: LABELS,
  en: {
    title: 'Work Log Detail', workDate: 'Work End Date', coverageStartDate: 'Work Start Date', factory: 'Factory', autoFactory: 'Factory (Auto-selected)', line: 'Line', wagePerSecond: 'Rate per Second', wagePerSecondUnit: 'VND/sec', note: 'Note', notePlaceholder: 'Enter a note.', autoNote: 'Automatic Note', searchPlaceholder: 'Search worker/style/process', rowNumber: 'Row', worker: 'Worker', workerPlaceholder: 'Select a worker.', style: 'Style', stylePlaceholder: 'Select a style.', noStylesAvailable: 'No styles available.', selectStyleFirst: 'Select a style first.', assignmentException: 'Exception', assignmentOtherLine: 'Assigned to Another Line', orderNo: 'Order No.', orderQuantity: 'Order Quantity', assignmentQuantityExceeded: 'Order quantity exceeded', selectWorkerFirst: 'Select a worker first.', process: 'Process', processPlaceholder: 'Select a process.', noProcessesAvailable: 'No processes available.', ctSeconds: 'CT', quantity: 'Produced Quantity', quantityCtTotal: 'Quantity × CT', recordCount: 'Work Rows', totalQuantity: 'Total Produced', totalQuantityCt: 'Total Quantity × CT', moveUp: 'Move Up', moveDown: 'Move Down', addBelow: 'Add Worker Below', remove: 'Remove Worker', entryMode: 'Entry Mode', entryModeDaily: 'Daily Entry', entryModePeriodSummary: 'Period Entry', coverageSuggestionPrefix: 'The previous work log ended on', coverageSuggestionSuffix: 'The start date was suggested automatically.', firstLineCoverage: 'This is the first work log for this line. Enter the start date.', zeroCoverageHint: 'If there is no previous work log, enter the start date.', coverageValidation: 'The work start date cannot be later than the end date.', assignmentLinkRequired: 'Work without an assignment card cannot be saved.',
  },
  vi: {
    title: 'Chi tiết nhật ký công việc', workDate: 'Ngày kết thúc công việc', coverageStartDate: 'Ngày bắt đầu công việc', factory: 'Nhà máy', autoFactory: 'Nhà máy (tự động chọn)', line: 'Chuyền', wagePerSecond: 'Đơn giá mỗi giây', wagePerSecondUnit: 'đồng/giây', note: 'Ghi chú', notePlaceholder: 'Nhập ghi chú.', autoNote: 'Ghi chú tự động', searchPlaceholder: 'Tìm nhân viên/style/công đoạn', rowNumber: 'Dòng', worker: 'Nhân viên', workerPlaceholder: 'Chọn nhân viên.', style: 'Style', stylePlaceholder: 'Chọn style.', noStylesAvailable: 'Không có style để chọn.', selectStyleFirst: 'Vui lòng chọn style trước.', assignmentException: 'Ngoại lệ', assignmentOtherLine: 'Được phân công ở chuyền khác', orderNo: 'Số đơn hàng', orderQuantity: 'Số lượng đơn hàng', assignmentQuantityExceeded: 'Vượt số lượng đơn hàng', selectWorkerFirst: 'Vui lòng chọn nhân viên trước.', process: 'Công đoạn', processPlaceholder: 'Chọn công đoạn.', noProcessesAvailable: 'Không có công đoạn để chọn.', ctSeconds: 'CT', quantity: 'Sản lượng', quantityCtTotal: 'Số lượng × CT', recordCount: 'Dòng công việc', totalQuantity: 'Tổng sản lượng', totalQuantityCt: 'Tổng số lượng × CT', moveUp: 'Di chuyển lên', moveDown: 'Di chuyển xuống', addBelow: 'Thêm nhân viên bên dưới', remove: 'Xóa nhân viên', entryMode: 'Cách nhập', entryModeDaily: 'Nhập theo ngày', entryModePeriodSummary: 'Nhập theo khoảng thời gian', coverageSuggestionPrefix: 'Nhật ký công việc trước kết thúc ngày', coverageSuggestionSuffix: 'Ngày bắt đầu đã được đề xuất tự động.', firstLineCoverage: 'Đây là nhật ký công việc đầu tiên của chuyền này. Vui lòng nhập ngày bắt đầu.', zeroCoverageHint: 'Nếu không có nhật ký trước đó, vui lòng nhập ngày bắt đầu.', coverageValidation: 'Ngày bắt đầu không được muộn hơn ngày kết thúc.', assignmentLinkRequired: 'Không thể lưu công việc chưa liên kết với thẻ phân công.',
  },
};
const WORK_DETAIL_MESSAGES = {
  ko: { loading: '기본 정보를 불러오는 중입니다.', entryModeHelp: '종료일 기준으로 저장하며, 시작일과 종료일이 같으면 일별 입력으로 처리합니다.', legacyReadOnly: '라인 정보가 없는 기존 기록은 이 화면에서 수정할 수 없습니다.', duplicateRows: '같은 작업자/배정/공정 조합이 중복되어 있습니다. 수량으로 합산해 주세요.', selectFactory: '공장을 선택하면 라인과 작업자를 불러옵니다.', selectLine: '라인을 선택하면 해당 라인의 작업자/스타일/공정 옵션을 불러옵니다.', loadingLine: '라인 데이터를 불러오는 중입니다.', noWorkers: '선택한 라인/작업일 기준으로 작업자가 없습니다.', preparingRow: '첫 작업자 입력 행을 준비 중입니다.', noSearchResults: '검색 결과가 없습니다.', previousEndConnector: '입니다.', suggestedFromConnector: '부터 ' },
  en: { loading: 'Loading basic information.', entryModeHelp: 'Records are saved by end date. When the start and end dates are the same, they are treated as a daily entry.', legacyReadOnly: 'Legacy records without line information cannot be edited here.', duplicateRows: 'The same worker/assignment/process combination appears more than once. Combine the quantities.', selectFactory: 'Select a factory to load lines and workers.', selectLine: 'Select a line to load its workers, styles, and processes.', loadingLine: 'Loading line data.', noWorkers: 'No workers are available for the selected line and work date.', preparingRow: 'Preparing the first worker entry row.', noSearchResults: 'No search results.', previousEndConnector: '.', suggestedFromConnector: ' Starting from ' },
  vi: { loading: 'Đang tải thông tin cơ bản.', entryModeHelp: 'Dữ liệu được lưu theo ngày kết thúc. Nếu ngày bắt đầu và ngày kết thúc giống nhau, hệ thống sẽ xử lý như nhập theo ngày.', legacyReadOnly: 'Không thể sửa bản ghi cũ không có thông tin chuyền trên màn hình này.', duplicateRows: 'Tổ hợp nhân viên/phân công/công đoạn bị trùng. Vui lòng cộng gộp số lượng.', selectFactory: 'Chọn nhà máy để tải chuyền và nhân viên.', selectLine: 'Chọn chuyền để tải nhân viên, style và công đoạn.', loadingLine: 'Đang tải dữ liệu chuyền.', noWorkers: 'Không có nhân viên theo chuyền và ngày làm việc đã chọn.', preparingRow: 'Đang chuẩn bị dòng nhập cho nhân viên đầu tiên.', noSearchResults: 'Không có kết quả tìm kiếm.', previousEndConnector: '.', suggestedFromConnector: ' Bắt đầu từ ', startDateRequired: 'Vui lòng nhập ngày bắt đầu công việc.', sameMonthRequired: 'Ngày bắt đầu và ngày kết thúc phải trong cùng một tháng. Vui lòng đăng ký riêng theo từng tháng.', factoryRequired: 'Vui lòng chọn nhà máy.', lineRequired: 'Vui lòng chọn chuyền.', noRowsToSave: 'Không có dòng công việc để lưu.', invalidWorkerLine: 'Có nhân viên không thuộc chuyền đã chọn.', wageMissing: 'Chưa thiết lập đơn giá mỗi giây của nhà máy.', duplicateEntry: 'Không thể nhập trùng cùng nhân viên, phân công và công đoạn trong cùng ngày.' },
};

const toText = (value) => String(value || '').trim();
const buildWorkLogOperationStartErrorMessage = (languageCode, startDateKey) => {
  const resolvedStartDateKey = startDateKey || DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY;
  if (languageCode === 'vi') {
    return `Chi co the nhap ghi chep tu ${resolvedStartDateKey} tro di.`;
  }
  if (languageCode === 'en') {
    return `Only work logs from ${resolvedStartDateKey} onward can be entered.`;
  }
  return `작업기록은 ${resolvedStartDateKey} 이후만 입력할 수 있습니다.`;
};
const clampWorkLogDay = (
  value,
  managementStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
) => clampDateToFactoryManagementStart(value, managementStartDateKey);
const isWorkLogDateBeforeOperationStart = (
  value,
  managementStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
) => isDateBeforeFactoryManagementStart(value, managementStartDateKey);
const toKey = (value) => toText(value).toLowerCase();
const equalsText = (left, right) => toKey(left) === toKey(right);
const normalizeProcessCode = (value) =>
  toText(value)
    .replace(/\[|\]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase();
const normalizeProcessNameKey = (value) =>
  toText(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
const PROCESS_INSTANCE_CODE_PATTERN = /^(.*)-\d+-\d+$/;
const stripProcessInstanceCode = (value) => {
  const rawCode = toText(value);
  if (!rawCode) return '';
  const instanceCodeMatch = rawCode.match(PROCESS_INSTANCE_CODE_PATTERN);
  const strippedCode = toText(instanceCodeMatch?.[1] || '');
  return strippedCode || rawCode;
};
const buildNormalizedProcessCodeCandidates = (value) => {
  const rawCode = toText(value);
  if (!rawCode) return [];
  const candidates = [];
  const seen = new Set();
  const pushCandidate = (candidate) => {
    const normalized = normalizeProcessCode(candidate);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    candidates.push(normalized);
  };

  pushCandidate(rawCode);
  const strippedCode = stripProcessInstanceCode(rawCode);
  if (strippedCode && strippedCode !== rawCode) {
    pushCandidate(strippedCode);
  }
  return candidates;
};
const collectNormalizedProcessCodeCandidates = (process) => {
  const candidates = [];
  const seen = new Set();
  [process?.processCode, process?.code, process?.processKey].forEach((value) => {
    buildNormalizedProcessCodeCandidates(value).forEach((candidate) => {
      if (seen.has(candidate)) return;
      seen.add(candidate);
      candidates.push(candidate);
    });
  });
  return candidates;
};
const hasMatchingProcessCode = (leftProcess, rightProcess) => {
  const leftCandidates = collectNormalizedProcessCodeCandidates(leftProcess);
  if (leftCandidates.length === 0) return false;
  const rightCandidates = new Set(collectNormalizedProcessCodeCandidates(rightProcess));
  if (rightCandidates.size === 0) return false;
  return leftCandidates.some((candidate) => rightCandidates.has(candidate));
};
const collectProcessNameKeys = (process) =>
  new Set(
    [
      process?.name,
      process?.processName,
      process?.nameKo,
      process?.processNameKo,
      process?.nameEn,
      process?.processNameEn,
      process?.nameVi,
      process?.processNameVi,
    ]
      .map((value) => normalizeProcessNameKey(value))
      .filter(Boolean)
  );
const hasMatchingProcessName = (leftProcess, rightProcess) => {
  const leftNameKeys = collectProcessNameKeys(leftProcess);
  if (leftNameKeys.size === 0) return false;
  const rightNameKeys = collectProcessNameKeys(rightProcess);
  if (rightNameKeys.size === 0) return false;
  for (const nameKey of leftNameKeys) {
    if (rightNameKeys.has(nameKey)) return true;
  }
  return false;
};
const isSameProcess = (leftProcess, rightProcess) => {
  if (!leftProcess || !rightProcess) return false;
  const leftProcessKey = toText(leftProcess?.processKey || leftProcess?.id);
  const rightProcessKey = toText(rightProcess?.processKey || rightProcess?.id);
  if (leftProcessKey && rightProcessKey && leftProcessKey === rightProcessKey) return true;

  const leftProcessId = toPositiveIdOrNull(leftProcess?.processId ?? leftProcess?.id);
  const rightProcessId = toPositiveIdOrNull(rightProcess?.processId ?? rightProcess?.id);
  if (leftProcessId && rightProcessId && leftProcessId === rightProcessId) return true;

  if (hasMatchingProcessCode(leftProcess, rightProcess)) return true;
  return hasMatchingProcessName(leftProcess, rightProcess);
};
const formatCount = (value) =>
  formatNumberWithCommas(value, {
    fallback: '0',
    maximumFractionDigits: 0,
  });
const resolveRowCtDisplayMeta = ({ row, rowProcess, selectedProcessOption }) => {
  const process = selectedProcessOption?.process || rowProcess || row?.process || null;
  const hasProcess = Boolean(process);
  const ctSeconds = Math.max(
    0,
    Math.round(Number(process?.ctSeconds ?? row?.ctSeconds) || 0)
  );
  const quantity = Math.max(0, Math.round(Number(row?.quantity) || 0));
  const totalCtSeconds = ctSeconds * quantity;

  return {
    ctSeconds,
    quantity,
    totalCtSeconds,
    ctValue: hasProcess ? formatSeconds(ctSeconds) : '-',
    totalCtValue: hasProcess && quantity > 0 ? formatSeconds(totalCtSeconds) : '-',
  };
};
const buildComparableWorkRecord = (record = {}) => {
  const workerId = toPositiveIdOrNull(record?.workerId);
  const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
  const styleRefId = toPositiveIdOrNull(record?.styleRefId ?? record?.styleId);
  const styleCodeKey = toKey(record?.styleCode);
  const styleNameKey = toKey(record?.styleName);
  const styleProcessId = toPositiveIdOrNull(record?.styleProcessId);
  const processCodeKey = normalizeProcessCode(
    stripProcessInstanceCode(record?.processCode)
  );
  const processNameKey = normalizeProcessNameKey(
    record?.processName || record?.processNameKo || record?.processNameEn || record?.processNameVi
  );
  const quantity = Math.max(0, Math.round(Number(record?.quantity) || 0));
  const styleKey = assignmentPlanId
    ? `plan:${assignmentPlanId}`
    : styleRefId
      ? `style:${styleRefId}`
      : styleCodeKey
        ? `code:${styleCodeKey}`
        : styleNameKey
          ? `name:${styleNameKey}`
          : '';
  const processKey = styleProcessId
    ? `style-process:${styleProcessId}`
    : processCodeKey
      ? `code:${processCodeKey}`
      : processNameKey
        ? `name:${processNameKey}`
        : '';

  return {
    workerId: workerId || null,
    styleKey,
    processKey,
    quantity,
  };
};
const buildComparableWorkRecords = (records = []) =>
  (Array.isArray(records) ? records : [])
    .map((record) => buildComparableWorkRecord(record))
    .filter(
      (record) =>
        Boolean(record?.workerId) &&
        Boolean(record?.styleKey) &&
        Boolean(record?.processKey) &&
        Number(record?.quantity) > 0
    );
const toStableSnapshotText = (value) => JSON.stringify(value ?? null);
const resolveQuantityUnitLabel = (languageCode) => {
  if (languageCode === 'ko') return '장';
  if (languageCode === 'vi') return 'cái';
  return 'pcs';
};
const buildQuantityExceededHelperText = (meta) => {
  if (!meta) return '';
  return `${LABELS.assignmentQuantityExceeded}: 주문 ${formatCount(meta.limitQuantity)}개 / 누적 ${formatCount(
    meta.totalQuantity
  )}개 / 초과 ${formatCount(meta.exceededQuantity)}개`;
};
const toPositiveIdOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
};
const createRowId = () => `work-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createBlankRow = (patch = {}) => ({
  id: createRowId(),
  worker: null,
  styleOptionId: '',
  assignment: null,
  process: null,
  quantity: '',
  outsourceUnitPrice: '',
  ...patch,
});
const DESKTOP_INLINE_FIELD_HEIGHT = 40;
const DESKTOP_INLINE_FIELD_SX = {
  '& .MuiInputBase-root': {
    minHeight: DESKTOP_INLINE_FIELD_HEIGHT,
    alignItems: 'center',
  },
  '& .MuiInputBase-input': {
    py: 1.125,
    fontSize: '0.95rem',
  },
};
const DESKTOP_INLINE_TEXT_SX = {
  minHeight: DESKTOP_INLINE_FIELD_HEIGHT,
  px: 1.75,
  display: 'flex',
  alignItems: 'center',
};
const DESKTOP_INLINE_TEXT_PAIR_SX = {
  minWidth: 0,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 0.75,
  overflow: 'hidden',
};
const DESKTOP_INLINE_TEXT_PRIMARY_SX = {
  flex: '0 1 auto',
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const DESKTOP_INLINE_TEXT_SECONDARY_SX = {
  flex: '1 1 auto',
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontSize: '0.72rem',
  lineHeight: 1.2,
};
const buildEditableFieldInputProps = (rowId, field, extra = {}) => ({
  ...extra,
  'data-work-row-id': String(rowId || ''),
  'data-work-field': field,
});
const resolveNextRowEditingField = (row) => {
  if (toText(row?.styleOptionId) || row?.assignment) return 'process';
  if (row?.worker) return 'style';
  return 'worker';
};
const sortByLabel = (items, getLabel) => [...(Array.isArray(items) ? items : [])].sort((left, right) => COLLATOR.compare(toText(getLabel(left)), toText(getLabel(right))));
const buildDatePickerLocaleText = (languageCode) => {
  if (languageCode === 'ko') return datePickerKoKR.components.MuiLocalizationProvider.defaultProps.localeText;
  if (languageCode === 'vi') return datePickerViVN.components.MuiLocalizationProvider.defaultProps.localeText;
  return datePickerEnUS.components.MuiLocalizationProvider.defaultProps.localeText;
};
const buildFactorySelection = (log) => {
  if (!log?.factoryId && !log?.factoryName) return null;
  return { id: log?.factoryId || '', name: log?.factoryName || '', wagePerSecond: log?.factoryWagePerSecond ?? null };
};
const buildLineSelection = (log) => {
  if (!log?.lineId && !log?.lineName) return null;
  return { id: log?.lineId || '', name: log?.lineName || '' };
};
// Legacy rows created before coverage dates were consistently backfilled may still expose only
// the display date (`workDate`). Keep that fallback limited to form initialization/diffing only.
const resolveLegacyCoverageEndSeed = (log) =>
  log?.coverageEndDate || log?.workDate || log?.createdAt || undefined;
const resolveLegacyCoverageEndDateKey = (log) =>
  toText(log?.coverageEndDate || log?.workDate);
const buildInitialWorkDate = (log) => {
  const nextDate = dayjs(resolveLegacyCoverageEndSeed(log));
  return clampWorkLogDay(nextDate.isValid() ? nextDate : dayjs());
};
const buildInitialCoverageStartDate = (log) => {
  const nextDate = dayjs(log?.coverageStartDate || resolveLegacyCoverageEndSeed(log));
  return clampWorkLogDay(nextDate.isValid() ? nextDate : dayjs());
};
const stripAutoNoteFromText = (value) => {
  const text = String(value || '');
  const prefixes = [
    `${AUTO_NOTE_PREFIX}\n`,
    `${EMPLOYMENT_AUTO_NOTE_PREFIX}\n`,
  ];
  if (prefixes.some((prefix) => text.startsWith(prefix))) return '';
  const markerIndices = [
    text.indexOf(AUTO_NOTE_MARKER),
    text.indexOf(EMPLOYMENT_AUTO_NOTE_MARKER),
    ...prefixes.map((prefix) => text.indexOf(prefix)),
  ].filter((index) => index >= 0);
  if (markerIndices.length === 0) return text;
  return text.slice(0, Math.min(...markerIndices)).trimEnd();
};
const extractEmploymentAutoNoteFromText = (value) => {
  const text = String(value || '');
  const prefixIndex = text.indexOf(`${EMPLOYMENT_AUTO_NOTE_PREFIX}\n`);
  if (prefixIndex < 0) return '';
  return text
    .slice(prefixIndex + EMPLOYMENT_AUTO_NOTE_PREFIX.length + 1)
    .trim();
};
const buildCombinedNote = ({ manualNote, autoNote, employmentAutoNote = '' }) => {
  const trimmedManual = toText(manualNote);
  const trimmedAuto = toText(autoNote);
  const trimmedEmploymentAuto = toText(employmentAutoNote);
  const sections = [];
  if (trimmedManual) sections.push(trimmedManual);
  if (trimmedAuto) sections.push(`${AUTO_NOTE_PREFIX}\n${trimmedAuto}`);
  if (trimmedEmploymentAuto) {
    sections.push(`${EMPLOYMENT_AUTO_NOTE_PREFIX}\n${trimmedEmploymentAuto}`);
  }
  return sections.join('\n\n');
};
const formatAssignmentLabel = (assignment) => {
  const styleLabel = toText(assignment?.label || assignment?.styleName || assignment?.styleId);
  if (styleLabel) return styleLabel;
  if (assignment?.dbId) return `배정카드 #${assignment.dbId}`;
  return '배정카드';
};
const buildStyleOptionSearchText = (assignment) =>
  [
    assignment?.label,
    assignment?.styleName,
    assignment?.styleId,
    assignment?.styleCode,
    assignment?.orderNo,
    assignment?.customer,
    assignment?.customerName,
  ]
    .map(toText)
    .filter(Boolean)
    .join(' ');
const filterStyleOptions = (options, state) => {
  const tokens = toText(state?.inputValue)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return options;
  return (Array.isArray(options) ? options : []).filter((option) => {
    const searchText = buildStyleOptionSearchText(option).toLowerCase();
    return tokens.every((token) => searchText.includes(token));
  });
};
const isOtherLineAssignmentOption = (assignment, currentLineId) => {
  const assignmentLineId = toPositiveIdOrNull(assignment?.lineId);
  const normalizedCurrentLineId = toPositiveIdOrNull(currentLineId);
  return Boolean(
    assignmentLineId !== null &&
      normalizedCurrentLineId !== null &&
      assignmentLineId !== normalizedCurrentLineId
  );
};
const formatAssignmentAutocompleteLabel = (assignment, currentLineId) => {
  const baseLabel = formatAssignmentLabel(assignment);
  if (!isOtherLineAssignmentOption(assignment, currentLineId)) return baseLabel;
  const lineName = toText(assignment?.lineName);
  return [LABELS.assignmentException, lineName, baseLabel].filter(Boolean).join(' · ');
};
const resolveStyleOptionId = (assignment) =>
  toText(assignment?.dbId || assignment?.id || '');
const sortAssignmentOptionsByLineContext = (options = [], currentLineId = null) =>
  [...(Array.isArray(options) ? options : [])].sort((left, right) => {
    const leftIsException = isOtherLineAssignmentOption(left, currentLineId);
    const rightIsException = isOtherLineAssignmentOption(right, currentLineId);
    if (leftIsException !== rightIsException) return leftIsException ? 1 : -1;

    const lineCompare = COLLATOR.compare(toText(left?.lineName), toText(right?.lineName));
    if (lineCompare !== 0) return lineCompare;
    return COLLATOR.compare(formatAssignmentLabel(left), formatAssignmentLabel(right));
  });
const ensureOptionIncluded = (options = [], current, getKey) => {
  if (!current) return options;
  const currentKey = toText(getKey(current));
  if (!currentKey) return options;
  if (options.some((option) => toText(getKey(option)) === currentKey)) return options;
  return [current, ...options];
};
const buildPlanProcessOptions = (plan) => {
  const snapshot = resolveAssignmentCtSnapshot(plan);
  const sourceProcesses = Array.isArray(snapshot?.processes) ? snapshot.processes : [];
  const mappedProcesses = sourceProcesses.map((process, index) => {
    const fallbackName = toText(process?.name) || toText(process?.processName) || `공정 ${index + 1}`;
    const processKey =
      toText(process?.processKey) ||
      toText(process?.processCode) ||
      toText(process?.code) ||
      fallbackName ||
      `process-${index + 1}`;
    return {
      id: `${toText(plan?.dbId || plan?.id || 'plan')}:${processKey}`,
      processKey,
      processId: toPositiveIdOrNull(
        process?.id ?? process?.processId ?? process?.processAttributeId ?? process?.attributeId
      ),
      styleProcessId: toPositiveIdOrNull(process?.styleProcessId),
      processCode: stripProcessInstanceCode(
        process?.processCode || process?.code || process?.processKey
      ),
      code: toText(process?.processCode || process?.code || process?.processKey),
      name: fallbackName,
      nameKo: toText(process?.nameKo || process?.processNameKo),
      nameEn: toText(process?.nameEn || process?.processNameEn),
      nameVi: toText(process?.nameVi || process?.processNameVi),
      ctSeconds: Math.max(
        0,
        Math.round(
          Number(
            process?.pieceCtSeconds ??
              process?.snapshotCtSeconds ??
              process?.ctPerPieceSeconds ??
              process?.ctSeconds
          ) || 0
        )
      ),
    };
  });
  return mappedProcesses;
};
const enrichAssignmentPlan = (plan) => ({ ...plan, processes: buildPlanProcessOptions(plan) });
const buildLegacyProcess = (record, index = 0) => {
  const styleProcessId = toPositiveIdOrNull(record?.styleProcessId);
  const processCode = toText(record?.processCode);
  const processName = toText(record?.processName);
  const processKey = styleProcessId
    ? `style-process:${styleProcessId}`
    : processCode || processName || `legacy-process-${index + 1}`;
  if (!styleProcessId && !processCode && !processName) return null;

  return {
    id: `legacy-process-${index + 1}-${processKey}`,
    processKey,
    styleProcessId,
    code: processCode,
    name: processName,
    nameKo: toText(record?.processNameKo),
    nameEn: toText(record?.processNameEn),
    nameVi: toText(record?.processNameVi),
    ctSeconds: Math.max(0, Math.round(Number(record?.ctSeconds) || 0)),
  };
};
const buildLegacyAssignment = (record, index = 0) => {
  const fallbackProcess = buildLegacyProcess(record, index);
  const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
  const assignmentLabel = toText(record?.styleName) || toText(record?.styleCode);

  return {
    dbId: assignmentPlanId || `legacy-assignment-${index + 1}`,
    id: `legacy-assignment-${index + 1}`,
    orderNo: toText(record?.orderNo),
    customer: toText(record?.customerName),
    label: assignmentLabel,
    styleId: toText(record?.styleCode),
    // A legacy row without a linked assignment has no known planned quantity.
    assignmentQuantity: null,
    finalQuantity: null,
    isLegacy: true,
    processes: fallbackProcess ? [fallbackProcess] : [],
  };
};
const resolveBaselineQuantity = (plan) => {
  const finalQuantity = Number(plan?.finalQuantity);
  if (Number.isFinite(finalQuantity) && finalQuantity > 0) return Math.round(finalQuantity);
  const assignmentQuantity = Number(plan?.assignmentQuantity);
  if (Number.isFinite(assignmentQuantity) && assignmentQuantity > 0) {
    return Math.round(assignmentQuantity);
  }
  return null;
};
// FK-only match: resolves an assignment strictly by AssignmentPlan.dbId === record.assignmentPlanId.
// Do not add style/order/process/quantity heuristics here — a wrong guess silently mislinks
// progress/CT to the wrong assignment (AGENTS.md Meaning Exactness Lock).
const resolveHydratedAssignmentMatch = (record, assignments = []) => {
  const safeAssignments = Array.isArray(assignments) ? assignments : [];
  if (safeAssignments.length === 0) return null;

  const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
  if (assignmentPlanId === null) return null;

  return (
    safeAssignments.find((item) => toPositiveIdOrNull(item?.dbId) === assignmentPlanId) || null
  );
};
const buildAssignmentMatchSourceFromRow = (row = {}) => {
  const rowAssignment = row?.assignment || null;
  const rowProcess = row?.process || null;
  return {
    assignmentPlanId:
      toPositiveIdOrNull(rowAssignment?.dbId) ??
      toPositiveIdOrNull(rowAssignment?.id) ??
      toPositiveIdOrNull(row?.assignmentPlanId),
    styleId:
      toText(rowAssignment?.styleId) ||
      toText(row?.styleId),
    styleName:
      toText(rowAssignment?.label) ||
      toText(rowAssignment?.styleName) ||
      toText(row?.styleName),
    processCode:
      toText(rowProcess?.processCode) ||
      toText(rowProcess?.code) ||
      toText(row?.processCode),
    processName:
      toText(rowProcess?.name) ||
      toText(rowProcess?.processName) ||
      toText(row?.processName),
    processNameKo:
      toText(rowProcess?.nameKo) ||
      toText(row?.processNameKo),
    processNameEn:
      toText(rowProcess?.nameEn) ||
      toText(row?.processNameEn),
    processNameVi:
      toText(rowProcess?.nameVi) ||
      toText(row?.processNameVi),
  };
};
const buildProcessMetric = (process) => {
  const styleProcessId = toPositiveIdOrNull(process?.styleProcessId);
  if (styleProcessId) {
    return {
      key: `style-process:${styleProcessId}`,
      label: toText(process?.name) || toText(process?.code) || `StyleProcess#${styleProcessId}`,
    };
  }
  const processId = toPositiveIdOrNull(process?.processId);
  if (processId) return { key: `id:${processId}`, label: toText(process?.name) || toText(process?.code) || `ID:${processId}` };
  const code = collectNormalizedProcessCodeCandidates(process)[0] || '';
  if (code) {
    const displayCode = stripProcessInstanceCode(
      process?.processCode || process?.code || process?.processKey
    );
    return { key: `code:${code}`, label: toText(process?.name) || displayCode || code };
  }
  const name = toText(process?.name || process?.nameKo || process?.nameEn || process?.nameVi);
  if (name) return { key: `name:${normalizeProcessNameKey(name)}`, label: name };
  return { key: 'unknown', label: '미정 공정' };
};
const buildAssignmentPlanMetric = (value = {}) => {
  const assignmentPlanId = toPositiveIdOrNull(
    value?.assignmentPlanId ?? value?.assignment?.dbId ?? value?.assignment?.id
  );
  if (!assignmentPlanId) return { key: '', label: '' };
  return { key: `assignment-plan:${assignmentPlanId}`, label: `AssignmentPlan#${assignmentPlanId}` };
};
const buildWorkerMetric = (value = {}) => {
  const workerId = toPositiveIdOrNull(value?.workerId);
  if (workerId) {
    return { key: `id:${workerId}`, label: toText(value?.workerName) || `ID:${workerId}` };
  }
  const workerName = toText(value?.workerName);
  if (workerName) return { key: `name:${toKey(workerName)}`, label: workerName };
  return { key: '', label: '' };
};
const buildWorkerStyleProcessSignature = (value = {}) => {
  const workerMetric = buildWorkerMetric({
    workerId: value?.workerId ?? value?.worker?.id,
    workerName: value?.workerName ?? value?.worker?.name,
  });
  const assignmentPlanMetric = buildAssignmentPlanMetric({
    assignmentPlanId: value?.assignmentPlanId ?? value?.assignment?.dbId,
    assignment: value?.assignment,
  });
  const processMetric = buildProcessMetric({
    styleProcessId: value?.styleProcessId ?? value?.process?.styleProcessId,
    processId: value?.process?.processId ?? value?.process?.id,
    code: value?.processCode ?? value?.process?.code ?? value?.process?.processCode,
    name:
      value?.processName ??
      value?.process?.name ??
      value?.process?.processName ??
      value?.process?.nameKo ??
      value?.process?.nameEn ??
      value?.process?.nameVi,
    nameKo: value?.process?.nameKo,
    nameEn: value?.process?.nameEn,
    nameVi: value?.process?.nameVi,
  });
  if (!workerMetric.key || !assignmentPlanMetric.key || !processMetric.key || processMetric.key === 'unknown') {
    return '';
  }
  return `${workerMetric.key}:${assignmentPlanMetric.key}:${processMetric.key}`;
};
const findDuplicateRow = (records = []) => {
  const seen = new Set();
  for (const record of records) {
    const signature = buildWorkerStyleProcessSignature(record);
    if (!signature) continue;
    if (seen.has(signature)) return record;
    seen.add(signature);
  }
  return null;
};
const matchByIdOrName = (options = [], value, idKey = 'id', labelKey = 'name') => {
  if (!value) return null;
  const valueId = toText(value?.[idKey]);
  if (valueId) {
    const matchedById = options.find((option) => toText(option?.[idKey]) === valueId);
    if (matchedById) return matchedById;
  }
  const valueLabel = toText(value?.[labelKey]);
  if (valueLabel) {
    const matchedByLabel = options.find((option) => equalsText(option?.[labelKey], valueLabel));
    if (matchedByLabel) return matchedByLabel;
  }
  return null;
};
const buildHydratedRows = ({ records, workers, assignments }) => {
  const safeRecords = Array.isArray(records) ? records : [];
  return safeRecords.map((record, index) => {
    const matchedWorker = record?.isOutsourced === true
      ? { id: `outsource:${toText(record?.outsourceVendorName)}`, name: `외주 · ${toText(record?.outsourceVendorName)}`, vendorName: toText(record?.outsourceVendorName), isOutsourced: true }
      :
      matchByIdOrName(workers, { id: record?.workerId, name: record?.workerName }) ||
      (toText(record?.workerName)
        ? { id: record?.workerId || `legacy-worker-${index + 1}`, name: toText(record?.workerName), isLegacy: true }
        : null);

    const matchedAssignment = resolveHydratedAssignmentMatch(record, assignments);
    const legacyProcess = buildLegacyProcess(record, index);
    const matchedAssignmentProcesses = Array.isArray(matchedAssignment?.processes)
      ? matchedAssignment.processes
      : [];
    const assignment = matchedAssignment
      ? {
          ...matchedAssignment,
          styleId: toText(record?.styleCode || matchedAssignment?.styleId),
          label: toText(record?.styleName || matchedAssignment?.label),
          customer: toText(record?.customerName || matchedAssignment?.customer),
          processes: legacyProcess
            ? ensureOptionIncluded(
                matchedAssignmentProcesses,
                legacyProcess,
                (item) => item?.processKey || item?.id
              )
            : matchedAssignmentProcesses,
        }
      : buildLegacyAssignment(record, index);

    const assignmentProcessOptions = Array.isArray(assignment?.processes) ? assignment.processes : [];
    const matchedProcess =
      matchByIdOrName(
        assignmentProcessOptions,
        { styleProcessId: record?.styleProcessId, name: record?.processName },
        'styleProcessId',
        'name'
      ) ||
      assignmentProcessOptions.find((processOption) =>
        hasMatchingProcessCode(processOption, {
          processCode: record?.processCode,
          code: record?.processCode,
        })
      );
    const process = matchedProcess
        ? {
          ...matchedProcess,
          styleProcessId: toPositiveIdOrNull(
            record?.styleProcessId ?? matchedProcess?.styleProcessId
          ),
          code: toText(record?.processCode || matchedProcess?.code),
          name: toText(record?.processName || matchedProcess?.name),
          nameKo: toText(record?.processNameKo || matchedProcess?.nameKo),
          nameEn: toText(record?.processNameEn || matchedProcess?.nameEn),
          nameVi: toText(record?.processNameVi || matchedProcess?.nameVi),
        }
      : legacyProcess;

    return createBlankRow({
      worker: matchedWorker,
      styleOptionId: resolveStyleOptionId(assignment),
      assignment,
      process,
      quantity: Number(record?.quantity) > 0 ? Math.round(Number(record.quantity)) : '',
      outsourceUnitPrice: record?.isOutsourced === true ? Number(record?.outsourceUnitPrice || 0) : '',
    });
  });
};
const normalizeWorkerOptions = (workers = []) =>
  sortByLabel(Array.isArray(workers) ? workers : [], (worker) => worker?.name || worker?.email || '');
const dedupeAssignmentPlans = (plans = []) => {
  const seen = new Set();
  return (Array.isArray(plans) ? plans : []).filter((plan) => {
    const primaryKey = toText(plan?.dbId || plan?.id || plan?.externalId);
    const fallbackKey = [
      toText(plan?.lineId),
      toText(plan?.orderNo),
      toText(plan?.label || plan?.styleId),
      toText(plan?.assignmentQuantity),
      toText(plan?.startIndex),
      toText(plan?.endIndex),
    ].join('|');
    const key = primaryKey || fallbackKey;
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
const normalizeAssignmentPlans = (plans = []) =>
  sortByLabel(
    dedupeAssignmentPlans(
      (Array.isArray(plans) ? plans : [])
        .map((plan) => enrichAssignmentPlan(plan))
    )
    ,
    (plan) => formatAssignmentLabel(plan)
  );
const filterAssignmentsWithCt = (plans = []) =>
  (Array.isArray(plans) ? plans : []).filter((plan) => hasAssignmentCtSnapshot(plan));
const normalizeAssignmentPlanOptions = (plans = []) =>
  filterAssignmentsWithCt(normalizeAssignmentPlans(plans)).filter(
    (plan) => !Boolean(plan?.isCompleted)
  );
const buildDisplayProcessName = (process, languageCode) => {
  if (!process) return '-';
  const localizedName = toText(
    resolveLocalizedProcessName(
      {
        ...process,
        code: '',
      },
      languageCode
    )
  );
  return localizedName || toText(process?.name) || '-';
};
const buildDisplayProcessCode = (process) =>
  {
    const canonicalCode = stripProcessInstanceCode(process?.processCode);
    if (canonicalCode) return canonicalCode;

    const rawCode = toText(process?.code || '');
    if (!rawCode) return '';
    // processKey is an internal identity (for example style-process:185), not a
    // user-facing process code. Never expose it as a display fallback.
    if (/^(style-process|id|code|name):/i.test(rawCode)) return '';
    return stripProcessInstanceCode(rawCode);
  };
const buildProcessOptionDisplayLabel = (process, languageCode) => {
  const processName = buildDisplayProcessName(process, languageCode);
  const processCode = buildDisplayProcessCode(process);
  if (processCode && (!processName || processName === '-')) return processCode;
  return processCode ? `${processCode} · ${processName}` : processName;
};
const buildProcessIdentityKey = (process) => {
  const processKey = toText(process?.processKey || process?.id);
  if (processKey) return processKey;
  const processId = toPositiveIdOrNull(process?.processId ?? process?.id);
  if (processId) return `id:${processId}`;
  const processCode = normalizeProcessCode(process?.processCode || process?.code);
  if (processCode) return `code:${processCode}`;
  const processName = toText(process?.name || process?.processName);
  if (processName) return `name:${toKey(processName)}`;
  return '';
};
const resolveAssignmentOption = (rowAssignment, assignmentMap) => {
  if (!rowAssignment) return null;
  const assignmentKey = toText(rowAssignment?.dbId || rowAssignment?.id);
  if (!assignmentKey) return rowAssignment;
  const matchedAssignment = assignmentMap.get(assignmentKey);
  if (!matchedAssignment) return rowAssignment;
  return {
    ...matchedAssignment,
    ...rowAssignment,
    customer: toText(rowAssignment?.customer || matchedAssignment?.customer),
    label: toText(rowAssignment?.label || matchedAssignment?.label || rowAssignment?.styleId || matchedAssignment?.styleId),
    styleId: toText(rowAssignment?.styleId || matchedAssignment?.styleId),
    processes: Array.isArray(matchedAssignment?.processes)
      ? matchedAssignment.processes
      : Array.isArray(rowAssignment?.processes)
        ? rowAssignment.processes
        : [],
  };
};
const mergeMatchedProcessOption = (rowProcess, matchedProcess) => {
  if (!matchedProcess) return rowProcess;
  const resolvedCtSeconds = Math.max(
    0,
    Math.round(Number(matchedProcess?.ctSeconds ?? rowProcess?.ctSeconds) || 0)
  );
  return {
    ...rowProcess,
    ...matchedProcess,
    processId: toPositiveIdOrNull(matchedProcess?.processId ?? rowProcess?.processId),
    styleProcessId: toPositiveIdOrNull(
      matchedProcess?.styleProcessId ?? rowProcess?.styleProcessId
    ),
    code: toText(
      matchedProcess?.code ||
        matchedProcess?.processCode ||
        rowProcess?.code ||
        rowProcess?.processCode
    ),
    name: toText(
      matchedProcess?.name ||
        matchedProcess?.processName ||
        rowProcess?.name ||
        rowProcess?.processName
    ),
    nameKo: toText(
      matchedProcess?.nameKo ||
        matchedProcess?.processNameKo ||
        rowProcess?.nameKo ||
        rowProcess?.processNameKo
    ),
    nameEn: toText(
      matchedProcess?.nameEn ||
        matchedProcess?.processNameEn ||
        rowProcess?.nameEn ||
        rowProcess?.processNameEn
    ),
    nameVi: toText(
      matchedProcess?.nameVi ||
        matchedProcess?.processNameVi ||
        rowProcess?.nameVi ||
        rowProcess?.processNameVi
    ),
    processKey: toText(
      matchedProcess?.processKey ||
        rowProcess?.processKey ||
        matchedProcess?.id ||
        rowProcess?.id
    ),
    ctSeconds: resolvedCtSeconds,
  };
};
const resolveProcessOption = (rowProcess, assignment) => {
  if (!rowProcess) return null;
  const processOptions = Array.isArray(assignment?.processes) ? assignment.processes : [];
  if (processOptions.length === 0) return rowProcess;

  const targetProcessKey = toText(rowProcess?.processKey || rowProcess?.id);
  if (targetProcessKey) {
    const matchedByKey = processOptions.find(
      (processOption) =>
        toText(processOption?.processKey || processOption?.id) === targetProcessKey
    );
    if (matchedByKey) {
      return mergeMatchedProcessOption(rowProcess, matchedByKey);
    }
  }

  const targetProcessId = toPositiveIdOrNull(rowProcess?.processId ?? rowProcess?.id);
  if (targetProcessId) {
    const matchedById = processOptions.find(
      (processOption) => toPositiveIdOrNull(processOption?.processId ?? processOption?.id) === targetProcessId
    );
    if (matchedById) {
      return mergeMatchedProcessOption(rowProcess, matchedById);
    }
  }

  const matchedByCodeOrName = processOptions.find((processOption) =>
    hasMatchingProcessCode(processOption, rowProcess) ||
    hasMatchingProcessName(processOption, rowProcess)
  );
  if (matchedByCodeOrName) {
    return mergeMatchedProcessOption(rowProcess, matchedByCodeOrName);
  }

  return rowProcess;
};
const mergeProcessWithCatalog = (
  process,
  processCatalogById,
  processCatalogByCode,
  processCatalogByName
) => {
  if (!process) return null;
  const processId = toPositiveIdOrNull(process?.processId ?? process?.id);
  const processCodeCandidates = collectNormalizedProcessCodeCandidates(process);
  const matchedProcessByCode = processCodeCandidates.reduce((matched, codeCandidate) => {
    if (matched) return matched;
    return processCatalogByCode.get(codeCandidate) || null;
  }, null);
  const processNameKey = normalizeProcessNameKey(process?.name || process?.processName);
  const matchedProcess =
    (processId ? processCatalogById.get(processId) : null) ||
    matchedProcessByCode ||
    (processNameKey ? processCatalogByName.get(processNameKey) : null) ||
    null;

  if (!matchedProcess) return process;
  return {
    ...matchedProcess,
    ...process,
    processId: processId || toPositiveIdOrNull(matchedProcess?.id),
    styleProcessId: toPositiveIdOrNull(
      process?.styleProcessId ?? matchedProcess?.styleProcessId
    ),
    processCode: toText(
      process?.processCode || matchedProcess?.processCode || matchedProcess?.code
    ),
    code: toText(
      process?.processCode ||
        process?.code ||
        matchedProcess?.processCode ||
        matchedProcess?.code
    ),
    name: toText(process?.name || process?.processName || matchedProcess?.name),
    nameKo: toText(process?.nameKo || matchedProcess?.nameKo),
    nameEn: toText(process?.nameEn || matchedProcess?.nameEn || matchedProcess?.name),
    nameVi: toText(process?.nameVi || matchedProcess?.nameVi),
    processKey:
      toText(process?.processKey) ||
      toText(matchedProcess?.code) ||
      toText(matchedProcess?.id) ||
      toText(process?.id),
  };
};

const WorkDetail = ({
  initialLog = null,
  initialContext = null,
  loading = false,
  saving = false,
  onSave,
}) => {
  const { activeOrgId, activeFactoryId, activeOrgRole } = useAuth();
  const { languageCode } = useLanguage();
  const LABELS = WORK_DETAIL_LABELS[languageCode] || WORK_DETAIL_LABELS.en;
  const messages = WORK_DETAIL_MESSAGES[languageCode] || WORK_DETAIL_MESSAGES.en;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [baseLoading, setBaseLoading] = useState(() => !initialLog?.id);
  const [lineDataLoading, setLineDataLoading] = useState(false);
  const [factories, setFactories] = useState(() => {
    const initialFactory = buildFactorySelection(initialLog);
    return initialFactory ? [initialFactory] : [];
  });
  const [lines, setLines] = useState(() => {
    const initialLine = buildLineSelection(initialLog);
    return initialLine ? [initialLine] : [];
  });
  const [selectedFactory, setSelectedFactory] = useState(() => buildFactorySelection(initialLog));
  const [selectedLine, setSelectedLine] = useState(() => buildLineSelection(initialLog));
  const [workDate, setWorkDate] = useState(() => buildInitialWorkDate(initialLog));
  const [coverageStartDate, setCoverageStartDate] = useState(() =>
    buildInitialCoverageStartDate(initialLog)
  );
  const [coverageSuggestion, setCoverageSuggestion] = useState({
    previousCoverageEndDate: null,
    suggestedCoverageStartDate: null,
    isFirstLineWorkLog: false,
  });
  const [lineWorkers, setLineWorkers] = useState(() =>
    normalizeWorkerOptions(initialContext?.workers)
  );
  const [processAttributes, setProcessAttributes] = useState([]);
  const [allAssignmentPlans, setAllAssignmentPlans] = useState(() =>
    normalizeAssignmentPlans(initialContext?.assignments)
  );
  const [assignmentOptions, setAssignmentOptions] = useState(() =>
    normalizeAssignmentPlanOptions(initialContext?.assignments)
  );
  const [rows, setRows] = useState([]);
  const [editingRowId, setEditingRowId] = useState('');
  const [editingField, setEditingField] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const initialRowsHydratedRef = useRef(false);
  const hasInitialRecords = Array.isArray(initialLog?.records) && initialLog.records.length > 0;
  const initialFactoryOption = useMemo(() => buildFactorySelection(initialLog), [initialLog]);
  const initialLineOption = useMemo(() => buildLineSelection(initialLog), [initialLog]);
  const prefetchedWorkers = useMemo(
    () => normalizeWorkerOptions(initialContext?.workers),
    [initialContext?.workers]
  );
  const prefetchedAllAssignments = useMemo(
    () => normalizeAssignmentPlans(initialContext?.assignments),
    [initialContext?.assignments]
  );
  const prefetchedCtAssignments = useMemo(
    () => filterAssignmentsWithCt(prefetchedAllAssignments),
    [prefetchedAllAssignments]
  );
  const prefetchedAssignments = useMemo(
    () => prefetchedCtAssignments.filter((plan) => !Boolean(plan?.isCompleted)),
    [prefetchedCtAssignments]
  );
  const ctAssignmentPool = useMemo(
    () => filterAssignmentsWithCt(allAssignmentPlans),
    [allAssignmentPlans]
  );

  const selectedFactoryId = toPositiveIdOrNull(selectedFactory?.id);
  const selectedLineId = toPositiveIdOrNull(selectedLine?.id);
  const currentFactory = useMemo(() => {
    if (!selectedFactory) return null;
    return matchByIdOrName(factories, selectedFactory, 'id', 'name') || selectedFactory;
  }, [factories, selectedFactory]);
  const workLogOperationStartDateKey = useMemo(
    () =>
      resolveScopedFactoryManagementStartDateKey({
        factory: currentFactory || selectedFactory || null,
        factories,
      }),
    [currentFactory, factories, selectedFactory]
  );
  const workLogOperationStartDay = useMemo(
    () =>
      resolveScopedFactoryManagementStartDay({
        factory: currentFactory || selectedFactory || null,
        factories,
      }),
    [currentFactory, factories, selectedFactory]
  );
  const workLogOperationStartErrorMessage = useMemo(
    () => buildWorkLogOperationStartErrorMessage(languageCode, workLogOperationStartDateKey),
    [languageCode, workLogOperationStartDateKey]
  );
  const workDateKey = useMemo(
    () => clampWorkLogDay(workDate, workLogOperationStartDateKey).format('YYYY-MM-DD'),
    [workDate, workLogOperationStartDateKey]
  );
  const coverageStartDateKey = useMemo(
    () =>
      coverageStartDate?.isValid?.()
        ? clampWorkLogDay(coverageStartDate, workLogOperationStartDateKey).format('YYYY-MM-DD')
        : workDateKey,
    [coverageStartDate, workDateKey, workLogOperationStartDateKey]
  );
  const entryMode = useMemo(
    () => (coverageStartDateKey === workDateKey ? 'daily' : 'period_summary'),
    [coverageStartDateKey, workDateKey]
  );
  const entryModeLabel = useMemo(
    () =>
      entryMode === 'period_summary'
        ? LABELS.entryModePeriodSummary
        : LABELS.entryModeDaily,
    [entryMode]
  );
  const workDateRangeLabel = useMemo(
    () =>
      coverageStartDateKey && coverageStartDateKey !== workDateKey
        ? `${coverageStartDateKey} ~ ${workDateKey}`
        : workDateKey,
    [coverageStartDateKey, workDateKey]
  );
  const isAggregateLegacyLog = Boolean(initialLog?.id) && !toPositiveIdOrNull(initialLog?.lineId) && !toText(initialLog?.lineName);
  const initialContextKey = useMemo(() => {
    const lineId = toPositiveIdOrNull(initialContext?.line?.id ?? initialLog?.lineId);
    const dateKey = toText(initialLog?.workDate);
    const startDateKey = toText(initialLog?.coverageStartDate || initialLog?.workDate);
    if (!lineId || !dateKey) return '';
    return `${lineId}:${dateKey}:${startDateKey}`;
  }, [
    initialContext?.line?.id,
    initialLog?.lineId,
    initialLog?.workDate,
    initialLog?.coverageStartDate,
  ]);
  const currentContextKey = useMemo(() => {
    if (!selectedLineId || !workDateKey) return '';
    return `${selectedLineId}:${workDateKey}:${coverageStartDateKey || workDateKey}`;
  }, [selectedLineId, workDateKey, coverageStartDateKey]);
  const workerDebugEnabled = false;
  const isCancelledRequestError = useCallback(
    (error) =>
      Number(error?.status) === 499 ||
      error?.name === 'AbortError' ||
      toText(error?.message).toLowerCase() === 'request cancelled',
    []
  );

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;
    const loadFactories = async () => {
      if (!initialLog?.id) setBaseLoading(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const factoryRows = await requestJSON(`/factories${query}`, {
          skipGlobalLoading: true,
          signal: abortController.signal,
        }).catch(() => []);
        if (cancelled) return;
        const safeFactories = Array.isArray(factoryRows) ? factoryRows : [];
        const visibleFactories = sortByLabel(activeOrgRole === 'ADMIN' || !activeFactoryId ? safeFactories : safeFactories.filter((factory) => Number(factory?.id) === Number(activeFactoryId)), (factory) => factory?.name || '');
        setFactories((currentFactories) => {
          const merged = visibleFactories.length > 0 ? visibleFactories : currentFactories;
          return ensureOptionIncluded(merged, initialFactoryOption, (item) => item?.id || item?.name);
        });
      } finally {
        if (!cancelled) setBaseLoading(false);
      }
    };
    loadFactories();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeFactoryId, activeOrgId, activeOrgRole, initialFactoryOption, initialLog?.id]);
  useEffect(() => {
    initialRowsHydratedRef.current = false;
    setSelectedFactory(initialFactoryOption);
    setSelectedLine(initialLineOption);
    setWorkDate(buildInitialWorkDate(initialLog));
    setCoverageStartDate(buildInitialCoverageStartDate(initialLog));
    setCoverageSuggestion({
      previousCoverageEndDate: null,
      suggestedCoverageStartDate: null,
      isFirstLineWorkLog: false,
    });
    setNote(stripAutoNoteFromText(initialLog?.note || ''));
    setFactories(initialFactoryOption ? [initialFactoryOption] : []);
    setLines(initialLineOption ? [initialLineOption] : []);
    setLineWorkers(prefetchedWorkers);
    setAllAssignmentPlans(prefetchedAllAssignments);
    setAssignmentOptions(prefetchedAssignments);
    setRows(
      hasInitialRecords
        ? buildHydratedRows({
            records: initialLog?.records,
            workers: prefetchedWorkers,
            assignments: prefetchedCtAssignments,
          })
        : []
    );
    setSearchTerm('');
    setFormError('');
    setBaseLoading(!initialLog?.id);
  }, [
    hasInitialRecords,
    initialFactoryOption,
    initialLineOption,
    initialLog?.createdAt,
    initialLog?.coverageEndDate,
    initialLog?.coverageStartDate,
    initialLog?.id,
    initialLog?.note,
    initialLog?.records,
    initialLog?.workDate,
    prefetchedAllAssignments,
    prefetchedAssignments,
    prefetchedCtAssignments,
    prefetchedWorkers,
  ]);
  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    fetchProcessAttributes({
      orgId: activeOrgId,
      skipGlobalLoading: true,
      signal: abortController.signal,
    })
      .then((rows) => {
        if (cancelled) return;
        setProcessAttributes(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) {
          setProcessAttributes([]);
        }
      });

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeOrgId]);

  useEffect(() => {
    if (factories.length === 0) return;
    if (!initialLog?.id && !selectedFactory && factories.length === 1) {
      setSelectedFactory(factories[0]);
      return;
    }
    if (!selectedFactory) return;
    const matchedFactory = matchByIdOrName(factories, selectedFactory, 'id', 'name');
    if (matchedFactory && matchedFactory !== selectedFactory) {
      setSelectedFactory(matchedFactory);
    }
  }, [factories, initialLog?.id, selectedFactory]);

  useEffect(() => {
    if (initialLog?.id || !selectedFactoryId) return;
    setWorkDate((current) => {
      const clamped = clampWorkLogDay(current || dayjs(), workLogOperationStartDateKey);
      return current?.isSame?.(clamped, 'day') ? current : clamped;
    });
    setCoverageStartDate((current) => {
      const base = current?.isValid?.() ? current : workDate || dayjs();
      const clamped = clampWorkLogDay(base, workLogOperationStartDateKey);
      return current?.isSame?.(clamped, 'day') ? current : clamped;
    });
  }, [initialLog?.id, selectedFactoryId, workDate, workLogOperationStartDateKey]);

  useEffect(() => {
    if (!selectedFactoryId) {
      setLines([]);
      setSelectedLine(null);
      return;
    }
    const abortController = new AbortController();
    let cancelled = false;
    setLines([]);
    requestJSON(`/lines${buildQueryString({ orgId: activeOrgId, factoryId: selectedFactoryId })}`, {
      skipGlobalLoading: true,
      signal: abortController.signal,
    })
      .then((response) => {
        if (cancelled) return;
        const nextLines = sortByLabel(Array.isArray(response) ? response : [], (line) => line?.name || '');
        setLines(nextLines);
        setSelectedLine((currentLine) => {
          if (!currentLine && initialLog?.id) {
            return matchByIdOrName(nextLines, buildLineSelection(initialLog), 'id', 'name');
          }
          return matchByIdOrName(nextLines, currentLine, 'id', 'name') || currentLine;
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLines([]);
          setSelectedLine(null);
        }
      });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeOrgId, initialLog, selectedFactoryId]);

  useEffect(() => {
    if (!selectedFactoryId || !selectedLineId) {
      setLineWorkers([]);
      setAllAssignmentPlans([]);
      setAssignmentOptions([]);
      setLineDataLoading(false);
      return;
    }
    if (initialLog?.id && initialContext && currentContextKey === initialContextKey) {
      setLineWorkers(prefetchedWorkers);
      setAllAssignmentPlans(prefetchedAllAssignments);
      setAssignmentOptions(prefetchedAssignments);
      setCoverageSuggestion({
        previousCoverageEndDate: initialContext?.previousCoverageEndDate || null,
        suggestedCoverageStartDate: initialContext?.suggestedCoverageStartDate || null,
        isFirstLineWorkLog: Boolean(initialContext?.isFirstLineWorkLog),
      });
      setLineDataLoading(false);
      return;
    }
    const abortController = new AbortController();
    let cancelled = false;
    setLineDataLoading(true);
    loadWorkLogContext({
      orgId: activeOrgId,
      factoryId: selectedFactoryId,
      lineId: selectedLineId,
      workDate: workDateKey,
      coverageStartDate: coverageStartDateKey || workDateKey,
      debug: workerDebugEnabled,
      skipGlobalLoading: true,
      signal: abortController.signal,
    })
      .then((context) => {
        if (cancelled) return;
        if (workerDebugEnabled && context?._debug) {
          console.warn('[work-log-context][debug]', context._debug);
          if (Array.isArray(context?._debug?.stageReasonTotals)) {
            console.warn(
              '[work-log-context][debug][reason-totals]',
              context._debug.stageReasonTotals
            );
          }
          if (Array.isArray(context?._debug?.stageDropExamples)) {
            console.warn(
              '[work-log-context][debug][drop-examples]',
              context._debug.stageDropExamples
            );
          }
        }
        const normalizedAssignments = normalizeAssignmentPlans(context?.assignments);
        const normalizedCtAssignments = filterAssignmentsWithCt(normalizedAssignments);
        setAllAssignmentPlans(normalizedAssignments);
        setAssignmentOptions(
          normalizedCtAssignments.filter((plan) => !Boolean(plan?.isCompleted))
        );
        setLineWorkers(normalizeWorkerOptions(context?.workers));
        const nextCoverageSuggestion = {
          previousCoverageEndDate: context?.previousCoverageEndDate || null,
          suggestedCoverageStartDate: context?.suggestedCoverageStartDate || null,
          isFirstLineWorkLog: Boolean(context?.isFirstLineWorkLog),
        };
        setCoverageSuggestion(nextCoverageSuggestion);
        if (!initialLog?.id) {
          const suggestedStartDate = nextCoverageSuggestion.suggestedCoverageStartDate
            ? dayjs(nextCoverageSuggestion.suggestedCoverageStartDate)
            : null;
          setCoverageStartDate(
            suggestedStartDate?.isValid?.()
              ? clampWorkLogDay(suggestedStartDate, workLogOperationStartDateKey)
              : clampWorkLogDay(
                  workDate?.isValid?.() ? workDate : dayjs(),
                  workLogOperationStartDateKey
                )
          );
        }
        if (context?.line) {
          setLines((currentLines) =>
            ensureOptionIncluded(currentLines, context.line, (item) => item?.id || item?.name)
          );
        }
      })
      .catch((error) => {
        if (cancelled || isCancelledRequestError(error)) return;
        console.error('[WorkDetail.loadWorkLogContext] error', {
          orgId: activeOrgId,
          factoryId: selectedFactoryId,
          lineId: selectedLineId,
          workDate: workDateKey,
          coverageStartDate: coverageStartDateKey || workDateKey,
          status: error?.status ?? null,
          message: error?.message || String(error || ''),
          details: error?.details ?? null,
        });
        setAllAssignmentPlans([]);
        setAssignmentOptions([]);
        setLineWorkers([]);
      })
      .finally(() => {
        if (!cancelled) setLineDataLoading(false);
      });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    activeOrgId,
    currentContextKey,
    initialContext,
    initialContextKey,
    initialLog?.id,
    prefetchedAllAssignments,
    prefetchedAssignments,
    prefetchedWorkers,
    selectedFactoryId,
    selectedLineId,
    coverageStartDateKey,
    isCancelledRequestError,
    workDate,
    workDateKey,
    workLogOperationStartDateKey,
    workerDebugEnabled,
  ]);

  useEffect(() => {
    if (!initialLog?.id || initialRowsHydratedRef.current) return;
    if (!selectedFactoryId || !selectedLineId) return;
    if (!hasInitialRecords) {
      initialRowsHydratedRef.current = true;
      return;
    }
    const hydratedRows = buildHydratedRows({
      records: initialLog?.records,
      workers: lineWorkers,
      assignments: ctAssignmentPool,
    });
    setRows(hydratedRows.length > 0 ? hydratedRows : []);
    initialRowsHydratedRef.current = true;
  }, [ctAssignmentPool, hasInitialRecords, initialLog, lineWorkers, selectedFactoryId, selectedLineId]);

  useEffect(() => {
    if (initialLog?.id && hasInitialRecords) return;
    if (initialLog?.id && !initialRowsHydratedRef.current) return;
    if (!selectedFactoryId || !selectedLineId || lineDataLoading) return;
    if (lineWorkers.length === 0) {
      setRows([]);
      return;
    }
    setRows((currentRows) => {
      const safeRows = Array.isArray(currentRows) ? currentRows : [];
      if (!initialLog?.id && !initialRowsHydratedRef.current) {
        initialRowsHydratedRef.current = true;
        return [createBlankRow()];
      }
      return safeRows.length > 0 ? safeRows : [createBlankRow()];
    });
  }, [hasInitialRecords, initialLog?.id, lineDataLoading, lineWorkers.length, selectedFactoryId, selectedLineId]);
  useEffect(() => {
    if (!Array.isArray(rows) || rows.length === 0) {
      if (editingRowId) setEditingRowId('');
      if (editingField) setEditingField(null);
    }
  }, [rows]);

  const selectedFactoryWagePerSecond = Number(currentFactory?.wagePerSecond ?? currentFactory?.factoryWagePerSecond ?? initialLog?.factoryWagePerSecond);
  const hasFactoryWage = Number.isFinite(selectedFactoryWagePerSecond) && selectedFactoryWagePerSecond > 0;
  const processCatalogById = useMemo(
    () =>
      (Array.isArray(processAttributes) ? processAttributes : []).reduce((map, process) => {
        const processId = toPositiveIdOrNull(process?.id);
        if (processId) map.set(processId, process);
        return map;
      }, new Map()),
    [processAttributes]
  );
  const processCatalogByCode = useMemo(
    () =>
      (Array.isArray(processAttributes) ? processAttributes : []).reduce((map, process) => {
        const processCode = normalizeProcessCode(process?.code);
        if (processCode) map.set(processCode, process);
        return map;
      }, new Map()),
    [processAttributes]
  );
  const processCatalogByName = useMemo(() => {
    const map = new Map();
    const duplicatedKeys = new Set();
    const addProcessName = (rawName, process) => {
      const nameKey = normalizeProcessNameKey(rawName);
      if (!nameKey || duplicatedKeys.has(nameKey)) return;
      if (map.has(nameKey)) {
        map.delete(nameKey);
        duplicatedKeys.add(nameKey);
        return;
      }
      map.set(nameKey, process);
    };

    (Array.isArray(processAttributes) ? processAttributes : []).forEach((process) => {
      addProcessName(process?.name, process);
      addProcessName(process?.nameKo, process);
      addProcessName(process?.nameEn, process);
      addProcessName(process?.nameVi, process);
    });

    return map;
  }, [processAttributes]);
  const assignmentOptionMap = useMemo(
    () =>
      ctAssignmentPool.reduce((map, assignment) => {
        const key = toText(assignment?.dbId || assignment?.id);
        if (key) map.set(key, assignment);
        return map;
      }, new Map()),
    [ctAssignmentPool]
  );
  const resolveAssignmentForRow = useCallback(
    (row) => {
      const directAssignment = resolveAssignmentOption(row?.assignment, assignmentOptionMap);
      if (directAssignment && !Boolean(directAssignment?.isLegacy)) {
        return directAssignment;
      }
      const matchedAssignment = resolveHydratedAssignmentMatch(
        buildAssignmentMatchSourceFromRow(row),
        ctAssignmentPool
      );
      if (!matchedAssignment) return directAssignment;
      return {
        ...matchedAssignment,
        ...row?.assignment,
        dbId: matchedAssignment?.dbId ?? row?.assignment?.dbId ?? row?.assignment?.id ?? null,
        id: matchedAssignment?.id ?? row?.assignment?.id ?? '',
        orderNo: toText(matchedAssignment?.orderNo || row?.assignment?.orderNo),
        label: toText(
          row?.assignment?.label ||
            matchedAssignment?.label ||
            row?.assignment?.styleId ||
            matchedAssignment?.styleId
        ),
        styleId: toText(row?.assignment?.styleId || matchedAssignment?.styleId),
        assignmentQuantity:
          resolveBaselineQuantity(matchedAssignment) ??
          resolveBaselineQuantity(row?.assignment) ??
          null,
        finalQuantity:
          toPositiveIdOrNull(matchedAssignment?.finalQuantity) ??
          toPositiveIdOrNull(row?.assignment?.finalQuantity) ??
          null,
        processes: Array.isArray(matchedAssignment?.processes)
          ? matchedAssignment.processes
          : Array.isArray(row?.assignment?.processes)
            ? row.assignment.processes
            : [],
        isLegacy: false,
      };
    },
    [assignmentOptionMap, ctAssignmentPool]
  );
  const resolveProcessForRow = useCallback((row, assignmentOverride = null) => {
    const assignment = assignmentOverride || resolveAssignmentForRow(row);
    const linkedProcess = resolveProcessOption(row?.process, assignment);
    return mergeProcessWithCatalog(
      linkedProcess,
      processCatalogById,
      processCatalogByCode,
      processCatalogByName
    );
  }, [processCatalogByCode, processCatalogById, processCatalogByName, resolveAssignmentForRow]);
  const rowResolvedMetaById = useMemo(() => {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const rowId = toText(row?.id);
      if (!rowId) return;
      const assignment = resolveAssignmentForRow(row) || row?.assignment || null;
      const process = resolveProcessForRow(row, assignment) || row?.process || null;
      map.set(rowId, { assignment, process });
    });
    return map;
  }, [resolveAssignmentForRow, resolveProcessForRow, rows]);
  const rowSignatureCountByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const rowId = toText(row?.id);
      if (!rowId) return;
      const resolvedMeta = rowResolvedMetaById.get(rowId) || null;
      const signature = buildWorkerStyleProcessSignature({
        worker: row?.worker,
        assignment: resolvedMeta?.assignment || row?.assignment || null,
        process: resolvedMeta?.process || row?.process || null,
      });
      if (!signature) return;
      map.set(signature, (map.get(signature) || 0) + 1);
    });
    return map;
  }, [rowResolvedMetaById, rows]);
  const sortedAssignmentOptionsByLine = useMemo(
    () => sortAssignmentOptionsByLineContext(assignmentOptions, selectedLineId),
    [assignmentOptions, selectedLineId]
  );
  const filteredRows = useMemo(() => {
    const keyword = toText(deferredSearchTerm).toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const rowId = toText(row?.id);
      const resolvedMeta = rowResolvedMetaById.get(rowId) || null;
      const assignment = resolvedMeta?.assignment || resolveAssignmentForRow(row) || row?.assignment || null;
      const process = resolvedMeta?.process || resolveProcessForRow(row, assignment) || row?.process || null;
      const searchText = [
        row?.worker?.name,
        formatAssignmentAutocompleteLabel(assignment, selectedLineId),
        assignment?.label,
        assignment?.styleName,
        assignment?.styleId,
        assignment?.styleCode,
        assignment?.orderNo,
        assignment?.customer,
        assignment?.customerName,
        process?.name,
        process?.nameKo,
        process?.nameEn,
        process?.nameVi,
        process?.code,
        row?.quantity,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchText.includes(keyword);
    });
  }, [deferredSearchTerm, resolveAssignmentForRow, resolveProcessForRow, rowResolvedMetaById, rows, selectedLineId]);
  const workerGroupMetaByRowId = useMemo(() => {
    let previousWorkerKey = '';
    let groupId = -1;
    const map = new Map();

    filteredRows.forEach((row, index) => {
      const workerKey = toText(row?.worker?.id || row?.worker?.name || `row-${index}`);
      const isGroupStart = index === 0 || workerKey !== previousWorkerKey;
      if (isGroupStart) {
        groupId += 1;
      }
      previousWorkerKey = workerKey;
      map.set(row?.id, { groupId: Math.max(0, groupId), isGroupStart });
    });

    return map;
  }, [filteredRows]);
  const summary = useMemo(() => {
    const records = rows
      .map((row) => {
        const rowId = toText(row?.id);
        const resolvedMeta = rowResolvedMetaById.get(rowId) || null;
        const assignment = resolvedMeta?.assignment || resolveAssignmentForRow(row) || row?.assignment || null;
        const process = resolvedMeta?.process || resolveProcessForRow(row, assignment) || row?.process || null;
        return { row, assignment, process };
      })
      .filter(({ process, row }) => process && Number(row?.quantity) > 0)
      .map(({ row, assignment, process }) => ({
        rowId: toText(row?.id),
        workerId: row?.worker?.isOutsourced ? null : toPositiveIdOrNull(row?.worker?.id),
        isOutsourced: row?.worker?.isOutsourced === true,
        outsourceVendorName: row?.worker?.isOutsourced ? toText(row?.worker?.vendorName) : null,
        outsourceUnitPrice: row?.worker?.isOutsourced ? Math.max(0, Number(row?.outsourceUnitPrice) || 0) : null,
        styleId: toPositiveIdOrNull(row?.styleRefId ?? row?.styleId),
        styleCode: toText(row?.styleCode || assignment?.styleId),
        styleProcessId: toPositiveIdOrNull(process?.styleProcessId),
        ctSeconds: Math.max(0, Math.round(Number(process?.ctSeconds) || 0)),
        quantity: Math.max(0, Math.round(Number(row?.quantity) || 0)),
        assignmentPlanId: toPositiveIdOrNull(assignment?.dbId),
      }));
    const workerCount = new Set(records.map((record) => record.workerId).filter((workerId) => workerId !== null)).size;
    const workLogCtTotalSeconds = records.reduce(
      (sum, record) => sum + record.ctSeconds * record.quantity,
      0
    );
    const workLogQuantityTotal = records.reduce(
      (sum, record) => sum + record.quantity,
      0
    );
    return { records, workerCount, workLogCtTotalSeconds, workLogQuantityTotal };
  }, [resolveAssignmentForRow, resolveProcessForRow, rowResolvedMetaById, rows]);
  const assignmentLimitGroupMeta = useMemo(() => {
    const planMetaById = new Map();
    const groupMetaByKey = new Map();
    const seenPlanIds = new Set();

    ctAssignmentPool.forEach((plan) => {
      const planId = toPositiveIdOrNull(plan?.dbId);
      if (!planId || seenPlanIds.has(planId)) return;
      seenPlanIds.add(planId);

      const orderNo = toText(plan?.orderNo);
      const groupKey = orderNo ? `order:${toKey(orderNo)}` : `plan:${planId}`;
      const groupLabel = orderNo || formatAssignmentLabel(plan) || `PLAN:${planId}`;
      const baselineQuantity = Math.max(0, Math.round(Number(resolveBaselineQuantity(plan)) || 0));
      planMetaById.set(planId, { groupKey, groupLabel, orderNo });

      const currentGroup = groupMetaByKey.get(groupKey);
      if (currentGroup) {
        currentGroup.baselineQuantity += baselineQuantity;
        if (!currentGroup.orderNo && orderNo) currentGroup.orderNo = orderNo;
        return;
      }

      groupMetaByKey.set(groupKey, {
        groupKey,
        groupLabel,
        orderNo,
        baselineQuantity,
      });
    });

    groupMetaByKey.forEach((groupMeta) => {
      const baselineQuantity = Math.max(0, Math.round(Number(groupMeta?.baselineQuantity) || 0));
      groupMeta.baselineQuantity = baselineQuantity;
      groupMeta.limitQuantity = baselineQuantity > 0 ? baselineQuantity : 0;
    });

    return { planMetaById, groupMetaByKey };
  }, [ctAssignmentPool]);
  const assignmentProcessUsageBuckets = useMemo(() => {
    const buckets = new Map();
    summary.records.forEach((record) => {
      const rowId = toText(record?.rowId);
      const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
      const quantity = Math.max(0, Math.round(Number(record?.quantity) || 0));
      if (!rowId || !assignmentPlanId || quantity <= 0) return;

      const processMetric = buildProcessMetric(record);
      if (!processMetric?.key || processMetric.key === 'unknown') return;

      const planMeta = assignmentLimitGroupMeta.planMetaById.get(assignmentPlanId) || {
        groupKey: `plan:${assignmentPlanId}`,
        groupLabel: toText(record?.orderNo) || toText(record?.styleId) || `PLAN:${assignmentPlanId}`,
        orderNo: toText(record?.orderNo),
      };
      const bucketKey = `${planMeta.groupKey}:${processMetric.key}`;
      const currentBucket = buckets.get(bucketKey);
      if (currentBucket) {
        currentBucket.totalQuantity += quantity;
        currentBucket.rowIds.add(rowId);
        return;
      }
      buckets.set(bucketKey, {
        groupKey: planMeta.groupKey,
        groupLabel: planMeta.groupLabel,
        orderNo: planMeta.orderNo,
        assignmentPlanId,
        processLabel: processMetric.label,
        totalQuantity: quantity,
        rowIds: new Set([rowId]),
      });
    });

    return Array.from(buckets.values()).map((bucket) => {
      const groupMeta = assignmentLimitGroupMeta.groupMetaByKey.get(bucket.groupKey);
      const baselineQuantity = Math.max(0, Math.round(Number(groupMeta?.baselineQuantity) || 0));
      const limitQuantity = Math.max(0, Math.round(Number(groupMeta?.limitQuantity) || 0));
      return {
        ...bucket,
        baselineQuantity,
        limitQuantity,
        exceededQuantity: limitQuantity ? Math.max(0, bucket.totalQuantity - limitQuantity) : 0,
      };
    });
  }, [assignmentLimitGroupMeta, summary.records]);
  const exceededRowMetaByRowId = useMemo(() => {
    const rowMetaMap = new Map();
    assignmentProcessUsageBuckets.forEach((bucket) => {
      if (!bucket.limitQuantity || bucket.totalQuantity <= bucket.limitQuantity) return;
      bucket.rowIds.forEach((rowId) => {
        rowMetaMap.set(rowId, {
          assignmentPlanId: bucket.assignmentPlanId,
          groupKey: bucket.groupKey,
          groupLabel: bucket.groupLabel,
          orderNo: bucket.orderNo,
          processLabel: bucket.processLabel,
          baselineQuantity: bucket.baselineQuantity,
          limitQuantity: bucket.limitQuantity,
          totalQuantity: bucket.totalQuantity,
          exceededQuantity: bucket.exceededQuantity,
        });
      });
    });
    return rowMetaMap;
  }, [assignmentProcessUsageBuckets]);
  const autoExceededNote = useMemo(
    () =>
      assignmentProcessUsageBuckets
        .filter((bucket) => bucket.limitQuantity > 0 && bucket.totalQuantity > bucket.limitQuantity)
        .map((bucket) => {
          const targetLabel = toText(bucket.orderNo) || toText(bucket.groupLabel) || '-';
          const processLabel = toText(bucket.processLabel) || '-';
          return `${targetLabel} / ${processLabel} ${formatCount(bucket.exceededQuantity)}개 초과`;
        })
        .join('\n'),
    [assignmentProcessUsageBuckets]
  );
  const savedEmploymentAutoNote = useMemo(
    () => extractEmploymentAutoNoteFromText(initialLog?.note || ''),
    [initialLog?.note]
  );
  const initialComparableSnapshot = useMemo(() => {
    if (!initialLog?.id) return null;
    const initialCoverageEndDate = resolveLegacyCoverageEndDateKey(initialLog);
    const initialCoverageStartDate = toText(
      initialLog?.coverageStartDate || initialCoverageEndDate
    );
    return {
      workDate: initialCoverageEndDate,
      coverageStartDate: initialCoverageStartDate,
      coverageEndDate: initialCoverageEndDate,
      entryMode:
        toText(initialLog?.entryMode) ||
        (initialCoverageStartDate && initialCoverageStartDate !== initialCoverageEndDate
          ? 'period_summary'
          : 'daily'),
      factoryId: toPositiveIdOrNull(initialLog?.factoryId),
      lineId: toPositiveIdOrNull(initialLog?.lineId),
      note: toText(stripAutoNoteFromText(initialLog?.note || '')),
      records: buildComparableWorkRecords(initialLog?.records),
    };
  }, [
    initialLog?.coverageEndDate,
    initialLog?.coverageStartDate,
    initialLog?.entryMode,
    initialLog?.factoryId,
    initialLog?.id,
    initialLog?.lineId,
    initialLog?.note,
    initialLog?.records,
    initialLog?.workDate,
  ]);
  const currentComparableSnapshot = useMemo(() => ({
    workDate: toText(workDateKey),
    coverageStartDate: toText(coverageStartDateKey),
    coverageEndDate: toText(workDateKey),
    entryMode,
    factoryId: selectedFactoryId,
    lineId: selectedLineId,
    note: toText(note),
    records: buildComparableWorkRecords(summary.records),
  }), [coverageStartDateKey, entryMode, note, selectedFactoryId, selectedLineId, summary.records, workDateKey]);
  const isDirty = useMemo(() => {
    if (!initialLog?.id) return true;
    return (
      toStableSnapshotText(currentComparableSnapshot) !==
      toStableSnapshotText(initialComparableSnapshot)
    );
  }, [currentComparableSnapshot, initialComparableSnapshot, initialLog?.id]);
  const missingCtStyleLabels = useMemo(() => {
    const labels = [];
    const seen = new Set();
    allAssignmentPlans.forEach((plan) => {
      if (hasAssignmentCtSnapshot(plan)) return;
      const styleLabel = toText(formatAssignmentLabel(plan));
      const orderNo = toText(plan?.orderNo);
      const orderQuantity = resolveBaselineQuantity(plan);
      const compactMeta = [orderNo, orderQuantity ? formatCount(orderQuantity) : null]
        .filter(Boolean)
        .join(' ');
      const label = [styleLabel, compactMeta].filter(Boolean).join(' · ');
      if (!label || seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    });
    return labels;
  }, [allAssignmentPlans]);
  const hasRowsWithAssignmentPlanId = useMemo(
    () =>
      rows.some((row) =>
        toPositiveIdOrNull(
          rowResolvedMetaById.get(toText(row?.id))?.assignment?.dbId ??
            row?.assignment?.dbId ??
            row?.assignment?.id
        ) !== null
      ),
    [rowResolvedMetaById, rows]
  );
  const missingAssignmentPlanLinkLabels = useMemo(() => {
    const labels = [];
    const seen = new Set();
    summary.records.forEach((record) => {
      if (toPositiveIdOrNull(record?.assignmentPlanId) !== null) return;
      const styleLabel = toText(record?.orderNo) || toText(record?.styleId);
      const processLabel = toText(record?.processName) || toText(record?.processCode);
      const label = [styleLabel, processLabel].filter(Boolean).join(' / ');
      if (!label || seen.has(label)) return;
      seen.add(label);
      labels.push(label);
    });
    return labels;
  }, [summary.records]);
  const missingAssignmentPlanLinkMessage = useMemo(() => {
    if (missingAssignmentPlanLinkLabels.length === 0) return '';
    const preview = missingAssignmentPlanLinkLabels.slice(0, 3).join(', ');
    const extraCount = missingAssignmentPlanLinkLabels.length - 3;
    return preview
      ? `${LABELS.assignmentLinkRequired} ${preview}${extraCount > 0 ? ` (+${extraCount} more)` : ''}`
      : LABELS.assignmentLinkRequired;
  }, [missingAssignmentPlanLinkLabels]);
  const ctWarningMessage = useMemo(() => {
    if (ctAssignmentPool.length > 0) return '';
    if (hasRowsWithAssignmentPlanId) return '';
    if (missingCtStyleLabels.length > 0) {
      return `CT 미저장 스타일: ${missingCtStyleLabels.join(', ')}`;
    }
    return 'CT가 저장된 배정카드가 없습니다.';
  }, [ctAssignmentPool.length, hasRowsWithAssignmentPlanId, missingCtStyleLabels]);
  const resolveWorkerOptions = useCallback(
    (row) => ensureOptionIncluded(
      [...lineWorkers, { id: '__add_outsource__', name: '＋ 외주 업체 입력', isOutsourceAction: true }],
      row?.worker,
      (item) => item?.id || item?.name
    ),
    [lineWorkers]
  );
  const resolveStyleOptions = useCallback(
    (row) => {
      const currentAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
      return ensureOptionIncluded(
        sortedAssignmentOptionsByLine,
        currentAssignment,
        (item) => item?.dbId || item?.id
      );
    },
    [
      resolveAssignmentForRow,
      sortedAssignmentOptionsByLine,
    ]
  );
  const resolveSelectedStyleOption = useCallback(
    (row, options) => {
      const selectedStyleId = toText(row?.styleOptionId);
      if (selectedStyleId) {
        const matchedById = options.find(
          (option) =>
            resolveStyleOptionId(option) === selectedStyleId ||
            toText(option?.id) === selectedStyleId
        );
        if (matchedById) return matchedById;
      }

      const rowId = toText(row?.id);
      const resolvedMeta = rowResolvedMetaById.get(rowId) || null;
      const currentAssignment =
        resolvedMeta?.assignment || resolveAssignmentForRow(row) || row?.assignment || null;
      if (!currentAssignment) return null;
      const assignmentId = resolveStyleOptionId(currentAssignment);
      if (assignmentId) {
        const matchedAssignment = options.find(
          (option) =>
            resolveStyleOptionId(option) === assignmentId ||
            toText(option?.id) === assignmentId
        );
        if (matchedAssignment) return matchedAssignment;
      }
      return currentAssignment;
    },
    [resolveAssignmentForRow, rowResolvedMetaById]
  );
  const isStyleExceptionForWorker = useCallback(
    (styleOption, workerOption) => {
      if (!styleOption) return false;
      if (isOtherLineAssignmentOption(styleOption, selectedLineId)) return true;

      const workerLineId = toPositiveIdOrNull(
        workerOption?.currentLineId ?? workerOption?.lineId
      );
      const styleLineId = toPositiveIdOrNull(styleOption?.lineId);
      return Boolean(
        workerLineId !== null && styleLineId !== null && workerLineId !== styleLineId
      );
    },
    [selectedLineId]
  );
  const buildStyleOrderMetaLabel = useCallback((styleOption) => {
    if (!styleOption) return '';
    const orderNo = toText(styleOption?.orderNo);
    const orderQuantity = resolveBaselineQuantity(styleOption);
    const quantityText = orderQuantity
      ? `${formatCount(orderQuantity)}${languageCode === 'ko' ? '' : ' '}${resolveQuantityUnitLabel(languageCode)}`
      : null;
    return [orderNo, quantityText]
      .filter(Boolean)
      .join(' ');
  }, [languageCode]);
  const getStyleExceptionLabel = useCallback(
    (styleOption, workerOption) => {
      if (!styleOption) return '';
      if (!isStyleExceptionForWorker(styleOption, workerOption)) return '';
      const lineName = toText(styleOption?.lineName);
      return [LABELS.assignmentException, lineName || LABELS.assignmentOtherLine]
        .filter(Boolean)
        .join(' · ');
    },
    [isStyleExceptionForWorker]
  );
  const getStyleOptionLabel = useCallback((option) => {
    if (!option) return '';
    return formatAssignmentLabel(option);
  }, []);
  const renderStyleOption = useCallback(
    (props, option) => {
      const isException = isOtherLineAssignmentOption(option, selectedLineId);
      const orderMetaText = buildStyleOrderMetaLabel(option);
      const lineName = toText(option?.lineName);
      const secondaryText = orderMetaText || lineName;
      const description = formatAssignmentLabel(option);
      return (
        <Box
          component="li"
          {...props}
          sx={{
            display: 'block',
            px: 1,
            py: 0.75,
          }}
        >
          <Stack spacing={0.35} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  minWidth: 0,
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {description}
              </Typography>
              {isException ? (
                <Chip
                  size="small"
                  color="warning"
                  label={LABELS.assignmentException}
                  sx={{
                    height: 20,
                    '& .MuiChip-label': {
                      px: 0.75,
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    },
                  }}
                />
              ) : null}
            </Stack>
            {secondaryText ? (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                  display: 'block',
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {secondaryText}
              </Typography>
            ) : null}
          </Stack>
        </Box>
      );
    },
    [buildStyleOrderMetaLabel, selectedLineId]
  );
  const resolveProcessOptions = useCallback(
    (row) => {
      const rowId = toText(row?.id);
      const selectedStyleId = toText(row?.styleOptionId);
      const resolvedMeta = rowResolvedMetaById.get(rowId) || null;
      const currentAssignment =
        resolvedMeta?.assignment || resolveAssignmentForRow(row) || row?.assignment || null;
      const assignmentPool = ensureOptionIncluded(
        sortedAssignmentOptionsByLine,
        currentAssignment,
        (item) => item?.dbId || item?.id
      );
      const selectedAssignment = selectedStyleId
        ? assignmentPool.find(
            (option) =>
              resolveStyleOptionId(option) === selectedStyleId ||
              toText(option?.id) === selectedStyleId
          ) || null
        : currentAssignment || null;
      const sourceProcesses = Array.isArray(selectedAssignment?.processes)
        ? selectedAssignment.processes
        : [];
      const options = [];
      const seenOptionIds = new Set();
      const currentProcess =
        resolveProcessForRow(row, selectedAssignment) || resolvedMeta?.process || row?.process || null;
      const currentRowSignature = buildWorkerStyleProcessSignature({
        worker: row?.worker,
        assignment: selectedAssignment,
        process: currentProcess,
      });

      sourceProcesses.forEach((processOption, processIndex) => {
        const mergedProcess = mergeProcessWithCatalog(
          processOption,
          processCatalogById,
          processCatalogByCode,
          processCatalogByName
        );
        const candidateSignature = buildWorkerStyleProcessSignature({
          worker: row?.worker,
          assignment: selectedAssignment,
          process: mergedProcess,
        });
        if (candidateSignature) {
          const usedCount = Number(rowSignatureCountByKey.get(candidateSignature) || 0);
          const usedByOthers =
            currentRowSignature && currentRowSignature === candidateSignature
              ? Math.max(0, usedCount - 1)
              : usedCount;
          if (usedByOthers > 0) return;
        }
        const hasEquivalentOption = options.some((option) =>
          isSameProcess(option?.process, mergedProcess)
        );
        if (hasEquivalentOption) return;
        const optionId =
          buildProcessIdentityKey(mergedProcess) || `process-${processIndex + 1}`;
        if (optionId && seenOptionIds.has(optionId)) return;
        if (optionId) seenOptionIds.add(optionId);
        options.push({
          id: optionId,
          process: mergedProcess,
          searchText: buildProcessOptionDisplayLabel(mergedProcess, languageCode),
        });
      });

      if (currentProcess) {
        const currentOptionId = buildProcessIdentityKey(currentProcess);
        const hasEquivalentOption = options.some((option) =>
          isSameProcess(option?.process, currentProcess)
        );
        if (currentOptionId && !seenOptionIds.has(currentOptionId) && !hasEquivalentOption) {
          options.push({
            id: currentOptionId,
            process: currentProcess,
            searchText: buildProcessOptionDisplayLabel(currentProcess, languageCode),
          });
        }
      }

      return options;
    },
    [
      processCatalogByCode,
      processCatalogById,
      processCatalogByName,
      languageCode,
      rowResolvedMetaById,
      rowSignatureCountByKey,
      resolveAssignmentForRow,
      resolveProcessForRow,
      sortedAssignmentOptionsByLine,
    ]
  );
  const resolveSelectedProcessOption = useCallback(
    (row, options) => {
      const rowId = toText(row?.id);
      const resolvedMeta = rowResolvedMetaById.get(rowId) || null;
      const currentAssignment =
        resolvedMeta?.assignment || resolveAssignmentForRow(row) || row?.assignment || null;
      const currentProcess =
        resolvedMeta?.process || resolveProcessForRow(row, currentAssignment) || row?.process || null;
      if (!currentProcess) return null;
      const targetOptionId = buildProcessIdentityKey(currentProcess);
      if (targetOptionId) {
        const matchedById = options.find(
          (option) => String(option?.id || '') === targetOptionId
        );
        if (matchedById) return matchedById;
      }
      return options.find((option) => isSameProcess(option?.process, currentProcess)) || null;
    },
    [resolveAssignmentForRow, resolveProcessForRow, rowResolvedMetaById]
  );
  const getProcessOptionLabel = useCallback((option) => {
    const processCode = buildDisplayProcessCode(option?.process);
    if (processCode) return processCode;
    return buildDisplayProcessName(option?.process, languageCode);
  }, [languageCode]);
  const getProcessOptionMetaLabel = useCallback((option) => {
    const processCode = buildDisplayProcessCode(option?.process);
    if (!processCode) return '';
    const processName = buildDisplayProcessName(option?.process, languageCode);
    return processName && processName !== '-' ? processName : '';
  }, [languageCode]);
  const renderProcessOption = useCallback(
    (props, option) => (
      <Box
        component="li"
        {...props}
        sx={{
          display: 'block',
          px: 1,
          py: 0.75,
        }}
      >
        <Stack spacing={0.2} sx={{ minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{
              fontWeight: 600,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {buildProcessOptionDisplayLabel(option?.process, languageCode)}
          </Typography>
        </Stack>
      </Box>
    ),
    [languageCode]
  );
  const updateRow = useCallback((rowId, updater) => {
    setRows((currentRows) => currentRows.map((row) => (row.id === rowId ? updater(row) : row)));
  }, []);
  const beginFieldEdit = useCallback((rowId, field) => {
    if (!rowId) return;
    setEditingRowId(rowId);
    setEditingField({ rowId, field, token: Date.now() });
  }, []);

  const handleFactoryChange = useCallback((nextFactory) => {
    setSelectedFactory(nextFactory || null);
    setSelectedLine(null);
    setCoverageSuggestion({
      previousCoverageEndDate: null,
      suggestedCoverageStartDate: null,
      isFirstLineWorkLog: false,
    });
    if (!initialLog?.id) {
      setCoverageStartDate(
        clampWorkLogDay(
          workDate?.isValid?.() ? workDate : dayjs(),
          workLogOperationStartDateKey
        )
      );
    }
    setRows([]);
    setFormError('');
    setEditingField(null);
    setSearchTerm('');
    initialRowsHydratedRef.current = Boolean(initialLog?.id);
  }, [initialLog?.id, workDate, workLogOperationStartDateKey]);
  const handleLineChange = useCallback((nextLine) => {
    setSelectedLine(nextLine || null);
    setCoverageSuggestion({
      previousCoverageEndDate: null,
      suggestedCoverageStartDate: null,
      isFirstLineWorkLog: false,
    });
    if (!initialLog?.id) {
      setCoverageStartDate(
        clampWorkLogDay(
          workDate?.isValid?.() ? workDate : dayjs(),
          workLogOperationStartDateKey
        )
      );
    }
    setRows([]);
    setFormError('');
    setEditingField(null);
    setSearchTerm('');
    initialRowsHydratedRef.current = Boolean(initialLog?.id);
  }, [initialLog?.id, workDate, workLogOperationStartDateKey]);
  const handleWorkDateChange = useCallback((nextDate) => {
    const resolvedNextDate = clampWorkLogDay(
      nextDate || dayjs(),
      workLogOperationStartDateKey
    );
    setWorkDate(resolvedNextDate);
    setCoverageSuggestion({
      previousCoverageEndDate: null,
      suggestedCoverageStartDate: null,
      isFirstLineWorkLog: false,
    });
    setCoverageStartDate((current) => {
      if (!current?.isValid?.()) return resolvedNextDate;
      const normalizedCurrent = clampWorkLogDay(current, workLogOperationStartDateKey);
      return normalizedCurrent.isAfter(resolvedNextDate, 'day') ? resolvedNextDate : normalizedCurrent;
    });
    setRows([]);
    setFormError('');
    setEditingField(null);
    setSearchTerm('');
    initialRowsHydratedRef.current = Boolean(initialLog?.id);
  }, [initialLog?.id, workLogOperationStartDateKey]);
  const handleCoverageStartDateChange = useCallback((nextDate) => {
    setCoverageStartDate(
      clampWorkLogDay(nextDate || workDate || dayjs(), workLogOperationStartDateKey)
    );
    setFormError('');
  }, [workDate, workLogOperationStartDateKey]);
  const handleWorkerChange = useCallback((rowId, nextWorker) => {
    let resolvedWorker = nextWorker;
    if (nextWorker?.isOutsourceAction) {
      const vendorName = window.prompt('외주 업체명을 입력하세요.')?.trim();
      if (!vendorName) return;
      resolvedWorker = { id: `outsource:${vendorName}`, name: `외주 · ${vendorName}`, vendorName, isOutsourced: true };
    }
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              worker: resolvedWorker || null,
              ...(toText(row?.worker?.id || row?.worker?.name) !==
              toText(resolvedWorker?.id || resolvedWorker?.name)
                ? {
                    styleOptionId: '',
                    assignment: null,
                    process: null,
                    quantity: '',
                  }
                : {}),
            }
          : row
      )
    );
  }, []);
  const handleWorkerInputChange = useCallback((rowId, row, nextInputValue, reason) => {
    if (reason !== 'input') return;
    const selectedLabel = toText(row?.worker?.name);
    if (!selectedLabel || nextInputValue === selectedLabel) return;
    handleWorkerChange(rowId, null);
  }, [handleWorkerChange]);
  const handleStyleChange = useCallback(
    (rowId, nextOption) =>
      updateRow(rowId, (row) => ({
        ...row,
        styleOptionId: nextOption
          ? toText(nextOption?.id || nextOption?.dbId)
          : '',
        assignment: nextOption || null,
        process: null,
        quantity: '',
      })),
    [updateRow]
  );
  const handleProcessChange = useCallback(
    (rowId, nextOption) =>
      updateRow(rowId, (row) => ({
        ...row,
        process: nextOption?.process || null,
        quantity: nextOption ? row.quantity : '',
      })),
    [updateRow]
  );
  const handleStyleInputChange = useCallback((rowId, selectedStyleOption, nextInputValue, reason) => {
    if (reason !== 'input') return;
    const selectedLabel = selectedStyleOption ? getStyleOptionLabel(selectedStyleOption) : '';
    if (!selectedLabel || nextInputValue === selectedLabel) return;
    handleStyleChange(rowId, null);
  }, [getStyleOptionLabel, handleStyleChange]);
  const handleQuantityChange = useCallback((rowId, nextQuantity) => updateRow(rowId, (row) => ({ ...row, quantity: nextQuantity })), [updateRow]);
  const handleOutsourceUnitPriceChange = useCallback((rowId, value) => updateRow(rowId, (row) => ({ ...row, outsourceUnitPrice: value })), [updateRow]);
  const handleProcessInputChange = useCallback((rowId, selectedProcessOption, nextInputValue, reason) => {
    if (reason !== 'input') return;
    const selectedLabel = selectedProcessOption ? getProcessOptionLabel(selectedProcessOption) : '';
    if (!selectedLabel || nextInputValue === selectedLabel) return;
    handleProcessChange(rowId, null);
  }, [getProcessOptionLabel, handleProcessChange]);
  const buildNextRowFromTemplate = useCallback((templateRow = null) => {
    if (!templateRow) return createBlankRow();
    return createBlankRow({
      worker: templateRow?.worker || null,
      styleOptionId: toText(templateRow?.styleOptionId),
      assignment: templateRow?.assignment || null,
      process: null,
      quantity: '',
    });
  }, []);
  const handleAddBelow = useCallback((rowId, templateRowOverride = null) => {
    const nextRow = buildNextRowFromTemplate(templateRowOverride);
    const nextEditingField = resolveNextRowEditingField(nextRow);

    setRows((currentRows) => {
      const safeRows = Array.isArray(currentRows) ? currentRows : [];
      const targetIndex = safeRows.findIndex((row) => row.id === rowId);
      if (targetIndex < 0) {
        return [...safeRows, nextRow];
      }
      return [
        ...safeRows.slice(0, targetIndex + 1),
        nextRow,
        ...safeRows.slice(targetIndex + 1),
      ];
    });
    setEditingRowId(nextRow.id);
    setEditingField({
      rowId: nextRow.id,
      field: nextEditingField,
      token: Date.now(),
    });
  }, [buildNextRowFromTemplate]);
  const handleRemoveRow = useCallback((rowId) => {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      if (nextRows.length > 0) return nextRows;
      return lineWorkers.length > 0 && selectedLineId ? [createBlankRow()] : [];
    });
    setEditingField(null);
  }, [lineWorkers.length, selectedLineId]);
  const handleMoveRow = useCallback((rowId, direction) => {
    setRows((currentRows) => {
      const safeRows = Array.isArray(currentRows) ? currentRows : [];
      const currentIndex = safeRows.findIndex((row) => row.id === rowId);
      if (currentIndex < 0) return safeRows;

      const targetIndex =
        direction === 'up' ? currentIndex - 1 : direction === 'down' ? currentIndex + 1 : -1;
      if (targetIndex < 0 || targetIndex >= safeRows.length) return safeRows;

      const nextRows = [...safeRows];
      const [movedRow] = nextRows.splice(currentIndex, 1);
      nextRows.splice(targetIndex, 0, movedRow);
      return nextRows;
    });
  }, []);

  const handleSave = useCallback(() => {
    setFormError('');
    if (initialLog?.id && !isDirty) {
      return;
    }
    if (!coverageStartDateKey) {
      setFormError(messages.startDateRequired || '작업 시작일을 입력해 주세요.');
      return;
    }
    if (coverageStartDateKey > workDateKey) {
      setFormError(LABELS.coverageValidation);
      return;
    }
    if (coverageStartDateKey.slice(0, 7) !== workDateKey.slice(0, 7)) {
      setFormError(messages.sameMonthRequired || '작업 시작일과 종료일은 같은 달이어야 합니다. 월별로 나누어 등록해주세요.');
      return;
    }
    if (
      isWorkLogDateBeforeOperationStart(
        coverageStartDateKey,
        workLogOperationStartDateKey
      ) ||
      isWorkLogDateBeforeOperationStart(workDateKey, workLogOperationStartDateKey)
    ) {
      setFormError(workLogOperationStartErrorMessage);
      return;
    }
    if (!selectedFactoryId) {
      setFormError(messages.factoryRequired || '공장을 선택해 주세요.');
      return;
    }
    if (!selectedLineId) {
      setFormError(messages.lineRequired || '라인을 선택해 주세요.');
      return;
    }
    if (summary.records.length === 0) {
      setFormError(messages.noRowsToSave || '저장할 작업 행이 없습니다.');
      return;
    }
    const availableWorkerIds = new Set(lineWorkers.map((worker) => toPositiveIdOrNull(worker?.id)).filter((workerId) => workerId !== null));
    const shouldValidateWorkerLineMembership = availableWorkerIds.size > 0;
    const invalidWorkerRecord = summary.records.find((record) => {
      const workerId = toPositiveIdOrNull(record?.workerId);
      if (record?.isOutsourced) return !record?.outsourceVendorName;
      if (!workerId) return true;
      if (!shouldValidateWorkerLineMembership) return false;
      return !availableWorkerIds.has(workerId);
    });
    if (invalidWorkerRecord) {
      setFormError(messages.invalidWorkerLine || '선택한 라인에 속하지 않은 작업자가 포함되어 있습니다.');
      return;
    }
    if (!hasFactoryWage && summary.records.some((record) => !record?.isOutsourced)) {
      setFormError(messages.wageMissing || '공장 초당 공임이 설정되지 않았습니다.');
      return;
    }
    if (findDuplicateRow(summary.records)) {
      setFormError(messages.duplicateEntry || '같은 작업자가 같은 배정의 같은 공정을 같은 날짜에 중복 입력할 수 없습니다.');
      return;
    }
    if (missingAssignmentPlanLinkMessage) {
      setFormError(missingAssignmentPlanLinkMessage);
      return;
    }
    onSave?.({
      workDate: workDateKey,
      coverageStartDate: coverageStartDateKey,
      coverageEndDate: workDateKey,
      entryMode,
      factoryId: selectedFactoryId,
      factoryName: toText(currentFactory?.name),
      lineId: selectedLineId,
      lineName: toText(selectedLine?.name),
      factoryWagePerSecond: selectedFactoryWagePerSecond,
      ctBasis: 'CT',
      workerCount: summary.workerCount,
      itemCount: summary.records.length,
      totalCtSeconds: summary.workLogCtTotalSeconds,
      records: summary.records,
      note: buildCombinedNote({
        manualNote: note,
        autoNote: autoExceededNote,
        employmentAutoNote: savedEmploymentAutoNote,
      }),
    });
  }, [autoExceededNote, coverageStartDateKey, currentFactory?.name, entryMode, hasFactoryWage, initialLog?.id, isDirty, lineWorkers, missingAssignmentPlanLinkMessage, note, onSave, savedEmploymentAutoNote, selectedFactoryId, selectedFactoryWagePerSecond, selectedLine?.name, selectedLineId, summary.records, summary.workLogCtTotalSeconds, summary.workerCount, workDateKey, workLogOperationStartDateKey, workLogOperationStartErrorMessage]);
  const rowOrderIndexById = useMemo(() => {
    const map = new Map();
    rows.forEach((row, index) => {
      map.set(toText(row?.id), index);
    });
    return map;
  }, [rows]);
  const visibleRowViewModels = useMemo(
    () =>
      filteredRows.map((row) => {
        const rowId = toText(row?.id);
        const rowOrderIndex = Number(rowOrderIndexById.get(rowId) ?? -1);
        const rowExceededMeta = exceededRowMetaByRowId.get(rowId) || null;
        const isRowExceeded = Boolean(rowExceededMeta);
        const isEditingRow = isMobile || editingRowId === row.id;
        const resolvedMeta = rowResolvedMetaById.get(rowId) || null;
        const rowAssignment = resolvedMeta?.assignment || resolveAssignmentForRow(row) || row?.assignment || null;
        const rowProcess = resolvedMeta?.process || resolveProcessForRow(row, rowAssignment) || row?.process || null;
        const selectedStyleDisplayLabel = rowAssignment ? getStyleOptionLabel(rowAssignment) : '-';
        const selectedProcessDisplayLabel = rowProcess
          ? getProcessOptionLabel({ process: rowProcess })
          : '-';
        let rowWorkerOptions = [];
        let styleOptions = [];
        let selectedStyleOption = null;
        let selectedStyleOrderLabel = rowAssignment
          ? buildStyleOrderMetaLabel(rowAssignment)
          : '';
        let selectedStyleExceptionLabel = '';
        let processOptions = [];
        let selectedProcessOption = null;
        let selectedProcessMetaLabel = rowProcess
          ? getProcessOptionMetaLabel({ process: rowProcess })
          : '';
        let workerDisabled = isAggregateLegacyLog;
        let styleDisabled = isAggregateLegacyLog || !row?.worker;
        let processDisabled = isAggregateLegacyLog || !row?.worker;

        if (isEditingRow) {
          const rowForOptions = { ...row, assignment: rowAssignment, process: rowProcess };
          rowWorkerOptions = resolveWorkerOptions(rowForOptions);
          styleOptions = resolveStyleOptions(rowForOptions);
          selectedStyleOption = resolveSelectedStyleOption(rowForOptions, styleOptions);
          selectedStyleOrderLabel = selectedStyleOption
            ? buildStyleOrderMetaLabel(selectedStyleOption)
            : '';
          selectedStyleExceptionLabel = selectedStyleOption
            ? getStyleExceptionLabel(selectedStyleOption, row?.worker)
            : '';
          processOptions = resolveProcessOptions(rowForOptions);
          selectedProcessOption = resolveSelectedProcessOption(rowForOptions, processOptions);
          selectedProcessMetaLabel = selectedProcessOption
            ? getProcessOptionMetaLabel(selectedProcessOption)
            : '';
          workerDisabled = isAggregateLegacyLog || (rowWorkerOptions?.length || 0) === 0;
          styleDisabled =
            isAggregateLegacyLog || !row?.worker || (styleOptions?.length || 0) === 0;
          processDisabled =
            isAggregateLegacyLog ||
            !row?.worker ||
            !selectedStyleOption ||
            (processOptions?.length || 0) === 0;
        }
        const shouldFocusWorker = Boolean(
          editingField?.rowId === row.id &&
          editingField?.field === 'worker'
        );
        const shouldFocusStyle = Boolean(
          editingField?.rowId === row.id &&
          editingField?.field === 'style'
        );
        const shouldFocusProcess = Boolean(
          editingField?.rowId === row.id &&
          editingField?.field === 'process'
        );
        const shouldFocusQuantity = Boolean(
          editingField?.rowId === row.id &&
          editingField?.field === 'quantity'
        );
        const stylePlaceholder = !row?.worker
          ? LABELS.selectWorkerFirst
          : (styleOptions?.length || 0) === 0
            ? LABELS.noStylesAvailable
            : LABELS.stylePlaceholder;
        const processPlaceholder = !row?.worker
          ? LABELS.selectWorkerFirst
          : !selectedStyleOption
            ? LABELS.selectStyleFirst
            : (processOptions?.length || 0) === 0
              ? LABELS.noProcessesAvailable
              : LABELS.processPlaceholder;
        const rowGroupMeta = workerGroupMetaByRowId.get(row?.id) || {
          groupId: 0,
          isGroupStart: false,
        };
        const groupBackgroundColor =
          rowGroupMeta.groupId % 2 === 0 ? '#ffffff' : '#f8fbff';
        const quantityNumber = Math.max(0, Math.round(Number(row?.quantity) || 0));
        const quantityValue =
          quantityNumber > 0
            ? formatNumberWithCommas(quantityNumber, {
                fallback: '0',
                maximumFractionDigits: 0,
              })
            : '-';
        const rowCtMeta = resolveRowCtDisplayMeta({
          row,
          rowProcess,
          selectedProcessOption,
        });
        return {
          row,
          rowAssignment,
          rowProcess,
          rowNumber: rowOrderIndex >= 0 ? rowOrderIndex + 1 : null,
          canMoveUp: rowOrderIndex > 0,
          canMoveDown: rowOrderIndex >= 0 && rowOrderIndex < rows.length - 1,
          isEditingRow,
          rowExceededMeta,
          isRowExceeded,
          rowWorkerOptions,
          styleOptions,
          selectedStyleOption,
          selectedStyleDisplayLabel,
          selectedStyleOrderLabel,
          selectedStyleExceptionLabel,
          processOptions,
          selectedProcessOption,
          selectedProcessDisplayLabel,
          selectedProcessMetaLabel,
          workerDisabled,
          styleDisabled,
          processDisabled,
          shouldFocusWorker,
          shouldFocusStyle,
          shouldFocusProcess,
          shouldFocusQuantity,
          stylePlaceholder,
          processPlaceholder,
          rowGroupMeta,
          groupBackgroundColor,
          ctSecondsNumber: rowCtMeta.ctSeconds,
          totalCtSecondsNumber: rowCtMeta.totalCtSeconds,
          ctValue: rowCtMeta.ctValue,
          totalCtValue: rowCtMeta.totalCtValue,
          quantityValue,
        };
      }),
    [
      filteredRows,
      exceededRowMetaByRowId,
      rowResolvedMetaById,
      resolveAssignmentForRow,
      resolveProcessForRow,
      resolveWorkerOptions,
      resolveStyleOptions,
      resolveSelectedStyleOption,
      buildStyleOrderMetaLabel,
      getStyleExceptionLabel,
      getStyleOptionLabel,
      getProcessOptionLabel,
      resolveProcessOptions,
      resolveSelectedProcessOption,
      getProcessOptionMetaLabel,
      isAggregateLegacyLog,
      isMobile,
      editingRowId,
      editingField,
      workerGroupMetaByRowId,
      languageCode,
      rowOrderIndexById,
      rows.length,
    ]
  );
  const desktopVisibleRowViewModels = visibleRowViewModels;
  useEffect(() => {
    if (!editingField?.rowId || !editingField?.field) return;

    let cancelled = false;
    let frameId = 0;
    let timeoutId = 0;
    let attempts = 0;
    const requestedField = editingField;

    const clearRequestedField = () => {
      setEditingField((current) =>
        current?.rowId === requestedField.rowId &&
        current?.field === requestedField.field &&
        current?.token === requestedField.token
          ? null
          : current
      );
    };

    const focusTargetField = () => {
      if (cancelled) return;

      const candidates = Array.from(
        document.querySelectorAll(
          'input[data-work-row-id][data-work-field], textarea[data-work-row-id][data-work-field]'
        )
      );
      const target = candidates.find(
        (node) =>
          node instanceof HTMLElement &&
          node.dataset.workRowId === String(requestedField.rowId) &&
          node.dataset.workField === requestedField.field
      );

      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        target.scrollIntoView({
          block: isMobile ? 'center' : 'nearest',
          inline: 'nearest',
        });
        target.focus();
        const activeElement = target.ownerDocument?.activeElement;
        const hasFocusedTarget =
          activeElement === target ||
          (activeElement instanceof HTMLElement && target.contains(activeElement));
        if (!hasFocusedTarget) {
          attempts += 1;
          if (attempts >= 20) {
            clearRequestedField();
            return;
          }
          frameId = window.requestAnimationFrame(() => {
            timeoutId = window.setTimeout(focusTargetField, 0);
          });
          return;
        }
        try {
          target.select();
        } catch (_error) {
          // ignore non-selectable inputs
        }
        clearRequestedField();
        return;
      }

      attempts += 1;
      if (attempts >= 20) {
        clearRequestedField();
        return;
      }

      frameId = window.requestAnimationFrame(() => {
        timeoutId = window.setTimeout(focusTargetField, 0);
      });
    };

    frameId = window.requestAnimationFrame(focusTargetField);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [
    editingField,
    filteredRows,
    isMobile,
    rows.length,
  ]);
  useEffect(() => {
    if (isMobile || !editingRowId) return;

    const handlePointerDownOutside = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const editingRowElement = target.closest('[data-work-editing-row]');
      if (
        editingRowElement &&
        editingRowElement.getAttribute('data-work-editing-row') === String(editingRowId)
      ) {
        return;
      }

      if (target.closest('[data-work-edit-activator="true"]')) {
        return;
      }

      if (target.closest('.MuiAutocomplete-popper')) {
        return;
      }

      setEditingRowId('');
      setEditingField(null);
    };

    document.addEventListener('pointerdown', handlePointerDownOutside, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDownOutside, true);
    };
  }, [editingRowId, isMobile]);

  const detailHeader = (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{`${LABELS.title}: ${workDateRangeLabel}`}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <LastUpdaterLabel fallbackName={initialLog?.updatedBy} />
        <SaveButton
          onClick={handleSave}
          disabled={loading || baseLoading || lineDataLoading || isAggregateLegacyLog || (Boolean(initialLog?.id) && !isDirty)}
          loading={saving}
        />
      </Stack>
    </Box>
  );

  if (loading || baseLoading) {
    return (
      <AppPageContainer header={detailHeader}>
        <Paper variant="outlined" sx={{ minHeight: 280, borderRadius: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Stack spacing={1.5} alignItems="center">
            <CircularProgress size={28} />
            <Typography variant="body2" color="text.secondary">{messages.loading}</Typography>
          </Stack>
        </Paper>
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer header={detailHeader}>
      <Stack spacing={2}>
        <Paper
          variant="outlined"
          sx={{ p: 2, borderRadius: 2.5, backgroundColor: '#fbfcff' }}
        >
          <Stack spacing={1.5}>
            <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', xl: 'minmax(180px, 0.9fr) minmax(180px, 0.9fr) minmax(220px, 1fr) minmax(220px, 1fr) minmax(180px, 0.8fr)' }, alignItems: 'start' }}>
              <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={languageCode} localeText={buildDatePickerLocaleText(languageCode)}>
                <DatePicker label={LABELS.coverageStartDate} value={coverageStartDate} onChange={handleCoverageStartDateChange} minDate={workLogOperationStartDay} format="YYYY-MM-DD" slotProps={{ textField: { size: 'small', fullWidth: true } }} />
              </LocalizationProvider>
              <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={languageCode} localeText={buildDatePickerLocaleText(languageCode)}>
                <DatePicker label={LABELS.workDate} value={workDate} onChange={handleWorkDateChange} minDate={workLogOperationStartDay} format="YYYY-MM-DD" slotProps={{ textField: { size: 'small', fullWidth: true } }} />
              </LocalizationProvider>
              <SearchableSelect label={!loading && factories.length === 1 ? LABELS.autoFactory : LABELS.factory} options={factories} value={selectedFactory} onChange={(_event, value) => handleFactoryChange(value)} disabled={factories.length === 1} autoHighlight openOnFocus selectOnFocus clearOnBlur={false} handleHomeEndKeys getOptionLabel={(option) => option?.name || ''} isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')} textFieldProps={{ size: 'small' }} />
              <SearchableSelect label={LABELS.line} options={lines} value={selectedLine} onChange={(_event, value) => handleLineChange(value)} disabled={!selectedFactoryId || lines.length === 0} autoHighlight openOnFocus selectOnFocus clearOnBlur={false} handleHomeEndKeys getOptionLabel={(option) => option?.name || ''} isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')} textFieldProps={{ size: 'small' }} />
              <TextField label={LABELS.wagePerSecond} size="small" value={selectedFactoryId ? hasFactoryWage ? `${formatNumberWithCommas(selectedFactoryWagePerSecond, { fallback: '0', maximumFractionDigits: 2 })} ${LABELS.wagePerSecondUnit}` : '-' : '-'} InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }} />
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}>
              <Chip size="small" color={entryMode === 'period_summary' ? 'secondary' : 'default'} label={`${LABELS.entryMode}: ${entryModeLabel}`} />
              <Typography variant="caption" color="text.secondary">
                {messages.entryModeHelp}
              </Typography>
            </Stack>
            <TextField
              label={LABELS.note}
              value={buildCombinedNote({
                manualNote: note,
                autoNote: autoExceededNote,
                employmentAutoNote: savedEmploymentAutoNote,
              })}
              onChange={(event) => setNote(stripAutoNoteFromText(event.target.value))}
              placeholder={LABELS.notePlaceholder}
              size="small"
              fullWidth
              multiline
              minRows={2}
            />
            {!initialLog?.id && selectedLineId && !lineDataLoading && coverageSuggestion.previousCoverageEndDate && coverageSuggestion.suggestedCoverageStartDate ? (
              <Alert severity="info">
                {`${LABELS.coverageSuggestionPrefix} ${coverageSuggestion.previousCoverageEndDate}${messages.previousEndConnector}${messages.suggestedFromConnector}${coverageSuggestion.suggestedCoverageStartDate} ${LABELS.coverageSuggestionSuffix}`}
              </Alert>
            ) : null}
            {!initialLog?.id && selectedLineId && !lineDataLoading && coverageSuggestion.isFirstLineWorkLog ? (
              <Alert severity="info">{LABELS.firstLineCoverage}</Alert>
            ) : null}
            {!initialLog?.id && selectedLineId && !lineDataLoading && !coverageSuggestion.previousCoverageEndDate && !coverageSuggestion.isFirstLineWorkLog ? (
              <Alert severity="info">{LABELS.zeroCoverageHint}</Alert>
            ) : null}
            {isAggregateLegacyLog ? <Alert severity="warning">{messages.legacyReadOnly}</Alert> : null}
            {formError ? <Alert severity="error">{formError}</Alert> : null}
            {findDuplicateRow(summary.records) ? <Alert severity="warning">{messages.duplicateRows}</Alert> : null}
          </Stack>
        </Paper>

        <Paper
          variant="outlined"
          sx={{
            p: 2,
            borderRadius: 2.5,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 420,
          }}
        >
          <PageToolbar left={<SearchInput value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); }} placeholder={LABELS.searchPlaceholder} sx={{ width: { xs: '100%', sm: 320, md: 420 } }} />} sx={{ mb: 1.5 }} />

          <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            {!selectedFactoryId ? (
              <Alert severity="info">{messages.selectFactory}</Alert>
            ) : !selectedLineId ? (
              <Alert severity="info">{messages.selectLine}</Alert>
            ) : lineDataLoading && rows.length === 0 ? (
              <Alert severity="info">{messages.loadingLine}</Alert>
            ) : lineWorkers.length === 0 && rows.length === 0 ? (
              <Alert severity="warning">{messages.noWorkers}</Alert>
            ) : rows.length === 0 ? (
              <Stack spacing={1.5} alignItems="flex-start">
                {ctWarningMessage ? <Alert severity="warning">{ctWarningMessage}</Alert> : null}
                <Alert severity="info">{messages.preparingRow}</Alert>
              </Stack>
            ) : filteredRows.length === 0 ? (
              <Alert severity="info">{messages.noSearchResults}</Alert>
            ) : (
              <Stack spacing={1.25} sx={{ flex: 1, minHeight: 0 }}>
              {ctWarningMessage ? <Alert severity="warning">{ctWarningMessage}</Alert> : null}
              {missingAssignmentPlanLinkMessage ? (
                <Alert severity="warning">{missingAssignmentPlanLinkMessage}</Alert>
              ) : null}
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                <Chip
                  variant="outlined"
                  size="small"
                  label={`${LABELS.recordCount} ${formatCount(summary.records.length)}`}
                />
                <Chip
                  variant="outlined"
                  size="small"
                  label={`${LABELS.totalQuantity} ${formatCount(summary.workLogQuantityTotal)}`}
                />
                <Chip
                  color="primary"
                  variant="outlined"
                  size="small"
                  label={`${LABELS.totalQuantityCt} ${formatSeconds(summary.workLogCtTotalSeconds)}`}
                />
              </Stack>
              {isMobile ? (
                <Stack spacing={1}>
                  {visibleRowViewModels.map((rowViewModel) => {
                    const {
                      row,
                      rowNumber,
                      canMoveUp,
                      canMoveDown,
                      rowExceededMeta,
                      isRowExceeded,
                      rowWorkerOptions,
                      styleOptions,
                      selectedStyleOption,
                      selectedStyleOrderLabel,
                      selectedStyleExceptionLabel,
                      processOptions,
                      selectedProcessOption,
                      selectedProcessMetaLabel,
                      workerDisabled,
                      styleDisabled,
                      processDisabled,
                      shouldFocusWorker,
                      shouldFocusStyle,
                      shouldFocusProcess,
                      shouldFocusQuantity,
                      stylePlaceholder,
                      processPlaceholder,
                      rowGroupMeta,
                      groupBackgroundColor,
                      ctValue,
                      totalCtValue,
                    } = rowViewModel;

                    return (
                      <Paper
                        key={row.id}
                        variant="outlined"
                        sx={{
                          p: 1.25,
                          borderRadius: 2,
                          backgroundColor: groupBackgroundColor,
                          borderColor: isRowExceeded
                            ? 'error.main'
                            : rowGroupMeta.isGroupStart
                              ? '#9fb3c8'
                              : undefined,
                          borderWidth: rowGroupMeta.isGroupStart ? 2 : 1,
                        }}
                      >
                        <Stack spacing={1}>
                          <Stack
                            direction="row"
                            justifyContent="space-between"
                            alignItems="center"
                            spacing={1}
                          >
                            <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary' }}>
                              {`${LABELS.rowNumber} ${rowNumber ?? '-'}`}
                            </Typography>
                          </Stack>
                          <SearchableSelect
                            label={LABELS.worker}
                            options={rowWorkerOptions}
                            value={row?.worker || null}
                            onChange={(_event, value) => handleWorkerChange(row.id, value)}
                            onInputChange={(_event, nextInputValue, reason) =>
                              handleWorkerInputChange(row.id, row, nextInputValue, reason)
                            }
                            onKeyboardSelect={() => beginFieldEdit(row.id, 'style')}
                            autoSelect={false}
                            disabled={workerDisabled}
                            autoHighlight
                            openOnFocus
                            selectOnFocus
                            clearOnBlur={false}
                            handleHomeEndKeys
                            getOptionLabel={(option) => option?.name || ''}
                            isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')}
                            textFieldProps={{
                              size: 'small',
                              placeholder: LABELS.workerPlaceholder,
                              autoFocus: shouldFocusWorker,
                              inputProps: buildEditableFieldInputProps(row.id, 'worker'),
                            }}
                          />
                          <Stack spacing={0.35}>
                            <SearchableSelect
                              label={LABELS.style}
                              options={styleOptions}
                              value={selectedStyleOption}
                              onChange={(_event, value) => handleStyleChange(row.id, value)}
                              onInputChange={(_event, nextInputValue, reason) =>
                                handleStyleInputChange(row.id, selectedStyleOption, nextInputValue, reason)
                              }
                              onKeyboardSelect={() => beginFieldEdit(row.id, 'process')}
                              autoSelect={false}
                              disabled={styleDisabled}
                              autoHighlight
                              openOnFocus
                              selectOnFocus
                              clearOnBlur={false}
                              handleHomeEndKeys
                              getOptionLabel={getStyleOptionLabel}
                              filterOptions={filterStyleOptions}
                              isOptionEqualToValue={(option, value) =>
                                toText(option?.id || option?.dbId) ===
                                toText(value?.id || value?.dbId)
                              }
                              renderOption={renderStyleOption}
                              inputSuffix={
                                selectedStyleOrderLabel ? (
                                  <Typography
                                    component="span"
                                    variant="caption"
                                    color="text.secondary"
                                    sx={{
                                      mr: 0.35,
                                      fontSize: '0.72rem',
                                      lineHeight: 1.2,
                                      whiteSpace: 'nowrap',
                                      pointerEvents: 'none',
                                    }}
                                  >
                                    {selectedStyleOrderLabel}
                                  </Typography>
                                ) : null
                              }
                              textFieldProps={{
                                size: 'small',
                                placeholder: stylePlaceholder,
                                autoFocus: shouldFocusStyle,
                                inputProps: buildEditableFieldInputProps(row.id, 'style'),
                              }}
                            />
                            {selectedStyleExceptionLabel ? (
                              <Typography
                                variant="caption"
                                color="warning.main"
                                sx={{ fontSize: '0.68rem', lineHeight: 1.2 }}
                              >
                                {selectedStyleExceptionLabel}
                              </Typography>
                            ) : null}
                          </Stack>
                          <SearchableSelect
                            label={LABELS.process}
                            options={processOptions}
                            value={selectedProcessOption}
                            onChange={(_event, value) => handleProcessChange(row.id, value)}
                            onInputChange={(_event, nextInputValue, reason) =>
                              handleProcessInputChange(row.id, selectedProcessOption, nextInputValue, reason)
                            }
                            onKeyboardSelect={() => beginFieldEdit(row.id, 'quantity')}
                            autoSelect={false}
                            disabled={processDisabled}
                            autoHighlight
                            openOnFocus
                            selectOnFocus
                            clearOnBlur={false}
                            handleHomeEndKeys
                            getOptionLabel={getProcessOptionLabel}
                            isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')}
                            renderOption={renderProcessOption}
                            inputSuffix={
                              selectedProcessMetaLabel ? (
                                <Typography
                                  component="span"
                                  variant="caption"
                                  color="text.secondary"
                                  sx={{
                                    mr: 0.35,
                                    fontSize: '0.72rem',
                                    lineHeight: 1.2,
                                    whiteSpace: 'nowrap',
                                    pointerEvents: 'none',
                                  }}
                                >
                                  {selectedProcessMetaLabel}
                                </Typography>
                              ) : null
                            }
                            textFieldProps={{
                              size: 'small',
                              placeholder: processPlaceholder,
                              autoFocus: shouldFocusProcess,
                              inputProps: buildEditableFieldInputProps(row.id, 'process'),
                            }}
                          />
                          <TextField
                            label={LABELS.quantity}
                            type="number"
                            size="small"
                            error={isRowExceeded}
                            helperText={isRowExceeded ? buildQuantityExceededHelperText(rowExceededMeta) : ''}
                            value={row?.quantity ?? ''}
                            onChange={(event) => {
                              const nextValue = event.target.value;
                              if (nextValue === '') {
                                handleQuantityChange(row.id, '');
                                return;
                              }
                              const parsed = Number.parseInt(nextValue, 10);
                              if (Number.isFinite(parsed) && parsed > 0) {
                                handleQuantityChange(row.id, parsed);
                              }
                            }}
                            onKeyDown={(event) => {
                              if (['-', '+', 'e', 'E', '.'].includes(event.key)) {
                                event.preventDefault();
                                return;
                              }
                              if (
                                !event.nativeEvent.isComposing &&
                                ((event.key === 'Enter' && !event.shiftKey) ||
                                  (event.key === 'Tab' && !event.shiftKey))
                              ) {
                                event.preventDefault();
                                handleAddBelow(row.id, row);
                              }
                            }}
                            disabled={isAggregateLegacyLog || !selectedProcessOption?.process}
                            inputProps={buildEditableFieldInputProps(row.id, 'quantity', { min: 1 })}
                            fullWidth
                            autoFocus={shouldFocusQuantity}
                          />
                          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                              label={row?.worker?.isOutsourced ? '외주 개당 단가' : LABELS.ctSeconds}
                              size="small"
                              type={row?.worker?.isOutsourced ? 'number' : undefined}
                              value={row?.worker?.isOutsourced ? (row?.outsourceUnitPrice ?? '') : ctValue}
                              onChange={row?.worker?.isOutsourced
                                ? (event) => handleOutsourceUnitPriceChange(row.id, event.target.value)
                                : undefined}
                              inputProps={row?.worker?.isOutsourced ? { min: 0 } : undefined}
                              InputProps={row?.worker?.isOutsourced ? undefined : { readOnly: true }}
                              color={row?.worker?.isOutsourced ? 'warning' : undefined}
                              fullWidth
                            />
                            <TextField
                              label={LABELS.quantityCtTotal}
                              size="small"
                              value={totalCtValue}
                              InputProps={{ readOnly: true }}
                              fullWidth
                            />
                          </Stack>
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                            <Tooltip title={LABELS.addBelow}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleAddBelow(row.id, row);
                                  }}
                                  disabled={isAggregateLegacyLog}
                                  aria-label={LABELS.addBelow}
                                >
                                  <AddIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={LABELS.moveUp}>
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleMoveRow(row.id, 'up');
                                  }}
                                  disabled={isAggregateLegacyLog || !canMoveUp}
                                  aria-label={LABELS.moveUp}
                                >
                                  <KeyboardArrowUpIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={LABELS.moveDown}>
                              <span>
                                <IconButton
                                  size="small"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleMoveRow(row.id, 'down');
                                  }}
                                  disabled={isAggregateLegacyLog || !canMoveDown}
                                  aria-label={LABELS.moveDown}
                                >
                                  <KeyboardArrowDownIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={LABELS.remove}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleRemoveRow(row.id);
                                  }}
                                  disabled={isAggregateLegacyLog || rows.length <= 1}
                                  aria-label={LABELS.remove}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        </Stack>
                      </Paper>
                    );
                  })}
                </Stack>
              ) : (
                <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  <TableContainer
                    component={Paper}
                    variant="outlined"
                    sx={{
                      borderRadius: 2,
                      overflowX: 'auto',
                      overflowY: 'visible',
                    }}
                  >
                  <Table stickyHeader size="small" sx={{ tableLayout: 'fixed' }}>
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ width: 56 }} align="center">{LABELS.rowNumber}</TableCell>
                        <TableCell sx={{ width: '14%' }}>{LABELS.worker}</TableCell>
                        <TableCell sx={{ width: '24%' }}>{LABELS.style}</TableCell>
                        <TableCell sx={{ width: '21%' }}>{LABELS.process}</TableCell>
                        <TableCell sx={{ width: '10%' }} align="right">{LABELS.ctSeconds}</TableCell>
                        <TableCell sx={{ width: '9%' }} align="right">{LABELS.quantity}</TableCell>
                        <TableCell sx={{ width: '12%' }} align="right">{LABELS.quantityCtTotal}</TableCell>
                        <TableCell sx={{ width: 148 }} align="right">&nbsp;</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                    {desktopVisibleRowViewModels.map((rowViewModel) => {
                      const {
                        row,
                        rowNumber,
                        canMoveUp,
                        canMoveDown,
                        rowExceededMeta,
                        isRowExceeded,
                        rowWorkerOptions,
                        styleOptions,
                        selectedStyleOption,
                        selectedStyleDisplayLabel,
                        selectedStyleOrderLabel,
                        selectedStyleExceptionLabel,
                        processOptions,
                        selectedProcessOption,
                        selectedProcessDisplayLabel,
                        selectedProcessMetaLabel,
                        styleDisabled,
                        processDisabled,
                        workerDisabled,
                        isEditingRow,
                        shouldFocusWorker,
                        shouldFocusStyle,
                        shouldFocusProcess,
                        shouldFocusQuantity,
                        stylePlaceholder,
                        processPlaceholder,
                        rowGroupMeta,
                        groupBackgroundColor,
                        ctValue,
                        totalCtValue,
                        quantityValue,
                      } = rowViewModel;

                      return (
                        <TableRow
                          key={row.id}
                          hover
                          data-work-desktop-row="true"
                          data-work-editing-row={isEditingRow ? row.id : undefined}
                          sx={{
                            contentVisibility: 'auto',
                            containIntrinsicSize: '56px',
                            '& > td': {
                              backgroundColor: isRowExceeded ? '#fff5f5' : groupBackgroundColor,
                            },
                            ...(rowGroupMeta.isGroupStart
                              ? {
                                  '& > td': {
                                    backgroundColor: isRowExceeded ? '#fff5f5' : groupBackgroundColor,
                                    borderTopColor: '#9fb3c8',
                                    borderTopWidth: 2,
                                  },
                                }
                              : {}),
                          }}
                        >
                          <TableCell align="center" sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: 'text.secondary' }}>
                              {rowNumber ?? '-'}
                            </Typography>
                          </TableCell>
                          <TableCell sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <Stack spacing={0.5}>
                              <SearchableSelect
                                options={rowWorkerOptions}
                                value={row?.worker || null}
                                onChange={(_event, value) => handleWorkerChange(row.id, value)}
                                onInputChange={(_event, nextInputValue, reason) =>
                                  handleWorkerInputChange(row.id, row, nextInputValue, reason)
                                }
                                onKeyboardSelect={() => beginFieldEdit(row.id, 'style')}
                                autoSelect={false}
                                disabled={workerDisabled}
                                autoHighlight
                                openOnFocus
                                selectOnFocus
                                clearOnBlur={false}
                                handleHomeEndKeys
                                getOptionLabel={(option) => option?.name || ''}
                                isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')}
                                textFieldProps={{
                                  size: 'small',
                                  hiddenLabel: true,
                                  placeholder: LABELS.workerPlaceholder,
                                  autoFocus: shouldFocusWorker,
                                  sx: DESKTOP_INLINE_FIELD_SX,
                                  inputProps: buildEditableFieldInputProps(row.id, 'worker'),
                                }}
                              />
                              </Stack>
                            ) : (
                              <Box
                                data-work-edit-activator="true"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'worker');
                                }}
                                sx={{
                                  ...DESKTOP_INLINE_TEXT_SX,
                                  whiteSpace: 'nowrap',
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                <Typography color={row?.worker?.isOutsourced ? 'warning.main' : 'inherit'} fontWeight={row?.worker?.isOutsourced ? 700 : 400}>{toText(row?.worker?.name) || '-'}</Typography>
                              </Box>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <Stack spacing={0.35}>
                                <SearchableSelect
                                  options={styleOptions}
                                  value={selectedStyleOption}
                                  onChange={(_event, value) => handleStyleChange(row.id, value)}
                                  onInputChange={(_event, nextInputValue, reason) =>
                                    handleStyleInputChange(row.id, selectedStyleOption, nextInputValue, reason)
                                  }
                                  onKeyboardSelect={() => beginFieldEdit(row.id, 'process')}
                                  autoSelect={false}
                                  disabled={styleDisabled}
                                  autoHighlight
                                  openOnFocus
                                  selectOnFocus
                                  clearOnBlur={false}
                                  handleHomeEndKeys
                                  getOptionLabel={getStyleOptionLabel}
                                  filterOptions={filterStyleOptions}
                                  isOptionEqualToValue={(option, value) =>
                                    toText(option?.id || option?.dbId) ===
                                    toText(value?.id || value?.dbId)
                                  }
                                  renderOption={renderStyleOption}
                                  inputSuffix={
                                    selectedStyleOrderLabel ? (
                                      <Typography
                                        component="span"
                                        variant="caption"
                                        color="text.secondary"
                                        sx={{
                                          mr: 0.35,
                                          fontSize: '0.72rem',
                                          lineHeight: 1.2,
                                          whiteSpace: 'nowrap',
                                          pointerEvents: 'none',
                                        }}
                                      >
                                        {selectedStyleOrderLabel}
                                      </Typography>
                                    ) : null
                                  }
                                  textFieldProps={{
                                    size: 'small',
                                    hiddenLabel: true,
                                    placeholder: stylePlaceholder,
                                    autoFocus: shouldFocusStyle,
                                    sx: DESKTOP_INLINE_FIELD_SX,
                                    inputProps: buildEditableFieldInputProps(row.id, 'style'),
                                  }}
                                />
                                {selectedStyleExceptionLabel ? (
                                  <Typography
                                    variant="caption"
                                    color="warning.main"
                                    sx={{ fontSize: '0.68rem', lineHeight: 1.2 }}
                                  >
                                    {selectedStyleExceptionLabel}
                                  </Typography>
                                ) : null}
                              </Stack>
                            ) : (
                              <Box
                                data-work-edit-activator="true"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'style');
                                }}
                                sx={{
                                  ...DESKTOP_INLINE_TEXT_SX,
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                <Box sx={DESKTOP_INLINE_TEXT_PAIR_SX}>
                                  <Typography component="span" variant="body2" sx={DESKTOP_INLINE_TEXT_PRIMARY_SX}>
                                    {selectedStyleDisplayLabel}
                                  </Typography>
                                  {selectedStyleOrderLabel ? (
                                    <Typography component="span" variant="caption" color="text.secondary" sx={DESKTOP_INLINE_TEXT_SECONDARY_SX}>
                                      {selectedStyleOrderLabel}
                                    </Typography>
                                  ) : null}
                                </Box>
                              </Box>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <SearchableSelect
                                options={processOptions}
                                value={selectedProcessOption}
                                onChange={(_event, value) => handleProcessChange(row.id, value)}
                                onInputChange={(_event, nextInputValue, reason) =>
                                  handleProcessInputChange(row.id, selectedProcessOption, nextInputValue, reason)
                                }
                                onKeyboardSelect={() => beginFieldEdit(row.id, 'quantity')}
                                autoSelect={false}
                                disabled={processDisabled}
                                autoHighlight
                                openOnFocus
                                selectOnFocus
                                clearOnBlur={false}
                                handleHomeEndKeys
                                getOptionLabel={getProcessOptionLabel}
                                isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')}
                                renderOption={renderProcessOption}
                                inputSuffix={
                                  selectedProcessMetaLabel ? (
                                    <Typography
                                      component="span"
                                      variant="caption"
                                      color="text.secondary"
                                      sx={{
                                        mr: 0.35,
                                        fontSize: '0.72rem',
                                        lineHeight: 1.2,
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'none',
                                      }}
                                    >
                                      {selectedProcessMetaLabel}
                                    </Typography>
                                  ) : null
                                }
                                textFieldProps={{
                                  size: 'small',
                                  hiddenLabel: true,
                                  placeholder: processPlaceholder,
                                  autoFocus: shouldFocusProcess,
                                  sx: DESKTOP_INLINE_FIELD_SX,
                                  inputProps: buildEditableFieldInputProps(row.id, 'process'),
                                }}
                              />
                            ) : (
                              <Box
                                data-work-edit-activator="true"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'process');
                                }}
                                sx={{
                                  ...DESKTOP_INLINE_TEXT_SX,
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                <Box sx={DESKTOP_INLINE_TEXT_PAIR_SX}>
                                  <Typography component="span" variant="body2" sx={DESKTOP_INLINE_TEXT_PRIMARY_SX}>
                                    {selectedProcessDisplayLabel}
                                  </Typography>
                                  {selectedProcessMetaLabel ? (
                                    <Typography component="span" variant="caption" color="text.secondary" sx={DESKTOP_INLINE_TEXT_SECONDARY_SX}>
                                      {selectedProcessMetaLabel}
                                    </Typography>
                                  ) : null}
                                </Box>
                              </Box>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {row?.worker?.isOutsourced && isEditingRow ? (
                              <TextField
                                type="number"
                                size="small"
                                value={row?.outsourceUnitPrice ?? ''}
                                onChange={(event) => handleOutsourceUnitPriceChange(row.id, event.target.value)}
                                inputProps={{ min: 0, 'aria-label': '외주 개당 단가' }}
                                placeholder="개당 단가"
                                color="warning"
                                fullWidth
                                hiddenLabel
                                sx={DESKTOP_INLINE_FIELD_SX}
                              />
                            ) : (
                              <Typography
                                variant="body2"
                                color={row?.worker?.isOutsourced ? 'warning.main' : 'inherit'}
                                sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: row?.worker?.isOutsourced ? 700 : 400 }}
                              >
                                {row?.worker?.isOutsourced
                                  ? `${formatCount(row?.outsourceUnitPrice || 0)}동`
                                  : ctValue}
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <TextField
                                type="number"
                                size="small"
                                error={isRowExceeded}
                                helperText={isRowExceeded ? buildQuantityExceededHelperText(rowExceededMeta) : ''}
                                value={row?.quantity ?? ''}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  if (nextValue === '') {
                                    handleQuantityChange(row.id, '');
                                    return;
                                  }
                                  const parsed = Number.parseInt(nextValue, 10);
                                  if (Number.isFinite(parsed) && parsed > 0) {
                                    handleQuantityChange(row.id, parsed);
                                  }
                                }}
                                onKeyDown={(event) => {
                                  if (['-', '+', 'e', 'E', '.'].includes(event.key)) {
                                    event.preventDefault();
                                    return;
                                  }
                                  if (
                                    !event.nativeEvent.isComposing &&
                                    ((event.key === 'Enter' && !event.shiftKey) ||
                                      (event.key === 'Tab' && !event.shiftKey))
                                  ) {
                                    event.preventDefault();
                                    handleAddBelow(row.id, row);
                                  }
                                }}
                                disabled={isAggregateLegacyLog || !selectedProcessOption?.process}
                                inputProps={buildEditableFieldInputProps(row.id, 'quantity', { min: 1 })}
                                fullWidth
                                hiddenLabel
                                placeholder={LABELS.quantity}
                                sx={DESKTOP_INLINE_FIELD_SX}
                                autoFocus={shouldFocusQuantity}
                              />
                            ) : (
                              <Box
                                data-work-edit-activator="true"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'quantity');
                                }}
                                sx={{
                                  ...DESKTOP_INLINE_TEXT_SX,
                                  justifyContent: 'flex-end',
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                {quantityValue}
                              </Box>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            <Typography variant="body2" sx={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                              {totalCtValue}
                            </Typography>
                          </TableCell>
                          <TableCell align="right" sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            <Stack
                              direction="row"
                              spacing={0.5}
                              justifyContent="flex-end"
                              alignItems="center"
                              sx={{ minHeight: 40 }}
                            >
                              <Tooltip title={LABELS.addBelow}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color="primary"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleAddBelow(row.id, row);
                                    }}
                                    disabled={isAggregateLegacyLog}
                                    aria-label={LABELS.addBelow}
                                  >
                                    <AddIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={LABELS.moveUp}>
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleMoveRow(row.id, 'up');
                                    }}
                                    disabled={isAggregateLegacyLog || !canMoveUp}
                                    aria-label={LABELS.moveUp}
                                  >
                                    <KeyboardArrowUpIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={LABELS.moveDown}>
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleMoveRow(row.id, 'down');
                                    }}
                                    disabled={isAggregateLegacyLog || !canMoveDown}
                                    aria-label={LABELS.moveDown}
                                  >
                                    <KeyboardArrowDownIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                              <Tooltip title={LABELS.remove}>
                                <span>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      handleRemoveRow(row.id);
                                    }}
                                    disabled={isAggregateLegacyLog || rows.length <= 1}
                                    aria-label={LABELS.remove}
                                  >
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
              )}
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: { xs: 'column', sm: 'row' },
                  alignItems: { xs: 'flex-start', sm: 'center' },
                  justifyContent: 'space-between',
                  gap: 1,
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  {`${filteredRows.length}개${toText(searchTerm) ? ` (전체 ${rows.length}개)` : ''}`}
                </Typography>
              </Box>
            </Stack>
          )}
          </Box>
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default WorkDetail;


