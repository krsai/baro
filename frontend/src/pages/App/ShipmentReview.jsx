import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
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
import { fetchAttributes } from '../../utils/attributeApi';
import { resolveLocalizedAttributeName } from '../../utils/appLanguage';
import {
  fetchQuantitySettlement,
  saveQuantitySettlement,
} from '../../utils/quantitySettlementApi';

const getLocalMonthKey = (value = new Date()) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return getLocalMonthKey();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const normalizeReviewMonthKey = (value) =>
  /^\d{4}-\d{2}$/.test(String(value || '').trim())
    ? String(value).trim()
    : getLocalMonthKey();

const shiftReviewMonthKey = (value, amount) => {
  const [year, month] = normalizeReviewMonthKey(value).split('-').map((item) => Number(item));
  return getLocalMonthKey(new Date(year, month - 1 + amount, 1));
};

const PAGE_TEXT = {
  title: {
    ko: '수량 정산',
    en: 'Quantity Settlement',
    vi: 'Doi chieu so luong',
  },
  subtitle: {
    ko: '작업기록 기반 추정 수량, QC 확정 수량, 청구 대상 수량, 생산수당 대상 수량을 한 화면에서 맞춥니다.',
    en: 'Review estimated production, QC-confirmed quantity, billable quantity, and production-allowance quantity in one place.',
    vi: 'Doi chieu san luong uoc tinh, so luong QC xac nhan, so luong tinh hoa don va so luong phu cap san luong tren mot man hinh.',
  },
  month: {
    ko: '정산 월',
    en: 'Settlement Month',
    vi: 'Thang doi chieu',
  },
  filter: {
    ko: '보기',
    en: 'View',
    vi: 'Bộ lọc',
  },
  search: {
    ko: '주문번호, 스타일 검색',
    en: 'Search order or style',
    vi: 'Tim don hang hoac style',
  },
  saveSuccess: {
    ko: '수량 정산을 저장했습니다.',
    en: 'Quantity settlement saved.',
    vi: 'Đã lưu doi chieu so luong.',
  },
  saveError: {
    ko: '수량 정산 저장에 실패했습니다.',
    en: 'Failed to save quantity settlement.',
    vi: 'Không thể luu doi chieu so luong.',
  },
  loadError: {
    ko: '수량 정산 데이터를 불러오지 못했습니다.',
    en: 'Failed to load quantity settlement.',
    vi: 'Không thể tai du lieu doi chieu so luong.',
  },
  workflowNeedWorkLogs: {
    ko: '이 달은 작업 기록이 없습니다. 먼저 작업 기록을 입력한 뒤 수량 정산을 진행하세요.',
    en: 'There are no work logs for this month yet. Enter work logs first, then continue in Quantity Settlement.',
    vi: 'Thang nay chua co ghi chep cong viec. Hay nhap ghi chep cong viec truoc, sau do tiep tuc doi chieu so luong.',
  },
  workflowPendingPayroll: {
    ko: '수량 정산을 저장했습니다. 아직 검토 필요 또는 차단 항목이 있어 생산수당 확정으로 넘어갈 수 없습니다.',
    en: 'Quantity settlement was saved, but production allowance cannot be finalized while review or blocked rows remain.',
    vi: 'Đã lưu doi chieu so luong, nhung chua the chot phu cap san luong vi van con dong can xem xet hoac bi chan.',
  },
  workflowReadyForPayroll: {
    ko: '수량 정산을 저장했습니다. 다음 단계에서 생산수당 계산을 진행하세요.',
    en: 'Quantity settlement saved. Next, continue in Production Allowance.',
    vi: 'Đã lưu doi chieu so luong. Tiep theo, hay tinh phu cap san luong.',
  },
  storageNotReady: {
    ko: '정산 저장소 테이블이 서버에 아직 반영되지 않았습니다. 관리자에게 DB 업데이트 적용을 요청하세요.',
    en: 'The settlement storage table is not available on the server yet. Ask an admin to apply the database update.',
    vi: 'Bang luu doi chieu chua duoc cap nhat tren may chu. Hay yeu cau quan tri vien cap nhat co so du lieu.',
  },
  locked: {
    ko: '이 월은 생산수당이 이미 확정되어 있어 정산을 수정할 수 없습니다.',
    en: 'This month is locked because production allowance has already been finalized.',
    vi: 'Thang nay da bi khoa vi phu cap san luong da duoc chot.',
  },
  payrollBlock: {
    ko: '작업기록 > 수량 정산 > 생산수당 계산 순서로 진행합니다. 검토 필요 또는 차단 상태가 남아 있으면 생산수당 확정이 차단됩니다.',
    en: 'Follow Work Logs > Quantity Settlement > Production Allowance. Finalization is blocked while any rows remain in review or blocked status.',
    vi: 'Thuc hien theo thu tu Ghi chep cong viec > Doi chieu so luong > Phụ cấp san luong. Không thể chot khi van con dong can xem xet hoac bi chan.',
  },
  noRows: {
    ko: '표시할 주문 항목이 없습니다.',
    en: 'No order items to display.',
    vi: 'Không có muc don hang de hien thi.',
  },
  noRowsNoOrders: {
    ko: '현재 워크스페이스에 진행 중인 주문이 없습니다.',
    en: 'There are no active orders in this workspace.',
    vi: 'Không có don hang dang hoat dong trong workspace nay.',
  },
  noRowsNoWorkLogs: {
    ko: '선택한 월의 작업 기록이 없습니다. 이전 달 기록이 없어도 오류는 아니며, 이 달의 추정 생산량만 0으로 보입니다.',
    en: 'There are no work logs for the selected month. Missing records from previous months do not cause an error; only this month stays at 0.',
    vi: 'Không có ghi chep cong viec trong thang da chon. Thieu du lieu thang truoc khong gay loi; chi co san luong uoc tinh cua thang nay hien la 0.',
  },
  noRowsFiltered: {
    ko: '현재 보기 필터에서는 표시할 항목이 없습니다. 보기 값을 전체로 바꿔 보세요.',
    en: 'Nothing matches the current view filter. Switch the view to All.',
    vi: 'Không có muc nao phu hop bo loc hien tai. Hay chuyen sang Tất cả.',
  },
  noRowsNoMatches: {
    ko: '검색 조건에 맞는 항목이 없습니다.',
    en: 'No rows match the current search.',
    vi: 'Không có dong nao khop voi tim kiem hien tai.',
  },
  usageTitle: {
    ko: '사용 방법',
    en: 'How To Use',
    vi: 'Cach su dung',
  },
  usage1: {
    ko: '1. 정산 월을 선택하면 그 달의 작업 기록만으로 추정 생산량을 계산합니다.',
    en: '1. Select a month. Estimated production is calculated only from work logs in that month.',
    vi: '1. Chon thang. Sản lượng uoc tinh chi duoc tinh tu ghi chep cong viec trong thang do.',
  },
  usage2: {
    ko: '2. QC 확정, 청구 대상, 생산수당 대상을 입력합니다. 청구서 문서 생성은 나중에 해도 됩니다.',
    en: '2. Fill in QC Confirmed, Billable, and Production Allowance quantities. Creating the invoice document can happen later.',
    vi: '2. Nhập số lượng QC xac nhan, tinh hoa don va tinh phu cap san luong. Viec tao chung tu hoa don co the lam sau.',
  },
  usage3: {
    ko: '3. 공정 체크가 50~51처럼 어긋나면 검토 필요로 표시됩니다. 사유를 고르고 메모를 남기세요.',
    en: '3. If process counts differ, such as 50 to 51, the row is marked for review. Choose a reason and leave a memo.',
    vi: '3. Neu so lan cong doan lech nhau, vi du 50 den 51, dong se duoc danh dau can xem xet. Chon ly do va ghi chu.',
  },
  usage4: {
    ko: '4. 검토 필요/차단 상태가 모두 정리되어야 생산수당 확정이 가능합니다.',
    en: '4. Production allowance can be finalized only after all review and blocked rows are cleared.',
    vi: '4. Chi co the chot phu cap san luong sau khi da xu ly het cac dong can xem xet va bi chan.',
  },
  usage5: {
    ko: '5. 청구서 기능이 아직 없어도 수량 정산과 생산수당 확정은 먼저 진행할 수 있습니다.',
    en: '5. Quantity settlement and production allowance can proceed before invoice creation is available.',
    vi: '5. Doi chieu so luong va phu cap san luong van co the thuc hien truoc khi co chuc nang hoa don.',
  },
  filters: {
    all: { ko: '전체', en: 'All', vi: 'Tất cả' },
    active: { ko: '활성', en: 'Active', vi: 'Dang su dung' },
    review: { ko: '검토 필요', en: 'Review', vi: 'Can xem xet' },
    blocked: { ko: '차단', en: 'Blocked', vi: 'Bi chan' },
    confirmed: { ko: '확정', en: 'Confirmed', vi: 'Đã xác nhận' },
  },
  summary: {
    active: { ko: '활성', en: 'Active', vi: 'Dang su dung' },
    review: { ko: '검토 필요', en: 'Review', vi: 'Can xem xet' },
    blocked: { ko: '차단', en: 'Blocked', vi: 'Bi chan' },
    confirmed: { ko: '확정', en: 'Confirmed', vi: 'Đã xác nhận' },
  },
  table: {
    status: { ko: '상태', en: 'Status', vi: 'Trạng thái' },
    order: { ko: '주문', en: 'Order', vi: 'Đơn hàng' },
    style: { ko: '스타일 / 색상', en: 'Style / Color', vi: 'Style / Mau' },
    orderQty: { ko: '주문 수량', en: 'Order Qty', vi: 'SL don hang' },
    targetQty: { ko: '월 대상 수량', en: 'Month Target', vi: 'SL muc tieu thang' },
    estimatedQty: { ko: '추정 생산량', en: 'Estimated Qty', vi: 'SL uoc tinh' },
    confirmedQty: { ko: 'QC 확정', en: 'QC Confirmed', vi: 'QC xac nhan' },
    billableQty: { ko: '청구 대상', en: 'Billable', vi: 'Tinh hoa don' },
    payrollQty: { ko: '생산수당 대상', en: 'Production Allowance', vi: 'Phụ cấp san luong' },
    process: { ko: '공정 체크', en: 'Process Check', vi: 'Kiểm tra cong doan' },
    reason: { ko: '사유', en: 'Reason', vi: 'Ly do' },
    memo: { ko: '메모', en: 'Memo', vi: 'Ghi chu' },
  },
  reasons: {
    none: { ko: '없음', en: 'None', vi: 'Không có' },
    input: { ko: '오입력', en: 'Input Error', vi: 'Nhap sai' },
    rework: { ko: '재작업', en: 'Rework', vi: 'Lam lai' },
    loss: { ko: '불량/로스', en: 'Loss', vi: 'Loi/Hao hut' },
    hold: { ko: '보류', en: 'On Hold', vi: 'Tam giu' },
    carry: { ko: '이월', en: 'Carry Over', vi: 'Chuyền ky sau' },
  },
  statusMeta: {
    idle: { ko: '대기', en: 'Idle', vi: 'Cho' },
    review: { ko: '검토 필요', en: 'Review', vi: 'Can xem xet' },
    blocked: { ko: '차단', en: 'Blocked', vi: 'Bi chan' },
    confirmed: { ko: '확정', en: 'Confirmed', vi: 'Đã xác nhận' },
  },
};

const resolveText = (node, languageCode) => {
  if (!node || typeof node !== 'object') return '';
  return node[languageCode] || node.ko || node.en || '';
};

const normalizeColorCodeKey = (value) => String(value ?? '').trim().toUpperCase();

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

  const [month, setMonth] = useState(() => getLocalMonthKey());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [draftRows, setDraftRows] = useState([]);
  const [colorOptions, setColorOptions] = useState([]);
  const [filterMode, setFilterMode] = useState('all');
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
      const orderCount = Number(response?.sourceSummary?.orderCount) || 0;
      const workLogCount = Number(response?.sourceSummary?.workLogCount) || 0;
      if (orderCount > 0 && workLogCount === 0) {
        showNotification(text('workflowNeedWorkLogs'), 'info');
      }
    } catch (error) {
      setDataset(null);
      setDraftRows([]);
      showNotification(error?.message || text('loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, initializeDraftRows, month, showNotification, text]);

  useEffect(() => {
    loadSettlement();
  }, [loadSettlement]);

  useEffect(() => {
    let isMounted = true;
    const loadColors = async () => {
      try {
        const attributes = await fetchAttributes({
          orgId: activeOrgId,
          includeColors: true,
          includeCategories: false,
          includeRoles: false,
          includeProcesses: false,
          skipGlobalLoading: true,
        });
        if (!isMounted) return;
        setColorOptions(Array.isArray(attributes?.colors) ? attributes.colors : []);
      } catch (_error) {
        if (!isMounted) return;
        setColorOptions([]);
      }
    };

    loadColors();
    return () => {
      isMounted = false;
    };
  }, [activeOrgId]);

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
    if (!month || dataset?.locked || dataset?.storageReady === false) return;
    setSaving(true);
    try {
      const payloadRows = draftRows.map((row) => ({
        rowId: row.rowId,
        orderId: row.orderId,
        orderNumber: row.orderNumber,
        customerName: row.customerName,
        dueDate: row.dueDate,
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
      if ((Number(response?.summary?.unresolvedRows) || 0) > 0) {
        showNotification(text('workflowPendingPayroll'), 'warning');
      } else {
        showNotification(text('workflowReadyForPayroll') || text('saveSuccess'), 'success');
      }
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
    dataset?.storageReady,
    draftRows,
    initializeDraftRows,
    month,
    showNotification,
    text,
  ]);

  const localSummary = useMemo(() => computeSummary(draftRows), [draftRows]);
  const storageReady = dataset?.storageReady !== false;
  const saveDisabled = loading || saving || dataset?.locked || !dirty || !storageReady;

  const colorNameMap = useMemo(() => {
    const byId = new Map();
    const byCode = new Map();
    colorOptions.forEach((color) => {
      const localizedName = String(
        resolveLocalizedAttributeName(color, languageCode) || color?.code || ''
      ).trim();
      if (!localizedName) return;
      const numericId = Number(color?.id);
      if (Number.isFinite(numericId) && numericId > 0) {
        byId.set(numericId, localizedName);
      }
      const codeKey = normalizeColorCodeKey(color?.code);
      if (codeKey) {
        byCode.set(codeKey, localizedName);
      }
    });
    return { byId, byCode };
  }, [colorOptions, languageCode]);

  const resolveRowColorLabel = useCallback(
    (row) => {
      const numericId = Number(row?.colorId);
      if (Number.isFinite(numericId) && numericId > 0) {
        const byIdName = colorNameMap.byId.get(numericId);
        if (byIdName) return byIdName;
      }

      const codeKey = normalizeColorCodeKey(row?.colorCode);
      if (codeKey) {
        const byCodeName = colorNameMap.byCode.get(codeKey);
        if (byCodeName) return byCodeName;
      }

      return String(row?.colorName || row?.colorCode || '').trim();
    },
    [colorNameMap]
  );

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
        resolveRowColorLabel(row),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [draftRows, filterMode, resolveRowColorLabel, searchText]);

  const emptyStateMessage = useMemo(() => {
    const orderCount = Number(dataset?.sourceSummary?.orderCount) || 0;
    const workLogCount = Number(dataset?.sourceSummary?.workLogCount) || 0;
    const totalRows = Array.isArray(draftRows) ? draftRows.length : 0;
    const hasSearch = String(searchText || '').trim().length > 0;

    if (hasSearch) return text('noRowsNoMatches');
    if (totalRows > 0 && filterMode !== 'all') return text('noRowsFiltered');
    if (orderCount === 0) return text('noRowsNoOrders');
    if (workLogCount === 0) return text('noRowsNoWorkLogs');
    return text('noRows');
  }, [
    dataset?.sourceSummary?.orderCount,
    dataset?.sourceSummary?.workLogCount,
    draftRows,
    filterMode,
    searchText,
    text,
  ]);

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
              <Stack
                direction="row"
                spacing={0.5}
                alignItems="center"
                sx={{ width: { xs: '100%', sm: 'auto' } }}
              >
                <TextField
                  label={text('month')}
                  type="month"
                  size="small"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ width: { xs: '100%', sm: 180 } }}
                />
                <Stack sx={{ gap: '2px' }}>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setMonth((prev) => shiftReviewMonthKey(prev, 1))}
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                  >
                    M+
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => setMonth((prev) => shiftReviewMonthKey(prev, -1))}
                    sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                  >
                    M-
                  </Button>
                </Stack>
              </Stack>
              <TextField
                label={text('filter')}
                select
                size="small"
                value={filterMode}
                onChange={(event) => setFilterMode(event.target.value)}
                sx={{ width: { xs: '100%', sm: 180 } }}
              >
                <MenuItem value="all">{text('filters.all')}</MenuItem>
                <MenuItem value="active">{text('filters.active')}</MenuItem>
                <MenuItem value="review">{text('filters.review')}</MenuItem>
                <MenuItem value="blocked">{text('filters.blocked')}</MenuItem>
                <MenuItem value="confirmed">{text('filters.confirmed')}</MenuItem>
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
              <SaveButton onClick={handleSave} disabled={saveDisabled} loading={saving} />
            </Stack>
          </Stack>
        </Paper>

        {!storageReady && (
          <Alert severity="error">{dataset?.storageMessage || text('storageNotReady')}</Alert>
        )}
        {dataset?.locked && <Alert severity="warning">{text('locked')}</Alert>}
        <Alert severity={localSummary.blocked > 0 || localSummary.review > 0 ? 'warning' : 'success'}>
          {text('payrollBlock')}
        </Alert>
        <Alert severity="info">
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
            {text('usageTitle')}
          </Typography>
          <Typography variant="body2">{text('usage1')}</Typography>
          <Typography variant="body2">{text('usage2')}</Typography>
          <Typography variant="body2">{text('usage3')}</Typography>
          <Typography variant="body2">{text('usage4')}</Typography>
          <Typography variant="body2">{text('usage5')}</Typography>
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
                        {emptyStateMessage}
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
                            {[row.styleName, resolveRowColorLabel(row)]
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
                            disabled={dataset?.locked || !storageReady}
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
                            disabled={dataset?.locked || !storageReady}
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
                            disabled={dataset?.locked || !storageReady}
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
                            disabled={dataset?.locked || !storageReady}
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
                            disabled={dataset?.locked || !storageReady}
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
                            disabled={dataset?.locked || !storageReady}
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
