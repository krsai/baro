import { isAttendanceEmployeeVisibleOnDate } from './attendanceEmployment';
import PayrollSettingsDialog from '../payroll/PayrollSettingsDialog';
import SettingsIcon from '@mui/icons-material/Settings';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Chip,
  CircularProgress,
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
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import MonthSelector from '../../../components/MonthSelector';
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
  importing: { ko: '등록 중', en: 'Importing', vi: 'Đăng nhập' },
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
    vi: 'Đang tải cham cong...',
  },
  empty: {
    ko: '해당 조건의 출퇴근 기록이 없습니다.',
    en: 'No attendance records found.',
    vi: 'Không có du lieu cham cong.',
  },
  fetchError: {
    ko: '출퇴근 기록을 불러오지 못했습니다.',
    en: 'Failed to load attendance records.',
    vi: 'Không thể tai du lieu cham cong.',
  },
  monthLabel: { ko: '조회 월', en: 'Month', vi: 'Thang' },
  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Thang truoc' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Thang sau' },
  factory: { ko: '공장', en: 'Factory', vi: 'Nhà máy' },
  selectFactoryFirst: {
    ko: '공장을 먼저 선택하세요.',
    en: 'Select a factory first.',
    vi: 'Hay chon nha may truoc.',
  },
  importNoWorkers: {
    ko: '작업자 목록이 없어 파일을 등록할 수 없습니다.',
    en: 'No workers found. Cannot import this file.',
    vi: 'Không có cong nhan. Không thể nhap tep.',
  },
  importNoRows: {
    ko: '가져올 수 있는 출퇴근 데이터가 없습니다.',
    en: 'No importable attendance rows found.',
    vi: 'Không có du lieu cham cong de nhap.',
  },
  importConfirm: {
    ko: '파일에서 {eventCount}건 이벤트, {dayCount}일 데이터를 찾았습니다. 등록할까요?',
    en: 'Found {eventCount} events for {dayCount} days. Import now?',
    vi: 'Da tim thay {eventCount} su kien trong {dayCount} ngay. Tiep tuc nhap?',
  },
  importDone: {
    ko: '파일 등록 완료: {dayCount}일분, 등록 {matchedCount}건, 제외 {unmatchedCount}건',
    en: 'Import done: {dayCount} days, {matchedCount} records imported, {unmatchedCount} excluded',
    vi: 'Đã nhập: {dayCount} ngày, {matchedCount} bản ghi, loại trừ {unmatchedCount} bản ghi',
  },
  importFail: {
    ko: '파일 등록에 실패했습니다.',
    en: 'Failed to import file.',
    vi: 'Nhap tep that bai.',
  },
  importReviewTitle: {
    ko: '가져오기 확인',
    en: 'Review import',
    vi: 'Xem lai truoc khi nhap',
  },
  importReviewSummary: {
    ko: '출퇴근 기록 {rawCount}건 중 등록 가능 {matchedCount}건, 제외 {unmatchedCount}건 ({dayCount}일분).',
    en: '{matchedCount} of {rawCount} attendance records can be imported; {unmatchedCount} excluded ({dayCount} days).',
    vi: 'Có thể nhập {matchedCount}/{rawCount} bản ghi chấm công; loại trừ {unmatchedCount} bản ghi ({dayCount} ngày).',
  },
  importReviewUnmatchedHint: {
    ko: '아래 기록은 출퇴근 관리 제외 설정 또는 사번·근로기간 사유로 등록하지 않습니다. 각 기록의 제외 사유를 확인해 주세요.',
    en: 'The records below are excluded by attendance settings or employee code/employment period checks. Review each reason.',
    vi: 'Các bản ghi dưới đây bị loại do cài đặt miễn chấm công hoặc mã nhân viên/thời gian làm việc. Hãy kiểm tra từng lý do.',
  },
  importReviewColumnCode: { ko: '사번(엑셀)', en: 'Code (Excel)', vi: 'Ma (Excel)' },
  importReviewColumnName: { ko: '이름(엑셀)', en: 'Name (Excel)', vi: 'Ten (Excel)' },
  importReviewColumnTime: { ko: '시각', en: 'Time', vi: 'Thoi gian' },
  importReviewColumnReason: { ko: '사유', en: 'Reason', vi: 'Ly do' },
  importReviewReasonMissingCode: { ko: '사번 없음', en: 'No employee code', vi: 'Khong co ma NV' },
  importReviewReasonUnmatched: { ko: '일치하는 직원 없음', en: 'No matching employee', vi: 'Khong khop nhan vien' },
  importReviewCancel: { ko: '취소', en: 'Cancel', vi: 'Huy' },
  importReviewProceed: { ko: '등록 가능한 기록 가져오기', en: 'Import eligible records', vi: 'Nhập bản ghi hợp lệ' },
  importReviewAll: { ko: '전체 등록', en: 'Import all', vi: 'Nhập tất cả' },
  deleteConfirm: {
    en: 'Delete all attendance records for this day?',
    vi: 'Ban co muon xoa toan bo cham cong cua ngay nay khong?',
    ko: '해당 일자의 출퇴근 기록을 모두 삭제하시겠습니까?',
  },
  deleteSuccess: {
    en: 'Attendance records deleted.',
    vi: 'Đã xóa du lieu cham cong.',
    ko: '출퇴근 기록을 삭제했습니다.',
  },
  deleteError: {
    en: 'Failed to delete attendance records.',
    vi: 'Không thể xoa du lieu cham cong.',
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

const resolveImportUnmatchedReasonLabel = (reason, languageCode) => {
  if (reason === 'management_excluded') {
    return resolveText({ ko: '출퇴근 관리 제외 직원', en: 'Attendance-exempt employee', vi: 'Nhân viên miễn chấm công' }, languageCode);
  }
  if (reason === 'outside_employment_period') {
    return resolveText({ ko: '근로기간 밖의 기록', en: 'Outside employment period', vi: 'Ngoài thời gian làm việc' }, languageCode);
  }
  if (reason === 'missing_employee_code') {
    return resolveText(TEXT.importReviewReasonMissingCode, languageCode, 'No employee code');
  }
  return resolveText(TEXT.importReviewReasonUnmatched, languageCode, 'No matching employee');
};

const buildAttendanceCreateTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'New Attendance';
  if (languageCode === 'vi') return 'Cham cong moi';
  return '출퇴근 신규';
};

const buildAttendanceDetailTabLabel = (workDate, languageCode) => {
  const title =
    languageCode === 'vi'
      ? 'Chi tiết cham cong'
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

  const [selectedMonth, setSelectedMonth] = useState('');
  const [availableMonths, setAvailableMonths] = useState([]);
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [importingFile, setImportingFile] = useState(false);
  const [importReview, setImportReview] = useState(null);
  const [importError, setImportError] = useState(null);
  const [deletingWorkDate, setDeletingWorkDate] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.EMPLOYEES],
    isBlocked: importingFile || Boolean(importReview),
    onRefresh: () => setReloadToken((value) => value + 1),
  });
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
      setSelectedMonth('');
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
      setSelectedMonth((previous) =>
        months.includes(previous) ? previous : String([...months].sort().at(-1) || '')
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

    if (!selectedFactoryId || !selectedMonth) {
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
        const employeeQuery = buildQueryString({
          orgId: activeOrgId,
          factoryId: selectedFactoryId,
        });
        const [fetchedRows, fetchedEmployees] = await Promise.all([
          requestJSON('/attendance-entries' + buildQueryString({
            orgId: activeOrgId,
            factoryId: selectedFactoryId,
            month: selectedMonth,
          }), { signal: controller.signal }),
          requestJSON('/employees' + employeeQuery, {
            signal: controller.signal,
          }),
        ]);
        if (cancelled) return;
        setRows(Array.isArray(fetchedRows) ? fetchedRows : []);
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
    reloadToken,
    selectedFactoryId,
    selectedMonth,
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
    const selectedStartDate = dayjs(`${selectedMonth}-01`);
    const selectedEndDate = dayjs(`${selectedMonth}-01`).endOf('month');
    if (!selectedMonth || !selectedStartDate.isValid() || !selectedEndDate.isValid()) return [];
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
  }, [employees, rows, selectedMonth]);

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
    });
    const fetched = await requestJSON('/employees' + query, {
      skipGlobalLoading: true,
    });
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
      setImportError(resolveText(TEXT.selectFactoryFirst, languageCode, 'Select a factory first.'));
      return;
    }
    fileInputRef.current?.click();
  }, [languageCode, selectedFactoryId]);

  const commitImportPlan = useCallback(
    async (importPlan) => {
      let updatedDayCount = 0;
      for (const daily of importPlan.dailyEntries) {
        const readQuery = buildQueryString({
          orgId: activeOrgId,
          factoryId: selectedFactoryId,
          workDate: daily.workDate,
        });
        const existingRows = await requestJSON('/attendance-entries' + readQuery, {
          skipGlobalLoading: true,
        });
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
    },
    [activeOrgId, languageCode, refreshRows, selectedFactoryId, showNotification]
  );

  const handleImportFile = useCallback(
    async (event) => {
      const file = event.target.files?.[0] || null;
      event.target.value = '';
      if (!file) return;

      if (!selectedFactoryId) {
        setImportError(resolveText(TEXT.selectFactoryFirst, languageCode, 'Select a factory first.'));
        return;
      }

      setImportingFile(true);
      try {
        const parsed = await parseAttendanceImportFile(file);
        if (!parsed.events.length) {
          setImportError(resolveText(TEXT.importNoRows, languageCode, 'No importable attendance rows found.'));
          return;
        }

        const workers = await loadWorkersForFactory();
        if (!workers.length) {
          setImportError(resolveText(TEXT.importNoWorkers, languageCode, 'No workers found. Cannot import this file.'));
          return;
        }

        const importPlan = buildAttendanceImportPlan({
          events: parsed.events,
          employees: workers,
          languageCode,
        });
        if (!importPlan.dailyEntries.length && !importPlan.unmatchedDetails.length) {
          setImportError(resolveText(TEXT.importNoRows, languageCode, 'No importable attendance rows found.'));
          return;
        }

        setImportReview({ importPlan });
      } catch (error) {
        setImportError(error?.message ||
            resolveText(TEXT.importFail, languageCode, 'Failed to import file.'));
      } finally {
        setImportingFile(false);
      }
    },
    [languageCode, loadWorkersForFactory, selectedFactoryId]
  );

  const handleCancelImportReview = useCallback(() => {
    setImportReview(null);
  }, []);

  const handleConfirmImportReview = useCallback(async () => {
    const importPlan = importReview?.importPlan;
    setImportReview(null);
    if (!importPlan || !importPlan.dailyEntries.length) return;

    setImportingFile(true);
    try {
      await commitImportPlan(importPlan);
    } catch (error) {
      setImportError(error?.message || resolveText(TEXT.importFail, languageCode, 'Failed to import file.'));
    } finally {
      setImportingFile(false);
    }
  }, [commitImportPlan, importReview, languageCode]);

  return (
    <>
    <AppPageContainer
      title={getUiMessage('menu.attendance', 'Attendance', languageCode)}
      titleActions={(
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<SettingsIcon />} onClick={() => setSettingsOpen(true)} disabled={!activeOrgId || importingFile}>
            {resolveText({ ko: '관리 대상 설정', en: 'Manage Employees', vi: 'Đối tượng quản lý' }, languageCode)}
          </Button>
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
            <MonthSelector
              key="month"
              value={selectedMonth}
              onChange={setSelectedMonth}
              label={resolveText(TEXT.monthLabel, languageCode, 'Month')}
              min={[...availableMonths].sort()[0]}
              max={[...availableMonths].sort().at(-1)}
              disabled={loadingRows || availableMonths.length === 0}
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
    <PayrollSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} orgId={activeOrgId} languageCode={languageCode} showNotification={showNotification} />
    <Dialog open={Boolean(importError)} onClose={() => setImportError(null)} maxWidth="md" fullWidth>
      <DialogTitle>{resolveText(TEXT.importFail, languageCode)}</DialogTitle>
      <DialogContent dividers><Typography sx={{ whiteSpace: 'pre-wrap' }}>{importError}</Typography></DialogContent>
      <DialogActions><Button onClick={() => setImportError(null)}>{resolveText(TEXT.importReviewCancel, languageCode)}</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(importReview)} onClose={handleCancelImportReview} maxWidth="md" fullWidth>
      <DialogTitle>{resolveText(TEXT.importReviewTitle, languageCode, 'Review import')}</DialogTitle>
      <DialogContent dividers>
        {importReview?.importPlan && (
          <Stack spacing={1.5}>
            <Typography variant="body2">
              {formatTemplate(
                resolveText(
                  TEXT.importReviewSummary,
                  languageCode,
                  '{matchedCount} of {rawCount} events matched, {unmatchedCount} unmatched ({dayCount} days).'
                ),
                {
                  rawCount: importReview.importPlan.rawEventCount,
                  matchedCount: importReview.importPlan.matchedEventCount,
                  unmatchedCount: importReview.importPlan.unmatchedEventCount,
                  dayCount: importReview.importPlan.dailyEntries.length,
                }
              )}
            </Typography>
            {importReview.importPlan.unmatchedDetails.length > 0 && <>
            <Typography variant="body2" color="text.secondary">
              {resolveText(
                TEXT.importReviewUnmatchedHint,
                languageCode,
                'The rows below have no code or no matching employee and will be skipped.'
              )}
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>{resolveText(TEXT.importReviewColumnCode, languageCode, 'Code (Excel)')}</TableCell>
                    <TableCell>{resolveText(TEXT.importReviewColumnName, languageCode, 'Name (Excel)')}</TableCell>
                    <TableCell>{resolveText(TEXT.importReviewColumnTime, languageCode, 'Time')}</TableCell>
                    <TableCell>{resolveText(TEXT.importReviewColumnReason, languageCode, 'Reason')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {importReview.importPlan.unmatchedDetails.map((detail, index) => (
                    <TableRow key={`${detail.workerCode}-${index}`}>
                      <TableCell>{detail.workerCode || '-'}</TableCell>
                      <TableCell>{detail.workerName || '-'}</TableCell>
                      <TableCell>
                        {detail.occurredAt ? dayjs(detail.occurredAt).format('YYYY-MM-DD HH:mm') : '-'}
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          color="warning"
                          variant="outlined"
                          label={resolveImportUnmatchedReasonLabel(detail.reason, languageCode)}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            </>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleCancelImportReview}>
          {resolveText(TEXT.importReviewCancel, languageCode, 'Cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirmImportReview}
          disabled={!importReview?.importPlan?.dailyEntries.length}
        >
          {resolveText(importReview?.importPlan?.unmatchedEventCount ? TEXT.importReviewProceed : TEXT.importReviewAll, languageCode)}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default AttendanceList;
