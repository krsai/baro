import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  IconButton,
  Paper,
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
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AppPageContainer from '../../../components/AppPageContainer';
import CustomDatePicker from '../../../components/CustomDatePicker';
import PageToolbar from '../../../components/PageToolbar';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getUiMessage } from '../../../constants/uiMessages';
import { deleteWorkLog, loadWorkLogs } from './workLogStorage';

const WORK_LIST_TEXT = {
  prevMonth: { ko: '이전 달', en: 'Previous month', vi: 'Thang truoc' },
  nextMonth: { ko: '다음 달', en: 'Next month', vi: 'Thang sau' },
  addLog: { ko: '기록 추가', en: 'Add Log', vi: 'Them ghi chep' },
  workDate: { ko: '작업일자', en: 'Work Date', vi: 'Ngay lam viec' },
  factory: { ko: '공장', en: 'Factory', vi: 'Nha may' },
  workerCount: { ko: '작업자 수', en: 'Workers', vi: 'So cong nhan' },
  itemCount: { ko: '품목 수', en: 'Items', vi: 'So muc' },
  avgCt: { ko: '평균 CT', en: 'Avg CT', vi: 'CT trung binh' },
  note: { ko: '비고', en: 'Note', vi: 'Ghi chu' },
  delete: { ko: '삭제', en: 'Delete', vi: 'Xoa' },
  loading: {
    ko: '기록을 불러오는 중입니다.',
    en: 'Loading logs...',
    vi: 'Dang tai ghi chep...',
  },
  empty: {
    ko: '등록된 기록이 없습니다.',
    en: 'No logs found.',
    vi: 'Chua co ghi chep nao.',
  },
  fetchError: {
    ko: '기록 조회에 실패했습니다.',
    en: 'Failed to load logs.',
    vi: 'Khong the tai ghi chep.',
  },
  confirmDelete: {
    ko: '기록 "{label}"을(를) 삭제하시겠습니까?',
    en: 'Delete log "{label}"?',
    vi: 'Xoa ghi chep "{label}"?',
  },
  deleteSuccess: { ko: '기록을 삭제했습니다.', en: 'Log deleted.', vi: 'Da xoa ghi chep.' },
  deleteNotFound: {
    ko: '삭제할 기록을 찾을 수 없습니다.',
    en: 'Log not found.',
    vi: 'Khong tim thay ghi chep de xoa.',
  },
  deleteError: {
    ko: '기록 삭제에 실패했습니다.',
    en: 'Failed to delete log.',
    vi: 'Khong the xoa ghi chep.',
  },
  deleteAria: { ko: '기록 삭제', en: 'Delete log', vi: 'Xoa ghi chep' },
  attendancePending: {
    ko: '출결 연동 예정',
    en: 'Attendance integration pending',
    vi: 'Dang cho dong bo cham cong',
  },
};

const resolveText = (bundle, languageCode, fallback = '') =>
  bundle?.[languageCode] || bundle?.ko || fallback;

const formatSeconds = (value, languageCode) => {
  const seconds = Number(value) || 0;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (languageCode === 'en') return `${hours}h ${minutes}m`;
  if (languageCode === 'vi') return `${hours} gio ${minutes} phut`;
  return `${hours}시간 ${minutes}분`;
};

const formatNote = (note, languageCode) => {
  if (!note) return '-';
  if (note === 'Attendance integration pending') {
    return resolveText(WORK_LIST_TEXT.attendancePending, languageCode, note);
  }
  return note;
};

const buildDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getMonthStart = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getMonthEnd = (date) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0);
  d.setHours(0, 0, 0, 0);
  return d;
};

const addMonths = (date, amount) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + amount);
  return getMonthStart(d);
};

const WorkList = () => {
  const { navigateToPath, showNotification } = useApp();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const [workLogs, setWorkLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [monthStart, setMonthStart] = useState(() => getMonthStart(new Date()));

  const dateFrom = useMemo(() => buildDateKey(monthStart), [monthStart]);
  const dateTo = useMemo(() => buildDateKey(getMonthEnd(monthStart)), [monthStart]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const rows = await loadWorkLogs({ orgId: activeOrgId, dateFrom, dateTo });
        if (!cancelled) {
          setWorkLogs(Array.isArray(rows) ? rows : []);
        }
      } catch (_error) {
        if (!cancelled) {
          setWorkLogs([]);
          showNotification(resolveText(WORK_LIST_TEXT.fetchError, languageCode, '기록 조회에 실패했습니다.'), 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, dateFrom, dateTo, languageCode, showNotification]);

  const sortedLogs = useMemo(
    () =>
      [...workLogs].sort(
        (a, b) =>
          new Date(b.workDate || b.createdAt || 0).getTime() -
          new Date(a.workDate || a.createdAt || 0).getTime()
      ),
    [workLogs]
  );

  const handleAdd = () => {
    navigateToPath('/work-history/new', { label: resolveText(WORK_LIST_TEXT.addLog, languageCode, '기록 추가') });
  };

  const handleEdit = (log) => {
    if (!log?.id) return;
    navigateToPath(`/work-history/${log.id}`, {
      label: resolveText(WORK_LIST_TEXT.addLog, languageCode, '기록 추가'),
    });
  };

  const handleDelete = async (event, log) => {
    event.stopPropagation();
    const workLogId = log?.id;
    if (!workLogId) return;

    const labelSuffix = log.workDate || log.factoryName || workLogId;
    const confirmed = window.confirm(
      resolveText(WORK_LIST_TEXT.confirmDelete, languageCode, '기록 "{label}"을(를) 삭제하시겠습니까?').replace('{label}', labelSuffix)
    );
    if (!confirmed) return;

    const currentId = String(workLogId);
    setDeletingId(currentId);
    try {
      const deleted = await deleteWorkLog(workLogId, { orgId: activeOrgId });
      setWorkLogs((prev) =>
        prev.filter((item) => String(item?.id || '') !== currentId)
      );
      showNotification(
        deleted
          ? resolveText(WORK_LIST_TEXT.deleteSuccess, languageCode, '기록을 삭제했습니다.')
          : resolveText(WORK_LIST_TEXT.deleteNotFound, languageCode, '삭제할 기록을 찾을 수 없습니다.'),
        deleted ? 'success' : 'warning'
      );
    } catch (_error) {
      showNotification(resolveText(WORK_LIST_TEXT.deleteError, languageCode, '기록 삭제에 실패했습니다.'), 'error');
    } finally {
      setDeletingId((prev) => (prev === currentId ? null : prev));
    }
  };

  return (
    <AppPageContainer
      title={getUiMessage('menu.workHistory', '기록', languageCode)}
      toolbar={(
        <PageToolbar
          right={(
            <>
              <Stack direction="row" spacing={0.5} alignItems="center">
                <IconButton size="small" onClick={() => setMonthStart((prev) => addMonths(prev, -1))} title={resolveText(WORK_LIST_TEXT.prevMonth, languageCode, '이전 달')}>
                  <ChevronLeftIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <CustomDatePicker
                  value={monthStart}
                  onChange={(val) => { if (val?.isValid?.()) setMonthStart(getMonthStart(val.toDate())); }}
                  slotProps={{ textField: { sx: { width: 140 } } }}
                />
                <Typography sx={{ fontSize: 13, color: 'text.secondary', mx: 0.25 }}>~</Typography>
                <CustomDatePicker
                  value={getMonthEnd(monthStart)}
                  onChange={(val) => { if (val?.isValid?.()) setMonthStart(getMonthStart(val.toDate())); }}
                  slotProps={{ textField: { sx: { width: 140 } } }}
                />
                <IconButton size="small" onClick={() => setMonthStart((prev) => addMonths(prev, 1))} title={resolveText(WORK_LIST_TEXT.nextMonth, languageCode, '다음 달')}>
                  <ChevronRightIcon sx={{ fontSize: 18 }} />
                </IconButton>
                <Stack sx={{ gap: '2px' }}>
                  <Button size="small" variant="outlined" onClick={() => setMonthStart((prev) => addMonths(prev, 1))} sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}>M+</Button>
                  <Button size="small" variant="outlined" onClick={() => setMonthStart((prev) => addMonths(prev, -1))} sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}>M-</Button>
                </Stack>
              </Stack>
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleAdd}
              >
                {resolveText(WORK_LIST_TEXT.addLog, languageCode, '기록 추가')}
              </Button>
            </>
          )}
        />
      )}
    >
      <Box>
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>{resolveText(WORK_LIST_TEXT.workDate, languageCode, '작업일자')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{resolveText(WORK_LIST_TEXT.factory, languageCode, '공장')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{resolveText(WORK_LIST_TEXT.workerCount, languageCode, '작업자 수')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{resolveText(WORK_LIST_TEXT.itemCount, languageCode, '품목 수')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{resolveText(WORK_LIST_TEXT.avgCt, languageCode, '평균 CT')}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{resolveText(WORK_LIST_TEXT.note, languageCode, '비고')}</TableCell>
                  <TableCell sx={{ fontWeight: 700, width: 64, textAlign: 'center' }}>
                    {resolveText(WORK_LIST_TEXT.delete, languageCode, '삭제')}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableStatusRow
                    colSpan={7}
                    message={resolveText(WORK_LIST_TEXT.loading, languageCode, '기록을 불러오는 중입니다.')}
                  />
                ) : sortedLogs.length === 0 ? (
                  <TableStatusRow
                    colSpan={7}
                    message={resolveText(WORK_LIST_TEXT.empty, languageCode, '등록된 기록이 없습니다.')}
                  />
                ) : (
                  sortedLogs.map((log) => {
                    const rowId = String(log.id);
                    const isDeleting = deletingId === rowId;
                    return (
                      <TableRow
                        key={log.id}
                        hover
                        onDoubleClick={() => handleEdit(log)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell>{log.workDate || '-'}</TableCell>
                        <TableCell>{log.factoryName || '-'}</TableCell>
                        <TableCell>{log.workerCount ?? 0}</TableCell>
                        <TableCell>{log.itemCount ?? 0}</TableCell>
                        <TableCell>{formatSeconds(Math.round((log.totalContractedSeconds ?? 0) / Math.max(1, log.workerCount ?? 1)), languageCode)}</TableCell>
                        <TableCell>{formatNote(log.note, languageCode)}</TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton
                            size="small"
                            color="error"
                            onClick={(event) => handleDelete(event, log)}
                            disabled={Boolean(deletingId) || isDeleting}
                            aria-label={resolveText(WORK_LIST_TEXT.deleteAria, languageCode, '기록 삭제')}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </AppPageContainer>
  );
};

export default WorkList;
