import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  MenuItem,
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
import LockToggleSwitch from '../../../components/LockToggleSwitch';
import PageToolbar from '../../../components/PageToolbar';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { WORKSPACE_DATA_TOPICS } from '../../../utils/workspaceDataEvents';

const TEXT = {
  ko: {
    calculateMonth: '계산 월', calculate: '계산', recalculate: '현재까지 다시 계산', calculating: '계산 중...',
    noData: '선택한 월에 계산할 작업기록이 없습니다.', alreadyCalculated: '이미 계산이 완료된 월입니다.',
    calculateSuccess: '{month} 생산수당을 계산했습니다.', fetchError: '생산수당 내역을 불러오지 못했습니다.',
    calculateError: '생산수당 계산에 실패했습니다.', deleteConfirm: '{month} 생산수당 계산 내역을 삭제하시겠습니까?',
    deleteSuccess: '{month} 생산수당 계산 내역을 삭제했습니다.', deleteError: '생산수당 계산 내역 삭제에 실패했습니다.',
    current: '진행 중', confirmed: '확정', empty: '계산된 생산수당 내역이 없습니다.', loading: '불러오는 중...',
    notCalculated: '미계산',
    rowHint: '월별 계산본을 선택하면 공장·라인·직원·공정별 상세 내역을 확인할 수 있습니다.',
    monthReady: '선택 월 계산 가능', monthIncomplete: '선택 월 자료 미완료', actions: '관리', lock: '잠금', unlockBeforeDelete: '잠금을 해제한 뒤 삭제할 수 있습니다.',
    factory: '공장', line: '라인', workCoverage: '작업기록', attendanceCoverage: '출퇴근 기록(참고)',
    averageProductionAllowance: '평균 생산수당',
    appliedRate: '적용 초당 단가',
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
    notCalculated: 'Not Calculated',
    rowHint: 'Select a monthly result to view factory, line, employee, and process details.',
    monthReady: 'Selected month is ready', monthIncomplete: 'Selected month data is incomplete', actions: 'Actions', lock: 'Lock', unlockBeforeDelete: 'Unlock this month before deleting it.',
    factory: 'Factory', line: 'Line', workCoverage: 'Work Records', attendanceCoverage: 'Attendance (Reference)',
    averageProductionAllowance: 'Average Production Allowance',
    appliedRate: 'Applied Rate / sec',
    basisErrors: 'Basis Errors',
    ready: 'Ready', incomplete: 'Incomplete', noLines: 'No factory or line has production allowance employees.',
    needsRecalculation: 'Recalculation Required', recalculateConfirmed: 'Recalculate',
    unlock: 'Unlock', unlocking: 'Unlocking...', unlockConfirm: 'Unlock the {month} production allowance result?',
    unlockSuccess: 'Unlocked the {month} production allowance result.', unlockError: 'Failed to unlock the production allowance result.', deleting: 'Deleting...',
  },
  vi: {
    calculateMonth: 'Thang tinh', calculate: 'Tinh', recalculate: 'Tinh lai den hien tai', calculating: 'Dang tinh...',
    noData: 'Không có du lieu cong viec de tinh trong thang da chon.', alreadyCalculated: 'Thang nay da duoc tinh.',
    calculateSuccess: 'Da tinh phu cap san luong thang {month}.', fetchError: 'Không thể tai ket qua phu cap san luong.',
    calculateError: 'Không thể tinh phu cap san luong.', deleteConfirm: 'Xóa ket qua phu cap san luong thang {month}?',
    deleteSuccess: 'Đã xóa ket qua phu cap san luong thang {month}.', deleteError: 'Không thể xoa ket qua phu cap san luong.',
    current: 'Đang tiến hành', confirmed: 'Đã xác nhận', empty: 'Chưa có ket qua phu cap san luong.', loading: 'Đang tải...',
    notCalculated: 'Chua tinh',
    rowHint: 'Chon ket qua theo thang de xem chi tiet nha may, chuyen, nhan vien va cong doan.',
    monthReady: 'Thang da chon san sang', monthIncomplete: 'Dữ liệu thang chua day du', actions: 'Quản lý', lock: 'Khoa', unlockBeforeDelete: 'Mở khóa thang nay truoc khi xoa.',
    factory: 'Nhà máy', line: 'Chuyền', workCoverage: 'Dữ liệu san xuat', attendanceCoverage: 'Cham cong (tham khao)',
    averageProductionAllowance: 'Phụ cấp san luong trung binh',
    appliedRate: 'Đơn giá ap dung/giay',
    basisErrors: 'Loi du lieu tinh',
    ready: 'Co the tinh', incomplete: 'Chưa đủ du lieu', noLines: 'Không có nha may hoac chuyen co nhan vien tinh phu cap san luong.',
    needsRecalculation: 'Can tinh lai', recalculateConfirmed: 'Tinh lai',
    unlock: 'Mở khóa', unlocking: 'Dang mo khoa...', unlockConfirm: 'Mở khóa ket qua phu cap san luong thang {month}?',
    unlockSuccess: 'Da mo khoa ket qua phu cap san luong thang {month}.', unlockError: 'Không thể mo khoa ket qua phu cap san luong.', deleting: 'Dang xoa...',
  },
};

const resolveText = (languageCode, key, replacements = {}) => {
  const bundle = TEXT[languageCode] || TEXT.en;
  return Object.entries(replacements).reduce(
    (value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)),
    bundle[key] || TEXT.en[key] || key
  );
};

const payrollAmountSummary = (employees) => {
  const totals = new Map();
  employees.forEach((employee) => {
    const currency = String(employee?.currencyCode || 'VND').toUpperCase();
    totals.set(currency, (totals.get(currency) || 0) + Number(employee?.grossSalary || 0));
  });
  return Array.from(totals.entries()).sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => `${amount.toLocaleString()} ${currency}`).join(' / ');
};

const PayrollBoard = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const [snapshots, setSnapshots] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [readinessByMonth, setReadinessByMonth] = useState({});
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [mutating, setMutating] = useState('');
  const [employeeDirectory, setEmployeeDirectory] = useState([]);

  const text = useMemo(() => ({
    title: getUiMessage('menu.payroll', 'Payroll', languageCode),
    month: getUiMessage('payrollBoard.month', 'Settlement Month', languageCode),
    employees: getUiMessage('payrollBoard.employees', 'Employees', languageCode),
    total: getUiMessage('payrollBoard.total', 'Production Allowance Subtotal', languageCode),
    status: getUiMessage('payrollBoard.status', 'Status', languageCode),
    delete: getUiMessage('payrollBoard.delete', 'Delete', languageCode),
    peopleSuffix: getUiMessage('payrollBoard.peopleSuffix', '', languageCode),
  }), [languageCode]);
  const payrollStatusText = languageCode === 'ko'
    ? { notCalculated: '\uBBF8\uACC4\uC0B0', recalculationRequired: '\uC7AC\uACC4\uC0B0 \uD544\uC694', calculated: '\uACC4\uC0B0 \uC644\uB8CC' }
    : languageCode === 'vi'
      ? { notCalculated: 'Chua tinh', recalculationRequired: 'Can tinh lai', calculated: 'Da tinh xong' }
      : { notCalculated: 'Not Calculated', recalculationRequired: 'Recalculation Required', calculated: 'Calculated' };
  const payrollSummaryText = languageCode === 'ko'
    ? { people: '\uCD1D\uC6D0 (\uC77C\uBC18/\uC0DD\uC0B0)', generalPayroll: '\uC77C\uBC18 \uAE09\uC5EC', outputPayroll: '\uC0DD\uC0B0 \uAE09\uC5EC', totalPayroll: '\uCD1D \uAE09\uC5EC', lock: '\uC7A0\uAE08', pending: '\uBBF8\uACC4\uC0B0' }
    : languageCode === 'vi'
      ? { people: 'Tong (Thuong/San luong)', generalPayroll: 'Luong thuong', outputPayroll: 'Luong san luong', totalPayroll: 'Tong luong', lock: 'Khoa', pending: 'Chua tinh' }
      : { people: 'Total (General/Production)', generalPayroll: 'General Payroll', outputPayroll: 'Production Payroll', totalPayroll: 'Total Payroll', lock: 'Lock', pending: 'Not calculated' };
  const activeEmployees = useMemo(() => employeeDirectory.filter((employee) => !['PENDING', 'REJECTED', 'TERMINATED'].includes(String(employee?.status || '').toUpperCase())), [employeeDirectory]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!activeOrgId) return;
    if (!silent) setLoading(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      const [snapshotRows, calendarPayload, employeeRows] = await Promise.all([
        requestJSON('/payroll/snapshots' + query, { forceRefresh: true, skipGlobalLoading: silent }),
        requestJSON('/payroll/calendar' + query, { forceRefresh: true, skipGlobalLoading: true }),
        requestJSON('/employees' + query, { forceRefresh: true, skipGlobalLoading: true }),
      ]);
      const nextSnapshots = Array.isArray(snapshotRows) ? snapshotRows : [];
      const nextAvailableMonths = Array.isArray(calendarPayload?.availableMonthKeys)
        ? calendarPayload.availableMonthKeys
        : [];
      const latestCompletedMonth = String(calendarPayload?.latestCompletedMonthKey || '');
      const completedAvailableMonths = nextAvailableMonths.filter(
        (month) => !latestCompletedMonth || month <= latestCompletedMonth
      );
      const readinessRows = await Promise.all(
        completedAvailableMonths.map(async (month) => [
          month,
          await requestJSON(
            '/payroll/readiness' + buildQueryString({ orgId: activeOrgId, month }),
            { forceRefresh: true, skipGlobalLoading: true }
          ).catch((error) => ({ month, completedMonth: true, ready: false, groups: [], error: error?.message || 'Failed to check payroll readiness.' })),
        ])
      );

      setSnapshots(nextSnapshots);
      setEmployeeDirectory(Array.isArray(employeeRows) ? employeeRows : []);
      setCalendar(calendarPayload || null);
      setReadinessByMonth(Object.fromEntries(readinessRows));
    } catch (error) {
      if (!silent) setSnapshots([]);
      showNotification(error?.message || resolveText(languageCode, 'fetchError'), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeOrgId, languageCode, showNotification]);

  useEffect(() => { load(); }, [load]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [
      WORKSPACE_DATA_TOPICS.PRODUCTION_ALLOWANCE_SETTINGS,
      WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS,
    ],
    onRefresh: () => load({ silent: true }),
  });

  const latestCompletedMonthKey = String(calendar?.latestCompletedMonthKey || '');
  const snapshotsByMonth = useMemo(
    () => new Map(snapshots.map((snapshot) => [String(snapshot?.month || ''), snapshot])),
    [snapshots]
  );
  const monthRows = useMemo(() => {
    const months = new Set([
      ...(Array.isArray(calendar?.availableMonthKeys) ? calendar.availableMonthKeys : []),
      ...snapshots.map((snapshot) => String(snapshot?.month || '')).filter(Boolean),
    ]);
    return Array.from(months)
      .filter((month) => !latestCompletedMonthKey || month <= latestCompletedMonthKey)
      .sort((left, right) => right.localeCompare(left))
      .map((month) => ({ month, snapshot: snapshotsByMonth.get(month) || null }));
  }, [calendar?.availableMonthKeys, latestCompletedMonthKey, snapshots, snapshotsByMonth]);
  const filteredMonthRows = useMemo(
    () => selectedMonth
      ? monthRows.filter(({ month }) => month === selectedMonth)
      : monthRows,
    [monthRows, selectedMonth]
  );
  const batchTargetMonths = useMemo(
    () => monthRows
      .filter(({ month, snapshot }) => {
        const monthReadiness = readinessByMonth[month];
        const selected = !selectedMonth || month === selectedMonth;
        const unlocked = !snapshot || snapshot.isProvisional === true;
        const calculable = snapshot ? snapshot.isProvisional === true : monthReadiness?.ready === true;
        return Boolean(selected && unlocked && calculable);
      })
      .map(({ month }) => month)
      .sort((left, right) => left.localeCompare(right)),
    [monthRows, readinessByMonth, selectedMonth]
  );
  const canCalculate = batchTargetMonths.length > 0 && !loading && !calculating;
  const allMonthsLabel = languageCode === 'ko'
    ? '전체'
    : languageCode === 'vi'
      ? 'Tất cả'
      : 'All';

  const handleCalculate = async () => {
    const targetMonths = batchTargetMonths;
    if (targetMonths.length === 0) return;
    setCalculating(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      const failed = [];
      for (const month of targetMonths) {
        try {
          await requestJSON('/payroll/snapshots' + query, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ month, savedBy: activeProfile?.email || activeProfile?.name || 'administrator' }),
          });
        } catch (error) {
          failed.push({ month, message: error?.message || resolveText(languageCode, 'calculateError') });
        }
      }
      await load();
      if (failed.length > 0) {
        showNotification(`${failed.map((row) => row.month).join(', ')}: ${failed[0].message}`, 'error');
        return;
      }
      showNotification(
        resolveText(languageCode, 'calculateSuccess', { month: targetMonths.join(', ') }),
        'success'
      );
    } catch (error) {
      await load();
      showNotification(error?.message || resolveText(languageCode, 'calculateError'), 'error');
    } finally {
      setCalculating(false);
    }
  };

  const handleLockToggle = async (snapshot, checked) => {
    const month = String(snapshot?.month || '');
    if (!month) return;
    const mutationKey = `lock:${month}`;
    setMutating(mutationKey);
    try {
      if (checked) {
        const updatedSnapshot = await requestJSON(`/payroll/snapshots/${month}/lock` + buildQueryString({ orgId: activeOrgId }), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lockedBy: activeProfile?.email || activeProfile?.name || 'administrator' }),
        });
        setSnapshots((previous) => previous.map((row) =>
          String(row?.month || '') === month ? { ...row, ...updatedSnapshot } : row
        ));
        await load({ silent: true });
      } else {
        await handleUnlock(month);
      }
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'calculateError'), 'error');
    } finally {
      setMutating('');
    }
  };

  const handleUnlock = async (month) => {
    const snapshot = snapshotsByMonth.get(month);
    if (!snapshot || snapshot.isProvisional) return;
    if (!window.confirm(resolveText(languageCode, 'unlockConfirm', { month }))) return;
    setMutating(`lock:${month}`);
    try {
      const updatedSnapshot = await requestJSON(`/payroll/snapshots/${month}/unlock` + buildQueryString({ orgId: activeOrgId }), {
        method: 'POST',
      });
      setSnapshots((previous) => previous.map((row) =>
        String(row?.month || '') === month ? { ...row, ...updatedSnapshot } : row
      ));
      await load({ silent: true });
      showNotification(resolveText(languageCode, 'unlockSuccess', { month }), 'success');
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'unlockError'), 'error');
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
            select
            label={resolveText(languageCode, 'calculateMonth')}
            size="small"
            value={selectedMonth}
            onChange={(event) => setSelectedMonth(event.target.value)}
            SelectProps={{ renderValue: (value) => value || allMonthsLabel }}
            sx={{ minWidth: 150 }}
          >
            <MenuItem value="">{allMonthsLabel}</MenuItem>
            {monthRows.map(({ month }) => (
              <MenuItem key={month} value={month}>{month}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained" startIcon={<CalculateIcon />}
            disabled={!canCalculate} onClick={handleCalculate}
          >
            {calculating
              ? resolveText(languageCode, 'calculating')
              : languageCode === 'ko' ? `일괄 계산 (${batchTargetMonths.length})`
                : languageCode === 'vi' ? `Tính hàng loạt (${batchTargetMonths.length})`
                  : `Calculate All (${batchTargetMonths.length})`}
          </Button>
        </Stack>
      )} />}
    >
      <Box sx={{ width: '100%' }}>
        <Box sx={{ mb: 1, color: 'text.secondary', fontSize: 13 }}>
          {languageCode === 'ko' ? '\uC6D4\uBCC4\uB85C \uC804\uCCB4 \uC9C1\uC6D0\uC758 \uAE09\uC5EC\uB97C \uACC4\uC0B0\uD558\uACE0 \uD655\uC815\uD569\uB2C8\uB2E4.' : languageCode === 'vi' ? 'Tinh va xac nhan luong cua tat ca nhan vien theo thang.' : 'Calculate and confirm payroll for all employees by month.'}
        </Box>
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead><TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{text.month}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.people}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.generalPayroll}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.outputPayroll}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.totalPayroll}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">{text.status}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">{payrollSummaryText.lock}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {loading ? <TableStatusRow colSpan={7} message={resolveText(languageCode, 'loading')} />
                  : filteredMonthRows.length === 0 ? <TableStatusRow colSpan={7} message={resolveText(languageCode, 'empty')} />
                    : filteredMonthRows.map(({ month, snapshot }) => {
                      const groups = readinessByMonth[month]?.groups || [];
                      const rowNeedsRecalculation = Boolean(snapshot && readinessByMonth[month]?.needsRecalculation);
                      const invalidAttendanceCount = Array.isArray(readinessByMonth[month]?.invalidPayrollAttendance)
                        ? readinessByMonth[month].invalidPayrollAttendance.length : 0;
                      const snapshotEmployees = Array.isArray(snapshot?.data) ? snapshot.data : [];
                      const summaryEmployees = snapshot ? snapshotEmployees : activeEmployees;
                      const generalEmployees = summaryEmployees.filter((employee) => !['OUTPUT', 'CT'].includes(String(employee?.payType || '').toUpperCase()));
                      const outputEmployees = summaryEmployees.filter((employee) => ['OUTPUT', 'CT'].includes(String(employee?.payType || '').toUpperCase()));
                      const generalPayroll = payrollAmountSummary(generalEmployees);
                      const outputPayroll = payrollAmountSummary(outputEmployees);
                      const totalPayroll = payrollAmountSummary(summaryEmployees);
                      return (
                        <TableRow
                          key={month} hover sx={{ cursor: snapshot ? 'pointer' : 'default' }}
                          onClick={() => snapshot && navigateToPath(`/payroll/${month}`, { label: `${text.title} ${month}` })}
                        >
                          <TableCell sx={{ fontWeight: 700 }}>{month}</TableCell>
                          <TableCell align="right">{summaryEmployees.length} ({generalEmployees.length}/{outputEmployees.length}){text.peopleSuffix}</TableCell>
                          <TableCell align="right" sx={{ color: snapshot ? 'text.primary' : 'text.secondary' }}>{snapshot ? generalPayroll || '-' : payrollSummaryText.pending}</TableCell>
                          <TableCell align="right" sx={{ color: snapshot ? 'text.primary' : 'text.secondary' }}>{snapshot ? outputPayroll || '-' : payrollSummaryText.pending}</TableCell>
                          <TableCell align="right" sx={{ color: snapshot ? 'text.primary' : 'text.secondary', fontWeight: 700 }}>{snapshot ? totalPayroll || '-' : payrollSummaryText.pending}</TableCell>
                          <TableCell align="center">
                            <Stack direction="row" spacing={0.75} justifyContent="center" alignItems="center">
                              <Chip
                                size="small"
                                color={invalidAttendanceCount > 0 ? 'error' : !snapshot ? 'default' : rowNeedsRecalculation ? 'warning' : 'success'}
                                label={invalidAttendanceCount > 0
                                  ? (languageCode === 'ko' ? `출퇴근 공장 오류 ${invalidAttendanceCount}건` : languageCode === 'vi' ? `Lỗi nhà máy chấm công ${invalidAttendanceCount}` : `Attendance factory errors: ${invalidAttendanceCount}`)
                                  : !snapshot ? payrollStatusText.notCalculated : rowNeedsRecalculation ? payrollStatusText.recalculationRequired : payrollStatusText.calculated}
                                variant="outlined"
                              />
                            </Stack>
                          </TableCell>
                          <TableCell align="center">
                            <LockToggleSwitch
                              checked={Boolean(snapshot && !snapshot.isProvisional)}
                              disabled={!snapshot || Boolean(mutating) || calculating}
                              stopPropagation
                              onChange={(_event, checked) => handleLockToggle(snapshot, checked)}
                              ariaLabel={`${resolveText(languageCode, 'lock')} ${month}`}
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
