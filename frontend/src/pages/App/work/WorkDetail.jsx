import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Pagination,
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
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { hasAssignmentCtSnapshot, resolveAssignmentCtSnapshot } from '../../../utils/assignmentCt';
import { resolveLocalizedProcessName } from '../../../utils/processDisplay';
import { loadWorkLogContext } from './workLogStorage';

const { useDeferredValue } = React;

const COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const AUTO_NOTE_PREFIX = '[자동 메모]';
const AUTO_NOTE_MARKER = `\n\n${AUTO_NOTE_PREFIX}\n`;
const ROWS_PER_PAGE = 30;
const LABELS = {
  title: '기록 상세',
  workDate: '작업일자',
  factory: '공장',
  autoFactory: '공장 (자동선택)',
  line: '라인',
  wagePerSecond: '초당 공임',
  wagePerSecondUnit: '동/초',
  note: '비고',
  notePlaceholder: '메모를 입력하세요.',
  autoNote: '자동 메모',
  searchPlaceholder: '작업자/스타일/공정 검색',
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
  quantity: '생산량',
  addBelow: '아래 작업자 추가',
  remove: '작업자 삭제',
};

const toText = (value) => String(value || '').trim();
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
  ...patch,
});
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
const buildInitialWorkDate = (log) => {
  const nextDate = dayjs(log?.workDate || log?.createdAt || undefined);
  return nextDate.isValid() ? nextDate : dayjs();
};
const stripAutoNoteFromText = (value) => {
  const text = String(value || '');
  const leadingPrefix = `${AUTO_NOTE_PREFIX}\n`;
  if (text.startsWith(leadingPrefix)) return '';
  const leadingMarkerIndex = text.indexOf(leadingPrefix);
  if (leadingMarkerIndex >= 0) return text.slice(0, leadingMarkerIndex).trimEnd();
  const markerIndex = text.indexOf(AUTO_NOTE_MARKER);
  return markerIndex >= 0 ? text.slice(0, markerIndex) : text;
};
const buildCombinedNote = ({ manualNote, autoNote }) => {
  const trimmedManual = toText(manualNote);
  const trimmedAuto = toText(autoNote);
  if (trimmedManual && trimmedAuto) return `${trimmedManual}${AUTO_NOTE_MARKER}${trimmedAuto}`;
  if (trimmedAuto) return `${AUTO_NOTE_PREFIX}\n${trimmedAuto}`;
  return trimmedManual;
};
const formatAssignmentLabel = (assignment) => {
  const styleLabel = toText(assignment?.label || assignment?.styleName || assignment?.styleId);
  if (styleLabel) return styleLabel;
  if (assignment?.dbId) return `배정카드 #${assignment.dbId}`;
  return '배정카드';
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
        Math.round(Number(process?.ctPerPieceSeconds ?? process?.ctSeconds) || 0)
      ),
    };
  });
  return mappedProcesses;
};
const enrichAssignmentPlan = (plan) => ({ ...plan, processes: buildPlanProcessOptions(plan) });
const buildLegacyProcess = (record, index = 0) => {
  const processId = toPositiveIdOrNull(record?.processId);
  const processCode = toText(record?.processCode);
  const processName = toText(record?.processName);
  const processKey = processId ? `id:${processId}` : processCode || processName || `legacy-process-${index + 1}`;
  if (!processId && !processCode && !processName) return null;

  return {
    id: `legacy-process-${index + 1}-${processKey}`,
    processKey,
    processId,
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
  const assignmentLabel = toText(record?.styleName) || toText(record?.styleId);

  return {
    dbId: assignmentPlanId || `legacy-assignment-${index + 1}`,
    id: `legacy-assignment-${index + 1}`,
    customer: toText(record?.customerName),
    label: assignmentLabel,
    styleId: toText(record?.styleId),
    colorId: toPositiveIdOrNull(record?.colorId),
    color: toText(record?.colorCode),
    colorName: toText(record?.colorName || record?.colorCode),
    quantity: Number(record?.quantity) || null,
    finalQuantity: null,
    isLegacy: true,
    processes: fallbackProcess ? [fallbackProcess] : [],
  };
};
const resolveBaselineQuantity = (plan) => {
  const finalQuantity = Number(plan?.finalQuantity);
  if (Number.isFinite(finalQuantity) && finalQuantity > 0) return Math.round(finalQuantity);
  const quantity = Number(plan?.quantity);
  if (Number.isFinite(quantity) && quantity > 0) return Math.round(quantity);
  return null;
};
const buildProcessMetric = (process) => {
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
const buildStyleMetric = (value = {}) => {
  const styleUid = toPositiveIdOrNull(value?.styleUid);
  if (styleUid) {
    return {
      key: `uid:${styleUid}`,
      label: toText(value?.styleId) || toText(value?.styleName) || `UID:${styleUid}`,
    };
  }
  const styleId = toText(value?.styleId);
  if (styleId) return { key: `id:${toKey(styleId)}`, label: styleId };
  const styleName = toText(value?.styleName);
  if (styleName) return { key: `name:${toKey(styleName)}`, label: styleName };
  const assignmentPlanId = toPositiveIdOrNull(value?.assignmentPlanId);
  if (assignmentPlanId) return { key: `plan:${assignmentPlanId}`, label: `PLAN:${assignmentPlanId}` };
  return { key: '', label: '' };
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
  const styleMetric = buildStyleMetric({
    styleUid: value?.styleUid ?? value?.assignment?.styleUid,
    styleId: value?.styleId ?? value?.assignment?.styleId,
    styleName:
      value?.styleName ??
      value?.assignment?.label ??
      value?.assignment?.styleName ??
      value?.assignment?.styleId,
    assignmentPlanId: value?.assignmentPlanId ?? value?.assignment?.dbId,
  });
  const processMetric = buildProcessMetric({
    processId: value?.processId ?? value?.process?.processId ?? value?.process?.id,
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
  if (!workerMetric.key || !styleMetric.key || !processMetric.key || processMetric.key === 'unknown') {
    return '';
  }
  return `${workerMetric.key}:${styleMetric.key}:${processMetric.key}`;
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
    const matchedWorker =
      matchByIdOrName(workers, { id: record?.workerId, name: record?.workerName }) ||
      (toText(record?.workerName)
        ? { id: record?.workerId || `legacy-worker-${index + 1}`, name: toText(record?.workerName), isLegacy: true }
        : null);

    const matchedAssignment = assignments.find((item) => String(item?.dbId || '') === String(record?.assignmentPlanId || '')) || null;
    const legacyProcess = buildLegacyProcess(record, index);
    const matchedAssignmentProcesses = Array.isArray(matchedAssignment?.processes)
      ? matchedAssignment.processes
      : [];
    const assignment = matchedAssignment
      ? {
          ...matchedAssignment,
          styleId: toText(record?.styleId || matchedAssignment?.styleId),
          label: toText(record?.styleName || matchedAssignment?.label),
          customer: toText(record?.customerName || matchedAssignment?.customer),
          color: toText(record?.colorCode || matchedAssignment?.color),
          colorName: toText(record?.colorName || record?.colorCode || matchedAssignment?.colorName),
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
        { processId: record?.processId, name: record?.processName },
        'processId',
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
          processId: toPositiveIdOrNull(record?.processId ?? matchedProcess?.processId),
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
    });
  });
};
const normalizeWorkerOptions = (workers = []) =>
  sortByLabel(Array.isArray(workers) ? workers : [], (worker) => worker?.name || worker?.email || '');
const normalizeAssignmentPlans = (plans = []) =>
  sortByLabel(
    (Array.isArray(plans) ? plans : [])
      .map((plan) => enrichAssignmentPlan(plan)),
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

    const rawCode = toText(process?.code || process?.processKey || '');
    if (!rawCode) return '';
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
    color: toText(rowAssignment?.color || matchedAssignment?.color),
    colorName: toText(
      rowAssignment?.colorName ||
        matchedAssignment?.colorName ||
        rowAssignment?.color ||
        matchedAssignment?.color
    ),
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

const WorkDetail = ({ initialLog = null, initialContext = null, loading = false, saving = false, onSave }) => {
  const { activeOrgId, activeFactoryId, activeOrgRole } = useAuth();
  const { languageCode } = useLanguage();
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
  const [page, setPage] = useState(1);
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
  const workDateKey = useMemo(() => (workDate?.isValid?.() ? workDate.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')), [workDate]);
  const isAggregateLegacyLog = Boolean(initialLog?.id) && !toPositiveIdOrNull(initialLog?.lineId) && !toText(initialLog?.lineName);
  const initialContextKey = useMemo(() => {
    const lineId = toPositiveIdOrNull(initialContext?.line?.id ?? initialLog?.lineId);
    const dateKey = toText(initialLog?.workDate);
    if (!lineId || !dateKey) return '';
    return `${lineId}:${dateKey}`;
  }, [initialContext?.line?.id, initialLog?.lineId, initialLog?.workDate]);
  const currentContextKey = useMemo(() => {
    if (!selectedLineId || !workDateKey) return '';
    return `${selectedLineId}:${workDateKey}`;
  }, [selectedLineId, workDateKey]);
  const workerDebugEnabled = false;

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
    setPage(1);
    setSearchTerm('');
    setFormError('');
    setBaseLoading(!initialLog?.id);
  }, [
    hasInitialRecords,
    initialFactoryOption,
    initialLineOption,
    initialLog?.createdAt,
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
        if (context?.line) {
          setLines((currentLines) =>
            ensureOptionIncluded(currentLines, context.line, (item) => item?.id || item?.name)
          );
        }
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
    workDateKey,
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
  useEffect(() => {
    if (!editingField) return;
    if (!editingRowId || editingField.rowId !== editingRowId) return;
    const timerId = window.setTimeout(() => {
      setEditingField(null);
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [editingField, editingRowId]);

  const currentFactory = useMemo(() => {
    if (!selectedFactory) return null;
    return matchByIdOrName(factories, selectedFactory, 'id', 'name') || selectedFactory;
  }, [factories, selectedFactory]);
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
    (row) => resolveAssignmentOption(row?.assignment, assignmentOptionMap),
    [assignmentOptionMap]
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
  const filteredRows = useMemo(() => {
    const keyword = toText(deferredSearchTerm).toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const assignment = resolveAssignmentForRow(row) || row?.assignment || null;
      const process = resolveProcessForRow(row, assignment) || row?.process || null;
      const searchText = [
        row?.worker?.name,
        formatAssignmentAutocompleteLabel(assignment, selectedLineId),
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
  }, [deferredSearchTerm, resolveAssignmentForRow, resolveProcessForRow, rows]);
  const totalRowPages = useMemo(
    () => Math.max(1, Math.ceil((Array.isArray(filteredRows) ? filteredRows.length : 0) / ROWS_PER_PAGE)),
    [filteredRows]
  );
  const currentPage = Math.min(Math.max(1, page), totalRowPages);
  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const pageEndIndex = Math.min(pageStartIndex + ROWS_PER_PAGE, filteredRows.length);
  const pagedRows = useMemo(
    () => filteredRows.slice(pageStartIndex, pageEndIndex),
    [filteredRows, pageEndIndex, pageStartIndex]
  );
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
  useEffect(() => {
    setPage((currentValue) => {
      const normalizedPage = Number.isFinite(currentValue) ? Math.trunc(currentValue) : 1;
      return Math.min(Math.max(1, normalizedPage), totalRowPages);
    });
  }, [totalRowPages]);

  const summary = useMemo(() => {
    const records = rows
      .map((row) => {
        const assignment = resolveAssignmentForRow(row) || row?.assignment || null;
        const process = resolveProcessForRow(row, assignment) || row?.process || null;
        return { row, assignment, process };
      })
      .filter(({ process, row }) => process && Number(row?.quantity) > 0)
      .map(({ row, assignment, process }) => ({
        rowId: toText(row?.id),
        workerId: toPositiveIdOrNull(row?.worker?.id),
        workerName: toText(row?.worker?.name),
        customerName: toText(assignment?.customer),
        orderNo: toText(assignment?.orderNo),
        styleUid: toPositiveIdOrNull(assignment?.styleUid ?? row?.styleUid),
        styleId: toText(assignment?.styleId),
        styleName: toText(assignment?.label),
        processId: toPositiveIdOrNull(process?.processId),
        processCode: buildDisplayProcessCode(process),
        processName: toText(process?.name),
        processNameKo: toText(process?.nameKo),
        processNameEn: toText(process?.nameEn),
        processNameVi: toText(process?.nameVi),
        colorId: toPositiveIdOrNull(assignment?.colorId),
        colorCode: toText(assignment?.color),
        colorName: toText(assignment?.colorName),
        ctSeconds: Math.max(0, Math.round(Number(process?.ctSeconds) || 0)),
        quantity: Math.max(0, Math.round(Number(row?.quantity) || 0)),
        assignmentPlanId: toPositiveIdOrNull(assignment?.dbId),
      }));
    const workerCount = new Set(records.map((record) => record.workerId).filter((workerId) => workerId !== null)).size;
    const totalContractedSeconds = records.reduce((sum, record) => sum + record.ctSeconds * record.quantity, 0);
    return { records, workerCount, totalContractedSeconds };
  }, [resolveAssignmentForRow, resolveProcessForRow, rows]);
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
          resolveAssignmentForRow(row)?.dbId ??
            row?.assignment?.dbId ??
            row?.assignment?.id
        ) !== null
      ),
    [resolveAssignmentForRow, rows]
  );
  const ctWarningMessage = useMemo(() => {
    if (ctAssignmentPool.length > 0) return '';
    if (hasRowsWithAssignmentPlanId) return '';
    if (missingCtStyleLabels.length > 0) {
      return `CT 미저장 스타일: ${missingCtStyleLabels.join(', ')}`;
    }
    return 'CT가 저장된 배정카드가 없습니다.';
  }, [ctAssignmentPool.length, hasRowsWithAssignmentPlanId, missingCtStyleLabels]);
  const resolveWorkerOptions = useCallback(
    (row) => ensureOptionIncluded(lineWorkers, row?.worker, (item) => item?.id || item?.name),
    [lineWorkers]
  );
  const resolveStyleOptions = useCallback(
    (row) => {
      const currentAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
      const includedAssignments = ensureOptionIncluded(
        assignmentOptions,
        currentAssignment,
        (item) => item?.dbId || item?.id
      );
      const sortedAssignments = sortAssignmentOptionsByLineContext(
        includedAssignments,
        selectedLineId
      );
      return sortedAssignments;
    },
    [
      assignmentOptions,
      resolveAssignmentForRow,
      selectedLineId,
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

      const currentAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
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
    [resolveAssignmentForRow]
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
      const selectedStyleId = toText(row?.styleOptionId);
      const currentAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
      const assignmentPool = ensureOptionIncluded(
        assignmentOptions,
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
      const reservedSignatures = new Set();

      rows.forEach((otherRow) => {
        if (toText(otherRow?.id) === toText(row?.id)) return;
        const otherAssignment =
          resolveAssignmentForRow(otherRow) || otherRow?.assignment || null;
        const otherProcess =
          resolveProcessForRow(otherRow, otherAssignment) || otherRow?.process || null;
        const signature = buildWorkerStyleProcessSignature({
          worker: otherRow?.worker,
          assignment: otherAssignment,
          process: otherProcess,
        });
        if (signature) reservedSignatures.add(signature);
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
        if (candidateSignature && reservedSignatures.has(candidateSignature)) return;
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

      const currentProcess =
        resolveProcessForRow(row, selectedAssignment) || row?.process || null;
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
      assignmentOptions,
      processCatalogByCode,
      processCatalogById,
      processCatalogByName,
      languageCode,
      rows,
      resolveAssignmentForRow,
      resolveProcessForRow,
    ]
  );
  const resolveSelectedProcessOption = useCallback(
    (row, options) => {
      const currentAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
      const currentProcess = resolveProcessForRow(row, currentAssignment) || row?.process || null;
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
    [resolveAssignmentForRow, resolveProcessForRow]
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
    setRows([]);
    setFormError('');
    setEditingField(null);
    setPage(1);
    setSearchTerm('');
    initialRowsHydratedRef.current = Boolean(initialLog?.id);
  }, [initialLog?.id]);
  const handleLineChange = useCallback((nextLine) => {
    setSelectedLine(nextLine || null);
    setRows([]);
    setFormError('');
    setEditingField(null);
    setPage(1);
    setSearchTerm('');
    initialRowsHydratedRef.current = Boolean(initialLog?.id);
  }, [initialLog?.id]);
  const handleWorkDateChange = useCallback((nextDate) => {
    setWorkDate(nextDate || dayjs());
    setRows([]);
    setFormError('');
    setEditingField(null);
    setPage(1);
    setSearchTerm('');
    initialRowsHydratedRef.current = Boolean(initialLog?.id);
  }, [initialLog?.id]);
  const handleWorkerChange = useCallback((rowId, nextWorker) => {
    setRows((currentRows) =>
      currentRows.map((row) =>
        row.id === rowId ? { ...row, worker: nextWorker || null } : row
      )
    );
  }, []);
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
  const handleQuantityChange = useCallback((rowId, nextQuantity) => updateRow(rowId, (row) => ({ ...row, quantity: nextQuantity })), [updateRow]);
  const buildNextRowFromTemplate = useCallback((templateRow = null) => {
    if (!templateRow) return createBlankRow();
    return createBlankRow({
      worker: templateRow?.worker || null,
      styleOptionId: '',
      assignment: null,
      process: null,
      quantity: '',
    });
  }, []);
  const handleAddBelow = useCallback((rowId) => {
    let nextEditingId = '';
    let nextRowIndex = -1;
    setRows((currentRows) => {
      const targetIndex = currentRows.findIndex((row) => row.id === rowId);
      const templateRow = targetIndex >= 0 ? currentRows[targetIndex] : currentRows[currentRows.length - 1] || null;
      const nextRow = buildNextRowFromTemplate(templateRow);
      nextEditingId = nextRow.id;
      if (targetIndex < 0) {
        nextRowIndex = currentRows.length;
        return [...currentRows, nextRow];
      }
      nextRowIndex = targetIndex + 1;
      return [...currentRows.slice(0, targetIndex + 1), nextRow, ...currentRows.slice(targetIndex + 1)];
    });
    if (nextEditingId) {
      setEditingRowId(nextEditingId);
      setEditingField({ rowId: nextEditingId, field: 'worker', token: Date.now() });
    }
    if (nextRowIndex >= 0) {
      setPage(Math.floor(nextRowIndex / ROWS_PER_PAGE) + 1);
    }
  }, [buildNextRowFromTemplate]);
  const handleRemoveRow = useCallback((rowId) => {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.id !== rowId);
      if (nextRows.length > 0) return nextRows;
      return lineWorkers.length > 0 && selectedLineId ? [createBlankRow()] : [];
    });
    setEditingField(null);
  }, [lineWorkers.length, selectedLineId]);

  const handleSave = useCallback(() => {
    setFormError('');
    if (!selectedFactoryId) {
      setFormError('공장을 선택해 주세요.');
      return;
    }
    if (!selectedLineId) {
      setFormError('라인을 선택해 주세요.');
      return;
    }
    if (summary.records.length === 0) {
      setFormError('저장할 작업 행이 없습니다.');
      return;
    }
    const availableWorkerIds = new Set(lineWorkers.map((worker) => toPositiveIdOrNull(worker?.id)).filter((workerId) => workerId !== null));
    const shouldValidateWorkerLineMembership = availableWorkerIds.size > 0;
    const invalidWorkerRecord = summary.records.find((record) => {
      const workerId = toPositiveIdOrNull(record?.workerId);
      if (!workerId) return true;
      if (!shouldValidateWorkerLineMembership) return false;
      return !availableWorkerIds.has(workerId);
    });
    if (invalidWorkerRecord) {
      setFormError('선택한 라인에 속하지 않은 작업자가 포함되어 있습니다.');
      return;
    }
    if (!hasFactoryWage) {
      setFormError('공장 초당 공임이 설정되지 않았습니다.');
      return;
    }
    if (findDuplicateRow(summary.records)) {
      setFormError('같은 작업자가 같은 스타일의 같은 공정을 같은 날짜에 중복 입력할 수 없습니다.');
      return;
    }
    onSave?.({
      workDate: workDateKey,
      factoryId: selectedFactoryId,
      factoryName: toText(currentFactory?.name),
      lineId: selectedLineId,
      lineName: toText(selectedLine?.name),
      factoryWagePerSecond: selectedFactoryWagePerSecond,
      ctBasis: 'CT',
      workerCount: summary.workerCount,
      itemCount: summary.records.length,
      totalContractedSeconds: summary.totalContractedSeconds,
      records: summary.records,
      note: buildCombinedNote({ manualNote: note, autoNote: autoExceededNote }),
    });
  }, [autoExceededNote, currentFactory?.name, hasFactoryWage, lineWorkers, note, onSave, selectedFactoryId, selectedFactoryWagePerSecond, selectedLine?.name, selectedLineId, summary.records, summary.totalContractedSeconds, summary.workerCount, workDateKey]);

  const detailHeader = (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{`${LABELS.title}: ${workDateKey}`}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <LastUpdaterLabel fallbackName={initialLog?.updatedBy} />
        <SaveButton
          onClick={handleSave}
          disabled={loading || baseLoading || lineDataLoading || isAggregateLegacyLog}
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
            <Typography variant="body2" color="text.secondary">기본 정보를 불러오는 중입니다.</Typography>
          </Stack>
        </Paper>
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer header={detailHeader}>
      <Stack spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, backgroundColor: '#fbfcff' }}>
          <Stack spacing={1.5}>
            <Box sx={{ display: 'grid', gap: 1.25, gridTemplateColumns: { xs: '1fr', lg: 'minmax(220px, 1.1fr) minmax(220px, 1fr) minmax(220px, 1fr) minmax(180px, 0.8fr)' }, alignItems: 'start' }}>
              <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale={languageCode} localeText={buildDatePickerLocaleText(languageCode)}>
                <DatePicker label={LABELS.workDate} value={workDate} onChange={handleWorkDateChange} format="YYYY-MM-DD" slotProps={{ textField: { size: 'small', fullWidth: true } }} />
              </LocalizationProvider>
              <SearchableSelect label={!loading && factories.length === 1 ? LABELS.autoFactory : LABELS.factory} options={factories} value={selectedFactory} onChange={(_event, value) => handleFactoryChange(value)} disabled={factories.length === 1} autoHighlight openOnFocus selectOnFocus clearOnBlur={false} handleHomeEndKeys getOptionLabel={(option) => option?.name || ''} isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')} textFieldProps={{ size: 'small' }} />
              <SearchableSelect label={LABELS.line} options={lines} value={selectedLine} onChange={(_event, value) => handleLineChange(value)} disabled={!selectedFactoryId || lines.length === 0} autoHighlight openOnFocus selectOnFocus clearOnBlur={false} handleHomeEndKeys getOptionLabel={(option) => option?.name || ''} isOptionEqualToValue={(option, value) => String(option?.id || '') === String(value?.id || '')} textFieldProps={{ size: 'small' }} />
              <TextField label={LABELS.wagePerSecond} size="small" value={selectedFactoryId ? hasFactoryWage ? `${formatNumberWithCommas(selectedFactoryWagePerSecond, { fallback: '0', maximumFractionDigits: 2 })} ${LABELS.wagePerSecondUnit}` : '-' : '-'} InputProps={{ readOnly: true }} sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }} />
            </Box>
            <TextField label={LABELS.note} value={note} onChange={(event) => setNote(event.target.value)} placeholder={LABELS.notePlaceholder} size="small" fullWidth multiline minRows={2} />
            {autoExceededNote ? <Alert severity="info"><Box><Typography variant="body2" sx={{ fontWeight: 700, mb: 0.5 }}>{LABELS.autoNote}</Typography><Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>{autoExceededNote}</Typography></Box></Alert> : null}
            {isAggregateLegacyLog ? <Alert severity="warning">라인 정보가 없는 기존 기록은 이 화면에서 수정할 수 없습니다.</Alert> : null}
            {formError ? <Alert severity="error">{formError}</Alert> : null}
            {findDuplicateRow(summary.records) ? <Alert severity="warning">같은 작업자/스타일/공정 조합이 중복되어 있습니다. 수량으로 합산해 주세요.</Alert> : null}
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, minHeight: 420 }}>
          <PageToolbar left={<SearchInput value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} placeholder={LABELS.searchPlaceholder} sx={{ width: { xs: '100%', sm: 320, md: 420 } }} />} sx={{ mb: 1.5 }} />

          {!selectedFactoryId ? (
            <Alert severity="info">공장을 선택하면 라인과 작업자를 불러옵니다.</Alert>
          ) : !selectedLineId ? (
            <Alert severity="info">라인을 선택하면 해당 라인의 작업자/스타일/공정 옵션을 불러옵니다.</Alert>
          ) : lineDataLoading && rows.length === 0 ? (
            <Alert severity="info">라인 데이터를 불러오는 중입니다.</Alert>
          ) : lineWorkers.length === 0 && rows.length === 0 ? (
            <Alert severity="warning">선택한 라인/작업일 기준으로 작업자가 없습니다.</Alert>
          ) : rows.length === 0 ? (
            <Stack spacing={1.5} alignItems="flex-start">
              {ctWarningMessage ? <Alert severity="warning">{ctWarningMessage}</Alert> : null}
              <Alert severity="info">첫 작업자 입력 행을 준비 중입니다.</Alert>
            </Stack>
          ) : filteredRows.length === 0 ? (
            <Alert severity="info">검색 결과가 없습니다.</Alert>
          ) : (
            <Stack spacing={1.25}>
              {ctWarningMessage ? <Alert severity="warning">{ctWarningMessage}</Alert> : null}
              {isMobile ? (
                <Stack spacing={1}>
                  {pagedRows.map((row) => {
                    const rowExceededMeta = exceededRowMetaByRowId.get(toText(row?.id)) || null;
                    const isRowExceeded = Boolean(rowExceededMeta);
                    const rowAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
                    const rowProcess = resolveProcessForRow(row, rowAssignment) || row?.process || null;
                    const rowForOptions = { ...row, assignment: rowAssignment, process: rowProcess };
                    const rowWorkerOptions = resolveWorkerOptions(rowForOptions);
                    const styleOptions = resolveStyleOptions(rowForOptions);
                    const selectedStyleOption = resolveSelectedStyleOption(rowForOptions, styleOptions);
                    const selectedStyleOrderLabel = selectedStyleOption
                      ? buildStyleOrderMetaLabel(selectedStyleOption)
                      : '';
                    const selectedStyleExceptionLabel = selectedStyleOption
                      ? getStyleExceptionLabel(selectedStyleOption, row?.worker)
                      : '';
                    const processOptions = resolveProcessOptions(rowForOptions);
                    const selectedProcessOption = resolveSelectedProcessOption(rowForOptions, processOptions);
                    const selectedProcessMetaLabel = selectedProcessOption
                      ? getProcessOptionMetaLabel(selectedProcessOption)
                      : '';
                    const workerDisabled = isAggregateLegacyLog || (rowWorkerOptions?.length || 0) === 0;
                    const styleDisabled = isAggregateLegacyLog || !row?.worker || (styleOptions?.length || 0) === 0;
                    const processDisabled =
                      isAggregateLegacyLog ||
                      !row?.worker ||
                      !selectedStyleOption ||
                      (processOptions?.length || 0) === 0;
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
                          <SearchableSelect
                            label={LABELS.worker}
                            options={rowWorkerOptions}
                            value={row?.worker || null}
                            onChange={(_event, value) => handleWorkerChange(row.id, value)}
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
                            }}
                          />
                          <Stack spacing={0.35}>
                            <SearchableSelect
                              label={LABELS.style}
                              options={styleOptions}
                              value={selectedStyleOption}
                              onChange={(_event, value) => handleStyleChange(row.id, value)}
                              autoSelect={false}
                              disabled={styleDisabled}
                              autoHighlight
                              openOnFocus
                              selectOnFocus
                              clearOnBlur={false}
                              handleHomeEndKeys
                              getOptionLabel={getStyleOptionLabel}
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
                              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                event.preventDefault();
                                handleAddBelow(row.id);
                              }
                            }}
                            disabled={isAggregateLegacyLog || !selectedProcessOption?.process}
                            inputProps={{ min: 1 }}
                            fullWidth
                            autoFocus={shouldFocusQuantity}
                          />
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                            <Tooltip title={LABELS.addBelow}>
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleAddBelow(row.id);
                                  }}
                                  disabled={isAggregateLegacyLog}
                                  aria-label={LABELS.addBelow}
                                >
                                  <AddIcon fontSize="small" />
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
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Table size="small" sx={{ tableLayout: 'fixed' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '18%' }}>{LABELS.worker}</TableCell>
                      <TableCell sx={{ width: '31%' }}>{LABELS.style}</TableCell>
                      <TableCell sx={{ width: '28%' }}>{LABELS.process}</TableCell>
                      <TableCell sx={{ width: '13%' }} align="right">{LABELS.quantity}</TableCell>
                      <TableCell sx={{ width: 88 }} align="right">&nbsp;</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedRows.map((row) => {
                      const rowExceededMeta = exceededRowMetaByRowId.get(toText(row?.id)) || null;
                      const isRowExceeded = Boolean(rowExceededMeta);
                      const rowAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
                      const rowProcess = resolveProcessForRow(row, rowAssignment) || row?.process || null;
                      const quantityNumber = Math.max(0, Math.round(Number(row?.quantity) || 0));
                      const quantityValue =
                        quantityNumber > 0
                          ? formatNumberWithCommas(quantityNumber, {
                              fallback: '0',
                              maximumFractionDigits: 0,
                            })
                          : '-';
                      const isEditingRow = true;
                      const rowGroupMeta = workerGroupMetaByRowId.get(row?.id) || {
                        groupId: 0,
                        isGroupStart: false,
                      };
                      const groupBackgroundColor =
                        rowGroupMeta.groupId % 2 === 0 ? '#ffffff' : '#f8fbff';
                      const rowForOptions = isEditingRow
                        ? { ...row, assignment: rowAssignment, process: rowProcess }
                        : row;
                      const rowWorkerOptions = isEditingRow ? resolveWorkerOptions(rowForOptions) : [];
                      const styleOptions = isEditingRow ? resolveStyleOptions(rowForOptions) : [];
                      const selectedStyleOption = isEditingRow
                        ? resolveSelectedStyleOption(rowForOptions, styleOptions)
                        : null;
                      const selectedStyleOrderLabel = selectedStyleOption
                        ? buildStyleOrderMetaLabel(selectedStyleOption)
                        : '';
                      const selectedStyleExceptionLabel = selectedStyleOption
                        ? getStyleExceptionLabel(selectedStyleOption, row?.worker)
                        : '';
                      const processOptions = isEditingRow ? resolveProcessOptions(rowForOptions) : [];
                      const selectedProcessOption = isEditingRow
                        ? resolveSelectedProcessOption(rowForOptions, processOptions)
                        : null;
                      const selectedProcessMetaLabel = selectedProcessOption
                        ? getProcessOptionMetaLabel(selectedProcessOption)
                        : '';
                      const styleDisabled =
                        isAggregateLegacyLog || !row?.worker || (styleOptions?.length || 0) === 0;
                      const processDisabled =
                        isAggregateLegacyLog ||
                        !row?.worker ||
                        !selectedStyleOption ||
                        (processOptions?.length || 0) === 0;
                      const workerDisabled =
                        isAggregateLegacyLog || (rowWorkerOptions?.length || 0) === 0;
                      const shouldFocusWorker = Boolean(
                        isEditingRow &&
                          editingField?.rowId === row.id &&
                          editingField?.field === 'worker'
                      );
                      const shouldFocusStyle = Boolean(
                        isEditingRow &&
                          editingField?.rowId === row.id &&
                          editingField?.field === 'style'
                      );
                      const shouldFocusProcess = Boolean(
                        isEditingRow &&
                          editingField?.rowId === row.id &&
                          editingField?.field === 'process'
                      );
                      const shouldFocusQuantity = Boolean(
                        isEditingRow &&
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

                      return (
                        <TableRow
                          key={row.id}
                          hover
                          sx={{
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
                          <TableCell sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <SearchableSelect
                                label={LABELS.worker}
                                options={rowWorkerOptions}
                                value={row?.worker || null}
                                onChange={(_event, value) => handleWorkerChange(row.id, value)}
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
                                }}
                              />
                            ) : (
                              <Box
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'worker');
                                }}
                                sx={{
                                  minHeight: 24,
                                  display: 'flex',
                                  alignItems: 'center',
                                  whiteSpace: 'nowrap',
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                {toText(row?.worker?.name) || '-'}
                              </Box>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <Stack spacing={0.35}>
                                <SearchableSelect
                                  label={LABELS.style}
                                  options={styleOptions}
                                  value={selectedStyleOption}
                                  onChange={(_event, value) => handleStyleChange(row.id, value)}
                                  autoSelect={false}
                                  disabled={styleDisabled}
                                  autoHighlight
                                  openOnFocus
                                  selectOnFocus
                                  clearOnBlur={false}
                                  handleHomeEndKeys
                                  getOptionLabel={getStyleOptionLabel}
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
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'style');
                                }}
                                sx={{
                                  minHeight: 24,
                                  display: 'flex',
                                  alignItems: 'center',
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                {selectedStyleOption ? getStyleOptionLabel(selectedStyleOption) : '-'}
                              </Box>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <SearchableSelect
                                label={LABELS.process}
                                options={processOptions}
                                value={selectedProcessOption}
                                onChange={(_event, value) => handleProcessChange(row.id, value)}
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
                                }}
                              />
                            ) : (
                              <Box
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'process');
                                }}
                                sx={{
                                  minHeight: 24,
                                  display: 'flex',
                                  alignItems: 'center',
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                {selectedProcessOption
                                  ? buildProcessOptionDisplayLabel(selectedProcessOption?.process, languageCode)
                                  : '-'}
                              </Box>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
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
                                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                                    event.preventDefault();
                                    handleAddBelow(row.id);
                                  }
                                }}
                                disabled={isAggregateLegacyLog || !selectedProcessOption?.process}
                                inputProps={{ min: 1 }}
                                fullWidth
                                autoFocus={shouldFocusQuantity}
                              />
                            ) : (
                              <Box
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'quantity');
                                }}
                                sx={{
                                  minHeight: 24,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'flex-end',
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                {quantityValue}
                              </Box>
                            )}
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
                                      handleAddBelow(row.id);
                                    }}
                                    disabled={isAggregateLegacyLog}
                                    aria-label={LABELS.addBelow}
                                  >
                                    <AddIcon fontSize="small" />
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
                  {`${filteredRows.length === 0 ? 0 : pageStartIndex + 1}-${pageEndIndex} / ${filteredRows.length}${toText(searchTerm) ? ` (전체 ${rows.length})` : ''}`}
                </Typography>
                <Pagination
                  count={totalRowPages}
                  page={currentPage}
                  onChange={(_event, nextPage) => setPage(nextPage)}
                  color="primary"
                  shape="rounded"
                  showFirstButton
                  showLastButton
                  siblingCount={1}
                  boundaryCount={1}
                />
              </Box>
            </Stack>
          )}
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default WorkDetail;


