import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, FormControlLabel, InputLabel, LinearProgress,
  IconButton, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography, Switch,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import DownloadIcon from '@mui/icons-material/Download';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AppPageContainer from '../../components/AppPageContainer';
import PageToolbar from '../../components/PageToolbar';
import SearchInput from '../../components/SearchInput';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import { WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const TEXT = {
  ko: {
    title: '보고서', customer: '고객', allCustomers: '전체 고객', search: '주문번호·스타일 검색',
    print: '인쇄 / PDF', csv: 'CSV 내보내기', generated: '기준 시각', order: '주문번호', style: '스타일', due: '납기',
    quantity: '주문수량', assigned: '배정수량', progress: '공정 진행률', lastWork: '최근 작업기록',
    estimate: '예상 완료일', status: '상태', basis: '예측 근거', empty: '조건에 맞는 보고서 항목이 없습니다.',
    review: '일정 검토 필요', monthlySummary: '월 합계 기록 기반',
    loadError: '생산 진행 보고서를 불러오지 못했습니다.',
    includeCompleted: '완료 포함',
  },
  en: {
    title: 'Report', customer: 'Customer', allCustomers: 'All customers', search: 'Search order or style',
    print: 'Print / PDF', csv: 'Export CSV', generated: 'As of', order: 'Order', style: 'Style', due: 'Due', quantity: 'Order qty',
    assigned: 'Assigned', progress: 'Process progress', lastWork: 'Latest record', estimate: 'Estimated completion',
    status: 'Status', basis: 'Estimate basis', empty: 'No report rows match the filters.',
    review: 'schedule review required', monthlySummary: 'monthly summary data',
    loadError: 'Failed to load the production progress report.',
    includeCompleted: 'Include completed',
  },
  vi: {
    title: 'Báo cáo', customer: 'Khách hàng', allCustomers: 'Tất cả khách hàng', search: 'Tìm đơn hàng hoặc kiểu dáng',
    print: 'In / PDF', csv: 'Xuất CSV', generated: 'Thời điểm', order: 'Đơn hàng', style: 'Kiểu dáng', due: 'Hạn giao', quantity: 'Số lượng đơn',
    assigned: 'Đã phân công', progress: 'Tiến độ công đoạn', lastWork: 'Ghi nhận gần nhất', estimate: 'Dự kiến hoàn thành',
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
  WORKLOG_PROGRESS_RATE: { ko: '실제 작업속도 기준', en: 'Observed production rate', vi: 'Theo tốc độ sản xuất thực tế' },
  LINE_SCHEDULE: { ko: '라인 배정 일정', en: 'Line schedule', vi: 'Lịch chuyền' },
  ASSIGNMENT_REQUIRED: { ko: '배정 후 예측 가능', en: 'Assignment required', vi: 'Cần phân công để dự báo' },
};
const fmt = (value) => Math.max(0, Number(value) || 0).toLocaleString();
const customerLabel = (customer, languageCode) =>
  (languageCode === 'ko' ? customer?.nameKo : languageCode === 'vi' ? customer?.nameVi : null) || customer?.name || '-';
const rowCustomerLabel = (row, languageCode) =>
  (languageCode === 'ko' ? row?.customerNameKo : languageCode === 'vi' ? row?.customerNameVi : null) || row?.customerName || '-';
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const latestDate = (rows, field) => rows.map((row) => row?.[field]).filter(Boolean).sort().at(-1) || null;
const resolveOrderStatus = (styles) => {
  if (styles.length > 0 && styles.every((row) => row.status === 'COMPLETED')) return 'COMPLETED';
  if (styles.some((row) => row.status === 'IN_PROGRESS')) return 'IN_PROGRESS';
  if (styles.some((row) => row.status === 'PARTIALLY_ASSIGNED')) return 'PARTIALLY_ASSIGNED';
  if (styles.some((row) => row.status === 'SCHEDULED')) return 'SCHEDULED';
  return 'UNASSIGNED';
};
const groupRowsByOrder = (styleRows) => {
  const groups = new Map();
  styleRows.forEach((row) => {
    const key = `${row.customerId ?? 'none'}:${row.orderId || row.orderNumber}`;
    const styles = groups.get(key) || [];
    styles.push(row);
    groups.set(key, styles);
  });
  return Array.from(groups.entries()).map(([key, styles]) => {
    const first = styles[0];
    const orderedQuantity = styles.reduce((sum, row) => sum + Math.max(0, Number(row.orderedQuantity) || 0), 0);
    const progressWeight = styles.reduce((sum, row) => sum + Math.max(0, Number(row.orderedQuantity) || 0), 0);
    const weightedProgress = styles.reduce(
      (sum, row) => sum + Math.max(0, Number(row.orderedQuantity) || 0) * Math.max(0, Number(row.progressPercent) || 0),
      0
    );
    const assignedQuantity = styles.reduce((sum, row) => sum + Math.max(0, Number(row.assignedQuantity) || 0), 0);
    const status = assignedQuantity <= 0
      ? 'UNASSIGNED'
      : assignedQuantity < orderedQuantity
        ? 'PARTIALLY_ASSIGNED'
        : resolveOrderStatus(styles);
    return {
      ...first,
      key,
      styles,
      status,
      orderedQuantity,
      assignedQuantity,
      unassignedQuantity: styles.reduce((sum, row) => sum + Math.max(0, Number(row.unassignedQuantity) || 0), 0),
      progressPercent: progressWeight > 0 ? Math.round(weightedProgress / progressWeight) : 0,
      lastWorkDate: latestDate(styles, 'lastWorkDate'),
      estimatedCompletionDate: styles.every((row) => row.estimatedCompletionDate)
        ? latestDate(styles, 'estimatedCompletionDate')
        : null,
      reviewRequired: styles.some((row) => row.reviewRequired),
      hasMonthlySummaryRecords: styles.some((row) => row.hasMonthlySummaryRecords),
      estimateBasis: status === 'COMPLETED'
        ? 'ACTUAL_COMPLETION'
        : styles.some((row) => row.estimateBasis === 'WORKLOG_PROGRESS_RATE')
          ? 'WORKLOG_PROGRESS_RATE'
          : styles.some((row) => row.estimateBasis === 'ASSIGNMENT_REQUIRED')
            ? 'ASSIGNMENT_REQUIRED'
            : 'LINE_SCHEDULE',
    };
  });
};

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
  const [expandedOrders, setExpandedOrders] = useState(() => new Set());

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
    const scopedStyleRows = data.rows.filter(
      (row) => !customerId || String(row.customerId) === customerId
    );
    return groupRowsByOrder(scopedStyleRows).filter((order) => {
      if (!includeCompleted && order.status === 'COMPLETED') return false;
      if (!keyword) return true;
      return order.styles.some((row) =>
        [row.orderNumber, row.styleCode, row.styleName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword)
      );
    });
  }, [customerId, data.rows, includeCompleted, search]);
  const selectedCustomer = data.customers.find((item) => String(item.id) === customerId) || null;
  const toggleOrder = useCallback((key) => {
    setExpandedOrders((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  const renderDataCells = (row, { detail = false } = {}) => {
    const status = STATUS[row.status] || STATUS.UNASSIGNED;
    return <>
      <TableCell>{detail ? '' : rowCustomerLabel(row, languageCode)}</TableCell>
      <TableCell sx={{ fontWeight: detail ? 400 : 700 }}>{detail ? '' : row.orderNumber}</TableCell>
      <TableCell sx={detail ? { pl: 3 } : undefined}>
        {detail
          ? [row.styleCode, row.styleName].filter(Boolean).join(' · ') || '-'
          : `${row.styles.length.toLocaleString()} ${text.style}`}
      </TableCell>
      <TableCell>{row.dueDate || '-'}</TableCell>
      <TableCell align="right">{fmt(row.orderedQuantity)}</TableCell>
      <TableCell align="right">{fmt(row.assignedQuantity)}{row.unassignedQuantity > 0 ? <Typography variant="caption" color="warning.main" display="block">-{fmt(row.unassignedQuantity)}</Typography> : null}</TableCell>
      <TableCell><Stack spacing={0.5}><LinearProgress variant="determinate" value={row.progressPercent} color={row.reviewRequired ? 'error' : 'primary'} /><Typography variant="caption">{row.progressPercent}%{row.reviewRequired ? ` · ${text.review}` : ''}</Typography></Stack></TableCell>
      <TableCell>{row.lastWorkDate || '-'}</TableCell>
      <TableCell sx={{ fontWeight: 700 }}>{row.estimatedCompletionDate || '-'}</TableCell>
      <TableCell><Chip size="small" label={status[languageCode] || status.en} color={status.color} variant={row.status === 'COMPLETED' ? 'filled' : 'outlined'} /></TableCell>
      <TableCell><Stack spacing={0.25}><Typography variant="body2">{BASIS[row.estimateBasis]?.[languageCode] || row.estimateBasis}</Typography>{row.hasMonthlySummaryRecords ? <Typography variant="caption" color="warning.main">{text.monthlySummary}</Typography> : null}</Stack></TableCell>
    </>;
  };

  const exportCsv = () => {
    const headers = [text.customer, text.order, text.style, text.due, text.quantity, text.assigned, text.progress, text.lastWork, text.estimate, text.status, text.basis];
    const lines = [headers, ...rows.map((row) => [rowCustomerLabel(row, languageCode), row.orderNumber, `${row.styles.length} ${text.style}`, row.dueDate, row.orderedQuantity, row.assignedQuantity, `${row.progressPercent}%`, row.lastWorkDate, row.estimatedCompletionDate, (STATUS[row.status]?.[languageCode] || row.status), [BASIS[row.estimateBasis]?.[languageCode] || row.estimateBasis, row.hasMonthlySummaryRecords ? text.monthlySummary : null, row.reviewRequired ? text.review : null].filter(Boolean).join(' · ')])];
    const blob = new Blob([`\uFEFF${lines.map((line) => line.map(csvCell).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `production-report-${selectedCustomer?.name || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click();
    URL.revokeObjectURL(url);
  };

  return <AppPageContainer
    title={text.title}
    titleActions={<Stack direction="row" spacing={1} className="report-screen-actions"><Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportCsv} disabled={!rows.length}>{text.csv}</Button><Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!rows.length}>{text.print}</Button></Stack>}
    toolbar={<PageToolbar className="report-screen-actions" showLastUpdater={false} left={<SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} sx={{ width: { xs: '100%', sm: 320 } }} />} right={<><FormControlLabel control={<Switch size="small" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />} label={text.includeCompleted} sx={{ whiteSpace: 'nowrap', m: 0 }} /><FormControl size="small" sx={{ width: { xs: '100%', sm: 220 }, flexShrink: 0 }}><InputLabel shrink>{text.customer}</InputLabel><Select value={customerId} label={text.customer} displayEmpty onChange={(event) => setCustomerId(event.target.value)} renderValue={(value) => value ? customerLabel(data.customers.find((customer) => String(customer.id) === String(value)), languageCode) : text.allCustomers}><MenuItem value="">{text.allCustomers}</MenuItem>{data.customers.map((customer) => <MenuItem key={customer.id} value={String(customer.id)}>{customerLabel(customer, languageCode)}</MenuItem>)}</Select></FormControl></>} />}
  >
    <style>{`@media print { .report-screen-actions, nav, header, aside { display:none!important; } body { background:#fff!important; } .customer-production-report { padding:0!important; } }`}</style>
    <Stack spacing={2} className="customer-production-report">
      <Box><Typography variant="h5" fontWeight={800}>{selectedCustomer ? customerLabel(selectedCustomer, languageCode) : text.allCustomers}</Typography><Typography variant="caption" color="text.secondary">{text.generated}: {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}</Typography></Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={30} /></Box> : rows.length === 0 ? <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}><Typography color="text.secondary">{text.empty}</Typography></Paper> :
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell sx={{ width: 44 }} /><TableCell>{text.customer}</TableCell><TableCell>{text.order}</TableCell><TableCell>{text.style}</TableCell><TableCell>{text.due}</TableCell><TableCell align="right">{text.quantity}</TableCell><TableCell align="right">{text.assigned}</TableCell><TableCell sx={{ minWidth: 150 }}>{text.progress}</TableCell><TableCell>{text.lastWork}</TableCell><TableCell>{text.estimate}</TableCell><TableCell>{text.status}</TableCell><TableCell>{text.basis}</TableCell></TableRow></TableHead>
            <TableBody>{rows.map((row) => {
              const expanded = expandedOrders.has(row.key);
              return <React.Fragment key={row.key}>
                <TableRow hover sx={{ '& > td': { backgroundColor: expanded ? '#f4f8ff' : undefined } }}>
                  <TableCell>
                    <IconButton size="small" onClick={() => toggleOrder(row.key)} aria-label={expanded ? '상세 닫기' : '상세 보기'}>
                      {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                    </IconButton>
                  </TableCell>
                  {renderDataCells(row)}
                </TableRow>
                {expanded ? row.styles.map((styleRow) => <TableRow
                  key={`${styleRow.orderId}:${styleRow.styleId || styleRow.styleCode}`}
                  sx={{ '& > td': { backgroundColor: '#fafafa' } }}
                >
                  <TableCell />
                  {renderDataCells(styleRow, { detail: true })}
                </TableRow>) : null}
              </React.Fragment>;
            })}</TableBody>
          </Table>
        </TableContainer>}
    </Stack>
  </AppPageContainer>;
};

export default CustomerProductionReport;
