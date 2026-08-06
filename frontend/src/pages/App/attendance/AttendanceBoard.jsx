import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  CircularProgress,
  Chip,
  FormControl,
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
  TextField,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import AppPageContainer from '../../../components/AppPageContainer';
import CustomDatePicker from '../../../components/CustomDatePicker';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import {
  buildAttendanceImportPlan,
  mergeImportedAttendanceEntries,
  parseAttendanceImportFile,
} from './attendanceFileImport';

const toDateKey = (value) => dayjs(value).format('YYYY-MM-DD');

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

const parseTimeToMinutes = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{2}:\d{2}$/.test(text)) return null;
  const [hoursText, minutesText] = text.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const ATTENDANCE_DEFAULT_CLOCK_IN = '08:00';
const ATTENDANCE_DEFAULT_CLOCK_OUT = '18:00';

const resolveWorkedMinuteRange = (clockIn, clockOut) => {
  const inMinutes = parseTimeToMinutes(clockIn);
  const outMinutes = parseTimeToMinutes(clockOut);
  if (inMinutes == null && outMinutes == null) return null;
  return {
    inMinutes: inMinutes ?? parseTimeToMinutes(ATTENDANCE_DEFAULT_CLOCK_IN),
    outMinutes: outMinutes ?? parseTimeToMinutes(ATTENDANCE_DEFAULT_CLOCK_OUT),
  };
};

const calcWorkedMinutes = (clockIn, clockOut) => {
  const resolvedRange = resolveWorkedMinuteRange(clockIn, clockOut);
  if (!resolvedRange) return null;
  const { inMinutes, outMinutes } = resolvedRange;
  if (outMinutes >= inMinutes) return outMinutes - inMinutes;
  return 24 * 60 - inMinutes + outMinutes;
};

const formatWorkedHours = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return '-';
  return `${(value / 60).toFixed(1)}h`;
};

const TEXT = {
  workerFallbackName: {
    ko: '작업자 {id}',
    en: 'Worker {id}',
    vi: 'Cong nhan {id}',
  },
  fetchEntriesError: {
    ko: '출퇴근 입력을 불러오지 못했습니다.',
    en: 'Failed to load attendance entries.',
    vi: 'Khong the tai du lieu cham cong.',
  },
  selectFactoryFirst: {
    ko: '공장을 먼저 선택해 주세요.',
    en: 'Select a factory first.',
    vi: 'Hay chon nha may truoc.',
  },
  loadWorkersBeforeImport: {
    ko: '작업자 목록을 불러온 후 업로드해 주세요.',
    en: 'Upload after loading the worker list.',
    vi: 'Hay tai danh sach cong nhan truoc khi nhap tep.',
  },
  noWorkersToMatch: {
    ko: '매칭할 작업자 목록이 없습니다.',
    en: 'No workers available for matching.',
    vi: 'Khong co cong nhan de doi chieu.',
  },
  noImportEvents: {
    ko: '가져올 출퇴근 이벤트가 없습니다.',
    en: 'No attendance events to import.',
    vi: 'Khong co su kien cham cong de nhap.',
  },
  noDataOnSelectedDate: {
    ko: '선택한 근무일({dateKey})에 반영할 데이터가 없습니다.',
    en: 'No data to apply on selected date ({dateKey}).',
    vi: 'Khong co du lieu de ap dung vao ngay da chon ({dateKey}).',
  },
  importApplied: {
    ko: '업로드 반영 완료 ({dateKey}) - 반영 {appliedCount}명, 매칭 {matchedCount}건, 미매칭 {unmatchedCount}건',
    en: 'Import applied ({dateKey}) - applied {appliedCount}, matched {matchedCount}, unmatched {unmatchedCount}',
    vi: 'Da ap dung tep ({dateKey}) - ap dung {appliedCount}, khop {matchedCount}, khong khop {unmatchedCount}',
  },
  importFailed: {
    ko: '파일 업로드에 실패했습니다.',
    en: 'Failed to upload file.',
    vi: 'Tai tep that bai.',
  },
  saveSuccess: {
    ko: '출퇴근 입력을 저장했습니다.',
    en: 'Attendance entries saved.',
    vi: 'Da luu du lieu cham cong.',
  },
  saveFailed: {
    ko: '출퇴근 입력 저장에 실패했습니다.',
    en: 'Failed to save attendance entries.',
    vi: 'Khong the luu du lieu cham cong.',
  },
  title: {
    ko: '출퇴근 상세',
    en: 'Attendance Detail',
    vi: 'Chi tiet cham cong',
  },
  cancel: {
    ko: '취소',
    en: 'Cancel',
    vi: 'Huy',
  },
  list: {
    ko: '목록',
    en: 'List',
    vi: 'Danh sach',
  },
  searchWorker: {
    ko: '작업자 검색',
    en: 'Search worker',
    vi: 'Tim cong nhan',
  },
  workDate: {
    ko: '근무일자',
    en: 'Work date',
    vi: 'Ngay lam viec',
  },
  factory: {
    ko: '공장',
    en: 'Factory',
    vi: 'Nha may',
  },
  factoryFallback: {
    ko: '공장 {id}',
    en: 'Factory {id}',
    vi: 'Nha may {id}',
  },
  importing: {
    ko: '업로드 중...',
    en: 'Uploading...',
    vi: 'Dang tai len...',
  },
  importFile: {
    ko: '파일 업로드',
    en: 'Upload File',
    vi: 'Tai tep len',
  },
  atNotice: {
    ko: 'AT 계산은 스타일 메뉴의 AT 추정 버튼 실행 시 지난달까지의 작업기록과 출퇴근 기록을 기준으로 전체 재계산됩니다.',
    en: 'AT is fully recalculated from work logs and attendance records through the previous month when you run AT Estimate from the Style menu.',
    vi: 'AT se duoc tinh lai toan bo tu work log va cham cong den het thang truoc khi bam nut uoc tinh AT trong menu Style.',
  },
  colWorker: {
    ko: '작업자',
    en: 'Worker',
    vi: 'Cong nhan',
  },
  colClockIn: {
    ko: '출근',
    en: 'Clock In',
    vi: 'Vao ca',
  },
  colClockOut: {
    ko: '퇴근',
    en: 'Clock Out',
    vi: 'Tan ca',
  },
  colWorked: {
    ko: '근무시간',
    en: 'Worked',
    vi: 'Gio lam',
  },
  colNote: {
    ko: '메모',
    en: 'Note',
    vi: 'Ghi chu',
  },
  loadingWorkers: {
    ko: '작업자 목록을 불러오는 중입니다.',
    en: 'Loading workers...',
    vi: 'Dang tai danh sach cong nhan...',
  },
  loadingEntries: {
    ko: '출퇴근 입력을 불러오는 중입니다.',
    en: 'Loading attendance entries...',
    vi: 'Dang tai du lieu cham cong...',
  },
  selectFactoryFirstForTable: {
    ko: '공장을 먼저 선택하세요.',
    en: 'Select a factory first.',
    vi: 'Hay chon nha may truoc.',
  },
  emptySearch: {
    ko: '검색 결과가 없습니다.',
    en: 'No matching workers found.',
    vi: 'Khong co ket qua tim kiem.',
  },
  emptyWorkers: {
    ko: '등록된 작업자가 없습니다.',
    en: 'No workers registered.',
    vi: 'Khong co cong nhan duoc dang ky.',
  },
  notePlaceholder: {
    ko: '특이사항',
    en: 'Note',
    vi: 'Ghi chu',
  },
  summaryWorkerCount: {
    ko: '작업자 {count}명',
    en: 'Workers {count}',
    vi: 'Cong nhan {count}',
  },
  summaryEnteredCount: {
    ko: '입력 완료 {count}명',
    en: 'Entered {count}',
    vi: 'Da nhap {count}',
  },
  summaryWorkedTotal: {
    ko: '입력 근무합계 {hours}',
    en: 'Total worked {hours}',
    vi: 'Tong gio da nhap {hours}',
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;

const formatTemplate = (template, params = {}) =>
  String(template || '').replace(/\{(\w+)\}/g, (_match, token) => {
    if (!Object.prototype.hasOwnProperty.call(params, token)) return '';
    return String(params[token] ?? '');
  });

const resolveInitialDate = (value) => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.startOf('day') : dayjs().startOf('day');
};

const AttendanceBoard = ({
  initialFactoryId = '',
  initialWorkDate = '',
  onClose = null,
  closeOnSave = false,
}) => {
  const { showNotification } = useAppActions();
  const { activeOrgId, activeFactoryId } = useAuth();
  const { languageCode } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(() => resolveInitialDate(initialWorkDate));
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [entriesByWorker, setEntriesByWorker] = useState({});
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [savingEntries, setSavingEntries] = useState(false);
  const [importingFile, setImportingFile] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const fileInputRef = React.useRef(null);

  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const attendanceEmployees = useMemo(
    () => employees.filter((employee) => isAttendanceEmployeeVisibleOnDate(employee, dateKey)),
    [dateKey, employees]
  );
  const filteredEmployees = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    const visibleEmployees = keyword
      ? attendanceEmployees.filter((employee) => {
          const text = [employee?.displayName, employee?.name, employee?.email]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return text.includes(keyword);
        })
      : attendanceEmployees;

    return [...visibleEmployees].sort((left, right) => {
      const leftEntry = entriesByWorker[String(left?.id || '')];
      const rightEntry = entriesByWorker[String(right?.id || '')];
      const leftHasAttendance = Boolean(leftEntry?.clockIn || leftEntry?.clockOut);
      const rightHasAttendance = Boolean(rightEntry?.clockIn || rightEntry?.clockOut);
      if (leftHasAttendance !== rightHasAttendance) return leftHasAttendance ? -1 : 1;
      return String(left?.displayName || left?.name || '').localeCompare(
        String(right?.displayName || right?.name || '')
      );
    });
  }, [attendanceEmployees, entriesByWorker, searchTerm]);

  useEffect(() => {
    setSelectedDate(resolveInitialDate(initialWorkDate));
  }, [initialWorkDate]);

  useEffect(() => {
    let cancelled = false;
    const loadFactories = async () => {
      setLoadingFactories(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const rows = await requestJSON('/factories' + query).catch(() => []);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        setFactories(list);
        if (list.length === 0) {
          setSelectedFactoryId('');
          return;
        }

        const normalizedInitialFactoryId = String(initialFactoryId || '').trim();
        const hasInitialFactory = normalizedInitialFactoryId
          ? list.some((factory) => String(factory?.id) === normalizedInitialFactoryId)
          : false;
        if (hasInitialFactory) {
          setSelectedFactoryId(normalizedInitialFactoryId);
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
  }, [activeFactoryId, activeOrgId, initialFactoryId]);

  useEffect(() => {
    let cancelled = false;
    const loadEmployees = async () => {
      if (!selectedFactoryId) {
        setEmployees([]);
        return;
      }
      setLoadingEmployees(true);
      try {
        const query = buildQueryString({
          orgId: activeOrgId,
          factoryId: selectedFactoryId,
          membershipRole: 'WORKER',
        });
        const rows = await requestJSON('/employees' + query).catch(() => []);
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        const workerNameTemplate = resolveText(
          TEXT.workerFallbackName,
          languageCode,
          'Worker {id}'
        );
        setEmployees(
          list
            .map((employee) => ({
              ...employee,
              displayName:
                employee?.name ||
                formatTemplate(workerNameTemplate, { id: employee?.id || '' }),
            }))
            .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName)))
        );
      } finally {
        if (!cancelled) setLoadingEmployees(false);
      }
    };
    loadEmployees();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, languageCode, selectedFactoryId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!selectedFactoryId) {
      setEntriesByWorker({});
      setLoadingEntries(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }
    const loadEntries = async () => {
      setLoadingEntries(true);
      try {
        const query = buildQueryString({
          orgId: activeOrgId,
          factoryId: selectedFactoryId,
          workDate: dateKey,
        });
        const rows = await requestJSON('/attendance-entries' + query, {
          signal: controller.signal,
        });
        if (cancelled) return;
        const nextEntriesByWorker = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
          const workerId = String(row?.workerId || '').trim();
          if (!workerId) return acc;
          acc[workerId] = {
            clockIn: String(row?.clockIn || ''),
            clockOut: String(row?.clockOut || ''),
            note: String(row?.note || ''),
          };
          return acc;
        }, {});
        setEntriesByWorker(nextEntriesByWorker);
      } catch (_error) {
        if (cancelled || controller.signal.aborted) return;
        setEntriesByWorker({});
        showNotification(
          resolveText(TEXT.fetchEntriesError, languageCode, 'Failed to load attendance entries.'),
          'error'
        );
      } finally {
        if (!cancelled) setLoadingEntries(false);
      }
    };
    loadEntries();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeOrgId, dateKey, languageCode, selectedFactoryId, showNotification]);

  const handleEntryChange = (workerId, field, value) => {
    const key = String(workerId || '');
    if (!key) return;
    const nextValue = String(value || '');
    setEntriesByWorker((prev) => {
      const current = prev[key] || { clockIn: '', clockOut: '', note: '' };
      const next = { ...current, [field]: nextValue };
      return {
        ...prev,
        [key]: next,
      };
    });
  };

  const handleClickImport = () => {
    if (!selectedFactoryId) {
      showNotification(resolveText(TEXT.selectFactoryFirst, languageCode, 'Select a factory first.'), 'warning');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const file = event?.target?.files?.[0] || null;
    if (event?.target) event.target.value = '';
    if (!file) return;

    if (!selectedFactoryId) {
      showNotification(resolveText(TEXT.selectFactoryFirst, languageCode, 'Select a factory first.'), 'warning');
      return;
    }
    if (loadingEmployees) {
      showNotification(
        resolveText(
          TEXT.loadWorkersBeforeImport,
          languageCode,
          'Upload after loading the worker list.'
        ),
        'warning'
      );
      return;
    }
    if (!attendanceEmployees.length) {
      showNotification(
        resolveText(TEXT.noWorkersToMatch, languageCode, 'No workers available for matching.'),
        'warning'
      );
      return;
    }

    setImportingFile(true);
    try {
      const parsed = await parseAttendanceImportFile(file);
      if (!parsed.events.length) {
        showNotification(
          resolveText(TEXT.noImportEvents, languageCode, 'No attendance events to import.'),
          'warning'
        );
        return;
      }

      const plan = buildAttendanceImportPlan({
        events: parsed.events,
        employees: attendanceEmployees,
      });
      const selectedDay = plan.dailyEntries.find((item) => item.workDate === dateKey);
      if (!selectedDay || selectedDay.entries.length === 0) {
        showNotification(
          formatTemplate(
            resolveText(
              TEXT.noDataOnSelectedDate,
              languageCode,
              'No data to apply on selected date ({dateKey}).'
            ),
            { dateKey }
          ),
          'warning'
        );
        return;
      }

      setEntriesByWorker((prev) => {
        const existingRows = Object.entries(prev).reduce((acc, [workerId, value]) => {
          const parsedWorkerId = Number(workerId);
          if (!Number.isFinite(parsedWorkerId) || parsedWorkerId <= 0) return acc;
          acc.push({
            workerId: Math.trunc(parsedWorkerId),
            clockIn: String(value?.clockIn || '').trim() || null,
            clockOut: String(value?.clockOut || '').trim() || null,
            note: String(value?.note || '').trim() || null,
          });
          return acc;
        }, []);

        const mergedRows = mergeImportedAttendanceEntries(existingRows, selectedDay.entries);
        return mergedRows.reduce((acc, row) => {
          const key = String(row?.workerId || '');
          if (!key) return acc;
          acc[key] = {
            clockIn: String(row?.clockIn || ''),
            clockOut: String(row?.clockOut || ''),
            note: String(row?.note || ''),
          };
          return acc;
        }, {});
      });

      showNotification(
        formatTemplate(
          resolveText(
            TEXT.importApplied,
            languageCode,
            'Import applied ({dateKey}) - applied {appliedCount}, matched {matchedCount}, unmatched {unmatchedCount}'
          ),
          {
            dateKey,
            appliedCount: selectedDay.entries.length,
            matchedCount: plan.matchedEventCount,
            unmatchedCount: plan.unmatchedEventCount,
          }
        ),
        'success'
      );
    } catch (error) {
      showNotification(
        error?.message || resolveText(TEXT.importFailed, languageCode, 'Failed to upload file.'),
        'error'
      );
    } finally {
      setImportingFile(false);
    }
  };

  const handleSaveEntries = async () => {
    if (!selectedFactoryId) return;
    setSavingEntries(true);
    try {
      const entries = Object.entries(entriesByWorker).reduce((acc, [workerId, value]) => {
        const parsedWorkerId = Number(workerId);
        if (!Number.isFinite(parsedWorkerId) || parsedWorkerId <= 0) return acc;
        const clockIn = String(value?.clockIn || '').trim();
        const clockOut = String(value?.clockOut || '').trim();
        const note = String(value?.note || '').trim();
        if (!clockIn && !clockOut && !note) return acc;
        acc.push({
          workerId: Math.round(parsedWorkerId),
          clockIn: clockIn || null,
          clockOut: clockOut || null,
          note: note || null,
        });
        return acc;
      }, []);
      const query = buildQueryString({ orgId: activeOrgId });
      const rows = await requestJSON('/attendance-entries' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factoryId: Number(selectedFactoryId),
          workDate: dateKey,
          entries,
        }),
      });
      const nextEntriesByWorker = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        const workerId = String(row?.workerId || '').trim();
        if (!workerId) return acc;
        acc[workerId] = {
          clockIn: String(row?.clockIn || ''),
          clockOut: String(row?.clockOut || ''),
          note: String(row?.note || ''),
        };
        return acc;
      }, {});
      setEntriesByWorker(nextEntriesByWorker);
      showNotification(resolveText(TEXT.saveSuccess, languageCode, 'Attendance entries saved.'), 'success');
      if (closeOnSave && typeof onClose === 'function') {
        onClose();
      }
    } catch (error) {
      showNotification(
        error?.message || resolveText(TEXT.saveFailed, languageCode, 'Failed to save attendance entries.'),
        'error'
      );
    } finally {
      setSavingEntries(false);
    }
  };

  const summary = useMemo(() => {
    const workerCount = attendanceEmployees.length;
    let enteredCount = 0;
    let workedMinutesTotal = 0;
    attendanceEmployees.forEach((employee) => {
      const key = String(employee?.id || '');
      const entry = entriesByWorker[key];
      if (!entry) return;
      const hasAnyInput =
        String(entry.clockIn || '').trim() ||
        String(entry.clockOut || '').trim() ||
        String(entry.note || '').trim();
      if (!hasAnyInput) return;
      enteredCount += 1;
      const worked = calcWorkedMinutes(entry.clockIn, entry.clockOut);
      if (worked != null) workedMinutesTotal += worked;
    });
    return {
      workerCount,
      enteredCount,
      workedMinutesTotal,
    };
  }, [attendanceEmployees, entriesByWorker]);

  return (
    <AppPageContainer
      title={resolveText(TEXT.title, languageCode, 'Attendance Detail')}
      titleActions={(
        <Stack direction="row" spacing={1}>
          {typeof onClose === 'function' ? (
            <Button
              variant="outlined"
              onClick={onClose}
              disabled={savingEntries}
            >
              {closeOnSave
                ? resolveText(TEXT.cancel, languageCode, 'Cancel')
                : resolveText(TEXT.list, languageCode, 'List')}
            </Button>
          ) : null}
          <Button
            variant="outlined"
            startIcon={importingFile ? <CircularProgress size={16} /> : <UploadFileIcon />}
            onClick={handleClickImport}
            disabled={!selectedFactoryId || importingFile || loadingEmployees}
          >
            {importingFile
              ? resolveText(TEXT.importing, languageCode, 'Uploading...')
              : resolveText(TEXT.importFile, languageCode, 'Upload File')}
          </Button>
          <SaveButton
            onClick={handleSaveEntries}
            disabled={!selectedFactoryId || savingEntries}
            loading={savingEntries}
          />
        </Stack>
      )}
      toolbar={(
        <PageToolbar
          left={(
            <SearchInput
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={resolveText(TEXT.searchWorker, languageCode, 'Search worker')}
            />
          )}
          right={(
            <>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="attendance-factory-select-label">
                  {resolveText(TEXT.factory, languageCode, 'Factory')}
                </InputLabel>
                <Select
                  labelId="attendance-factory-select-label"
                  value={selectedFactoryId}
                  label={resolveText(TEXT.factory, languageCode, 'Factory')}
                  onChange={(event) => setSelectedFactoryId(String(event.target.value || ''))}
                  disabled={loadingFactories || factories.length === 0}
                >
                  {factories.map((factory) => (
                    <MenuItem key={factory.id} value={String(factory.id)}>
                      {factory.name ||
                        formatTemplate(resolveText(TEXT.factoryFallback, languageCode, 'Factory {id}'), {
                          id: factory.id,
                        })}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <CustomDatePicker
                label={resolveText(TEXT.workDate, languageCode, 'Work date')}
                value={selectedDate}
                onChange={(value) => {
                  if (!value || !value.isValid?.()) return;
                  setSelectedDate(value.startOf('day'));
                }}
                slotProps={{ textField: { sx: { minWidth: 160 } } }}
              />
            </>
          )}
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

      <Alert severity="warning" sx={{ mb: 2 }}>
        {resolveText(
          TEXT.atNotice,
          languageCode,
          'AT uses previous month data as of the 5th each month; workers without attendance input are auto-calculated as 8 hours.'
        )}
      </Alert>

      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{resolveText(TEXT.colWorker, languageCode, 'Worker')}</TableCell>
                <TableCell align="center">{resolveText(TEXT.colClockIn, languageCode, 'Clock In')}</TableCell>
                <TableCell align="center">{resolveText(TEXT.colClockOut, languageCode, 'Clock Out')}</TableCell>
                <TableCell align="center">{resolveText(TEXT.colWorked, languageCode, 'Worked')}</TableCell>
                <TableCell>{resolveText(TEXT.colNote, languageCode, 'Note')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableStatusRow
                colSpan={5}
                message={
                  loadingEmployees
                    ? resolveText(TEXT.loadingWorkers, languageCode, 'Loading workers...')
                    : loadingEntries
                      ? resolveText(TEXT.loadingEntries, languageCode, 'Loading attendance entries...')
                    : !selectedFactoryId
                      ? resolveText(TEXT.selectFactoryFirstForTable, languageCode, 'Select a factory first.')
                      : filteredEmployees.length === 0
                        ? searchTerm
                          ? resolveText(TEXT.emptySearch, languageCode, 'No matching workers found.')
                          : resolveText(TEXT.emptyWorkers, languageCode, 'No workers registered.')
                        : ''
                }
                sx={{
                  py:
                    loadingEmployees || loadingEntries || !selectedFactoryId || filteredEmployees.length === 0
                      ? 3
                      : 0,
                  display:
                    loadingEmployees || loadingEntries || !selectedFactoryId || filteredEmployees.length === 0
                      ? 'table-cell'
                      : 'none',
                }}
              />
              {!loadingEmployees &&
                !loadingEntries &&
                selectedFactoryId &&
                filteredEmployees.map((employee) => {
                  const workerId = String(employee?.id || '');
                  const entry = entriesByWorker[workerId] || { clockIn: '', clockOut: '', note: '' };
                  const workedMinutes = calcWorkedMinutes(entry.clockIn, entry.clockOut);

                  return (
                    <TableRow key={workerId} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{employee.displayName}</TableCell>
                      <TableCell align="center" sx={{ width: 140 }}>
                        <TextField
                          size="small"
                          type="time"
                          value={entry.clockIn}
                          onChange={(event) =>
                            handleEntryChange(workerId, 'clockIn', event.target.value)
                          }
                          InputProps={{ startAdornment: <LoginIcon fontSize="small" sx={{ mr: 0.5 }} /> }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ width: 140 }}>
                        <TextField
                          size="small"
                          type="time"
                          value={entry.clockOut}
                          onChange={(event) =>
                            handleEntryChange(workerId, 'clockOut', event.target.value)
                          }
                          InputProps={{ startAdornment: <LogoutIcon fontSize="small" sx={{ mr: 0.5 }} /> }}
                        />
                      </TableCell>
                      <TableCell align="center" sx={{ width: 110 }}>
                        {formatWorkedHours(workedMinutes)}
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          fullWidth
                          placeholder={resolveText(TEXT.notePlaceholder, languageCode, 'Note')}
                          value={entry.note}
                          onChange={(event) =>
                            handleEntryChange(workerId, 'note', event.target.value)
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mt: 1.5 }}>
        <Chip
          variant="outlined"
          label={formatTemplate(
            resolveText(TEXT.summaryWorkerCount, languageCode, 'Workers {count}'),
            {
              count: formatNumberWithCommas(summary.workerCount, {
                fallback: '0',
                maximumFractionDigits: 0,
              }),
            }
          )}
        />
        <Chip
          variant="outlined"
          label={formatTemplate(
            resolveText(TEXT.summaryEnteredCount, languageCode, 'Entered {count}'),
            {
              count: formatNumberWithCommas(summary.enteredCount, {
                fallback: '0',
                maximumFractionDigits: 0,
              }),
            }
          )}
        />
        <Chip
          color="primary"
          variant="outlined"
          label={formatTemplate(
            resolveText(TEXT.summaryWorkedTotal, languageCode, 'Total worked {hours}'),
            { hours: formatWorkedHours(summary.workedMinutesTotal) }
          )}
        />
      </Stack>
    </AppPageContainer>
  );
};

export default AttendanceBoard;
