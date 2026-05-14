import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
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
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import 'dayjs/locale/ko';
import 'dayjs/locale/vi';
import AppPageContainer from '../../../components/AppPageContainer';
import CustomDatePicker from '../../../components/CustomDatePicker';
import PageSectionHeader from '../../../components/PageSectionHeader';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { deleteWorkLog, loadWorkLogs } from './workLogStorage';

const TEXT = {
  add: { ko: '기록 추가', en: 'Add Log', vi: 'Them ghi chep' },
  searchPlaceholder: {
    ko: '날짜, 공장, 라인 검색',
    en: 'Search date, factory, line',
    vi: 'Tim ngay, nha may, chuyen',
  },
  workDate: { ko: '작업일자', en: 'Work Date', vi: 'Ngay lam viec' },
  factory: { ko: '공장', en: 'Factory', vi: 'Nha may' },
  selectFactory: { ko: '공장 선택', en: 'Select factory', vi: 'Chon nha may' },
  line: { ko: '라인', en: 'Line', vi: 'Chuyen' },
  workers: { ko: '작업자', en: 'Workers', vi: 'Cong nhan' },
  items: { ko: '기록 건수', en: 'Entries', vi: 'So dong' },
  averageCtPerWorker: {
    ko: '1인 평균 CT',
    en: 'Avg CT / Worker',
    vi: 'CT trung binh / nguoi',
  },
  loading: {
    ko: '기록을 불러오는 중입니다.',
    en: 'Loading logs...',
    vi: 'Dang tai ghi chep...',
  },
  empty: {
    ko: '해당 기간에 기록이 없습니다.',
    en: 'No logs found for this period.',
    vi: 'Khong co ghi chep trong giai doan nay.',
  },
  fetchError: {
    ko: '기록을 불러오지 못했습니다.',
    en: 'Failed to load logs.',
    vi: 'Khong the tai ghi chep.',
  },
  deleteConfirm: {
    ko: '이 기록을 삭제하시겠습니까?',
    en: 'Delete this log?',
    vi: 'Ban co muon xoa ghi chep nay khong?',
  },
  deleteSuccess: { ko: '기록을 삭제했습니다.', en: 'Log deleted.', vi: 'Da xoa ghi chep.' },
  deleteError: {
    ko: '기록 삭제에 실패했습니다.',
    en: 'Failed to delete the log.',
    vi: 'Khong the xoa ghi chep.',
  },
  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Thang truoc' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Thang sau' },
};

const DAILY_LOG_LABELS = {
  ko: '일일 기록',
  en: 'Daily Records',
  vi: 'Ghi chep ngay',
};

const WORK_VIEW_MODES = {
  DAILY: 'daily',
  MONTHLY: 'monthly',
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

const buildWorkDateKey = (value) => dayjs(value).format('YYYY-MM-DD');

const buildWorkCreateTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'New Daily Record';
  if (languageCode === 'vi') return 'Tao ghi chep ngay';
  return '일일 기록 신규';
};

const buildWorkDetailTabLabel = (workDateKey, languageCode) => {
  const title =
    languageCode === 'vi'
      ? 'Chi tiet ghi chep ngay'
      : languageCode === 'en'
        ? 'Daily Record Detail'
        : '일일 기록 상세';
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

const buildFilterDateKey = (value) => {
  const normalized = normalizeFilterDate(value);
  return normalized ? dayjs(normalized).format('YYYY-MM-DD') : '';
};

const getMonthStart = (value) => {
  const normalized = normalizeFilterDate(value) || new Date();
  return dayjs(normalized).startOf('month').toDate();
};

const getMonthEnd = (value) => {
  const normalized = normalizeFilterDate(value) || new Date();
  return dayjs(normalized).endOf('month').toDate();
};

const addMonths = (value, amount) => {
  const normalized = normalizeFilterDate(value) || new Date();
  return dayjs(normalized).add(amount, 'month').startOf('month').toDate();
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
    const dateFilterStart = storedStart || storedEnd || getMonthStart(new Date());
    const endCandidate = storedEnd || storedStart || dateFilterStart;
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

const resolveAverageCtSecondsPerWorker = (log) => {
  const workerCount = Math.max(0, Math.round(Number(log?.workerCount) || 0));
  if (workerCount <= 0) return null;
  const totalCtSeconds = Math.max(
    0,
    Math.round(Number(log?.totalContractedSeconds) || 0)
  );
  return Math.round(totalCtSeconds / workerCount);
};

const WorkList = ({
  viewMode = WORK_VIEW_MODES.DAILY,
  onViewModeChange = () => {},
}) => {
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
  const [dateFilterStart, setDateFilterStart] = useState(
    () => storedFilters?.dateFilterStart || getMonthStart(new Date())
  );
  const [dateFilterEnd, setDateFilterEnd] = useState(
    () => storedFilters?.dateFilterEnd || getMonthEnd(new Date())
  );
  const [deletingId, setDeletingId] = useState('');

  const selectedFactoryIdNumber = useMemo(() => {
    const parsed = Number(selectedFactoryId);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [selectedFactoryId]);

  const dateFrom = useMemo(() => buildFilterDateKey(dateFilterStart), [dateFilterStart]);
  const dateTo = useMemo(() => buildFilterDateKey(dateFilterEnd), [dateFilterEnd]);
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

  const handleAdd = useCallback(() => {
    navigateToPath('/work-history/new', {
      label: buildWorkCreateTabLabel(languageCode),
    });
  }, [languageCode, navigateToPath]);

  const handleViewModeToggle = useCallback(
    (_event, nextMode) => {
      if (!nextMode || nextMode === viewMode) return;
      if (nextMode !== WORK_VIEW_MODES.DAILY && nextMode !== WORK_VIEW_MODES.MONTHLY) return;
      onViewModeChange(nextMode);
    },
    [onViewModeChange, viewMode]
  );

  const handleOpen = useCallback(
    (log) => {
      if (!log?.id) return;
      navigateToPath(`/work-history/${log.id}`, {
        label: buildWorkDetailTabLabel(
          buildWorkDateKey(log.workDate || log.updatedAt || log.createdAt),
          languageCode
        ),
      });
    },
    [languageCode, navigateToPath]
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

  const handleDateFilterStartChange = useCallback((value) => {
    if (!value?.isValid?.()) return;
    const nextStart = normalizeFilterDate(value.toDate());
    if (!nextStart) return;
    setDateFilterStart(nextStart);
    setDateFilterEnd((prev) => {
      const currentEnd = normalizeFilterDate(prev);
      return currentEnd && currentEnd >= nextStart ? currentEnd : nextStart;
    });
  }, []);

  const handleDateFilterEndChange = useCallback((value) => {
    if (!value?.isValid?.()) return;
    const nextEnd = normalizeFilterDate(value.toDate());
    if (!nextEnd) return;
    setDateFilterEnd(nextEnd);
    setDateFilterStart((prev) => {
      const currentStart = normalizeFilterDate(prev);
      return currentStart && currentStart <= nextEnd ? currentStart : nextEnd;
    });
  }, []);

  const shiftDateFilterMonth = useCallback(
    (amount) => {
      const nextMonthStart = addMonths(dateFilterStart, amount);
      setDateFilterStart(nextMonthStart);
      setDateFilterEnd(getMonthEnd(nextMonthStart));
    },
    [dateFilterStart]
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
            actions={
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
                {resolveText(TEXT.add, languageCode, '기록 추가')}
              </Button>
            }
          />
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'stretch', xl: 'center' },
              flexDirection: { xs: 'column', xl: 'row' },
              gap: 1,
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
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 180 }, flexShrink: 0 }}>
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
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: { xs: 'flex-start', xl: 'flex-end' },
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1,
                flexShrink: 0,
                ml: { xl: 'auto' },
              }}
            >
              <Stack
                direction="row"
                spacing={1}
                sx={{
                  alignItems: 'center',
                  justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                  flexWrap: 'wrap',
                  flexShrink: 0,
                }}
              >
                <CustomDatePicker
                  value={dateFilterStart}
                  onChange={handleDateFilterStartChange}
                  slotProps={FILTER_DATE_PICKER_SLOT_PROPS}
                />
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mx: 0.25 }}>
                  ~
                </Typography>
                <CustomDatePicker
                  value={dateFilterEnd}
                  onChange={handleDateFilterEndChange}
                  slotProps={FILTER_DATE_PICKER_SLOT_PROPS}
                />
                <Stack sx={{ gap: '2px' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => shiftDateFilterMonth(1)}
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                  >
                    M+
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => shiftDateFilterMonth(-1)}
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                  >
                    M-
                  </Button>
                </Stack>
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={viewMode}
                  onChange={handleViewModeToggle}
                  aria-label="work-history-view-mode"
                >
                  <ToggleButton value={WORK_VIEW_MODES.DAILY}>
                    {getUiMessage('workHistoryView.daily', '\uC77C\uAC04', languageCode)}
                  </ToggleButton>
                  <ToggleButton value={WORK_VIEW_MODES.MONTHLY}>
                    {getUiMessage('workHistoryView.monthly', '\uC6D4\uAC04', languageCode)}
                  </ToggleButton>
                </ToggleButtonGroup>
              </Stack>
            </Box>
          </Box>
        </Stack>
      }
    >
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
                        {`${resolveText(TEXT.averageCtPerWorker, languageCode, '1인 평균 CT')} ${
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
                  {resolveText(TEXT.averageCtPerWorker, languageCode, '1인 평균 CT')}
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
    </AppPageContainer>
  );
};

export default WorkList;
