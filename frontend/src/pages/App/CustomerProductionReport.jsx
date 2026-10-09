import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, FormControl, FormControlLabel, InputLabel,
  LinearProgress, IconButton, Menu, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tooltip, Typography, Switch,
} from '@mui/material';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
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
    copy: '이미지 복사', copying: '복사 중…', copied: '이미지가 클립보드에 복사되었습니다. 붙여넣기로 공유하세요.', copyError: '이미지를 복사하지 못했습니다. 브라우저의 클립보드 권한을 확인해 주세요.',
    title: '보고서', customer: '고객', allCustomers: '전체 고객', search: '주문번호·스타일 검색', orderTotal: '주문 전체',
    generated: '기준 시각', order: '주문번호', style: '스타일', due: '납기',
    quantity: '완성품/주문', produced: '완성품 수량', progress: '공정 진행률', status: '상태', schedule: '스케줄',
    empty: '조건에 맞는 보고서 항목이 없습니다.',
    loadError: '생산 진행 보고서를 불러오지 못했습니다.',
    includeCompleted: '완료 포함',
    completedCount: (count, total) => `완료 ${count}/${total}`,
    dailyProduced: '일일 내역', dailyProducedTitle: '일일 완성품 수량', close: '닫기', noDailyProduced: '등록된 일일 완성품 내역이 없습니다.',
  },
  en: {
    copy: 'Copy image', copying: 'Copying…', copied: 'Image copied to clipboard. Paste it to share.', copyError: 'Unable to copy the image. Check your browser clipboard permissions.',
    title: 'Report', customer: 'Customer', allCustomers: 'All customers', search: 'Search order or style', orderTotal: 'Order total',
    generated: 'As of', order: 'Order', style: 'Style', due: 'Due', quantity: 'Finished/Order',
    produced: 'Finished qty', progress: 'Process progress', status: 'Status', schedule: 'Schedule',
    empty: 'No report rows match the filters.',
    loadError: 'Failed to load the production progress report.',
    includeCompleted: 'Include completed',
    completedCount: (count, total) => `${count}/${total} completed`,
    dailyProduced: 'Daily details', dailyProducedTitle: 'Daily finished quantity', close: 'Close', noDailyProduced: 'No daily finished quantities are recorded.',
  },
  vi: {
    copy: 'Sao chép ảnh', copying: 'Đang sao chép…', copied: 'Đã sao chép ảnh vào bộ nhớ tạm. Dán để chia sẻ.', copyError: 'Không thể sao chép ảnh. Vui lòng kiểm tra quyền truy cập bộ nhớ tạm của trình duyệt.',
    title: 'Báo cáo', customer: 'Khách hàng', allCustomers: 'Tất cả khách hàng', search: 'Tìm đơn hàng hoặc kiểu dáng', orderTotal: 'Toàn bộ đơn hàng',
    generated: 'Thời điểm', order: 'Đơn hàng', style: 'Kiểu dáng', due: 'Hạn giao', quantity: 'Thành phẩm/Đơn hàng',
    produced: 'Số lượng thành phẩm', progress: 'Tiến độ công đoạn', status: 'Trạng thái', schedule: 'Lịch',
    empty: 'Không có dữ liệu phù hợp.',
    loadError: 'Không thể tải báo cáo tiến độ sản xuất.',
    includeCompleted: 'Bao gồm đã hoàn thành',
    completedCount: (count, total) => `Hoàn thành ${count}/${total}`,
    dailyProduced: 'Chi tiết ngày', dailyProducedTitle: 'Số lượng thành phẩm theo ngày', close: 'Đóng', noDailyProduced: 'Không có số lượng thành phẩm theo ngày.',
  },
};

const STATUS = {
  COMPLETED: { ko: '생산 완료', en: 'Completed', vi: 'Hoàn thành', color: 'success' },
  IN_PROGRESS: { ko: '생산 중', en: 'In production', vi: 'Đang sản xuất', color: 'primary' },
  SCHEDULED: { ko: '배정 완료', en: 'Assigned', vi: 'Đã phân công', color: 'info' },
  UNASSIGNED: { ko: '미배정', en: 'Unassigned', vi: 'Chưa phân công', color: 'default' },
};
const fmt = (value) => Math.max(0, Number(value) || 0).toLocaleString();
const reportLocale = (languageCode) => languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US';
const isReportDateKey = (date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''));
const toDateKey = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
const buildProductionCalendarDays = (dailyProducedQuantities) => {
  const producedDates = (dailyProducedQuantities || []).map((daily) => daily?.date).filter(isReportDateKey).sort();
  if (!producedDates.length) return [];
  const start = new Date(`${producedDates[0]}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const end = new Date(`${producedDates[producedDates.length - 1]}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + (6 - end.getUTCDay()));
  const days = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) days.push(toDateKey(cursor));
  return days;
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
      if (!date || quantity <= 0) return;
      const bucket = dailyProducedByDate.get(date) || { quantity: 0, styles: new Map() };
      const styleKey = String(row.styleId || row.styleCode || row.styleName || 'style');
      const styleLabel = row.styleName || row.styleCode || '-';
      bucket.quantity += quantity;
      bucket.styles.set(styleKey, { label: styleLabel, quantity: (bucket.styles.get(styleKey)?.quantity || 0) + quantity });
      dailyProducedByDate.set(date, bucket);
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
      dailyProducedQuantities: Array.from(dailyProducedByDate.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, bucket]) => ({ date, quantity: bucket.quantity, styles: Array.from(bucket.styles.values()) })),
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
  const [contextMenuState, setContextMenuState] = useState(null);
  const [activeQuantityReviewRow, setActiveQuantityReviewRow] = useState(null);
  const [dailyProducedRow, setDailyProducedRow] = useState(null);
  const scheduleCaptureRef = useRef(null);
  const [copying, setCopying] = useState(false);
  const [copyResult, setCopyResult] = useState(null);

  const copyScheduleImage = async () => {
    const element = scheduleCaptureRef.current;
    if (!element || copying) return;
    setCopying(true);
    setCopyResult(null);
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Clipboard unavailable');
      // Start the clipboard write during the click gesture; rendering resolves
      // its PNG promise later so browsers can retain user activation.
      const imagePromise = (async () => {
        const { default: html2canvas } = await import('html2canvas');
        await document.fonts?.ready;
        const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2,
          width: element.scrollWidth, height: element.scrollHeight, logging: false });
        return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG conversion failed')), 'image/png'));
      })();
      // Observe rendering failure even if clipboard permission rejects first.
      imagePromise.catch(() => {});
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': imagePromise })]);
      setCopyResult({ severity: 'success', message: text.copied });
    } catch {
      setCopyResult({ severity: 'error', message: text.copyError });
    } finally {
      setCopying(false);
    }
  };

  const openDailyProducedCalendar = useCallback((row) => {
    setCopyResult(null);
    setDailyProducedRow(row);
  }, []);

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
    toolbar={<PageToolbar showLastUpdater={false} left={<SearchInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder={text.search} sx={{ width: { xs: '100%', sm: 320 } }} />} right={<><FormControlLabel control={<Switch size="small" checked={includeCompleted} onChange={(event) => setIncludeCompleted(event.target.checked)} />} label={text.includeCompleted} sx={{ whiteSpace: 'nowrap', m: 0 }} /><FormControl size="small" sx={{ width: { xs: '100%', sm: 220 }, flexShrink: 0 }}><InputLabel shrink>{text.customer}</InputLabel><Select value={customerId} label={text.customer} displayEmpty onChange={(event) => setCustomerId(event.target.value)} renderValue={(value) => value ? customerLabel(data.customers.find((customer) => String(customer.id) === String(value)), languageCode) : text.allCustomers}><MenuItem value="">{text.allCustomers}</MenuItem>{data.customers.map((customer) => <MenuItem key={customer.id} value={String(customer.id)}>{customerLabel(customer, languageCode)}</MenuItem>)}</Select></FormControl></>} />}
  >
    <Stack spacing={2} className="customer-production-report">
      <Box><Typography variant="h5">{selectedCustomer ? customerLabel(selectedCustomer, languageCode) : text.allCustomers}</Typography><Typography variant="caption" color="text.secondary">{text.generated}: {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : '-'}</Typography></Box>
      {error ? <Alert severity="error">{error}</Alert> : null}
      {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={30} /></Box> : rows.length === 0 ? <Paper variant="outlined" sx={{ p: 5, textAlign: 'center' }}><Typography color="text.secondary">{text.empty}</Typography></Paper> :
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow><TableCell>{text.customer}</TableCell><TableCell>{text.order}</TableCell><TableCell>{text.style}</TableCell><TableCell>{text.due}</TableCell><TableCell align="right">{text.quantity}</TableCell><TableCell sx={{ minWidth: 150 }}>{text.progress}</TableCell><TableCell>{text.status}</TableCell><TableCell align="center">{text.schedule}</TableCell></TableRow></TableHead>
            <TableBody>{rows.map((row) => {
              const hasMultipleStyles = row.styles.length > 1;
              const soleStyle = hasMultipleStyles ? null : row.styles[0];
              return <React.Fragment key={row.key}>
                <TableRow
                  hover
                  onContextMenu={!hasMultipleStyles && soleStyle ? (event) => handleRowContextMenu(event, soleStyle) : undefined}
                >
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
                  <TableCell align="right">{fmt(row.producedQuantity)}/{fmt(row.orderedQuantity)}</TableCell>
                  <TableCell sx={{ minWidth: 150 }}><ReportProgressCell percent={row.progressPercent} /></TableCell>
                  <TableCell><ReportStatusChip status={row.status} languageCode={languageCode} /></TableCell>
                  <TableCell align="center"><Tooltip title={text.schedule}><IconButton size="small" color="primary" aria-label={text.schedule} onClick={() => openDailyProducedCalendar(row)}><CalendarMonthIcon fontSize="small" /></IconButton></Tooltip></TableCell>
                </TableRow>
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
    <Dialog open={Boolean(dailyProducedRow)} onClose={() => { if (!copying) setDailyProducedRow(null); }} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        <span>{text.schedule}: {dailyProducedRow?.orderNumber}</span>
        <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} disabled={copying} onClick={copyScheduleImage}>{copying ? text.copying : text.copy}</Button>
      </DialogTitle>
      <DialogContent dividers>
        {copyResult ? <Alert severity={copyResult.severity} sx={{ mb: 2 }}>{copyResult.message}</Alert> : null}
        <Box ref={scheduleCaptureRef} sx={{ bgcolor: '#fff', p: 1 }}>
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography fontWeight={700}>{text.customer}: {rowCustomerLabel(dailyProducedRow, languageCode)}</Typography>
          <Typography fontWeight={700}>{dailyProducedRow?.orderNumber || '-'}</Typography>
          <Typography variant="body2" color="text.secondary">{dailyProducedRow?.styles ? resolveStyleSummaryLabel(dailyProducedRow.styles, languageCode) : dailyProducedRow?.styleName || dailyProducedRow?.styleCode || '-'}</Typography>
        </Stack>
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>{text.dailyProducedTitle}</Typography>
        {(dailyProducedRow?.dailyProducedQuantities || []).length === 0
          ? <Typography variant="body2" color="text.secondary">{text.noDailyProduced}</Typography>
          : (() => {
            const productionByDate = new Map(dailyProducedRow.dailyProducedQuantities.map((daily) => [daily.date, daily]));
            const calendarDays = buildProductionCalendarDays(dailyProducedRow.dailyProducedQuantities);
            const weekdayLabels = Array.from({ length: 7 }, (_, day) => new Date(Date.UTC(2026, 7, 23 + day)).toLocaleDateString(reportLocale(languageCode), { weekday: 'short', timeZone: 'UTC' }));
            return <Stack spacing={1.5}>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', '& > div': { width: '14.285714%', boxSizing: 'border-box' }, borderTop: '1px solid', borderLeft: '1px solid', borderColor: 'divider' }}>
                {weekdayLabels.map((label, index) => <Box key={`${label}-${index}`} sx={{ py: 0.75, textAlign: 'center', bgcolor: 'grey.50', borderRight: '1px solid', borderBottom: '1px solid', borderColor: 'divider' }}><Typography sx={{ fontSize: '0.68rem' }} color={index === 0 ? 'error.main' : index === 6 ? 'primary.main' : 'text.secondary'}>{label}</Typography></Box>)}
                {calendarDays.map((date, index) => {
                  const production = date ? productionByDate.get(date) : null;
                  const styleBreakdown = production
                    ? (production.styles?.length
                      ? production.styles
                      : [{ label: dailyProducedRow?.styleName || dailyProducedRow?.styleCode || '-', quantity: production.quantity }])
                    : [];
                  const day = Number(date.slice(-2));
                  const showMonth = index === 0 || day === 1;
                  const dateLabel = new Date(`${date}T00:00:00Z`).toLocaleDateString(reportLocale(languageCode), showMonth ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : { day: 'numeric', timeZone: 'UTC' });
                  return <Box key={date} sx={{ minHeight: 108, p: 0.75, borderRight: '1px solid', borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'background.paper' }}>
                    <Typography sx={{ fontSize: '0.68rem' }} color={index % 7 === 0 ? 'error.main' : index % 7 === 6 ? 'primary.main' : 'text.secondary'}>{dateLabel}</Typography>
                    {production ? <Box sx={{ mt: 0.5, px: 0.75, py: 0.6, borderRadius: 1, bgcolor: 'action.hover', minWidth: 0 }}>
                      <Typography sx={{ fontSize: '1rem', lineHeight: 1.2, fontWeight: 800, color: 'primary.dark', textAlign: 'right' }}>{fmt(production.quantity)}</Typography>
                      <Stack spacing={0.25} sx={{ mt: 0.5 }}>
                        {styleBreakdown.map((style, styleIndex) => <Stack key={`${style.label}-${styleIndex}`} direction="row" spacing={0.5} alignItems="baseline" justifyContent="flex-end" sx={{ minWidth: 0 }}>
                          <Typography noWrap title={style.label} sx={{ minWidth: 0, fontSize: '0.62rem', lineHeight: 1.25, color: 'text.secondary' }}>
                            {style.label}
                          </Typography>
                          <Typography sx={{ flexShrink: 0, fontSize: '0.68rem', lineHeight: 1.25, fontWeight: 700, color: 'text.secondary' }}>
                            {fmt(style.quantity)}
                          </Typography>
                        </Stack>)}
                      </Stack>
                    </Box> : null}
                  </Box>;
                })}
              </Box>
            </Stack>;
          })()}
        <Box sx={{ mt: 3 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>{text.progress}</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead><TableRow><TableCell>{text.style}</TableCell><TableCell align="right">{text.quantity}</TableCell><TableCell sx={{ minWidth: 180 }}>{text.progress}</TableCell><TableCell>{text.status}</TableCell></TableRow></TableHead>
              <TableBody>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 700 }}>{text.orderTotal}</TableCell>
                  <TableCell align="right">{fmt(dailyProducedRow?.producedQuantity)}/{fmt(dailyProducedRow?.orderedQuantity)}</TableCell>
                  <TableCell><ReportProgressCell percent={dailyProducedRow?.progressPercent || 0} /></TableCell>
                  <TableCell><ReportStatusChip status={dailyProducedRow?.status} languageCode={languageCode} /></TableCell>
                </TableRow>
                {(dailyProducedRow?.styles || []).map((styleRow) => <TableRow key={styleRow.styleId} onContextMenu={(event) => handleRowContextMenu(event, styleRow)}>
                  <TableCell>{styleRow.styleName || styleRow.styleCode || '-'}</TableCell>
                  <TableCell align="right">{fmt(styleRow.producedQuantity)}/{fmt(styleRow.orderedQuantity)}</TableCell>
                  <TableCell><ReportProgressCell percent={styleRow.progressPercent} /></TableCell>
                  <TableCell><ReportStatusChip status={styleRow.status} languageCode={languageCode} /></TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
        </Box>
      </DialogContent>
    </Dialog>
  </AppPageContainer>;
};

export default CustomerProductionReport;
