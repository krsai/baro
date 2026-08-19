import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, FormControl, FormControlLabel, InputLabel, LinearProgress,
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
    quantity: '주문수량', assigned: '배정수량', progress: '공정 진행률', status: '상태',
    empty: '조건에 맞는 보고서 항목이 없습니다.',
    loadError: '생산 진행 보고서를 불러오지 못했습니다.',
    includeCompleted: '완료 포함',
    styleCount: (total) => `${total}개 스타일`,
    completedCount: (count, total) => `완료 ${count}/${total}`,
    detailToggleOpen: '스타일별 상세 닫기',
    detailToggleClosed: '스타일별 상세 보기',
  },
  en: {
    title: 'Report', customer: 'Customer', allCustomers: 'All customers', search: 'Search order or style',
    print: 'Print / PDF', csv: 'Export CSV', generated: 'As of', order: 'Order', style: 'Style', due: 'Due', quantity: 'Order qty',
    assigned: 'Assigned', progress: 'Process progress', status: 'Status',
    empty: 'No report rows match the filters.',
    loadError: 'Failed to load the production progress report.',
    includeCompleted: 'Include completed',
    styleCount: (total) => `${total} styles`,
    completedCount: (count, total) => `${count}/${total} completed`,
    detailToggleOpen: 'Hide style breakdown',
    detailToggleClosed: 'Show style breakdown',
  },
  vi: {
    title: 'Báo cáo', customer: 'Khách hàng', allCustomers: 'Tất cả khách hàng', search: 'Tìm đơn hàng hoặc kiểu dáng',
    print: 'In / PDF', csv: 'Xuất CSV', generated: 'Thời điểm', order: 'Đơn hàng', style: 'Kiểu dáng', due: 'Hạn giao', quantity: 'Số lượng đơn',
    assigned: 'Đã phân công', progress: 'Tiến độ công đoạn', status: 'Trạng thái',
    empty: 'Không có dữ liệu phù hợp.',
    loadError: 'Không thể tải báo cáo tiến độ sản xuất.',
    includeCompleted: 'Bao gồm đã hoàn thành',
    styleCount: (total) => `${total} kiểu dáng`,
    completedCount: (count, total) => `Hoàn thành ${count}/${total}`,
    detailToggleOpen: 'Ẩn chi tiết theo kiểu dáng',
    detailToggleClosed: 'Xem chi tiết theo kiểu dáng',
  },
};

const STATUS = {
  COMPLETED: { ko: '생산 완료', en: 'Completed', vi: 'Hoàn thành', color: 'success' },
  IN_PROGRESS: { ko: '생산 중', en: 'In production', vi: 'Đang sản xuất', color: 'primary' },
  SCHEDULED: { ko: '배정 완료', en: 'Assigned', vi: 'Đã phân công', color: 'info' },
  UNASSIGNED: { ko: '미배정', en: 'Unassigned', vi: 'Chưa phân công', color: 'default' },
};
// toggle + customer + order + style + due + quantity + assigned + progress + status
const REPORT_COLUMN_COUNT = 9;
const fmt = (value) => Math.max(0, Number(value) || 0).toLocaleString();
const customerLabel = (customer, languageCode) =>
  (languageCode === 'ko' ? customer?.nameKo : languageCode === 'vi' ? customer?.nameVi : null) || customer?.name || '-';
const rowCustomerLabel = (row, languageCode) =>
  (languageCode === 'ko' ? row?.customerNameKo : languageCode === 'vi' ? row?.customerNameVi : null) || row?.customerName || '-';
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
// The backend also reports an internal "REVIEW_REQUIRED" state when per-process
// quantities have not exactly reconciled yet. That is an internal production
// bookkeeping detail, not something a customer needs to see or worry about, so
// it is folded into the ordinary in-production status before it ever reaches
// rendering, grouping, or CSV export below.
const normalizeCustomerFacingStatus = (status) => (status === 'REVIEW_REQUIRED' ? 'IN_PROGRESS' : status);
const resolveOrderStatus = (styles) => {
  if (styles.length > 0 && styles.every((row) => row.status === 'COMPLETED')) return 'COMPLETED';
  if (styles.some((row) => row.status === 'IN_PROGRESS')) return 'IN_PROGRESS';
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
        ? 'UNASSIGNED'
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
      completedStyleCount: styles.filter((row) => row.status === 'COMPLETED').length,
    };
  });
};

const ReportStatusChip = ({ status: statusKey, languageCode }) => {
  const status = STATUS[statusKey] || STATUS.UNASSIGNED;
  return <Chip size="small" label={status[languageCode] || status.en} color={status.color} variant={statusKey === 'COMPLETED' ? 'filled' : 'outlined'} />;
};

const ReportProgressCell = ({ percent }) => (
  <Stack spacing={0.5}>
    <LinearProgress variant="determinate" value={percent} />
    <Typography variant="caption">{percent}%</Typography>
  </Stack>
);

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
    const scopedStyleRows = data.rows
      .filter((row) => !customerId || String(row.customerId) === customerId)
      .map((row) => ({ ...row, status: normalizeCustomerFacingStatus(row.status) }));
    return groupRowsByOrder(scopedStyleRows).filter((row) => {
      if (!includeCompleted && row.status === 'COMPLETED') return false;
      if (!keyword) return true;
      return row.styles.some((styleRow) =>
        [styleRow.orderNumber, styleRow.styleCode, styleRow.styleName]
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

  const exportCsv = () => {
    const headers = [text.customer, text.order, text.style, text.due, text.quantity, text.assigned, text.progress, text.status];
    const lines = [headers, ...rows.map((row) => {
      const soleStyle = row.styles.length === 1 ? row.styles[0] : null;
      const styleLabel = soleStyle
        ? [soleStyle.styleName, soleStyle.styleCode].filter(Boolean).join(' · ')
        : `${text.styleCount(row.styles.length)} · ${text.completedCount(row.completedStyleCount, row.styles.length)}`;
      return [
        rowCustomerLabel(row, languageCode), row.orderNumber, styleLabel, row.dueDate,
        row.orderedQuantity, row.assignedQuantity, `${row.progressPercent}%`,
        STATUS[row.status]?.[languageCode] || row.status,
      ];
    })];
    const blob = new Blob([`﻿${lines.map((line) => line.map(csvCell).join(',')).join('\n')}`], { type: 'text/csv;charset=utf-8' });
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
            <TableHead><TableRow><TableCell sx={{ width: 44 }} /><TableCell>{text.customer}</TableCell><TableCell>{text.order}</TableCell><TableCell>{text.style}</TableCell><TableCell>{text.due}</TableCell><TableCell align="right">{text.quantity}</TableCell><TableCell align="right">{text.assigned}</TableCell><TableCell sx={{ minWidth: 150 }}>{text.progress}</TableCell><TableCell>{text.status}</TableCell></TableRow></TableHead>
            <TableBody>{rows.map((row) => {
              const hasMultipleStyles = row.styles.length > 1;
              const expanded = hasMultipleStyles && expandedOrders.has(row.key);
              const soleStyle = hasMultipleStyles ? null : row.styles[0];
              return <React.Fragment key={row.key}>
                <TableRow hover sx={{ '& > td': { backgroundColor: expanded ? '#f4f8ff' : undefined } }}>
                  <TableCell sx={{ width: 44 }}>
                    {hasMultipleStyles
                      ? <IconButton size="small" onClick={() => toggleOrder(row.key)} aria-label={expanded ? text.detailToggleOpen : text.detailToggleClosed}>
                          {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      : null}
                  </TableCell>
                  <TableCell>{rowCustomerLabel(row, languageCode)}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{row.orderNumber}</TableCell>
                  <TableCell>
                    {hasMultipleStyles
                      ? <Stack spacing={0.25}>
                          <Typography variant="body2" fontWeight={600}>{text.styleCount(row.styles.length)}</Typography>
                          <Typography variant="caption" color="text.secondary">{text.completedCount(row.completedStyleCount, row.styles.length)}</Typography>
                        </Stack>
                      : [soleStyle?.styleName, soleStyle?.styleCode].filter(Boolean).join(' · ') || '-'}
                  </TableCell>
                  <TableCell>{row.dueDate || '-'}</TableCell>
                  <TableCell align="right">{fmt(row.orderedQuantity)}</TableCell>
                  <TableCell align="right">{fmt(row.assignedQuantity)}{row.unassignedQuantity > 0 ? <Typography variant="caption" color="warning.main" display="block">-{fmt(row.unassignedQuantity)}</Typography> : null}</TableCell>
                  <TableCell sx={{ minWidth: 150 }}><ReportProgressCell percent={row.progressPercent} /></TableCell>
                  <TableCell><ReportStatusChip status={row.status} languageCode={languageCode} /></TableCell>
                </TableRow>
                {hasMultipleStyles ? <TableRow>
                  <TableCell colSpan={REPORT_COLUMN_COUNT} sx={{ p: 0, borderBottom: expanded ? undefined : 'none' }}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      <Box sx={{ m: 1.5, ml: 7, mr: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ '& > th': { bgcolor: 'grey.50', fontSize: 12, fontWeight: 700, color: 'text.secondary' } }}>
                              <TableCell>{text.style}</TableCell>
                              <TableCell>{text.due}</TableCell>
                              <TableCell align="right">{text.quantity}</TableCell>
                              <TableCell align="right">{text.assigned}</TableCell>
                              <TableCell sx={{ minWidth: 150 }}>{text.progress}</TableCell>
                              <TableCell>{text.status}</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>{row.styles.map((styleRow) =>
                            <TableRow key={`${styleRow.orderId}:${styleRow.styleId || styleRow.styleCode}`} sx={{ '&:last-child td': { borderBottom: 0 } }}>
                              <TableCell>{[styleRow.styleName, styleRow.styleCode].filter(Boolean).join(' · ') || '-'}</TableCell>
                              <TableCell>{styleRow.dueDate || '-'}</TableCell>
                              <TableCell align="right">{fmt(styleRow.orderedQuantity)}</TableCell>
                              <TableCell align="right">{fmt(styleRow.assignedQuantity)}{styleRow.unassignedQuantity > 0 ? <Typography variant="caption" color="warning.main" display="block">-{fmt(styleRow.unassignedQuantity)}</Typography> : null}</TableCell>
                              <TableCell sx={{ minWidth: 150 }}><ReportProgressCell percent={styleRow.progressPercent} /></TableCell>
                              <TableCell><ReportStatusChip status={styleRow.status} languageCode={languageCode} /></TableCell>
                            </TableRow>
                          )}</TableBody>
                        </Table>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow> : null}
              </React.Fragment>;
            })}</TableBody>
          </Table>
        </TableContainer>}
    </Stack>
  </AppPageContainer>;
};

export default CustomerProductionReport;
