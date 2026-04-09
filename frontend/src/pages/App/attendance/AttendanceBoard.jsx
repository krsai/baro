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
import 'dayjs/locale/ko';
import AppPageContainer from '../../../components/AppPageContainer';
import CustomDatePicker from '../../../components/CustomDatePicker';
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import {
  buildAttendanceImportPlan,
  mergeImportedAttendanceEntries,
  parseAttendanceImportFile,
} from './attendanceFileImport';

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
  const filteredEmployees = useMemo(() => {
    const keyword = String(searchTerm || '').trim().toLowerCase();
    if (!keyword) return employees;
    return employees.filter((employee) => {
      const text = [employee?.displayName, employee?.name, employee?.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return text.includes(keyword);
    });
  }, [employees, searchTerm]);

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

  const handleClickImport = () => {
    if (!selectedFactoryId) {
      showNotification('공장을 먼저 선택해 주세요.', 'warning');
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event) => {
    const file = event?.target?.files?.[0] || null;
    if (event?.target) event.target.value = '';
    if (!file) return;

    if (!selectedFactoryId) {
      showNotification('공장을 먼저 선택해 주세요.', 'warning');
      return;
    }
    if (loadingEmployees) {
      showNotification('작업자 목록을 불러온 후 업로드해 주세요.', 'warning');
      return;
    }
    if (!employees.length) {
      showNotification('매칭할 작업자 목록이 없습니다.', 'warning');
      return;
    }

    setImportingFile(true);
    try {
      const parsed = await parseAttendanceImportFile(file);
      if (!parsed.events.length) {
        showNotification('가져올 출퇴근 이벤트가 없습니다.', 'warning');
        return;
      }

      const plan = buildAttendanceImportPlan({
        events: parsed.events,
        employees,
      });
      const selectedDay = plan.dailyEntries.find((item) => item.workDate === dateKey);
      if (!selectedDay || selectedDay.entries.length === 0) {
        showNotification(`선택한 근무일(${dateKey})에 반영할 데이터가 없습니다.`, 'warning');
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
        `업로드 반영 완료 (${dateKey}) - 반영 ${selectedDay.entries.length}명, 매칭 ${plan.matchedEventCount}건, 미매칭 ${plan.unmatchedEventCount}건`,
        'success'
      );
    } catch (error) {
      showNotification(error?.message || '파일 업로드에 실패했습니다.', 'error');
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
      showNotification('출퇴근 입력을 저장했습니다.', 'success');
      if (closeOnSave && typeof onClose === 'function') {
        onClose();
      }
    } catch (error) {
      showNotification(
        error?.message || '출퇴근 입력 저장에 실패했습니다.',
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
      title="출퇴근 상세"
      titleActions={(
        <Stack direction="row" spacing={1}>
          {typeof onClose === 'function' ? (
            <Button
              variant="outlined"
              onClick={onClose}
              disabled={savingEntries}
            >
              {closeOnSave ? '취소' : '목록'}
            </Button>
          ) : null}
          <Button
            variant="contained"
            onClick={handleSaveEntries}
            disabled={!selectedFactoryId || savingEntries}
          >
            저장
          </Button>
        </Stack>
      )}
      toolbar={(
        <PageToolbar
          left={(
            <SearchInput
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="작업자 검색"
            />
          )}
          right={(
            <>
              <CustomDatePicker
                label="근무일자"
                value={selectedDate}
                onChange={(value) => {
                  if (!value || !value.isValid?.()) return;
                  setSelectedDate(value.startOf('day'));
                }}
                slotProps={{ textField: { sx: { minWidth: 160 } } }}
              />
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
                startIcon={importingFile ? <CircularProgress size={16} /> : <UploadFileIcon />}
                onClick={handleClickImport}
                disabled={!selectedFactoryId || importingFile || loadingEmployees}
              >
                {importingFile ? '업로드 중...' : '파일 업로드'}
              </Button>
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
                      : filteredEmployees.length === 0
                        ? searchTerm
                          ? '검색 결과가 없습니다.'
                          : '등록된 작업자가 없습니다.'
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
