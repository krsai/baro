import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  Typography,
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
    calculateSuccess: '{month} 급여를 계산했습니다.', fetchError: '급여 계산 내역을 불러오지 못했습니다.',
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
    calculateSuccess: 'Calculated payroll for {month}.', fetchError: 'Failed to load payroll records.',
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
    calculateSuccess: 'Đã tính lương cho {month}.', fetchError: 'Không thể tải dữ liệu tính lương.',
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

const resolveFactoryDisplayName = (factory, languageCode) => {
  if (!factory) return '';
  if (languageCode === 'ko') return factory.nameKo || factory.name || '';
  if (languageCode === 'vi') return factory.nameVi || factory.name || '';
  return factory.name || factory.nameKo || factory.nameVi || '';
};

const rowKey = (month, factoryId) => `${month}:${factoryId}`;

const PayrollBoard = () => {
  const { navigateToPath, showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const [snapshots, setSnapshots] = useState([]);
  const [calendar, setCalendar] = useState(null);
  const [readinessByKey, setReadinessByKey] = useState({});
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [mutating, setMutating] = useState('');
  const [employeeDirectory, setEmployeeDirectory] = useState([]);
  const [calculationErrors, setCalculationErrors] = useState(null);
  const [manuallyRecalculatedRows, setManuallyRecalculatedRows] = useState(() => new Set());

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
    ? { notCalculated: '미계산', recalculationRequired: '재계산 필요', calculated: '계산 완료' }
    : languageCode === 'vi'
      ? { notCalculated: 'Chua tinh', recalculationRequired: 'Can tinh lai', calculated: 'Da tinh xong' }
      : { notCalculated: 'Not Calculated', recalculationRequired: 'Recalculation Required', calculated: 'Calculated' };
  const payrollSummaryText = languageCode === 'ko'
    ? { people: '총원 (사무고정/생산고정/생산변동)', generalPayroll: '사무(고정) 급여', fixedOutputPayroll: '생산(고정) 급여', outputPayroll: '생산(변동) 급여', totalPayroll: '총 급여', lock: '잠금', pending: '미계산' }
    : languageCode === 'vi'
      ? { people: 'Tổng (VP cố định/SX cố định/SX biến đổi)', generalPayroll: 'Lương VP cố định', fixedOutputPayroll: 'Lương SX cố định', outputPayroll: 'Lương SX biến đổi', totalPayroll: 'Tổng lương', lock: 'Khóa', pending: 'Chưa tính' }
      : { people: 'Total (Office Fixed/Production Fixed/Production Variable)', generalPayroll: 'Office (Fixed)', fixedOutputPayroll: 'Production (Fixed)', outputPayroll: 'Production (Variable)', totalPayroll: 'Total Payroll', lock: 'Lock', pending: 'Not calculated' };
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
      const nextFactories = Array.isArray(calendarPayload?.factories) ? calendarPayload.factories : [];
      const latestCompletedMonth = String(calendarPayload?.latestCompletedMonthKey || '');
      const completedAvailableMonths = nextAvailableMonths.filter(
        (month) => !latestCompletedMonth || month <= latestCompletedMonth
      );
      const readinessEntries = await Promise.all(
        completedAvailableMonths.flatMap((month) =>
          nextFactories.map(async (factory) => {
            const key = rowKey(month, factory.id);
            try {
              const readiness = await requestJSON(
                '/payroll/readiness' + buildQueryString({ orgId: activeOrgId, month, factoryId: factory.id }),
                { forceRefresh: true, skipGlobalLoading: true }
              );
              return [key, readiness];
            } catch (error) {
              return [key, {
                month,
                factoryId: factory.id,
                completedMonth: true,
                ready: false,
                groups: [],
                error: error?.message || 'Failed to check payroll readiness.',
              }];
            }
          })
        )
      );

      setSnapshots(nextSnapshots);
      setEmployeeDirectory(Array.isArray(employeeRows) ? employeeRows : []);
      setCalendar(calendarPayload || null);
      setReadinessByKey(Object.fromEntries(readinessEntries));
    } catch (error) {
      if (!silent) setSnapshots([]);
      showNotification(error?.message || resolveText(languageCode, 'fetchError'), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeOrgId, languageCode, showNotification]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setManuallyRecalculatedRows(new Set()); }, [activeOrgId]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [
      WORKSPACE_DATA_TOPICS.PRODUCTION_ALLOWANCE_SETTINGS,
      WORKSPACE_DATA_TOPICS.SALARY_SYSTEM_SETTINGS,
    ],
    onRefresh: () => load({ silent: true }),
  });

  const latestCompletedMonthKey = String(calendar?.latestCompletedMonthKey || '');
  const factories = useMemo(() => Array.isArray(calendar?.factories) ? calendar.factories : [], [calendar?.factories]);
  const snapshotsByKey = useMemo(
    () => new Map(snapshots.map((snapshot) => [rowKey(String(snapshot?.month || ''), Number(snapshot?.factoryId)), snapshot])),
    [snapshots]
  );
  const monthFactoryRows = useMemo(() => {
    if (factories.length === 0) return [];
    const months = new Set([
      ...(Array.isArray(calendar?.availableMonthKeys) ? calendar.availableMonthKeys : []),
      ...snapshots.map((snapshot) => String(snapshot?.month || '')).filter(Boolean),
    ]);
    const rows = [];
    for (const month of months) {
      if (latestCompletedMonthKey && month > latestCompletedMonthKey) continue;
      for (const factory of factories) {
        const key = rowKey(month, factory.id);
        const snapshot = snapshotsByKey.get(key) || null;
        const readiness = readinessByKey[key];
        if (!snapshot && readiness?.ready !== true) continue;
        rows.push({ month, factory, snapshot });
      }
    }
    return rows.sort((a, b) => {
      if (a.month !== b.month) return b.month.localeCompare(a.month);
      return Number(a.factory.id) - Number(b.factory.id);
    });
  }, [calendar?.availableMonthKeys, factories, latestCompletedMonthKey, readinessByKey, snapshots, snapshotsByKey]);
  const filteredMonthFactoryRows = useMemo(
    () => selectedMonth
      ? monthFactoryRows.filter((row) => row.month === selectedMonth)
      : monthFactoryRows,
    [monthFactoryRows, selectedMonth]
  );
  const batchTargetRows = useMemo(
    () => monthFactoryRows
      .filter((row) => {
        const key = rowKey(row.month, row.factory.id);
        const monthReadiness = readinessByKey[key];
        const selected = !selectedMonth || row.month === selectedMonth;
        const unlocked = !row.snapshot || row.snapshot.isProvisional === true;
        const calculable = row.snapshot
          ? row.snapshot.isProvisional === true && (
              monthReadiness?.needsRecalculation === true || !manuallyRecalculatedRows.has(key)
            )
          : monthReadiness?.ready === true;
        return Boolean(selected && unlocked && calculable);
      })
      .sort((a, b) => a.month.localeCompare(b.month) || Number(a.factory.id) - Number(b.factory.id)),
    [manuallyRecalculatedRows, monthFactoryRows, readinessByKey, selectedMonth]
  );
  const canCalculate = batchTargetRows.length > 0 && !loading && !calculating;
  const explainCalculationError = useCallback((message) => {
    const raw = String(message || '');
    let match = raw.match(/employee (\d+) has no payroll factory/i);
    if (match) {
      const employee = employeeDirectory.find((row) => Number(row?.id) === Number(match[1]));
      const name = employee?.name || `직원 #${match[1]}`;
      return `${name}에게 소속 공장이 지정되어 있지 않습니다. 조직 관리 > 직원에서 해당 직원의 공장을 지정해 주세요.`;
    }
    match = raw.match(/factory (\d+) has no salary system version for ([0-9-]+)/i);
    if (match) return `공장 #${match[1]}에 ${match[2]}월에 적용되는 급여 체계 버전이 없습니다. 급여 체계 > 버전 관리에서 적용 구간을 지정해 주세요.`;
    match = raw.match(/salary rate is missing for employee (\d+), item (.+)/i);
    if (match) {
      const employee = employeeDirectory.find((row) => Number(row?.id) === Number(match[1]));
      return `${employee?.name || `직원 #${match[1]}`}의 급여 항목 '${match[2]}' 단가가 없습니다. 급여 체계에서 해당 급여 타입과 직급의 단가를 입력해 주세요.`;
    }
    if (/attendance records must belong/i.test(raw) || /attendance in multiple factories/i.test(raw)) return '직원의 출퇴근 기록이 소속 공장과 일치하지 않습니다. 출퇴근 기록을 확인해 한 직원의 기록이 올바른 공장 한 곳에만 있도록 수정해 주세요.';
    if (/salary system version .* is invalid/i.test(raw)) return '적용 중인 급여 체계 버전의 항목 또는 단가 정보가 손상되었습니다. 급여 체계를 새 버전으로 저장하고 적용 구간을 지정해 주세요.';
    if (/attendance and work records are incomplete/i.test(raw)) return '해당 월의 필수 출퇴근 기록 또는 생산 작업 기록이 모두 입력되지 않았습니다.';
    return raw || '알 수 없는 오류가 발생했습니다. 입력 자료와 급여 체계 설정을 확인해 주세요.';
  }, [employeeDirectory]);
  const allMonthsLabel = languageCode === 'ko'
    ? '전체'
    : languageCode === 'vi'
      ? 'Tất cả'
      : 'All';

  const handleCalculate = async () => {
    const targetRows = batchTargetRows;
    if (targetRows.length === 0) return;
    setCalculating(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      const failed = [];
      const succeeded = [];
      for (const row of targetRows) {
        const key = rowKey(row.month, row.factory.id);
        const factoryLabel = resolveFactoryDisplayName(row.factory, languageCode);
        try {
          await requestJSON('/payroll/snapshots' + query, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              month: row.month,
              factoryId: row.factory.id,
              savedBy: activeProfile?.email || activeProfile?.name || 'administrator',
            }),
          });
          succeeded.push(`${row.month} (${factoryLabel})`);
          setManuallyRecalculatedRows((previous) => new Set([...previous, key]));
        } catch (error) {
          failed.push({ month: row.month, factoryLabel, message: error?.message || resolveText(languageCode, 'calculateError') });
        }
      }
      await load();
      if (failed.length > 0) {
        setCalculationErrors({ failed, succeeded });
        return;
      }
      showNotification(
        resolveText(languageCode, 'calculateSuccess', { month: succeeded.join(', ') }),
        'success'
      );
    } catch (error) {
      await load();
      showNotification(error?.message || resolveText(languageCode, 'calculateError'), 'error');
    } finally {
      setCalculating(false);
    }
  };

  const handleLockToggle = async (row, checked) => {
    const { month, factory, snapshot } = row;
    if (!month || !factory?.id) return;
    const mutationKey = `lock:${rowKey(month, factory.id)}`;
    setMutating(mutationKey);
    try {
      if (checked) {
        const updatedSnapshot = await requestJSON(
          `/payroll/snapshots/${month}/lock` + buildQueryString({ orgId: activeOrgId, factoryId: factory.id }),
          {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ factoryId: factory.id, lockedBy: activeProfile?.email || activeProfile?.name || 'administrator' }),
          }
        );
        setSnapshots((previous) => previous.map((row2) =>
          String(row2?.month || '') === month && Number(row2?.factoryId) === Number(factory.id)
            ? { ...row2, ...updatedSnapshot }
            : row2
        ));
        await load({ silent: true });
      } else {
        await handleUnlock(month, factory, snapshot);
      }
    } catch (error) {
      showNotification(error?.message || resolveText(languageCode, 'calculateError'), 'error');
    } finally {
      setMutating('');
    }
  };

  const handleUnlock = async (month, factory, snapshot) => {
    if (!snapshot || snapshot.isProvisional) return;
    if (!window.confirm(resolveText(languageCode, 'unlockConfirm', { month }))) return;
    setMutating(`lock:${rowKey(month, factory.id)}`);
    try {
      const updatedSnapshot = await requestJSON(
        `/payroll/snapshots/${month}/unlock` + buildQueryString({ orgId: activeOrgId, factoryId: factory.id }),
        { method: 'POST' }
      );
      setSnapshots((previous) => previous.map((row2) =>
        String(row2?.month || '') === month && Number(row2?.factoryId) === Number(factory.id)
          ? { ...row2, ...updatedSnapshot }
          : row2
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
            {Array.from(new Set(monthFactoryRows.map((row) => row.month))).map((month) => (
              <MenuItem key={month} value={month}>{month}</MenuItem>
            ))}
          </TextField>
          <Button
            variant="contained" startIcon={<CalculateIcon />}
            disabled={!canCalculate} onClick={handleCalculate}
          >
            {calculating
              ? resolveText(languageCode, 'calculating')
              : languageCode === 'ko' ? `일괄 계산 (${batchTargetRows.length})`
                : languageCode === 'vi' ? `Tính hàng loạt (${batchTargetRows.length})`
                  : `Calculate All (${batchTargetRows.length})`}
          </Button>
        </Stack>
      )} />}
    >
      <Box sx={{ width: '100%' }}>
        <Box sx={{ mb: 1, color: 'text.secondary', fontSize: 13 }}>
          {languageCode === 'ko' ? '월별·공장별로 직원의 급여를 계산하고 확정합니다.' : languageCode === 'vi' ? 'Tinh va xac nhan luong cua tat ca nhan vien theo thang va nha may.' : 'Calculate and confirm payroll for all employees by month and factory.'}
        </Box>
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead><TableRow>
                <TableCell sx={{ fontWeight: 700 }}>{text.month}</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>{resolveText(languageCode, 'factory')}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.people}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.generalPayroll}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.fixedOutputPayroll}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.outputPayroll}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="right">{payrollSummaryText.totalPayroll}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">{text.status}</TableCell>
                <TableCell sx={{ fontWeight: 700 }} align="center">{payrollSummaryText.lock}</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {loading ? <TableStatusRow colSpan={9} message={resolveText(languageCode, 'loading')} />
                  : filteredMonthFactoryRows.length === 0 ? <TableStatusRow colSpan={9} message={resolveText(languageCode, 'empty')} />
                    : filteredMonthFactoryRows.map((row) => {
                      const { month, factory, snapshot } = row;
                      const key = rowKey(month, factory.id);
                      const groups = readinessByKey[key]?.groups || [];
                      const rowNeedsRecalculation = Boolean(snapshot && readinessByKey[key]?.needsRecalculation);
                      const invalidAttendanceCount = Array.isArray(readinessByKey[key]?.invalidPayrollAttendance)
                        ? readinessByKey[key].invalidPayrollAttendance.length : 0;
                      const snapshotEmployees = Array.isArray(snapshot?.data) ? snapshot.data : [];
                      const factoryEmployees = activeEmployees.filter((employee) => Number(employee?.factoryId) === Number(factory.id));
                      const summaryEmployees = snapshot ? snapshotEmployees : factoryEmployees;
                      const generalEmployees = summaryEmployees.filter((employee) => ['GENERAL', 'FIXED'].includes(String(employee?.payType || '').toUpperCase()));
                      const fixedOutputEmployees = summaryEmployees.filter((employee) => String(employee?.payType || '').toUpperCase() === 'OUTPUT_FIXED');
                      const outputEmployees = summaryEmployees.filter((employee) => ['OUTPUT', 'CT'].includes(String(employee?.payType || '').toUpperCase()));
                      const generalPayroll = payrollAmountSummary(generalEmployees);
                      const fixedOutputPayroll = payrollAmountSummary(fixedOutputEmployees);
                      const outputPayroll = payrollAmountSummary(outputEmployees);
                      const totalPayroll = payrollAmountSummary(summaryEmployees);
                      const factoryLabel = resolveFactoryDisplayName(factory, languageCode);
                      return (
                        <TableRow
                          key={key} hover sx={{ cursor: snapshot ? 'pointer' : 'default' }}
                          onClick={() => snapshot && navigateToPath(`/payroll/${month}?factoryId=${factory.id}`, { label: `${text.title} ${month} · ${factoryLabel}` })}
                        >
                          <TableCell sx={{ fontWeight: 700 }}>{month}</TableCell>
                          <TableCell>{factoryLabel || '-'}</TableCell>
                          <TableCell align="right">{summaryEmployees.length} ({generalEmployees.length}/{fixedOutputEmployees.length}/{outputEmployees.length}){text.peopleSuffix}</TableCell>
                          <TableCell align="right" sx={{ color: snapshot ? 'text.primary' : 'text.secondary' }}>{snapshot ? generalPayroll || '-' : payrollSummaryText.pending}</TableCell>
                          <TableCell align="right" sx={{ color: snapshot ? 'text.primary' : 'text.secondary' }}>{snapshot ? fixedOutputPayroll || '-' : payrollSummaryText.pending}</TableCell>
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
                              onChange={(_event, checked) => handleLockToggle(row, checked)}
                              ariaLabel={`${resolveText(languageCode, 'lock')} ${month} ${factoryLabel}`}
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
      <Dialog open={Boolean(calculationErrors)} onClose={() => setCalculationErrors(null)} fullWidth maxWidth="sm">
        <DialogTitle>급여 계산 오류</DialogTitle>
        <DialogContent dividers>
          {calculationErrors?.succeeded?.length > 0 && <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: 'success.50' }}>
            <Typography variant="subtitle2" color="success.dark">계산 완료</Typography>
            <Typography variant="body2">{calculationErrors.succeeded.join(', ')}</Typography>
          </Box>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>아래 문제를 수정한 뒤 해당 월을 다시 계산해 주세요.</Typography>
          <Stack spacing={1.5}>{calculationErrors?.failed?.map((row) => <Box key={`${row.month}:${row.factoryLabel}`} sx={{ p: 2, border: 1, borderColor: 'error.light', borderRadius: 1 }}>
            <Typography variant="subtitle2" color="error.main" sx={{ mb: .5 }}>{row.month} · {row.factoryLabel}</Typography>
            <Typography variant="body2">{explainCalculationError(row.message)}</Typography>
          </Box>)}</Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setCalculationErrors(null)}>확인</Button></DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default PayrollBoard;
