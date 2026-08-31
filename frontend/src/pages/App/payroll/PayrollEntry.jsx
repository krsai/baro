import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography,
  Tooltip, alpha,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
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
    process: '공정', quantity: '수량', ctSeconds: '총 CT초', averageRate: '초당 급여',
    appliedRate: '적용 초당 단가', saveRates: '단가 저장', saving: '저장 중...', saveSuccess: '직원별 적용 단가를 저장했습니다.', saveError: '직원별 적용 단가 저장에 실패했습니다.',
    noRecords: '작업 기록이 없습니다.', current: '진행 중', confirmed: '확정',
  },
  en: {
    title: 'Production Allowance Details', loading: 'Loading production allowance details.',
    fetchError: 'Failed to load production allowance details.', empty: 'No performance-pay employees are eligible for production allowance.',
    employeeAllowance: 'Production Allowance by Employee', people: ' employees', total: 'Total Production Allowance', employee: 'Employee',
    allowance: 'Production Allowance', basis: 'Calculation Basis', details: 'Details', collapse: 'Collapse',
    formula: 'Production allowance = quantity × CT seconds × the current factory rate when the month is calculated. An employee override applies one rate to all of that employee’s CT seconds for the month.',
    process: 'Process', quantity: 'Quantity', ctSeconds: 'Total CT Seconds', averageRate: 'Pay per Second',
    appliedRate: 'Applied Rate / sec', saveRates: 'Save Rates', saving: 'Saving...', saveSuccess: 'Saved employee rates.', saveError: 'Failed to save employee rates.',
    noRecords: 'No work records.', current: 'In Progress', confirmed: 'Confirmed',
  },
  vi: {
    title: 'Chi tiết phu cap san luong', loading: 'Đang tải chi tiet phu cap san luong.',
    fetchError: 'Không thể tai chi tiet phu cap san luong.', empty: 'Không có nhan vien luong san pham thuoc doi tuong tinh phu cap.',
    employeeAllowance: 'Phụ cấp san luong theo nhan vien', people: ' nhan vien', total: 'Tong phu cap san luong', employee: 'Nhân viên',
    allowance: 'Phụ cấp san luong', basis: 'Co so tinh', details: 'Chi tiết', collapse: 'Thu gon',
    formula: 'Phụ cấp san luong = so luong × giay CT × don gia hien tai cua nha may khi tinh thang. Đơn giá sua theo nhan vien ap dung cho toan bo giay CT cua nhan vien trong thang.',
    process: 'Công đoạn', quantity: 'Số lượng', ctSeconds: 'Tong giay CT', averageRate: 'Luong moi giay',
    appliedRate: 'Đơn giá ap dung/giay', saveRates: 'Luu don gia', saving: 'Đang lưu...', saveSuccess: 'Đã lưu don gia theo nhan vien.', saveError: 'Không thể luu don gia theo nhan vien.',
    noRecords: 'Không có ghi chep cong viec.', current: 'Đang tiến hành', confirmed: 'Đã xác nhận',
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
const normalizeEmployeePayType = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'OUTPUT' || normalized === 'CT') return 'OUTPUT';
  return 'GENERAL';
};
const escapePrintText = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const appliedRateOf = (employee) => {
  const processes = Array.isArray(employee?.processes) ? employee.processes : [];
  const totalCtSeconds = processes.reduce((sum, process) => sum + Number(process?.totalCtSeconds || 0), 0);
  const totalEarnings = processes.reduce((sum, process) => sum + Number(process?.totalEarnings || 0), 0);
  return totalCtSeconds > 0 ? totalEarnings / totalCtSeconds : 0;
};
const formatRateDraft = (value) => {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return '';
  return String(Math.round((rate + Number.EPSILON) * 100) / 100);
};
const buildEmployeeRateDrafts = (employees) => Object.fromEntries(
  (Array.isArray(employees) ? employees : [])
    .filter((employee) => Number(employee?.workerId) > 0)
    .map((employee) => [String(employee.workerId), formatRateDraft(appliedRateOf(employee))])
);
const LOCK_TEXT = {
  ko: {
    locked: '잠금', unlocked: '잠금 해제', unlockConfirm: '이 생산수당 계산의 잠금을 해제하시겠습니까?',
    lockedHelp: '잠금 상태입니다. 누르면 잠금을 해제합니다.', unlockedHelp: '잠금 해제 상태입니다. 누르면 잠급니다.',
    saveFirst: '수정한 초당 단가를 먼저 저장해야 잠글 수 있습니다.', error: '잠금 상태 변경에 실패했습니다.',
  },
  en: {
    locked: 'Locked', unlocked: 'Unlocked', unlockConfirm: 'Unlock this production allowance calculation?',
    lockedHelp: 'Locked. Click to unlock.', unlockedHelp: 'Unlocked. Click to lock.',
    saveFirst: 'Save the changed rates before locking.', error: 'Failed to change the lock status.',
  },
  vi: {
    locked: 'Da khoa', unlocked: 'Da mo khoa', unlockConfirm: 'Mở khóa ket qua phu cap san luong nay?',
    lockedHelp: 'Đang khóa. Bam de mo khoa.', unlockedHelp: 'Dang mo khoa. Bam de khoa.',
    saveFirst: 'Hay luu don gia da sua truoc khi khoa.', error: 'Không thể thay doi trang thai khoa.',
  },
};
const getPayrollLockButtonSx = (locked) => (theme) => ({
  minWidth: 108, height: 36, px: 1.75, borderRadius: 1.5,
  border: `1px solid ${locked ? alpha(theme.palette.text.primary, 0.9) : alpha(theme.palette.primary.main, 0.38)}`,
  backgroundColor: locked ? alpha(theme.palette.text.primary, 0.9) : alpha(theme.palette.primary.main, 0.08),
  color: locked ? theme.palette.common.white : theme.palette.primary.main,
  fontWeight: 700,
  '&:hover': { backgroundColor: locked ? theme.palette.text.primary : alpha(theme.palette.primary.main, 0.16) },
});

const PayrollEntry = () => {
  const { payrollId } = useParams();
  const [searchParams] = useSearchParams();
  const { showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const pageTitle = languageCode === 'ko' ? '급여 계산 상세' : languageCode === 'vi' ? 'Chi tiết tính lương' : 'Payroll Details';
  const month = String(payrollId || '').trim();
  const factoryId = Number(searchParams.get('factoryId')) || null;
  const lineId = Number(searchParams.get('lineId')) || null;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [expandedEmployeeKey, setExpandedEmployeeKey] = useState(null);
  const [rateDrafts, setRateDrafts] = useState({});
  const [initialRates, setInitialRates] = useState({});
  const [savingRates, setSavingRates] = useState(false);
  const [togglingLock, setTogglingLock] = useState(false);
  const [employeeDirectory, setEmployeeDirectory] = useState([]);
  const [payslipEmployee, setPayslipEmployee] = useState(null);

  const load = useCallback(async () => {
    if (!activeOrgId || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return;
    setLoading(true);
    try {
      const [payload, directory] = await Promise.all([
        requestJSON('/payroll' + buildQueryString({ orgId: activeOrgId, month }), { forceRefresh: true }),
        requestJSON('/employees' + buildQueryString({ orgId: activeOrgId }), { forceRefresh: true }),
      ]);
      setData(payload);
      setEmployeeDirectory(Array.isArray(directory) ? directory : []);
      const loadedRates = buildEmployeeRateDrafts(payload?.employees);
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
    const payrollRows = Array.isArray(data?.employees) ? data.employees : [];
    const payrollByWorkerId = new Map(payrollRows.filter((employee) => Number(employee?.workerId) > 0).map((employee) => [Number(employee.workerId), employee]));
    const directoryRows = employeeDirectory.filter((employee) => !['PENDING', 'REJECTED'].includes(String(employee?.status || '').toUpperCase()));
    const knownWorkerIds = new Set(directoryRows.map((employee) => Number(employee.id)));
    const rows = [
      ...directoryRows.map((employee) => ({ ...employee, ...(payrollByWorkerId.get(Number(employee.id)) || {}), workerId: Number(employee.id), workerName: employee.name || payrollByWorkerId.get(Number(employee.id))?.workerName, payType: normalizeEmployeePayType(employee.payType) })),
      ...payrollRows.filter((employee) => !knownWorkerIds.has(Number(employee?.workerId))),
    ];
    return rows.map((employee) => {
      const processes = (Array.isArray(employee?.processes) ? employee.processes : []).filter(
        (process) => (!factoryId || Number(process.factoryId) === factoryId) &&
          (!lineId || Number(process.lineId) === lineId)
      );
      const productionAllowance = processes.reduce(
        (sum, process) => sum + Number(process.totalEarnings || 0), 0
      );
      return { ...employee, payType: normalizeEmployeePayType(employee.payType), processes, productionAllowance, productionEarnings: productionAllowance };
    }).filter((employee) => (!factoryId || Number(employee.factoryId) === factoryId || employee.processes.length > 0) && (!lineId || Number(employee.lineId) === lineId || employee.processes.length > 0));
  }, [data?.employees, employeeDirectory, factoryId, lineId]);
  const total = useMemo(
    () => employees.reduce((sum, employee) => sum + productionAllowanceOf(employee), 0),
    [employees]
  );
  const payslipText = languageCode === 'ko' ? {
    title: '월 급여명세서', employee: '직원', payType: '급여 타입', earnings: '지급 항목', amount: '금액',
    base: '기본급', allowance: '일반 수당', production: '생산수당', deductions: '공제', net: '최종 지급액',
    pending: '미계산', notApplicable: '해당 없음', print: '인쇄', close: '닫기', open: '급여표', preview: 'UI 시안',
  } : languageCode === 'vi' ? {
    title: 'Phiếu lương tháng', employee: 'Nhân viên', payType: 'Loại lương', earnings: 'Khoản chi trả', amount: 'Số tiền',
    base: 'Lương cơ bản', allowance: 'Phụ cấp', production: 'Phụ cấp sản lượng', deductions: 'Khấu trừ', net: 'Thực lĩnh',
    pending: 'Chưa tính', notApplicable: 'Không áp dụng', print: 'In', close: 'Đóng', open: 'Phiếu lương', preview: 'Bản xem trước UI',
  } : {
    title: 'Monthly Payslip', employee: 'Employee', payType: 'Pay Type', earnings: 'Earnings', amount: 'Amount',
    base: 'Base Salary', allowance: 'Allowances', production: 'Production Allowance', deductions: 'Deductions', net: 'Net Pay',
    pending: 'Not calculated', notApplicable: 'Not applicable', print: 'Print', close: 'Close', open: 'Payslip', preview: 'UI Preview',
    payrollByEmployee: 'Payroll by Employee', productionSubtotal: 'Production Allowance Subtotal', details: 'Production Details',
  };
  const unifiedPayrollText = languageCode === 'ko'
    ? { payrollByEmployee: '\uC9C1\uC6D0\uBCC4 \uAE09\uC5EC \uACC4\uC0B0', productionSubtotal: '\uC0DD\uC0B0\uC218\uB2F9 \uC18C\uACC4', details: '\uC0DD\uC0B0 \uC0C1\uC138' }
    : languageCode === 'vi'
      ? { payrollByEmployee: 'Tinh luong theo nhan vien', productionSubtotal: 'Tong phu cap san luong', details: 'Chi tiet san luong' }
      : { payrollByEmployee: 'Payroll by Employee', productionSubtotal: 'Production Allowance Subtotal', details: 'Production Details' };
  const handlePrintPayslip = () => {
    if (!payslipEmployee) return;
    const production = payslipEmployee.payType === 'OUTPUT' ? formatDong(productionAllowanceOf(payslipEmployee)) : payslipText.notApplicable;
    const popup = window.open('', '_blank', 'width=820,height=900');
    if (!popup) return;
    popup.document.write(`<!doctype html><html><head><title>${escapePrintText(payslipText.title)} ${escapePrintText(month)}</title><style>body{font-family:Arial,sans-serif;color:#111;padding:36px}h1{font-size:22px;margin:0 0 24px}.meta{display:grid;grid-template-columns:120px 1fr;gap:8px;margin-bottom:24px}table{width:100%;border-collapse:collapse}th,td{padding:11px;border:1px solid #ccc;text-align:left}th:last-child,td:last-child{text-align:right}.total{font-weight:700;background:#f5f5f5}.note{margin-top:18px;color:#666;font-size:12px}@media print{body{padding:0}}</style></head><body><h1>${escapePrintText(payslipText.title)} · ${escapePrintText(month)}</h1><div class="meta"><b>${escapePrintText(payslipText.employee)}</b><span>${escapePrintText(payslipEmployee.workerName || '-')}</span><b>${escapePrintText(payslipText.payType)}</b><span>${escapePrintText(payslipEmployee.payType)}</span></div><table><thead><tr><th>${escapePrintText(payslipText.earnings)}</th><th>${escapePrintText(payslipText.amount)}</th></tr></thead><tbody><tr><td>${escapePrintText(payslipText.base)}</td><td>${escapePrintText(payslipText.pending)}</td></tr><tr><td>${escapePrintText(payslipText.allowance)}</td><td>${escapePrintText(payslipText.pending)}</td></tr><tr><td>${escapePrintText(payslipText.production)}</td><td>${escapePrintText(production)}</td></tr><tr><td>${escapePrintText(payslipText.deductions)}</td><td>${escapePrintText(payslipText.pending)}</td></tr><tr class="total"><td>${escapePrintText(payslipText.net)}</td><td>${escapePrintText(payslipText.pending)}</td></tr></tbody></table><div class="note">${escapePrintText(payslipText.preview)}</div><script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}</script></body></html>`);
    popup.document.close();
  };
  const provisional = data?.isProvisional === true;
  const locked = Boolean(data && !provisional);
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
      const updated = await requestJSON(`/payroll/snapshots/${month}/employee-rates` + buildQueryString({ orgId: activeOrgId }), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }),
      });
      const updatedEmployees = Array.isArray(updated?.data) ? updated.data : [];
      const loadedRates = buildEmployeeRateDrafts(updatedEmployees);
      setData((previous) => ({ ...previous, ...updated, employees: updatedEmployees }));
      setRateDrafts(loadedRates);
      setInitialRates(loadedRates);
      showNotification(text.saveSuccess, 'success');
    } catch (error) {
      showNotification(error?.message || text.saveError, 'error');
    } finally {
      setSavingRates(false);
    }
  };

  const handleLockToggle = async () => {
    if (!data || togglingLock) return;
    const lockText = LOCK_TEXT[languageCode] || LOCK_TEXT.en;
    if (!locked && changedRateWorkerIds.length > 0) {
      showNotification(lockText.saveFirst, 'warning');
      return;
    }
    if (locked && !window.confirm(lockText.unlockConfirm)) return;
    setTogglingLock(true);
    try {
      const updated = await requestJSON(
        `/payroll/snapshots/${month}/${locked ? 'unlock' : 'lock'}` + buildQueryString({ orgId: activeOrgId }),
        locked
          ? { method: 'POST' }
          : {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ lockedBy: activeProfile?.email || activeProfile?.name || 'administrator' }),
            }
      );
      setData((previous) => ({ ...previous, ...updated }));
    } catch (error) {
      showNotification(error?.message || lockText.error, 'error');
    } finally {
      setTogglingLock(false);
    }
  };

  return (
    <AppPageContainer
      title={`${pageTitle} · ${month}`}
      toolbar={<PageToolbar showLastUpdater={false} right={data ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <Tooltip title={(LOCK_TEXT[languageCode] || LOCK_TEXT.en)[locked ? 'lockedHelp' : 'unlockedHelp']}>
            <span>
              <Button
                size="small"
                variant="contained"
                color="inherit"
                startIcon={locked ? <LockOutlinedIcon /> : <LockOpenOutlinedIcon />}
                disabled={togglingLock}
                onClick={handleLockToggle}
                sx={getPayrollLockButtonSx(locked)}
              >
                {(LOCK_TEXT[languageCode] || LOCK_TEXT.en)[locked ? 'locked' : 'unlocked']}
              </Button>
            </span>
          </Tooltip>
          {togglingLock ? <CircularProgress size={16} /> : null}
          <SaveButton
            onClick={handleSaveRates}
            disabled={!provisional || togglingLock || changedRateWorkerIds.length === 0}
            loading={savingRates}
          >
            {text.saveRates}
          </SaveButton>
        </Stack>
      ) : null} />}
    >
      <Box sx={{ width: '100%', maxWidth: 1280 }}>
        {loading ? <Paper variant="outlined" sx={{ p: 3 }}>{text.loading}</Paper> : null}
        {!loading && !data ? <Alert severity="error">{text.fetchError}</Alert> : null}
        {!loading && data && employees.length === 0 ? <Alert severity="info">{text.empty}</Alert> : null}
        {!loading && data && employees.length > 0 ? (
          <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: 'grey.50', display: 'flex', justifyContent: 'space-between', gap: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{unifiedPayrollText.payrollByEmployee}</Typography>
                <Chip size="small" label={`${employees.length}${text.people}`} variant="outlined" />
                <Chip size="small" color={provisional ? 'warning' : 'success'} label={provisional ? text.current : text.confirmed} variant="outlined" />
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{unifiedPayrollText.productionSubtotal} {formatDong(total)}</Typography>
              </Stack>
            </Box>
            <TableContainer><Table size="small">
              <TableHead><TableRow>
                <TableCell>{text.employee}</TableCell>
                <TableCell align="center">{payslipText.payType}</TableCell>
                <TableCell align="right">{payslipText.base}</TableCell>
                <TableCell align="right">{payslipText.allowance}</TableCell>
                <TableCell align="right">{payslipText.production}</TableCell>
                <TableCell align="right">{payslipText.deductions}</TableCell>
                <TableCell align="right">{payslipText.net}</TableCell>
                <TableCell align="center">{payslipText.open}</TableCell>
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
                    <TableCell align="center"><Chip size="small" variant="outlined" label={employee.payType === 'OUTPUT' ? '생산' : '일반'} /></TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{payslipText.pending}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{payslipText.pending}</TableCell>
                    <TableCell align="right">
                      {employee.payType === 'OUTPUT' ? <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatDong(productionAllowanceOf(employee))}</Typography>
                        <Button size="small" onClick={() => setExpandedEmployeeKey(expanded ? null : key)}>{expanded ? text.collapse : unifiedPayrollText.details}</Button>
                      </Stack> : <Typography variant="body2" color="text.secondary">{payslipText.notApplicable}</Typography>}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary' }}>{payslipText.pending}</TableCell>
                    <TableCell align="right" sx={{ color: 'text.secondary', fontWeight: 700 }}>{payslipText.pending}</TableCell>
                    <TableCell align="center"><Button size="small" variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={() => setPayslipEmployee(employee)}>{payslipText.open}</Button></TableCell>
                  </TableRow>
                  <TableRow><TableCell colSpan={8} sx={{ p: 0, borderBottom: expanded ? undefined : 0 }}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      <Box sx={{ p: 2, bgcolor: 'grey.50' }}>
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
                          <Typography variant="caption" color="text.secondary">{text.formula}</Typography>
                          <TextField
                            label={text.appliedRate} size="small" type="number" value={rateDrafts[String(employee.workerId)] ?? ''}
                            disabled={!provisional || savingRates}
                            onChange={(event) => setRateDrafts((previous) => ({ ...previous, [String(employee.workerId)]: event.target.value }))}
                            inputProps={{ min: 0, step: 0.01 }} sx={{ width: 170 }}
                          />
                        </Stack>
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
      <Dialog open={Boolean(payslipEmployee)} onClose={() => setPayslipEmployee(null)} fullWidth maxWidth="sm">
        <DialogTitle><Stack direction="row" spacing={1} alignItems="center"><span>{payslipText.title} · {month}</span><Chip size="small" label={payslipText.preview} variant="outlined" /></Stack></DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 1 }}><Typography color="text.secondary">{payslipText.employee}</Typography><Typography fontWeight={700}>{payslipEmployee?.workerName || '-'}</Typography><Typography color="text.secondary">{payslipText.payType}</Typography><Typography>{payslipEmployee?.payType === 'OUTPUT' ? '생산 (OUTPUT)' : '일반 (GENERAL)'}</Typography></Box>
            <Divider />
            <Table size="small"><TableHead><TableRow><TableCell>{payslipText.earnings}</TableCell><TableCell align="right">{payslipText.amount}</TableCell></TableRow></TableHead><TableBody>
              <TableRow><TableCell>{payslipText.base}</TableCell><TableCell align="right" sx={{ color: 'text.secondary' }}>{payslipText.pending}</TableCell></TableRow>
              <TableRow><TableCell>{payslipText.allowance}</TableCell><TableCell align="right" sx={{ color: 'text.secondary' }}>{payslipText.pending}</TableCell></TableRow>
              <TableRow><TableCell>{payslipText.production}</TableCell><TableCell align="right">{payslipEmployee?.payType === 'OUTPUT' ? formatDong(productionAllowanceOf(payslipEmployee)) : payslipText.notApplicable}</TableCell></TableRow>
              <TableRow><TableCell>{payslipText.deductions}</TableCell><TableCell align="right" sx={{ color: 'text.secondary' }}>{payslipText.pending}</TableCell></TableRow>
              <TableRow sx={{ bgcolor: 'action.hover' }}><TableCell sx={{ fontWeight: 700 }}>{payslipText.net}</TableCell><TableCell align="right" sx={{ fontWeight: 700, color: 'text.secondary' }}>{payslipText.pending}</TableCell></TableRow>
            </TableBody></Table>
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={() => setPayslipEmployee(null)}>{payslipText.close}</Button><Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={handlePrintPayslip}>{payslipText.print}</Button></DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default PayrollEntry;
