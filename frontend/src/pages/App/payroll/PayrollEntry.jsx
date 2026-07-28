import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import SaveButton from '../../../components/SaveButton';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getPayTypeLabel as getLocalizedPayTypeLabel } from '../../../constants/payType';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { fetchQuantitySettlement } from '../../../utils/quantitySettlementApi';

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), {
    fallback: '0',
    maximumFractionDigits: 0,
  })} 동`;

const formatSeconds = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value)), {
    fallback: '0',
    maximumFractionDigits: 0,
  })}초`;

const formatWagePerSecond = (value) =>
  `${formatNumberWithCommas(Number(value), {
    fallback: '0',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} 동/초`;

const sanitizeMoneyInput = (value) => String(value ?? '').replace(/[^\d]/g, '');

const parseMoneyInput = (value) => {
  const sanitized = sanitizeMoneyInput(value);
  if (!sanitized) return 0;
  const parsed = Number(sanitized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getLocalMonthKey = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getLocalMonthKey();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const normalizePayrollMonthKey = (value) =>
  /^\d{4}-\d{2}$/.test(String(value || '').trim())
    ? String(value).trim()
    : getLocalMonthKey();

const shiftPayrollMonthKey = (value, amount) => {
  const [year, month] = normalizePayrollMonthKey(value).split('-').map((item) => Number(item));
  return getLocalMonthKey(new Date(year, month - 1 + amount, 1));
};

const isPayrollMonthReadyForSave = (value, latestCompletedMonthKey) => {
  const month = String(value || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(latestCompletedMonthKey || '').trim())
    && month <= latestCompletedMonthKey;
};

const formatMoneyInput = (value) => {
  const sanitized = sanitizeMoneyInput(value);
  if (!sanitized) return '';
  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed)) return '';
  return formatNumberWithCommas(parsed, {
    fallback: '0',
    maximumFractionDigits: 0,
  });
};

const toMoneyNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEmployeeKey = (employee, index) => {
  const rawKey = String(employee?.employeeKey || '').trim();
  if (rawKey) return rawKey;
  const workerId = Number(employee?.workerId);
  if (Number.isFinite(workerId) && workerId > 0) return `w-${workerId}`;
  return `n-${index}`;
};

const getPayTypeLabel = (value) =>
  String(value || '').trim().toUpperCase() === 'CT' ? '성과급' : '기본급';

const getOverrideDraftFromEmployee = (employee) => ({
  fixedSalary:
    String(employee?.payType || '').trim().toUpperCase() === 'FIXED' &&
    toMoneyNumber(employee?.fixedSalary) > 0
      ? String(Math.round(toMoneyNumber(employee?.fixedSalary)))
      : '',
  ctAmount:
    String(employee?.payType || '').trim().toUpperCase() === 'CT' &&
    toMoneyNumber(employee?.ctAmount) > 0
      ? String(Math.round(toMoneyNumber(employee?.ctAmount)))
      : '',
  bonus:
    toMoneyNumber(employee?.bonus) > 0
      ? String(Math.round(toMoneyNumber(employee?.bonus)))
      : '',
  deduction:
    toMoneyNumber(employee?.deduction) > 0
      ? String(Math.round(toMoneyNumber(employee?.deduction)))
      : '',
});

const amountFieldSx = {
  minWidth: 132,
  '& input': {
    textAlign: 'right',
  },
};

const PAYROLL_FLOW_TEXT = {
  loadError: {
    ko: '급여 데이터를 불러오지 못했습니다.',
    en: 'Failed to load payroll data.',
    vi: 'Khong the tai du lieu bang luong.',
  },
  monthRequired: {
    ko: '정산 월을 선택하세요.',
    en: 'Select a payroll month.',
    vi: 'Hay chon thang tinh luong.',
  },
  snapshotCreated: {
    ko: '{month} 급여 스냅샷을 생성했습니다.',
    en: 'Created payroll snapshot for {month}.',
    vi: 'Da tao ban chup bang luong cho {month}.',
  },
  snapshotSaved: {
    ko: '{month} 급여 스냅샷을 저장했습니다.',
    en: 'Saved payroll snapshot for {month}.',
    vi: 'Da luu ban chup bang luong cho {month}.',
  },
  monthNotEnded: {
    ko: '해당 월이 끝난 뒤 급여를 계산할 수 있습니다.',
    en: 'Payroll can be calculated after the selected month has ended.',
    vi: 'Chi co the tinh luong sau khi thang da chon ket thuc.',
  },
  settlementIncomplete: {
    ko: '급여 정산 전에 수량 정산에서 검토 필요 또는 차단 항목을 먼저 정리하세요.',
    en: 'Before payroll, clear the review or blocked rows in Quantity Settlement.',
    vi: 'Truoc khi tinh luong, hay xu ly cac dong can xem xet hoac bi chan trong doi chieu so luong.',
  },
  settlementPending: {
    ko: '급여 정산 전에 수량 정산을 완료하세요. 검토 필요 {reviewRows}건, 차단 {blockedRows}건이 남아 있습니다.',
    en: 'Complete Quantity Settlement before payroll. {reviewRows} review rows and {blockedRows} blocked rows still remain.',
    vi: 'Hay hoan tat doi chieu so luong truoc khi tinh luong. Van con {reviewRows} dong can xem xet va {blockedRows} dong bi chan.',
  },
  settlementNoWorkLogs: {
    ko: '이 달 수량 정산 대상이 아직 없습니다. 먼저 작업 기록을 입력하고 수량 정산을 확인하세요.',
    en: 'There are no quantity-settlement rows for this month yet. Enter work logs first, then check Quantity Settlement.',
    vi: 'Thang nay chua co dong doi chieu so luong. Hay nhap ghi chep cong viec truoc, sau do kiem tra doi chieu so luong.',
  },
};

const resolvePayrollText = (node, languageCode, replacements = null) => {
  const template = node?.[languageCode] || node?.ko || node?.en || '';
  if (!replacements) return template;
  return Object.entries(replacements).reduce(
    (message, [key, value]) => message.split(`{${key}}`).join(String(value)),
    template
  );
};

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const { showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const { languageCode } = useLanguage();

  const isNew = !payrollId || payrollId === 'new';
  const monthFromParam = isNew ? null : payrollId;

  const [payMonth, setPayMonth] = useState(
    () => monthFromParam ?? ''
  );
  const [payrollCalendar, setPayrollCalendar] = useState(null);
  const [payrollCalendarLoading, setPayrollCalendarLoading] = useState(isNew);
  const [loading, setLoading] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [payrollData, setPayrollData] = useState(null);
  const [expandedWorkerId, setExpandedWorkerId] = useState(null);
  const [manualOverrides, setManualOverrides] = useState({});
  const [settlementSummary, setSettlementSummary] = useState(null);
  const payrollText = useCallback(
    (key, replacements = null) =>
      resolvePayrollText(PAYROLL_FLOW_TEXT[key], languageCode, replacements),
    [languageCode]
  );

  const handlePayMonthChange = useCallback((nextMonth) => {
    setPayMonth(nextMonth);
    setPayrollData(null);
    setExpandedWorkerId(null);
  }, []);

  useEffect(() => {
    if (!isNew || !activeOrgId) return undefined;
    let cancelled = false;
    const abortController = new AbortController();
    setPayrollCalendarLoading(true);
    requestJSON('/payroll/calendar' + buildQueryString({ orgId: activeOrgId }), {
      forceRefresh: true,
      skipGlobalLoading: true,
      signal: abortController.signal,
    })
      .then((calendar) => {
        if (cancelled) return;
        setPayrollCalendar(calendar);
        setPayMonth(String(calendar?.latestCompletedMonthKey || '').trim());
      })
      .catch((error) => {
        if (cancelled) return;
        setPayrollCalendar(null);
        setPayMonth('');
        showNotification(error?.message || payrollText('loadError'), 'error');
      })
      .finally(() => {
        if (!cancelled) setPayrollCalendarLoading(false);
      });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeOrgId, isNew, payrollText, showNotification]);

  const fetchPayroll = useCallback(
    async (month, options = {}) => {
      const showWorkflowToast = options.showWorkflowToast !== false;
      setLoading(true);
      setPayrollData(null);
      setExpandedWorkerId(null);
      try {
        const query = buildQueryString({ orgId: activeOrgId, month });
        const data = await requestJSON('/payroll' + query);
        setPayrollData(data);
        setPayMonth(data?.month || month);
        try {
          const settlement = await fetchQuantitySettlement({ orgId: activeOrgId, month });
          const summary = settlement?.summary ?? null;
          setSettlementSummary(summary);
          if (showWorkflowToast) {
            const reviewRows = Number(summary?.reviewRows) || 0;
            const blockedRows = Number(summary?.blockedRows) || 0;
            const activeRows = Number(summary?.activeRows) || 0;
            if (reviewRows > 0 || blockedRows > 0) {
              showNotification(
                payrollText('settlementPending', { reviewRows, blockedRows }),
                'warning'
              );
            } else if (activeRows === 0) {
              showNotification(payrollText('settlementNoWorkLogs'), 'info');
            }
          }
        } catch {
          setSettlementSummary(null);
        }
      } catch (error) {
        showNotification(error?.message || payrollText('loadError'), 'error');
      } finally {
        setLoading(false);
      }
    },
    [activeOrgId, payrollText, showNotification]
  );

  useEffect(() => {
    if (!isNew && monthFromParam) {
      fetchPayroll(monthFromParam);
    }
  }, [isNew, monthFromParam, fetchPayroll]);

  useEffect(() => {
    if (!payrollData) {
      setManualOverrides({});
      return;
    }

    const nextOverrides = {};
    const employees = Array.isArray(payrollData?.employees) ? payrollData.employees : [];
    employees.forEach((employee, index) => {
      nextOverrides[getEmployeeKey(employee, index)] = getOverrideDraftFromEmployee(employee);
    });
    setManualOverrides(nextOverrides);
  }, [payrollData]);

  const handleCalculate = useCallback(async () => {
    if (!payMonth) {
      showNotification(payrollText('monthRequired'), 'error');
      return;
    }
    if (!isPayrollMonthReadyForSave(payMonth, payrollCalendar?.latestCompletedMonthKey)) {
      showNotification(payrollText('monthNotEnded'), 'warning');
      return;
    }

    setSavingSnapshot(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/payroll/snapshots' + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: payMonth,
          savedBy: activeProfile?.email || activeProfile?.name || '관리자',
        }),
      });
      await fetchPayroll(payMonth, { showWorkflowToast: false });
      showNotification(payrollText('snapshotCreated', { month: payMonth }), 'success');
    } catch (error) {
      if (error?.message?.includes('payroll month not ended')) {
        showNotification(payrollText('monthNotEnded'), 'warning');
      } else if (error?.message?.includes('quantity settlement incomplete')) {
        showNotification(payrollText('settlementIncomplete'), 'warning');
      } else {
        showNotification(error?.message || '급여 계산 생성에 실패했습니다.', 'error');
      }
    } finally {
      setSavingSnapshot(false);
    }
  }, [
    activeOrgId,
    activeProfile?.email,
    activeProfile?.name,
    fetchPayroll,
    payMonth,
    payrollText,
    payrollCalendar?.latestCompletedMonthKey,
    showNotification,
  ]);

  const handleOverrideChange = useCallback(
    (employeeKey, field) => (event) => {
      const nextValue = sanitizeMoneyInput(event.target.value);
      setManualOverrides((prev) => ({
        ...prev,
        [employeeKey]: {
          fixedSalary: '',
          ctAmount: '',
          bonus: '',
          deduction: '',
          ...(prev[employeeKey] || {}),
          [field]: nextValue,
        },
      }));
    },
    []
  );

  const employees = payrollData?.employees ?? [];
  const currentMonth = payrollData?.month || payMonth;
  const isMonthReady = payrollData?.monthReady === true;
  const latestCompletedPayrollMonthKey = String(
    payrollCalendar?.latestCompletedMonthKey || ''
  ).trim();

  const computedEmployees = useMemo(
    () =>
      employees.map((employee, index) => {
        const employeeKey = getEmployeeKey(employee, index);
        const override = manualOverrides[employeeKey] || getOverrideDraftFromEmployee(employee);
        const payType =
          String(employee?.payType || '').trim().toUpperCase() === 'CT' ? 'CT' : 'FIXED';
        const processCount = Array.isArray(employee?.processes) ? employee.processes.length : 0;
        const productionEarnings = toMoneyNumber(
          employee?.productionEarnings ?? employee?.baseEarnings ?? employee?.totalEarnings
        );

        const fixedSalaryDraft = sanitizeMoneyInput(override.fixedSalary);
        const resolvedFixedSalary =
          fixedSalaryDraft !== ''
            ? parseMoneyInput(fixedSalaryDraft)
            : toMoneyNumber(employee?.fixedSalary);
        const ctAmountDraft = sanitizeMoneyInput(override.ctAmount);
        const resolvedCtAmount =
          ctAmountDraft !== ''
            ? parseMoneyInput(ctAmountDraft)
            : toMoneyNumber(employee?.ctAmount);

        const baseEarnings =
          payType === 'FIXED'
            ? !isMonthReady
              ? toMoneyNumber(employee?.fixedSalary)
              : resolvedFixedSalary
            : !isMonthReady
              ? toMoneyNumber(employee?.baseEarnings ?? employee?.totalEarnings)
              : productionEarnings + resolvedCtAmount;

        const bonus = !isMonthReady ? toMoneyNumber(employee?.bonus) : parseMoneyInput(override.bonus);
        const deduction = !isMonthReady
          ? toMoneyNumber(employee?.deduction)
          : parseMoneyInput(override.deduction);

        const finalEarnings = !isMonthReady
          ? toMoneyNumber(employee?.finalEarnings ?? employee?.totalEarnings)
          : baseEarnings + bonus - deduction;

        return {
          ...employee,
          employeeKey,
          payType,
          processCount,
          productionEarnings: payType === 'CT' ? productionEarnings : 0,
          ctAmount: payType === 'CT' ? resolvedCtAmount : 0,
          baseEarnings,
          fixedSalary: payType === 'FIXED' ? resolvedFixedSalary : 0,
          bonus,
          deduction,
          finalEarnings,
        };
      }),
    [employees, isMonthReady, manualOverrides]
  );

  const totalBaseEarnings = computedEmployees.reduce(
    (sum, employee) => sum + employee.baseEarnings,
    0
  );
  const totalBonus = computedEmployees.reduce((sum, employee) => sum + employee.bonus, 0);
  const totalDeduction = computedEmployees.reduce(
    (sum, employee) => sum + employee.deduction,
    0
  );
  const totalFinalEarnings = computedEmployees.reduce(
    (sum, employee) => sum + employee.finalEarnings,
    0
  );

  const canEditCurrentPayroll = Boolean(payrollData) && isMonthReady;

  const buildSnapshotEmployeesPayload = useCallback(
    () =>
      computedEmployees.map((employee) => ({
        employeeKey: employee.employeeKey,
        workerId: employee.workerId ?? null,
        workerName: employee.workerName ?? '',
        orgRole: employee.orgRole ?? '',
        roleName: employee.roleName ?? '',
        payType: employee.payType,
        bankName: employee.bankName ?? null,
        bankAccountNumber: employee.bankAccountNumber ?? null,
        productionEarnings: employee.payType === 'CT' ? employee.productionEarnings : 0,
        ctAmount: employee.payType === 'CT' ? employee.ctAmount : 0,
        baseEarnings: employee.payType === 'CT' ? employee.baseEarnings : 0,
        fixedSalary: employee.payType === 'FIXED' ? employee.fixedSalary : 0,
        bonus: employee.bonus,
        deduction: employee.deduction,
        finalEarnings: employee.finalEarnings,
        totalEarnings: employee.finalEarnings,
        processes: Array.isArray(employee.processes)
          ? employee.processes.map((process) => ({
              processCode: process.processCode ?? '',
              processName: process.processName ?? '',
              totalQuantity: toMoneyNumber(process.totalQuantity),
              totalCtSeconds: toMoneyNumber(process.totalCtSeconds),
              wagePerSecond: toMoneyNumber(process.wagePerSecond),
              totalEarnings: toMoneyNumber(process.totalEarnings),
            }))
          : [],
      })),
    [computedEmployees]
  );

  const handleSaveSnapshot = useCallback(async () => {
    if (!payrollData || !currentMonth) return false;
    if (!isMonthReady) {
      showNotification(payrollText('monthNotEnded'), 'warning');
      return false;
    }

    const missingFixedSalaryEmployee = computedEmployees.find(
      (employee) => employee.payType === 'FIXED' && toMoneyNumber(employee.fixedSalary) <= 0
    );
    if (missingFixedSalaryEmployee) {
      showNotification(
        `${missingFixedSalaryEmployee.workerName || '기본급 직원'} 기준 급여를 입력하세요.`,
        'error'
      );
      return false;
    }

    setSavingSnapshot(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/payroll/snapshots' + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: currentMonth,
          savedBy: activeProfile?.email || activeProfile?.name || '관리자',
          employees: buildSnapshotEmployeesPayload(),
        }),
      });
      showNotification(payrollText('snapshotSaved', { month: currentMonth }), 'success');
      await fetchPayroll(currentMonth, { showWorkflowToast: false });
      return true;
    } catch (error) {
      if (error?.message?.includes('payroll month not ended')) {
        showNotification(payrollText('monthNotEnded'), 'warning');
        await fetchPayroll(currentMonth, { showWorkflowToast: false });
      } else if (error?.message?.includes('quantity settlement incomplete')) {
        showNotification(payrollText('settlementIncomplete'), 'warning');
      } else if (error?.message?.includes('insufficient org role')) {
        showNotification('급여 저장 권한이 없습니다.', 'error');
      } else {
        showNotification(error?.message || '급여 저장에 실패했습니다.', 'error');
      }
      return false;
    } finally {
      setSavingSnapshot(false);
    }
  }, [
    payrollData,
    currentMonth,
    isMonthReady,
    computedEmployees,
    showNotification,
    activeOrgId,
    activeProfile?.email,
    activeProfile?.name,
    buildSnapshotEmployeesPayload,
    fetchPayroll,
    payrollText,
  ]);

  return (
    <AppPageContainer
      title={isNew ? '급여 계산' : `급여 ${monthFromParam}`}
      titleActions={payrollData ? (
        <SaveButton
          onClick={handleSaveSnapshot}
          disabled={!canEditCurrentPayroll || savingSnapshot || computedEmployees.length === 0}
          loading={savingSnapshot}
        >
          저장
        </SaveButton>
      ) : null}
    >
      <Box sx={{ width: '100%', maxWidth: 1280 }}>
        <Box
          sx={{
            display: 'none',
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
            gap: 1.5,
            mb: 2,
          }}
        >
          <Typography variant="h6">{isNew ? '급여 계산' : `급여 ${monthFromParam}`}</Typography>

          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            {payrollData && (
              <SaveButton
                onClick={handleSaveSnapshot}
                disabled={!canEditCurrentPayroll || savingSnapshot || computedEmployees.length === 0}
                loading={savingSnapshot}
              >
                저장
              </SaveButton>
            )}
          </Stack>
        </Box>

        {isNew && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', sm: 'center' }}
            >
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                <TextField
                  label="정산 월"
                  type="month"
                  value={payMonth}
                  onChange={(event) => handlePayMonthChange(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ max: latestCompletedPayrollMonthKey || undefined }}
                  size="small"
                  sx={{ width: { xs: '100%', sm: 220 } }}
                />
                <Stack sx={{ gap: '2px' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handlePayMonthChange(shiftPayrollMonthKey(payMonth, 1))}
                    disabled={
                      loading ||
                      payrollCalendarLoading ||
                      savingSnapshot ||
                      !latestCompletedPayrollMonthKey ||
                      payMonth >= latestCompletedPayrollMonthKey
                    }
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                  >
                    M+
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handlePayMonthChange(shiftPayrollMonthKey(payMonth, -1))}
                    disabled={
                      loading ||
                      payrollCalendarLoading ||
                      savingSnapshot ||
                      !latestCompletedPayrollMonthKey
                    }
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                  >
                    M-
                  </Button>
                </Stack>
              </Stack>
              <Button
                variant="contained"
                onClick={handleCalculate}
                disabled={
                  loading ||
                  payrollCalendarLoading ||
                  savingSnapshot ||
                  !isPayrollMonthReadyForSave(payMonth, latestCompletedPayrollMonthKey)
                }
              >
                {loading || savingSnapshot ? '계산 중...' : '계산하기'}
              </Button>
            </Stack>
            {!payrollCalendarLoading &&
              !isPayrollMonthReadyForSave(payMonth, latestCompletedPayrollMonthKey) && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                {payrollText('monthNotEnded')}
              </Alert>
            )}
          </Paper>
        )}

        {payrollData && (
          <>
            {!isMonthReady && (
              <Alert severity="info" sx={{ mb: 1.5 }}>
                {payrollText('monthNotEnded')}
              </Alert>
            )}
            {settlementSummary &&
              (Number(settlementSummary.reviewRows) > 0 ||
                Number(settlementSummary.blockedRows) > 0) && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  {payrollText('settlementPending', {
                    reviewRows: settlementSummary.reviewRows || 0,
                    blockedRows: settlementSummary.blockedRows || 0,
                  })}
                </Alert>
              )}
            {computedEmployees.length === 0 ? (
              <Alert severity="info">{currentMonth} 기간에 급여 대상 직원이 없습니다.</Alert>
            ) : (
              <Paper variant="outlined" sx={{ overflow: 'hidden', mb: 2 }}>
                <Box
                  sx={{
                    px: 2,
                    py: 1.25,
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    bgcolor: 'grey.50',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 1,
                    flexWrap: 'wrap',
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      직원별 급여 내역
                    </Typography>
                    <Chip size="small" label={`${computedEmployees.length}명`} variant="outlined" />
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    총 최종 급여 {formatDong(totalFinalEarnings)}
                  </Typography>
                </Box>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>직원</TableCell>
                        <TableCell align="center">급여 구분</TableCell>
                        <TableCell align="right">기준 급여</TableCell>
                        <TableCell align="right">보너스</TableCell>
                        <TableCell align="right">공제</TableCell>
                        <TableCell align="right">최종 급여</TableCell>
                        <TableCell align="center">상세</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {computedEmployees.map((employee) => {
                        const expanded = expandedWorkerId === employee.employeeKey;
                        const override = manualOverrides[employee.employeeKey] || {
                          fixedSalary: '',
                          ctAmount: '',
                          bonus: '',
                          deduction: '',
                        };

                        return (
                          <React.Fragment key={employee.employeeKey}>
                            <TableRow hover>
                              <TableCell sx={{ minWidth: 220 }}>
                                <Stack spacing={0.25}>
                                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                    {employee.workerName || '-'}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {employee.roleName || '-'}
                                    {employee.processCount > 0
                                      ? ` · ${employee.processCount}개 공정`
                                      : ''}
                                  </Typography>
                                </Stack>
                              </TableCell>
                              <TableCell align="center">
                                <Chip
                                  size="small"
                                  label={getLocalizedPayTypeLabel(
                                    employee.payType,
                                    getPayTypeLabel(employee.payType),
                                    languageCode
                                  )}
                                  color={employee.payType === 'CT' ? 'info' : 'default'}
                                  variant={employee.payType === 'CT' ? 'filled' : 'outlined'}
                                />
                              </TableCell>
                              <TableCell align="right">
                                {employee.payType === 'FIXED' && canEditCurrentPayroll ? (
                                  <TextField
                                    size="small"
                                    value={formatMoneyInput(override.fixedSalary)}
                                    onChange={handleOverrideChange(employee.employeeKey, 'fixedSalary')}
                                    placeholder="기준 급여"
                                    sx={amountFieldSx}
                                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                  />
                                ) : employee.payType === 'CT' && canEditCurrentPayroll ? (
                                  <TextField
                                    size="small"
                                    value={formatMoneyInput(override.ctAmount)}
                                    onChange={handleOverrideChange(employee.employeeKey, 'ctAmount')}
                                    placeholder="기본급"
                                    sx={amountFieldSx}
                                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                  />
                                ) : (
                                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                    {formatDong(employee.baseEarnings)}
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {!canEditCurrentPayroll ? (
                                  <Typography variant="body2">{formatDong(employee.bonus)}</Typography>
                                ) : (
                                  <TextField
                                    size="small"
                                    value={formatMoneyInput(override.bonus)}
                                    onChange={handleOverrideChange(employee.employeeKey, 'bonus')}
                                    placeholder="0"
                                    sx={amountFieldSx}
                                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                  />
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {!canEditCurrentPayroll ? (
                                  <Typography variant="body2">{formatDong(employee.deduction)}</Typography>
                                ) : (
                                  <TextField
                                    size="small"
                                    value={formatMoneyInput(override.deduction)}
                                    onChange={handleOverrideChange(employee.employeeKey, 'deduction')}
                                    placeholder="0"
                                    sx={amountFieldSx}
                                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                  />
                                )}
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 700,
                                    color:
                                      employee.finalEarnings < 0 ? 'error.main' : 'text.primary',
                                  }}
                                >
                                  {formatDong(employee.finalEarnings)}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Button
                                  size="small"
                                  onClick={() =>
                                    setExpandedWorkerId((prev) =>
                                      prev === employee.employeeKey ? null : employee.employeeKey
                                    )
                                  }
                                >
                                  {expanded ? '접기' : '상세'}
                                </Button>
                              </TableCell>
                            </TableRow>

                            <TableRow>
                              <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                                <Collapse in={expanded} unmountOnExit>
                                  <Box
                                    sx={{
                                      px: 3,
                                      py: 1.5,
                                      bgcolor: 'grey.50',
                                      borderBottom: '1px solid',
                                      borderColor: 'divider',
                                    }}
                                  >
                                    <Stack spacing={1.25}>
                                      {(employee.bankName || employee.bankAccountNumber) && (
                                        <Typography variant="caption" color="text.secondary">
                                          이체 계좌: {[employee.bankName, employee.bankAccountNumber]
                                            .filter(Boolean)
                                            .join(' / ')}
                                        </Typography>
                                      )}

                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>공정</TableCell>
                                            <TableCell align="right">수량</TableCell>
                                            <TableCell align="right">총 CT초</TableCell>
                                            <TableCell align="right">적용 평균단가</TableCell>
                                            <TableCell align="right">급여</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {(employee.processes || []).length === 0 ? (
                                            <TableStatusRow
                                              colSpan={5}
                                              message="작업 기록이 없습니다."
                                              sx={{ py: 1.5 }}
                                            />
                                          ) : (
                                            employee.processes.map((process, processIndex) => (
                                              <TableRow
                                                key={`${employee.employeeKey}-process-${processIndex}`}
                                              >
                                                <TableCell>
                                                  {process.processName || process.processCode || '-'}
                                                </TableCell>
                                                <TableCell align="right">
                                                  {formatNumberWithCommas(process.totalQuantity, {
                                                    fallback: '0',
                                                    maximumFractionDigits: 0,
                                                  })}
                                                </TableCell>
                                                <TableCell align="right">
                                                  {formatSeconds(process.totalCtSeconds)}
                                                </TableCell>
                                                <TableCell align="right">
                                                  {formatWagePerSecond(process.wagePerSecond)}
                                                </TableCell>
                                                <TableCell align="right">
                                                  {formatDong(process.totalEarnings)}
                                                </TableCell>
                                              </TableRow>
                                            ))
                                          )}
                                        </TableBody>
                                      </Table>
                                    </Stack>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} sx={{ fontWeight: 700 }}>
                          합계
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatDong(totalBaseEarnings)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatDong(totalBonus)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {formatDong(totalDeduction)}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          {formatDong(totalFinalEarnings)}
                        </TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </>
        )}

        {isNew && !payrollData && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            월을 선택하고 계산하기를 누르면 급여 대상과 계산 근거를 불러옵니다.
          </Typography>
        )}

        {loading && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            데이터를 불러오는 중입니다...
          </Typography>
        )}
      </Box>
    </AppPageContainer>
  );
};

export default PayrollEntry;
