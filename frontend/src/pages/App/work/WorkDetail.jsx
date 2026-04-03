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
} from '@mui/material';
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

const COLLATOR = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const AUTO_NOTE_PREFIX = '[자동 메모]';
const AUTO_NOTE_MARKER = `\n\n${AUTO_NOTE_PREFIX}\n`;
const ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER = 3;
const ROWS_PER_PAGE = 30;
const LABELS = {
  title: '기록 상세',
  lastUpdated: '마지막 업데이트',
  save: '저장',
  saving: '저장 중...',
  workDate: '작업일자',
  factory: '공장',
  autoFactory: '공장 (자동선택)',
  line: '라인',
  wagePerSecond: '초당 공임',
  wagePerSecondUnit: '동/초',
  note: '비고',
  notePlaceholder: '메모를 입력하세요.',
  autoNote: '자동 메모',
  saveCount: '저장 대상 {count}건',
  workerCount: '작업자 {count}명',
  totalCt: '총 CT {value}',
  totalAmount: '총 공임 {value}',
  searchPlaceholder: '작업자/배정카드/공정 검색',
  worker: '작업자',
  workerPlaceholder: '작업자를 선택하세요.',
  assignment: '배정카드',
  assignmentPlaceholder: '배정카드를 선택하세요.',
  selectWorkerFirst: '작업자를 먼저 선택하세요.',
  noAssignmentsAvailable: '선택 가능한 배정카드가 없습니다.',
  process: '공정',
  processPlaceholder: '공정을 선택하세요.',
  selectAssignmentFirst: '배정카드를 먼저 선택하세요.',
  noProcessesAvailable: '선택 가능한 공정이 없습니다.',
  quantity: '생산량',
  ct: 'CT',
  ctUnit: '초',
  amount: '금액',
  amountUnit: '동',
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
const toPositiveIdOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.trunc(parsed);
  return rounded > 0 ? rounded : null;
};
const createRowId = () => `work-row-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createBlankRow = (patch = {}) => ({ id: createRowId(), worker: null, assignment: null, process: null, quantity: '', ...patch });
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
const formatDuration = (seconds, languageCode) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (languageCode === 'en') return `${hours}h ${minutes}m`;
  if (languageCode === 'vi') return `${hours} gio ${minutes} phut`;
  return `${hours}시간 ${minutes}분`;
};
const formatAssignmentLabel = (assignment) => {
  const parts = [assignment?.customer, assignment?.label, assignment?.colorName].map((value) => toText(value)).filter(Boolean);
  if (parts.length > 0) return parts.join(' / ');
  if (assignment?.dbId) return `배정카드 #${assignment.dbId}`;
  return '배정카드';
};
const sortRowsByWorker = (sourceRows = []) => {
  const safeRows = Array.isArray(sourceRows) ? sourceRows : [];
  return [...safeRows].sort((left, right) => {
    const leftWorker = toText(left?.worker?.name);
    const rightWorker = toText(right?.worker?.name);
    if (leftWorker && !rightWorker) return -1;
    if (!leftWorker && rightWorker) return 1;
    const workerCompare = COLLATOR.compare(leftWorker, rightWorker);
    if (workerCompare !== 0) return workerCompare;

    const assignmentCompare = COLLATOR.compare(
      formatAssignmentLabel(left?.assignment || {}),
      formatAssignmentLabel(right?.assignment || {})
    );
    if (assignmentCompare !== 0) return assignmentCompare;

    const processCompare = COLLATOR.compare(
      toText(left?.process?.name),
      toText(right?.process?.name)
    );
    if (processCompare !== 0) return processCompare;

    return COLLATOR.compare(toText(left?.id), toText(right?.id));
  });
};
const formatRecentUpdate = ({ initialLog, unknownLabel = '-' }) => {
  const updatedBy = toText(initialLog?.updatedBy);
  const updatedAt = initialLog?.updatedAt ? dayjs(initialLog.updatedAt).format('YYYY-MM-DD HH:mm') : '';
  return [updatedBy, updatedAt].filter(Boolean).join(' / ') || unknownLabel;
};
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
  return sourceProcesses.map((process, index) => {
    const fallbackName = toText(process?.name) || toText(process?.processName) || `공정 ${index + 1}`;
    const processKey = toText(process?.processKey) || toText(process?.code) || fallbackName || `process-${index + 1}`;
    return {
      id: `${toText(plan?.dbId || plan?.id || 'plan')}:${processKey}`,
      processKey,
      processId: toPositiveIdOrNull(process?.id ?? process?.processId),
      code: toText(process?.code || process?.processKey),
      name: fallbackName,
      nameKo: toText(process?.nameKo),
      nameEn: toText(process?.nameEn),
      nameVi: toText(process?.nameVi),
      ctSeconds: Math.max(
        0,
        Math.round(Number(process?.ctPerPieceSeconds ?? process?.ctSeconds) || 0)
      ),
    };
  });
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
  const code = toText(process?.code);
  if (code) return { key: `code:${code.toUpperCase()}`, label: toText(process?.name) || code };
  const name = toText(process?.name);
  if (name) return { key: `name:${name.toLowerCase()}`, label: name };
  return { key: 'unknown', label: '미정 공정' };
};
const collectAssignmentProcessRows = (records = []) => {
  const buckets = new Map();
  records.forEach((record) => {
    const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
    if (!assignmentPlanId) return;
    const quantity = Math.max(0, Math.round(Number(record?.quantity) || 0));
    if (quantity <= 0) return;
    const processMetric = buildProcessMetric(record);
    const bucketKey = `${assignmentPlanId}:${processMetric.key}`;
    const current = buckets.get(bucketKey);
    if (current) {
      current.quantity += quantity;
      return;
    }
    buckets.set(bucketKey, { assignmentPlanId, processLabel: processMetric.label, quantity });
  });
  return Array.from(buckets.values());
};
const findDuplicateRow = (records = []) => {
  const seen = new Set();
  for (const record of records) {
    const workerId = toPositiveIdOrNull(record?.workerId);
    const assignmentPlanId = toPositiveIdOrNull(record?.assignmentPlanId);
    const processKey = buildProcessMetric(record).key;
    if (!workerId || !assignmentPlanId || !processKey) continue;
    const signature = `${workerId}:${assignmentPlanId}:${processKey}`;
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
        normalizeProcessCode(processOption?.code || processOption?.processCode || processOption?.processKey) ===
        normalizeProcessCode(record?.processCode)
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
      assignment,
      process,
      quantity: Number(record?.quantity) > 0 ? Math.round(Number(record.quantity)) : '',
    });
  });
};
const normalizeWorkerOptions = (workers = []) =>
  sortByLabel(Array.isArray(workers) ? workers : [], (worker) => worker?.name || worker?.email || '');
const normalizeAssignmentPlanOptions = (plans = []) =>
  sortByLabel(
    (Array.isArray(plans) ? plans : [])
      .filter((plan) => hasAssignmentCtSnapshot(plan))
      .map((plan) => enrichAssignmentPlan(plan)),
    (plan) => formatAssignmentLabel(plan)
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
const buildDisplayCtText = (process, labels) =>
  process
    ? `${formatNumberWithCommas(Number(process?.ctSeconds) || 0, {
        fallback: '0',
        maximumFractionDigits: 0,
      })}${labels.ctUnit}`
    : '-';
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
const resolveProcessOption = (rowProcess, assignment) => {
  if (!rowProcess) return null;
  const processOptions = Array.isArray(assignment?.processes) ? assignment.processes : [];
  if (processOptions.length === 0) return rowProcess;

  const targetProcessId = toPositiveIdOrNull(rowProcess?.processId ?? rowProcess?.id);
  if (targetProcessId) {
    const matchedById = processOptions.find(
      (processOption) => toPositiveIdOrNull(processOption?.processId ?? processOption?.id) === targetProcessId
    );
    if (matchedById) {
      return {
        ...matchedById,
        ...rowProcess,
        processId: toPositiveIdOrNull(rowProcess?.processId ?? matchedById?.processId),
        code: toText(rowProcess?.code || rowProcess?.processCode || matchedById?.code),
        name: toText(rowProcess?.name || rowProcess?.processName || matchedById?.name),
      };
    }
  }

  const targetProcessCode = normalizeProcessCode(rowProcess?.code || rowProcess?.processCode);
  if (targetProcessCode) {
    const matchedByCode = processOptions.find(
      (processOption) =>
        normalizeProcessCode(processOption?.code || processOption?.processCode || processOption?.processKey) ===
        targetProcessCode
    );
    if (matchedByCode) {
      return {
        ...matchedByCode,
        ...rowProcess,
        processId: toPositiveIdOrNull(rowProcess?.processId ?? matchedByCode?.processId),
        code: toText(rowProcess?.code || rowProcess?.processCode || matchedByCode?.code),
        name: toText(rowProcess?.name || rowProcess?.processName || matchedByCode?.name),
      };
    }
  }

  const targetProcessName = toText(rowProcess?.name || rowProcess?.processName);
  if (targetProcessName) {
    const matchedByName = processOptions.find(
      (processOption) => equalsText(processOption?.name, targetProcessName)
    );
    if (matchedByName) {
      return {
        ...matchedByName,
        ...rowProcess,
        processId: toPositiveIdOrNull(rowProcess?.processId ?? matchedByName?.processId),
        code: toText(rowProcess?.code || rowProcess?.processCode || matchedByName?.code),
        name: toText(rowProcess?.name || rowProcess?.processName || matchedByName?.name),
      };
    }
  }

  return rowProcess;
};
const mergeProcessWithCatalog = (process, processCatalogById, processCatalogByCode) => {
  if (!process) return null;
  const processId = toPositiveIdOrNull(process?.processId ?? process?.id);
  const processCode = normalizeProcessCode(process?.code || process?.processCode || process?.processKey);
  const matchedProcess =
    (processId ? processCatalogById.get(processId) : null) ||
    (processCode ? processCatalogByCode.get(processCode) : null) ||
    null;

  if (!matchedProcess) return process;
  return {
    ...matchedProcess,
    ...process,
    processId: processId || toPositiveIdOrNull(matchedProcess?.id),
    code: toText(process?.code || process?.processCode || matchedProcess?.code),
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
  const [assignmentOptions, setAssignmentOptions] = useState(() =>
    normalizeAssignmentPlanOptions(initialContext?.assignments)
  );
  const [rows, setRows] = useState([]);
  const [editingRowId, setEditingRowId] = useState('');
  const [editingField, setEditingField] = useState(null);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
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
  const prefetchedAssignments = useMemo(
    () => normalizeAssignmentPlanOptions(initialContext?.assignments),
    [initialContext?.assignments]
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
    setAssignmentOptions(prefetchedAssignments);
    setRows(
      hasInitialRecords
        ? sortRowsByWorker(
            buildHydratedRows({
              records: initialLog?.records,
              workers: prefetchedWorkers,
              assignments: prefetchedAssignments,
            })
          )
        : []
    );
    setPage(1);
    setSearchTerm('');
    setFormError('');
    setBaseLoading(!initialLog?.id);
  }, [hasInitialRecords, initialFactoryOption, initialLineOption, initialLog?.createdAt, initialLog?.id, initialLog?.note, initialLog?.records, initialLog?.workDate, prefetchedAssignments, prefetchedWorkers]);
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
      setAssignmentOptions([]);
      setLineDataLoading(false);
      return;
    }
    if (initialLog?.id && initialContext && currentContextKey === initialContextKey) {
      setLineWorkers(prefetchedWorkers);
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
      skipGlobalLoading: true,
      signal: abortController.signal,
    })
      .then((context) => {
        if (cancelled) return;
        setAssignmentOptions(normalizeAssignmentPlanOptions(context?.assignments));
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
  }, [activeOrgId, currentContextKey, initialContext, initialContextKey, initialLog?.id, prefetchedAssignments, prefetchedWorkers, selectedFactoryId, selectedLineId, workDateKey]);

  useEffect(() => {
    if (!initialLog?.id || initialRowsHydratedRef.current) return;
    if (!selectedFactoryId || !selectedLineId) return;
    if (!hasInitialRecords) {
      initialRowsHydratedRef.current = true;
      return;
    }
    const hydratedRows = buildHydratedRows({ records: initialLog?.records, workers: lineWorkers, assignments: assignmentOptions });
    setRows(hydratedRows.length > 0 ? sortRowsByWorker(hydratedRows) : []);
    initialRowsHydratedRef.current = true;
  }, [assignmentOptions, hasInitialRecords, initialLog, lineWorkers, selectedFactoryId, selectedLineId]);

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
  const assignmentOptionMap = useMemo(
    () =>
      assignmentOptions.reduce((map, assignment) => {
        const key = toText(assignment?.dbId || assignment?.id);
        if (key) map.set(key, assignment);
        return map;
      }, new Map()),
    [assignmentOptions]
  );
  const resolveAssignmentForRow = useCallback(
    (row) => resolveAssignmentOption(row?.assignment, assignmentOptionMap),
    [assignmentOptionMap]
  );
  const resolveProcessForRow = useCallback((row, assignmentOverride = null) => {
    const assignment = assignmentOverride || resolveAssignmentForRow(row);
    const linkedProcess = resolveProcessOption(row?.process, assignment);
    return mergeProcessWithCatalog(linkedProcess, processCatalogById, processCatalogByCode);
  }, [processCatalogByCode, processCatalogById, resolveAssignmentForRow]);
  const filteredRows = useMemo(() => {
    const keyword = toText(searchTerm).toLowerCase();
    if (!keyword) return rows;

    return rows.filter((row) => {
      const assignment = resolveAssignmentForRow(row) || row?.assignment || null;
      const process = resolveProcessForRow(row, assignment) || row?.process || null;
      const searchText = [
        row?.worker?.name,
        formatAssignmentLabel(assignment),
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
  }, [resolveAssignmentForRow, resolveProcessForRow, rows, searchTerm]);
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
        workerId: toPositiveIdOrNull(row?.worker?.id),
        workerName: toText(row?.worker?.name),
        customerName: toText(assignment?.customer),
        styleId: toText(assignment?.styleId),
        styleName: toText(assignment?.label),
        processId: toPositiveIdOrNull(process?.processId),
        processCode: toText(process?.code),
        processName: toText(process?.name),
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
  const totalContractedAmount = hasFactoryWage
    ? summary.totalContractedSeconds * selectedFactoryWagePerSecond
    : 0;
  const totalContractedAmountText = hasFactoryWage
    ? `${formatNumberWithCommas(totalContractedAmount, {
        fallback: '0',
        maximumFractionDigits: 0,
      })}${LABELS.amountUnit}`
    : '-';

  const autoExceededNote = useMemo(() => summary.records.map((record) => {
    const plan = assignmentOptions.find((item) => toPositiveIdOrNull(item?.dbId) === toPositiveIdOrNull(record?.assignmentPlanId));
    const baselineQuantity = resolveBaselineQuantity(plan);
    if (!baselineQuantity || record.quantity <= baselineQuantity) return null;
    return `${record.workerName || '-'} / ${formatAssignmentLabel(plan)} / ${record.processName || '-'} ${record.quantity - baselineQuantity}개 초과`;
  }).filter(Boolean).join('\n'), [assignmentOptions, summary.records]);
  const resolveWorkerOptions = useCallback(
    (row) => ensureOptionIncluded(lineWorkers, row?.worker, (item) => item?.id || item?.name),
    [lineWorkers]
  );
  const resolveAssignmentOptions = useCallback(
    (row) => ensureOptionIncluded(assignmentOptions, row?.assignment, (item) => item?.dbId || item?.id),
    [assignmentOptions]
  );
  const resolveProcessOptions = useCallback((row) => {
    const assignment = resolveAssignmentForRow(row);
    const process = resolveProcessForRow(row, assignment);
    const baseOptions = (Array.isArray(assignment?.processes) ? assignment.processes : [])
      .map((option) => mergeProcessWithCatalog(option, processCatalogById, processCatalogByCode));
    return ensureOptionIncluded(baseOptions, process, (item) => item?.processKey || item?.id);
  }, [processCatalogByCode, processCatalogById, resolveAssignmentForRow, resolveProcessForRow]);
  const resolveDuplicateProcessKeys = useCallback(
    (targetRow) => {
      const workerId = toPositiveIdOrNull(targetRow?.worker?.id);
      const targetAssignment = resolveAssignmentForRow(targetRow);
      const assignmentPlanId = toPositiveIdOrNull(targetAssignment?.dbId);
      if (!workerId || !assignmentPlanId) return new Set();

      const duplicateKeys = new Set();
      rows.forEach((row) => {
        if (row?.id === targetRow?.id) return;
        if (toPositiveIdOrNull(row?.worker?.id) !== workerId) return;
        const rowAssignment = resolveAssignmentForRow(row);
        if (toPositiveIdOrNull(rowAssignment?.dbId) !== assignmentPlanId) return;
        const rowProcess = resolveProcessForRow(row, rowAssignment);
        const processKey =
          toText(rowProcess?.processKey || rowProcess?.id) ||
          normalizeProcessCode(rowProcess?.code || rowProcess?.processCode);
        if (processKey) duplicateKeys.add(processKey);
      });
      return duplicateKeys;
    },
    [resolveAssignmentForRow, resolveProcessForRow, rows]
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
      sortRowsByWorker(
        currentRows.map((row) =>
          row.id === rowId ? { ...row, worker: nextWorker || null } : row
        )
      )
    );
  }, []);
  const handleAssignmentChange = useCallback((rowId, nextAssignment) => updateRow(rowId, (row) => ({ ...row, assignment: nextAssignment || null, process: null, quantity: '' })), [updateRow]);
  const handleProcessChange = useCallback((rowId, nextProcess) => updateRow(rowId, (row) => ({ ...row, process: nextProcess || null, quantity: nextProcess ? row.quantity : '' })), [updateRow]);
  const handleQuantityChange = useCallback((rowId, nextQuantity) => updateRow(rowId, (row) => ({ ...row, quantity: nextQuantity })), [updateRow]);
  const buildNextRowFromTemplate = useCallback((templateRow = null) => {
    if (!templateRow) return createBlankRow();
    return createBlankRow({ worker: templateRow?.worker || null, assignment: null, process: null, quantity: '' });
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
    const invalidWorkerRecord = summary.records.find((record) => {
      const workerId = toPositiveIdOrNull(record?.workerId);
      return !workerId || !availableWorkerIds.has(workerId);
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
      setFormError('중복된 작업 조합이 있습니다.');
      return;
    }
    if (assignmentOptions.length > 0 && summary.records.some((record) => toPositiveIdOrNull(record?.assignmentPlanId) === null)) {
      setFormError('배정카드를 선택해 주세요.');
      return;
    }
    const excessiveProcess = collectAssignmentProcessRows(summary.records).find((row) => {
      const matchedPlan = assignmentOptions.find((item) => toPositiveIdOrNull(item?.dbId) === row.assignmentPlanId);
      const baselineQuantity = resolveBaselineQuantity(matchedPlan);
      if (!baselineQuantity) return false;
      const maxAllowed = Math.max(baselineQuantity, Math.ceil(baselineQuantity * ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER));
      return row.quantity > maxAllowed;
    });
    if (excessiveProcess) {
      setFormError('배정카드 허용 수량을 초과한 공정이 있습니다.');
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
  }, [assignmentOptions, autoExceededNote, currentFactory?.name, hasFactoryWage, lineWorkers, note, onSave, selectedFactoryId, selectedFactoryWagePerSecond, selectedLine?.name, selectedLineId, summary.records, summary.totalContractedSeconds, summary.workerCount, workDateKey]);

  const detailHeader = (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexDirection: { xs: 'column', md: 'row' }, gap: 1.5 }}>
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>{`${LABELS.title}: ${workDateKey}`}</Typography>
        <Typography variant="body2" color="text.secondary">{`${LABELS.lastUpdated}: ${formatRecentUpdate({ initialLog, unknownLabel: '-' })}`}</Typography>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <LastUpdaterLabel />
        <Button variant="contained" onClick={handleSave} disabled={saving || loading || baseLoading || lineDataLoading || isAggregateLegacyLog}>{saving ? LABELS.saving : LABELS.save}</Button>
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
            {findDuplicateRow(summary.records) ? <Alert severity="warning">같은 작업자/배정카드/공정 조합이 중복되어 있습니다. 수량으로 합산해 주세요.</Alert> : null}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              <Chip label={LABELS.saveCount.replace('{count}', String(summary.records.length))} />
              <Chip variant="outlined" label={LABELS.workerCount.replace('{count}', String(summary.workerCount))} />
              <Chip variant="outlined" label={LABELS.totalCt.replace('{value}', formatDuration(summary.totalContractedSeconds, languageCode))} />
              <Chip variant="outlined" label={LABELS.totalAmount.replace('{value}', totalContractedAmountText)} />
            </Stack>
          </Stack>
        </Paper>

        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2.5, minHeight: 420 }}>
          <PageToolbar left={<SearchInput value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }} placeholder={LABELS.searchPlaceholder} sx={{ width: { xs: '100%', sm: 320, md: 420 } }} />} sx={{ mb: 1.5 }} />

          {!selectedFactoryId ? (
            <Alert severity="info">공장을 선택하면 라인과 작업자를 불러옵니다.</Alert>
          ) : !selectedLineId ? (
            <Alert severity="info">라인을 선택하면 해당 라인의 작업자와 배정카드를 불러옵니다.</Alert>
          ) : lineDataLoading && rows.length === 0 ? (
            <Alert severity="info">라인 데이터를 불러오는 중입니다.</Alert>
          ) : lineWorkers.length === 0 && rows.length === 0 ? (
            <Alert severity="warning">선택한 라인/작업일 기준으로 작업자가 없습니다.</Alert>
          ) : rows.length === 0 ? (
            <Stack spacing={1.5} alignItems="flex-start">
              {assignmentOptions.length === 0 ? <Alert severity="warning">CT가 저장된 배정카드가 없습니다.</Alert> : null}
              <Alert severity="info">첫 작업자 입력 행을 준비 중입니다.</Alert>
            </Stack>
          ) : filteredRows.length === 0 ? (
            <Alert severity="info">검색 결과가 없습니다.</Alert>
          ) : (
            <Stack spacing={1.25}>
              {assignmentOptions.length === 0 ? <Alert severity="warning">CT가 저장된 배정카드가 없습니다.</Alert> : null}
              <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                <Table size="small" sx={{ tableLayout: 'fixed' }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '15%' }}>{LABELS.worker}</TableCell>
                      <TableCell sx={{ width: '24%' }}>{LABELS.assignment}</TableCell>
                      <TableCell sx={{ width: '24%' }}>{LABELS.process}</TableCell>
                      <TableCell sx={{ width: '10%' }} align="right">{LABELS.quantity}</TableCell>
                      <TableCell sx={{ width: '8%' }}>{LABELS.ct}</TableCell>
                      <TableCell sx={{ width: '11%' }} align="right">{LABELS.amount}</TableCell>
                      <TableCell sx={{ width: 88 }} align="right">&nbsp;</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pagedRows.map((row) => {
                      const rowAssignment = resolveAssignmentForRow(row) || row?.assignment || null;
                      const rowProcess = resolveProcessForRow(row, rowAssignment) || row?.process || null;
                      const quantityNumber = Math.max(0, Math.round(Number(row?.quantity) || 0));
                      const rowCtSeconds = Math.max(0, Math.round(Number(rowProcess?.ctSeconds) || 0));
                      const rowContractedSeconds = rowCtSeconds * quantityNumber;
                      const rowAmountText =
                        hasFactoryWage && rowContractedSeconds > 0
                          ? `${formatNumberWithCommas(rowContractedSeconds * selectedFactoryWagePerSecond, {
                              fallback: '0',
                              maximumFractionDigits: 0,
                            })}${LABELS.amountUnit}`
                          : '-';
                      const quantityValue =
                        quantityNumber > 0
                          ? formatNumberWithCommas(quantityNumber, {
                              fallback: '0',
                              maximumFractionDigits: 0,
                            })
                          : '-';
                      const ctText = buildDisplayCtText(rowProcess, LABELS);
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
                      const rowAssignmentOptions = isEditingRow ? resolveAssignmentOptions(rowForOptions) : [];
                      const rowProcessOptions = isEditingRow ? resolveProcessOptions(rowForOptions) : [];
                      const assignmentDisabled =
                        isAggregateLegacyLog || !row?.worker || (rowAssignmentOptions?.length || 0) === 0;
                      const processDisabled =
                        isAggregateLegacyLog || !rowAssignment || (rowProcessOptions?.length || 0) === 0;
                      const workerDisabled =
                        isAggregateLegacyLog || (rowWorkerOptions?.length || 0) === 0;
                      const duplicateProcessKeys = isEditingRow
                        ? resolveDuplicateProcessKeys(row)
                        : null;
                      const shouldFocusWorker = Boolean(
                        isEditingRow &&
                          editingField?.rowId === row.id &&
                          editingField?.field === 'worker'
                      );
                      const shouldFocusAssignment = Boolean(
                        isEditingRow &&
                          editingField?.rowId === row.id &&
                          editingField?.field === 'assignment'
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
                      const assignmentPlaceholder = !row?.worker
                        ? LABELS.selectWorkerFirst
                        : (rowAssignmentOptions?.length || 0) === 0
                          ? LABELS.noAssignmentsAvailable
                          : LABELS.assignmentPlaceholder;
                      const processPlaceholder = !rowAssignment
                        ? LABELS.selectAssignmentFirst
                        : (rowProcessOptions?.length || 0) === 0
                          ? LABELS.noProcessesAvailable
                          : LABELS.processPlaceholder;

                      return (
                        <TableRow
                          key={row.id}
                          hover
                          sx={{
                            '& > td': {
                              backgroundColor: groupBackgroundColor,
                            },
                            ...(rowGroupMeta.isGroupStart
                              ? {
                                  '& > td': {
                                    backgroundColor: groupBackgroundColor,
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
                              <SearchableSelect
                                label={LABELS.assignment}
                                options={rowAssignmentOptions}
                                value={rowAssignment || null}
                                onChange={(_event, value) => handleAssignmentChange(row.id, value)}
                                autoSelect={false}
                                disabled={assignmentDisabled}
                                autoHighlight
                                openOnFocus
                                selectOnFocus
                                clearOnBlur={false}
                                handleHomeEndKeys
                                getOptionLabel={formatAssignmentLabel}
                                isOptionEqualToValue={(option, value) => String(option?.dbId || option?.id || '') === String(value?.dbId || value?.id || '')}
                                textFieldProps={{
                                  size: 'small',
                                  placeholder: assignmentPlaceholder,
                                  autoFocus: shouldFocusAssignment,
                                }}
                              />
                            ) : (
                              <Box
                                onClick={(event) => {
                                  event.stopPropagation();
                                  beginFieldEdit(row.id, 'assignment');
                                }}
                                sx={{
                                  minHeight: 24,
                                  display: 'flex',
                                  alignItems: 'center',
                                  cursor: isAggregateLegacyLog ? 'default' : 'pointer',
                                }}
                              >
                                {rowAssignment ? formatAssignmentLabel(rowAssignment) : '-'}
                              </Box>
                            )}
                          </TableCell>
                          <TableCell sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <SearchableSelect
                                label={LABELS.process}
                                options={rowProcessOptions}
                                value={rowProcess || null}
                                onChange={(_event, value) => handleProcessChange(row.id, value)}
                                autoSelect={false}
                                disabled={processDisabled}
                                autoHighlight
                                openOnFocus
                                selectOnFocus
                                clearOnBlur={false}
                                handleHomeEndKeys
                                getOptionLabel={(option) => buildDisplayProcessName(option, languageCode)}
                                isOptionEqualToValue={(option, value) => String(option?.processKey || option?.id || '') === String(value?.processKey || value?.id || '')}
                                getOptionDisabled={(option) => {
                                  if (!duplicateProcessKeys) return false;
                                  const optionKey = toText(option?.processKey || option?.id);
                                  const currentKey = toText(rowProcess?.processKey || rowProcess?.id);
                                  return Boolean(optionKey && optionKey !== currentKey && duplicateProcessKeys.has(optionKey));
                                }}
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
                                {buildDisplayProcessName(rowProcess, languageCode)}
                              </Box>
                            )}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 0.75, verticalAlign: 'middle' }}>
                            {isEditingRow ? (
                              <TextField
                                label={LABELS.quantity}
                                type="number"
                                size="small"
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
                                disabled={isAggregateLegacyLog || !rowProcess}
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
                          <TableCell sx={{ py: 0.75, whiteSpace: 'nowrap', verticalAlign: 'middle' }}>{ctText}</TableCell>
                          <TableCell
                            align="right"
                            sx={{ py: 0.75, whiteSpace: 'nowrap', verticalAlign: 'middle' }}
                          >
                            {rowAmountText}
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


