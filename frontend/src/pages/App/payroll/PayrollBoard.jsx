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
import AppPageContainer from '../../../components/AppPageContainer';
import DeleteActionButton from '../../../components/DeleteActionButton';
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
  },
  en: {
    calculateMonth: 'Calculation Month', calculate: 'Calculate', recalculate: 'Recalculate to Date', calculating: 'Calculating...',
    noData: 'There are no work records to calculate for the selected month.', alreadyCalculated: 'This month has already been calculated.',
    calculateSuccess: 'Calculated production allowance for {month}.', fetchError: 'Failed to load production allowance records.',
    calculateError: 'Failed to calculate production allowance.', deleteConfirm: 'Delete the {month} production allowance result?',
    deleteSuccess: 'Deleted the {month} production allowance result.', deleteError: 'Failed to delete the production allowance result.',
    current: 'In Progress', confirmed: 'Confirmed', empty: 'No production allowance results have been calculated.', loading: 'Loading...',
    rowHint: 'Select a row to view employee and process details.',
  },
  vi: {
    calculateMonth: 'Thang tinh', calculate: 'Tinh', recalculate: 'Tinh lai den hien tai', calculating: 'Dang tinh...',
    noData: 'Khong co du lieu cong viec de tinh trong thang da chon.', alreadyCalculated: 'Thang nay da duoc tinh.',
    calculateSuccess: 'Da tinh phu cap san luong thang {month}.', fetchError: 'Khong the tai ket qua phu cap san luong.',
    calculateError: 'Khong the tinh phu cap san luong.', deleteConfirm: 'Xoa ket qua phu cap san luong thang {month}?',
    deleteSuccess: 'Da xoa ket qua phu cap san luong thang {month}.', deleteError: 'Khong the xoa ket qua phu cap san luong.',
    current: 'Dang tien hanh', confirmed: 'Da xac nhan', empty: 'Chua co ket qua phu cap san luong.', loading: 'Dang tai...',
    rowHint: 'Chon mot dong de xem chi tiet theo nhan vien va cong doan.',
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
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [deletingMonth, setDeletingMonth] = useState('');

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
      const nextSnapshotsByMonth = new Map(
        nextSnapshots.map((snapshot) => [String(snapshot?.month || ''), snapshot])
      );
      const latestCalculableMonth = nextAvailableMonths.find((month) => {
        const snapshot = nextSnapshotsByMonth.get(month);
        return month === nextCurrentMonth || !snapshot || snapshot.isProvisional;
      });

      setSnapshots(nextSnapshots);
      setCalendar(calendarPayload || null);
      setSelectedMonth(
        (previous) => previous || latestCalculableMonth || nextAvailableMonths[0] || nextCurrentMonth
      );
    } catch (error) {
      setSnapshots([]);
      showNotification(error?.message || resolveText(languageCode, 'fetchError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, languageCode, showNotification]);

  useEffect(() => { load(); }, [load]);

  const currentMonthKey = String(calendar?.currentMonthKey || '');
  const managementStartMonthKey = String(calendar?.managementStartMonthKey || '');
  const availableMonthKeys = Array.isArray(calendar?.availableMonthKeys) ? calendar.availableMonthKeys : [];
  const snapshotsByMonth = useMemo(
    () => new Map(snapshots.map((snapshot) => [String(snapshot?.month || ''), snapshot])),
    [snapshots]
  );
  const hasSourceData = availableMonthKeys.includes(selectedMonth);
  const isCurrentMonth = Boolean(currentMonthKey && selectedMonth === currentMonthKey);
  const selectedSnapshot = snapshotsByMonth.get(selectedMonth) || null;
  const alreadyCalculated = Boolean(selectedSnapshot && !selectedSnapshot.isProvisional);
  const canCalculate = Boolean(
    selectedMonth && hasSourceData && (isCurrentMonth || !alreadyCalculated) && !loading && !calculating
  );

  const handleCalculate = async () => {
    if (!canCalculate) {
      showNotification(
        alreadyCalculated && !isCurrentMonth
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
      showNotification(resolveText(languageCode, 'calculateSuccess', { month: selectedMonth }), 'success');
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'calculateError'), 'error');
    } finally {
      setCalculating(false);
    }
  };

  const handleDeleteSnapshot = async (snapshot) => {
    const month = String(snapshot?.month || '');
    if (!month || !window.confirm(resolveText(languageCode, 'deleteConfirm', { month }))) return;
    setDeletingMonth(month);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON(`/payroll/snapshots/${month}` + query, { method: 'DELETE' });
      await load();
      showNotification(resolveText(languageCode, 'deleteSuccess', { month }), 'success');
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'deleteError'), 'error');
    } finally {
      setDeletingMonth('');
    }
  };

  const locale = languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US';

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
            inputProps={{ min: managementStartMonthKey || undefined, max: currentMonthKey || undefined }}
          />
          <Button
            variant="contained" startIcon={<CalculateIcon />}
            disabled={!canCalculate} onClick={handleCalculate}
          >
            {calculating
              ? resolveText(languageCode, 'calculating')
              : resolveText(languageCode, isCurrentMonth && selectedSnapshot ? 'recalculate' : 'calculate')}
          </Button>
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
                <TableCell sx={{ fontWeight: 700 }}>{text.month}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{text.employees}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{text.total}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{text.savedBy}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{text.savedAt}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">{text.status}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">{text.delete}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {loading ? <TableStatusRow colSpan={7} message={resolveText(languageCode, 'loading')} />
                  : snapshots.length === 0 ? <TableStatusRow colSpan={7} message={resolveText(languageCode, 'empty')} />
                    : snapshots.map((snapshot) => {
                      const employees = Array.isArray(snapshot.data) ? snapshot.data : [];
                      const total = employees.reduce(
                        (sum, employee) => sum + Number(employee.productionAllowance ?? employee.productionEarnings ?? 0), 0
                      );
                      const provisional = Boolean(snapshot.isProvisional);
                      return (
                        <TableRow
                          key={snapshot.id} hover sx={{ cursor: 'pointer' }}
                          onClick={() => navigateToPath(`/payroll/${snapshot.month}`, { label: `${text.title} ${snapshot.month}` })}
                        >
                          <TableCell sx={{ fontWeight: 600 }}>{snapshot.month}</TableCell>
                          <TableCell align="right">{employees.length}{text.peopleSuffix}</TableCell>
                          <TableCell align="right">{formatDong(total)}</TableCell>
                          <TableCell>{snapshot.lockedBy || '-'}</TableCell>
                          <TableCell>{snapshot.lockedAt ? new Date(snapshot.lockedAt).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' }) : '-'}</TableCell>
                          <TableCell align="center"><Chip size="small" color={provisional ? 'warning' : 'success'} label={resolveText(languageCode, provisional ? 'current' : 'confirmed')} variant="outlined" /></TableCell>
                          <TableCell align="center">
                            <DeleteActionButton
                              stopPropagation disabled={Boolean(deletingMonth)} title={text.delete}
                              onClick={() => handleDeleteSnapshot(snapshot)}
                            />
                          </TableCell>
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
