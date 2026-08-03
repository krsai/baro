import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, Collapse, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import TableStatusRow from '../../../components/TableStatusRow';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatNumberWithCommas } from '../../../utils/numberFormat';

const TEXT = {
  ko: {
    title: '생산수당 상세', loading: '생산수당 상세 내역을 불러오는 중입니다.',
    fetchError: '생산수당 상세 내역을 불러오지 못했습니다.', empty: '생산수당 대상 성과급 직원이 없습니다.',
    employeeAllowance: '직원별 생산수당', people: '명', total: '총 생산수당', employee: '직원',
    allowance: '생산수당', basis: '산출 근거', details: '상세', collapse: '접기',
    formula: '생산수당 = 작업수량 × CT초 × 월 계산 시점의 공장 생산수당 초당 단가. 직원별 적용 초당 단가를 수정하면 해당 직원의 월 전체 CT초에 동일하게 적용됩니다.',
    process: '공정', quantity: '수량', ctSeconds: '총 CT초', averageRate: '적용 초당 단가',
    appliedRate: '적용 초당 단가', saveRates: '단가 저장', saving: '저장 중...', saveSuccess: '직원별 적용 단가를 저장했습니다.', saveError: '직원별 적용 단가 저장에 실패했습니다.',
    noRecords: '작업 기록이 없습니다.', current: '진행 중', confirmed: '확정',
  },
  en: {
    title: 'Production Allowance Details', loading: 'Loading production allowance details.',
    fetchError: 'Failed to load production allowance details.', empty: 'No performance-pay employees are eligible for production allowance.',
    employeeAllowance: 'Production Allowance by Employee', people: ' employees', total: 'Total Production Allowance', employee: 'Employee',
    allowance: 'Production Allowance', basis: 'Calculation Basis', details: 'Details', collapse: 'Collapse',
    formula: 'Production allowance = quantity × CT seconds × the current factory rate when the month is calculated. An employee override applies one rate to all of that employee’s CT seconds for the month.',
    process: 'Process', quantity: 'Quantity', ctSeconds: 'Total CT Seconds', averageRate: 'Applied Rate',
    appliedRate: 'Applied Rate / sec', saveRates: 'Save Rates', saving: 'Saving...', saveSuccess: 'Saved employee rates.', saveError: 'Failed to save employee rates.',
    noRecords: 'No work records.', current: 'In Progress', confirmed: 'Confirmed',
  },
  vi: {
    title: 'Chi tiet phu cap san luong', loading: 'Dang tai chi tiet phu cap san luong.',
    fetchError: 'Khong the tai chi tiet phu cap san luong.', empty: 'Khong co nhan vien luong san pham thuoc doi tuong tinh phu cap.',
    employeeAllowance: 'Phu cap san luong theo nhan vien', people: ' nhan vien', total: 'Tong phu cap san luong', employee: 'Nhan vien',
    allowance: 'Phu cap san luong', basis: 'Co so tinh', details: 'Chi tiet', collapse: 'Thu gon',
    formula: 'Phu cap san luong = so luong × giay CT × don gia hien tai cua nha may khi tinh thang. Don gia sua theo nhan vien ap dung cho toan bo giay CT cua nhan vien trong thang.',
    process: 'Cong doan', quantity: 'So luong', ctSeconds: 'Tong giay CT', averageRate: 'Don gia ap dung',
    appliedRate: 'Don gia ap dung/giay', saveRates: 'Luu don gia', saving: 'Dang luu...', saveSuccess: 'Da luu don gia theo nhan vien.', saveError: 'Khong the luu don gia theo nhan vien.',
    noRecords: 'Khong co ghi chep cong viec.', current: 'Dang tien hanh', confirmed: 'Da xac nhan',
  },
};

const formatDong = (value) => `${formatNumberWithCommas(Math.round(Number(value) || 0), {
  fallback: '0', maximumFractionDigits: 0,
})} VND`;
const formatSeconds = (value) => `${formatNumberWithCommas(Math.round(Number(value) || 0), {
  fallback: '0', maximumFractionDigits: 0,
})} s`;
const formatRate = (value) => `${formatNumberWithCommas(Number(value) || 0, {
  fallback: '0', maximumFractionDigits: 2,
})} VND/s`;
const productionAllowanceOf = (employee) =>
  Number(employee?.productionAllowance ?? employee?.productionEarnings ?? 0) || 0;
const appliedRateOf = (employee) => {
  const processes = Array.isArray(employee?.processes) ? employee.processes : [];
  const totalCtSeconds = processes.reduce((sum, process) => sum + Number(process?.totalCtSeconds || 0), 0);
  const totalEarnings = processes.reduce((sum, process) => sum + Number(process?.totalEarnings || 0), 0);
  return totalCtSeconds > 0 ? totalEarnings / totalCtSeconds : 0;
};

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const [searchParams] = useSearchParams();
  const { showNotification } = useAppActions();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const month = String(payrollId || '').trim();
  const factoryId = Number(searchParams.get('factoryId')) || null;
  const lineId = Number(searchParams.get('lineId')) || null;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [expandedEmployeeKey, setExpandedEmployeeKey] = useState(null);
  const [rateDrafts, setRateDrafts] = useState({});
  const [initialRates, setInitialRates] = useState({});
  const [savingRates, setSavingRates] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrgId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    setLoading(true);
    try {
      const payload = await requestJSON('/payroll' + buildQueryString({ orgId: activeOrgId, month }));
      setData(payload);
      const loadedRates = Object.fromEntries(
        (Array.isArray(payload?.employees) ? payload.employees : [])
          .filter((employee) => Number(employee?.workerId) > 0)
          .map((employee) => [String(employee.workerId), String(appliedRateOf(employee))])
      );
      setRateDrafts(loadedRates);
      setInitialRates(loadedRates);
    } catch (error) {
      setData(null);
      showNotification(error?.message || text.fetchError, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, month, showNotification, text.fetchError]);

  useEffect(() => { load(); }, [load]);

  const employees = useMemo(() => {
    const rows = Array.isArray(data?.employees) ? data.employees : [];
    if (!factoryId && !lineId) return rows;
    return rows.map((employee) => {
      const processes = (Array.isArray(employee?.processes) ? employee.processes : []).filter(
        (process) => (!factoryId || Number(process.factoryId) === factoryId) &&
          (!lineId || Number(process.lineId) === lineId)
      );
      const productionAllowance = processes.reduce(
        (sum, process) => sum + Number(process.totalEarnings || 0), 0
      );
      return { ...employee, processes, productionAllowance, productionEarnings: productionAllowance };
    }).filter((employee) => employee.processes.length > 0);
  }, [data?.employees, factoryId, lineId]);
  const total = useMemo(
    () => employees.reduce((sum, employee) => sum + productionAllowanceOf(employee), 0),
    [employees]
  );
  const provisional = data?.isProvisional === true;
  const changedRateWorkerIds = useMemo(
    () => Object.keys(rateDrafts).filter((workerId) => {
      const current = Number(rateDrafts[workerId]);
      const initial = Number(initialRates[workerId]);
      return Number.isFinite(current) && Number.isFinite(initial) && Math.abs(current - initial) > 0.000001;
    }),
    [initialRates, rateDrafts]
  );
  const handleSaveRates = async () => {
    const overrides = (Array.isArray(data?.employees) ? data.employees : [])
      .filter((employee) => changedRateWorkerIds.includes(String(employee?.workerId)))
      .map((employee) => ({
        workerId: Number(employee.workerId),
        wagePerSecond: Number(rateDrafts[String(employee.workerId)]),
      }));
    if (overrides.some((row) => !Number.isFinite(row.wagePerSecond) || row.wagePerSecond < 0)) {
      showNotification(text.saveError, 'error');
      return;
    }
    setSavingRates(true);
    try {
      await requestJSON(`/payroll/snapshots/${month}/employee-rates` + buildQueryString({ orgId: activeOrgId }), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }),
      });
      await load();
      showNotification(text.saveSuccess, 'success');
    } catch (error) {
      showNotification(error?.message || text.saveError, 'error');
    } finally {
      setSavingRates(false);
    }
  };

  return (
    <AppPageContainer title={`${text.title} · ${month}`}>
      <Box sx={{ width: '100%', maxWidth: 1280 }}>
        {loading ? <Paper variant="outlined" sx={{ p: 3 }}>{text.loading}</Paper> : null}
        {!loading && !data ? <Alert severity="error">{text.fetchError}</Alert> : null}
        {!loading && data && employees.length === 0 ? <Alert severity="info">{text.empty}</Alert> : null}
        {!loading && data && employees.length > 0 ? (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: 'grey.50', display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{text.employeeAllowance}</Typography>
                <Chip size="small" label={`${employees.length}${text.people}`} variant="outlined" />
                <Chip size="small" color={provisional ? 'warning' : 'success'} label={provisional ? text.current : text.confirmed} variant="outlined" />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{text.total} {formatDong(total)}</Typography>
                {provisional && <Button size="small" variant="contained" disabled={savingRates || changedRateWorkerIds.length === 0} onClick={handleSaveRates}>{savingRates ? text.saving : text.saveRates}</Button>}
              </Stack>
            </Box>
            <TableContainer><Table size="small">
              <TableHead><TableRow>
                <TableCell>{text.employee}</TableCell>
                <TableCell align="right">{text.appliedRate}</TableCell>
                <TableCell align="right">{text.allowance}</TableCell>
                <TableCell align="center">{text.basis}</TableCell>
              </TableRow></TableHead>
              <TableBody>{employees.map((employee, index) => {
                const key = employee.employeeKey || `employee-${index}`;
                const expanded = expandedEmployeeKey === key;
                const processes = Array.isArray(employee.processes) ? employee.processes : [];
                return <React.Fragment key={key}>
                  <TableRow hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{employee.workerName || '-'}</Typography>
                      <Typography variant="caption" color="text.secondary">{employee.roleName || '-'}</Typography>
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        size="small" type="number" value={rateDrafts[String(employee.workerId)] ?? ''}
                        disabled={!provisional || savingRates}
                        onChange={(event) => setRateDrafts((previous) => ({ ...previous, [String(employee.workerId)]: event.target.value }))}
                        inputProps={{ min: 0, step: 0.01 }} sx={{ width: 130 }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatDong(productionAllowanceOf(employee))}</TableCell>
                    <TableCell align="center"><Button size="small" onClick={() => setExpandedEmployeeKey(expanded ? null : key)}>{expanded ? text.collapse : text.details}</Button></TableCell>
                  </TableRow>
                  <TableRow><TableCell colSpan={4} sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                        <Typography variant="caption" color="text.secondary">{text.formula}</Typography>
                        <TableContainer component={Paper} variant="outlined" sx={{ mt: 1 }}><Table size="small">
                          <TableHead><TableRow>
                            <TableCell>{text.process}</TableCell><TableCell align="right">{text.quantity}</TableCell>
                            <TableCell align="right">{text.ctSeconds}</TableCell><TableCell align="right">{text.averageRate}</TableCell>
                            <TableCell align="right">{text.allowance}</TableCell>
                          </TableRow></TableHead>
                          <TableBody>{processes.length === 0
                            ? <TableStatusRow colSpan={5} message={text.noRecords} />
                            : processes.map((process, processIndex) => <TableRow key={process.styleProcessId || `${key}-${processIndex}`}>
                              <TableCell>{process.processName || process.processCode || '-'}</TableCell>
                              <TableCell align="right">{formatNumberWithCommas(process.totalQuantity || 0)}</TableCell>
                              <TableCell align="right">{formatSeconds(process.totalCtSeconds)}</TableCell>
                              <TableCell align="right">{formatRate(process.wagePerSecond)}</TableCell>
                              <TableCell align="right">{formatDong(process.totalEarnings)}</TableCell>
                            </TableRow>)}</TableBody>
                        </Table></TableContainer>
                      </Box>
                    </Collapse>
                  </TableCell></TableRow>
                </React.Fragment>;
              })}</TableBody>
            </Table></TableContainer>
          </Paper>
        ) : null}
      </Box>
    </AppPageContainer>
  );
};

export default PayrollEntry;
