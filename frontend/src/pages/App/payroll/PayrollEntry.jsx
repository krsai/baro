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
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { fetchQuantitySettlement } from '../../../utils/quantitySettlementApi';

const formatDong = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value) || 0), {
    fallback: '0',
    maximumFractionDigits: 0,
  })} VND`;

const formatSeconds = (value) =>
  `${formatNumberWithCommas(Math.round(Number(value) || 0), {
    fallback: '0',
    maximumFractionDigits: 0,
  })}초`;

const formatWagePerSecond = (value) =>
  `${formatNumberWithCommas(Number(value) || 0, {
    fallback: '0',
    maximumFractionDigits: 2,
  })} VND/초`;

const getLocalMonthKey = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getLocalMonthKey();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const normalizeMonthKey = (value) =>
  /^\d{4}-\d{2}$/.test(String(value || '').trim())
    ? String(value).trim()
    : getLocalMonthKey();

const shiftMonthKey = (value, amount) => {
  const [year, month] = normalizeMonthKey(value).split('-').map(Number);
  return getLocalMonthKey(new Date(year, month - 1 + amount, 1));
};

const isCompletedMonth = (value, latestCompletedMonthKey) => {
  const month = String(value || '').trim();
  const latest = String(latestCompletedMonthKey || '').trim();
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
    && /^\d{4}-(0[1-9]|1[0-2])$/.test(latest)
    && month <= latest;
};

const productionAllowanceOf = (employee) =>
  Number(employee?.productionAllowance ?? employee?.productionEarnings ?? 0) || 0;

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const { showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const isNew = !payrollId || payrollId === 'new';
  const monthFromParam = isNew ? '' : payrollId;

  const [payMonth, setPayMonth] = useState(monthFromParam);
  const [calendar, setCalendar] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(isNew);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [expandedEmployeeKey, setExpandedEmployeeKey] = useState(null);
  const [settlementSummary, setSettlementSummary] = useState(null);

  const fetchProductionAllowance = useCallback(async (month, { notifyWorkflow = true } = {}) => {
    setLoading(true);
    setData(null);
    setExpandedEmployeeKey(null);
    try {
      const query = buildQueryString({ orgId: activeOrgId, month });
      const payload = await requestJSON('/payroll' + query);
      setData(payload);
      setPayMonth(payload?.month || month);

      try {
        const settlement = await fetchQuantitySettlement({ orgId: activeOrgId, month });
        const summary = settlement?.summary ?? null;
        setSettlementSummary(summary);
        if (notifyWorkflow) {
          const reviewRows = Number(summary?.reviewRows) || 0;
          const blockedRows = Number(summary?.blockedRows) || 0;
          if (reviewRows > 0 || blockedRows > 0) {
            showNotification(
              `생산수당 확정 전에 수량 정산을 완료하세요. 검토 필요 ${reviewRows}건, 차단 ${blockedRows}건이 남아 있습니다.`,
              'warning'
            );
          }
        }
      } catch {
        setSettlementSummary(null);
      }
    } catch (error) {
      showNotification(error?.message || '생산수당 데이터를 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, showNotification]);

  useEffect(() => {
    if (!isNew || !activeOrgId) return undefined;
    let cancelled = false;
    const abortController = new AbortController();
    setCalendarLoading(true);
    requestJSON('/payroll/calendar' + buildQueryString({ orgId: activeOrgId }), {
      forceRefresh: true,
      skipGlobalLoading: true,
      signal: abortController.signal,
    })
      .then((payload) => {
        if (cancelled) return;
        setCalendar(payload);
        setPayMonth(String(payload?.latestCompletedMonthKey || '').trim());
      })
      .catch((error) => {
        if (cancelled) return;
        setCalendar(null);
        setPayMonth('');
        showNotification(error?.message || '정산 가능 월을 불러오지 못했습니다.', 'error');
      })
      .finally(() => {
        if (!cancelled) setCalendarLoading(false);
      });
    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [activeOrgId, isNew, showNotification]);

  useEffect(() => {
    if (!isNew && monthFromParam) fetchProductionAllowance(monthFromParam);
  }, [fetchProductionAllowance, isNew, monthFromParam]);

  const employees = useMemo(
    () => (Array.isArray(data?.employees) ? data.employees : []),
    [data?.employees]
  );
  const totalProductionAllowance = useMemo(
    () => employees.reduce((sum, employee) => sum + productionAllowanceOf(employee), 0),
    [employees]
  );
  const latestCompletedMonthKey = String(calendar?.latestCompletedMonthKey || '').trim();
  const managementStartMonthKey = String(calendar?.managementStartMonthKey || '').trim();
  const monthReady = data?.monthReady === true;

  const handleMonthChange = (nextMonth) => {
    setPayMonth(nextMonth);
    setData(null);
    setExpandedEmployeeKey(null);
  };

  const handleCalculate = async () => {
    if (!payMonth) {
      showNotification('정산 월을 선택하세요.', 'error');
      return;
    }
    if (!isCompletedMonth(payMonth, latestCompletedMonthKey)) {
      showNotification('해당 월이 끝난 뒤 생산수당을 계산할 수 있습니다.', 'warning');
      return;
    }
    if (managementStartMonthKey && payMonth < managementStartMonthKey) {
      showNotification(`생산수당은 관리 시작 월(${managementStartMonthKey})부터 계산할 수 있습니다.`, 'warning');
      return;
    }

    setSaving(true);
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
      await fetchProductionAllowance(payMonth, { notifyWorkflow: false });
      showNotification(`${payMonth} 생산수당을 계산하고 확정했습니다.`, 'success');
    } catch (error) {
      if (error?.message?.includes('payroll month not ended')) {
        showNotification('해당 월이 끝난 뒤 생산수당을 계산할 수 있습니다.', 'warning');
      } else if (error?.message?.includes('quantity settlement incomplete')) {
        showNotification('생산수당 확정 전에 수량 정산의 검토·차단 항목을 정리하세요.', 'warning');
      } else {
        showNotification(error?.message || '생산수당 계산에 실패했습니다.', 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!data || !payMonth || !monthReady) return;
    setSaving(true);
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
      await fetchProductionAllowance(payMonth, { notifyWorkflow: false });
      showNotification(`${payMonth} 생산수당 스냅샷을 저장했습니다.`, 'success');
    } catch (error) {
      showNotification(error?.message || '생산수당 저장에 실패했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppPageContainer
      title={isNew ? '생산수당 계산' : `생산수당 ${monthFromParam}`}
      titleActions={data ? (
        <SaveButton
          onClick={handleSave}
          disabled={!monthReady || saving || employees.length === 0}
          loading={saving}
        >
          저장
        </SaveButton>
      ) : null}
    >
      <Box sx={{ width: '100%', maxWidth: 1280 }}>
        {isNew && (
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
              <Stack direction="row" spacing={0.5} alignItems="center">
                <TextField
                  label="정산 월"
                  type="month"
                  value={payMonth}
                  onChange={(event) => handleMonthChange(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{
                    min: managementStartMonthKey || undefined,
                    max: latestCompletedMonthKey || undefined,
                  }}
                  size="small"
                  sx={{ width: 220 }}
                />
                <Stack sx={{ gap: '2px' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleMonthChange(shiftMonthKey(payMonth, 1))}
                    disabled={loading || calendarLoading || saving || !latestCompletedMonthKey || payMonth >= latestCompletedMonthKey}
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11 }}
                  >
                    M+
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleMonthChange(shiftMonthKey(payMonth, -1))}
                    disabled={
                      loading ||
                      calendarLoading ||
                      saving ||
                      !latestCompletedMonthKey ||
                      Boolean(managementStartMonthKey && payMonth <= managementStartMonthKey)
                    }
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11 }}
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
                  calendarLoading ||
                  saving ||
                  !isCompletedMonth(payMonth, latestCompletedMonthKey) ||
                  Boolean(managementStartMonthKey && payMonth < managementStartMonthKey)
                }
              >
                {loading || saving ? '계산 중...' : '계산 및 확정'}
              </Button>
            </Stack>
            {!calendarLoading && !isCompletedMonth(payMonth, latestCompletedMonthKey) && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                해당 월이 끝난 뒤 생산수당을 계산할 수 있습니다.
              </Alert>
            )}
            {!calendarLoading && managementStartMonthKey && payMonth < managementStartMonthKey && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                생산수당은 사업체 메뉴의 공장 관리 시작일이 포함된 월({managementStartMonthKey})부터 계산할 수 있습니다.
              </Alert>
            )}
          </Paper>
        )}

        {data && (
          <>
            {settlementSummary && (
              Number(settlementSummary.reviewRows) > 0 || Number(settlementSummary.blockedRows) > 0
            ) && (
              <Alert severity="warning" sx={{ mb: 1.5 }}>
                생산수당 확정 전에 수량 정산을 완료하세요. 검토 필요 {settlementSummary.reviewRows || 0}건,
                차단 {settlementSummary.blockedRows || 0}건이 남아 있습니다.
              </Alert>
            )}
            {employees.length === 0 ? (
              <Alert severity="info">{payMonth} 기간에 생산수당 대상 성과급 직원이 없습니다.</Alert>
            ) : (
              <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
                <Box sx={{ px: 2, py: 1.25, bgcolor: 'grey.50', display: 'flex', justifyContent: 'space-between' }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>직원별 생산수당</Typography>
                    <Chip size="small" label={`${employees.length}명`} variant="outlined" />
                  </Stack>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    총 생산수당 {formatDong(totalProductionAllowance)}
                  </Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>직원</TableCell>
                        <TableCell align="right">생산수당</TableCell>
                        <TableCell align="center">산출 근거</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {employees.map((employee, index) => {
                        const employeeKey = employee.employeeKey || `employee-${index}`;
                        const expanded = expandedEmployeeKey === employeeKey;
                        return (
                          <React.Fragment key={employeeKey}>
                            <TableRow hover>
                              <TableCell>
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>{employee.workerName || '-'}</Typography>
                                <Typography variant="caption" color="text.secondary">{employee.roleName || '-'}</Typography>
                              </TableCell>
                              <TableCell align="right" sx={{ fontWeight: 700 }}>
                                {formatDong(productionAllowanceOf(employee))}
                              </TableCell>
                              <TableCell align="center">
                                <Button size="small" onClick={() => setExpandedEmployeeKey(expanded ? null : employeeKey)}>
                                  {expanded ? '접기' : '상세'}
                                </Button>
                              </TableCell>
                            </TableRow>
                            <TableRow>
                              <TableCell colSpan={3} sx={{ p: 0, border: 0 }}>
                                <Collapse in={expanded} unmountOnExit>
                                  <Box sx={{ px: 3, py: 1.5, bgcolor: 'grey.50' }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                      생산수당 = 작업수량 × CT초 × 작업 당시 공장 생산수당 초당 단가
                                    </Typography>
                                    <Table size="small">
                                      <TableHead>
                                        <TableRow>
                                          <TableCell>공정</TableCell>
                                          <TableCell align="right">수량</TableCell>
                                          <TableCell align="right">총 CT초</TableCell>
                                          <TableCell align="right">적용 평균단가</TableCell>
                                          <TableCell align="right">생산수당</TableCell>
                                        </TableRow>
                                      </TableHead>
                                      <TableBody>
                                        {(employee.processes || []).length === 0 ? (
                                          <TableStatusRow colSpan={5} message="작업 기록이 없습니다." />
                                        ) : employee.processes.map((process, processIndex) => (
                                          <TableRow key={`${employeeKey}-${process.styleProcessId || processIndex}`}>
                                            <TableCell>{process.processName || process.processCode || '-'}</TableCell>
                                            <TableCell align="right">{formatNumberWithCommas(process.totalQuantity || 0)}</TableCell>
                                            <TableCell align="right">{formatSeconds(process.totalCtSeconds)}</TableCell>
                                            <TableCell align="right">{formatWagePerSecond(process.wagePerSecond)}</TableCell>
                                            <TableCell align="right">{formatDong(process.totalEarnings)}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            )}
          </>
        )}

        {!data && !loading && !isNew && (
          <Alert severity="info">생산수당 데이터를 불러오지 못했습니다.</Alert>
        )}
      </Box>
    </AppPageContainer>
  );
};

export default PayrollEntry;
