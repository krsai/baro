import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import useHolidayCalendar from '../../../hooks/useHolidayCalendar';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { loadWorkLogs } from './workLogStorage';
import {
  buildMonthlyWorkerDetail,
  buildMonthRange,
  normalizeMonthKey,
  normalizePositiveId,
} from './workMonthlyUtils';

const TEXT = {
  title: { ko: '월간 기록 상세', en: 'Monthly Detail', vi: 'Chi tiet thang' },
  backToList: { ko: '작업 기록 목록', en: 'Work Logs', vi: 'Nhat ky cong viec' },
  searchPlaceholder: {
    ko: '작업일, 라인 검색',
    en: 'Search date, line',
    vi: 'Tim ngay, chuyen',
  },
  workDate: { ko: '작업일', en: 'Work Date', vi: 'Ngay lam viec' },
  line: { ko: '라인', en: 'Line', vi: 'Chuyen' },
  attendance: { ko: '근태', en: 'Attendance', vi: 'Cham cong' },
  items: { ko: '기록건수', en: 'Entries', vi: 'So dong' },
  averageCt: { ko: '1일 평균 CT', en: 'Avg CT / Day', vi: 'CT trung binh / ngay' },
  attendanceWorked: { ko: '근무', en: 'Worked', vi: 'Di lam' },
  attendanceMissing: { ko: '미입력', en: 'Missing', vi: 'Chua nhap' },
  worker: { ko: '작업자', en: 'Worker', vi: 'Cong nhan' },
  month: { ko: '작업월', en: 'Month', vi: 'Thang lam viec' },
  factory: { ko: '공장', en: 'Factory', vi: 'Nha may' },
  loading: {
    ko: '월간 기록 상세를 불러오는 중입니다.',
    en: 'Loading monthly detail...',
    vi: 'Dang tai chi tiet thang...',
  },
  empty: {
    ko: '표시할 월간 상세 내역이 없습니다.',
    en: 'No monthly detail found.',
    vi: 'Khong co chi tiet thang.',
  },
  fetchError: {
    ko: '월간 기록 상세를 불러오지 못했습니다.',
    en: 'Failed to load monthly detail.',
    vi: 'Khong the tai chi tiet thang.',
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;

const formatDuration = (seconds, languageCode) => {
  const totalSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (languageCode === 'en') return `${hours}h ${minutes}m`;
  if (languageCode === 'vi') return `${hours} gio ${minutes} phut`;
  return `${hours}시간 ${minutes}분`;
};

const buildMonthlyListTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'Work Logs';
  if (languageCode === 'vi') return 'Nhat ky cong viec';
  return '작업 기록';
};

const WorkMonthlyDetail = () => {
  const { monthKey, factoryId, workerId } = useParams();
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();

  const normalizedMonthKey = normalizeMonthKey(monthKey);
  const normalizedFactoryId = normalizePositiveId(factoryId);
  const normalizedWorkerId = normalizePositiveId(workerId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [summary, setSummary] = useState(null);
  const [rows, setRows] = useState([]);
  const { holidayKeys } = useHolidayCalendar(activeOrgId);

  const monthRange = useMemo(
    () => buildMonthRange(normalizedMonthKey || undefined),
    [normalizedMonthKey]
  );

  const closeDetail = useCallback(() => {
    const closeTabId =
      normalizedMonthKey && normalizedFactoryId && normalizedWorkerId
        ? `/work-history-monthly/${normalizedMonthKey}/${normalizedFactoryId}/${normalizedWorkerId}`
        : null;
    navigateToPath('/work-history?view=monthly', {
      label: buildMonthlyListTabLabel(languageCode),
      ...(closeTabId ? { closeTabId } : {}),
    });
  }, [languageCode, navigateToPath, normalizedFactoryId, normalizedMonthKey, normalizedWorkerId]);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    if (!normalizedMonthKey || !normalizedFactoryId || !normalizedWorkerId) {
      setLoading(false);
      setLoadError('');
      setSummary(null);
      setRows([]);
      return () => {
        cancelled = true;
        abortController.abort();
      };
    }

    const load = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const [factories, employees, logs, attendanceRows] = await Promise.all([
          requestJSON(`/factories${buildQueryString({ orgId: activeOrgId })}`, {
            skipGlobalLoading: true,
            signal: abortController.signal,
          }).catch(() => []),
          requestJSON(
            `/employees${buildQueryString({
              orgId: activeOrgId,
              factoryId: normalizedFactoryId,
              excludeMembershipRole: 'ADMIN',
            })}`,
            {
              skipGlobalLoading: true,
              signal: abortController.signal,
            }
          ).catch(() => []),
          loadWorkLogs({
            orgId: activeOrgId,
            factoryId: normalizedFactoryId,
            dateFrom: monthRange.dateFrom,
            dateTo: monthRange.dateTo,
            includeRecords: true,
            skipGlobalLoading: true,
            signal: abortController.signal,
          }),
          requestJSON(
            `/attendance-entries${buildQueryString({
              orgId: activeOrgId,
              factoryId: normalizedFactoryId,
              month: normalizedMonthKey,
            })}`,
            {
              skipGlobalLoading: true,
              signal: abortController.signal,
            }
          ).catch(() => []),
        ]);

        if (cancelled) return;

        const safeFactories = Array.isArray(factories) ? factories : [];
        const safeEmployees = Array.isArray(employees) ? employees : [];
        const safeLogs = Array.isArray(logs) ? logs : [];
        const safeAttendanceRows = Array.isArray(attendanceRows) ? attendanceRows : [];
        const employee =
          safeEmployees.find((item) => Number(item?.id) === Number(normalizedWorkerId)) || null;
        const factory =
          safeFactories.find((item) => Number(item?.id) === Number(normalizedFactoryId)) || null;

        const detailData = buildMonthlyWorkerDetail({
          workerId: normalizedWorkerId,
          logs: safeLogs,
          attendanceRows: safeAttendanceRows,
          holidayKeys,
          monthKey: normalizedMonthKey,
          employee,
          factoryName: factory?.name || '',
        });

        setSummary(detailData.summary || null);
        setRows(Array.isArray(detailData.rows) ? detailData.rows : []);
      } catch (_error) {
        if (cancelled || abortController.signal.aborted) return;
        const message = resolveText(
          TEXT.fetchError,
          languageCode,
          '월간 기록 상세를 불러오지 못했습니다.'
        );
        setSummary(null);
        setRows([]);
        setLoadError(message);
        showNotification(message, 'error');
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
    holidayKeys,
    languageCode,
    monthRange.dateFrom,
    monthRange.dateTo,
    normalizedFactoryId,
    normalizedMonthKey,
    normalizedWorkerId,
    showNotification,
  ]);

  const filteredRows = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => {
      const searchText = [row?.workDate, row?.lineName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchText.includes(keyword);
    });
  }, [rows, searchTerm]);

  const summaryCards = summary
    ? [
        {
          label: resolveText(TEXT.worker, languageCode, '작업자'),
          value: summary.workerName || '-',
        },
        {
          label: resolveText(TEXT.month, languageCode, '작업월'),
          value: summary.workMonth || normalizedMonthKey || '-',
        },
        {
          label: resolveText(TEXT.factory, languageCode, '공장'),
          value: summary.factoryName || '-',
        },
        {
          label: resolveText(TEXT.line, languageCode, '라인'),
          value: summary.lineName || '-',
        },
        {
          label: resolveText(TEXT.attendance, languageCode, '근태'),
          value: summary.attendanceDisplay || '-',
        },
        {
          label: resolveText(TEXT.items, languageCode, '기록건수'),
          value: String(summary.recordCount || 0),
        },
        {
          label: resolveText(TEXT.averageCt, languageCode, '1일 평균 CT'),
          value:
            summary.averageCtPerDaySeconds == null
              ? '-'
              : formatDuration(summary.averageCtPerDaySeconds, languageCode),
        },
      ]
    : [];

  const emptyStateMessage =
    loadError || resolveText(TEXT.empty, languageCode, '표시할 월간 상세 내역이 없습니다.');
  const emptyStateSx = loadError ? { color: 'error.main' } : undefined;

  return (
    <AppPageContainer
      title={resolveText(TEXT.title, languageCode, '월간 기록 상세')}
      titleActions={(
        <Button variant="outlined" onClick={closeDetail}>
          {resolveText(TEXT.backToList, languageCode, '작업 기록 목록')}
        </Button>
      )}
      toolbar={(
        <SearchInput
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={resolveText(TEXT.searchPlaceholder, languageCode, '작업일, 라인 검색')}
        />
      )}
    >
      {!normalizedMonthKey || !normalizedFactoryId || !normalizedWorkerId ? (
        <Alert severity="warning">{resolveText(TEXT.empty, languageCode, '표시할 월간 상세 내역이 없습니다.')}</Alert>
      ) : (
        <Stack spacing={2}>
          {loadError ? <Alert severity="error">{loadError}</Alert> : null}
          {summary ? (
            <Box
              sx={{
                display: 'grid',
                gap: 1,
                gridTemplateColumns: {
                  xs: 'repeat(2, minmax(0, 1fr))',
                  lg: 'repeat(4, minmax(0, 1fr))',
                },
              }}
            >
              {summaryCards.map((item) => (
                <Paper key={item.label} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">
                    {item.label}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.4, fontWeight: 700 }}>
                    {item.value}
                  </Typography>
                </Paper>
              ))}
            </Box>
          ) : null}

          <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{resolveText(TEXT.workDate, languageCode, '작업일')}</TableCell>
                    <TableCell>{resolveText(TEXT.line, languageCode, '라인')}</TableCell>
                    <TableCell>{resolveText(TEXT.attendance, languageCode, '근태')}</TableCell>
                    <TableCell align="right">
                      {resolveText(TEXT.items, languageCode, '기록건수')}
                    </TableCell>
                    <TableCell>{resolveText(TEXT.averageCt, languageCode, '1일 평균 CT')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading ? (
                    <TableStatusRow
                      colSpan={5}
                      message={resolveText(TEXT.loading, languageCode, '월간 기록 상세를 불러오는 중입니다.')}
                    />
                  ) : filteredRows.length === 0 ? (
                    <TableStatusRow
                      colSpan={5}
                      message={emptyStateMessage}
                      sx={emptyStateSx}
                    />
                  ) : (
                    filteredRows.map((row) => (
                      <TableRow key={row.workDate}>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{row.workDate}</TableCell>
                        <TableCell>{row.lineName || '-'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {row.attendanceWorked
                            ? resolveText(TEXT.attendanceWorked, languageCode, '근무')
                            : resolveText(TEXT.attendanceMissing, languageCode, '미입력')}
                        </TableCell>
                        <TableCell align="right">{row.recordCount || 0}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {row.averageCtSeconds == null
                            ? '-'
                            : formatDuration(row.averageCtSeconds, languageCode)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}
    </AppPageContainer>
  );
};

export default WorkMonthlyDetail;
