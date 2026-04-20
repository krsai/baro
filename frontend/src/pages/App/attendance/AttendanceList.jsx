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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import UploadFileIcon from '@mui/icons-material/UploadFile';
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
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
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
  enteredWorkers: { ko: '입력 인원', en: 'Entered Workers', vi: 'So nguoi da nhap' },
  workedHoursTotal: { ko: '입력 근무합계', en: 'Total Worked', vi: 'Tong gio da nhap' },
  workedHoursAverage: { ko: '인력 평균 근무시간', en: 'Avg Worked', vi: 'Gio trung binh' },
  noteCount: { ko: '메모 건수', en: 'Notes', vi: 'So ghi chu' },
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
    ko: '?대궇 異쒗눜洹?湲곕줉??紐⑤몢 ??젣?섏떆寃좎뒿?덇퉴?',
  },
  deleteSuccess: {
    en: 'Attendance records deleted.',
    vi: 'Da xoa du lieu cham cong.',
    ko: '異쒗눜洹?湲곕줉????젣?덉뒿?덈떎.',
  },
  deleteError: {
    en: 'Failed to delete attendance records.',
    vi: 'Khong the xoa du lieu cham cong.',
    ko: '異쒗눜洹?湲곕줉 ??젣???ㅽ뙣?덉뒿?덈떎.',
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

const getDatePickerLocaleText = (languageCode) => {
  if (languageCode === 'ko') {
    return datePickerKoKR.components.MuiLocalizationProvider.defaultProps.localeText;
  }
  if (languageCode === 'vi') {
    return datePickerViVN.components.MuiLocalizationProvider.defaultProps.localeText;
  }
  return datePickerEnUS.components.MuiLocalizationProvider.defaultProps.localeText;
};

const toHoursTextFromSeconds = (seconds, languageCode) => {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = safeSeconds / 3600;
  const roundedHours = Number.isFinite(hours) ? hours.toFixed(1) : '0.0';
  if (languageCode === 'en') return `${roundedHours}h`;
  if (languageCode === 'vi') return `${roundedHours} gio`;
  return `${roundedHours}시간`;
};
const toAverageHoursTextFromRow = (row, languageCode) => {
  const workerCount = Number(row?.enteredWorkerCount);
  const avgSeconds = Number(row?.workedSecondsAverage);
  if (!Number.isFinite(workerCount) || workerCount <= 0) return '-';
  if (!Number.isFinite(avgSeconds)) return '-';
  return toHoursTextFromSeconds(avgSeconds, languageCode);
};

const AttendanceList = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId, activeFactoryId } = useAuth();
  const { languageCode } = useLanguage();

  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().startOf('month'));
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [rows, setRows] = useState([]);
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [importingFile, setImportingFile] = useState(false);
  const [deletingWorkDate, setDeletingWorkDate] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const fileInputRef = useRef(null);

  const monthKey = useMemo(() => selectedMonth.format('YYYY-MM'), [selectedMonth]);

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
      setRows([]);
      setLoadingRows(false);
      return () => {
        cancelled = true;
        controller.abort();
      };
    }

    const loadRows = async () => {
      setLoadingRows(true);
      try {
        const query = buildQueryString({
          orgId: activeOrgId,
          factoryId: selectedFactoryId,
          month: monthKey,
        });
        const fetched = await requestJSON('/attendance-entries' + query, {
          signal: controller.signal,
        });
        if (cancelled) return;
        setRows(Array.isArray(fetched) ? fetched : []);
      } catch (_error) {
        if (cancelled || controller.signal.aborted) return;
        setRows([]);
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
    monthKey,
    reloadToken,
    selectedFactoryId,
    showNotification,
  ]);

  const summaryRows = useMemo(() => {
    const groupedByDate = new Map();
    rows.forEach((row) => {
      const workDate = String(row?.workDate || '').trim();
      if (!workDate) return;

      if (!groupedByDate.has(workDate)) {
        groupedByDate.set(workDate, {
          workDate,
          workerIds: new Set(),
          workedSecondsTotal: 0,
          noteCount: 0,
        });
      }

      const bucket = groupedByDate.get(workDate);
      const workerId = String(row?.workerId || '').trim();
      if (workerId) bucket.workerIds.add(workerId);

      const workedSeconds = Number(row?.workedSeconds);
      if (Number.isFinite(workedSeconds) && workedSeconds > 0) {
        bucket.workedSecondsTotal += workedSeconds;
      }

      if (String(row?.note || '').trim()) {
        bucket.noteCount += 1;
      }
    });

    return Array.from(groupedByDate.values())
      .map((item) => ({
        workDate: item.workDate,
        enteredWorkerCount: item.workerIds.size,
        workedSecondsTotal: item.workedSecondsTotal,
        workedSecondsAverage:
          item.workerIds.size > 0 ? item.workedSecondsTotal / item.workerIds.size : null,
        noteCount: item.noteCount,
      }))
      .sort(
        (left, right) =>
          dayjs(right.workDate).valueOf() - dayjs(left.workDate).valueOf()
      );
  }, [rows]);

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
      toolbar={(
        <PageToolbar
          left={(
            <SearchInput
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={resolveText(TEXT.searchPlaceholder, languageCode, 'Search date')}
            />
          )}
          right={[
            <Tooltip key="prev" title={resolveText(TEXT.prevMonth, languageCode, 'Previous month')}>
              <span>
                <IconButton onClick={() => setSelectedMonth((prev) => prev.subtract(1, 'month'))}>
                  <ChevronLeftIcon />
                </IconButton>
              </span>
            </Tooltip>,
            <LocalizationProvider
              key="month-picker"
              dateAdapter={AdapterDayjs}
              adapterLocale={languageCode}
              localeText={getDatePickerLocaleText(languageCode)}
            >
              <DatePicker
                label={resolveText(TEXT.monthLabel, languageCode, 'Month')}
                views={['year', 'month']}
                value={selectedMonth}
                onChange={(value) => setSelectedMonth((value || dayjs()).startOf('month'))}
                format="YYYY-MM"
                slotProps={{
                  textField: {
                    size: 'small',
                    sx: { minWidth: 150 },
                  },
                }}
              />
            </LocalizationProvider>,
            <Tooltip key="next" title={resolveText(TEXT.nextMonth, languageCode, 'Next month')}>
              <span>
                <IconButton onClick={() => setSelectedMonth((prev) => prev.add(1, 'month'))}>
                  <ChevronRightIcon />
                </IconButton>
              </span>
            </Tooltip>,
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
            <Button
              key="import"
              variant="outlined"
              startIcon={importingFile ? <CircularProgress size={16} /> : <UploadFileIcon />}
              onClick={handleClickImport}
              disabled={!selectedFactoryId || importingFile}
              title={resolveText(TEXT.importHint, languageCode, '')}
            >
              {importingFile
                ? resolveText(TEXT.importing, languageCode, 'Importing')
                : resolveText(TEXT.import, languageCode, 'Import File')}
            </Button>,
            <Button
              key="add"
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleAdd}
              disabled={!selectedFactoryId || importingFile}
            >
              {resolveText(TEXT.add, languageCode, 'Add Entry')}
            </Button>,
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
                <TableCell align="right">
                  {resolveText(TEXT.enteredWorkers, languageCode, 'Entered Workers')}
                </TableCell>
                <TableCell align="right">
                  {resolveText(TEXT.workedHoursTotal, languageCode, 'Total Worked')}
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
                filteredRows.map((row) => (
                  <TableRow
                    key={row.workDate}
                    hover
                    onDoubleClick={() => handleOpenDetail(row)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.workDate}</TableCell>
                    <TableCell align="right">
                      {formatNumberWithCommas(row.enteredWorkerCount, {
                        fallback: '0',
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {toHoursTextFromSeconds(row.workedSecondsTotal, languageCode)}
                    </TableCell>
                    <TableCell align="right">
                      {toAverageHoursTextFromRow(row, languageCode)}
                    </TableCell>
                    <TableCell align="right">
                      {formatNumberWithCommas(row.noteCount, {
                        fallback: '0',
                        maximumFractionDigits: 0,
                      })}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={getUiMessage('common.delete', '삭제', languageCode)}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(event) => handleDelete(event, row)}
                            onDoubleClick={(event) => event.stopPropagation()}
                            disabled={deletingWorkDate === String(row.workDate)}
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
    </AppPageContainer>
  );
};

export default AttendanceList;
