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
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getPayTypeLabel as getLocalizedPayTypeLabel } from '../../../constants/payType';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

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
  String(value || '').trim().toUpperCase() === 'CT' ? '성과급' : '고정급';
const getOverrideDraftFromEmployee = (employee) => ({
  fixedSalary:
    String(employee?.payType || '').trim().toUpperCase() === 'FIXED' &&
    toMoneyNumber(employee?.fixedSalary) > 0
      ? String(Math.round(toMoneyNumber(employee?.fixedSalary)))
      : '',
  bonus: toMoneyNumber(employee?.bonus) > 0 ? String(Math.round(toMoneyNumber(employee?.bonus))) : '',
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

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const { navigateToPath, showNotification } = useApp();
  const { activeOrgId, activeOrgRole, activeProfile } = useAuth();
  const { languageCode } = useLanguage();

  const isNew = !payrollId || payrollId === 'new';
  const monthFromParam = isNew ? null : payrollId;
  const isAdmin = String(activeOrgRole || '').trim().toUpperCase() === 'ADMIN';

  const [payMonth, setPayMonth] = useState(
    () => monthFromParam ?? new Date().toISOString().slice(0, 7)
  );
  const [loading, setLoading] = useState(false);
  const [locking, setLocking] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [payrollData, setPayrollData] = useState(null);
  const [expandedWorkerId, setExpandedWorkerId] = useState(null);
  const [manualOverrides, setManualOverrides] = useState({});

  const closeEntry = useCallback(() => {
    navigateToPath('/payroll', {
      label: '급여 계산',
      closeTabId: isNew ? '/payroll/new' : `/payroll/${payrollId}`,
    });
  }, [isNew, navigateToPath, payrollId]);

  const fetchPayroll = useCallback(
    async (month) => {
      setLoading(true);
      setPayrollData(null);
      setExpandedWorkerId(null);
      try {
        const query = buildQueryString({ orgId: activeOrgId, month });
        const data = await requestJSON('/payroll' + query);
        setPayrollData(data);
        setPayMonth(data?.month || month);
      } catch (error) {
        showNotification(error?.message || '급여 데이터를 불러오지 못했습니다.', 'error');
      } finally {
        setLoading(false);
      }
    },
    [activeOrgId, showNotification]
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

  const handleCalculate = () => {
    if (!payMonth) {
      showNotification('정산 월을 선택하세요.', 'error');
      return;
    }
    fetchPayroll(payMonth);
  };

  const handleOverrideChange = useCallback((employeeKey, field) => (event) => {
    const nextValue = sanitizeMoneyInput(event.target.value);
    setManualOverrides((prev) => ({
      ...prev,
      [employeeKey]: {
        fixedSalary: '',
        bonus: '',
        deduction: '',
        ...(prev[employeeKey] || {}),
        [field]: nextValue,
      },
    }));
  }, []);

  const employees = payrollData?.employees ?? [];
  const isLocked = payrollData?.locked === true;
  const currentMonth = payrollData?.month || payMonth;

  const computedEmployees = useMemo(
    () =>
      employees.map((employee, index) => {
        const employeeKey = getEmployeeKey(employee, index);
        const override = manualOverrides[employeeKey] || getOverrideDraftFromEmployee(employee);
        const payType = String(employee?.payType || '').trim().toUpperCase() === 'CT' ? 'CT' : 'FIXED';
        const processCount = Array.isArray(employee?.processes) ? employee.processes.length : 0;
        const baseEarnings =
          payType === 'FIXED'
            ? isLocked
              ? toMoneyNumber(employee?.fixedSalary)
              : parseMoneyInput(override.fixedSalary)
            : toMoneyNumber(employee?.baseEarnings ?? employee?.totalEarnings);
        const bonus = isLocked ? toMoneyNumber(employee?.bonus) : parseMoneyInput(override.bonus);
        const deduction = isLocked
          ? toMoneyNumber(employee?.deduction)
          : parseMoneyInput(override.deduction);
        const finalEarnings = isLocked
          ? toMoneyNumber(employee?.finalEarnings ?? employee?.totalEarnings)
          : baseEarnings + bonus - deduction;

        return {
          ...employee,
          employeeKey,
          payType,
          processCount,
          baseEarnings,
          fixedSalary: payType === 'FIXED' ? baseEarnings : 0,
          bonus,
          deduction,
          finalEarnings,
        };
      }),
    [employees, isLocked, manualOverrides]
  );

  const totalBaseEarnings = computedEmployees.reduce((sum, employee) => sum + employee.baseEarnings, 0);
  const totalBonus = computedEmployees.reduce((sum, employee) => sum + employee.bonus, 0);
  const totalDeduction = computedEmployees.reduce((sum, employee) => sum + employee.deduction, 0);
  const totalFinalEarnings = computedEmployees.reduce(
    (sum, employee) => sum + employee.finalEarnings,
    0
  );
  const fixedEmployeeCount = computedEmployees.filter((employee) => employee.payType === 'FIXED').length;

  const handleLock = async () => {
    if (!payrollData || payrollData.locked) return;

    const missingFixedSalaryEmployee = computedEmployees.find(
      (employee) =>
        employee.payType === 'FIXED' &&
        sanitizeMoneyInput(manualOverrides[employee.employeeKey]?.fixedSalary || '') === ''
    );
    if (missingFixedSalaryEmployee) {
      showNotification(
        `${missingFixedSalaryEmployee.workerName || '고정급 직원'} 기준 급여를 입력하세요.`,
        'error'
      );
      return;
    }

    if (
      !window.confirm(
        `${currentMonth} 급여를 확정하시겠습니까? 확정 후에는 보너스/공제 내역까지 함께 저장됩니다.`
      )
    ) {
      return;
    }

    setLocking(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON('/payroll/lock' + query, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: currentMonth,
          lockedBy: activeProfile?.email || activeProfile?.name || '관리자',
          employees: computedEmployees.map((employee) => ({
            employeeKey: employee.employeeKey,
            workerId: employee.workerId ?? null,
            workerName: employee.workerName ?? '',
            orgRole: employee.orgRole ?? '',
            roleName: employee.roleName ?? '',
            payType: employee.payType,
            bankName: employee.bankName ?? null,
            bankAccountNumber: employee.bankAccountNumber ?? null,
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
        }),
      });
      showNotification(`${currentMonth} 급여가 확정되었습니다.`, 'success');
      closeEntry();
    } catch (error) {
      if (error?.message?.includes('already locked')) {
        showNotification('이미 확정된 월입니다.', 'warning');
      } else if (error?.message?.includes('insufficient org role')) {
        showNotification('급여 확정 권한이 없습니다.', 'error');
      } else {
        showNotification(error?.message || '급여 확정에 실패했습니다.', 'error');
      }
    } finally {
      setLocking(false);
    }
  };

  const handleUnlock = async () => {
    if (!payrollData?.locked || !currentMonth) return;
    if (!window.confirm(`${currentMonth} 급여 확정을 취소하시겠습니까? 다시 계산 상태로 되돌아갑니다.`)) {
      return;
    }

    setUnlocking(true);
    try {
      const query = buildQueryString({ orgId: activeOrgId });
      await requestJSON(`/payroll/snapshots/${currentMonth}` + query, {
        method: 'DELETE',
      });
      showNotification(`${currentMonth} 급여 확정이 취소되었습니다.`, 'success');
      await fetchPayroll(currentMonth);
    } catch (error) {
      if (error?.message?.includes('insufficient org role')) {
        showNotification('급여 확정 취소는 관리자만 가능합니다.', 'error');
      } else {
        showNotification(error?.message || '급여 확정 취소에 실패했습니다.', 'error');
      }
    } finally {
      setUnlocking(false);
    }
  };

  return (
    <AppPageContainer>
      <Box sx={{ width: '100%', maxWidth: 1280 }}>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 2,
            mb: 2,
          }}
        >
          <Box>
            <Typography variant="h6">
              {isNew ? '급여 계산' : `급여 ${monthFromParam}`}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isLocked
                ? `${payrollData.lockedBy || '-'} · ${
                    payrollData.lockedAt
                      ? new Date(payrollData.lockedAt).toLocaleString('ko-KR', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : '-'
                  } 확정`
                : payrollData
                  ? fixedEmployeeCount > 0
                    ? `고정급 ${fixedEmployeeCount}명은 기준 급여를 입력한 뒤 보너스/공제를 반영하세요.`
                    : '성과급 계산액에 보너스/공제를 반영한 뒤 확정할 수 있습니다.'
                  : '월을 선택하면 작업 기록 기준으로 급여를 계산합니다.'}
            </Typography>
          </Box>
          <Chip
            label={isLocked ? '확정됨' : payrollData ? '미확정' : '대기'}
            color={isLocked ? 'success' : payrollData ? 'warning' : 'default'}
            variant="outlined"
          />
        </Box>

        {isNew && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'stretch', sm: 'center' }}
            >
              <TextField
                label="정산 월"
                type="month"
                value={payMonth}
                onChange={(event) => {
                  setPayMonth(event.target.value);
                  setPayrollData(null);
                  setExpandedWorkerId(null);
                }}
                InputLabelProps={{ shrink: true }}
                size="small"
                sx={{ width: { xs: '100%', sm: 220 } }}
              />
              <Button variant="contained" onClick={handleCalculate} disabled={loading || !payMonth}>
                {loading ? '계산 중...' : '계산하기'}
              </Button>
            </Stack>
          </Paper>
        )}

        {payrollData && (
          <>
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
                                    {employee.processCount > 0 ? ` · ${employee.processCount}개 공정` : ''}
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
                                {employee.payType === 'FIXED' && !isLocked ? (
                                  <TextField
                                    size="small"
                                    value={override.fixedSalary}
                                    onChange={handleOverrideChange(employee.employeeKey, 'fixedSalary')}
                                    placeholder="기준 급여"
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
                                {isLocked ? (
                                  <Typography variant="body2">{formatDong(employee.bonus)}</Typography>
                                ) : (
                                  <TextField
                                    size="small"
                                    value={override.bonus}
                                    onChange={handleOverrideChange(employee.employeeKey, 'bonus')}
                                    placeholder="0"
                                    sx={amountFieldSx}
                                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                                  />
                                )}
                              </TableCell>
                              <TableCell align="right">
                                {isLocked ? (
                                  <Typography variant="body2">{formatDong(employee.deduction)}</Typography>
                                ) : (
                                  <TextField
                                    size="small"
                                    value={override.deduction}
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
                                    color: employee.finalEarnings < 0 ? 'error.main' : 'text.primary',
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
                                              <TableRow key={`${employee.employeeKey}-process-${processIndex}`}>
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

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button variant="outlined" onClick={closeEntry}>
                {isLocked ? '닫기' : '취소'}
              </Button>
              {isLocked && isAdmin && (
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleUnlock}
                  disabled={unlocking}
                >
                  {unlocking ? '처리 중...' : '확정 취소'}
                </Button>
              )}
              {!isLocked && computedEmployees.length > 0 && (
                <Button
                  variant="contained"
                  color="success"
                  onClick={handleLock}
                  disabled={locking}
                >
                  {locking ? '처리 중...' : '급여 확정'}
                </Button>
              )}
            </Stack>
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
