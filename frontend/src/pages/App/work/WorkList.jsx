import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import AppPageContainer from '../../../components/AppPageContainer';
import MonthRangeSelector from '../../../components/MonthRangeSelector';
import PageSectionHeader from '../../../components/PageSectionHeader';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import {
  DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  isDateBeforeFactoryManagementStart,
  resolveScopedFactoryManagementStartDateKey,
  resolveScopedFactoryManagementStartDay,
} from '../../../utils/factoryManagementStart';
import { deleteWorkLog, loadWorkLogs } from './workLogStorage';
import {
  extractWorkLogImportIssueRows,
  formatWorkLogImportError,
  importWorkLogRows,
  parseWorkLogImportWorkbook,
} from './workLogImport';

const TEXT = {
  import: { ko: '파일 업로드', en: 'Import File', vi: 'Nhap tep' },
  importSuccess: {
    ko: '엑셀 작업기록을 저장했습니다.',
    en: 'Excel work logs imported.',
    vi: 'Da nhap ghi chep tu Excel.',
  },
  importError: {
    ko: '엑셀 작업기록 업로드에 실패했습니다.',
    en: 'Failed to import Excel work logs.',
    vi: 'Không thể nhap ghi chep Excel.',
  },
  importDataErrorToast: {
    ko: '데이터 오류로 저장하지 못했습니다. 상세 내용을 확인해 주세요.',
    en: 'Import failed due to data errors. Check the details.',
    vi: 'Nhap that bai do loi du lieu. Vui lòng kiem tra chi tiet.',
  },
  importIssueDialogTitle: {
    ko: '작업기록 파일 업로드 오류',
    en: 'Work-log import errors',
    vi: 'Loi nhap tep ghi chep',
  },
  importIssueDialogDescription: {
    ko: '아래 행을 엑셀 파일에서 수정한 뒤 다시 업로드해 주세요.',
    en: 'Fix the rows below in the Excel file, then import again.',
    vi: 'Sua cac dong ben duoi trong tep Excel roi nhap lai.',
  },
  importIssueLocation: { ko: '위치', en: 'Location', vi: 'Vi tri' },
  importIssueReason: { ko: '오류 사유', en: 'Reason', vi: 'Ly do' },
  close: { ko: '닫기', en: 'Close', vi: 'Dong' },
  add: { ko: '기록 추가', en: 'Add Log', vi: 'Them ghi chep' },
  searchPlaceholder: {
    ko: '날짜, 공장, 라인 검색',
    en: 'Search date, factory, line',
    vi: 'Tim ngay, nha may, chuyen',
  },
  workDate: { ko: '작업일자', en: 'Work Date', vi: 'Ngay lam viec' },
  factory: { ko: '공장', en: 'Factory', vi: 'Nhà máy' },
  selectFactory: { ko: '공장 선택', en: 'Select factory', vi: 'Chon nha may' },
  line: { ko: '라인', en: 'Line', vi: 'Chuyền' },
  workers: { ko: '작업자', en: 'Workers', vi: 'Cong nhan' },
  items: { ko: '기록 건수', en: 'Entries', vi: 'So dong' },
  averageCtPerWorker: {
    ko: '1인 일 평균 CT',
    en: 'Avg CT / Worker / Day',
    vi: 'CT trung binh / nguoi / ngay',
  },
  loading: {
    ko: '기록을 불러오는 중입니다.',
    en: 'Loading logs...',
    vi: 'Đang tải ghi chep...',
  },
  empty: {
    ko: '해당 기간에 기록이 없습니다.',
    en: 'No logs found for this period.',
    vi: 'Không có ghi chep trong giai doan nay.',
  },
  fetchError: {
    ko: '기록을 불러오지 못했습니다.',
    en: 'Failed to load logs.',
    vi: 'Không thể tai ghi chep.',
  },
  deleteConfirm: {
    ko: '이 기록을 삭제하시겠습니까?',
    en: 'Delete this log?',
    vi: 'Ban co muon xoa ghi chep nay khong?',
  },
  deleteSuccess: { ko: '기록을 삭제했습니다.', en: 'Log deleted.', vi: 'Đã xóa ghi chep.' },
  deleteError: {
    ko: '기록 삭제에 실패했습니다.',
    en: 'Failed to delete the log.',
    vi: 'Không thể xoa ghi chep.',
  },
  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Thang truoc' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Thang sau' },
  startDate: { ko: '시작일', en: 'Start Date', vi: 'Ngày bắt đầu' },
  endDate: { ko: '종료일', en: 'End Date', vi: 'Ngày kết thúc' },
};

const DAILY_LOG_LABELS = {
  ko: '일일 기록',
  en: 'Daily Records',
  vi: 'Ghi chep ngay',
};

const WORK_LIST_FILTER_STORAGE_PREFIX = 'work-history:list-filters:v1';

const FILTER_DATE_PICKER_SLOT_PROPS = {
  textField: {
    sx: {
      width: { xs: 132, sm: 140 },
    },
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;
const getCrossLineAssignmentWarning = (payload) =>
  payload?.warnings?.crossLineAssignment || null;
const buildImportSuccessMessage = ({
  languageCode,
  recordCount,
  createdCount,
  crossLineRowCount,
}) => {
  if (crossLineRowCount > 0) {
    if (languageCode === 'en') {
      return `Excel work logs imported (${recordCount} rows, ${createdCount} logs). ${crossLineRowCount} cross-line assignment rows were noted in the remark.`;
    }
    if (languageCode === 'vi') {
      return `Da nhap ghi chep Excel (${recordCount} dong, ${createdCount} ghi chep). Da ghi chu ${crossLineRowCount} dong gan line khac vao ghi chu.`;
    }
    return `엑셀 작업기록을 저장했습니다. 다른 라인 배정 작업 ${crossLineRowCount}건을 상세 비고에 남겼습니다. (${recordCount}행, ${createdCount}개 기록)`;
  }
  return `${resolveText(TEXT.importSuccess, languageCode, 'Excel work logs imported.')} (${recordCount} rows, ${createdCount} logs)`;
};

const normalizeImportText = (value) => String(value ?? '').trim();
const isImportDateBeforeOperationStart = (
  value,
  operationStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
) => isDateBeforeFactoryManagementStart(normalizeImportText(value), operationStartDateKey);
const findImportRowsBeforeOperationStart = (
  rows,
  operationStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY
) =>
  (Array.isArray(rows) ? rows : []).filter(
    (row) =>
      isImportDateBeforeOperationStart(row?.coverageStartDate, operationStartDateKey) ||
      isImportDateBeforeOperationStart(row?.coverageEndDate, operationStartDateKey)
  );
const buildImportStartDateErrorMessage = (
  rows,
  operationStartDateKey = DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY,
  languageCode
) => {
  const [firstRow] = Array.isArray(rows) ? rows : [];
  const location = [
    normalizeImportText(firstRow?.sheetName),
    firstRow?.rowNumber ? `row ${firstRow.rowNumber}` : '',
  ]
    .filter(Boolean)
    .join(' / ');
  const suffix = location ? ` (${location})` : '';
  if (languageCode === 'ko') {
    return `작업기록은 ${operationStartDateKey} 이후만 업로드할 수 있습니다.${suffix}`;
  }
  if (languageCode === 'vi') {
    return `Chi co the nhap ghi chep tu ${operationStartDateKey} tro di.${suffix}`;
  }
  return `Only work logs from ${operationStartDateKey} onward can be imported.${suffix}`;
};

const buildWorkDateKey = (value) => dayjs(value).format('YYYY-MM-DD');

const buildWorkCreateTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'New Daily Record';
  if (languageCode === 'vi') return 'Tao ghi chep ngay';
  return '일일 기록 신규';
};

const buildWorkDetailTabLabel = (workDateKey, languageCode) => {
  const title =
    languageCode === 'vi'
      ? 'Chi tiết nhat ky cong viec'
      : languageCode === 'en'
        ? 'Work Log Detail'
        : '작업 기록 상세';
  return workDateKey ? `${title}: ${workDateKey}` : title;
};

const formatDuration = (seconds, languageCode) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (languageCode === 'en') return `${hours}h ${minutes}m`;
  if (languageCode === 'vi') return `${hours} gio ${minutes} phut`;
  return `${hours}시간 ${minutes}분`;
};

const normalizeFilterDate = (value) => {
  const normalized = dayjs(value);
  if (!normalized.isValid()) return null;
  return normalized.startOf('day').toDate();
};

const clampWorkHistoryFilterDate = (
  value,
  operationStartDay = dayjs(DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY).startOf('day')
) => {
  const normalized = normalizeFilterDate(value);
  if (!normalized) return operationStartDay.toDate();
  return dayjs(normalized).isBefore(operationStartDay, 'day')
    ? operationStartDay.toDate()
    : normalized;
};

const buildFilterDateKey = (
  value,
  operationStartDay = dayjs(DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY).startOf('day')
) => {
  const normalized = clampWorkHistoryFilterDate(value, operationStartDay);
  return normalized ? dayjs(normalized).format('YYYY-MM-DD') : '';
};

const getMonthStart = (
  value,
  operationStartMonth = dayjs(DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY).startOf('month'),
  operationStartDay = operationStartMonth.startOf('day')
) => {
  const normalized = clampWorkHistoryFilterDate(value || new Date(), operationStartDay);
  const month = dayjs(normalized).startOf('month');
  return month.isBefore(operationStartMonth, 'month')
    ? operationStartMonth.toDate()
    : month.toDate();
};

const getMonthEnd = (value, operationStartMonth, operationStartDay) => {
  return dayjs(getMonthStart(value, operationStartMonth, operationStartDay)).endOf('month').toDate();
};

const buildWorkListFilterStorageKey = (orgId) =>
  `${WORK_LIST_FILTER_STORAGE_PREFIX}:${String(orgId || 'global').trim() || 'global'}`;
const readStoredWorkListFilters = (orgId) => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(buildWorkListFilterStorageKey(orgId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const storedStart = normalizeFilterDate(
      parsed?.dateFrom ?? parsed?.dateFilterStart ?? null
    );
    const storedEnd = normalizeFilterDate(
      parsed?.dateTo ?? parsed?.dateFilterEnd ?? null
    );
    const selectedFactoryId = String(parsed?.selectedFactoryId || '').trim();
    if (!storedStart && !storedEnd && !selectedFactoryId) return null;
    const dateFilterStart = clampWorkHistoryFilterDate(storedStart || storedEnd || new Date());
    const endCandidate = clampWorkHistoryFilterDate(storedEnd || storedStart || dateFilterStart);
    const dateFilterEnd = endCandidate >= dateFilterStart ? endCandidate : dateFilterStart;
    return {
      selectedFactoryId,
      dateFilterStart,
      dateFilterEnd,
    };
  } catch (_error) {
    return null;
  }
};
const persistWorkListFilters = (orgId, { selectedFactoryId, dateFilterStart, dateFilterEnd }) => {
  if (typeof window === 'undefined') return;
  const startKey = buildFilterDateKey(dateFilterStart);
  const endKey = buildFilterDateKey(dateFilterEnd);
  if (!startKey || !endKey) return;
  try {
    window.sessionStorage.setItem(
      buildWorkListFilterStorageKey(orgId),
      JSON.stringify({
        selectedFactoryId: String(selectedFactoryId || ''),
        dateFrom: startKey,
        dateTo: endKey,
      })
    );
  } catch (_error) {
    // Ignore storage errors to keep filter UX uninterrupted.
  }
};

const resolveWorkLogCoverageDayCount = (log) => {
  const start = dayjs(log?.coverageStartDate);
  const end = dayjs(log?.coverageEndDate);
  if (!start.isValid() || !end.isValid()) return 1;
  const dayCount = end.diff(start, 'day') + 1;
  return dayCount > 0 ? dayCount : 1;
};

const resolveAverageCtSecondsPerWorker = (log) => {
  const workerCount = Math.max(0, Math.round(Number(log?.workerCount) || 0));
  if (workerCount <= 0) return null;
  const totalCtSeconds = Math.max(
    0,
    Math.round(Number(log?.totalCtSeconds) || 0)
  );
  // A single WorkLog can cover a multi-day period (period_summary entries),
  // so dividing by workerCount alone gives a multi-day sum, not a daily
  // figure - divide by the covered day count too so this reads as "1인 일
  // 평균 CT" (per person, per day) rather than an inflated period total.
  const dayCount = resolveWorkLogCoverageDayCount(log);
  return Math.round(totalCtSeconds / workerCount / dayCount);
};

const WorkList = ({ recordKind = 'EMPLOYEE' } = {}) => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId, activeFactoryId } = useAuth();
  const { languageCode } = useLanguage();
  const storedFilters = useMemo(
    () => readStoredWorkListFilters(activeOrgId),
    [activeOrgId]
  );

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [factories, setFactories] = useState([]);
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [selectedFactoryId, setSelectedFactoryId] = useState(() =>
    activeFactoryId ? String(activeFactoryId) : storedFilters?.selectedFactoryId || ''
  );
  const [searchTerm, setSearchTerm] = useState('');
  const selectedFactory = useMemo(
    () =>
      factories.find((factory) => String(factory?.id || '') === String(selectedFactoryId)) || null,
    [factories, selectedFactoryId]
  );
  const workHistoryOperationStartDateKey = useMemo(
    () =>
      resolveScopedFactoryManagementStartDateKey({
        factory: selectedFactory,
        factories,
      }),
    [factories, selectedFactory]
  );
  const workHistoryOperationStartDay = useMemo(
    () =>
      resolveScopedFactoryManagementStartDay({
        factory: selectedFactory,
        factories,
      }),
    [factories, selectedFactory]
  );
  const [dateFilterStart, setDateFilterStart] = useState(
    () =>
      storedFilters?.dateFilterStart ||
      getMonthStart(
        new Date(),
        dayjs(DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY).startOf('month'),
        dayjs(DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY).startOf('day')
      )
  );
  const [dateFilterEnd, setDateFilterEnd] = useState(
    () =>
      storedFilters?.dateFilterEnd ||
      getMonthEnd(
        new Date(),
        dayjs(DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY).startOf('month'),
        dayjs(DEFAULT_FACTORY_MANAGEMENT_START_DATE_KEY).startOf('day')
      )
  );
  const [deletingId, setDeletingId] = useState('');
  const [importing, setImporting] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [importIssueRows, setImportIssueRows] = useState([]);
  const [importIssueDialogOpen, setImportIssueDialogOpen] = useState(false);
  const importInputRef = useRef(null);

  const selectedFactoryIdNumber = useMemo(() => {
    const parsed = Number(selectedFactoryId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [selectedFactoryId]);

  const dateFrom = useMemo(
    () => buildFilterDateKey(dateFilterStart, workHistoryOperationStartDay),
    [dateFilterStart, workHistoryOperationStartDay]
  );
  const dateTo = useMemo(
    () => buildFilterDateKey(dateFilterEnd, workHistoryOperationStartDay),
    [dateFilterEnd, workHistoryOperationStartDay]
  );
  useEffect(() => {
    persistWorkListFilters(activeOrgId, {
      selectedFactoryId: activeFactoryId ? String(activeFactoryId) : selectedFactoryId,
      dateFilterStart,
      dateFilterEnd,
    });
  }, [
    activeFactoryId,
    activeOrgId,
    dateFilterEnd,
    dateFilterStart,
    selectedFactoryId,
  ]);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    const loadFactories = async () => {
      setLoadingFactories(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const rows = await requestJSON(`/factories${query}`, {
          skipGlobalLoading: true,
          signal: abortController.signal,
        }).catch(() => []);

        if (cancelled) return;

        const nextFactories = Array.isArray(rows) ? rows : [];
        setFactories(nextFactories);
        setSelectedFactoryId((prev) => {
          if (
            activeFactoryId &&
            nextFactories.some((factory) => String(factory?.id) === String(activeFactoryId))
          ) {
            return String(activeFactoryId);
          }
          if (prev && nextFactories.some((factory) => String(factory?.id) === String(prev))) {
            return prev;
          }
          return '';
        });
      } finally {
        if (!cancelled) {
          setLoadingFactories(false);
        }
      }
    };

    loadFactories();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeFactoryId, activeOrgId]);

  useEffect(() => {
    setDateFilterStart((current) => {
      const clamped = clampWorkHistoryFilterDate(current, workHistoryOperationStartDay);
      return current?.getTime?.() === clamped?.getTime?.() ? current : clamped;
    });
    setDateFilterEnd((current) => {
      const clampedEnd = clampWorkHistoryFilterDate(current, workHistoryOperationStartDay);
      const clampedStart = clampWorkHistoryFilterDate(dateFilterStart, workHistoryOperationStartDay);
      const nextValue = clampedEnd >= clampedStart ? clampedEnd : clampedStart;
      return current?.getTime?.() === nextValue?.getTime?.() ? current : nextValue;
    });
  }, [dateFilterStart, workHistoryOperationStartDay]);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const rows = await loadWorkLogs({
          orgId: activeOrgId,
          factoryId: selectedFactoryIdNumber,
          dateFrom,
          dateTo,
          includeRecords: false,
          recordKind,
          skipGlobalLoading: true,
          signal: abortController.signal,
        });

        if (!cancelled) {
          setLogs(Array.isArray(rows) ? rows : []);
        }
      } catch (_error) {
        if (!cancelled) {
          setLogs([]);
          showNotification(
            resolveText(TEXT.fetchError, languageCode, '기록을 불러오지 못했습니다.'),
            'error'
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    activeOrgId,
    dateFrom,
    dateTo,
    languageCode,
    recordKind,
    reloadNonce,
    selectedFactoryIdNumber,
    showNotification,
  ]);

  const filteredLogs = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    const sorted = [...logs].sort((left, right) => {
      return (
        dayjs(right?.workDate || right?.updatedAt || right?.createdAt || 0).valueOf() -
        dayjs(left?.workDate || left?.updatedAt || left?.createdAt || 0).valueOf()
      );
    });

    if (!keyword) return sorted;

    return sorted.filter((log) => {
      const searchText = [
        log?.workDate,
        log?.factoryName,
        log?.lineName,
        log?.updatedBy,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchText.includes(keyword);
    });
  }, [logs, searchTerm]);

  const basePath = recordKind === 'OUTSOURCING' ? '/outsourcing-record' : '/work-history';

  const handleAdd = useCallback(() => {
    navigateToPath(`${basePath}/new`, {
      label: buildWorkCreateTabLabel(languageCode),
    });
  }, [basePath, languageCode, navigateToPath]);

  const handleOpen = useCallback(
    (log) => {
      if (!log?.id) return;
      navigateToPath(`${basePath}/${log.id}`, {
        label: buildWorkDetailTabLabel(
          buildWorkDateKey(log.workDate || log.updatedAt || log.createdAt),
          languageCode
        ),
      });
    },
    [basePath, languageCode, navigateToPath]
  );

  const handleDelete = useCallback(
    async (event, log) => {
      event.stopPropagation();
      if (!log?.id) return;
      const confirmed = window.confirm(
        resolveText(TEXT.deleteConfirm, languageCode, '이 기록을 삭제하시겠습니까?')
      );
      if (!confirmed) return;

      const currentId = String(log.id);
      setDeletingId(currentId);
      try {
        await deleteWorkLog(log.id, { orgId: activeOrgId });
        setLogs((prev) => prev.filter((item) => String(item?.id || '') !== currentId));
        showNotification(
          resolveText(TEXT.deleteSuccess, languageCode, '기록을 삭제했습니다.'),
          'success'
        );
      } catch (_error) {
        showNotification(
          resolveText(TEXT.deleteError, languageCode, '기록 삭제에 실패했습니다.'),
          'error'
        );
      } finally {
        setDeletingId('');
      }
    },
    [activeOrgId, languageCode, showNotification]
  );

  const handleImportClick = useCallback(() => {
    importInputRef.current?.click?.();
  }, []);

  const handleImportFileChange = useCallback(
    async (event) => {
      const input = event?.target;
      const [file] = Array.from(input?.files || []);
      if (!file || importing) {
        if (input) input.value = '';
        return;
      }

      setImporting(true);
      try {
        const rows = await parseWorkLogImportWorkbook(file);
        const rowsBeforeStart = findImportRowsBeforeOperationStart(
          rows,
          workHistoryOperationStartDateKey
        );
        if (rowsBeforeStart.length > 0) {
          showNotification(
            buildImportStartDateErrorMessage(
              rowsBeforeStart,
              workHistoryOperationStartDateKey,
              languageCode
            ),
            'error'
          );
          return;
        }
        const result = await importWorkLogRows({
          orgId: activeOrgId,
          fileName: file.name,
          rows,
        });
        setReloadNonce((current) => current + 1);
        const createdCount = Number(result?.createdCount ?? 0) || 0;
        const recordCount = Number(result?.recordCount ?? rows.length) || rows.length;
        const crossLineWarning = getCrossLineAssignmentWarning(result);
        showNotification(
          buildImportSuccessMessage({
            languageCode,
            recordCount,
            createdCount,
            crossLineRowCount: Number(crossLineWarning?.rowCount ?? 0) || 0,
          }),
          crossLineWarning?.rowCount ? 'warning' : 'success'
        );
      } catch (error) {
        const issueRows = extractWorkLogImportIssueRows(error, languageCode);
        if (issueRows.length > 0) {
          setImportIssueRows(issueRows);
          setImportIssueDialogOpen(true);
          showNotification(
            resolveText(
              TEXT.importDataErrorToast,
              languageCode,
              'Import failed due to data errors. Check the details.'
            ),
            'error'
          );
        } else {
          showNotification(
            formatWorkLogImportError(error, languageCode) ||
              resolveText(TEXT.importError, languageCode, 'Failed to import Excel work logs.'),
            'error'
          );
        }
      } finally {
        setImporting(false);
        if (input) input.value = '';
      }
    },
    [activeOrgId, importing, languageCode, showNotification, workHistoryOperationStartDateKey]
  );

  const handleDateFilterStartChange = useCallback((value) => {
    if (!value?.isValid?.()) return;
    const nextStart = clampWorkHistoryFilterDate(value.toDate(), workHistoryOperationStartDay);
    if (!nextStart) return;
    setDateFilterStart(nextStart);
    setDateFilterEnd((prev) => {
      const currentEnd = normalizeFilterDate(prev);
      return currentEnd && currentEnd >= nextStart ? currentEnd : nextStart;
    });
  }, [workHistoryOperationStartDay]);

  const handleDateFilterEndChange = useCallback((value) => {
    if (!value?.isValid?.()) return;
    const nextEnd = clampWorkHistoryFilterDate(value.toDate(), workHistoryOperationStartDay);
    if (!nextEnd) return;
    setDateFilterEnd(nextEnd);
    setDateFilterStart((prev) => {
      const currentStart = normalizeFilterDate(prev);
      return currentStart && currentStart <= nextEnd ? currentStart : nextEnd;
    });
  }, [workHistoryOperationStartDay]);

  const shiftDateFilterMonth = useCallback(
    (amount) => {
      const nextMonthStart = clampWorkHistoryFilterDate(
        dayjs(dateFilterStart).add(amount, 'month').toDate(),
        workHistoryOperationStartDay
      );
      setDateFilterStart(nextMonthStart);
      setDateFilterEnd((previous) => {
        const shifted = clampWorkHistoryFilterDate(
          dayjs(previous).add(amount, 'month').toDate(),
          workHistoryOperationStartDay
        );
        return shifted >= nextMonthStart ? shifted : nextMonthStart;
      });
    },
    [dateFilterStart, workHistoryOperationStartDay]
  );

  return (
    <AppPageContainer
      header={
        <Stack spacing={1}>
          <PageSectionHeader
            title={getUiMessage(
              'menu.workHistory',
              '\uC791\uC5C5 \uAE30\uB85D',
              languageCode
            )}
            actions={(
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  startIcon={<UploadFileIcon />}
                  onClick={handleImportClick}
                  disabled={importing}
                >
                  {resolveText(TEXT.import, languageCode, 'Import File')}
                </Button>
                <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
                  {resolveText(TEXT.add, languageCode, '\uAE30\uB85D \uCD94\uAC00')}
                </Button>
              </Stack>
            )}
          />
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'stretch', lg: 'center' },
              justifyContent: 'space-between',
              flexDirection: { xs: 'column', lg: 'row' },
              gap: 1.25,
              minWidth: 0,
            }}
          >
            <SearchInput
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={resolveText(TEXT.searchPlaceholder, languageCode, '날짜, 공장, 라인 검색')}
              sx={{
                width: { xs: '100%', sm: 'auto' },
                minWidth: { sm: 320 },
                maxWidth: { lg: 640 },
                flex: 1,
              }}
            />
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 180 }, flexShrink: 0, ml: { lg: 'auto' } }}>
              <InputLabel id="work-list-factory-filter-label">
                {resolveText(TEXT.factory, languageCode, '공장')}
              </InputLabel>
              <Select
                labelId="work-list-factory-filter-label"
                value={selectedFactoryId}
                label={resolveText(TEXT.factory, languageCode, '공장')}
                onChange={(event) => setSelectedFactoryId(String(event.target.value || ''))}
                disabled={loadingFactories}
              >
                <MenuItem value="">
                  {resolveText(TEXT.selectFactory, languageCode, '공장 선택')}
                </MenuItem>
                {factories.map((factory) => (
                  <MenuItem key={factory.id} value={String(factory.id)}>
                    {factory.name ||
                      `${resolveText(TEXT.factory, languageCode, '공장')} ${factory.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box
              sx={{
                display: 'flex',
                alignItems: { xs: 'stretch', lg: 'center' },
                justifyContent: { xs: 'flex-start', lg: 'flex-end' },
                flexDirection: { xs: 'column', lg: 'row' },
                gap: 1,
                flexWrap: 'wrap',
                flexShrink: 0,
                minWidth: 0,
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  justifyContent: { xs: 'flex-start', lg: 'flex-end' },
                  flexWrap: 'wrap',
                  flexShrink: 0,
                }}
              >
                <MonthRangeSelector
                  monthOnly={false}
                  startValue={dateFilterStart}
                  endValue={dateFilterEnd}
                  onStartChange={handleDateFilterStartChange}
                  onEndChange={handleDateFilterEndChange}
                  onShift={shiftDateFilterMonth}
                  slotProps={FILTER_DATE_PICKER_SLOT_PROPS}
                  minDate={workHistoryOperationStartDay}
                  startLabel={resolveText(TEXT.startDate, languageCode, 'Start Date')}
                  endLabel={resolveText(TEXT.endDate, languageCode, 'End Date')}
                />
              </Stack>
            </Box>
          </Box>
        </Stack>
      }
    >
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleImportFileChange}
        style={{ display: 'none' }}
      />
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ display: { xs: 'block', sm: 'none' }, p: 1.25 }}>
          {loading ? (
            <Typography variant="body2" color="text.secondary">
              {resolveText(TEXT.loading, languageCode, '기록을 불러오는 중입니다.')}
            </Typography>
          ) : filteredLogs.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {resolveText(TEXT.empty, languageCode, '해당 기간에 기록이 없습니다.')}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {filteredLogs.map((log) => (
                <Paper
                  key={log.id}
                  variant="outlined"
                  onDoubleClick={() => handleOpen(log)}
                  sx={{
                    p: 1.25,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                  }}
                >
                  <Stack spacing={0.75}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        justifyContent: 'space-between',
                        gap: 1,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {log.workDate || '-'}
                      </Typography>
                      <Tooltip title={getUiMessage('common.delete', '삭제', languageCode)}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(event) => handleDelete(event, log)}
                            onDoubleClick={(event) => event.stopPropagation()}
                            disabled={deletingId === String(log.id)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {[log.factoryName, log.lineName].filter(Boolean).join(' / ') || '-'}
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 0.75,
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {`${resolveText(TEXT.workers, languageCode, '작업자')} ${
                          log.workerCount || 0
                        }`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${resolveText(TEXT.items, languageCode, '기록 건수')} ${
                          log.itemCount || 0
                        }`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${resolveText(TEXT.averageCtPerWorker, languageCode, '1인 일 평균 CT')} ${
                          resolveAverageCtSecondsPerWorker(log) === null
                            ? '-'
                            : formatDuration(
                                resolveAverageCtSecondsPerWorker(log),
                                languageCode
                              )
                        }`}
                      </Typography>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
        <TableContainer sx={{ display: { xs: 'none', sm: 'block' } }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{resolveText(TEXT.workDate, languageCode, '작업일자')}</TableCell>
                <TableCell>{resolveText(TEXT.factory, languageCode, '공장')}</TableCell>
                <TableCell>{resolveText(TEXT.line, languageCode, '라인')}</TableCell>
                <TableCell align="right">
                  {resolveText(TEXT.workers, languageCode, '작업자')}
                </TableCell>
                <TableCell align="right">
                  {resolveText(TEXT.items, languageCode, '기록 건수')}
                </TableCell>
                <TableCell>
                  {resolveText(TEXT.averageCtPerWorker, languageCode, '1인 일 평균 CT')}
                </TableCell>
                <TableCell align="right">&nbsp;</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableStatusRow
                  colSpan={7}
                  message={resolveText(TEXT.loading, languageCode, '기록을 불러오는 중입니다.')}
                />
              ) : filteredLogs.length === 0 ? (
                <TableStatusRow
                  colSpan={7}
                  message={resolveText(TEXT.empty, languageCode, '해당 기간에 기록이 없습니다.')}
                />
              ) : (
                filteredLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    hover
                    onDoubleClick={() => handleOpen(log)}
                    sx={{
                      cursor: 'pointer',
                      '& td': { verticalAlign: 'middle' },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{log.workDate || '-'}</TableCell>
                    <TableCell>{log.factoryName || '-'}</TableCell>
                    <TableCell>{log.lineName || '-'}</TableCell>
                    <TableCell align="right">{log.workerCount || 0}</TableCell>
                    <TableCell align="right">{log.itemCount || 0}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {resolveAverageCtSecondsPerWorker(log) === null
                        ? '-'
                        : formatDuration(
                            resolveAverageCtSecondsPerWorker(log),
                            languageCode
                          )}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={getUiMessage('common.delete', '삭제', languageCode)}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(event) => handleDelete(event, log)}
                            onDoubleClick={(event) => event.stopPropagation()}
                            disabled={deletingId === String(log.id)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Dialog
        open={importIssueDialogOpen}
        onClose={() => setImportIssueDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {resolveText(TEXT.importIssueDialogTitle, languageCode, 'Work-log import errors')}
          {importIssueRows.length > 0 && (
            <Chip
              size="small"
              color="error"
              label={importIssueRows.length}
              sx={{ ml: 1 }}
            />
          )}
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {resolveText(
              TEXT.importIssueDialogDescription,
              languageCode,
              'Fix the rows below in the Excel file, then import again.'
            )}
          </Typography>
          <TableContainer sx={{ maxHeight: 420 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    {resolveText(TEXT.importIssueLocation, languageCode, 'Location')}
                  </TableCell>
                  <TableCell>
                    {resolveText(TEXT.importIssueReason, languageCode, 'Reason')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {importIssueRows.map((issue) => (
                  <TableRow key={issue.key}>
                    <TableCell sx={{ whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      {issue.location}
                    </TableCell>
                    <TableCell>{issue.detail}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportIssueDialogOpen(false)}>
            {resolveText(TEXT.close, languageCode, 'Close')}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default WorkList;
