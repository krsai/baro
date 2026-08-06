import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  CircularProgress,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import AvailableMonthRangeSelector from '../../../components/AvailableMonthRangeSelector';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import useHolidayCalendar from '../../../hooks/useHolidayCalendar';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import {
  buildAttendanceImportPlan,
  mergeImportedAttendanceEntries,
  parseAttendanceImportFile,
} from './attendanceFileImport';

const TEXT = {
  add: { ko: '기록 추가', en: 'Add Entry', vi: 'Them ban ghi' },
  import: { ko: '파일 등록', en: 'Import File', vi: 'Nhap tep' },
  importing: { ko: '등록 중', en: 'Importing', vi: 'Dang nhap' },
  importHint: {
    ko: 'CSV/XLSX 파일을 올리면 자동으로 출퇴근을 등록합니다.',
    en: 'Upload CSV/XLSX and auto-register attendance.',
    vi: 'Tai tep CSV/XLSX de tu dong dang ky cham cong.',
  },
  searchPlaceholder: { ko: '날짜 검색', en: 'Search date', vi: 'Tim ngay' },
  workDate: { ko: '근무일자', en: 'Work Date', vi: 'Ngay lam viec' },
  workType: { ko: '타입', en: 'Type', vi: 'Loai' },
  enteredWorkers: { ko: '인원', en: 'Workers', vi: 'So nguoi' },
  workedHoursAverage: { ko: '평균 근무시간', en: 'Avg Hours', vi: 'Gio lam trung binh' },
  noteCount: { ko: '메모 건수', en: 'Notes', vi: 'So ghi chu' },
  holidayMark: { ko: '공휴일', en: 'Holiday', vi: 'Ngay le' },
  typeSunday: { ko: '일요일', en: 'Sunday', vi: 'Chu nhat' },
  typeHoliday: { ko: '공휴일', en: 'Holiday', vi: 'Ngay le' },
  typeNone: { ko: '-', en: '-', vi: '-' },
  typeMissing: { ko: '\uBBF8\uC785\uB825', en: 'Missing', vi: 'Chua nhap' },
  loading: {
    ko: '출퇴근 기록을 불러오는 중입니다.',
    en: 'Loading attendance...',
    vi: 'Dang tai cham cong...',
  },
  empty: {
    ko: '해당 조건의 출퇴근 기록이 없습니다.',
    en: 'No attendance records found.',
    vi: 'Khong co du lieu cham cong.',
  },
  fetchError: {
    ko: '출퇴근 기록을 불러오지 못했습니다.',
    en: 'Failed to load attendance records.',
    vi: 'Khong the tai du lieu cham cong.',
  },
  monthLabel: { ko: '조회 월', en: 'Month', vi: 'Thang' },
  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Thang truoc' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Thang sau' },
  factory: { ko: '공장', en: 'Factory', vi: 'Nha may' },
  selectFactoryFirst: {
    ko: '공장을 먼저 선택하세요.',
    en: 'Select a factory first.',
    vi: 'Hay chon nha may truoc.',
  },
  importNoWorkers: {
    ko: '작업자 목록이 없어 파일을 등록할 수 없습니다.',
    en: 'No workers found. Cannot import this file.',
    vi: 'Khong co cong nhan. Khong the nhap tep.',
  },
  importNoRows: {
    ko: '가져올 수 있는 출퇴근 데이터가 없습니다.',
    en: 'No importable attendance rows found.',
    vi: 'Khong co du lieu cham cong de nhap.',
  },
  importConfirm: {
    ko: '파일에서 {eventCount}건 이벤트, {dayCount}일 데이터를 찾았습니다. 등록할까요?',
    en: 'Found {eventCount} events for {dayCount} days. Import now?',
    vi: 'Da tim thay {eventCount} su kien trong {dayCount} ngay. Tiep tuc nhap?',
  },
  importDone: {
    ko: '파일 등록 완료: {dayCount}일, 반영 이벤트 {matchedCount}건, 미매칭 {unmatchedCount}건',
    en: 'Import done: {dayCount} days, matched {matchedCount}, unmatched {unmatchedCount}',
    vi: 'Nhap xong: {dayCount} ngay, khop {matchedCount}, khong khop {unmatchedCount}',
  },
  importFail: {
    ko: '파일 등록에 실패했습니다.',
    en: 'Failed to import file.',
    vi: 'Nhap tep that bai.',
  },
  deleteConfirm: {
    en: 'Delete all attendance records for this day?',
    vi: 'Ban co muon xoa toan bo cham cong cua ngay nay khong?',
    ko: '해당 일자의 출퇴근 기록을 모두 삭제하시겠습니까?',
  },
  deleteSuccess: {
    en: 'Attendance records deleted.',
    vi: 'Da xoa du lieu cham cong.',
    ko: '출퇴근 기록을 삭제했습니다.',
  },
  deleteError: {
    en: 'Failed to delete attendance records.',
    vi: 'Khong the xoa du lieu cham cong.',
    ko: '출퇴근 기록 삭제에 실패했습니다.',
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;

const formatTemplate = (template, params = {}) =>
  String(template || '').replace(/\{(\w+)\}/g, (_match, token) => {
    if (!Object.prototype.hasOwnProperty.call(params, token)) return '';
    return String(params[token] ?? '');
  });

const buildAttendanceCreateTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'New Attendance';
  if (languageCode === 'vi') return 'Cham cong moi';
  return '출퇴근 신규';
};

const buildAttendanceDetailTabLabel = (workDate, languageCode) => {
  const title =
    languageCode === 'vi'
      ? 'Chi tiet cham cong'
      : languageCode === 'en'
        ? 'Attendance Detail'
        : '출퇴근 상세';
  return workDate ? `${title}: ${workDate}` : title;
};

const toHoursTextFromSeconds = (seconds, languageCode) => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = safeSeconds / 3600;
  const roundedHours = Number.isFinite(hours) ? hours.toFixed(1) : '0.0';
  if (languageCode === 'en') return `${roundedHours}h`;
  if (languageCode === 'vi') return `${roundedHours} gio`;
  return `${roundedHours}시간`;
};

const toOptionalDateKey = (value) => {
  if (!value) return '';
  const text = String(value || '').trim();
  const dateMatch = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (dateMatch) return dateMatch[0];
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '';
};

const isAttendanceEmployeeVisibleOnDate = (employee, workDateKey) => {
  if (String(employee?.status || '').toUpperCase() !== 'ACTIVE') return false;
  if (String(employee?.orgRole || '').toUpperCase() !== 'WORKER') return false;

  const joinedDateKey = toOptionalDateKey(employee?.joinedAt);
  if (joinedDateKey && workDateKey && workDateKey < joinedDateKey) return false;

  const leftDateKey = toOptionalDateKey(employee?.leftAt);
  if (leftDateKey && workDateKey && workDateKey > leftDateKey) return false;

  return true;
};

const toWorkerAttendanceRatioText = (enteredWorkerCount, activeWorkerCount) => {
  const entered = Number(enteredWorkerCount);
  const active = Number(activeWorkerCount);
  if (!Number.isFinite(active) || active <= 0) return '-';
  const safeEntered = Number.isFinite(entered) && entered > 0 ? Math.trunc(entered) : 0;
  return `${formatNumberWithCommas(safeEntered, {
    fallback: '0',
    maximumFractionDigits: 0,
  })}/${formatNumberWithCommas(active, {
    fallback: '0',
    maximumFractionDigits: 0,
  })}`;
};

const toAverageHoursTextFromRow = (row, languageCode) => {
  const workerCount = Number(row?.enteredWorkerCount);
  const avgSeconds = Number(row?.workedSecondsAverage);
  if (!Number.isFinite(workerCount) || workerCount <= 0) return '-';
  if (!Number.isFinite(avgSeconds)) return '-';
  return toHoursTextFromSeconds(avgSeconds, languageCode);
};
const toCountTextOrDash = (value) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) return '-';
  return formatNumberWithCommas(count, {
    fallback: '-',
    maximumFractionDigits: 0,
  });
};

const WEEKDAY_TOKENS = {
  ko: ['\uC77C', '\uC6D4', '\uD654', '\uC218', '\uBAA9', '\uAE08', '\uD1A0'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  vi: ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'],
};

const buildWorkDateDisplay = (workDate, languageCode, holidaySet) => {
  const dateText = String(workDate || '').trim();
  if (!dateText) {
    return { dateText: '-', weekdayText: '', isSunday: false, isHoliday: false };
  }
  const isHoliday = holidaySet?.has(dateText);

  const parsedDate = dayjs(dateText);
  if (!parsedDate.isValid()) {
    return { dateText, weekdayText: '', isSunday: false, isHoliday: Boolean(isHoliday) };
  }

  const dayIndex = parsedDate.day();
  const tokens = WEEKDAY_TOKENS[languageCode] || WEEKDAY_TOKENS.ko;
  const weekdayToken = tokens[dayIndex];

  return {
    dateText,
    weekdayText: weekdayToken ? `(${weekdayToken})` : '',
    isSunday: dayIndex === 0,
    isHoliday: Boolean(isHoliday),
  };
};

const buildWorkTypeText = ({ isSunday, isHoliday, hasEntries, languageCode }) => {
  const types = [];
  if (isSunday) {
    types.push(resolveText(TEXT.typeSunday, languageCode, 'Sunday'));
  }
  if (isHoliday) {
    types.push(resolveText(TEXT.typeHoliday, languageCode, 'Holiday'));
  }
  if (types.length === 0 && !hasEntries) {
    return resolveText(TEXT.typeMissing, languageCode, 'Missing');
  }
  if (types.length === 0) return resolveText(TEXT.typeNone, languageCode, '-');
  return types.join(' + ');
};

const AttendanceList = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId, activeFactoryId } = useAuth();
  const { languageCode } = useLanguage();

  const [selectedStartMonth, setSelectedStartMonth] = useState('');
  const [selectedEndMonth, setSelectedEndMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [importingFile, setImportingFile] = useState(false);
  const [deletingWorkDate, setDeletingWorkDate] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const fileInputRef = useRef(null);

  const { holidaySet } = useHolidayCalendar(activeOrgId);

  useEffect(() => {
    let cancelled = false;
    const loadFactories = async () => {
      setLoadingFactories(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const fetched = await requestJSON('/factories' + query).catch(() => []);
        if (cancelled) return;
        const list = Array.isArray(fetched) ? fetched : [];
        setFactories(list);

        if (list.length === 0) {
          setSelectedFactoryId('');
          return;
        }

        const hasActiveFactory = list.some(
          (factory) => String(factory?.id) === String(activeFactoryId)
        );
        if (hasActiveFactory) {
          setSelectedFactoryId(String(activeFactoryId));
          return;
        }

        setSelectedFactoryId((prev) => {
          const hasPrev = list.some((factory) => String(factory?.id) === String(prev));
          return hasPrev ? prev : String(list[0]?.id || '');
        });
      } finally {
        if (!cancelled) setLoadingFactories(false);
      }
    };

    loadFactories();
    return () => {
      cancelled = true;
    };
  }, [activeFactoryId, activeOrgId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (!selectedFactoryId) {
      setAvailableMonths([]);
      setSelectedStartMonth('');
      setSelectedEndMonth('');
      return () => controller.abort();
    }

    const loadAvailableMonths = async () => {
      const query = buildQueryString({
        orgId: activeOrgId,
        factoryId: selectedFactoryId,
        monthsOnly: true,
      });
      const fetched = await requestJSON('/attendance-entries' + query, {
        signal: controller.signal,
      }).catch(() => []);
      if (cancelled || controller.signal.aborted) return;
      const months = (Array.isArray(fetched) ? fetched : []).filter((value) =>
        /^\d{4}-\d{2}$/.test(String(value || ''))
      );
      setAvailableMonths(months);
      setSelectedStartMonth((previous) =>
        months.includes(previous) ? previous : String(months[0] || '')
      );
      setSelectedEndMonth((previous) =>
        months.includes(previous) ? previous : String(months[0] || '')
      );
    };

    loadAvailableMonths();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeOrgId, reloadToken, selectedFactoryId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    if (!selectedFactoryId || !selectedStartMonth || !selectedEndMonth) {
      setRows([]);
      setEmployees([]);
      setLoadingRows(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const loadRows = async () => {
      setLoadingRows(true);
      try {
        const monthsToLoad = availableMonths.filter(
          (month) => month >= selectedStartMonth && month <= selectedEndMonth
        );
        const employeeQuery = buildQueryString({
          orgId: activeOrgId,
          factoryId: selectedFactoryId,
          membershipRole: 'WORKER',
        });
        const [fetchedByMonth, fetchedEmployees] = await Promise.all([
          Promise.all(monthsToLoad.map((month) => requestJSON('/attendance-entries' + buildQueryString({
            orgId: activeOrgId,
            factoryId: selectedFactoryId,
            month,
          }), { signal: controller.signal }))),
          requestJSON('/employees' + employeeQuery, {
            signal: controller.signal,
          }),
        ]);
        if (cancelled) return;
        setRows(fetchedByMonth.flatMap((fetched) => (Array.isArray(fetched) ? fetched : [])));
        setEmployees(Array.isArray(fetchedEmployees) ? fetchedEmployees : []);
      } catch (_error) {
        if (cancelled || controller.signal.aborted) return;
        setRows([]);
        setEmployees([]);
        showNotification(
          resolveText(TEXT.fetchError, languageCode, '출퇴근 기록을 불러오지 못했습니다.'),
          'error'
        );
      } finally {
        if (!cancelled) setLoadingRows(false);
      }
    };

    loadRows();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeOrgId,
    languageCode,
    availableMonths,
    reloadToken,
    selectedFactoryId,
    selectedEndMonth,
    selectedStartMonth,
    showNotification,
  ]);

  const summaryRows = useMemo(() => {
    const groupedByDate = new Map();
    rows.forEach((row) => {
      const workDate = String(row?.workDate || '').trim();
      if (!workDate) return;
      const workerId = String(row?.workerId || '').trim();
      const employee = employees.find((item) => String(item?.id || '').trim() === workerId);
      if (!workerId || !isAttendanceEmployeeVisibleOnDate(employee, workDate)) return;

      if (!groupedByDate.has(workDate)) {
        groupedByDate.set(workDate, {
          workDate,
          workerIds: new Set(),
          workedSecondsTotal: 0,
          noteCount: 0,
        });
      }

      const bucket = groupedByDate.get(workDate);
      bucket.workerIds.add(workerId);

      const workedSeconds = Number(row?.workedSeconds);
      if (Number.isFinite(workedSeconds) && workedSeconds > 0) {
        bucket.workedSecondsTotal += workedSeconds;
      }

      if (String(row?.note || '').trim()) {
        bucket.noteCount += 1;
      }
    });

    const nextRows = [];
    const selectedStartDate = dayjs(`${selectedStartMonth}-01`);
    const selectedEndDate = dayjs(`${selectedEndMonth}-01`).endOf('month');
    if (!selectedStartMonth || !selectedEndMonth || !selectedStartDate.isValid() || !selectedEndDate.isValid()) return [];
    let cursor = selectedStartDate.startOf('month');

    while (!cursor.isAfter(selectedEndDate, 'day')) {
      const workDate = cursor.format('YYYY-MM-DD');
      const item = groupedByDate.get(workDate);
      const enteredWorkerCount = item?.workerIds?.size || 0;
      const activeWorkerCount = employees.filter((employee) =>
        isAttendanceEmployeeVisibleOnDate(employee, workDate)
      ).length;
      const noteCount = item?.noteCount || 0;
      const workedSecondsTotal = item?.workedSecondsTotal || 0;

      nextRows.push({
        workDate,
        enteredWorkerCount,
        activeWorkerCount,
        workedSecondsTotal,
        workedSecondsAverage:
          enteredWorkerCount > 0 ? workedSecondsTotal / enteredWorkerCount : null,
        noteCount,
        hasEntries: enteredWorkerCount > 0 || noteCount > 0,
      });
      cursor = cursor.add(1, 'day');
    }

    return nextRows.sort(
      (left, right) =>
        dayjs(right.workDate).valueOf() - dayjs(left.workDate).valueOf()
    );
  }, [employees, rows, selectedEndMonth, selectedStartMonth]);

  const filteredRows = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    if (!keyword) return summaryRows;
    return summaryRows.filter((row) =>
      String(row?.workDate || '').toLowerCase().includes(keyword)
    );
  }, [searchTerm, summaryRows]);

  const refreshRows = useCallback(() => {
    setReloadToken((prev) => prev + 1);
  }, []);

  const loadWorkersForFactory = useCallback(async () => {
    const query = buildQueryString({
      orgId: activeOrgId,
      factoryId: selectedFactoryId,
      membershipRole: 'WORKER',
    });
    const fetched = await requestJSON('/employees' + query, {
      skipGlobalLoading: true,
    }).catch(() => []);
    return Array.isArray(fetched) ? fetched : [];
  }, [activeOrgId, selectedFactoryId]);

  const handleAdd = useCallback(() => {
    navigateToPath('/attendance/new', {
      label: buildAttendanceCreateTabLabel(languageCode),
    });
  }, [languageCode, navigateToPath]);

  const handleOpenDetail = useCallback(
    (row) => {
      if (!selectedFactoryId || !row?.workDate) return;
      const targetPath = `/attendance/${selectedFactoryId}/${row.workDate}`;
      navigateToPath(targetPath, {
        label: buildAttendanceDetailTabLabel(row.workDate, languageCode),
      });
    },
    [languageCode, navigateToPath, selectedFactoryId]
  );

  const handleDelete = useCallback(
    async (event, row) => {
      event.stopPropagation();
      const workDate = String(row?.workDate || '').trim();
      if (!selectedFactoryId || !workDate) return;

      const confirmed = window.confirm(
        resolveText(
          TEXT.deleteConfirm,
          languageCode,
          'Delete all attendance records for this day?'
        )
      );
      if (!confirmed) return;

      setDeletingWorkDate(workDate);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        await requestJSON('/attendance-entries' + query, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factoryId: Number(selectedFactoryId),
            workDate,
            entries: [],
          }),
        });
        setRows((prev) =>
          prev.filter((item) => String(item?.workDate || '').trim() !== workDate)
        );
        showNotification(
          resolveText(TEXT.deleteSuccess, languageCode, 'Attendance records deleted.'),
          'success'
        );
      } catch (_error) {
        showNotification(
          resolveText(
            TEXT.deleteError,
            languageCode,
            'Failed to delete attendance records.'
          ),
          'error'
        );
      } finally {
        setDeletingWorkDate('');
      }
    },
    [activeOrgId, languageCode, selectedFactoryId, showNotification]
  );

  const handleClickImport = useCallback(() => {
    if (!selectedFactoryId) {
      showNotification(
        resolveText(TEXT.selectFactoryFirst, languageCode, 'Select a factory first.'),
        'warning'
      );
      return;
    }
    fileInputRef.current?.click();
  }, [languageCode, selectedFactoryId, showNotification]);

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;
      event.target.value = '';
      if (!file) return;

      if (!selectedFactoryId) {
        showNotification(
          resolveText(TEXT.selectFactoryFirst, languageCode, 'Select a factory first.'),
          'warning'
        );
        return;
      }

      setImportingFile(true);
      try {
        const parsed = await parseAttendanceImportFile(file);
        if (!parsed.events.length) {
          showNotification(
            resolveText(TEXT.importNoRows, languageCode, 'No importable attendance rows found.'),
            'warning'
          );
          return;
        }

        const workers = await loadWorkersForFactory();
        if (!workers.length) {
          showNotification(
            resolveText(TEXT.importNoWorkers, languageCode, 'No workers found. Cannot import this file.'),
            'error'
          );
          return;
        }

        const importPlan = buildAttendanceImportPlan({
          events: parsed.events,
          employees: workers,
        });
        if (!importPlan.dailyEntries.length) {
          showNotification(
            resolveText(TEXT.importNoRows, languageCode, 'No importable attendance rows found.'),
            'warning'
          );
          return;
        }

        const confirmTemplate = resolveText(
          TEXT.importConfirm,
          languageCode,
          'Found {eventCount} events for {dayCount} days. Import now?'
        );
        const shouldImport = window.confirm(
          formatTemplate(confirmTemplate, {
            eventCount: importPlan.rawEventCount,
            dayCount: importPlan.dailyEntries.length,
          })
        );
        if (!shouldImport) return;

        let updatedDayCount = 0;
        for (const daily of importPlan.dailyEntries) {
          const readQuery = buildQueryString({
            orgId: activeOrgId,
            factoryId: selectedFactoryId,
            workDate: daily.workDate,
          });
          const existingRows = await requestJSON('/attendance-entries' + readQuery, {
            skipGlobalLoading: true,
          }).catch(() => []);
          const mergedEntries = mergeImportedAttendanceEntries(existingRows, daily.entries);

          const saveQuery = buildQueryString({ orgId: activeOrgId });
          await requestJSON('/attendance-entries' + saveQuery, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            skipGlobalLoading: true,
            body: JSON.stringify({
              factoryId: Number(selectedFactoryId),
              workDate: daily.workDate,
              entries: mergedEntries,
            }),
          });

          updatedDayCount += 1;
        }

        refreshRows();
        const doneTemplate = resolveText(
          TEXT.importDone,
          languageCode,
          'Import done: {dayCount} days, matched {matchedCount}, unmatched {unmatchedCount}'
        );
        showNotification(
          formatTemplate(doneTemplate, {
            dayCount: updatedDayCount,
            matchedCount: importPlan.matchedEventCount,
            unmatchedCount: importPlan.unmatchedEventCount,
          }),
          'success'
        );
      } catch (error) {
        showNotification(
          error?.message ||
            resolveText(TEXT.importFail, languageCode, 'Failed to import file.'),
          'error'
        );
      } finally {
        setImportingFile(false);
      }
    },
    [
      activeOrgId,
      languageCode,
      loadWorkersForFactory,
      refreshRows,
      selectedFactoryId,
      showNotification,
    ]
  );

  return (
    <AppPageContainer
      title={getUiMessage('menu.attendance', 'Attendance', languageCode)}
      titleActions={(
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={importingFile ? <CircularProgress size={16} /> : <UploadFileIcon />}
            onClick={handleClickImport}
            disabled={!selectedFactoryId || importingFile}
            title={resolveText(TEXT.importHint, languageCode, '')}
          >
            {importingFile
              ? resolveText(TEXT.importing, languageCode, 'Importing')
              : resolveText(TEXT.import, languageCode, 'Import File')}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={!selectedFactoryId || importingFile}
          >
            {resolveText(TEXT.add, languageCode, 'Add Entry')}
          </Button>
        </Stack>
      )}
      toolbar={(
        <PageToolbar
          showLastUpdater={false}
          left={(
            <SearchInput
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={resolveText(TEXT.searchPlaceholder, languageCode, 'Search date')}
            />
          )}
          right={[
            <FormControl key="factory" size="small" sx={{ minWidth: 190 }}>
              <InputLabel id="attendance-list-factory-label">
                {resolveText(TEXT.factory, languageCode, 'Factory')}
              </InputLabel>
              <Select
                labelId="attendance-list-factory-label"
                value={selectedFactoryId}
                label={resolveText(TEXT.factory, languageCode, 'Factory')}
                onChange={(event) => setSelectedFactoryId(String(event.target.value || ''))}
                disabled={loadingFactories || factories.length === 0}
              >
                {factories.map((factory) => (
                  <MenuItem key={factory.id} value={String(factory.id)}>
                    {factory.name || `Factory ${factory.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>,
            <AvailableMonthRangeSelector
              key="month-range"
              months={availableMonths}
              startMonth={selectedStartMonth}
              endMonth={selectedEndMonth}
              onStartChange={setSelectedStartMonth}
              onEndChange={setSelectedEndMonth}
              disabled={loadingRows}
            />,
          ]}
        />
      )}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{resolveText(TEXT.workDate, languageCode, 'Work Date')}</TableCell>
                <TableCell>{resolveText(TEXT.workType, languageCode, 'Type')}</TableCell>
                <TableCell align="right">
                  {resolveText(TEXT.enteredWorkers, languageCode, 'Entered Workers')}
                </TableCell>
                <TableCell align="right">
                  {resolveText(TEXT.workedHoursAverage, languageCode, 'Avg Worked')}
                </TableCell>
                <TableCell align="right">
                  {resolveText(TEXT.noteCount, languageCode, 'Notes')}
                </TableCell>
                <TableCell align="right">&nbsp;</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingRows || loadingFactories ? (
                <TableStatusRow
                  colSpan={6}
                  message={resolveText(TEXT.loading, languageCode, 'Loading attendance...')}
                />
              ) : !selectedFactoryId || filteredRows.length === 0 ? (
                <TableStatusRow
                  colSpan={6}
                  message={resolveText(TEXT.empty, languageCode, 'No attendance records found.')}
                />
              ) : (
                filteredRows.map((row) => {
                  const { dateText, weekdayText, isSunday, isHoliday } = buildWorkDateDisplay(
                    row.workDate,
                    languageCode,
                    holidaySet
                  );
                  const isSpecialDay = isSunday || isHoliday;
                  const workTypeText = buildWorkTypeText({
                    isSunday,
                    isHoliday,
                    hasEntries: Boolean(row.hasEntries),
                    languageCode,
                  });

                  return (
                    <TableRow
                      key={row.workDate}
                      hover
                      onDoubleClick={() => handleOpenDetail(row)}
                      sx={{
                        cursor: 'pointer',
                        ...(isSpecialDay
                          ? {
                              backgroundColor: '#FFF1F3',
                              '&:hover': {
                                backgroundColor: '#FFE4E8 !important',
                              },
                            }
                          : {}),
                      }}
                    >
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {dateText}
                        {weekdayText ? ` ${weekdayText}` : ''}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{workTypeText}</TableCell>
                      <TableCell align="right">
                        {toWorkerAttendanceRatioText(row.enteredWorkerCount, row.activeWorkerCount)}
                      </TableCell>
                      <TableCell align="right">
                        {toAverageHoursTextFromRow(row, languageCode)}
                      </TableCell>
                      <TableCell align="right">{toCountTextOrDash(row.noteCount)}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={getUiMessage('common.delete', '삭제', languageCode)}>
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={(event) => handleDelete(event, row)}
                              onDoubleClick={(event) => event.stopPropagation()}
                              disabled={
                                deletingWorkDate === String(row.workDate) || !row.hasEntries
                              }
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </AppPageContainer>
  );
};

export default AttendanceList;
