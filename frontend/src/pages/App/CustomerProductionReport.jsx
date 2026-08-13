import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, FormControlLabel, InputLabel, LinearProgress,
  MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Typography, Switch,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import AppPageContainer from '../../components/AppPageContainer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import { WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const TEXT = {
  ko: {
    title: '고객 생산 진행 보고서', customer: '고객', allCustomers: '전체 고객', search: '주문번호·스타일 검색',
    print: '인쇄 / PDF', csv: 'CSV 내보내기', generated: '기준 시각', order: '주문번호', style: '스타일', due: '납기',
    quantity: '주문수량', assigned: '배정수량', produced: '확인 생산수량', progress: '공정 진행률', lastWork: '최근 작업기록',
    estimate: '예상 완료일', status: '상태', basis: '예측 근거', empty: '조건에 맞는 보고서 항목이 없습니다.',
    review: '일정 검토 필요', monthlySummary: '월 합계 기록 기반',
    loadError: '생산 진행 보고서를 불러오지 못했습니다.',
    includeCompleted: '완료 포함',
  },
  en: {
    title: 'Customer Production Progress Report', customer: 'Customer', allCustomers: 'All customers', search: 'Search order or style',
    print: 'Print / PDF', csv: 'Export CSV', generated: 'As of', order: 'Order', style: 'Style', due: 'Due', quantity: 'Order qty',
    assigned: 'Assigned', produced: 'Verified output', progress: 'Process progress', lastWork: 'Latest record', estimate: 'Estimated completion',
    status: 'Status', basis: 'Estimate basis', empty: 'No report rows match the filters.',
    review: 'schedule review required', monthlySummary: 'monthly summary data',
    loadError: 'Failed to load the production progress report.',
    includeCompleted: 'Include completed',
  },
  vi: {
    title: 'Báo cáo tiến độ sản xuất khách hàng', customer: 'Khách hàng', allCustomers: 'Tất cả khách hàng', search: 'Tìm đơn hàng hoặc kiểu dáng',
    print: 'In / PDF', csv: 'Xuất CSV', generated: 'Thời điểm', order: 'Đơn hàng', style: 'Kiểu dáng', due: 'Hạn giao', quantity: 'Số lượng đơn',
    assigned: 'Đã phân công', produced: 'Sản lượng xác nhận', progress: 'Tiến độ công đoạn', lastWork: 'Ghi nhận gần nhất', estimate: 'Dự kiến hoàn thành',
    status: 'Trạng thái', basis: 'Cơ sở dự báo', empty: 'Không có dữ liệu phù hợp.',
    review: 'cần xem lại lịch', monthlySummary: 'dữ liệu tổng hợp tháng',
    loadError: 'Không thể tải báo cáo tiến độ sản xuất.',
    includeCompleted: 'Bao gồm đã hoàn thành',
  },
};

const STATUS = {
  COMPLETED: { ko: '생산 완료', en: 'Completed', vi: 'Hoàn thành', color: 'success' },
  IN_PROGRESS: { ko: '생산 중', en: 'In production', vi: 'Đang sản xuất', color: 'primary' },
  SCHEDULED: { ko: '배정 완료·미착수', en: 'Scheduled', vi: 'Đã lên lịch', color: 'info' },
  PARTIALLY_ASSIGNED: { ko: '일부 미배정', en: 'Partially assigned', vi: 'Phân công một phần', color: 'warning' },
  UNASSIGNED: { ko: '미배정', en: 'Unassigned', vi: 'Chưa phân công', color: 'default' },
};
const BASIS = {
  ACTUAL_COMPLETION: { ko: '실제 완료', en: 'Actual completion', vi: 'Hoàn thành thực tế' },
  ST_DURATION_FROM_ACTUAL_START: { ko: '실제 시작일 + ST 소요일수', en: 'Actual start + ST duration', vi: 'Ngày bắt đầu thực tế + thời lượng ST' },
  LINE_SCHEDULE: { ko: '라인 배정 일정', en: 'Line schedule', vi: 'Lịch chuyền' },
  ASSIGNMENT_REQUIRED: { ko: '배정 후 예측 가능', en: 'Assignment required', vi: 'Cần phân công để dự báo' },
};
const fmt = (value) => Math.max(0, Number(value) || 0).toLocaleString();
const customerLabel = (customer, languageCode) =>
  (languageCode === 'ko' ? customer?.nameKo : languageCode === 'vi' ? customer?.nameVi : null) || customer?.name || '-';
const rowCustomerLabel = (row, languageCode) =>
  (languageCode === 'ko' ? row?.customerNameKo : languageCode === 'vi' ? row?.customerNameVi : null) || row?.customerName || '-';
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

const CustomerProductionReport = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const text = TEXT[languageCode] || TEXT.en;
  const [data, setData] = useState({ customers: [], rows: [], generatedAt: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [includeCompleted, setIncludeCompleted] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await requestJSON(`/customer-production-reports${buildQueryString({ orgId: activeOrgId })}`, {
        skipGlobalLoading: true, skipCache: true, forceRefresh: true,
      });
      setData({ customers: result?.customers || [], rows: result?.rows || [], generatedAt: result?.generatedAt || null });
    } catch (loadError) {
      setError(loadError?.message || text.loadError);
    } finally { setLoading(false); }
  }, [activeOrgId, text.loadError]);

  useEffect(() => { void load(); }, [load]);
  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: [WORKSPACE_DATA_TOPICS.ORDERS, WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD],
    onRefresh: load,
  });

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (!includeCompleted && row.status === 'COMPLETED') return false;
      if (customerId && String(row.customerId) !== customerId) return false;
      if (!keyword) return true;
      return [row.orderNumber, row.styleCode, row.styleName].filter(Boolean).join(' ').toLowerCase().includes(keyword);
    });
  }, [customerId, data.rows, includeCompleted, search]);
  const selectedCustomer = data.customers.find((item) => String(item.id) === customerId) || null;

  const exportCsv = () => {
    const headers = [text.customer, text.order, text.style, text.due, text.quantity, text.assigned, text.produced, text.progress, text.lastWork, text.estimate, text.status, text.basis];
    const lines = [headers, ...rows.map((row) => [rowCustomerLabel(row, languageCode), row.orderNumber, [row.styleCode, row.styleName].filter(Boolean).join(' · '), row.dueDate, row.orderedQuantity, row.assignedQuantity, row.producedQuantity, `${row.progressPercent}%`, row.lastWorkDate, row.estimatedCompletionDate, (STATUS[row.status]?.[languageCode] || row.status), [BASIS[row.estimateBasis]?.[languageCode] || row.estimateBasis, row.hasMonthlySummaryRecords ? text.monthlySummary : null, row.reviewRequired ? text.review : null].filter(Boolean).join(' · ')])];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `production-report-${selectedCustomer?.name || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  };

  return <AppPageContainer
    title={text.title}
    titleActions={<Stack direction="row" spacing={1} className="report-screen-actions"><Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!rows.length}>{text.csv}</Button><Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!rows.length}>{text.print}</Button></Stack>}
    toolbar={<Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="flex-end" alignItems={{ xs: 'stretch', md: 'center' }} className="report-screen-actions"><TextField size="small" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} sx={{ mr: 'auto', width: { xs: '100%', md: 320 } }} /><FormControlLabel control={<Switch size="small" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />} label={text.includeCompleted} sx={{ whiteSpace: 'nowrap' }} /><FormControl size="small" sx={{ minWidth: 220 }}><InputLabel>{text.customer}</InputLabel><Select value={customerId} label={text.customer} onChange={(event) => setCustomerId(event.target.value)}><MenuItem value="">{text.allCustomers}</MenuItem>{data.customers.map((customer) => <MenuItem key={customer.id} value={String(customer.id)}>{customerLabel(customer, languageCode)}</MenuItem>)}</Select></FormControl></Stack>}
  >
    <style>{`@media print { .report-screen-actions, nav, header, aside { display:none!important; } body { background:#fff!important; } .customer-production-report { padding:0!important; } }`}</style>
    <Stack spacing={2} className="customer-production-report">
      <Box><Typography variant="h5" fontWeight={800}>{selectedCustomer ? customerLabel(selectedCustomer, languageCode) : text.title}</Typography><Typography variant="caption" color="text.secondary">{text.generated}: {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}</Typography></Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={30} /></Box> : rows.length === 0 ? <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}><Typography color="text.secondary">{text.empty}</Typography></Paper> :
        <TableContainer component={Paper} variant="outlined"><Table size="small"><TableHead><TableRow><TableCell>{text.customer}</TableCell><TableCell>{text.order}</TableCell><TableCell>{text.style}</TableCell><TableCell>{text.due}</TableCell><TableCell align="right">{text.quantity}</TableCell><TableCell align="right">{text.assigned}</TableCell><TableCell align="right">{text.produced}</TableCell><TableCell sx={{ minWidth: 150 }}>{text.progress}</TableCell><TableCell>{text.lastWork}</TableCell><TableCell>{text.estimate}</TableCell><TableCell>{text.status}</TableCell><TableCell>{text.basis}</TableCell></TableRow></TableHead><TableBody>{rows.map((row) => { const status = STATUS[row.status] || STATUS.UNASSIGNED; return <TableRow key={`${row.orderId}:${row.styleId || row.styleCode}`}><TableCell>{rowCustomerLabel(row, languageCode)}</TableCell><TableCell sx={{ fontWeight: 700 }}>{row.orderNumber}</TableCell><TableCell>{[row.styleCode, row.styleName].filter(Boolean).join(' · ') || '-'}</TableCell><TableCell>{row.dueDate || '-'}</TableCell><TableCell align="right">{fmt(row.orderedQuantity)}</TableCell><TableCell align="right">{fmt(row.assignedQuantity)}{row.unassignedQuantity > 0 ? <Typography variant="caption" color="warning.main" display="block">-{fmt(row.unassignedQuantity)}</Typography> : null}</TableCell><TableCell align="right">{fmt(row.producedQuantity)}</TableCell><TableCell><Stack spacing={0.5}><LinearProgress variant="determinate" value={row.progressPercent} color={row.reviewRequired ? 'error' : 'primary'} /><Typography variant="caption">{row.progressPercent}%{row.reviewRequired ? ` · ${text.review}` : ''}</Typography></Stack></TableCell><TableCell>{row.lastWorkDate || '-'}</TableCell><TableCell sx={{ fontWeight: 700 }}>{row.estimatedCompletionDate || '-'}</TableCell><TableCell><Chip size="small" label={status[languageCode] || status.en} color={status.color} variant={row.status === 'COMPLETED' ? 'filled' : 'outlined'} /></TableCell><TableCell><Stack spacing={0.25}><Typography variant="body2">{BASIS[row.estimateBasis]?.[languageCode] || row.estimateBasis}</Typography>{row.hasMonthlySummaryRecords ? <Typography variant="caption" color="warning.main">{text.monthlySummary}</Typography> : null}</Stack></TableCell></TableRow>; })}</TableBody></Table></TableContainer>}
    </Stack>
  </AppPageContainer>;
};

export default CustomerProductionReport;
