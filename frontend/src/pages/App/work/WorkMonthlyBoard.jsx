import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
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
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
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
import useHolidayCalendar from '../../../hooks/useHolidayCalendar';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { loadWorkLogs } from './workLogStorage';
import {
  aggregateMonthlyWorkerRows,
  buildMonthRange,
  normalizePositiveId,
} from './workMonthlyUtils';

const TEXT = {
  add: { ko: '\uAE30\uB85D \uCD94\uAC00', en: 'Add Log', vi: 'Them ghi chep' },
  title: { ko: '생산 분석', en: 'Production Analysis', vi: 'Phan tich san xuat' },
  searchPlaceholder: {
    ko: '작업자, 라인 검색',
    en: 'Search worker, line',
    vi: 'Tim cong nhan, chuyen',
  },
  factory: { ko: '공장', en: 'Factory', vi: 'Nha may' },
  worker: { ko: '작업자', en: 'Worker', vi: 'Cong nhan' },
  workMonth: { ko: '작업월', en: 'Month', vi: 'Thang lam viec' },
  line: { ko: '라인', en: 'Line', vi: 'Chuyen' },
  attendance: { ko: '근태', en: 'Attendance', vi: 'Cham cong' },
  items: { ko: '기록건수', en: 'Entries', vi: 'So dong' },
  averageCt: { ko: '평균 CT', en: 'Avg CT', vi: 'CT trung binh' },
  totalCt: { ko: '총 CT', en: 'Total CT', vi: 'Tong CT' },
  loading: {
    ko: '월간 기록을 불러오는 중입니다.',
    en: 'Loading monthly records...',
    vi: 'Dang tai ghi chep thang...',
  },
  empty: {
    ko: '해당 월에 표시할 기록이 없습니다.',
    en: 'No monthly records found.',
    vi: 'Khong co ghi chep thang.',
  },
  fetchError: {
    ko: '월간 기록을 불러오지 못했습니다.',
    en: 'Failed to load monthly records.',
    vi: 'Khong the tai ghi chep thang.',
  },
  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Thang truoc' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Thang sau' },
  selectFactory: { ko: '공장 선택', en: 'Select factory', vi: 'Chon nha may' },
};

const MONTH_PICKER_SLOT_PROPS = {
  textField: {
    size: 'small',
    sx: { minWidth: 150 },
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;

const getDatePickerLocaleText = (languageCode) => {
  if (languageCode === 'ko') {
    return datePickerKoKR.components.MuiLocalizationProvider.defaultProps.localeText;
  }
  if (languageCode === 'vi') {
    return datePickerViVN.components.MuiLocalizationProvider.defaultProps.localeText;
  }
  return datePickerEnUS.components.MuiLocalizationProvider.defaultProps.localeText;
};

const formatAverageCtHours = (seconds, languageCode) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.round(totalSeconds / 3600);
  if (languageCode === 'en') return `${hours}h`;
  if (languageCode === 'vi') return `${hours} gio`;
  return `${hours}시간`;
};

const formatDayNumber = (value) => {
  if (value === null || value === undefined || value === '') return '-';
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const rounded = Math.round(number * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

const formatDayRatio = (leftValue, rightValue, languageCode) => {
  const left = formatDayNumber(leftValue);
  if (left === '-') return '-';
  const right = formatDayNumber(rightValue);
  const suffix = languageCode === 'en' ? 'd' : languageCode === 'vi' ? ' ngay' : '일';
  return `${left}/${right}${suffix}`;
};

const formatAttendanceDays = (row, languageCode) => {
  const workedDays =
    row?.attendanceWorkedDays === null || row?.attendanceWorkedDays === undefined
      ? '-'
      : row.attendanceWorkedDays;
  return formatDayRatio(workedDays, row?.attendanceTargetDays, languageCode);
};

const buildMonthlyDetailTabLabel = (workerName, monthKey, languageCode) => {
  const title =
    languageCode === 'en'
      ? 'Production Analysis Detail'
      : languageCode === 'vi'
        ? 'Chi tiet phan tich san xuat'
        : '생산 분석 상세';
  const parts = [title, workerName, monthKey].filter(Boolean);
  return parts.join(': ');
};

const buildWorkCreateTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'New Daily Record';
  if (languageCode === 'vi') return 'Tao ghi chep ngay';
  return '\uC77C\uAC04 \uAE30\uB85D \uC2E0\uADDC';
};

const WorkMonthlyBoard = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId, activeFactoryId } = useAuth();
  const { languageCode } = useLanguage();

  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().startOf('month'));
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [rows, setRows] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingRows, setLoadingRows] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const { holidayKeys } = useHolidayCalendar(activeOrgId);

  const monthRange = useMemo(() => buildMonthRange(selectedMonth), [selectedMonth]);
  const selectedFactoryIdNumber = useMemo(
    () => normalizePositiveId(selectedFactoryId),
    [selectedFactoryId]
  );
  const selectedFactory = useMemo(
    () => factories.find((factory) => String(factory?.id) === String(selectedFactoryId)) || null,
    [factories, selectedFactoryId]
  );

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
        if (!cancelled) {
          setLoadingFactories(false);
        }
      }
    };

    loadFactories();
    return () => {
      cancelled = true;
    };
  }, [activeFactoryId, activeOrgId]);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    if (!selectedFactoryIdNumber) {
      setRows([]);
      setLoadError('');
      setLoadingRows(false);
      return () => {
        cancelled = true;
        abortController.abort();
      };
    }

    const loadRows = async () => {
      setLoadingRows(true);
      setLoadError('');
      try {
        const [employees, logs, attendanceRows] = await Promise.all([
          requestJSON(
            `/employees${buildQueryString({
              orgId: activeOrgId,
              factoryId: selectedFactoryIdNumber,
              membershipRole: 'WORKER',
            })}`,
            {
              skipGlobalLoading: true,
              signal: abortController.signal,
            }
          ).catch(() => []),
          loadWorkLogs({
            orgId: activeOrgId,
            factoryId: selectedFactoryIdNumber,
            dateFrom: monthRange.dateFrom,
            dateTo: monthRange.dateTo,
            includeRecords: true,
            skipGlobalLoading: true,
            signal: abortController.signal,
          }),
          requestJSON(
            `/attendance-entries${buildQueryString({
              orgId: activeOrgId,
              factoryId: selectedFactoryIdNumber,
              month: monthRange.monthKey,
            })}`,
            {
              skipGlobalLoading: true,
              signal: abortController.signal,
            }
          ).catch(() => []),
        ]);

        if (cancelled) return;

        const nextRows = aggregateMonthlyWorkerRows({
          employees: Array.isArray(employees) ? employees : [],
          logs: Array.isArray(logs) ? logs : [],
          attendanceRows: Array.isArray(attendanceRows) ? attendanceRows : [],
          holidayKeys,
          monthKey: monthRange.monthKey,
          factoryName: selectedFactory?.name || '',
        });
        setRows(nextRows);
      } catch (_error) {
        if (cancelled || abortController.signal.aborted) return;
        const message = resolveText(
          TEXT.fetchError,
          languageCode,
          '월간 기록을 불러오지 못했습니다.'
        );
        setRows([]);
        setLoadError(message);
        showNotification(message, 'error');
      } finally {
        if (!cancelled) {
          setLoadingRows(false);
        }
      }
    };

    loadRows();
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    activeOrgId,
    holidayKeys,
    languageCode,
    monthRange.dateFrom,
    monthRange.dateTo,
    monthRange.monthKey,
    selectedFactory?.name,
    selectedFactoryIdNumber,
    showNotification,
  ]);

  const emptyStateMessage =
    loadError || resolveText(TEXT.empty, languageCode, '해당 월에 표시할 기록이 없습니다.');
  const emptyStateSx = loadError ? { color: 'error.main' } : undefined;

  const filteredRows = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    const sorted = [...rows].sort((left, right) => {
      const lineCompare = String(left?.lineName || '').localeCompare(String(right?.lineName || ''), 'ko');
      if (lineCompare !== 0) return lineCompare;
      return String(left?.workerName || '').localeCompare(String(right?.workerName || ''), 'ko');
    });

    if (!keyword) return sorted;

    return sorted.filter((row) => {
      const searchText = [
        row?.workerName,
        row?.lineName,
        row?.factoryName,
        row?.workMonth,
        row?.attendanceDisplay,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchText.includes(keyword);
    });
  }, [rows, searchTerm]);

  const handleOpenDetail = useCallback(
    (row) => {
      if (!row?.workerId || !selectedFactoryIdNumber) return;
      const targetPath = `/production-analysis/${monthRange.monthKey}/${selectedFactoryIdNumber}/${row.workerId}`;
      navigateToPath(targetPath, {
        label: buildMonthlyDetailTabLabel(row.workerName, monthRange.monthKey, languageCode),
      });
    },
    [languageCode, monthRange.monthKey, navigateToPath, selectedFactoryIdNumber]
  );

  const handleAdd = useCallback(() => {
    navigateToPath('/work-history/new', {
      label: buildWorkCreateTabLabel(languageCode),
    });
  }, [languageCode, navigateToPath]);

  return (
    <AppPageContainer
      title={getUiMessage(
        'menu.productionAnalysis',
        resolveText(TEXT.title, languageCode, '생산 분석'),
        languageCode
      )}
      titleActions={(
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          {resolveText(TEXT.add, languageCode, '\uAE30\uB85D \uCD94\uAC00')}
        </Button>
      )}
      toolbar={(
        <PageToolbar
          showLastUpdater={false}
          left={(
            <SearchInput
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={resolveText(TEXT.searchPlaceholder, languageCode, '작업자, 라인 검색')}
            />
          )}
          right={[
            <FormControl key="factory" size="small" sx={{ minWidth: 180 }}>
              <InputLabel id="work-monthly-factory-label">
                {resolveText(TEXT.factory, languageCode, '공장')}
              </InputLabel>
              <Select
                labelId="work-monthly-factory-label"
                value={selectedFactoryId}
                label={resolveText(TEXT.factory, languageCode, '공장')}
                onChange={(event) => setSelectedFactoryId(String(event.target.value || ''))}
                disabled={loadingFactories || factories.length === 0}
              >
                {factories.map((factory) => (
                  <MenuItem key={factory.id} value={String(factory.id)}>
                    {factory.name ||
                      `${resolveText(TEXT.selectFactory, languageCode, '공장 선택')} ${factory.id}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>,
            <LocalizationProvider
              key="month-picker"
              dateAdapter={AdapterDayjs}
              adapterLocale={languageCode}
              localeText={getDatePickerLocaleText(languageCode)}
            >
              <DatePicker
                views={['year', 'month']}
                value={selectedMonth}
                onChange={(value) => setSelectedMonth((value || dayjs()).startOf('month'))}
                format="YYYY-MM"
                slotProps={MONTH_PICKER_SLOT_PROPS}
              />
            </LocalizationProvider>,
            <Stack key="month-shift" sx={{ gap: '2px' }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setSelectedMonth((prev) => prev.add(1, 'month'))}
                sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
              >
                M+
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => setSelectedMonth((prev) => prev.subtract(1, 'month'))}
                sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
              >
                M-
              </Button>
            </Stack>
          ]}
        />
      )}
    >
      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
        <Box sx={{ display: { xs: 'block', sm: 'none' }, p: 1.25 }}>
          {loadingRows || loadingFactories ? (
            <Typography variant="body2" color="text.secondary" sx={emptyStateSx}>
              {resolveText(TEXT.loading, languageCode, '월간 기록을 불러오는 중입니다.')}
            </Typography>
          ) : filteredRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={emptyStateSx}>
              {emptyStateMessage}
            </Typography>
          ) : (
            <Stack spacing={1}>
              {filteredRows.map((row) => (
                <Paper
                  key={row.key}
                  variant="outlined"
                  onDoubleClick={() => handleOpenDetail(row)}
                  sx={{
                    p: 1.25,
                    borderRadius: 1.5,
                    cursor: row.workerId ? 'pointer' : 'default',
                  }}
                >
                  <Stack spacing={0.75}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                        {row.workerName || '-'}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.workMonth}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                      {[row.factoryName, row.lineName].filter(Boolean).join(' / ') || '-'}
                    </Typography>
                    <Box
                      sx={{
                        display: 'grid',
                        gap: 0.75,
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        {`${resolveText(TEXT.items, languageCode, '기록건수')} ${row.recordCount || 0}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${resolveText(TEXT.averageCt, languageCode, '평균 CT')} ${
                          row.averageCtPerDaySeconds == null
                            ? '-'
                            : formatAverageCtHours(row.averageCtPerDaySeconds, languageCode)
                        }`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${resolveText(TEXT.attendance, languageCode, '근태')} ${formatAttendanceDays(
                          row,
                          languageCode
                        )}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {`${resolveText(TEXT.totalCt, languageCode, '총 CT')} ${formatDayRatio(
                          row.workCtDayCount,
                          row.expectedCtDayCount,
                          languageCode
                        )}`}
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
                <TableCell>{resolveText(TEXT.workMonth, languageCode, '작업월')}</TableCell>
                <TableCell>{resolveText(TEXT.worker, languageCode, '작업자')}</TableCell>
                <TableCell>{resolveText(TEXT.factory, languageCode, '공장')}</TableCell>
                <TableCell>{resolveText(TEXT.line, languageCode, '라인')}</TableCell>
                <TableCell align="right">
                  {resolveText(TEXT.items, languageCode, '기록건수')}
                </TableCell>
                <TableCell>{resolveText(TEXT.averageCt, languageCode, '평균 CT')}</TableCell>
                <TableCell>{resolveText(TEXT.attendance, languageCode, '근태')}</TableCell>
                <TableCell>{resolveText(TEXT.totalCt, languageCode, '총 CT')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingRows || loadingFactories ? (
                <TableStatusRow
                  colSpan={8}
                  message={resolveText(TEXT.loading, languageCode, '월간 기록을 불러오는 중입니다.')}
                />
              ) : filteredRows.length === 0 ? (
                <TableStatusRow colSpan={8} message={emptyStateMessage} sx={emptyStateSx} />
              ) : (
                filteredRows.map((row) => (
                  <TableRow
                    key={row.key}
                    hover={Boolean(row.workerId)}
                    onDoubleClick={() => handleOpenDetail(row)}
                    sx={{
                      cursor: row.workerId ? 'pointer' : 'default',
                      '& td': { verticalAlign: 'middle' },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.workMonth || '-'}</TableCell>
                    <TableCell>{row.workerName || '-'}</TableCell>
                    <TableCell>{row.factoryName || '-'}</TableCell>
                    <TableCell>{row.lineName || '-'}</TableCell>
                    <TableCell align="right">{row.recordCount || 0}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {row.averageCtPerDaySeconds == null
                        ? '-'
                        : formatAverageCtHours(row.averageCtPerDaySeconds, languageCode)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatAttendanceDays(row, languageCode)}
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDayRatio(
                        row.workCtDayCount,
                        row.expectedCtDayCount,
                        languageCode
                      )}
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

export default WorkMonthlyBoard;
