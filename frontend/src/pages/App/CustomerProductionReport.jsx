import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, GlobalStyles, InputLabel,
  LinearProgress, IconButton, Menu, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, Switch,
} from '@mui/material';
import PrintIcon from '@mui/icons-material/Print';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import AppPageContainer from '../../components/AppPageContainer';
import PageToolbar from '../../components/PageToolbar';
import SearchInput from '../../components/SearchInput';
import QuantityReviewDrawer from '../../components/QuantityReviewDrawer';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../utils/apiClient';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import { WORKSPACE_DATA_TOPICS } from '../../utils/workspaceDataEvents';

const TEXT = {
  ko: {
    title: '보고서', customer: '고객', allCustomers: '전체 고객', search: '주문번호·스타일 검색',
    print: '인쇄 / PDF', generated: '기준 시각', order: '주문번호', style: '스타일', due: '납기',
    quantity: '주문수량', produced: '완성품 수량', progress: '공정 진행률', status: '상태',
    empty: '조건에 맞는 보고서 항목이 없습니다.',
    loadError: '생산 진행 보고서를 불러오지 못했습니다.',
    includeCompleted: '완료 포함',
    completedCount: (count, total) => `완료 ${count}/${total}`,
    detailToggleOpen: '스타일별 상세 닫기',
    detailToggleClosed: '스타일별 상세 보기',
    dailyProduced: '일일 내역', dailyProducedTitle: '일일 완성품 수량', date: '날짜', close: '닫기', noDailyProduced: '등록된 일일 완성품 내역이 없습니다.',
  },
  en: {
    title: 'Report', customer: 'Customer', allCustomers: 'All customers', search: 'Search order or style',
    print: 'Print / PDF', generated: 'As of', order: 'Order', style: 'Style', due: 'Due', quantity: 'Order qty',
    produced: 'Finished qty', progress: 'Process progress', status: 'Status',
    empty: 'No report rows match the filters.',
    loadError: 'Failed to load the production progress report.',
    includeCompleted: 'Include completed',
    completedCount: (count, total) => `${count}/${total} completed`,
    detailToggleOpen: 'Hide style breakdown',
    detailToggleClosed: 'Show style breakdown',
    dailyProduced: 'Daily details', dailyProducedTitle: 'Daily finished quantity', date: 'Date', close: 'Close', noDailyProduced: 'No daily finished quantities are recorded.',
  },
  vi: {
    title: 'Báo cáo', customer: 'Khách hàng', allCustomers: 'Tất cả khách hàng', search: 'Tìm đơn hàng hoặc kiểu dáng',
    print: 'In / PDF', generated: 'Thời điểm', order: 'Đơn hàng', style: 'Kiểu dáng', due: 'Hạn giao', quantity: 'Số lượng đơn',
    produced: 'Số lượng thành phẩm', progress: 'Tiến độ công đoạn', status: 'Trạng thái',
    empty: 'Không có dữ liệu phù hợp.',
    loadError: 'Không thể tải báo cáo tiến độ sản xuất.',
    includeCompleted: 'Bao gồm đã hoàn thành',
    completedCount: (count, total) => `Hoàn thành ${count}/${total}`,
    detailToggleOpen: 'Ẩn chi tiết theo kiểu dáng',
    detailToggleClosed: 'Xem chi tiết theo kiểu dáng',
    dailyProduced: 'Chi tiết ngày', dailyProducedTitle: 'Số lượng thành phẩm theo ngày', date: 'Ngày', close: 'Đóng', noDailyProduced: 'Không có số lượng thành phẩm theo ngày.',
  },
};

const STATUS = {
  COMPLETED: { ko: '생산 완료', en: 'Completed', vi: 'Hoàn thành', color: 'success' },
  IN_PROGRESS: { ko: '생산 중', en: 'In production', vi: 'Đang sản xuất', color: 'primary' },
  SCHEDULED: { ko: '배정 완료', en: 'Assigned', vi: 'Đã phân công', color: 'info' },
  UNASSIGNED: { ko: '미배정', en: 'Unassigned', vi: 'Chưa phân công', color: 'default' },
};
// toggle + customer + order + style + due + quantity + produced + progress + status
const REPORT_COLUMN_COUNT = 9;
const fmt = (value) => Math.max(0, Number(value) || 0).toLocaleString();
const formatReportDate = (date, languageCode) => {
  const locale = languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US';
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))
    ? new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
    : date || '-';
};
const customerLabel = (customer, languageCode) =>
  (languageCode === 'ko' ? customer?.nameKo : languageCode === 'vi' ? customer?.nameVi : null) || customer?.name || '-';
const rowCustomerLabel = (row, languageCode) =>
  (languageCode === 'ko' ? row?.customerNameKo : languageCode === 'vi' ? row?.customerNameVi : null) || row?.customerName || '-';
// Matches OrderList.jsx's formatStyleSummary: "AJ1527 외 9개" instead of a bare
// count, so a multi-style order reads the same way here as it does on the
// order screen.
const resolveStyleSummaryLabel = (styles, languageCode) => {
  const names = (Array.isArray(styles) ? styles : [])
    .map((row) => String(row?.styleName || row?.styleCode || '').trim())
    .filter(Boolean);
  if (names.length === 0) return '-';
  if (names.length === 1) return names[0];
  const remaining = names.length - 1;
  if (languageCode === 'vi') return `${names[0]} + ${remaining} style`;
  if (languageCode === 'en') return `${names[0]} + ${remaining} styles`;
  return `${names[0]} 외 ${remaining}개`;
};
// The backend also reports an internal "REVIEW_REQUIRED" state when per-process
// quantities have not exactly reconciled yet. That is an internal production
// bookkeeping detail, not something a customer needs to see or worry about, so
// it is folded into the ordinary in-production status before it ever reaches
// rendering or grouping below.
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
    const producedQuantity = styles.reduce((sum, row) => sum + Math.max(0, Number(row.producedQuantity) || 0), 0);
    const dailyProducedByDate = new Map();
    styles.forEach((row) => (Array.isArray(row.dailyProducedQuantities) ? row.dailyProducedQuantities : []).forEach((daily) => {
      const date = String(daily?.date || '');
      const quantity = Math.max(0, Number(daily?.quantity) || 0);
      if (date && quantity > 0) dailyProducedByDate.set(date, (dailyProducedByDate.get(date) || 0) + quantity);
    }));
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
      producedQuantity,
      dailyProducedQuantities: Array.from(dailyProducedByDate.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, quantity]) => ({ date, quantity })),
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
  const [contextMenuState, setContextMenuState] = useState(null);
  const [activeQuantityReviewRow, setActiveQuantityReviewRow] = useState(null);
  const [dailyProducedRow, setDailyProducedRow] = useState(null);

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
  const handleRowContextMenu = useCallback((event, styleRow) => {
    event.preventDefault();
    setContextMenuState({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
      styleRow,
    });
  }, []);
  const handleContextMenuClose = useCallback(() => setContextMenuState(null), []);
  const contextMenuExternalId = useMemo(() => {
    const ids = contextMenuState?.styleRow?.assignmentPlanExternalIds;
    return Array.isArray(ids) && ids.length === 1 ? ids[0] : null;
  }, [contextMenuState]);
  const handleContextOpenQuantityReview = useCallback(() => {
    if (!contextMenuExternalId || !contextMenuState?.styleRow) return;
    setActiveQuantityReviewRow(contextMenuState.styleRow);
    setContextMenuState(null);
  }, [contextMenuExternalId, contextMenuState]);
  const handleCloseQuantityReview = useCallback(() => setActiveQuantityReviewRow(null), []);

  return <AppPageContainer
    title={text.title}
    titleActions={<Stack direction="row" spacing={1} className="report-screen-actions"><Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()} disabled={!rows.length}>{text.print}</Button></Stack>}
    toolbar={<PageToolbar className="report-screen-actions" showLastUpdater={false} left={<SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} sx={{ width: { xs: '100%', sm: 320 } }} />} right={<><FormControlLabel control={<Switch size="small" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />} label={text.includeCompleted} sx={{ whiteSpace: 'nowrap', m: 0 }} /><FormControl size="small" sx={{ width: { xs: '100%', sm: 220 }, flexShrink: 0 }}><InputLabel shrink>{text.customer}</InputLabel><Select value={customerId} label={text.customer} displayEmpty onChange={(event) => setCustomerId(event.target.value)} renderValue={(value) => value ? customerLabel(data.customers.find((customer) => String(customer.id) === String(value)), languageCode) : text.allCustomers}><MenuItem value="">{text.allCustomers}</MenuItem>{data.customers.map((customer) => <MenuItem key={customer.id} value={String(customer.id)}>{customerLabel(customer, languageCode)}</MenuItem>)}</Select></FormControl></>} />}
  >
    <GlobalStyles styles={{
      '@media print': {
        '@page': { size: 'A4 landscape', margin: '10mm' },
        'html, body, #root': {
          height: 'auto !important',
          maxHeight: 'none !important',
          overflow: 'visible !important',
        },
        'body *': { visibility: 'hidden' },
        'body *:has(.customer-production-report-print)': {
          height: 'auto !important',
          maxHeight: 'none !important',
          overflow: 'visible !important',
        },
        '.customer-production-report-print, .customer-production-report-print *': { visibility: 'visible' },
        '.customer-production-report-print': {
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: 'auto !important',
          maxHeight: 'none !important',
          overflow: 'visible !important',
        },
        '.report-screen-actions': { display: 'none !important' },
        '.customer-production-report-print .MuiTableContainer-root': {
          overflow: 'visible !important',
          border: 'none !important',
        },
        '.customer-production-report-print table': { width: '100% !important' },
        '.customer-production-report-print thead': { display: 'table-header-group' },
        '.customer-production-report-print tr': { breakInside: 'avoid', pageBreakInside: 'avoid' },
      },
    }} />
    <Stack spacing={2} className="customer-production-report customer-production-report-print">
      <Box><Typography variant="h5">{selectedCustomer ? customerLabel(selectedCustomer, languageCode) : text.allCustomers}</Typography><Typography variant="caption" color="text.secondary">{text.generated}: {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}</Typography></Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={30} /></Box> : rows.length === 0 ? <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}><Typography color="text.secondary">{text.empty}</Typography></Paper> :
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell sx={{ width: 44 }} /><TableCell>{text.customer}</TableCell><TableCell>{text.order}</TableCell><TableCell>{text.style}</TableCell><TableCell>{text.due}</TableCell><TableCell align="right">{text.quantity}</TableCell><TableCell align="right">{text.produced}</TableCell><TableCell sx={{ minWidth: 150 }}>{text.progress}</TableCell><TableCell>{text.status}</TableCell></TableRow></TableHead>
            <TableBody>{rows.map((row) => {
              const hasMultipleStyles = row.styles.length > 1;
              const expanded = hasMultipleStyles && expandedOrders.has(row.key);
              const soleStyle = hasMultipleStyles ? null : row.styles[0];
              return <React.Fragment key={row.key}>
                <TableRow
                  hover
                  sx={{ '& > td': { backgroundColor: expanded ? '#f4f8ff' : undefined } }}
                  onContextMenu={!hasMultipleStyles && soleStyle ? (event) => handleRowContextMenu(event, soleStyle) : undefined}
                >
                  <TableCell sx={{ width: 44 }}>
                    {hasMultipleStyles
                      ? <IconButton size="small" onClick={() => toggleOrder(row.key)} aria-label={expanded ? text.detailToggleOpen : text.detailToggleClosed}>
                          {expanded ? <KeyboardArrowUpIcon fontSize="small" /> : <KeyboardArrowDownIcon fontSize="small" />}
                        </IconButton>
                      : null}
                  </TableCell>
                  <TableCell>{rowCustomerLabel(row, languageCode)}</TableCell>
                  <TableCell>{row.orderNumber}</TableCell>
                  <TableCell>
                    {hasMultipleStyles
                      ? <Stack spacing={0.25}>
                          <Typography variant="body2">{resolveStyleSummaryLabel(row.styles, languageCode)}</Typography>
                          <Typography variant="caption" color="text.secondary">{text.completedCount(row.completedStyleCount, row.styles.length)}</Typography>
                        </Stack>
                      : soleStyle?.styleName || soleStyle?.styleCode || '-'}
                  </TableCell>
                  <TableCell>{row.dueDate || '-'}</TableCell>
                  <TableCell align="right">{fmt(row.orderedQuantity)}</TableCell>
                  <TableCell align="right"><Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end"><Typography variant="body2">{fmt(row.producedQuantity)}</Typography><Button className="report-screen-actions" size="small" variant="text" startIcon={<CalendarMonthIcon fontSize="small" />} onClick={() => setDailyProducedRow(row)}>{text.dailyProduced}</Button></Stack></TableCell>
                  <TableCell sx={{ minWidth: 150 }}><ReportProgressCell percent={row.progressPercent} /></TableCell>
                  <TableCell><ReportStatusChip status={row.status} languageCode={languageCode} /></TableCell>
                </TableRow>
                {hasMultipleStyles ? <TableRow>
                  <TableCell colSpan={REPORT_COLUMN_COUNT} sx={{ p: 0, borderBottom: expanded ? undefined : 'none' }}>
                    <Collapse in={expanded} timeout="auto" unmountOnExit>
                      <Box sx={{ m: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1.5, overflow: 'hidden' }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow sx={{ '& > th': { bgcolor: 'grey.50', fontSize: 12, color: 'text.secondary' } }}>
                              <TableCell>{text.style}</TableCell>
                              <TableCell>{text.due}</TableCell>
                              <TableCell align="right">{text.quantity}</TableCell>
                              <TableCell align="right">{text.produced}</TableCell>
                              <TableCell sx={{ minWidth: 150 }}>{text.progress}</TableCell>
                              <TableCell>{text.status}</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>{row.styles.map((styleRow) =>
                            <TableRow
                              key={`${styleRow.orderId}:${styleRow.styleId || styleRow.styleCode}`}
                              sx={{ '&:last-child td': { borderBottom: 0 } }}
                              onContextMenu={(event) => handleRowContextMenu(event, styleRow)}
                            >
                              <TableCell>{styleRow.styleName || styleRow.styleCode || '-'}</TableCell>
                              <TableCell>{styleRow.dueDate || '-'}</TableCell>
                              <TableCell align="right">{fmt(styleRow.orderedQuantity)}</TableCell>
                              <TableCell align="right"><Stack direction="row" spacing={0.5} alignItems="center" justifyContent="flex-end"><Typography variant="body2">{fmt(styleRow.producedQuantity)}</Typography><Button className="report-screen-actions" size="small" variant="text" startIcon={<CalendarMonthIcon fontSize="small" />} onClick={() => setDailyProducedRow(styleRow)}>{text.dailyProduced}</Button></Stack></TableCell>
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
    <Menu
      open={Boolean(contextMenuState)}
      onClose={handleContextMenuClose}
      anchorReference="anchorPosition"
      anchorPosition={
        contextMenuState
          ? { top: contextMenuState.mouseY, left: contextMenuState.mouseX }
          : undefined
      }
    >
      <MenuItem onClick={handleContextOpenQuantityReview} disabled={!contextMenuExternalId}>
        {languageCode === 'ko' ? '수량 확인' : languageCode === 'vi' ? 'Kiểm tra số lượng' : 'Quantity review'}
      </MenuItem>
    </Menu>
    <QuantityReviewDrawer
      externalId={activeQuantityReviewRow?.assignmentPlanExternalIds?.length === 1 ? activeQuantityReviewRow.assignmentPlanExternalIds[0] : null}
      orgId={activeOrgId}
      languageCode={languageCode}
      headerOrderNo={activeQuantityReviewRow?.orderNumber}
      headerStyleLabel={activeQuantityReviewRow?.styleName || activeQuantityReviewRow?.styleCode}
      headerQuantity={activeQuantityReviewRow?.assignedQuantity ?? activeQuantityReviewRow?.orderedQuantity}
      onClose={handleCloseQuantityReview}
    />
    <Dialog open={Boolean(dailyProducedRow)} onClose={() => setDailyProducedRow(null)} fullWidth maxWidth="xs">
      <DialogTitle>{text.dailyProducedTitle}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography fontWeight={700}>{dailyProducedRow?.orderNumber || '-'}</Typography>
          <Typography variant="body2" color="text.secondary">{dailyProducedRow?.styles ? resolveStyleSummaryLabel(dailyProducedRow.styles, languageCode) : dailyProducedRow?.styleName || dailyProducedRow?.styleCode || '-'}</Typography>
        </Stack>
        {(dailyProducedRow?.dailyProducedQuantities || []).length === 0
          ? <Typography variant="body2" color="text.secondary">{text.noDailyProduced}</Typography>
          : <Table size="small">
            <TableHead><TableRow><TableCell>{text.date}</TableCell><TableCell align="right">{text.produced}</TableCell></TableRow></TableHead>
            <TableBody>{dailyProducedRow.dailyProducedQuantities.map((daily) => <TableRow key={daily.date}><TableCell>{formatReportDate(daily.date, languageCode)}</TableCell><TableCell align="right">{fmt(daily.quantity)}</TableCell></TableRow>)}</TableBody>
          </Table>}
      </DialogContent>
      <DialogActions><Button onClick={() => setDailyProducedRow(null)}>{text.close}</Button></DialogActions>
    </Dialog>
  </AppPageContainer>;
};

export default CustomerProductionReport;
