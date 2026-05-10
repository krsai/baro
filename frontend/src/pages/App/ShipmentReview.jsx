import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  MenuItem,
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
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import { useAppActions } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { formatNumberWithCommas } from '../../utils/numberFormat';
import {
  fetchQuantitySettlement,
  saveQuantitySettlement,
} from '../../utils/quantitySettlementApi';

const PAGE_TEXT = {
  title: {
    ko: '수량 정산',
    en: 'Quantity Settlement',
    vi: 'Doi chieu so luong',
  },
  subtitle: {
    ko: '작업기록 기반 추정 수량, QC 확정 수량, 청구 대상 수량, 급여 대상 수량을 한 화면에서 맞춥니다.',
    en: 'Review estimated production, QC-confirmed quantity, billable quantity, and payroll quantity in one place.',
    vi: 'Doi chieu san luong uoc tinh, so luong QC xac nhan, so luong tinh hoa don va so luong tinh luong tren mot man hinh.',
  },
  month: {
    ko: '정산 월',
    en: 'Settlement Month',
    vi: 'Thang doi chieu',
  },
  filter: {
    ko: '보기',
    en: 'View',
    vi: 'Bo loc',
  },
  search: {
    ko: '주문번호, 스타일 검색',
    en: 'Search order or style',
    vi: 'Tim don hang hoac style',
  },
  saveSuccess: {
    ko: '수량 정산을 저장했습니다.',
    en: 'Quantity settlement saved.',
    vi: 'Da luu doi chieu so luong.',
  },
  saveError: {
    ko: '수량 정산 저장에 실패했습니다.',
    en: 'Failed to save quantity settlement.',
    vi: 'Khong the luu doi chieu so luong.',
  },
  loadError: {
    ko: '수량 정산 데이터를 불러오지 못했습니다.',
    en: 'Failed to load quantity settlement.',
    vi: 'Khong the tai du lieu doi chieu so luong.',
  },
  locked: {
    ko: '이 월은 급여가 저장되어 있어 정산을 수정할 수 없습니다.',
    en: 'This month is locked because payroll has already been saved.',
    vi: 'Thang nay da bi khoa vi bang luong da duoc luu.',
  },
  payrollBlock: {
    ko: '검토 필요 또는 차단 상태가 남아 있으면 급여 저장이 차단됩니다.',
    en: 'Payroll saving is blocked while any rows remain in review or blocked status.',
    vi: 'Khong the luu bang luong khi van con dong can xem xet hoac bi chan.',
  },
  noRows: {
    ko: '표시할 주문 항목이 없습니다.',
    en: 'No order items to display.',
    vi: 'Khong co muc don hang de hien thi.',
  },
  filters: {
    all: { ko: '전체', en: 'All', vi: 'Tat ca' },
    active: { ko: '활성', en: 'Active', vi: 'Dang su dung' },
    review: { ko: '검토 필요', en: 'Review', vi: 'Can xem xet' },
    blocked: { ko: '차단', en: 'Blocked', vi: 'Bi chan' },
    confirmed: { ko: '확정', en: 'Confirmed', vi: 'Da xac nhan' },
  },
  summary: {
    active: { ko: '활성', en: 'Active', vi: 'Dang su dung' },
    review: { ko: '검토 필요', en: 'Review', vi: 'Can xem xet' },
    blocked: { ko: '차단', en: 'Blocked', vi: 'Bi chan' },
    confirmed: { ko: '확정', en: 'Confirmed', vi: 'Da xac nhan' },
  },
  table: {
    status: { ko: '상태', en: 'Status', vi: 'Trang thai' },
    order: { ko: '주문', en: 'Order', vi: 'Don hang' },
    style: { ko: '스타일 / 색상', en: 'Style / Color', vi: 'Style / Mau' },
    orderQty: { ko: '주문 수량', en: 'Order Qty', vi: 'SL don hang' },
    targetQty: { ko: '월 대상 수량', en: 'Month Target', vi: 'SL muc tieu thang' },
    estimatedQty: { ko: '추정 생산량', en: 'Estimated Qty', vi: 'SL uoc tinh' },
    confirmedQty: { ko: 'QC 확정', en: 'QC Confirmed', vi: 'QC xac nhan' },
    billableQty: { ko: '청구 대상', en: 'Billable', vi: 'Tinh hoa don' },
    payrollQty: { ko: '급여 대상', en: 'Payroll', vi: 'Tinh luong' },
    process: { ko: '공정 체크', en: 'Process Check', vi: 'Kiem tra cong doan' },
    reason: { ko: '사유', en: 'Reason', vi: 'Ly do' },
    memo: { ko: '메모', en: 'Memo', vi: 'Ghi chu' },
  },
  reasons: {
    none: { ko: '없음', en: 'None', vi: 'Khong co' },
    input: { ko: '오입력', en: 'Input Error', vi: 'Nhap sai' },
    rework: { ko: '재작업', en: 'Rework', vi: 'Lam lai' },
    loss: { ko: '불량/로스', en: 'Loss', vi: 'Loi/Hao hut' },
    hold: { ko: '보류', en: 'On Hold', vi: 'Tam giu' },
    carry: { ko: '이월', en: 'Carry Over', vi: 'Chuyen ky sau' },
  },
  statusMeta: {
    idle: { ko: '대기', en: 'Idle', vi: 'Cho' },
    review: { ko: '검토 필요', en: 'Review', vi: 'Can xem xet' },
    blocked: { ko: '차단', en: 'Blocked', vi: 'Bi chan' },
    confirmed: { ko: '확정', en: 'Confirmed', vi: 'Da xac nhan' },
  },
};

const resolveText = (node, languageCode) => {
  if (!node || typeof node !== 'object') return '';
  return node[languageCode] || node.ko || node.en || '';
};

const formatInt = (value) =>
  formatNumberWithCommas(Number(value), {
    fallback: '0',
    maximumFractionDigits: 0,
  });

const toNullableInt = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(/[^\d]/g, ''));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round(parsed));
};

const STATUS_META = {
  IDLE: { color: 'default' },
  REVIEW: { color: 'warning' },
  BLOCKED: { color: 'error' },
  CONFIRMED: { color: 'success' },
};

const computeLocalStatus = (row) => {
  const targetQuantity = toNullableInt(row.targetQuantity);
  const confirmedQuantity = toNullableInt(row.confirmedQuantity);
  const billableQuantity = toNullableInt(row.billableQuantity);
  const payrollEligibleQuantity = toNullableInt(row.payrollEligibleQuantity);
  const estimatedQuantity = Number(row.estimatedQuantity) || 0;
  const processSpread = Number(row.processSpread) || 0;
  const isActive =
    estimatedQuantity > 0 ||
    (targetQuantity ?? 0) > 0 ||
    (confirmedQuantity ?? 0) > 0 ||
    (billableQuantity ?? 0) > 0 ||
    (payrollEligibleQuantity ?? 0) > 0;

  if (!isActive) return 'IDLE';
  if (
    confirmedQuantity === null ||
    billableQuantity === null ||
    payrollEligibleQuantity === null
  ) {
    return 'REVIEW';
  }
  if (
    confirmedQuantity < billableQuantity ||
    confirmedQuantity < payrollEligibleQuantity ||
    ((targetQuantity ?? 0) > 0 && billableQuantity > targetQuantity)
  ) {
    return 'BLOCKED';
  }
  if (processSpread > 0) {
    return 'REVIEW';
  }
  return 'CONFIRMED';
};

const computeSummary = (rows) =>
  rows.reduce(
    (acc, row) => {
      const status = computeLocalStatus(row);
      if (status === 'IDLE') {
        acc.idle += 1;
        return acc;
      }
      acc.active += 1;
      if (status === 'CONFIRMED') acc.confirmed += 1;
      if (status === 'REVIEW') acc.review += 1;
      if (status === 'BLOCKED') acc.blocked += 1;
      return acc;
    },
    { active: 0, idle: 0, review: 0, blocked: 0, confirmed: 0 }
  );

const ShipmentReview = () => {
  const { showNotification } = useAppActions();
  const { activeOrgId, activeProfile } = useAuth();
  const { languageCode } = useLanguage();

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [draftRows, setDraftRows] = useState([]);
  const [filterMode, setFilterMode] = useState('active');
  const [searchText, setSearchText] = useState('');
  const [dirty, setDirty] = useState(false);

  const text = useCallback(
    (keyPath) => {
      const segments = keyPath.split('.');
      let current = PAGE_TEXT;
      segments.forEach((segment) => {
        current = current?.[segment];
      });
      return resolveText(current, languageCode);
    },
    [languageCode]
  );

  const initializeDraftRows = useCallback((rows) => {
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      ...row,
      targetQuantity:
        row.targetQuantity ?? row.suggestedTargetQuantity ?? row.orderQuantity ?? 0,
      confirmedQuantity:
        row.confirmedQuantity ?? row.suggestedConfirmedQuantity ?? row.estimatedQuantity ?? 0,
      billableQuantity:
        row.billableQuantity ??
        row.suggestedBillableQuantity ??
        row.confirmedQuantity ??
        row.estimatedQuantity ??
        0,
      payrollEligibleQuantity:
        row.payrollEligibleQuantity ??
        row.suggestedPayrollEligibleQuantity ??
        row.confirmedQuantity ??
        row.estimatedQuantity ??
        0,
      reasonCode: row.reasonCode || '',
      memo: row.memo || '',
    }));
  }, []);

  const loadSettlement = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    try {
      const response = await fetchQuantitySettlement({
        orgId: activeOrgId,
        month,
      });
      setDataset(response);
      setDraftRows(initializeDraftRows(response?.rows));
      setDirty(false);
    } catch (error) {
      showNotification(error?.message || text('loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, initializeDraftRows, month, showNotification, text]);

  useEffect(() => {
    loadSettlement();
  }, [loadSettlement]);

  const handleCellChange = useCallback((rowId, field, nextValue) => {
    setDraftRows((prev) =>
      prev.map((row) =>
        row.rowId === rowId
          ? {
              ...row,
              [field]:
                field === 'reasonCode' || field === 'memo'
                  ? nextValue
                  : nextValue.replace(/[^\d]/g, ''),
            }
          : row
      )
    );
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!month || dataset?.locked) return;
    setSaving(true);
    try {
      const payloadRows = draftRows.map((row) => ({
        rowId: row.rowId,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        dueDate: row.dueDate,
        styleUid: row.styleUid,
        styleId: row.styleId,
        styleCode: row.styleCode,
        styleName: row.styleName,
        colorId: row.colorId,
        colorCode: row.colorCode,
        colorName: row.colorName,
        genderLabels: row.genderLabels,
        orderQuantity: row.orderQuantity,
        targetQuantity: toNullableInt(row.targetQuantity),
        confirmedQuantity: toNullableInt(row.confirmedQuantity),
        billableQuantity: toNullableInt(row.billableQuantity),
        payrollEligibleQuantity: toNullableInt(row.payrollEligibleQuantity),
        estimatedQuantity: Number(row.estimatedQuantity) || 0,
        processMinQuantity: row.processMinQuantity,
        processMaxQuantity: row.processMaxQuantity,
        processSpread: Number(row.processSpread) || 0,
        processCount: Number(row.processCount) || 0,
        processQuantities: row.processQuantities,
        reasonCode: row.reasonCode || '',
        memo: row.memo || '',
      }));

      const response = await saveQuantitySettlement(
        {
          month,
          rows: payloadRows,
          savedBy: activeProfile?.email || activeProfile?.name || 'unknown',
        },
        { orgId: activeOrgId }
      );
      setDataset(response);
      setDraftRows(initializeDraftRows(response?.rows));
      setDirty(false);
      showNotification(text('saveSuccess'), 'success');
    } catch (error) {
      showNotification(error?.message || text('saveError'), 'error');
    } finally {
      setSaving(false);
    }
  }, [
    activeOrgId,
    activeProfile?.email,
    activeProfile?.name,
    dataset?.locked,
    draftRows,
    initializeDraftRows,
    month,
    showNotification,
    text,
  ]);

  const localSummary = useMemo(() => computeSummary(draftRows), [draftRows]);

  const visibleRows = useMemo(() => {
    const keyword = String(searchText || '').trim().toLowerCase();
    return draftRows.filter((row) => {
      const status = computeLocalStatus(row);
      if (filterMode === 'active' && status === 'IDLE') return false;
      if (filterMode === 'review' && status !== 'REVIEW') return false;
      if (filterMode === 'blocked' && status !== 'BLOCKED') return false;
      if (filterMode === 'confirmed' && status !== 'CONFIRMED') return false;

      if (!keyword) return true;
      const haystack = [
        row.orderNumber,
        row.customerName,
        row.styleCode,
        row.styleName,
        row.colorCode,
        row.colorName,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [draftRows, filterMode, searchText]);

  return (
    <AppPageContainer
      header={
        <Stack spacing={0.5}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {text('title')}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {text('subtitle')}
          </Typography>
        </Stack>
      }
    >
      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ p: 2.25, borderRadius: 2 }}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'stretch', lg: 'center' }}
            justifyContent="space-between"
          >
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <TextField
                label={text('month')}
                type="month"
                size="small"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: { xs: '100%', sm: 180 } }}
              />
              <TextField
                label={text('filter')}
                select
                size="small"
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value)}
                sx={{ width: { xs: '100%', sm: 180 } }}
              >
                <MenuItem value="active">{text('filters.active')}</MenuItem>
                <MenuItem value="review">{text('filters.review')}</MenuItem>
                <MenuItem value="blocked">{text('filters.blocked')}</MenuItem>
                <MenuItem value="confirmed">{text('filters.confirmed')}</MenuItem>
                <MenuItem value="all">{text('filters.all')}</MenuItem>
              </TextField>
              <TextField
                label={text('search')}
                size="small"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                sx={{ minWidth: { xs: '100%', sm: 260 } }}
              />
            </Stack>

            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <SaveButton onClick={handleSave} disabled={loading || saving || dataset?.locked || !dirty} loading={saving} />
            </Stack>
          </Stack>
        </Paper>

        {dataset?.locked && <Alert severity="warning">{text('locked')}</Alert>}
        <Alert severity={localSummary.blocked > 0 || localSummary.review > 0 ? 'warning' : 'success'}>
          {text('payrollBlock')}
        </Alert>

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip label={`${text('summary.active')} ${localSummary.active}`} variant="outlined" />
          <Chip label={`${text('summary.review')} ${localSummary.review}`} color="warning" variant="outlined" />
          <Chip label={`${text('summary.blocked')} ${localSummary.blocked}`} color="error" variant="outlined" />
          <Chip label={`${text('summary.confirmed')} ${localSummary.confirmed}`} color="success" variant="outlined" />
        </Stack>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{text('table.status')}</TableCell>
                  <TableCell>{text('table.order')}</TableCell>
                  <TableCell>{text('table.style')}</TableCell>
                  <TableCell align="right">{text('table.orderQty')}</TableCell>
                  <TableCell align="right">{text('table.targetQty')}</TableCell>
                  <TableCell align="right">{text('table.estimatedQty')}</TableCell>
                  <TableCell align="right">{text('table.confirmedQty')}</TableCell>
                  <TableCell align="right">{text('table.billableQty')}</TableCell>
                  <TableCell align="right">{text('table.payrollQty')}</TableCell>
                  <TableCell>{text('table.process')}</TableCell>
                  <TableCell>{text('table.reason')}</TableCell>
                  <TableCell>{text('table.memo')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!loading && visibleRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} align="center" sx={{ py: 6 }}>
                      <Typography variant="body2" color="text.secondary">
                        {text('noRows')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRows.map((row) => {
                    const statusCode = computeLocalStatus(row);
                    const meta = STATUS_META[statusCode] || STATUS_META.IDLE;
                    const processLabel =
                      Number(row.processCount) > 0
                        ? `${formatInt(row.processMinQuantity ?? 0)}~${formatInt(
                            row.processMaxQuantity ?? 0
                          )} / ${formatInt(row.processCount)}`
                        : '-';
                    return (
                      <TableRow key={row.rowId} hover>
                        <TableCell sx={{ minWidth: 110 }}>
                          <Chip
                            size="small"
                            color={meta.color}
                            variant={statusCode === 'CONFIRMED' ? 'filled' : 'outlined'}
                            label={text(`statusMeta.${statusCode.toLowerCase()}`)}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 150 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {row.orderNumber || '-'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {row.customerName || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ minWidth: 220 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {row.styleCode || row.styleId || '-'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            {[row.styleName, row.colorName || row.colorCode]
                              .filter(Boolean)
                              .join(' / ') || '-'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{formatInt(row.orderQuantity)}</TableCell>
                        <TableCell align="right" sx={{ minWidth: 112 }}>
                          <TextField
                            value={row.targetQuantity}
                            onChange={(event) =>
                              handleCellChange(row.rowId, 'targetQuantity', event.target.value)
                            }
                            size="small"
                            disabled={dataset?.locked}
                            inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                          />
                        </TableCell>
                        <TableCell align="right">{formatInt(row.estimatedQuantity)}</TableCell>
                        <TableCell align="right" sx={{ minWidth: 112 }}>
                          <TextField
                            value={row.confirmedQuantity}
                            onChange={(event) =>
                              handleCellChange(row.rowId, 'confirmedQuantity', event.target.value)
                            }
                            size="small"
                            disabled={dataset?.locked}
                            inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ minWidth: 112 }}>
                          <TextField
                            value={row.billableQuantity}
                            onChange={(event) =>
                              handleCellChange(row.rowId, 'billableQuantity', event.target.value)
                            }
                            size="small"
                            disabled={dataset?.locked}
                            inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ minWidth: 112 }}>
                          <TextField
                            value={row.payrollEligibleQuantity}
                            onChange={(event) =>
                              handleCellChange(
                                row.rowId,
                                'payrollEligibleQuantity',
                                event.target.value
                              )
                            }
                            size="small"
                            disabled={dataset?.locked}
                            inputProps={{ inputMode: 'numeric', style: { textAlign: 'right' } }}
                          />
                        </TableCell>
                        <TableCell sx={{ minWidth: 148 }}>
                          <Typography variant="body2">{processLabel}</Typography>
                          {Number(row.processSpread) > 0 && (
                            <Typography variant="caption" color="warning.main">
                              +{formatInt(row.processSpread)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ minWidth: 140 }}>
                          <TextField
                            select
                            value={row.reasonCode}
                            onChange={(event) =>
                              handleCellChange(row.rowId, 'reasonCode', event.target.value)
                            }
                            size="small"
                            disabled={dataset?.locked}
                            fullWidth
                          >
                            <MenuItem value="">{text('reasons.none')}</MenuItem>
                            <MenuItem value="INPUT">{text('reasons.input')}</MenuItem>
                            <MenuItem value="REWORK">{text('reasons.rework')}</MenuItem>
                            <MenuItem value="LOSS">{text('reasons.loss')}</MenuItem>
                            <MenuItem value="HOLD">{text('reasons.hold')}</MenuItem>
                            <MenuItem value="CARRY">{text('reasons.carry')}</MenuItem>
                          </TextField>
                        </TableCell>
                        <TableCell sx={{ minWidth: 220 }}>
                          <TextField
                            value={row.memo}
                            onChange={(event) =>
                              handleCellChange(row.rowId, 'memo', event.target.value)
                            }
                            size="small"
                            disabled={dataset?.locked}
                            fullWidth
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {!loading && dataset?.updatedAt && (
          <Box>
            <Typography variant="caption" color="text.secondary">
              {`${dataset.updatedBy || '-'} · ${new Date(dataset.updatedAt).toLocaleString()}`}
            </Typography>
          </Box>
        )}
      </Stack>
    </AppPageContainer>
  );
};

export default ShipmentReview;
