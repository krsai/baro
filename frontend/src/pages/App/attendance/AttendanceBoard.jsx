import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
  Typography,
} from '@mui/material';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import dayjs from 'dayjs';
import 'dayjs/locale/ko';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const toDateKey = (value) => dayjs(value).format('YYYY-MM-DD');

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

const calcWorkedMinutes = (clockIn, clockOut) => {
  const inMinutes = parseTimeToMinutes(clockIn);
  const outMinutes = parseTimeToMinutes(clockOut);
  if (inMinutes == null || outMinutes == null) return null;
  if (outMinutes >= inMinutes) return outMinutes - inMinutes;
  return 24 * 60 - inMinutes + outMinutes;
};

const formatWorkedHours = (minutes) => {
  const value = Number(minutes);
  if (!Number.isFinite(value) || value < 0) return '-';
  return `${(value / 60).toFixed(1)}h`;
};

const AttendanceBoard = () => {
  const { showNotification } = useApp();
  const { activeOrgId, activeFactoryId } = useAuth();
  const [selectedDate, setSelectedDate] = useState(dayjs());
  const [factories, setFactories] = useState([]);
  const [selectedFactoryId, setSelectedFactoryId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [entriesByWorker, setEntriesByWorker] = useState({});
  const [loadingFactories, setLoadingFactories] = useState(false);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [savingEntries, setSavingEntries] = useState(false);

  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const selectedFactory = useMemo(
    () =>
      factories.find((factory) => String(factory?.id) === String(selectedFactoryId)) || null,
    [factories, selectedFactoryId]
  );

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
        setEmployees(
          list
            .map((employee) => ({
              ...employee,
              displayName: employee?.name || `작업자 ${employee?.id || ''}`,
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
  }, [activeOrgId, selectedFactoryId]);

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
        showNotification('출퇴근 입력을 불러오지 못했습니다.', 'error');
      } finally {
        if (!cancelled) setLoadingEntries(false);
      }
    };
    loadEntries();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeOrgId, dateKey, selectedFactoryId, showNotification]);

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
      showNotification('출퇴근 입력을 저장했습니다.', 'success');
    } catch (error) {
      showNotification(
        error?.message || '출퇴근 입력 저장에 실패했습니다.',
        'error'
      );
    } finally {
      setSavingEntries(false);
    }
  };

  const handleResetEntries = async () => {
    if (!selectedFactoryId) return;
    setSavingEntries(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/attendance-entries' + query, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factoryId: Number(selectedFactoryId),
          workDate: dateKey,
          entries: [],
        }),
      });
      setEntriesByWorker({});
      showNotification('해당 일자 입력을 초기화했습니다.', 'info');
    } catch (error) {
      showNotification(
        error?.message || '출퇴근 입력 초기화에 실패했습니다.',
        'error'
      );
    } finally {
      setSavingEntries(false);
    }
  };

  const summary = useMemo(() => {
    const workerCount = employees.length;
    let enteredCount = 0;
    let workedMinutesTotal = 0;
    employees.forEach((employee) => {
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
  }, [employees, entriesByWorker]);

  return (
    <AppPageContainer
      title="출퇴근 기록"
      titleActions={(
        <Button
          variant="contained"
          onClick={handleSaveEntries}
          disabled={!selectedFactoryId || savingEntries}
        >
          저장
        </Button>
      )}
      toolbar={(
        <PageToolbar
          right={(
            <>
              <Chip
                icon={<EventAvailableIcon />}
                label={`${dateKey} · ${selectedFactory?.name || '공장 미선택'}`}
                variant="outlined"
              />
              <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="ko">
                <DatePicker
                  label="근무일자"
                  value={selectedDate}
                  onChange={(value) => {
                    if (!value || !value.isValid()) return;
                    setSelectedDate(value.startOf('day'));
                  }}
                  slotProps={{ textField: { size: 'small', sx: { minWidth: 160 } } }}
                />
              </LocalizationProvider>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel id="attendance-factory-select-label">공장</InputLabel>
                <Select
                  labelId="attendance-factory-select-label"
                  value={selectedFactoryId}
                  label="공장"
                  onChange={(event) => setSelectedFactoryId(String(event.target.value || ''))}
                  disabled={loadingFactories || factories.length === 0}
                >
                  {factories.map((factory) => (
                    <MenuItem key={factory.id} value={String(factory.id)}>
                      {factory.name || `공장 ${factory.id}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <Button
                variant="outlined"
                onClick={handleResetEntries}
                disabled={!selectedFactoryId || savingEntries}
              >
                초기화
              </Button>
            </>
          )}
        />
      )}
    >
      <Alert severity="warning" sx={{ mb: 2 }}>
        AT 계산은 매월 5일 기준 직전 월 데이터를 반영하며, 출퇴근 미입력 작업자는 8시간 기준으로 자동 계산됩니다.
      </Alert>

      <Paper variant="outlined" sx={{ overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>작업자</TableCell>
                <TableCell align="center">출근</TableCell>
                <TableCell align="center">퇴근</TableCell>
                <TableCell align="center">근무시간</TableCell>
                <TableCell>메모</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableStatusRow
                colSpan={5}
                message={
                  loadingEmployees
                    ? '작업자 목록을 불러오는 중입니다.'
                    : loadingEntries
                      ? '출퇴근 입력을 불러오는 중입니다.'
                    : !selectedFactoryId
                      ? '공장을 먼저 선택하세요.'
                      : employees.length === 0
                        ? '등록된 작업자가 없습니다.'
                        : ''
                }
                sx={{
                  py:
                    loadingEmployees || loadingEntries || !selectedFactoryId || employees.length === 0
                      ? 3
                      : 0,
                  display:
                    loadingEmployees || loadingEntries || !selectedFactoryId || employees.length === 0
                      ? 'table-cell'
                      : 'none',
                }}
              />
              {!loadingEmployees &&
                !loadingEntries &&
                selectedFactoryId &&
                employees.map((employee) => {
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
                          placeholder="특이사항"
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
          label={`작업자 ${formatNumberWithCommas(summary.workerCount, {
            fallback: '0',
            maximumFractionDigits: 0,
          })}명`}
        />
        <Chip
          variant="outlined"
          label={`입력 완료 ${formatNumberWithCommas(summary.enteredCount, {
            fallback: '0',
            maximumFractionDigits: 0,
          })}명`}
        />
        <Chip
          color="primary"
          variant="outlined"
          label={`입력 근무합계 ${formatWorkedHours(summary.workedMinutesTotal)}`}
        />
      </Stack>
    </AppPageContainer>
  );
};

export default AttendanceBoard;
