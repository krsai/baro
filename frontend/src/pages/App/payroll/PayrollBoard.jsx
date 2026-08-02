import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import CalculateIcon from '@mui/icons-material/Calculate';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const TEXT = {
  ko: {
    calculateMonth: '계산 월', calculate: '계산', recalculate: '현재까지 다시 계산', calculating: '계산 중...',
    noData: '선택한 월에 계산할 작업기록이 없습니다.', alreadyCalculated: '이미 계산이 완료된 월입니다.',
    calculateSuccess: '{month} 생산수당을 계산했습니다.', fetchError: '생산수당 내역을 불러오지 못했습니다.',
    calculateError: '생산수당 계산에 실패했습니다.', deleteConfirm: '{month} 생산수당 계산 내역을 삭제하시겠습니까?',
    deleteSuccess: '{month} 생산수당 계산 내역을 삭제했습니다.', deleteError: '생산수당 계산 내역 삭제에 실패했습니다.',
    current: '진행 중', confirmed: '확정', empty: '계산된 생산수당 내역이 없습니다.', loading: '불러오는 중...',
    rowHint: '행을 선택하면 직원별·공정별 상세 내역을 확인할 수 있습니다.',
    factory: '공장', line: '라인', workCoverage: '작업기록', attendanceCoverage: '출퇴근 기록(참고)',
    basisErrors: '계산근거 오류',
    ready: '계산 가능', incomplete: '자료 미완료', noLines: '생산수당 대상 공장·라인이 없습니다.',
    needsRecalculation: '재계산 필요', recalculateConfirmed: '재계산',
    unlock: '확정 해제', unlocking: '해제 중...', unlockConfirm: '{month} 생산수당 확정을 해제하시겠습니까?',
    unlockSuccess: '{month} 생산수당 확정을 해제했습니다.', unlockError: '생산수당 확정 해제에 실패했습니다.', deleting: '삭제 중...',
  },
  en: {
    calculateMonth: 'Calculation Month', calculate: 'Calculate', recalculate: 'Recalculate to Date', calculating: 'Calculating...',
    noData: 'There are no work records to calculate for the selected month.', alreadyCalculated: 'This month has already been calculated.',
    calculateSuccess: 'Calculated production allowance for {month}.', fetchError: 'Failed to load production allowance records.',
    calculateError: 'Failed to calculate production allowance.', deleteConfirm: 'Delete the {month} production allowance result?',
    deleteSuccess: 'Deleted the {month} production allowance result.', deleteError: 'Failed to delete the production allowance result.',
    current: 'In Progress', confirmed: 'Confirmed', empty: 'No production allowance results have been calculated.', loading: 'Loading...',
    rowHint: 'Select a row to view employee and process details.',
    factory: 'Factory', line: 'Line', workCoverage: 'Work Records', attendanceCoverage: 'Attendance (Reference)',
    basisErrors: 'Basis Errors',
    ready: 'Ready', incomplete: 'Incomplete', noLines: 'No factory or line has production allowance employees.',
    needsRecalculation: 'Recalculation Required', recalculateConfirmed: 'Recalculate',
    unlock: 'Unlock', unlocking: 'Unlocking...', unlockConfirm: 'Unlock the {month} production allowance result?',
    unlockSuccess: 'Unlocked the {month} production allowance result.', unlockError: 'Failed to unlock the production allowance result.', deleting: 'Deleting...',
  },
  vi: {
    calculateMonth: 'Thang tinh', calculate: 'Tinh', recalculate: 'Tinh lai den hien tai', calculating: 'Dang tinh...',
    noData: 'Khong co du lieu cong viec de tinh trong thang da chon.', alreadyCalculated: 'Thang nay da duoc tinh.',
    calculateSuccess: 'Da tinh phu cap san luong thang {month}.', fetchError: 'Khong the tai ket qua phu cap san luong.',
    calculateError: 'Khong the tinh phu cap san luong.', deleteConfirm: 'Xoa ket qua phu cap san luong thang {month}?',
    deleteSuccess: 'Da xoa ket qua phu cap san luong thang {month}.', deleteError: 'Khong the xoa ket qua phu cap san luong.',
    current: 'Dang tien hanh', confirmed: 'Da xac nhan', empty: 'Chua co ket qua phu cap san luong.', loading: 'Dang tai...',
    rowHint: 'Chon mot dong de xem chi tiet theo nhan vien va cong doan.',
    factory: 'Nha may', line: 'Chuyen', workCoverage: 'Du lieu san xuat', attendanceCoverage: 'Cham cong (tham khao)',
    basisErrors: 'Loi du lieu tinh',
    ready: 'Co the tinh', incomplete: 'Chua du du lieu', noLines: 'Khong co nha may hoac chuyen co nhan vien tinh phu cap san luong.',
    needsRecalculation: 'Can tinh lai', recalculateConfirmed: 'Tinh lai',
    unlock: 'Mo khoa', unlocking: 'Dang mo khoa...', unlockConfirm: 'Mo khoa ket qua phu cap san luong thang {month}?',
    unlockSuccess: 'Da mo khoa ket qua phu cap san luong thang {month}.', unlockError: 'Khong the mo khoa ket qua phu cap san luong.', deleting: 'Dang xoa...',
  },
};

const resolveText = (languageCode, key, replacements = {}) => {
  const bundle = TEXT[languageCode] || TEXT.en;
  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    bundle[key] || TEXT.en[key] || key
  );
};

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), {
    fallback: '0', maximumFractionDigits: 0,
  })} VND`;

const PayrollBoard = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const [snapshots, setSnapshots] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [mutating, setMutating] = useState('');

  const text = useMemo(() => ({
    title: getUiMessage('menu.payroll', 'Production Allowance', languageCode),
    month: getUiMessage('payrollBoard.month', 'Settlement Month', languageCode),
    employees: getUiMessage('payrollBoard.employees', 'Employees', languageCode),
    total: getUiMessage('payrollBoard.total', 'Total Production Allowance', languageCode),
    savedBy: getUiMessage('payrollBoard.savedBy', 'Saved By', languageCode),
    savedAt: getUiMessage('payrollBoard.savedAt', 'Saved At', languageCode),
    status: getUiMessage('payrollBoard.status', 'Status', languageCode),
    delete: getUiMessage('payrollBoard.delete', 'Delete', languageCode),
    peopleSuffix: getUiMessage('payrollBoard.peopleSuffix', '', languageCode),
  }), [languageCode]);

  const load = useCallback(async () => {
    if (!activeOrgId) return;
    setLoading(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      const [snapshotRows, calendarPayload] = await Promise.all([
        requestJSON('/payroll/snapshots' + query),
        requestJSON('/payroll/calendar' + query, { forceRefresh: true, skipGlobalLoading: true }),
      ]);
      const nextSnapshots = Array.isArray(snapshotRows) ? snapshotRows : [];
      const nextAvailableMonths = Array.isArray(calendarPayload?.availableMonthKeys)
        ? calendarPayload.availableMonthKeys
        : [];
      const nextCurrentMonth = String(calendarPayload?.currentMonthKey || '');
      const latestCompletedMonth = String(calendarPayload?.latestCompletedMonthKey || '');
      const nextSnapshotsByMonth = new Map(
        nextSnapshots.map((snapshot) => [String(snapshot?.month || ''), snapshot])
      );
      const latestCalculableMonth = nextAvailableMonths.find((month) => {
        if (latestCompletedMonth && month > latestCompletedMonth) return false;
        const snapshot = nextSnapshotsByMonth.get(month);
        return !snapshot || snapshot.isProvisional;
      });

      setSnapshots(nextSnapshots);
      setCalendar(calendarPayload || null);
      setSelectedMonth(
        (previous) => previous || latestCalculableMonth || latestCompletedMonth || nextCurrentMonth
      );
    } catch (error) {
      setSnapshots([]);
      showNotification(error?.message || resolveText(languageCode, 'fetchError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, languageCode, showNotification]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!activeOrgId || !selectedMonth) return;
    let cancelled = false;
    setReadinessLoading(true);
    requestJSON('/payroll/readiness' + buildQueryString({ orgId: activeOrgId, month: selectedMonth }), {
      forceRefresh: true, skipGlobalLoading: true,
    })
      .then((payload) => { if (!cancelled) setReadiness(payload || null); })
      .catch((error) => {
        if (!cancelled) {
          setReadiness(null);
          showNotification(error?.message || resolveText(languageCode, 'fetchError'), 'error');
        }
      })
      .finally(() => { if (!cancelled) setReadinessLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrgId, selectedMonth, languageCode, showNotification]);

  const latestCompletedMonthKey = String(calendar?.latestCompletedMonthKey || '');
  const managementStartMonthKey = String(calendar?.managementStartMonthKey || '');
  const snapshotsByMonth = useMemo(
    () => new Map(snapshots.map((snapshot) => [String(snapshot?.month || ''), snapshot])),
    [snapshots]
  );
  const selectedSnapshot = snapshotsByMonth.get(selectedMonth) || null;
  const needsRecalculation = Boolean(readiness?.needsRecalculation);
  const alreadyCalculated = Boolean(
    selectedSnapshot && !selectedSnapshot.isProvisional && !needsRecalculation
  );
  const canCalculate = Boolean(
    selectedMonth && readiness?.ready && !alreadyCalculated && !loading && !readinessLoading && !calculating
  );

  const handleCalculate = async () => {
    if (!canCalculate) {
      showNotification(
        alreadyCalculated
          ? resolveText(languageCode, 'alreadyCalculated')
          : resolveText(languageCode, 'noData'),
        'warning'
      );
      return;
    }
    setCalculating(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/payroll/snapshots' + query, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          savedBy: activeProfile?.email || activeProfile?.name || 'administrator',
        }),
      });
      await load();
      const refreshedReadiness = await requestJSON(
        '/payroll/readiness' + buildQueryString({ orgId: activeOrgId, month: selectedMonth }),
        { forceRefresh: true, skipGlobalLoading: true }
      );
      setReadiness(refreshedReadiness || null);
      showNotification(resolveText(languageCode, 'calculateSuccess', { month: selectedMonth }), 'success');
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'calculateError'), 'error');
    } finally {
      setCalculating(false);
    }
  };

  const handleUnlock = async () => {
    if (!selectedSnapshot || selectedSnapshot.isProvisional) return;
    if (!window.confirm(resolveText(languageCode, 'unlockConfirm', { month: selectedMonth }))) return;
    setMutating('unlock');
    try {
      await requestJSON(`/payroll/snapshots/${selectedMonth}/unlock` + buildQueryString({ orgId: activeOrgId }), {
        method: 'POST',
      });
      await load();
      showNotification(resolveText(languageCode, 'unlockSuccess', { month: selectedMonth }), 'success');
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'unlockError'), 'error');
    } finally {
      setMutating('');
    }
  };

  const handleDelete = async () => {
    if (!selectedSnapshot) return;
    if (!window.confirm(resolveText(languageCode, 'deleteConfirm', { month: selectedMonth }))) return;
    setMutating('delete');
    try {
      await requestJSON(`/payroll/snapshots/${selectedMonth}` + buildQueryString({ orgId: activeOrgId }), {
        method: 'DELETE',
      });
      await load();
      showNotification(resolveText(languageCode, 'deleteSuccess', { month: selectedMonth }), 'success');
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'deleteError'), 'error');
    } finally {
      setMutating('');
    }
  };

  return (
    <AppPageContainer
      title={text.title}
      toolbar={<PageToolbar right={(
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            label={resolveText(languageCode, 'calculateMonth')}
            type="month" size="small" value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: managementStartMonthKey || undefined, max: latestCompletedMonthKey || undefined }}
          />
          <Button
            variant="contained" startIcon={<CalculateIcon />}
            disabled={!canCalculate} onClick={handleCalculate}
          >
            {calculating
              ? resolveText(languageCode, 'calculating')
              : resolveText(languageCode, needsRecalculation ? 'recalculateConfirmed' : 'calculate')}
          </Button>
          {selectedSnapshot && !selectedSnapshot.isProvisional && (
            <Button
              variant="outlined" startIcon={<LockOpenIcon />}
              disabled={Boolean(mutating)} onClick={handleUnlock}
            >
              {mutating === 'unlock' ? resolveText(languageCode, 'unlocking') : resolveText(languageCode, 'unlock')}
            </Button>
          )}
          {selectedSnapshot && (
            <Button
              color="error" variant="outlined" startIcon={<DeleteOutlineIcon />}
              disabled={Boolean(mutating)} onClick={handleDelete}
            >
              {mutating === 'delete' ? resolveText(languageCode, 'deleting') : text.delete}
            </Button>
          )}
        </Stack>
      )} />}
    >
      <Box>
        <Box sx={{ mb: 1, color: 'text.secondary', fontSize: 13 }}>
          {resolveText(languageCode, 'rowHint')}
        </Box>
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead><TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{resolveText(languageCode, 'factory')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{resolveText(languageCode, 'line')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{resolveText(languageCode, 'workCoverage')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{resolveText(languageCode, 'attendanceCoverage')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{resolveText(languageCode, 'basisErrors')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{text.employees}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{text.total}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">{text.status}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {loading || readinessLoading ? <TableStatusRow colSpan={8} message={resolveText(languageCode, 'loading')} />
                  : !readiness?.groups?.length ? <TableStatusRow colSpan={8} message={resolveText(languageCode, 'noLines')} />
                    : readiness.groups.map((group) => {
                      const groupReady = Boolean(group.ready);
                      return (
                        <TableRow
                          key={`${group.factoryId}:${group.lineId}`} hover sx={{ cursor: alreadyCalculated ? 'pointer' : 'default' }}
                          onClick={() => alreadyCalculated && navigateToPath(
                            `/payroll/${selectedMonth}?factoryId=${group.factoryId}&lineId=${group.lineId}`,
                            { label: `${text.title} ${selectedMonth} · ${group.lineName}` }
                          )}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>{languageCode === 'ko' ? group.factoryNameKo || group.factoryName : languageCode === 'vi' ? group.factoryNameVi || group.factoryName : group.factoryName}</TableCell>
                          <TableCell>{group.lineName}</TableCell>
                          <TableCell align="right">{group.workRecordedDayCount}/{group.expectedWorkingDayCount}</TableCell>
                          <TableCell align="right">{group.attendanceRecordedCount}/{group.attendanceRequiredCount}</TableCell>
                          <TableCell align="right">{group.invalidCalculationBasisCount || 0}</TableCell>
                          <TableCell align="right">{group.employeeCount}{text.peopleSuffix}</TableCell>
                          <TableCell align="right">{alreadyCalculated ? formatDong(group.productionAllowance) : '-'}</TableCell>
                          <TableCell align="center"><Chip size="small" color={alreadyCalculated ? 'success' : needsRecalculation ? 'warning' : groupReady ? 'info' : 'warning'} label={alreadyCalculated ? resolveText(languageCode, 'confirmed') : needsRecalculation ? resolveText(languageCode, 'needsRecalculation') : resolveText(languageCode, groupReady ? 'ready' : 'incomplete')} variant="outlined" /></TableCell>
                        </TableRow>
                      );
                    })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </AppPageContainer>
  );
};

export default PayrollBoard;
