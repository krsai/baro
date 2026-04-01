import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Paper,
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
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
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { deleteWorkLog, loadWorkLogs } from './workLogStorage';

const TEXT = {
  add: { ko: '기록 추가', en: 'Add Log', vi: 'Them ghi chep' },
  searchPlaceholder: {
    ko: '날짜, 공장, 라인, 비고 검색',
    en: 'Search date, factory, line, note',
    vi: 'Tim ngay, nha may, chuyen, ghi chu',
  },
  workDate: { ko: '작업일자', en: 'Work Date', vi: 'Ngay lam viec' },
  factory: { ko: '공장', en: 'Factory', vi: 'Nha may' },
  line: { ko: '라인', en: 'Line', vi: 'Chuyen' },
  workers: { ko: '작업자', en: 'Workers', vi: 'Cong nhan' },
  items: { ko: '기록 건수', en: 'Entries', vi: 'So dong' },
  totalCt: { ko: '총 CT', en: 'Total CT', vi: 'Tong CT' },
  note: { ko: '비고', en: 'Note', vi: 'Ghi chu' },
  updatedAt: { ko: '최근 수정', en: 'Updated', vi: 'Cap nhat' },
  loading: { ko: '기록을 불러오는 중입니다.', en: 'Loading logs...', vi: 'Dang tai ghi chep...' },
  empty: { ko: '해당 기간에 기록이 없습니다.', en: 'No logs found for this period.', vi: 'Khong co ghi chep trong giai doan nay.' },
  fetchError: { ko: '기록을 불러오지 못했습니다.', en: 'Failed to load logs.', vi: 'Khong the tai ghi chep.' },
  deleteConfirm: {
    ko: '이 기록을 삭제하시겠습니까?',
    en: 'Delete this log?',
    vi: 'Ban co muon xoa ghi chep nay khong?',
  },
  deleteSuccess: { ko: '기록을 삭제했습니다.', en: 'Log deleted.', vi: 'Da xoa ghi chep.' },
  deleteError: { ko: '기록 삭제에 실패했습니다.', en: 'Failed to delete the log.', vi: 'Khong the xoa ghi chep.' },
  monthLabel: { ko: '조회 월', en: 'Month', vi: 'Thang' },
  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Thang truoc' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Thang sau' },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;

const buildDateKey = (value) => dayjs(value).format('YYYY-MM-DD');
const buildWorkCreateTabLabel = (languageCode) => {
  if (languageCode === 'en') return 'New Log';
  if (languageCode === 'vi') return 'Tao ghi chep';
  return '신규 기록';
};
const buildWorkDetailTabLabel = (workDateKey, languageCode) => {
  const title =
    languageCode === 'vi'
      ? 'Chi tiet ghi chep'
      : languageCode === 'en'
        ? 'Log Detail'
        : '기록 상세';
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

const getDatePickerLocaleText = (languageCode) => {
  if (languageCode === 'ko') {
    return datePickerKoKR.components.MuiLocalizationProvider.defaultProps.localeText;
  }
  if (languageCode === 'vi') {
    return datePickerViVN.components.MuiLocalizationProvider.defaultProps.localeText;
  }
  return datePickerEnUS.components.MuiLocalizationProvider.defaultProps.localeText;
};

const WorkList = () => {
  const { navigateToPath, showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => dayjs().startOf('month'));
  const [deletingId, setDeletingId] = useState('');

  const dateFrom = useMemo(() => selectedMonth.startOf('month').format('YYYY-MM-DD'), [selectedMonth]);
  const dateTo = useMemo(() => selectedMonth.endOf('month').format('YYYY-MM-DD'), [selectedMonth]);

  useEffect(() => {
    const abortController = new AbortController();
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const rows = await loadWorkLogs({
          orgId: activeOrgId,
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
          showNotification(resolveText(TEXT.fetchError, languageCode, '기록을 불러오지 못했습니다.'), 'error');
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
  }, [activeOrgId, dateFrom, dateTo, languageCode, showNotification]);

  const filteredLogs = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    const sorted = [...logs].sort((left, right) => {
      return dayjs(right?.workDate || right?.updatedAt || right?.createdAt || 0).valueOf() - dayjs(left?.workDate || left?.updatedAt || left?.createdAt || 0).valueOf();
    });

    if (!keyword) return sorted;

    return sorted.filter((log) => {
      const searchText = [
        log?.workDate,
        log?.factoryName,
        log?.lineName,
        log?.note,
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

  const handleOpen = useCallback(
    (log) => {
      if (!log?.id) return;
      navigateToPath(`/work-history/${log.id}`, {
        label: buildWorkDetailTabLabel(buildDateKey(log.workDate || log.updatedAt || log.createdAt), languageCode),
      });
    },
    [languageCode, navigateToPath]
  );

  const handleDelete = useCallback(
    async (event, log) => {
      event.stopPropagation();
      if (!log?.id) return;
      const confirmed = window.confirm(resolveText(TEXT.deleteConfirm, languageCode, '이 기록을 삭제하시겠습니까?'));
      if (!confirmed) return;

      const currentId = String(log.id);
      setDeletingId(currentId);
      try {
        await deleteWorkLog(log.id, { orgId: activeOrgId });
        setLogs((prev) => prev.filter((item) => String(item?.id || '') !== currentId));
        showNotification(resolveText(TEXT.deleteSuccess, languageCode, '기록을 삭제했습니다.'), 'success');
      } catch (_error) {
        showNotification(resolveText(TEXT.deleteError, languageCode, '기록 삭제에 실패했습니다.'), 'error');
      } finally {
        setDeletingId('');
      }
    },
    [activeOrgId, languageCode, showNotification]
  );

  const toolbar = (
    <PageToolbar
      left={
        <SearchInput
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder={resolveText(TEXT.searchPlaceholder, languageCode, '날짜, 공장, 라인, 비고 검색')}
        />
      }
      right={[
        <Tooltip key="prev" title={resolveText(TEXT.prevMonth, languageCode, '이전 달')}>
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
            label={resolveText(TEXT.monthLabel, languageCode, '조회 월')}
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
        <Tooltip key="next" title={resolveText(TEXT.nextMonth, languageCode, '다음 달')}>
          <span>
            <IconButton onClick={() => setSelectedMonth((prev) => prev.add(1, 'month'))}>
              <ChevronRightIcon />
            </IconButton>
          </span>
        </Tooltip>,
        <Button key="add" variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          {resolveText(TEXT.add, languageCode, '기록 추가')}
        </Button>,
      ]}
    />
  );

  return (
    <AppPageContainer
      title={getUiMessage('menu.workHistory', '기록', languageCode)}
      toolbar={toolbar}
    >
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{resolveText(TEXT.workDate, languageCode, '작업일자')}</TableCell>
                <TableCell>{resolveText(TEXT.factory, languageCode, '공장')}</TableCell>
                <TableCell>{resolveText(TEXT.line, languageCode, '라인')}</TableCell>
                <TableCell align="right">{resolveText(TEXT.workers, languageCode, '작업자')}</TableCell>
                <TableCell align="right">{resolveText(TEXT.items, languageCode, '기록 건수')}</TableCell>
                <TableCell>{resolveText(TEXT.totalCt, languageCode, '총 CT')}</TableCell>
                <TableCell>{resolveText(TEXT.note, languageCode, '비고')}</TableCell>
                <TableCell>{resolveText(TEXT.updatedAt, languageCode, '최근 수정')}</TableCell>
                <TableCell align="right">&nbsp;</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableStatusRow colSpan={9} message={resolveText(TEXT.loading, languageCode, '기록을 불러오는 중입니다.')} />
              ) : filteredLogs.length === 0 ? (
                <TableStatusRow colSpan={9} message={resolveText(TEXT.empty, languageCode, '해당 기간에 기록이 없습니다.')} />
              ) : (
                filteredLogs.map((log) => (
                  <TableRow
                    key={log.id}
                    hover
                    onClick={() => handleOpen(log)}
                    sx={{
                      cursor: 'pointer',
                      '& td': { verticalAlign: 'top' },
                    }}
                  >
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{log.workDate || '-'}</TableCell>
                    <TableCell>{log.factoryName || '-'}</TableCell>
                    <TableCell>{log.lineName || '-'}</TableCell>
                    <TableCell align="right">{log.workerCount || 0}</TableCell>
                    <TableCell align="right">{log.itemCount || 0}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDuration(log.totalContractedSeconds, languageCode)}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          maxWidth: 360,
                        }}
                      >
                        {log.note || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {log.updatedAt ? dayjs(log.updatedAt).format('YYYY-MM-DD HH:mm') : '-'}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title={getUiMessage('common.delete', '삭제', languageCode)}>
                        <span>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(event) => handleDelete(event, log)}
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



