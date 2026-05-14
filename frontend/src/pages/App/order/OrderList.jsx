import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  TextField,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  Typography,
  IconButton,
  Divider,
  Alert,
  Autocomplete,
  Stack,
  CircularProgress,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined';
import AppPageContainer from '../../../components/AppPageContainer';
import DeleteActionButton from '../../../components/DeleteActionButton';
import LastUpdaterLabel from '../../../components/LastUpdaterLabel';
import LockToggleSwitch from '../../../components/LockToggleSwitch';
import SaveButton from '../../../components/SaveButton';
import CustomDatePicker from '../../../components/CustomDatePicker';
import PageSectionHeader from '../../../components/PageSectionHeader';
import SearchInput from '../../../components/SearchInput';
import SearchableSelect from '../../../components/SearchableSelect';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import { createAutocompleteFilterOptions } from '../../../utils/autocompleteSearch';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import { createColorAttribute, fetchAttributes } from '../../../utils/attributeApi';
import {
  SIZE_CODES,
  GENDER_CODES,
  getGenderLabel,
  normalizeGenderCode,
} from '../../../constants/productAttributes';
import { collectAttributeTextCandidates, resolveLocalizedAttributeName } from '../../../utils/appLanguage';
import {
  ORDER_STATUS_KEYS,
  ORDER_STATUS_OPTIONS,
  ORDER_STATUS_TEXT,
  getOrderStatusLabel as getOrderStatusLabelFromConst,
  normalizeOrderStatus as normalizeOrderStatusFromConst,
} from '../../../constants/orderStatus';
import {
  getOrderPartyRoleLabel,
  getOrderPartyRoleLabelWithType,
  getOrderPartyText,
  ORDER_PARTY_ROLE_KEYS,
} from '../../../constants/orderPartyRole';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import {
  fetchOrders as fetchOrdersFromApi,
  createOrder as createOrderToApi,
  updateOrder as updateOrderToApi,
  deleteOrder as deleteOrderToApi,
  toggleOrderModificationLock as toggleOrderModificationLockToApi,
} from '../../../utils/orderApi';
import {
  emitOrderModificationLockChanged,
  subscribeOrderModificationLockChanged,
} from '../../../utils/orderSyncEvents';
import {
  emitWorkspaceDataChanged,
  WORKSPACE_DATA_TOPICS,
} from '../../../utils/workspaceDataEvents';
import {
  calculateProcessTotalForOrderQuantity,
  normalizeProcesses,
} from '../../../utils/processTime';
import { reconcileBoardStateForQuantityChanges } from '../../../utils/quantityChangeBoard.mjs';

const { useDeferredValue } = React;

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORDER_PROGRESS_STAGE_NONE = '__NONE__';
const ORDER_PROGRESS_STAGES = ORDER_STATUS_OPTIONS.map((option) => option.value);
const ORDER_PROGRESS_STAGE_DEFAULT = ORDER_PROGRESS_STAGES[0] || '';
const ORDER_FILTER_ALL = 'ALL';
const ORDER_FILTER_EXCEPT_DONE = '__EXCEPT_DONE__';
const ORDER_DETAIL_VIEW_MODES = {
  VERTICAL: 'vertical',
  HORIZONTAL: 'horizontal',
};
const GENDER_OPTIONS = GENDER_CODES;
const ORDER_DETAIL_HORIZONTAL_GENDERS = ['M', 'W', 'U'];
const ORDER_DETAIL_HORIZONTAL_GROUP_DIVIDER = '1px solid #dbe3ec';
const ORDER_DETAIL_HORIZONTAL_STYLE_COLUMN_WIDTH = 220;
const ORDER_DETAIL_HORIZONTAL_COLOR_COLUMN_WIDTH = 160;
const SIZE_COLUMNS = SIZE_CODES;
const LAST_SIZE_COLUMN = SIZE_COLUMNS[SIZE_COLUMNS.length - 1] || '';
const ORDER_DETAIL_SIZE_COLUMN_WIDTH = `${(38 / SIZE_COLUMNS.length).toFixed(3)}%`;
const getSizeColumnHeaderLabel = (sizeCode) =>
  String(sizeCode || '').toUpperCase() === 'FREE' ? 'F' : sizeCode;
const ORDER_FILTER_DATE_PICKER_SLOT_PROPS = {
  textField: {
    sx: {
      width: { xs: 132, sm: 140 },
    },
  },
};
const GENDER_OPTION_LABELS = {
  M: '남성',
  W: '여성',
  U: '공용',
};
const ORDER_LIST_COLUMN_WIDTHS = {
  progress: '8%',
  orderNumber: '10%',
  buyer: '15%',
  seller: '15%',
  style: '24%',
  totalQuantity: '10%',
  dueDate: '10%',
  lock: '5%',
  actions: '3%',
};
const ORDER_LIST_TEXT_ELLIPSIS_SX = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const getOrderLockButtonSx = (isLocked) => (theme) => {
  const primaryMain = theme.palette.primary.main;
  const textPrimary = theme.palette.text.primary;

  if (isLocked) {
    return {
      minWidth: 116,
      height: 36,
      px: 1.75,
      borderRadius: 1.5,
      border: `1px solid ${alpha(textPrimary, 0.9)}`,
      backgroundColor: alpha(textPrimary, 0.9),
      color: theme.palette.common.white,
      fontWeight: 700,
      '&:hover': {
        borderColor: textPrimary,
        backgroundColor: textPrimary,
      },
      '& .MuiButton-startIcon': {
        marginLeft: 0,
        marginRight: theme.spacing(0.75),
      },
      '&.Mui-disabled': {
        borderColor: alpha(textPrimary, 0.38),
        backgroundColor: alpha(textPrimary, 0.38),
        color: alpha(theme.palette.common.white, 0.76),
      },
    };
  }

  return {
    minWidth: 116,
    height: 36,
    px: 1.75,
    borderRadius: 1.5,
    border: `1px solid ${alpha(primaryMain, 0.38)}`,
    backgroundColor: alpha(primaryMain, 0.08),
    color: primaryMain,
    fontWeight: 700,
    '&:hover': {
      borderColor: alpha(primaryMain, 0.55),
      backgroundColor: alpha(primaryMain, 0.16),
    },
    '& .MuiButton-startIcon': {
      marginLeft: 0,
      marginRight: theme.spacing(0.75),
    },
    '&.Mui-disabled': {
      borderColor: alpha(primaryMain, 0.22),
      backgroundColor: alpha(primaryMain, 0.08),
      color: alpha(primaryMain, 0.48),
    },
  };
};
const GENDER_SORT_ORDER = {
  M: 0,
  W: 1,
  U: 2,
};
const STYLE_GROUP_PASTEL_STYLES = [
  { background: '#eaf4ff', border: '#cfe2ff', accent: '#7ab6ff' },
  { background: '#ffeef3', border: '#ffd6e0', accent: '#ff9eb9' },
  { background: '#edf9f0', border: '#d4eedb', accent: '#8fcea0' },
  { background: '#fff7e6', border: '#f1dfb8', accent: '#dba84a' },
  { background: '#f3efff', border: '#ded5ff', accent: '#a58bf0' },
  { background: '#eefafa', border: '#cfeaea', accent: '#69bebe' },
];
const STYLE_GROUP_PASTEL_FALLBACK = {
  background: '#f7f7f7',
  border: '#ececec',
  accent: '#c6c6c6',
};
const getStyleGroupPastelStyle = (index) => {
  if (!STYLE_GROUP_PASTEL_STYLES.length) return STYLE_GROUP_PASTEL_FALLBACK;
  const safeIndex = Number.isFinite(index) ? Math.abs(index) : 0;
  return STYLE_GROUP_PASTEL_STYLES[safeIndex % STYLE_GROUP_PASTEL_STYLES.length];
};
const normalizeOrderProgressStage = (status) => normalizeOrderStatusFromConst(status);
const getOrderProgressStageLabel = (
  status,
  fallback = String(status || '').trim() || '-',
  languageCode
) => getOrderStatusLabelFromConst(status, fallback, languageCode);
const normalizeFilterDate = (value) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};
const buildDateKey = (value) => {
  const date = normalizeFilterDate(value);
  if (!date) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const normalizeDateKey = (value) => {
  const trimmed = String(value || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : '';
};
const getMonthStart = (value) => {
  const date = normalizeFilterDate(value) || new Date();
  date.setDate(1);
  return date;
};
const getMonthEnd = (value) => {
  const date = getMonthStart(value);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date;
};
const getOrderDueDateBounds = (orders = []) => {
  let minDate = null;
  let maxDate = null;

  (Array.isArray(orders) ? orders : []).forEach((order) => {
    const dueDate = normalizeFilterDate(order?.dueDate);
    if (!dueDate) return;
    if (!minDate || dueDate < minDate) minDate = dueDate;
    if (!maxDate || dueDate > maxDate) maxDate = dueDate;
  });

  if (!minDate || !maxDate) return null;
  return { minDate, maxDate };
};
const addMonths = (value, amount) => {
  const date = getMonthStart(value);
  date.setMonth(date.getMonth() + amount);
  return getMonthStart(date);
};
const buildOrderTabLabel = (order, baseLabel = 'Order') => {
  const orderNumber = String(order?.orderNumber || order?.id || '').trim();
  return orderNumber ? `${baseLabel}: ${orderNumber}` : baseLabel;
};
const ORDER_MODIFICATION_LOCK_MESSAGE =
  '잠긴 주문은 수정하거나 삭제할 수 없습니다.';
const toOrgId = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const hasRelationshipPair = (pairs, buyerOrgId, sellerOrgId) => {
  const buyerIdNum = toOrgId(buyerOrgId);
  const sellerIdNum = toOrgId(sellerOrgId);
  if (!buyerIdNum || !sellerIdNum) return false;
  return (Array.isArray(pairs) ? pairs : []).some(
    (pair) =>
      Number(pair?.brandOrgId) === buyerIdNum &&
      Number(pair?.manufacturerOrgId) === sellerIdNum
  );
};
const getStyleGroupKey = (item, deferredMergeRowIdSet = null) => {
  const rowId = String(item?.id || '').trim();
  if (
    rowId &&
    deferredMergeRowIdSet?.has(rowId) &&
    shouldKeepDeferredRowSeparated(item)
  ) {
    return `item:${rowId}`;
  }
  if (item?.styleId) return `style:${item.styleId}`;
  if (item?.styleName) return `style-name:${item.styleName}`;
  if (item?.styleCode) return `style-code:${item.styleCode}`;
  return `item:${rowId}`;
};
const getStyleIdentity = (item) => item?.styleId || item?.styleName || item?.styleCode || '';
const normalizeColorCode = (value) => String(value ?? '').trim().toUpperCase();
const normalizeColorNameKey = (value) => String(value ?? '').trim().toLowerCase();
const toPositiveColorId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const getItemColorIdentity = (item) => {
  const colorId = toPositiveColorId(item?.colorId);
  if (colorId) return `id:${colorId}`;
  const colorCode = normalizeColorCode(item?.colorCode || item?.colorId || item?.color || '');
  return colorCode ? `code:${colorCode}` : '';
};
const buildColorMergedRows = (rows = [], getColorMergeKey = getItemColorIdentity) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  return safeRows.map((row, index) => {
    const colorIdentity = getColorMergeKey(row?.item);
    const itemId = String(row?.item?.id || '').trim();
    if (!colorIdentity) {
      return {
        ...row,
        isColorFirstRow: true,
        colorRowSpan: 1,
        colorRowItemIds: itemId ? [itemId] : [],
      };
    }

    const previousColorIdentity = getColorMergeKey(safeRows[index - 1]?.item);
    if (previousColorIdentity === colorIdentity) {
      return {
        ...row,
        isColorFirstRow: false,
        colorRowSpan: 0,
        colorRowItemIds: [],
      };
    }

    const colorRowItemIds = itemId ? [itemId] : [];
    let colorRowSpan = 1;
    for (let nextIndex = index + 1; nextIndex < safeRows.length; nextIndex += 1) {
      if (getColorMergeKey(safeRows[nextIndex]?.item) !== colorIdentity) break;
      colorRowSpan += 1;
      const nextItemId = String(safeRows[nextIndex]?.item?.id || '').trim();
      if (nextItemId) {
        colorRowItemIds.push(nextItemId);
      }
    }

    return {
      ...row,
      isColorFirstRow: true,
      colorRowSpan,
      colorRowItemIds,
    };
  });
};
const normalizeBoardKey = (value) => String(value ?? '').trim();
const buildAssignmentOriginCardId = (orderId, styleId) =>
  `${normalizeBoardKey(orderId)}::${normalizeBoardKey(styleId)}`;
const resolveOrderItemQuantityForBoard = (item) => {
  if (Number(item?.totalQuantity) > 0) return Number(item.totalQuantity);
  if (item?.sizeQuantities && typeof item.sizeQuantities === 'object') {
    const qty = sumSizeQuantities(item.sizeQuantities);
    if (qty > 0) return qty;
  }
  return 0;
};
const buildOrderVariantMapForBoard = ({ orderId, items }) => {
  const normalizedOrderId = normalizeBoardKey(orderId);
  if (!normalizedOrderId) return new Map();

  return (Array.isArray(items) ? items : []).reduce((map, item) => {
    const styleId = normalizeBoardKey(item?.styleId);
    if (!styleId) return map;

    const styleName = String(item?.styleName || '').trim();
    const styleCode = String(item?.styleCode || '').trim();
    const qty = Number(resolveOrderItemQuantityForBoard(item)) || 0;
    if (qty <= 0) return map;
    const originId = buildAssignmentOriginCardId(normalizedOrderId, styleId);
    const current = map.get(originId);
    if (!current) {
      map.set(originId, {
        originId,
        styleId,
        styleName,
        styleCode,
        colorId: '',
        colorName: '',
        gender: '',
        quantity: qty,
      });
      return map;
    }
    current.quantity += qty;
    if (!current.styleName && styleName) current.styleName = styleName;
    if (!current.styleCode && styleCode) current.styleCode = styleCode;
    return map;
  }, new Map());
};
const getStyleColorGenderKey = (styleIdentity, colorIdentity, gender) => {
  const normalizedGender = normalizeGenderCode(gender, '');
  const normalizedColorIdentity = String(colorIdentity || '').trim();
  if (!styleIdentity || !normalizedColorIdentity || !normalizedGender) return '';
  return `${styleIdentity}::${normalizedColorIdentity}::${normalizedGender}`;
};
const getItemColorCode = (item) =>
  normalizeColorCode(item?.colorCode || item?.colorId || item?.color || '');
const hasDuplicateStyleColorGender = (items = []) => {
  const seen = new Set();
  for (const item of items) {
    const key = getStyleColorGenderKey(
      getStyleIdentity(item),
      getItemColorIdentity(item),
      item?.gender
    );
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};
const normalizeLocalizedColorOption = (item = {}) => {
  const normalized = {
    id: item?.id ?? null,
    code: normalizeColorCode(item?.code),
    name: String(item?.nameEn || item?.name || item?.nameKo || item?.nameVi || item?.code || '').trim(),
    nameKo: String(item?.nameKo || '').trim(),
    nameEn: String(item?.nameEn || item?.name || '').trim(),
    nameVi: String(item?.nameVi || '').trim(),
  };

  return {
    ...normalized,
    displayName: String(item?.displayName || resolveLocalizedAttributeName(normalized) || normalized.code).trim(),
    searchText: String(
      item?.searchText || collectAttributeTextCandidates(normalized).join(' ')
    ).trim(),
  };
};

const mergeColorOption = (items = [], nextItem) => {
  const normalizedNextItem = normalizeLocalizedColorOption(nextItem);
  if (!normalizedNextItem.code) return items;

  const nextId = toPositiveColorId(normalizedNextItem.id);
  let replaced = false;
  const merged = (Array.isArray(items) ? items : []).map((item) => {
    const normalizedItem = normalizeLocalizedColorOption(item);
    const sameId = nextId && toPositiveColorId(normalizedItem.id) === nextId;
    const sameCode = normalizedItem.code && normalizedItem.code === normalizedNextItem.code;
    if (!sameId && !sameCode) return normalizedItem;
    replaced = true;
    return normalizedNextItem;
  });
  return replaced ? merged : [...merged, normalizedNextItem];
};
const normalizeTargetItemIds = (itemIdOrIds) => {
  const itemIds = Array.isArray(itemIdOrIds) ? itemIdOrIds : [itemIdOrIds];
  return Array.from(
    new Set(
      itemIds
        .map((itemId) => String(itemId || '').trim())
        .filter(Boolean)
    )
  );
};
const hasSameItemOrder = (currentItems = [], nextItems = []) =>
  currentItems.length === nextItems.length &&
  currentItems.every((item, index) => String(item?.id || '') === String(nextItems[index]?.id || ''));
const setInputElementInMap = (mapRef, key, node) => {
  if (!key) return;
  if (node) {
    mapRef.current.set(key, node);
    return;
  }
  mapRef.current.delete(key);
};
const focusInputElementInMap = (mapRef, key, maxRetries = 6) => {
  if (!key) return;
  const tryFocus = (remainingRetries) => {
    requestAnimationFrame(() => {
      const node = mapRef.current.get(key);
      const isDisabled =
        !node ||
        node.disabled ||
        node.getAttribute?.('disabled') != null ||
        node.getAttribute?.('aria-disabled') === 'true';
      if (isDisabled) {
        if (remainingRetries > 0) {
          tryFocus(remainingRetries - 1);
        }
        return;
      }
      if (typeof node.focus === 'function') {
        node.focus();
      }
      if (typeof node.select === 'function') {
        node.select();
      }
    });
  };
  tryFocus(maxRetries);
};
const normalizeTextKey = (value) => String(value || '').trim().toLowerCase();
const filterColorOptions = createAutocompleteFilterOptions({
  getOptionLabel: (option) =>
    option?.searchText || option?.displayName || option?.name || option?.code || '',
});
const hasDuplicateOrderNumberByCustomer = ({
  orders = [],
  currentOrderId = '',
  orderNumber = '',
  buyerOrgId = null,
  sellerOrgId = null,
  buyerOrgName = '',
  sellerOrgName = '',
}) => {
  const targetOrderNumber = String(orderNumber || '').trim();
  if (!targetOrderNumber) return false;

  const targetBuyerId = toOrgId(buyerOrgId);
  const targetSellerId = toOrgId(sellerOrgId);
  const targetBuyerName = normalizeTextKey(buyerOrgName);
  const targetSellerName = normalizeTextKey(sellerOrgName);

  return (Array.isArray(orders) ? orders : []).some((order) => {
    if (!order) return false;
    if (currentOrderId && String(order.id || '') === String(currentOrderId)) return false;
    if (String(order.orderNumber || '').trim() !== targetOrderNumber) return false;

    const orderBuyerId = toOrgId(order.buyerOrgId ?? order.customerId);
    const orderSellerId = toOrgId(order.sellerOrgId);
    if (targetBuyerId && targetSellerId && orderBuyerId && orderSellerId) {
      return targetBuyerId === orderBuyerId && targetSellerId === orderSellerId;
    }

    const orderBuyerName = normalizeTextKey(
      order.buyerOrgName || order.customerName || order.customer || ''
    );
    const orderSellerName = normalizeTextKey(order.sellerOrgName || '');
    if (!targetBuyerName || !targetSellerName || !orderBuyerName || !orderSellerName) {
      return false;
    }
    return targetBuyerName === orderBuyerName && targetSellerName === orderSellerName;
  });
};
const resolveOrderSaveErrorMessage = (error, options = {}) => {
  const {
    modificationLockedMessage = ORDER_MODIFICATION_LOCK_MESSAGE,
    duplicateOrderNumberMessage = '같은 고객사에는 동일한 주문번호를 사용할 수 없습니다.',
    fallbackMessage = '주문 저장 중 오류가 발생했습니다.',
  } = options;
  const message = String(error?.message || '').trim();
  if (message.includes('order modification is locked')) {
    return modificationLockedMessage;
  }
  if (message === 'order number already exists for this customer') {
    return duplicateOrderNumberMessage;
  }
  return message || fallbackMessage;
};
const resolveOrderModificationLockToggleErrorMessage = (error, options = {}) => {
  const {
    lockChangeNotAllowedMessage = '배정 계약이 있는 주문은 여기서 잠금 상태를 바꿀 수 없습니다.',
    unlockReleaseRequiredMessage = '잠금을 해제하려면 관련 배정을 먼저 해제해야 합니다.',
    unlockPastReleaseConfirmMessage = '배정 시작일이 지난 배정이 있어 추가 확인이 필요합니다.',
    modificationLockedMessage = ORDER_MODIFICATION_LOCK_MESSAGE,
    fallbackMessage = '주문 잠금 상태를 변경하는 중 오류가 발생했습니다.',
  } = options;
  const message = String(error?.message || '').trim();
  if (message.includes('order modification lock cannot be changed')) {
    return lockChangeNotAllowedMessage;
  }
  if (message.includes('order unlock requires assignment release')) {
    return unlockReleaseRequiredMessage;
  }
  if (message.includes('order unlock requires past assignment release confirmation')) {
    return unlockPastReleaseConfirmMessage;
  }
  if (message.includes('order modification is locked')) {
    return modificationLockedMessage;
  }
  return message || fallbackMessage;
};
const formatOrderLockTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};
const getGenderOrder = (gender) =>
  Number.isFinite(GENDER_SORT_ORDER[gender]) ? GENDER_SORT_ORDER[gender] : 99;
const normalizeSizeKey = (value) => {
  const raw = String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!raw) return '';
  if (SIZE_COLUMNS.includes(raw)) return raw;
  if (raw === 'XXL' || raw === '2X') return '2XL';
  if (raw === 'XXXL' || raw === '3X') return '3XL';
  if (raw === 'XXXXL' || raw === '4X') return '4XL';
  if (raw === 'FREE' || raw === 'FREESIZE' || raw === 'ONESIZE' || raw === 'ONESZ' || raw === 'F') return 'FREE';
  return '';
};
const toNumericInputString = (value) => String(value ?? '').replace(/[^\d]/g, '');
const isPositiveQuantityValue = (value) => (Number(value) || 0) > 0;
const getQuantityTextColor = (value) =>
  isPositiveQuantityValue(value) ? 'text.primary' : 'text.disabled';
const getDisplayQuantityInputValue = (value) => {
  const normalized = toNumericInputString(value);
  return isPositiveQuantityValue(normalized) ? normalized : '';
};
const formatQuantityDisplay = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return '-';
  return parsed.toLocaleString();
};
const createSizeQuantities = () =>
  SIZE_COLUMNS.reduce((acc, size) => {
    acc[size] = '';
    return acc;
  }, {});
const normalizeSizeQuantities = (value = {}) => {
  const base = createSizeQuantities();
  SIZE_COLUMNS.forEach((size) => {
    base[size] = toNumericInputString(value?.[size] ?? '');
  });
  return base;
};
const hasAnySizeQuantity = (sizeQuantities = {}) =>
  SIZE_COLUMNS.some((size) => Number(sizeQuantities?.[size]) > 0);
function shouldKeepDeferredRowSeparated(item) {
  const styleIdentity = getStyleIdentity(item);
  const colorIdentity = getItemColorIdentity(item);
  const normalizedGender = normalizeGenderCode(item?.gender, '');
  const normalizedSizeQuantities = normalizeSizeQuantities(item?.sizeQuantities);
  return (
    !styleIdentity ||
    !colorIdentity ||
    !normalizedGender ||
    !hasAnySizeQuantity(normalizedSizeQuantities)
  );
}
const sumSizeQuantities = (sizeQuantities = {}) =>
  SIZE_COLUMNS.reduce((sum, size) => sum + (Number(sizeQuantities?.[size]) || 0), 0);
const buildSizeQuantitiesFromLegacyRows = (rows = []) =>
  rows.reduce((acc, row) => {
    const sizeKey = normalizeSizeKey(row?.sizeId || row?.sizeName || row?.size);
    if (!sizeKey) return acc;
    acc[sizeKey] = String((Number(acc[sizeKey]) || 0) + (Number(row?.quantity) || 0));
    return acc;
  }, createSizeQuantities());

const normalizeQuantityRow = (row) => ({
  id: row?.id || createId('qty'),
  colorId: row?.colorId ?? null,
  colorCode: normalizeColorCode(row?.colorCode || row?.color || ''),
  colorName: String(row?.colorName || row?.color || '').trim(),
  gender: normalizeGenderCode(row?.gender || row?.colorId, ''),
  sizeId: row?.sizeId || '',
  quantity: row?.quantity ?? '',
});

const createOrderItem = () => ({
  id: createId('item'),
  styleId: '',
  styleName: '',
  styleCode: '',
  colorId: null,
  colorCode: '',
  colorName: '',
  gender: '',
  sizeQuantities: createSizeQuantities(),
});

const normalizeOrderItem = (item) => {
  const normalizedGender = normalizeGenderCode(item?.gender, '');
  const legacyRows =
    Array.isArray(item?.quantities) && item.quantities.length > 0
      ? item.quantities.map(normalizeQuantityRow)
      : [];
  const colorCodeFromItem = normalizeColorCode(item?.colorCode || item?.color || '');
  let colorCode = colorCodeFromItem;
  let colorName = String(item?.colorName || '').trim();
  let colorId = Number.isFinite(Number(item?.colorId)) && Number(item?.colorId) > 0
    ? Number(item.colorId)
    : null;
  let gender = normalizedGender;

  if ((!colorCode || !colorName || !colorId || !gender) && legacyRows.length > 0) {
    legacyRows.forEach((row) => {
      if (!gender) {
        gender = normalizeGenderCode(row?.gender || row?.colorId, '');
      }
      if (!colorCode) {
        const nextCode = normalizeColorCode(row?.colorCode || row?.color || '');
        const nextColorId = normalizeColorCode(row?.colorId);
        colorCode = nextCode || (nextColorId && !GENDER_OPTIONS.includes(nextColorId) ? nextColorId : '');
      }
      if (!colorName) {
        colorName = String(row?.colorName || row?.color || '').trim();
      }
      if (!colorId) {
        const parsedColorId = Number(row?.colorId);
        if (Number.isFinite(parsedColorId) && parsedColorId > 0) {
          colorId = parsedColorId;
        }
      }
    });
  }

  const sizeQuantities =
    item?.sizeQuantities && typeof item.sizeQuantities === 'object'
      ? normalizeSizeQuantities(item.sizeQuantities)
      : buildSizeQuantitiesFromLegacyRows(legacyRows);

  return {
    id: item?.id || createId('item'),
    styleId: item?.styleId || '',
    styleName: item?.styleName || '',
    styleCode: item?.styleCode || '',
    colorId,
    colorCode,
    colorName,
    gender: gender || '',
    sizeQuantities,
    totalQuantity: Number(item?.totalQuantity) > 0
      ? Number(item.totalQuantity)
      : sumSizeQuantities(sizeQuantities),
  };
};

const buildInitialFormData = () => ({
  orderNumber: '',
  buyerOrgId: '',
  buyerOrgName: '',
  sellerOrgId: '',
  sellerOrgName: '',
  customerId: '',
  customerName: '',
  dueDate: '',
  status: ORDER_PROGRESS_STAGE_DEFAULT,
  items: [createOrderItem()],
});

const normalizeOrderForm = (order) => {
  const base = buildInitialFormData();
  if (!order) return base;
  const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : base.items;
  return {
    ...base,
    ...order,
    buyerOrgId: order.buyerOrgId || order.customerId || base.buyerOrgId,
    buyerOrgName:
      order.buyerOrgName || order.customerName || order.customer || base.buyerOrgName,
    sellerOrgId: order.sellerOrgId || base.sellerOrgId,
    sellerOrgName: order.sellerOrgName || base.sellerOrgName,
    customerId: order.customerId || order.buyerOrgId || base.customerId,
    customerName:
      order.customerName || order.buyerOrgName || order.customer || base.customerName,
    items: items.map(normalizeOrderItem),
    status: normalizeOrderProgressStage(order.status) || base.status,
  };
};
const toStableJsonText = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => toStableJsonText(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${toStableJsonText(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
};
const toComparableOrderSnapshot = (source, fixedSellerOrg = null) => {
  const resolvedSellerOrgId = toOrgId(fixedSellerOrg?.id ?? source?.sellerOrgId);
  const resolvedSellerOrgName = String(fixedSellerOrg?.name || source?.sellerOrgName || '').trim();
  const normalizedItems = (Array.isArray(source?.items) ? source.items : []).map((item) => {
    const normalizedSizeQuantities = normalizeSizeQuantities(item?.sizeQuantities);
    const sizeQuantities = SIZE_COLUMNS.reduce((acc, size) => {
      const quantity = Number(normalizedSizeQuantities?.[size]) || 0;
      if (quantity > 0) {
        acc[size] = quantity;
      }
      return acc;
    }, {});
    return {
      styleId: String(item?.styleId || '').trim(),
      styleName: String(item?.styleName || '').trim(),
      styleCode: String(item?.styleCode || '').trim(),
      colorId: toPositiveColorId(item?.colorId),
      colorCode: getItemColorCode(item),
      colorName: String(item?.colorName || '').trim(),
      gender: normalizeGenderCode(item?.gender, '') || '',
      sizeQuantities,
    };
  });

  return {
    orderNumber: String(source?.orderNumber || '').trim(),
    buyerOrgId: toOrgId(source?.buyerOrgId),
    buyerOrgName: String(source?.buyerOrgName || source?.customerName || '').trim(),
    sellerOrgId: resolvedSellerOrgId,
    sellerOrgName: resolvedSellerOrgName,
    dueDate: String(source?.dueDate || '').trim(),
    status: normalizeOrderProgressStage(source?.status) || ORDER_PROGRESS_STAGE_DEFAULT,
    items: normalizedItems,
  };
};

const getStyleSummaryKey = (item) => {
  const styleId = String(item?.styleId || '').trim();
  if (styleId) return `id:${styleId}`;

  const styleCode = String(item?.styleCode || '').trim().toUpperCase();
  if (styleCode) return `code:${styleCode}`;

  const styleName = String(item?.styleName || '').trim().toLowerCase();
  if (styleName) return `name:${styleName}`;

  return '';
};

const getStyleDisplayNames = (items = []) => {
  const seen = new Set();
  const names = [];

  (Array.isArray(items) ? items : []).forEach((item) => {
    const displayName = String(item?.styleName || item?.styleCode || '').trim();
    if (!displayName) return;

    const dedupeKey = getStyleSummaryKey(item) || `name:${displayName.toLowerCase()}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    names.push(displayName);
  });

  return names;
};

const formatStyleSummary = (items = [], languageCode = 'ko') => {
  const names = getStyleDisplayNames(items);
  if (names.length === 0) return '-';
  if (names.length === 1) return names[0];
  if (languageCode === 'vi') {
    return `${names[0]} + ${names.length - 1} style`;
  }
  if (languageCode === 'en') {
    return `${names[0]} + ${names.length - 1} styles`;
  }
  return `${names[0]} 외 ${names.length - 1}개`;
};

const OrderList = () => {
  const location = useLocation();
  const { orderId } = useParams();
  const isDetailMode = Boolean(orderId);
  const isNewOrder = orderId === 'new';
  const isOrderListRouteActive = location.pathname === '/order';
  const isOrderDetailRouteActive = location.pathname.startsWith('/order/');
  const { showNotification, navigateToPath } = useAppActions();
  const { activeOrgId, activeOrgType, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const orderPageText = useMemo(
    () => ({
      listTitle: getUiMessage('menu.order', 'Orders', languageCode),
      newOrderTab:
        languageCode === 'vi'
          ? 'Don hang moi'
          : languageCode === 'en'
            ? 'New Order'
            : '신규 주문',
      addOrder:
        languageCode === 'vi'
          ? 'Them don hang'
          : languageCode === 'en'
            ? 'Add Order'
            : '주문 추가',
      deleteOrder:
        languageCode === 'vi'
          ? 'Xoa don hang'
          : languageCode === 'en'
            ? 'Delete Order'
            : '주문 삭제',
      previousMonth:
        languageCode === 'vi'
          ? 'Thang truoc'
          : languageCode === 'en'
            ? 'Previous month'
            : '이전 달',
      nextMonth:
        languageCode === 'vi'
          ? 'Thang sau'
          : languageCode === 'en'
            ? 'Next month'
            : '다음 달',
      orderNumber:
        languageCode === 'vi'
          ? 'So don'
          : languageCode === 'en'
            ? 'Order No.'
            : '주문번호',
      styleColumn:
        languageCode === 'vi'
          ? 'Style'
          : languageCode === 'en'
            ? 'Style'
            : '스타일',
      totalQuantity:
        languageCode === 'vi'
          ? 'Tong so luong'
          : languageCode === 'en'
            ? 'Total Qty'
            : '합계 수량',
      dueDate:
        languageCode === 'vi'
          ? 'Han giao'
          : languageCode === 'en'
            ? 'Due Date'
            : '납기일',
      actions:
        languageCode === 'vi'
          ? 'Quan ly'
          : languageCode === 'en'
            ? 'Actions'
            : '관리',
      loadingOrders:
        languageCode === 'vi'
          ? 'Dang tai danh sach don hang...'
          : languageCode === 'en'
            ? 'Loading orders...'
            : '주문 목록을 불러오는 중입니다.',
      emptyOrders:
        languageCode === 'vi'
          ? 'Khong co don hang phu hop bo loc hien tai.'
          : languageCode === 'en'
            ? 'No orders match the current filters.'
            : '조건에 맞는 주문이 없습니다.',
      styleSection:
        languageCode === 'vi'
          ? 'Cau hinh style'
          : languageCode === 'en'
            ? 'Style Setup'
            : '스타일 구성',
      detailViewModeVertical:
        languageCode === 'vi'
          ? 'Doc'
          : languageCode === 'en'
            ? 'Vertical'
            : '세로',
      detailViewModeHorizontal:
        languageCode === 'vi'
          ? 'Ngang'
          : languageCode === 'en'
            ? 'Horizontal'
            : '가로',
      styleAdd: getUiMessage('styleBoard.addStyle', 'Add Style', languageCode),
      detailStyleNameCode:
        languageCode === 'vi'
          ? 'Style'
          : languageCode === 'en'
            ? 'Style'
            : '스타일',
      detailStyleCode:
        languageCode === 'vi'
          ? 'Ma style'
          : languageCode === 'en'
            ? 'Style Code'
            : '스타일 코드',
      detailStyleCodeAuto:
        languageCode === 'vi'
          ? 'Ma style (Tu dong)'
          : languageCode === 'en'
            ? 'Style Code (Auto)'
            : '스타일 코드 (자동입력)',
      autoInput:
        languageCode === 'vi'
          ? 'Tu dong'
          : languageCode === 'en'
            ? 'Auto-filled'
            : '자동 입력',
      color:
        languageCode === 'vi'
          ? 'Mau'
          : languageCode === 'en'
            ? 'Color'
            : '색상',
      gender:
        languageCode === 'vi'
          ? 'Gioi tinh'
          : languageCode === 'en'
            ? 'Gender'
            : '성별',
      total:
        languageCode === 'vi'
          ? 'Tong'
          : languageCode === 'en'
            ? 'Total'
            : '합계',
      styleSubtotal:
        languageCode === 'vi'
          ? 'Tong style'
          : languageCode === 'en'
            ? 'Style Subtotal'
            : '스타일 소계',
      styleSearchPlaceholder:
        languageCode === 'vi'
          ? 'Tim ten style'
          : languageCode === 'en'
            ? 'Search style name'
            : '스타일명 검색',
      noRegisteredStyles:
        languageCode === 'vi'
          ? 'Chua co style nao.'
          : languageCode === 'en'
            ? 'No registered styles.'
            : '등록된 스타일이 없습니다.',
      colorCreateHint:
        languageCode === 'vi'
          ? 'Ban co the them mau moi voi ten da nhap.'
          : languageCode === 'en'
            ? 'You can add a new color with this name.'
            : '입력한 이름으로 새 색상을 추가할 수 있습니다.',
      noRegisteredColors:
        languageCode === 'vi'
          ? 'Khong tim thay mau da dang ky.'
          : languageCode === 'en'
            ? 'No registered colors found.'
            : '등록된 색상을 찾을 수 없습니다.',
      colorSearchOrCreate:
        languageCode === 'vi'
          ? 'Tim hoac them mau'
          : languageCode === 'en'
            ? 'Search or add color'
            : '색상 검색 또는 추가',
      colorSearch:
        languageCode === 'vi'
          ? 'Tim mau'
          : languageCode === 'en'
            ? 'Search color'
            : '색상 검색',
      noSelectableGender:
        languageCode === 'vi'
          ? 'Khong co gioi tinh co the chon.'
          : languageCode === 'en'
            ? 'No selectable gender.'
            : '선택 가능한 성별이 없습니다.',
      selectGender:
        languageCode === 'vi'
          ? 'Chon gioi tinh'
          : languageCode === 'en'
            ? 'Select gender'
            : '성별 선택',
      orderTotalQuantity:
        languageCode === 'vi'
          ? 'Tong so luong don'
          : languageCode === 'en'
            ? 'Order Total Qty'
            : '주문 합계 수량',
      addNewColorPrefix:
        languageCode === 'vi'
          ? 'Them mau moi:'
          : languageCode === 'en'
            ? 'Add new color:'
            : '새 색상 추가:',
      manager:
        languageCode === 'vi'
          ? 'Quan ly'
          : languageCode === 'en'
            ? 'Manager'
            : '관리자',
      stylesLoadError:
        languageCode === 'vi'
          ? 'Khong the tai danh sach style.'
          : languageCode === 'en'
            ? 'Failed to load styles.'
            : '스타일 목록을 불러오지 못했습니다.',
      ordersLoadError:
        languageCode === 'vi'
          ? 'Khong the tai danh sach don hang.'
          : languageCode === 'en'
            ? 'Failed to load orders.'
            : '주문 목록을 불러오지 못했습니다.',
      partiesLoadError:
        languageCode === 'vi'
          ? 'Khong the tai thong tin doi tac don hang.'
          : languageCode === 'en'
            ? 'Failed to load order partner information.'
            : '주문 파트너 정보를 불러오지 못했습니다.',
      orderNotFound:
        languageCode === 'vi'
          ? 'Khong tim thay thong tin don hang.'
          : languageCode === 'en'
            ? 'Order information was not found.'
            : '주문 정보를 찾을 수 없습니다.',
      lockSaveFirstWarning:
        languageCode === 'vi'
          ? 'Hay luu thay doi truoc khi khoa don hang.'
          : languageCode === 'en'
            ? 'Save your changes before locking the order.'
            : '변경사항을 먼저 저장한 뒤 잠가 주세요.',
      lockChangeNotAllowed:
        languageCode === 'vi'
          ? 'Khong the doi trang thai khoa o day voi don da co hop dong phan cong.'
          : languageCode === 'en'
            ? 'You cannot change lock status here for orders with assignment contracts.'
            : '배정 계약이 있는 주문은 여기서 잠금 상태를 바꿀 수 없습니다.',
      lockUnlockReleaseAssignmentsConfirm:
        languageCode === 'vi'
          ? 'Mo khoa don hang se huy cac phan cong lien quan va chuyen ve trang thai chua phan cong. Ban co tiep tuc khong?'
          : languageCode === 'en'
            ? 'Unlocking this order will unassign related assignment cards. Continue?'
            : '주문 잠금을 해제하면 관련 배정 카드가 미배정으로 전환됩니다. 계속할까요?',
      lockUnlockPastAssignmentsConfirm:
        languageCode === 'vi'
          ? 'Co {count} phan cong co ngay bat dau truoc hom nay ({date}). Ban co chac chan muon huy phan cong khong?'
          : languageCode === 'en'
            ? '{count} assignments started before today ({date}). Do you still want to unassign them?'
            : '시작일이 오늘보다 이전인 배정이 {count}건 있습니다. ({date}) 그래도 배정을 해제할까요?',
      lockReleaseSummaryInfo:
        languageCode === 'vi'
          ? 'Da huy {count} phan cong lien quan va mo khoa don hang.'
          : languageCode === 'en'
            ? 'Unassigned {count} related assignments and unlocked the order.'
            : '관련 배정 {count}건을 해제하고 주문 잠금을 해제했습니다.',
      lockReleaseSummaryWithDetachedInfo:
        languageCode === 'vi'
          ? 'Da huy {count} phan cong, tach lien ket {detached} ban ghi cong viec va mo khoa don hang.'
          : languageCode === 'en'
            ? 'Unassigned {count} assignments, detached {detached} work records, and unlocked the order.'
            : '배정 {count}건을 해제하고 작업기록 {detached}건의 연결을 분리한 뒤 잠금을 해제했습니다.',
      lockEnabledSuccess:
        languageCode === 'vi'
          ? 'Da khoa sua don hang.'
          : languageCode === 'en'
            ? 'Order edit lock enabled.'
            : '주문 수정이 잠겼습니다.',
      lockDisabledSuccess:
        languageCode === 'vi'
          ? 'Da mo khoa sua don hang.'
          : languageCode === 'en'
            ? 'Order edit lock disabled.'
            : '주문 수정 잠금이 해제되었습니다.',
      lockColumn:
        languageCode === 'vi'
          ? 'Khoa'
          : languageCode === 'en'
            ? 'Lock'
            : '잠금',
      deleteTargetOrder:
        languageCode === 'vi'
          ? 'Don'
          : languageCode === 'en'
            ? 'Order'
            : '주문',
      deleteTargetFallback:
        languageCode === 'vi'
          ? 'Don da chon'
          : languageCode === 'en'
            ? 'this order'
            : '해당 주문',
      deleteConfirm:
        languageCode === 'vi'
          ? 'Ban co muon xoa khong?'
          : languageCode === 'en'
            ? 'Do you want to delete it?'
            : '삭제하시겠습니까?',
      deleteSuccess:
        languageCode === 'vi'
          ? 'Da xoa don hang.'
          : languageCode === 'en'
            ? 'Order deleted.'
            : '주문이 삭제되었습니다.',
      deleteError:
        languageCode === 'vi'
          ? 'Da xay ra loi khi xoa don hang.'
          : languageCode === 'en'
            ? 'An error occurred while deleting the order.'
            : '주문 삭제 중 오류가 발생했습니다.',
      duplicateStyleColorGender:
        languageCode === 'vi'
          ? 'Khong the chon trung cung to hop style/mau/gioi tinh.'
          : languageCode === 'en'
            ? 'You cannot select duplicate style/color/gender combinations.'
            : '같은 스타일/색상/성별 조합은 중복 선택할 수 없습니다.',
      colorCreatedSuccess:
        languageCode === 'vi'
          ? 'Da them mau moi.'
          : languageCode === 'en'
            ? 'Added a new color.'
            : '새 색상을 추가했습니다.',
      colorCreateError:
        languageCode === 'vi'
          ? 'Da xay ra loi khi them mau.'
          : languageCode === 'en'
            ? 'An error occurred while adding a color.'
            : '색상 추가 중 오류가 발생했습니다.',
      validationOrderNumberRequired:
        languageCode === 'vi'
          ? 'Hay nhap so don hang.'
          : languageCode === 'en'
            ? 'Please enter an order number.'
            : '주문번호를 입력해 주세요.',
      validationDuplicateOrderNumber:
        languageCode === 'vi'
          ? 'Khong the dung trung so don hang cho cung khach hang.'
          : languageCode === 'en'
            ? 'The same customer cannot use duplicate order numbers.'
            : '같은 고객사에는 동일한 주문번호를 사용할 수 없습니다.',
      validationDueDateRequired:
        languageCode === 'vi'
          ? 'Hay nhap han giao.'
          : languageCode === 'en'
            ? 'Please enter a due date.'
            : '납기일을 입력해 주세요.',
      validationAddStyle:
        languageCode === 'vi'
          ? 'Hay them style.'
          : languageCode === 'en'
            ? 'Please add a style.'
            : '스타일을 추가해 주세요.',
      validationSelectAllStyles:
        languageCode === 'vi'
          ? 'Hay chon tat ca style.'
          : languageCode === 'en'
            ? 'Please select all styles.'
            : '모든 스타일을 선택해 주세요.',
      validationSelectAllColors:
        languageCode === 'vi'
          ? 'Hay chon mau cho tat ca style.'
          : languageCode === 'en'
            ? 'Please select a color for every style.'
            : '모든 스타일에 색상을 선택해 주세요.',
      validationSelectAllGenderCodes:
        languageCode === 'vi'
          ? 'Hay chon ma gioi tinh (M/W/U) cho tat ca style.'
          : languageCode === 'en'
            ? 'Please select a gender code (M/W/U) for every style.'
            : '모든 스타일의 성별 코드(M/W/U)를 선택해 주세요.',
      validationEnterSizeQty:
        languageCode === 'vi'
          ? 'Hay nhap so luong size cho tung style.'
          : languageCode === 'en'
            ? 'Please enter size quantities for each style.'
            : '스타일별 사이즈 수량을 입력해 주세요.',
      validationDuplicateOnce:
        languageCode === 'vi'
          ? 'Moi to hop style/mau/gioi tinh chi duoc nhap mot lan.'
          : languageCode === 'en'
            ? 'Each style/color/gender combination can be entered only once.'
            : '같은 스타일/색상/성별 조합은 한 번만 입력할 수 있습니다.',
      noChanges:
        languageCode === 'vi'
          ? 'Khong co thay doi.'
          : languageCode === 'en'
            ? 'No changes to save.'
            : '변경된 내용이 없습니다.',
      orderToEditNotFound:
        languageCode === 'vi'
          ? 'Khong tim thay don hang de chinh sua.'
          : languageCode === 'en'
            ? 'Order to edit was not found.'
            : '수정할 주문 정보를 찾을 수 없습니다.',
      assignmentCancelledInfo:
        languageCode === 'vi'
          ? 'Do thay doi so luong hop dong, {count} phan cong cu da bi huy va chuyen thanh the chua phan cong.'
          : languageCode === 'en'
            ? '{count} existing assignments were cancelled and converted to unassigned cards due to contract quantity changes.'
            : '계약 수량 변경으로 기존 배정 {count}건이 취소되어 미배정 카드로 전환되었습니다.',
      orderSaved:
        languageCode === 'vi'
          ? 'Da luu thong tin don hang.'
          : languageCode === 'en'
            ? 'Order information saved.'
            : '주문 정보가 저장되었습니다.',
      saveErrorFallback:
        languageCode === 'vi'
          ? 'Da xay ra loi khi luu don hang.'
          : languageCode === 'en'
            ? 'An error occurred while saving the order.'
            : '주문 저장 중 오류가 발생했습니다.',
      lockToggleErrorFallback:
        languageCode === 'vi'
          ? 'Da xay ra loi khi thay doi trang thai khoa don hang.'
          : languageCode === 'en'
            ? 'An error occurred while changing order lock status.'
            : '주문 잠금 상태를 변경하는 중 오류가 발생했습니다.',
      lockUnlockReleaseRequired:
        languageCode === 'vi'
          ? 'De mo khoa, truoc tien hay huy cac phan cong lien quan.'
          : languageCode === 'en'
            ? 'To unlock this order, release related assignments first.'
            : '잠금을 해제하려면 관련 배정을 먼저 해제해야 합니다.',
      lockUnlockPastReleaseConfirmRequired:
        languageCode === 'vi'
          ? 'Co phan cong da bat dau truoc hom nay. Hay xac nhan them mot lan nua.'
          : languageCode === 'en'
            ? 'Some assignments started before today. One more confirmation is required.'
            : '오늘보다 이전에 시작한 배정이 있어 한 번 더 확인이 필요합니다.',
      lockSaveErrorFallback:
        languageCode === 'vi'
          ? 'Da xay ra loi khi luu don hang.'
          : languageCode === 'en'
            ? 'An error occurred while saving the order.'
            : '주문 저장 중 오류가 발생했습니다.',
      modificationLocked:
        languageCode === 'vi'
          ? 'Don hang da khoa khong the sua hoac xoa.'
          : languageCode === 'en'
            ? 'Locked orders cannot be edited or deleted.'
            : '잠긴 주문은 수정하거나 삭제할 수 없습니다.',
      modificationLockedNotice:
        languageCode === 'vi'
          ? 'Don hang dang bi khoa.'
          : languageCode === 'en'
            ? 'This order is locked.'
            : '주문이 잠겨 있습니다.',
    }),
    [languageCode]
  );
  const orderPartyText = useMemo(
    () => ({
      buyer: getOrderPartyRoleLabel(ORDER_PARTY_ROLE_KEYS.BUYER, 'Buyer', languageCode),
      seller: getOrderPartyRoleLabel(ORDER_PARTY_ROLE_KEYS.SELLER, 'Seller', languageCode),
      buyerWithType: getOrderPartyRoleLabelWithType(
        ORDER_PARTY_ROLE_KEYS.BUYER,
        'Buyer (Brand)',
        languageCode
      ),
      sellerWithType: getOrderPartyRoleLabelWithType(
        ORDER_PARTY_ROLE_KEYS.SELLER,
        'Seller (Manufacturer)',
        languageCode
      ),
      searchPlaceholder: getOrderPartyText(
        'searchPlaceholder',
        'Search order no., buyer, seller, style..',
        languageCode
      ),
      loadingPlaceholder: getOrderPartyText('loadingPlaceholder', 'Loading...', languageCode),
      selectBuyer: getOrderPartyText('selectBuyer', 'Select a buyer.', languageCode),
      selectSeller: getOrderPartyText('selectSeller', 'Select a seller.', languageCode),
      selectBuyerFirst: getOrderPartyText(
        'selectBuyerFirst',
        'Select a buyer first.',
        languageCode
      ),
      linkedPairOnly: getOrderPartyText(
        'linkedPairOnly',
        'Only linked buyer/seller pairs can be selected.',
        languageCode
      ),
    }),
    [languageCode]
  );
  const canCreateColorAttribute =
    activeProfile?.entryType === 'SYSTEM' && activeProfile?.systemRole === 'SYSTEM_ADMIN';
  const [orders, setOrders] = useState([]);
  const [styles, setStyles] = useState([]);
  const [colorOptions, setColorOptions] = useState([]);
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [sellerOptions, setSellerOptions] = useState([]);
  const [relationshipPairs, setRelationshipPairs] = useState([]);
  const [currentOrgOption, setCurrentOrgOption] = useState(null);
  const [partyRoleHint, setPartyRoleHint] = useState('');
  const [loadingParties, setLoadingParties] = useState(false);
  const [creatingColorItemId, setCreatingColorItemId] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const [progressFilter, setProgressFilter] = useState(ORDER_FILTER_ALL);
  const [dueDateFilterStart, setDueDateFilterStart] = useState(() => getMonthStart(new Date()));
  const [dueDateFilterEnd, setDueDateFilterEnd] = useState(() => getMonthEnd(new Date()));
  const [formData, setFormData] = useState(buildInitialFormData);
  const [detailViewMode, setDetailViewMode] = useState(ORDER_DETAIL_VIEW_MODES.HORIZONTAL);
  const [deferredMergeRowIds, setDeferredMergeRowIds] = useState(() => new Set());
  const pendingHorizontalStyleTabFocusItemIdRef = useRef('');
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const detailInitKeyRef = useRef(null);
  const hasTouchedDueDateFilterRef = useRef(false);
  const styleAddButtonRef = useRef(null);
  const styleInputRefs = useRef(new Map());
  const colorInputRefs = useRef(new Map());
  const genderInputRefs = useRef(new Map());
  const sizeInputRefs = useRef(new Map());
  const dueDateFilterStartKey = useMemo(
    () => buildDateKey(dueDateFilterStart),
    [dueDateFilterStart]
  );
  const dueDateFilterEndKey = useMemo(
    () => buildDateKey(dueDateFilterEnd),
    [dueDateFilterEnd]
  );
  const fixedSellerOrg = useMemo(() => {
    if (partyRoleHint !== 'MANUFACTURER') return null;
    const currentOrgId = toOrgId(currentOrgOption?.id);
    if (!currentOrgId) return null;
    return {
      id: currentOrgId,
      name: currentOrgOption?.name || '',
    };
  }, [partyRoleHint, currentOrgOption]);
  const isSellerLocked = Boolean(fixedSellerOrg);

  const refreshStyles = useCallback(async (orgId = null, { forceRefresh = false } = {}) => {
    try {
      const items = await fetchStylesFromApi({ orgId, compact: true, forceRefresh });
      setStyles(items);
    } catch (error) {
      setStyles([]);
      showNotification(error?.message || orderPageText.stylesLoadError, 'error');
    }
  }, [orderPageText.stylesLoadError, showNotification]);

  useEffect(() => {
    refreshStyles(activeOrgId);
  }, [activeOrgId, refreshStyles]);

  useEffect(() => {
    let cancelled = false;

    const loadColors = async () => {
      try {
        const data = await fetchAttributes({
          orgId: activeOrgId,
          includeColors: true,
          includeCategories: false,
          includeRoles: false,
          includeProcesses: false,
        });
        if (cancelled) return;
        setColorOptions(Array.isArray(data?.colors) ? data.colors : []);
      } catch (_error) {
        if (!cancelled) setColorOptions([]);
      }
    };

    loadColors();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, languageCode]);

  const loadOrdersFromDb = useCallback(async ({ forceRefresh = false, cancelledRef = null } = {}) => {
    if (!cancelledRef?.current) {
      setOrdersLoaded(false);
    }
    try {
      const items = await fetchOrdersFromApi({ orgId: activeOrgId, forceRefresh });
      if (!cancelledRef?.current) {
        setOrders(Array.isArray(items) ? items : []);
      }
    } catch (error) {
      if (!cancelledRef?.current) {
        setOrders([]);
        showNotification(error?.message || orderPageText.ordersLoadError, 'error');
      }
    } finally {
      if (!cancelledRef?.current) {
        setOrdersLoaded(true);
      }
    }
  }, [activeOrgId, orderPageText.ordersLoadError, showNotification]);

  useEffect(() => {
    const cancelledRef = { current: false };
    loadOrdersFromDb({ cancelledRef });
    return () => {
      cancelledRef.current = true;
    };
  }, [activeOrgId, loadOrdersFromDb]);

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: isDetailMode ? [] : [WORKSPACE_DATA_TOPICS.ORDERS],
    isActive: isOrderListRouteActive,
    onRefresh: () => loadOrdersFromDb({ forceRefresh: true }),
    shouldHandle: (detail) =>
      String(detail?.source || '').trim() !== orderDataChangedEventSourceRef.current,
  });

  useWorkspaceRefreshOnEvent({
    orgId: activeOrgId,
    topics: isDetailMode ? [WORKSPACE_DATA_TOPICS.STYLES] : [],
    isActive: isOrderDetailRouteActive,
    onRefresh: () => refreshStyles(activeOrgId, { forceRefresh: true }),
  });

  useEffect(() => {
    if (isDetailMode) return undefined;
    return subscribeOrderModificationLockChanged((detail) => {
      if (String(detail?.source || '').trim() === orderLockEventSourceRef.current) {
        return;
      }
      const eventOrgId = Number(detail?.orgId);
      const currentOrgId = Number(activeOrgId);
      if (
        Number.isFinite(eventOrgId) &&
        eventOrgId > 0 &&
        Number.isFinite(currentOrgId) &&
        currentOrgId > 0 &&
        eventOrgId !== currentOrgId
      ) {
        return;
      }
      loadOrdersFromDb({ forceRefresh: true });
    });
  }, [activeOrgId, isDetailMode, loadOrdersFromDb]);

  useEffect(() => {
    hasTouchedDueDateFilterRef.current = false;
    setDueDateFilterStart(getMonthStart(new Date()));
    setDueDateFilterEnd(getMonthEnd(new Date()));
  }, [activeOrgId]);

  useEffect(() => {
    if (!ordersLoaded || hasTouchedDueDateFilterRef.current) return;
    if (!Array.isArray(orders) || orders.length === 0) return;

    const hasOrderInCurrentRange = orders.some((order) => {
      const dueDateKey = normalizeDateKey(order?.dueDate);
      return (
        dueDateKey &&
        dueDateKey >= dueDateFilterStartKey &&
        dueDateKey <= dueDateFilterEndKey
      );
    });
    if (hasOrderInCurrentRange) return;

    const bounds = getOrderDueDateBounds(orders);
    if (!bounds) return;

    setDueDateFilterStart(bounds.minDate);
    setDueDateFilterEnd(bounds.maxDate);
  }, [orders, ordersLoaded, dueDateFilterStartKey, dueDateFilterEndKey]);

  useEffect(() => {
    let cancelled = false;

    const fetchOrderParties = async () => {
      if (!cancelled) {
        setLoadingParties(true);
      }
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const data = await requestJSON('/order-parties' + query);
        if (cancelled) return;
        setBuyerOptions(Array.isArray(data?.buyerOrgOptions) ? data.buyerOrgOptions : []);
        setSellerOptions(Array.isArray(data?.sellerOrgOptions) ? data.sellerOrgOptions : []);
        setRelationshipPairs(
          Array.isArray(data?.relationshipPairs) ? data.relationshipPairs : []
        );
        setCurrentOrgOption(data?.currentOrg || null);
        setPartyRoleHint(data?.roleHint || '');
      } catch (error) {
        if (cancelled) return;
        setBuyerOptions([]);
        setSellerOptions([]);
        setRelationshipPairs([]);
        setCurrentOrgOption(null);
        setPartyRoleHint('');
        showNotification(error?.message || orderPageText.partiesLoadError, 'error');
      } finally {
        if (!cancelled) {
          setLoadingParties(false);
        }
      }
    };

    fetchOrderParties();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, orderPageText.partiesLoadError, showNotification]);

  useEffect(() => {
    if (buyerOptions.length === 0 && sellerOptions.length === 0) return;

    setFormData((prev) => {
      const next = { ...prev };
      let changed = false;

      const selectedBuyer =
        buyerOptions.find((option) => Number(option.id) === Number(prev.buyerOrgId)) ||
        buyerOptions.find((option) => option.name === prev.buyerOrgName) ||
        null;
      const fallbackBuyer =
        selectedBuyer || (buyerOptions.length === 1 ? buyerOptions[0] : null);
      if (fallbackBuyer) {
        if (Number(next.buyerOrgId) !== Number(fallbackBuyer.id)) {
          next.buyerOrgId = fallbackBuyer.id;
          changed = true;
        }
        if (next.buyerOrgName !== fallbackBuyer.name) {
          next.buyerOrgName = fallbackBuyer.name;
          changed = true;
        }
        if (Number(next.customerId) !== Number(fallbackBuyer.id)) {
          next.customerId = fallbackBuyer.id;
          changed = true;
        }
        if (next.customerName !== fallbackBuyer.name) {
          next.customerName = fallbackBuyer.name;
          changed = true;
        }
      }

      const selectedSeller =
        sellerOptions.find((option) => Number(option.id) === Number(prev.sellerOrgId)) ||
        sellerOptions.find((option) => option.name === prev.sellerOrgName) ||
        null;
      const fallbackSeller =
        fixedSellerOrg || selectedSeller || (sellerOptions.length === 1 ? sellerOptions[0] : null);
      if (fallbackSeller) {
        if (Number(next.sellerOrgId) !== Number(fallbackSeller.id)) {
          next.sellerOrgId = fallbackSeller.id;
          changed = true;
        }
        if (next.sellerOrgName !== fallbackSeller.name) {
          next.sellerOrgName = fallbackSeller.name;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [buyerOptions, sellerOptions, fixedSellerOrg]);

  useEffect(() => {
    if (!isDetailMode) {
      detailInitKeyRef.current = null;
      return;
    }

    const initKey = isNewOrder ? 'new' : orderId || '';
    if (!isNewOrder && !ordersLoaded) {
      return;
    }
    if (detailInitKeyRef.current === initKey) {
      return;
    }
    detailInitKeyRef.current = initKey;

    if (isNewOrder) {
      setFormData(buildInitialFormData());
      return;
    }

    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      showNotification(orderPageText.orderNotFound, 'error');
      navigateToPath('/order', { label: orderPageText.listTitle });
      return;
    }
    setFormData(normalizeOrderForm(targetOrder));
  }, [
    isDetailMode,
    isNewOrder,
    navigateToPath,
    orderId,
    orderPageText.listTitle,
    orderPageText.orderNotFound,
    orders,
    ordersLoaded,
    showNotification,
  ]);

  const filteredOrders = useMemo(() => {
    const lowerTerm = deferredSearchTerm.toLowerCase();
    return orders.filter((order) => {
      const normalizedProgressStage = normalizeOrderProgressStage(order.status);
      const matchesProgress =
        progressFilter === ORDER_FILTER_ALL
          ? true
          : progressFilter === ORDER_FILTER_EXCEPT_DONE
            ? normalizedProgressStage !== ORDER_STATUS_KEYS.PRODUCTION_DONE
          : progressFilter === ORDER_PROGRESS_STAGE_NONE
            ? !normalizedProgressStage
            : normalizedProgressStage === normalizeOrderProgressStage(progressFilter);
      if (!matchesProgress) return false;

      const dueDateKey = normalizeDateKey(order.dueDate);
      if (dueDateKey && (dueDateKey < dueDateFilterStartKey || dueDateKey > dueDateFilterEndKey)) {
        return false;
      }

      if (!deferredSearchTerm) return true;

      const orderNumber = order.orderNumber || '';
      const buyer = order.buyerOrgName || order.customerName || order.customer || '';
      const seller = order.sellerOrgName || '';
      const styleSummary = formatStyleSummary(order.items || [], languageCode);
      const styleNames = getStyleDisplayNames(order.items || []).join(' ');
      return (
        orderNumber.toLowerCase().includes(lowerTerm) ||
        buyer.toLowerCase().includes(lowerTerm) ||
        seller.toLowerCase().includes(lowerTerm) ||
        styleSummary.toLowerCase().includes(lowerTerm) ||
        styleNames.toLowerCase().includes(lowerTerm)
      );
    });
  }, [
    dueDateFilterEndKey,
    dueDateFilterStartKey,
    languageCode,
    orders,
    progressFilter,
    deferredSearchTerm,
  ]);

  const styleOptions = useMemo(
    () =>
      styles
        .map((style) => ({
          id: style.id,
          name: style.name || '',
          styleCode: style.styleCode || '',
          customer: style.customer || '',
        }))
        .sort((a, b) => {
          const labelA = String(a.name || a.styleCode || '').trim();
          const labelB = String(b.name || b.styleCode || '').trim();
          const byLabel = labelA.localeCompare(
            labelB,
            languageCode === 'ko' ? 'ko' : undefined,
            { numeric: true, sensitivity: 'base' }
          );
          if (byLabel !== 0) return byLabel;
          return String(a.styleCode || '').localeCompare(
            String(b.styleCode || ''),
            undefined,
            { numeric: true, sensitivity: 'base' }
          );
        }),
    [languageCode, styles]
  );
  const selectedBuyerName = formData.buyerOrgName || formData.customerName || '';

  const availableStyleOptions = useMemo(() => {
    if (!selectedBuyerName) return [];
    return styleOptions.filter((style) => style.customer === selectedBuyerName);
  }, [styleOptions, selectedBuyerName]);
  const normalizedColorOptions = useMemo(
    () =>
      colorOptions
        .map((item) => normalizeLocalizedColorOption(item))
        .filter((item) => item.code)
        .sort((a, b) =>
          String(a.displayName || a.name || a.code).localeCompare(
            String(b.displayName || b.name || b.code),
            languageCode === 'ko' ? 'ko' : undefined
          )
        ),
    [colorOptions, languageCode]
  );
  const colorOptionById = useMemo(
    () =>
      new Map(
        normalizedColorOptions
          .map((item) => [toPositiveColorId(item.id), item])
          .filter(([id]) => Boolean(id))
      ),
    [normalizedColorOptions]
  );
  const colorOptionByCode = useMemo(
    () =>
      new Map(
        normalizedColorOptions.map((item) => [
          item.code,
          { ...item },
        ])
      ),
    [normalizedColorOptions]
  );
  const colorOptionByNameKey = useMemo(
    () =>
      normalizedColorOptions.reduce((map, item) => {
        collectAttributeTextCandidates(item).forEach((candidate) => {
          map.set(normalizeColorNameKey(candidate), item);
        });
        return map;
      }, new Map()),
    [normalizedColorOptions]
  );
  const genderSelectOptions = useMemo(
    () =>
      GENDER_OPTIONS.map((code) => ({
        code,
        label: getGenderLabel(code, GENDER_OPTION_LABELS[code] || code, languageCode),
      })),
    [languageCode]
  );
  const orderProgressFilterOptions = useMemo(
    () => [
      {
        value: ORDER_FILTER_ALL,
        label: ORDER_STATUS_TEXT.filterAllLabel,
      },
      {
        value: ORDER_FILTER_EXCEPT_DONE,
        label: ORDER_STATUS_TEXT.filterExcludeDoneLabel,
      },
      ...ORDER_STATUS_OPTIONS.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    ],
    [languageCode]
  );
  const genderOptionByCode = useMemo(
    () => new Map(genderSelectOptions.map((item) => [item.code, item])),
    [genderSelectOptions]
  );
  const getResolvedColorOption = useCallback((item) => {
    const colorId = toPositiveColorId(item?.colorId);
    if (colorId) {
      return colorOptionById.get(colorId) || null;
    }
    const colorCode = getItemColorCode(item);
    return colorOptionByCode.get(colorCode) || null;
  }, [colorOptionByCode, colorOptionById]);
  const getResolvedColorLabel = useCallback((item) => {
    const colorOption = getResolvedColorOption(item);
    return String(
      colorOption?.displayName ||
        colorOption?.name ||
        colorOption?.code ||
        item?.colorName ||
        item?.colorCode ||
        item?.color ||
        ''
    ).trim();
  }, [getResolvedColorOption]);
  const getResolvedColorGroupKey = useCallback((item) => {
    const labelKey = normalizeColorNameKey(getResolvedColorLabel(item));
    if (labelKey) return `label:${labelKey}`;
    return getItemColorIdentity(item);
  }, [getResolvedColorLabel]);
  const getSelectedColorOption = (item) => getResolvedColorOption(item);
  const getSelectedGenderOption = (item) =>
    genderOptionByCode.get(normalizeGenderCode(item?.gender, '')) || null;
  const filterColorAutocompleteOptions = (options, params) => {
    const filtered = filterColorOptions(options, params);
    const inputValue = String(params?.inputValue || '').trim();
    if (!inputValue || !canCreateColorAttribute) return filtered;
    const normalizedInputName = normalizeColorNameKey(inputValue);
    const normalizedInputCode = normalizeColorCode(inputValue);
    if (
      colorOptionByNameKey.has(normalizedInputName) ||
      colorOptionByCode.has(normalizedInputCode)
    ) {
      return filtered;
    }
    return [
      ...filtered,
      {
        id: null,
        code: '',
        name: inputValue,
        inputValue,
        isCreateOption: true,
      },
    ];
  };
  const styleProcessSummaryById = useMemo(() => {
    return styles.reduce((map, style) => {
      const styleId = normalizeBoardKey(style?.id);
      if (!styleId) return map;
      const processes = normalizeProcesses(style?.processes);
      map.set(styleId, {
        processCount: processes.length,
        processes,
        previewUrl:
          Array.isArray(style?.imageUrls) && style.imageUrls.length > 0 ? style.imageUrls[0] : '',
      });
      return map;
    }, new Map());
  }, [styles]);

  const buyerValue = useMemo(() => {
    if (formData.buyerOrgId) {
      return (
        buyerOptions.find((option) => Number(option.id) === Number(formData.buyerOrgId)) ||
        null
      );
    }
    if (formData.buyerOrgName) {
      return buyerOptions.find((option) => option.name === formData.buyerOrgName) || null;
    }
    return null;
  }, [buyerOptions, formData.buyerOrgId, formData.buyerOrgName]);

  const sellerValue = useMemo(() => {
    if (fixedSellerOrg) {
      return (
        sellerOptions.find((option) => Number(option.id) === Number(fixedSellerOrg.id)) ||
        fixedSellerOrg
      );
    }
    if (formData.sellerOrgId) {
      return (
        sellerOptions.find((option) => Number(option.id) === Number(formData.sellerOrgId)) ||
        null
      );
    }
    if (formData.sellerOrgName) {
      return sellerOptions.find((option) => option.name === formData.sellerOrgName) || null;
    }
    return null;
  }, [sellerOptions, formData.sellerOrgId, formData.sellerOrgName, fixedSellerOrg]);

  const buildSortedStyleItemGroups = useCallback((items = [], deferredMergeRowIdSet = null) => {
    const preserveSourceOrder = Boolean(deferredMergeRowIdSet?.size);
    const groupMap = new Map();
    const createGroup = (groupKey, item) => ({
      key: groupKey,
      styleId: item?.styleId || '',
      styleName: item?.styleName || '',
      styleCode: item?.styleCode || '',
      rows: [],
    });
    const applyGroupMetadata = (group, item) => {
      if (!group.styleId && item?.styleId) group.styleId = item.styleId;
      if (!group.styleName && item?.styleName) group.styleName = item.styleName;
      if (!group.styleCode && item?.styleCode) group.styleCode = item.styleCode;
    };

    if (preserveSourceOrder) {
      const sourceOrderGroups = [];
      (Array.isArray(items) ? items : []).forEach((item, sourceIndex) => {
        const groupKey = getStyleGroupKey(item, deferredMergeRowIdSet);
        let targetGroup = sourceOrderGroups[sourceOrderGroups.length - 1];
        if (!targetGroup || targetGroup.key !== groupKey) {
          targetGroup = createGroup(groupKey, item);
          sourceOrderGroups.push(targetGroup);
        }
        applyGroupMetadata(targetGroup, item);
        targetGroup.rows.push({ item, sourceIndex });
      });

      let nextSourceDisplayNo = 1;
      return sourceOrderGroups.map((group) => {
        const rows = buildColorMergedRows(
          group.rows.map((row) => ({
            ...row,
            displayNo: nextSourceDisplayNo++,
          })),
          getResolvedColorGroupKey
        );

        return {
          ...group,
          rows,
          rowItemIds: rows.map((row) => row.item.id),
        };
      });
    }

    (Array.isArray(items) ? items : []).forEach((item, sourceIndex) => {
      const groupKey = getStyleGroupKey(item, deferredMergeRowIdSet);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, createGroup(groupKey, item));
      }
      const targetGroup = groupMap.get(groupKey);
      applyGroupMetadata(targetGroup, item);
      targetGroup.rows.push({ item, sourceIndex });
    });

    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
      const styleA = String(a.styleName || a.styleCode || a.styleId || '').trim().toLowerCase();
      const styleB = String(b.styleName || b.styleCode || b.styleId || '').trim().toLowerCase();
      const isEmptyA = !styleA;
      const isEmptyB = !styleB;
      if (isEmptyA !== isEmptyB) {
        return isEmptyA ? 1 : -1;
      }
      const styleDiff = styleA.localeCompare(styleB);
      if (styleDiff !== 0) return styleDiff;
      const firstSourceIndexA = a.rows[0]?.sourceIndex ?? 0;
      const firstSourceIndexB = b.rows[0]?.sourceIndex ?? 0;
      return firstSourceIndexA - firstSourceIndexB;
    });

    let nextDisplayNo = 1;
    return sortedGroups.map((group) => {
      const rows = buildColorMergedRows([...group.rows]
        .sort((a, b) => {
          const colorKeyA = getResolvedColorGroupKey(a.item);
          const colorKeyB = getResolvedColorGroupKey(b.item);
          const hasColorA = Boolean(colorKeyA);
          const hasColorB = Boolean(colorKeyB);
          if (hasColorA !== hasColorB) return hasColorA ? -1 : 1;
          if (colorKeyA !== colorKeyB) {
            const colorLabelA = getResolvedColorLabel(a.item);
            const colorLabelB = getResolvedColorLabel(b.item);
            const colorLabelDiff = colorLabelA.localeCompare(
              colorLabelB,
              languageCode === 'ko' ? 'ko' : undefined,
              { numeric: true, sensitivity: 'base' }
            );
            if (colorLabelDiff !== 0) return colorLabelDiff;
            const colorKeyDiff = colorKeyA.localeCompare(colorKeyB);
            if (colorKeyDiff !== 0) return colorKeyDiff;
          }
          const genderDiff = getGenderOrder(a.item.gender) - getGenderOrder(b.item.gender);
          if (genderDiff !== 0) return genderDiff;
          return a.sourceIndex - b.sourceIndex;
        })
        .map((row) => ({
          ...row,
          displayNo: nextDisplayNo++,
        })), getResolvedColorGroupKey);

      return {
        ...group,
        rows,
        rowItemIds: rows.map((row) => row.item.id),
      };
    });
  }, [
    getResolvedColorGroupKey,
    getResolvedColorLabel,
    languageCode,
  ]);
  const groupedStyleItems = useMemo(
    () => buildSortedStyleItemGroups(formData.items, deferredMergeRowIds),
    [buildSortedStyleItemGroups, deferredMergeRowIds, formData.items]
  );
  const horizontalStyleColorRows = useMemo(() => {
    let nextDisplayNo = 1;
    return groupedStyleItems.map((group) => {
      const colorGroupRows = [];
      let currentColorGroup = null;

      (Array.isArray(group.rows) ? group.rows : []).forEach((row) => {
        if (row?.isColorFirstRow || !currentColorGroup) {
          const rowItemIds =
            Array.isArray(row?.colorRowItemIds) && row.colorRowItemIds.length > 0
              ? row.colorRowItemIds.map((itemId) => String(itemId || '').trim()).filter(Boolean)
              : [String(row?.item?.id || '').trim()].filter(Boolean);
          const stableColorRowKeyBase = rowItemIds[0]
            ? rowItemIds[0]
            : `${group.styleId || group.styleName || group.styleCode || 'group'}-${nextDisplayNo}`;
          currentColorGroup = {
            key: `color-row:${stableColorRowKeyBase}`,
            displayNo: nextDisplayNo++,
            colorDisplayName: getResolvedColorLabel(row?.item) || '-',
            rows: [],
            rowItemIds,
          };
          colorGroupRows.push(currentColorGroup);
        }
        currentColorGroup.rows.push(row);
      });

      const normalizedColorGroupRows = colorGroupRows.map((colorGroup) => {
        const itemByGender = ORDER_DETAIL_HORIZONTAL_GENDERS.reduce((acc, genderCode) => {
          acc[genderCode] = null;
          return acc;
        }, {});
        (Array.isArray(colorGroup.rows) ? colorGroup.rows : []).forEach((row) => {
          const normalizedGender = normalizeGenderCode(row?.item?.gender, '');
          const fallbackGender =
            ORDER_DETAIL_HORIZONTAL_GENDERS[ORDER_DETAIL_HORIZONTAL_GENDERS.length - 1];
          const genderCode = ORDER_DETAIL_HORIZONTAL_GENDERS.includes(normalizedGender)
            ? normalizedGender
            : fallbackGender;
          if (!itemByGender[genderCode]) {
            itemByGender[genderCode] = row.item;
          }
        });

        const sizeByGender = ORDER_DETAIL_HORIZONTAL_GENDERS.reduce((acc, genderCode) => {
          const normalizedSizeQuantities = normalizeSizeQuantities(
            itemByGender[genderCode]?.sizeQuantities
          );
          acc[genderCode] = SIZE_COLUMNS.reduce((sizeAcc, size) => {
            sizeAcc[size] = Number(normalizedSizeQuantities[size]) || 0;
            return sizeAcc;
          }, {});
          return acc;
        }, {});

        const totalQuantity = ORDER_DETAIL_HORIZONTAL_GENDERS.reduce((sum, genderCode) => {
          return (
            sum +
            SIZE_COLUMNS.reduce(
              (sizeSum, size) => sizeSum + (Number(sizeByGender[genderCode]?.[size]) || 0),
              0
            )
          );
        }, 0);

        return {
          ...colorGroup,
          referenceItem:
            (Array.isArray(colorGroup.rows) ? colorGroup.rows[0]?.item : null) || null,
          itemByGender,
          sizeByGender,
          totalQuantity,
        };
      });

      const styleSubtotalQuantity = normalizedColorGroupRows.reduce(
        (sum, colorGroupRow) => sum + (Number(colorGroupRow?.totalQuantity) || 0),
        0
      );

      return {
        ...group,
        colorRows: normalizedColorGroupRows,
        styleSubtotalQuantity,
      };
    });
  }, [getResolvedColorLabel, groupedStyleItems]);

  useEffect(() => {
    const currentRowIdSet = new Set(
      (Array.isArray(formData.items) ? formData.items : [])
        .map((item) => String(item?.id || '').trim())
        .filter(Boolean)
    );
    setDeferredMergeRowIds((prev) => {
      let changed = false;
      const next = new Set();
      prev.forEach((rowId) => {
        if (currentRowIdSet.has(rowId)) {
          next.add(rowId);
          return;
        }
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [formData.items]);
  const currentDetailOrder = useMemo(() => {
    if (isNewOrder) return null;
    return orders.find((order) => order.id === orderId) || null;
  }, [isNewOrder, orderId, orders]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [isTogglingModificationLock, setIsTogglingModificationLock] = useState(false);
  const orderLockEventSourceRef = useRef(createId('order-lock'));
  const orderDataChangedEventSourceRef = useRef(createId('order-data'));
  const emitOrderDataChanged = useCallback(() => {
    emitWorkspaceDataChanged({
      topics: [WORKSPACE_DATA_TOPICS.ORDERS],
      orgId: activeOrgId,
      source: orderDataChangedEventSourceRef.current,
    });
  }, [activeOrgId]);
  const mergeOrderIntoState = useCallback((nextOrder) => {
    if (!nextOrder?.id) return;
    setOrders((prev) => {
      let found = false;
      const nextOrders = prev.map((order) => {
        if (order.id !== nextOrder.id) return order;
        found = true;
        return nextOrder;
      });
      return found ? nextOrders : prev;
    });
  }, []);
  useEffect(() => {
    if (!isDetailMode || isNewOrder || !currentDetailOrder?.id) return;
    navigateToPath(`/order/${currentDetailOrder.id}`, {
      label: buildOrderTabLabel(currentDetailOrder, orderPageText.listTitle),
    });
  }, [
    currentDetailOrder?.id,
    currentDetailOrder?.orderNumber,
    isDetailMode,
    isNewOrder,
    navigateToPath,
    orderPageText.listTitle,
  ]);
  const hasFormChanges = useMemo(() => {
    if (isNewOrder) {
      const baselineSnapshot = toComparableOrderSnapshot(buildInitialFormData(), fixedSellerOrg);
      const currentSnapshot = toComparableOrderSnapshot(formData, fixedSellerOrg);
      return toStableJsonText(currentSnapshot) !== toStableJsonText(baselineSnapshot);
    }
    if (!currentDetailOrder) return false;

    const baselineSnapshot = toComparableOrderSnapshot(
      normalizeOrderForm(currentDetailOrder),
      fixedSellerOrg
    );
    const currentSnapshot = toComparableOrderSnapshot(formData, fixedSellerOrg);
    return toStableJsonText(currentSnapshot) !== toStableJsonText(baselineSnapshot);
  }, [currentDetailOrder, fixedSellerOrg, formData, isNewOrder]);
  const hasUnsavedChanges = useMemo(() => {
    if (!isDetailMode) return false;
    return hasFormChanges;
  }, [hasFormChanges, isDetailMode]);
  useUnsavedChanges(hasUnsavedChanges);
  const hasChangesForForm = (candidateFormData) => {
    if (isNewOrder) {
      const baselineSnapshot = toComparableOrderSnapshot(buildInitialFormData(), fixedSellerOrg);
      const currentSnapshot = toComparableOrderSnapshot(candidateFormData, fixedSellerOrg);
      return toStableJsonText(currentSnapshot) !== toStableJsonText(baselineSnapshot);
    }
    if (!currentDetailOrder) return false;

    const baselineSnapshot = toComparableOrderSnapshot(
      normalizeOrderForm(currentDetailOrder),
      fixedSellerOrg
    );
    const currentSnapshot = toComparableOrderSnapshot(candidateFormData, fixedSellerOrg);
    return toStableJsonText(currentSnapshot) !== toStableJsonText(baselineSnapshot);
  };

  const isCurrentOrderModificationLocked = Boolean(
    !isNewOrder && currentDetailOrder?.isModificationLocked
  );
  const isCurrentOrderManualModificationLocked = Boolean(
    !isNewOrder && currentDetailOrder?.isManualModificationLocked
  );
  const isCurrentOrderAssignmentModificationLocked = Boolean(
    !isNewOrder && currentDetailOrder?.isAssignmentModificationLocked
  );
  const canToggleCurrentOrderModificationLock = Boolean(
    !isNewOrder && currentDetailOrder?.canToggleModificationLock
  );
  const canUnlockCurrentOrderByReleasingAssignments = Boolean(
    !isNewOrder &&
      isCurrentOrderModificationLocked &&
      isCurrentOrderAssignmentModificationLocked
  );
  const currentOrderLockMetaText = useMemo(() => {
    if (!currentDetailOrder) return '';
    const parts = [
      String(currentDetailOrder?.modificationLockedBy || '').trim(),
      formatOrderLockTimestamp(currentDetailOrder?.modificationLockedAt),
    ].filter(Boolean);
    return parts.join(' · ');
  }, [
    currentDetailOrder?.modificationLockedAt,
    currentDetailOrder?.modificationLockedBy,
  ]);
  const currentOrderLockTooltipText = useMemo(() => {
    if (isNewOrder) {
      return getUiMessage(
        'orderDetail.lockHelperNew',
        'Save the order before using the lock switch.',
        languageCode
      );
    }
    if (isCurrentOrderAssignmentModificationLocked) {
      return getUiMessage(
        'orderDetail.lockHelperAssignment',
        'This order is auto-locked because assignment contract data exists.',
        languageCode
      );
    }
    if (isCurrentOrderManualModificationLocked) {
      return currentOrderLockMetaText
        ? getUiMessage(
            'orderDetail.lockHelperManual',
            'Manual lock is enabled. {meta}',
            languageCode,
            { meta: currentOrderLockMetaText }
          )
        : getUiMessage(
            'orderDetail.lockHelperManualSimple',
            'Manual lock is enabled.',
            languageCode
          );
    }
    if (hasFormChanges) {
      return getUiMessage(
        'orderDetail.lockHelperUnsaved',
        'You cannot lock the order while there are unsaved changes. Save first.',
        languageCode
      );
    }
    return getUiMessage(
      'orderDetail.lockHelperDefault',
      'Turn on the edit lock when you want to freeze the basic order information.',
      languageCode
    );
  }, [
    languageCode,
    currentOrderLockMetaText,
    hasFormChanges,
    isCurrentOrderAssignmentModificationLocked,
    isCurrentOrderManualModificationLocked,
    isNewOrder,
  ]);
  const isModificationLockToggleDisabled =
    isNewOrder ||
    isSavingOrder ||
    isTogglingModificationLock ||
    (!canToggleCurrentOrderModificationLock &&
      !canUnlockCurrentOrderByReleasingAssignments) ||
    (!isCurrentOrderManualModificationLocked && hasFormChanges);
  const handleAdd = () => {
    navigateToPath('/order/new', { label: orderPageText.newOrderTab });
  };

  const handleDueDateFilterStartChange = (value) => {
    if (!value?.isValid?.()) return;
    const nextStart = normalizeFilterDate(value.toDate());
    if (!nextStart) return;
    hasTouchedDueDateFilterRef.current = true;
    setDueDateFilterStart(nextStart);
    setDueDateFilterEnd((prev) => {
      const currentEnd = normalizeFilterDate(prev);
      return currentEnd && currentEnd >= nextStart ? currentEnd : nextStart;
    });
  };

  const handleDueDateFilterEndChange = (value) => {
    if (!value?.isValid?.()) return;
    const nextEnd = normalizeFilterDate(value.toDate());
    if (!nextEnd) return;
    hasTouchedDueDateFilterRef.current = true;
    setDueDateFilterEnd(nextEnd);
    setDueDateFilterStart((prev) => {
      const currentStart = normalizeFilterDate(prev);
      return currentStart && currentStart <= nextEnd ? currentStart : nextEnd;
    });
  };

  const shiftDueDateFilterMonth = (amount) => {
    hasTouchedDueDateFilterRef.current = true;
    const nextMonthStart = addMonths(dueDateFilterStart, amount);
    setDueDateFilterStart(nextMonthStart);
    setDueDateFilterEnd(getMonthEnd(nextMonthStart));
  };

  const handleEdit = (order) => {
    if (!order?.id) return;
    navigateToPath(`/order/${order.id}`, {
      label: buildOrderTabLabel(order, orderPageText.listTitle),
    });
  };

  const performOrderLockToggle = useCallback(
    async ({ targetOrder, nextLocked, enforceDraftSaved = false }) => {
      if (!targetOrder?.id) return;
      const shouldUnlock = !nextLocked;

      if (nextLocked && enforceDraftSaved && hasFormChanges) {
        showNotification(orderPageText.lockSaveFirstWarning, 'warning');
        return;
      }

      const isTargetLocked = Boolean(targetOrder?.isModificationLocked);
      const isTargetAssignmentLocked = Boolean(targetOrder?.isAssignmentModificationLocked);
      const canToggleTarget = Boolean(targetOrder?.canToggleModificationLock);
      const shouldReleaseAssignments = shouldUnlock && isTargetLocked && isTargetAssignmentLocked;

      if (!canToggleTarget && !shouldReleaseAssignments) {
        showNotification(orderPageText.lockChangeNotAllowed, 'warning');
        return;
      }
      if (
        shouldReleaseAssignments &&
        !window.confirm(orderPageText.lockUnlockReleaseAssignmentsConfirm)
      ) {
        return;
      }

      setIsTogglingModificationLock(true);
      try {
        const basePayload = {
          locked: nextLocked,
          lockedBy: activeProfile?.email || activeProfile?.name || orderPageText.manager,
          releaseAssignments: shouldReleaseAssignments,
        };
        let updated;
        try {
          updated = await toggleOrderModificationLockToApi(
            targetOrder.id,
            {
              ...basePayload,
              confirmPastAssignmentRelease: false,
            },
            { orgId: activeOrgId }
          );
        } catch (error) {
          const message = String(error?.message || '').trim();
          if (
            shouldReleaseAssignments &&
            message.includes('order unlock requires past assignment release confirmation')
          ) {
            const meta =
              error?.details && typeof error.details === 'object' && error.details.meta
                ? error.details.meta
                : null;
            const pastStartedCount = Number(meta?.pastStartedAssignmentCount || 0);
            const earliestPastStartDate = String(meta?.earliestPastStartDate || '').trim();
            const confirmMessage = orderPageText.lockUnlockPastAssignmentsConfirm
              .replace('{count}', String(pastStartedCount > 0 ? pastStartedCount : 1))
              .replace('{date}', earliestPastStartDate || '-');
            if (!window.confirm(confirmMessage)) {
              return;
            }
            updated = await toggleOrderModificationLockToApi(
              targetOrder.id,
              {
                ...basePayload,
                confirmPastAssignmentRelease: true,
              },
              { orgId: activeOrgId }
            );
          } else {
            throw error;
          }
        }
        mergeOrderIntoState(updated);
        if (
          isDetailMode &&
          !isNewOrder &&
          String(updated?.id || '') === String(orderId || '')
        ) {
          setFormData(normalizeOrderForm(updated));
        }
        emitOrderModificationLockChanged({
          orgId: activeOrgId,
          orderId: updated?.id || targetOrder.id,
          locked: nextLocked,
          source: orderLockEventSourceRef.current,
        });
        showNotification(
          nextLocked ? orderPageText.lockEnabledSuccess : orderPageText.lockDisabledSuccess,
          'success'
        );
        const releasedAssignmentCount = Number(
          updated?.assignmentReleaseSummary?.releasedAssignmentCount || 0
        );
        const detachedWorkRecordCount = Number(
          updated?.assignmentReleaseSummary?.detachedWorkRecordCount || 0
        );
        if (!nextLocked && releasedAssignmentCount > 0) {
          const summaryMessage =
            detachedWorkRecordCount > 0
              ? orderPageText.lockReleaseSummaryWithDetachedInfo
                  .replace('{count}', String(releasedAssignmentCount))
                  .replace('{detached}', String(detachedWorkRecordCount))
              : orderPageText.lockReleaseSummaryInfo.replace(
                  '{count}',
                  String(releasedAssignmentCount)
                );
          showNotification(summaryMessage, 'info');
        }
      } catch (error) {
        showNotification(
          resolveOrderModificationLockToggleErrorMessage(error, {
            lockChangeNotAllowedMessage: orderPageText.lockChangeNotAllowed,
            unlockReleaseRequiredMessage: orderPageText.lockUnlockReleaseRequired,
            unlockPastReleaseConfirmMessage:
              orderPageText.lockUnlockPastReleaseConfirmRequired,
            modificationLockedMessage: orderPageText.modificationLocked,
            fallbackMessage: orderPageText.lockToggleErrorFallback,
          }),
          'error'
        );
      } finally {
        setIsTogglingModificationLock(false);
      }
    },
    [
      activeOrgId,
      activeProfile?.email,
      activeProfile?.name,
      hasFormChanges,
      isDetailMode,
      isNewOrder,
      mergeOrderIntoState,
      orderId,
      orderPageText,
      showNotification,
    ]
  );

  const handleModificationLockToggle = async (nextLockedInput = null) => {
    if (isNewOrder || !currentDetailOrder?.id) return;
    const nextLocked =
      typeof nextLockedInput === 'boolean'
        ? nextLockedInput
        : !isCurrentOrderModificationLocked;
    await performOrderLockToggle({
      targetOrder: currentDetailOrder,
      nextLocked,
      enforceDraftSaved: true,
    });
  };

  const handleListModificationLockToggle = async (order, nextLocked) => {
    if (!order?.id) return;
    await performOrderLockToggle({
      targetOrder: order,
      nextLocked: Boolean(nextLocked),
      enforceDraftSaved: false,
    });
  };

  const handleDeleteOrder = async (order) => {
    if (!order?.id) return;
    if (order?.isModificationLocked) {
      showNotification(orderPageText.modificationLocked, 'warning');
      return;
    }

    const orderLabel = order.orderNumber
      ? `${orderPageText.deleteTargetOrder} ${order.orderNumber}`
      : orderPageText.deleteTargetFallback;
    if (!window.confirm(`${orderLabel} ${orderPageText.deleteConfirm}`)) {
      return;
    }

    try {
      await deleteOrderToApi(order.id, { orgId: activeOrgId });
      setOrders((prev) => prev.filter((target) => target.id !== order.id));
      emitOrderDataChanged();
      showNotification(orderPageText.deleteSuccess, 'success');
    } catch (error) {
      showNotification(error?.message || orderPageText.deleteError, 'error');
    }
  };

  const closeDetailAndGoList = () => {
    if (isNewOrder) {
      navigateToPath('/order', {
        label: orderPageText.listTitle,
        closeTabId: '/order/new',
        skipUnsavedChangesCheck: true,
      });
      return;
    }
    if (orderId) {
      navigateToPath('/order', {
        label: orderPageText.listTitle,
        closeTabId: `/order/${orderId}`,
        skipUnsavedChangesCheck: true,
      });
      return;
    }
    navigateToPath('/order', { label: orderPageText.listTitle, skipUnsavedChangesCheck: true });
  };

  const handleBuyerChange = (_event, customer) => {
    setFormData((prev) => {
      const nextBuyerOrgId = customer?.id || '';
      const nextBuyerOrgName = customer?.name || '';
      if (
        nextBuyerOrgId === prev.buyerOrgId &&
        nextBuyerOrgName === prev.buyerOrgName
      ) {
        return prev;
      }
      return {
        ...prev,
        buyerOrgId: nextBuyerOrgId,
        buyerOrgName: nextBuyerOrgName,
        customerId: nextBuyerOrgId,
        customerName: nextBuyerOrgName,
        items: prev.items.map((item) => ({
          ...item,
          styleId: '',
          styleName: '',
          styleCode: '',
          colorId: null,
          colorCode: '',
          colorName: '',
          gender: '',
          sizeQuantities: createSizeQuantities(),
        })),
      };
    });
  };
  const handleSellerChange = (_event, seller) => {
    if (isSellerLocked) return;
    setFormData((prev) => ({
      ...prev,
      sellerOrgId: seller?.id || '',
      sellerOrgName: seller?.name || '',
    }));
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDetailViewModeChange = (_event, nextMode) => {
    if (!nextMode) return;
    setDetailViewMode(nextMode);
    setDeferredMergeRowIds((prev) => (prev.size ? new Set() : prev));
  };

  const handleAddItem = () => {
    if (isCurrentOrderModificationLocked) {
      showNotification(orderPageText.modificationLockedNotice, 'warning');
      return;
    }
    const nextItem = createOrderItem();
    setFormData((prev) => ({ ...prev, items: [...prev.items, nextItem] }));
    focusStyleInput(nextItem.id);
  };

  const handleRemoveItem = (itemIdOrIds) => {
    const targetIds = normalizeTargetItemIds(itemIdOrIds);
    const targetIdSet = new Set(targetIds);
    if (!targetIdSet.size) return;
    setFormData((prev) => {
      const nextItems = (Array.isArray(prev.items) ? prev.items : []).filter(
        (item) => !targetIdSet.has(String(item?.id || '').trim())
      );
      return { ...prev, items: nextItems.length ? nextItems : [createOrderItem()] };
    });
  };

  const focusColorInput = (itemId) => {
    focusInputElementInMap(colorInputRefs, itemId);
  };
  const focusStyleInput = (itemId) => {
    focusInputElementInMap(styleInputRefs, itemId);
  };
  const focusGenderInput = (itemId) => {
    focusInputElementInMap(genderInputRefs, itemId);
  };
  const focusFirstSizeInput = (itemId) => {
    focusInputElementInMap(sizeInputRefs, `${itemId}::${SIZE_COLUMNS[0] || ''}`);
  };
  const deferRowMergeUntilBlur = useCallback((itemIdOrIds) => {
    const targetIds = normalizeTargetItemIds(itemIdOrIds);
    if (!targetIds.length) return;
    setDeferredMergeRowIds((prev) => {
      const next = new Set(prev);
      let changed = false;
      targetIds.forEach((targetId) => {
        if (next.has(targetId)) return;
        next.add(targetId);
        changed = true;
      });
      return changed ? next : prev;
    });
  }, []);
  const sortStyleItemsForDisplay = useCallback(() => {
    setDeferredMergeRowIds((prev) => (prev.size ? new Set() : prev));
    setFormData((prev) => {
      const sortedItems = buildSortedStyleItemGroups(prev.items, null)
        .flatMap((group) => group.rows.map((row) => row.item));
      if (hasSameItemOrder(prev.items, sortedItems)) return prev;
      return {
        ...prev,
        items: sortedItems,
      };
    });
  }, [buildSortedStyleItemGroups]);
  const handleItemRowFocusCapture = useCallback((itemIdOrIds) => {
    deferRowMergeUntilBlur(itemIdOrIds);
  }, [deferRowMergeUntilBlur]);
  const handleItemRowBlurCapture = useCallback((itemIdOrIds, event) => {
    const targetIds = normalizeTargetItemIds(itemIdOrIds);
    if (!targetIds.length) return;
    const rowElement = event.currentTarget;
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (rowElement && activeElement && rowElement.contains(activeElement)) return;
      if (activeElement?.closest?.('.MuiAutocomplete-popper')) return;
      if (activeElement?.closest?.('[role="listbox"]')) return;
      if (activeElement?.closest?.('[data-order-style-item-row="true"]')) return;
      sortStyleItemsForDisplay();
    });
  }, [sortStyleItemsForDisplay]);
  const shouldAdvanceAfterAutocompleteSelection = (_event, reason) =>
    reason === 'selectOption';

  const handleStyleChange = (itemIdOrIds, style, options = {}) => {
    if (!selectedBuyerName) {
      showNotification(orderPartyText.selectBuyerFirst, 'warning');
      return;
    }

    const targetIds = normalizeTargetItemIds(itemIdOrIds);
    const targetIdSet = new Set(targetIds);
    if (!targetIdSet.size) return;

    const nextStyleId = style?.id || '';
    const nextStyleName = style?.name || '';
    const nextStyleCode = style?.styleCode || '';
    const nextStyleIdentity = nextStyleId || nextStyleName || nextStyleCode;

    const previewItems = formData.items.map((item) =>
      targetIdSet.has(String(item.id || '').trim())
        ? (() => {
            const styleChanged = getStyleIdentity(item) !== nextStyleIdentity;
            return {
              ...item,
              styleId: nextStyleId,
              styleName: nextStyleName,
              styleCode: nextStyleCode,
              colorId: styleChanged ? null : item.colorId,
              colorCode: styleChanged ? '' : getItemColorCode(item),
              colorName: styleChanged ? '' : String(item.colorName || '').trim(),
              gender: styleChanged ? '' : normalizeGenderCode(item.gender, ''),
              sizeQuantities: styleChanged
                ? createSizeQuantities()
                : normalizeSizeQuantities(item.sizeQuantities),
            };
          })()
        : item
    );

    if (hasDuplicateStyleColorGender(previewItems)) {
      showNotification(orderPageText.duplicateStyleColorGender, 'warning');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      items: previewItems,
    }));
    deferRowMergeUntilBlur(targetIds);
    if (options.focusNext && options.focusItemId) {
      focusColorInput(options.focusItemId);
    }
  };

  const applyColorSelection = (itemIdOrIds, selectedColor, options = {}) => {
    const targetIds = normalizeTargetItemIds(itemIdOrIds);
    const targetIdSet = new Set(targetIds);
    if (!targetIdSet.size) return false;

    const nextColorId = toPositiveColorId(selectedColor?.id);
    const nextColorCode = normalizeColorCode(selectedColor?.code);
    const nextColorName = String(
      selectedColor?.displayName || selectedColor?.name || selectedColor?.code || ''
    ).trim();
    const previewItems = formData.items.map((item) =>
      targetIdSet.has(String(item.id || '').trim())
        ? {
            ...item,
            colorId: nextColorId,
            colorCode: nextColorCode,
            colorName: nextColorName,
          }
        : item
    );
    if (hasDuplicateStyleColorGender(previewItems)) {
      showNotification(orderPageText.duplicateStyleColorGender, 'warning');
      return false;
    }
    setFormData((prev) => ({
      ...prev,
      items: previewItems,
    }));
    deferRowMergeUntilBlur(targetIds);
    if (options.focusNext) {
      const focusItemId = options.focusItemId || targetIds[0];
      const targetItem =
        previewItems.find((item) => String(item.id || '').trim() === focusItemId) || null;
      const targetGender = normalizeGenderCode(targetItem?.gender, '');
      if (GENDER_OPTIONS.includes(targetGender)) {
        focusFirstSizeInput(focusItemId);
      } else {
        focusGenderInput(focusItemId);
      }
    }
    return true;
  };

  const handleCreateColorOption = async (itemIdOrIds, rawName, options = {}) => {
    const targetIds = normalizeTargetItemIds(itemIdOrIds);
    if (!targetIds.length) return;

    const colorName = String(rawName || '').trim();
    if (!colorName) {
      return;
    }
    if (!canCreateColorAttribute) {
      return;
    }

    const existingColor =
      colorOptionByNameKey.get(normalizeColorNameKey(colorName)) || null;
    if (existingColor) {
      applyColorSelection(targetIds, existingColor, options);
      return;
    }

    if (creatingColorItemId) {
      return;
    }

    setCreatingColorItemId(targetIds[0]);
    try {
      const createPayload =
        languageCode === 'ko'
          ? { nameKo: colorName }
          : languageCode === 'en'
            ? { nameEn: colorName }
            : { nameVi: colorName };
      const createdColor = await createColorAttribute(
        createPayload,
        { orgId: activeOrgId }
      );
      const normalizedCreatedColor = normalizeLocalizedColorOption(createdColor);
      setColorOptions((prev) => mergeColorOption(prev, normalizedCreatedColor));
      const applied = applyColorSelection(targetIds, normalizedCreatedColor, options);
      if (applied) {
        showNotification(orderPageText.colorCreatedSuccess, 'success');
      }
    } catch (error) {
      showNotification(error?.message || orderPageText.colorCreateError, 'error');
    } finally {
      setCreatingColorItemId('');
    }
  };

  const handleColorChange = async (itemIdOrIds, value, options = {}) => {
    if (!value) {
      applyColorSelection(itemIdOrIds, null, options);
      return;
    }
    if (typeof value === 'string') {
      await handleCreateColorOption(itemIdOrIds, value, options);
      return;
    }
    if (value?.isCreateOption) {
      await handleCreateColorOption(
        itemIdOrIds,
        value.inputValue || value.name || '',
        options
      );
      return;
    }
    applyColorSelection(itemIdOrIds, value, options);
  };

  const handleGenderChange = (itemId, value, options = {}) => {
    const nextGender =
      typeof value === 'string' ? value : value?.code || value?.value || '';
    if (!GENDER_OPTIONS.includes(nextGender)) return;
    const previewItems = formData.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            gender: nextGender,
          }
        : item
    );
    if (hasDuplicateStyleColorGender(previewItems)) {
      showNotification(orderPageText.duplicateStyleColorGender, 'warning');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              gender: nextGender,
            }
          : item
      ),
    }));
    if (options.focusNext) {
      const targetItem = previewItems.find((item) => item.id === itemId) || null;
      const targetColorCode = getItemColorCode(targetItem);
      if (targetColorCode) {
        focusFirstSizeInput(itemId);
      } else {
        focusColorInput(itemId);
      }
    }
  };

  const handleSizeQuantityChange = (itemId, sizeKey, value) => {
    const normalizedSize = normalizeSizeKey(sizeKey);
    if (!normalizedSize) return;
    const normalizedValue = toNumericInputString(value);
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              sizeQuantities: {
                ...normalizeSizeQuantities(item.sizeQuantities),
                [normalizedSize]: normalizedValue,
              },
            }
          : item
      ),
    }));
  };
  const handleHorizontalSizeQuantityChange = (group, colorRow, genderCode, sizeKey, value) => {
    const normalizedGender = normalizeGenderCode(genderCode, '');
    const normalizedSize = normalizeSizeKey(sizeKey);
    if (!normalizedGender || !normalizedSize) return;
    const normalizedValue = toNumericInputString(value);

    const targetItemId = String(colorRow?.itemByGender?.[normalizedGender]?.id || '').trim();
    if (targetItemId) {
      setFormData((prev) => {
        const previewItems = (Array.isArray(prev.items) ? prev.items : []).map((item) => {
          const currentItemId = String(item?.id || '').trim();
          if (currentItemId !== targetItemId) return item;
          const currentGender = normalizeGenderCode(item?.gender, '');
          return {
            ...item,
            gender: currentGender || normalizedGender,
            sizeQuantities: {
              ...normalizeSizeQuantities(item?.sizeQuantities),
              [normalizedSize]: normalizedValue,
            },
          };
        });
        if (hasDuplicateStyleColorGender(previewItems)) {
          return prev;
        }
        return {
          ...prev,
          items: previewItems,
        };
      });
      return;
    }

    if (!normalizedValue) return;

    const emptyGenderRow = (Array.isArray(colorRow?.rows) ? colorRow.rows : []).find((row) => {
      const rowGender = normalizeGenderCode(row?.item?.gender, '');
      if (rowGender) return false;
      return !hasAnySizeQuantity(normalizeSizeQuantities(row?.item?.sizeQuantities));
    });
    const emptyGenderRowId = String(emptyGenderRow?.item?.id || '').trim();
    if (emptyGenderRowId) {
      setFormData((prev) => {
        const previewItems = (Array.isArray(prev.items) ? prev.items : []).map((item) => {
          const currentItemId = String(item?.id || '').trim();
          if (currentItemId !== emptyGenderRowId) return item;
          return {
            ...item,
            gender: normalizedGender,
            sizeQuantities: {
              ...normalizeSizeQuantities(item?.sizeQuantities),
              [normalizedSize]: normalizedValue,
            },
          };
        });
        if (hasDuplicateStyleColorGender(previewItems)) {
          return prev;
        }
        return {
          ...prev,
          items: previewItems,
        };
      });
      return;
    }

    const referenceItem = colorRow?.referenceItem || null;
    const nextStyleId = String(group?.styleId || referenceItem?.styleId || '').trim();
    const nextStyleName = String(group?.styleName || referenceItem?.styleName || '').trim();
    const nextStyleCode = String(group?.styleCode || referenceItem?.styleCode || '').trim();
    const nextStyleIdentity = nextStyleId || nextStyleName || nextStyleCode;
    if (!nextStyleIdentity) return;

    const colorId = toPositiveColorId(referenceItem?.colorId);
    const colorCode = normalizeColorCode(referenceItem?.colorCode || referenceItem?.color || '');
    const rawColorName = String(referenceItem?.colorName || '').trim();
    const fallbackColorName = String(colorRow?.colorDisplayName || '').trim();
    const colorName = rawColorName || (fallbackColorName === '-' ? '' : fallbackColorName);
    if (!colorId && !colorCode && !colorName) return;

    const sizeQuantities = createSizeQuantities();
    sizeQuantities[normalizedSize] = normalizedValue;
    const nextItem = {
      id: createId('item'),
      styleId: nextStyleId,
      styleName: nextStyleName,
      styleCode: nextStyleCode,
      colorId,
      colorCode,
      colorName,
      gender: normalizedGender,
      sizeQuantities,
    };

    setFormData((prev) => {
      const nextItems = [...(Array.isArray(prev.items) ? prev.items : []), nextItem];
      if (hasDuplicateStyleColorGender(nextItems)) {
        return prev;
      }
      return {
        ...prev,
        items: nextItems,
      };
    });
  };
  const getHorizontalSizeInputValue = (colorRow, genderCode, sizeKey) => {
    const targetItem = colorRow?.itemByGender?.[genderCode] || null;
    const normalizedSize = normalizeSizeKey(sizeKey);
    if (!targetItem || !normalizedSize) return '';
    const normalizedSizeQuantities = normalizeSizeQuantities(targetItem.sizeQuantities);
    return getDisplayQuantityInputValue(normalizedSizeQuantities[normalizedSize]);
  };
  const handleLastSizeInputKeyDown = (event) => {
    if (event.key !== 'Tab' || event.shiftKey) return;
    if (!styleAddButtonRef.current) return;
    event.preventDefault();
    styleAddButtonRef.current.focus();
  };

  const getItemTotal = (item) => sumSizeQuantities(item?.sizeQuantities);

  const getOrderTotal = () =>
    formData.items.reduce((sum, item) => sum + getItemTotal(item), 0);

  const validateOrder = () => {
    const resolvedSellerOrgId = toOrgId(fixedSellerOrg?.id ?? formData.sellerOrgId);
    const resolvedSellerOrgName = fixedSellerOrg?.name || formData.sellerOrgName;
    const partyValidationMessage = (() => {
      if (!formData.orderNumber.trim()) {
        return '';
      }
      if (!formData.buyerOrgName || !toOrgId(formData.buyerOrgId)) {
        return orderPartyText.selectBuyer;
      }
      if (!resolvedSellerOrgName || !resolvedSellerOrgId) {
        return orderPartyText.selectSeller;
      }
      if (!hasRelationshipPair(relationshipPairs, formData.buyerOrgId, resolvedSellerOrgId)) {
        return orderPartyText.linkedPairOnly;
      }
      return '';
    })();
    if (partyValidationMessage) {
      return partyValidationMessage;
    }
    if (!formData.orderNumber.trim()) {
      return orderPageText.validationOrderNumberRequired;
    }
    if (!formData.buyerOrgName || !toOrgId(formData.buyerOrgId)) {
      return orderPartyText.selectBuyer;
    }
    if (!resolvedSellerOrgName || !resolvedSellerOrgId) {
      return orderPartyText.selectSeller;
    }
    if (!hasRelationshipPair(relationshipPairs, formData.buyerOrgId, resolvedSellerOrgId)) {
      return orderPartyText.linkedPairOnly;
    }
    if (
      hasDuplicateOrderNumberByCustomer({
        orders,
        currentOrderId: isNewOrder ? '' : orderId || '',
        orderNumber: formData.orderNumber,
        buyerOrgId: formData.buyerOrgId,
        buyerOrgName: formData.buyerOrgName || formData.customerName,
        sellerOrgId: resolvedSellerOrgId,
        sellerOrgName: resolvedSellerOrgName,
      })
    ) {
      return orderPageText.validationDuplicateOrderNumber;
    }
    if (!formData.items.length) {
      return orderPageText.validationAddStyle;
    }
    for (const item of formData.items) {
      if (!item.styleId) {
        return orderPageText.validationSelectAllStyles;
      }
      if (!getItemColorCode(item)) {
        return orderPageText.validationSelectAllColors;
      }
      if (!GENDER_OPTIONS.includes(item.gender)) {
        return orderPageText.validationSelectAllGenderCodes;
      }
      const totalQuantity = sumSizeQuantities(item.sizeQuantities);
      if (totalQuantity <= 0) {
        return orderPageText.validationEnterSizeQty;
      }
    }
    if (hasDuplicateStyleColorGender(formData.items)) {
      return orderPageText.validationDuplicateOnce;
    }
    return null;
  };

  const handleSave = async () => {
    if (isCurrentOrderModificationLocked) {
      showNotification(orderPageText.modificationLocked, 'warning');
      return;
    }
    if (!isNewOrder && !hasFormChanges) {
      showNotification(orderPageText.noChanges, 'info');
      return;
    }

    const errorMessage = validateOrder();
    if (errorMessage) {
      showNotification(errorMessage, 'error');
      return;
    }

    const sanitizedItems = formData.items.map((item) => {
      const normalizedSizeQuantities = normalizeSizeQuantities(item.sizeQuantities);
      const numericSizeQuantities = SIZE_COLUMNS.reduce((acc, size) => {
        acc[size] = Number(normalizedSizeQuantities[size]) || 0;
        return acc;
      }, {});
      const totalQuantity = sumSizeQuantities(numericSizeQuantities);
      const safeColorCode = getItemColorCode(item);
      const colorOption = colorOptionByCode.get(safeColorCode) || null;
      const safeColorName = String(item.colorName || colorOption?.name || safeColorCode).trim();
      const safeColorId =
        Number.isFinite(Number(item.colorId)) && Number(item.colorId) > 0
          ? Number(item.colorId)
          : Number.isFinite(Number(colorOption?.id)) && Number(colorOption?.id) > 0
            ? Number(colorOption.id)
            : null;
      return {
        ...item,
        styleUid: null,
        colorId: safeColorId,
        colorCode: safeColorCode,
        colorName: safeColorName,
        gender: GENDER_OPTIONS.includes(item.gender) ? item.gender : '',
        sizeQuantities: numericSizeQuantities,
        totalQuantity,
      };
    });

    const totalQuantity = sanitizedItems.reduce((sum, item) => sum + item.totalQuantity, 0);

    const payload = {
      ...formData,
      buyerOrgId: toOrgId(formData.buyerOrgId),
      buyerOrgName: formData.buyerOrgName,
      sellerOrgId: toOrgId(fixedSellerOrg?.id ?? formData.sellerOrgId),
      sellerOrgName: fixedSellerOrg?.name || formData.sellerOrgName,
      customerId: toOrgId(formData.buyerOrgId),
      customerName: formData.buyerOrgName,
      customer: formData.buyerOrgName,
      status: normalizeOrderProgressStage(formData.status) || ORDER_PROGRESS_STAGE_DEFAULT,
      items: sanitizedItems,
      totalQuantity,
      updatedAt: new Date().toISOString(),
    };

    setIsSavingOrder(true);
    try {
      let createdOrder = null;
      if (!isNewOrder) {
        const existingOrder = orders.find((order) => order.id === orderId);
        if (!existingOrder) {
          showNotification(orderPageText.orderToEditNotFound, 'error');
          return;
        }
        payload.id = existingOrder.id;
        payload.createdAt = existingOrder.createdAt || payload.updatedAt;
        const updated = await updateOrderToApi(existingOrder.id, payload, { orgId: activeOrgId });
        setOrders((prev) =>
          prev.map((order) => (order.id === existingOrder.id ? updated : order))
        );
        setFormData(normalizeOrderForm(updated));

        try {
          const oldVariantMap = buildOrderVariantMapForBoard({
            orderId: existingOrder.id,
            items: existingOrder.items || [],
          });
          const nextVariantMap = buildOrderVariantMapForBoard({
            orderId: existingOrder.id,
            items: sanitizedItems,
          });
          const boardQuery = buildQueryString({ orgId: activeOrgId });
          const boardState = await requestJSON('/assignment-board-view' + boardQuery).catch(
            () => ({ cards: [], assignments: [] })
          );
          const currentCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
          const currentAssignments = Array.isArray(boardState?.assignments)
            ? boardState.assignments
            : [];
          const orderPrefix = `${normalizeBoardKey(existingOrder.id)}::`;
          const currentOrderOriginIds = Array.from(
            new Set(
              [
                ...currentCards.map((card) => normalizeBoardKey(card?.originOrderId || card?.id)),
                ...currentAssignments.map((assignment) =>
                  normalizeBoardKey(
                    assignment?.originOrderId || assignment?.cardId || assignment?.id
                  )
                ),
              ].filter((originId) => originId && originId.startsWith(orderPrefix))
            )
          );
          const changedVariantIdSet = new Set(
            Array.from(new Set([...oldVariantMap.keys(), ...nextVariantMap.keys()])).filter(
              (originId) => {
                const oldQty = Number(oldVariantMap.get(originId)?.quantity) || 0;
                const nextQty = Number(nextVariantMap.get(originId)?.quantity) || 0;
                return oldQty !== nextQty;
              }
            )
          );
          const needsLegacyRegroup = currentOrderOriginIds.some(
            (originId) => !nextVariantMap.has(originId)
          );
          if (needsLegacyRegroup) {
            currentOrderOriginIds.forEach((originId) => changedVariantIdSet.add(originId));
            nextVariantMap.forEach((_value, originId) => changedVariantIdSet.add(originId));
          }

          const changedVariantIds = Array.from(changedVariantIdSet);
          if (changedVariantIds.length > 0) {
            const customerName =
              formData.buyerOrgName ||
              formData.customerName ||
              existingOrder.buyerOrgName ||
              existingOrder.customerName ||
              existingOrder.customer ||
              '';
            const nextBoardState = reconcileBoardStateForQuantityChanges({
              currentCards,
              currentAssignments,
              changedVariantIds,
              nextVariantMap,
              styleProcessSummaryById,
              orderId: existingOrder.id,
              orderNumber: existingOrder.orderNumber,
              customerName,
              calculateProcessTotalForOrderQuantity,
            });

            await requestJSON('/assignment-board-state' + boardQuery, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                cards: nextBoardState.cards,
                assignments: nextBoardState.assignments,
              }),
            });

            if (nextBoardState.cancelledAssignmentCount > 0) {
              showNotification(
                orderPageText.assignmentCancelledInfo.replace(
                  '{count}',
                  String(nextBoardState.cancelledAssignmentCount)
                ),
                'info'
              );
            }
          }
        } catch (_boardUpdateErr) {
          // Keep order save successful even if board sync fails.
        }
      } else {
        payload.id = createId('order');
        payload.createdAt = payload.updatedAt;
        const created = await createOrderToApi(payload, { orgId: activeOrgId });
        createdOrder = created;
        setOrders((prev) => [created, ...prev]);
      }

      emitOrderDataChanged();
      showNotification(orderPageText.orderSaved, 'success');
      if (isNewOrder && createdOrder?.id) {
        navigateToPath(`/order/${createdOrder.id}`, {
          label: buildOrderTabLabel(createdOrder, orderPageText.listTitle),
          closeTabId: '/order/new',
          skipUnsavedChangesCheck: true,
        });
      }
    } catch (error) {
      showNotification(
        resolveOrderSaveErrorMessage(error, {
          modificationLockedMessage: orderPageText.modificationLocked,
          duplicateOrderNumberMessage: orderPageText.validationDuplicateOrderNumber,
          fallbackMessage: orderPageText.saveErrorFallback,
        }),
        'error'
      );
    } finally {
      setIsSavingOrder(false);
    }
  };

  if (!isDetailMode) {
    return (
      <AppPageContainer
        header={
          <PageSectionHeader
            title={orderPageText.listTitle}
            actionLabel={orderPageText.addOrder}
            actionIcon={<AddIcon />}
            onAction={handleAdd}
          />
        }
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'stretch', xl: 'center' },
            flexDirection: { xs: 'column', xl: 'row' },
            gap: 1,
            mb: 2,
          }}
        >
          <SearchInput
            value={searchTerm}
            placeholder={orderPartyText.searchPlaceholder}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{
              width: { xs: '100%', sm: 'auto' },
              minWidth: { sm: 320 },
              maxWidth: { lg: 640 },
              flex: 1,
            }}
          />
          <FormControl size="small" sx={{ width: { xs: '100%', sm: 180 }, flexShrink: 0 }}>
            <InputLabel id="order-progress-filter-label">{ORDER_STATUS_TEXT.fieldLabel}</InputLabel>
            <Select
              labelId="order-progress-filter-label"
              value={progressFilter}
              label={ORDER_STATUS_TEXT.fieldLabel}
              onChange={(event) => setProgressFilter(event.target.value)}
            >
              {orderProgressFilterOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box
            sx={{
              display: 'flex',
              alignItems: { xs: 'stretch', sm: 'center' },
              justifyContent: { xs: 'flex-start', xl: 'flex-end' },
              flexDirection: { xs: 'column', sm: 'row' },
              gap: 1,
              flexShrink: 0,
              ml: { xl: 'auto' },
            }}
          >
            <Stack
              direction="row"
              spacing={1}
              sx={{
                alignItems: 'center',
                justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                flexWrap: 'wrap',
                flexShrink: 0,
              }}
            >
              <CustomDatePicker
                value={dueDateFilterStart}
                onChange={handleDueDateFilterStartChange}
                slotProps={ORDER_FILTER_DATE_PICKER_SLOT_PROPS}
              />
              <Typography sx={{ fontSize: 13, color: 'text.secondary', mx: 0.25 }}>
                ~
              </Typography>
              <CustomDatePicker
                value={dueDateFilterEnd}
                onChange={handleDueDateFilterEndChange}
                slotProps={ORDER_FILTER_DATE_PICKER_SLOT_PROPS}
              />
              <Stack sx={{ gap: '2px' }}>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => shiftDueDateFilterMonth(1)}
                  sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                >
                  M+
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => shiftDueDateFilterMonth(-1)}
                  sx={{ minWidth: 32, px: 0.5, py: 0, fontSize: 11, lineHeight: 1.6 }}
                >
                  M-
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Box>
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 980 }}>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.progress }}>
                    {ORDER_STATUS_TEXT.fieldLabel}
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.orderNumber }}
                  >
                    {orderPageText.orderNumber}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.buyer, fontSize: 0 }}>
                    <Box component="span" sx={{ fontSize: '0.875rem' }}>
                      {orderPartyText.buyerWithType}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.seller, fontSize: 0 }}>
                    <Box component="span" sx={{ fontSize: '0.875rem' }}>
                      {orderPartyText.sellerWithType}
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.style }}>
                    {orderPageText.styleColumn}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      width: ORDER_LIST_COLUMN_WIDTHS.totalQuantity,
                      textAlign: 'right',
                    }}
                  >
                    {orderPageText.totalQuantity}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.dueDate }}>
                    {orderPageText.dueDate}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      width: ORDER_LIST_COLUMN_WIDTHS.lock,
                      textAlign: 'center',
                    }}
                  >
                    {orderPageText.lockColumn}
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      width: ORDER_LIST_COLUMN_WIDTHS.actions,
                      textAlign: 'center',
                    }}
                  >
                    {orderPageText.actions}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!ordersLoaded ? (
                  <TableStatusRow colSpan={9} message={orderPageText.loadingOrders} />
                ) : filteredOrders.length === 0 ? (
                  <TableStatusRow colSpan={9} message={orderPageText.emptyOrders} />
                ) : (
                  filteredOrders.map((order) => {
                    const deletable = !order?.isModificationLocked;
                    const canUnlockByReleasingAssignments = Boolean(
                      order?.isModificationLocked && order?.isAssignmentModificationLocked
                    );
                    const listLockToggleDisabled =
                      isTogglingModificationLock ||
                      (!order?.canToggleModificationLock &&
                        !canUnlockByReleasingAssignments);
                    const progressStageLabel = getOrderProgressStageLabel(
                      order.status,
                      ORDER_STATUS_TEXT.noneLabel,
                      languageCode
                    );
                    return (
                      <TableRow
                        key={order.id}
                        hover
                        onDoubleClick={() => handleEdit(order)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>
                          {progressStageLabel}
                        </TableCell>
                        <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>{order.orderNumber}</TableCell>
                        <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>
                          {order.buyerOrgName || order.customerName || order.customer || '-'}
                        </TableCell>
                        <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>
                          {order.sellerOrgName || '-'}
                        </TableCell>
                        <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>
                          {formatStyleSummary(order.items, languageCode)}
                        </TableCell>
                        <TableCell
                          sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                        >
                          {order.totalQuantity != null ? order.totalQuantity.toLocaleString() : '-'}
                        </TableCell>
                        <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>
                          {order.dueDate || '-'}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <LockToggleSwitch
                            checked={Boolean(order?.isModificationLocked)}
                            disabled={listLockToggleDisabled}
                            stopPropagation
                            onChange={(event, checked) => {
                              handleListModificationLockToggle(order, checked);
                            }}
                            ariaLabel={`${orderPageText.lockColumn} ${order.orderNumber || ''}`.trim()}
                          />
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <DeleteActionButton
                            disabled={!deletable}
                            title={deletable ? orderPageText.deleteOrder : orderPageText.modificationLocked}
                            stopPropagation
                            onClick={() => {
                              handleDeleteOrder(order);
                            }}
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
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'center' },
          flexDirection: { xs: 'column', md: 'row' },
          gap: 2,
          mb: 2,
        }}
      >
        <Box
          sx={{
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            flexWrap: 'wrap',
          }}
        >
          <Typography variant="h6" sx={{ mr: 0.5 }}>
            {isNewOrder
              ? getUiMessage('orderDetail.newTitle', 'New Order', languageCode)
              : getUiMessage('orderDetail.editTitle', 'Edit Order', languageCode)}
          </Typography>
          {!isNewOrder && (
            <Tooltip title={currentOrderLockTooltipText}>
              <span>
                <Button
                  size="small"
                  variant="contained"
                  color="inherit"
                  startIcon={
                    isCurrentOrderModificationLocked ? <LockOutlinedIcon /> : <LockOpenOutlinedIcon />
                  }
                  onClick={() =>
                    handleModificationLockToggle(!isCurrentOrderModificationLocked)
                  }
                  disabled={isModificationLockToggleDisabled}
                  sx={getOrderLockButtonSx(isCurrentOrderModificationLocked)}
                >
                  {isCurrentOrderModificationLocked
                    ? getUiMessage('orderDetail.lockedShort', '🔒', languageCode)
                    : getUiMessage('orderDetail.unlockedShort', '🔓', languageCode)}
                </Button>
              </span>
            </Tooltip>
          )}
          {isTogglingModificationLock && <CircularProgress size={16} />}
        </Box>
        <Stack spacing={0.75} alignItems={{ xs: 'stretch', md: 'flex-end' }}>
          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            justifyContent={{ xs: 'flex-end', md: 'flex-end' }}
          >
            <LastUpdaterLabel />
            <SaveButton
              onClick={handleSave}
              disabled={
                isSavingOrder ||
                (!isNewOrder && (!hasFormChanges || isCurrentOrderModificationLocked))
              }
              loading={isSavingOrder}
            />
          </Stack>
        </Stack>
      </Box>

      {!loadingParties && (buyerOptions.length === 0 || sellerOptions.length === 0) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {getUiMessage(
            'orderDetail.noPartners',
            'No linked order partners. Register the customer relationship first.',
            languageCode
          )}
        </Alert>
      )}

      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(2, minmax(0, 1fr))',
                lg: 'minmax(180px, 1fr) minmax(240px, 1.2fr) minmax(240px, 1.2fr) minmax(180px, 0.9fr) auto',
              },
              alignItems: 'start',
            }}
          >
            <TextField
              name="orderNumber"
              label={orderPageText.orderNumber}
              value={formData.orderNumber}
              onChange={handleInputChange}
              fullWidth
            />
            <Box sx={{ minWidth: 0 }}>
              <Autocomplete
                options={buyerOptions}
                value={buyerValue}
                onChange={handleBuyerChange}
                getOptionLabel={(option) => option?.name || ''}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                loading={loadingParties}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    {...{
                      label: orderPartyText.buyerWithType,
                      placeholder: loadingParties
                        ? orderPartyText.loadingPlaceholder
                        : orderPartyText.selectBuyer,
                    }}
                    fullWidth
                  />
                )}
              />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Autocomplete
                options={sellerOptions}
                value={sellerValue}
                onChange={handleSellerChange}
                disabled={loadingParties || isSellerLocked}
                getOptionLabel={(option) => option?.name || ''}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                loading={loadingParties}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    {...{
                      label: orderPartyText.sellerWithType,
                      placeholder: loadingParties
                        ? orderPartyText.loadingPlaceholder
                        : orderPartyText.selectSeller,
                    }}
                    fullWidth
                  />
                )}
              />
            </Box>
            <TextField
              name="dueDate"
              label={orderPageText.dueDate}
              type="date"
              value={formData.dueDate}
              onChange={handleInputChange}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: { xs: 'flex-start', md: 'flex-end' },
                gridColumn: { xs: '1', md: 'span 2', lg: '5' },
              }}
            >
              <ToggleButtonGroup
                size="small"
                exclusive
                value={detailViewMode}
                onChange={handleDetailViewModeChange}
                aria-label="order-detail-view-mode"
              >
                <ToggleButton value={ORDER_DETAIL_VIEW_MODES.HORIZONTAL}>
                  {orderPageText.detailViewModeHorizontal}
                </ToggleButton>
                <ToggleButton value={ORDER_DETAIL_VIEW_MODES.VERTICAL}>
                  {orderPageText.detailViewModeVertical}
                </ToggleButton>
              </ToggleButtonGroup>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              {orderPageText.styleSection}
            </Typography>
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button
                ref={styleAddButtonRef}
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddItem}
              >
                {orderPageText.styleAdd}
              </Button>
            </Stack>
          </Box>

          <Box
            component="fieldset"
            disabled={isCurrentOrderModificationLocked}
            sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
          >

          <Paper variant="outlined" sx={{ mb: 2 }}>
            <TableContainer
              sx={{
                width: '100%',
                overflowX:
                  detailViewMode === ORDER_DETAIL_VIEW_MODES.HORIZONTAL ? 'auto' : 'hidden',
              }}
            >
              {detailViewMode === ORDER_DETAIL_VIEW_MODES.VERTICAL ? (
                <Table
                size="small"
                sx={{
                  width: '100%',
                  tableLayout: 'fixed',
                  '& .MuiTableCell-root': {
                    px: 0.75,
                    py: 0.75,
                  },
                }}
              >
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: '4%', textAlign: 'center' }}>No</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '29%' }}>{orderPageText.detailStyleNameCode}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '10%' }}>{orderPageText.color}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '7%' }}>{orderPageText.gender}</TableCell>
                  {SIZE_COLUMNS.map((size) => (
                    <TableCell
                      key={size}
                      sx={{
                        fontWeight: 'bold',
                        width: ORDER_DETAIL_SIZE_COLUMN_WIDTH,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {getSizeColumnHeaderLabel(size)}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 'bold', width: '8%', textAlign: 'right' }}>{orderPageText.total}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '8%', textAlign: 'right' }}>{orderPageText.styleSubtotal}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '4%', textAlign: 'center' }}>{getUiMessage('common.delete', 'Delete', languageCode)}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupedStyleItems.map((group, groupIndex) => {
                  const groupPastelStyle = getStyleGroupPastelStyle(groupIndex);
                  const groupSubtotalQuantity = (Array.isArray(group.rows) ? group.rows : []).reduce(
                    (sum, row) => sum + getItemTotal(row?.item),
                    0
                  );
                  return group.rows.map(({ item, displayNo, isColorFirstRow, colorRowSpan, colorRowItemIds }, rowIndex) => {
                    const itemTotal = getItemTotal(item);
                    const groupStyleOption =
                      availableStyleOptions.find((option) => option.id === group.styleId) ||
                      (group.styleName
                        ? {
                            id: group.styleId || `group-${group.key}`,
                            name: group.styleName,
                            styleCode: group.styleCode || '',
                            customer: selectedBuyerName,
                          }
                        : null);
                    const normalizedSizeQuantities = normalizeSizeQuantities(item.sizeQuantities);
                    const isFirstRow = rowIndex === 0;
                    const rowStyleIdentity = getStyleIdentity(item);
                    const rowColorGroupKey = getResolvedColorGroupKey(item);
                    const selectedColorOption = getSelectedColorOption(item);
                    const selectedGenderOption = getSelectedGenderOption(item);
                    const colorTargetIds =
                      Array.isArray(colorRowItemIds) && colorRowItemIds.length > 0
                        ? colorRowItemIds
                        : [item.id];
                    const disabledGenderSet = new Set(
                      formData.items
                        .filter(
                          (other) =>
                            other.id !== item.id &&
                            getStyleIdentity(other) === rowStyleIdentity &&
                            getResolvedColorGroupKey(other) === rowColorGroupKey
                        )
                        .map((other) => normalizeGenderCode(other.gender, ''))
                        .filter(Boolean)
                    );

                    return (
                      <TableRow
                        key={item.id}
                        data-order-style-item-row="true"
                        onFocusCapture={() => handleItemRowFocusCapture(item.id)}
                        onBlurCapture={(event) => handleItemRowBlurCapture(item.id, event)}
                        sx={{
                          '& > td': {
                            backgroundColor: groupPastelStyle.background,
                            borderBottomColor: groupPastelStyle.border,
                          },
                          '& > td:first-of-type': {
                            borderLeft: `4px solid ${groupPastelStyle.accent}`,
                          },
                        }}
                      >
                        <TableCell sx={{ textAlign: 'center' }}>{displayNo}</TableCell>
                        {isFirstRow && (
                          <TableCell
                            rowSpan={group.rows.length}
                            sx={{
                              verticalAlign: 'top',
                              pt: 1,
                              backgroundColor: `${groupPastelStyle.background} !important`,
                              borderBottomColor: `${groupPastelStyle.border} !important`,
                            }}
                          >
                            <SearchableSelect
                              options={availableStyleOptions}
                              value={groupStyleOption}
                              disabled={!selectedBuyerName}
                              onChange={(event, newValue, reason) =>
                                handleStyleChange(group.rowItemIds, newValue, {
                                  focusNext: shouldAdvanceAfterAutocompleteSelection(event, reason),
                                  focusItemId: group.rows[0]?.item?.id || '',
                                })
                              }
                              getOptionLabel={(option) => option?.name || ''}
                              isOptionEqualToValue={(option, value) => option?.id === value?.id}
                              autoHighlight
                              textFieldProps={{
                                size: 'small',
                                placeholder: orderPageText.styleSearchPlaceholder,
                                inputRef: (node) =>
                                  setInputElementInMap(
                                    styleInputRefs,
                                    group.rows[0]?.item?.id || '',
                                    node
                                  ),
                              }}
                              noOptionsText={
                                selectedBuyerName
                                  ? orderPageText.noRegisteredStyles
                                  : orderPartyText.selectBuyerFirst
                              }
                            />
                          </TableCell>
                        )}
                        {isColorFirstRow && (
                          <TableCell
                            rowSpan={colorRowSpan || 1}
                            sx={{
                              verticalAlign: 'top',
                              pt: 1,
                              backgroundColor: `${groupPastelStyle.background} !important`,
                              borderBottomColor: `${groupPastelStyle.border} !important`,
                            }}
                          >
                            <FormControl fullWidth size="small">
                              <SearchableSelect
                                options={normalizedColorOptions}
                                value={selectedColorOption}
                                disabled={!rowStyleIdentity || creatingColorItemId === item.id}
                                loading={creatingColorItemId === item.id}
                                onChange={(event, newValue, reason) => {
                                  void handleColorChange(colorTargetIds, newValue, {
                                    focusNext: shouldAdvanceAfterAutocompleteSelection(event, reason),
                                    focusItemId: item.id,
                                  });
                                }}
                                filterOptions={filterColorAutocompleteOptions}
                                getOptionLabel={(option) => {
                                  if (typeof option === 'string') return option;
                                  if (option?.isCreateOption) {
                                    return option.inputValue || option.name || '';
                                  }
                                  return option?.displayName || option?.name || option?.code || '';
                                }}
                                isOptionEqualToValue={(option, value) => {
                                  const optionId = toPositiveColorId(option?.id);
                                  const valueId = toPositiveColorId(value?.id);
                                  if (optionId && valueId) {
                                    return optionId === valueId;
                                  }
                                  return normalizeColorCode(option?.code) === normalizeColorCode(value?.code);
                                }}
                                renderOption={(props, option) => (
                                  <li {...props}>
                                    {option?.isCreateOption
                                      ? `${orderPageText.addNewColorPrefix} ${option.inputValue || option.name || ''}`
                                      : option?.displayName || option?.name || option?.code || ''}
                                  </li>
                                )}
                                autoHighlight
                                selectOnFocus
                                clearOnBlur
                                handleHomeEndKeys
                                noOptionsText={
                                  canCreateColorAttribute
                                    ? orderPageText.colorCreateHint
                                    : orderPageText.noRegisteredColors
                                }
                                textFieldProps={{
                                  size: 'small',
                                  placeholder: canCreateColorAttribute
                                    ? orderPageText.colorSearchOrCreate
                                    : orderPageText.colorSearch,
                                  inputRef: (node) =>
                                    setInputElementInMap(colorInputRefs, item.id, node),
                                }}
                              />
                            </FormControl>
                          </TableCell>
                        )}
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <SearchableSelect
                              options={genderSelectOptions}
                              value={selectedGenderOption}
                              onChange={(event, newValue, reason) =>
                                handleGenderChange(item.id, newValue, {
                                  focusNext: shouldAdvanceAfterAutocompleteSelection(event, reason),
                                })
                              }
                              getOptionLabel={(option) => option?.label || option?.code || ''}
                              isOptionEqualToValue={(option, value) => option?.code === value?.code}
                              getOptionDisabled={(option) =>
                                Boolean(rowStyleIdentity) &&
                                Boolean(rowColorGroupKey) &&
                                disabledGenderSet.has(option?.code)
                              }
                              autoHighlight
                              disabled={!rowStyleIdentity}
                              noOptionsText={orderPageText.noSelectableGender}
                              textFieldProps={{
                                size: 'small',
                                placeholder: orderPageText.selectGender,
                                inputRef: (node) =>
                                  setInputElementInMap(genderInputRefs, item.id, node),
                              }}
                            />
                          </FormControl>
                        </TableCell>
                        {SIZE_COLUMNS.map((size) => {
                          const sizeValue = getDisplayQuantityInputValue(
                            normalizedSizeQuantities[size]
                          );
                          return (
                            <TableCell key={`${item.id}-${size}`} sx={{ textAlign: 'center', px: 0.25 }}>
                              <TextField
                                value={sizeValue}
                                onChange={(event) => handleSizeQuantityChange(item.id, size, event.target.value)}
                                onKeyDown={size === LAST_SIZE_COLUMN ? handleLastSizeInputKeyDown : undefined}
                                inputRef={(node) =>
                                  setInputElementInMap(sizeInputRefs, `${item.id}::${size}`, node)
                                }
                                size="small"
                                type="text"
                                placeholder="-"
                                sx={{
                                  minWidth: 0,
                                  '& .MuiInputBase-input': {
                                    textAlign: 'right',
                                    px: 0.75,
                                    py: 0.625,
                                    fontSize: 12,
                                    color: getQuantityTextColor(sizeValue),
                                  },
                                }}
                                inputProps={{
                                  inputMode: 'numeric',
                                  pattern: '[0-9]*',
                                  style: { textAlign: 'right' },
                                }}
                                fullWidth
                              />
                            </TableCell>
                          );
                        })}
                        <TableCell
                          sx={{
                            textAlign: 'right',
                            fontWeight: 600,
                            color: getQuantityTextColor(itemTotal),
                          }}
                        >
                          {formatQuantityDisplay(itemTotal)}
                        </TableCell>
                        <TableCell
                          sx={{
                            textAlign: 'right',
                            fontWeight: isFirstRow ? 700 : 400,
                            fontVariantNumeric: 'tabular-nums',
                            color: isFirstRow
                              ? getQuantityTextColor(groupSubtotalQuantity)
                              : 'text.secondary',
                          }}
                        >
                          {isFirstRow ? formatQuantityDisplay(groupSubtotalQuantity) : ''}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton size="small" onClick={() => handleRemoveItem(item.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  });
                })}
              </TableBody>
            </Table>
              ) : (
                <Table
                  size="small"
                  sx={{
                    minWidth: 2200,
                    tableLayout: 'fixed',
                    '& .MuiTableCell-root': {
                      px: 0.75,
                      py: 0.75,
                    },
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell
                        rowSpan={2}
                        sx={{ fontWeight: 'bold', width: 56, textAlign: 'center' }}
                      >
                        No
                      </TableCell>
                      <TableCell
                        rowSpan={2}
                        sx={{
                          fontWeight: 'bold',
                          width: ORDER_DETAIL_HORIZONTAL_STYLE_COLUMN_WIDTH,
                          minWidth: ORDER_DETAIL_HORIZONTAL_STYLE_COLUMN_WIDTH,
                        }}
                      >
                        {orderPageText.detailStyleNameCode}
                      </TableCell>
                      <TableCell
                        rowSpan={2}
                        sx={{
                          fontWeight: 'bold',
                          width: ORDER_DETAIL_HORIZONTAL_COLOR_COLUMN_WIDTH,
                          minWidth: ORDER_DETAIL_HORIZONTAL_COLOR_COLUMN_WIDTH,
                        }}
                      >
                        {orderPageText.color}
                      </TableCell>
                      {ORDER_DETAIL_HORIZONTAL_GENDERS.map((genderCode, genderIndex) => (
                        <TableCell
                          key={`horizontal-group-${genderCode}`}
                          colSpan={SIZE_COLUMNS.length}
                          sx={{
                            fontWeight: 'bold',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                            borderLeft:
                              genderIndex > 0 ? ORDER_DETAIL_HORIZONTAL_GROUP_DIVIDER : undefined,
                          }}
                        >
                          {getGenderLabel(
                            genderCode,
                            GENDER_OPTION_LABELS[genderCode] || genderCode,
                            languageCode
                          )}
                        </TableCell>
                      ))}
                      <TableCell
                        rowSpan={2}
                        sx={{ fontWeight: 'bold', width: 96, textAlign: 'right' }}
                      >
                        {orderPageText.total}
                      </TableCell>
                      <TableCell
                        rowSpan={2}
                        sx={{ fontWeight: 'bold', width: 112, textAlign: 'right' }}
                      >
                        {orderPageText.styleSubtotal}
                      </TableCell>
                      <TableCell
                        rowSpan={2}
                        sx={{ fontWeight: 'bold', width: 64, textAlign: 'center' }}
                      >
                        {getUiMessage('common.delete', 'Delete', languageCode)}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      {ORDER_DETAIL_HORIZONTAL_GENDERS.map((genderCode, genderIndex) =>
                        SIZE_COLUMNS.map((size, sizeIndex) => (
                          <TableCell
                            key={`horizontal-${genderCode}-${size}`}
                            sx={{
                              fontWeight: 'bold',
                              textAlign: 'center',
                              whiteSpace: 'nowrap',
                              minWidth: 72,
                              borderLeft:
                                genderIndex > 0 && sizeIndex === 0
                                  ? ORDER_DETAIL_HORIZONTAL_GROUP_DIVIDER
                                  : undefined,
                            }}
                          >
                            {getSizeColumnHeaderLabel(size)}
                          </TableCell>
                        ))
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {horizontalStyleColorRows.map((group, groupIndex) => {
                      const groupPastelStyle = getStyleGroupPastelStyle(groupIndex);
                      return group.colorRows.map((colorRow, rowIndex) => {
                        const isFirstColorRow = rowIndex === 0;
                        const groupStyleOption =
                          availableStyleOptions.find((option) => option.id === group.styleId) ||
                          (group.styleName
                            ? {
                                id: group.styleId || `group-${group.key}`,
                                name: group.styleName,
                                styleCode: group.styleCode || '',
                                customer: selectedBuyerName,
                              }
                            : null);
                        const colorReferenceItem =
                          colorRow.referenceItem ||
                          (Array.isArray(colorRow.rows) ? colorRow.rows[0]?.item : null) ||
                          null;
                        const rowStyleIdentity =
                          getStyleIdentity(colorReferenceItem) ||
                          group.styleId ||
                          group.styleName ||
                          group.styleCode ||
                          '';
                        const colorTargetIds =
                          Array.isArray(colorRow.rowItemIds) && colorRow.rowItemIds.length > 0
                            ? colorRow.rowItemIds
                            : [String(colorReferenceItem?.id || '').trim()].filter(Boolean);
                        const colorInputTargetId = colorTargetIds[0] || '';
                        const selectedColorOption = getSelectedColorOption(colorReferenceItem);

                        return (
                          <TableRow
                            key={colorRow.key}
                            data-order-style-item-row="true"
                            onFocusCapture={() => handleItemRowFocusCapture(colorTargetIds)}
                            onBlurCapture={(event) =>
                              handleItemRowBlurCapture(colorTargetIds, event)
                            }
                            sx={{
                              '& > td': {
                                backgroundColor: groupPastelStyle.background,
                                borderBottomColor: groupPastelStyle.border,
                              },
                              '& > td:first-of-type': {
                                borderLeft: `4px solid ${groupPastelStyle.accent}`,
                              },
                            }}
                          >
                            <TableCell sx={{ textAlign: 'center' }}>{colorRow.displayNo}</TableCell>
                            {isFirstColorRow && (
                              <TableCell
                                rowSpan={group.colorRows.length}
                                sx={{
                                  verticalAlign: 'top',
                                  pt: 1,
                                  width: ORDER_DETAIL_HORIZONTAL_STYLE_COLUMN_WIDTH,
                                  minWidth: ORDER_DETAIL_HORIZONTAL_STYLE_COLUMN_WIDTH,
                                  backgroundColor: `${groupPastelStyle.background} !important`,
                                  borderBottomColor: `${groupPastelStyle.border} !important`,
                                }}
                              >
                                <SearchableSelect
                                  options={availableStyleOptions}
                                  value={groupStyleOption}
                                  disabled={!selectedBuyerName}
                                  onChange={(event, newValue, reason) => {
                                    const shouldFocusNext =
                                      shouldAdvanceAfterAutocompleteSelection(event, reason) ||
                                      pendingHorizontalStyleTabFocusItemIdRef.current ===
                                        colorInputTargetId;
                                    handleStyleChange(group.rowItemIds, newValue, {
                                      focusNext:
                                        shouldFocusNext,
                                      focusItemId: colorInputTargetId,
                                    });
                                    if (
                                      pendingHorizontalStyleTabFocusItemIdRef.current ===
                                      colorInputTargetId
                                    ) {
                                      pendingHorizontalStyleTabFocusItemIdRef.current = '';
                                    }
                                  }}
                                  getOptionLabel={(option) => option?.name || ''}
                                  isOptionEqualToValue={(option, value) => option?.id === value?.id}
                                  autoHighlight
                                  textFieldProps={{
                                    size: 'small',
                                    placeholder: orderPageText.styleSearchPlaceholder,
                                    inputProps: {
                                      onKeyDown: (event) => {
                                        if (event.key === 'Tab' && !event.shiftKey) {
                                          pendingHorizontalStyleTabFocusItemIdRef.current =
                                            colorInputTargetId;
                                          window.requestAnimationFrame(() => {
                                            if (
                                              pendingHorizontalStyleTabFocusItemIdRef.current ===
                                              colorInputTargetId
                                            ) {
                                              pendingHorizontalStyleTabFocusItemIdRef.current = '';
                                            }
                                          });
                                        }
                                      },
                                    },
                                    inputRef: (node) =>
                                      setInputElementInMap(
                                        styleInputRefs,
                                        colorInputTargetId || group.rowItemIds?.[0] || '',
                                        node
                                      ),
                                  }}
                                  noOptionsText={
                                    selectedBuyerName
                                      ? orderPageText.noRegisteredStyles
                                      : orderPartyText.selectBuyerFirst
                                  }
                                />
                              </TableCell>
                            )}
                            <TableCell
                              sx={{
                                width: ORDER_DETAIL_HORIZONTAL_COLOR_COLUMN_WIDTH,
                                minWidth: ORDER_DETAIL_HORIZONTAL_COLOR_COLUMN_WIDTH,
                              }}
                            >
                              <FormControl fullWidth size="small">
                                <SearchableSelect
                                  options={normalizedColorOptions}
                                  value={selectedColorOption}
                                  disabled={!rowStyleIdentity || creatingColorItemId === colorInputTargetId}
                                  loading={creatingColorItemId === colorInputTargetId}
                                  onChange={(event, newValue, reason) => {
                                    void handleColorChange(colorTargetIds, newValue, {
                                      focusNext: shouldAdvanceAfterAutocompleteSelection(event, reason),
                                      focusItemId: colorInputTargetId,
                                    });
                                  }}
                                  filterOptions={filterColorAutocompleteOptions}
                                  getOptionLabel={(option) => {
                                    if (typeof option === 'string') return option;
                                    if (option?.isCreateOption) {
                                      return option.inputValue || option.name || '';
                                    }
                                    return option?.displayName || option?.name || option?.code || '';
                                  }}
                                  isOptionEqualToValue={(option, value) => {
                                    const optionId = toPositiveColorId(option?.id);
                                    const valueId = toPositiveColorId(value?.id);
                                    if (optionId && valueId) {
                                      return optionId === valueId;
                                    }
                                    return normalizeColorCode(option?.code) === normalizeColorCode(value?.code);
                                  }}
                                  renderOption={(props, option) => (
                                    <li {...props}>
                                      {option?.isCreateOption
                                        ? `${orderPageText.addNewColorPrefix} ${option.inputValue || option.name || ''}`
                                        : option?.displayName || option?.name || option?.code || ''}
                                    </li>
                                  )}
                                  autoHighlight
                                  selectOnFocus
                                  clearOnBlur
                                  handleHomeEndKeys
                                  noOptionsText={
                                    canCreateColorAttribute
                                      ? orderPageText.colorCreateHint
                                      : orderPageText.noRegisteredColors
                                  }
                                  textFieldProps={{
                                    size: 'small',
                                    placeholder: canCreateColorAttribute
                                      ? orderPageText.colorSearchOrCreate
                                      : orderPageText.colorSearch,
                                    inputRef: (node) =>
                                      setInputElementInMap(
                                        colorInputRefs,
                                        colorInputTargetId,
                                        node
                                      ),
                                  }}
                                />
                              </FormControl>
                            </TableCell>
                            {ORDER_DETAIL_HORIZONTAL_GENDERS.map((genderCode, genderIndex) =>
                              SIZE_COLUMNS.map((size, sizeIndex) => {
                                const horizontalSizeValue = getHorizontalSizeInputValue(
                                  colorRow,
                                  genderCode,
                                  size
                                );
                                return (
                                  <TableCell
                                    key={`${colorRow.key}-${genderCode}-${size}`}
                                    sx={{
                                      textAlign: 'right',
                                      whiteSpace: 'nowrap',
                                      fontVariantNumeric: 'tabular-nums',
                                      px: 0.35,
                                      borderLeft:
                                        genderIndex > 0 && sizeIndex === 0
                                          ? ORDER_DETAIL_HORIZONTAL_GROUP_DIVIDER
                                          : undefined,
                                    }}
                                  >
                                    <TextField
                                      value={horizontalSizeValue}
                                      onChange={(event) =>
                                        handleHorizontalSizeQuantityChange(
                                          group,
                                          colorRow,
                                          genderCode,
                                          size,
                                          event.target.value
                                        )
                                      }
                                      size="small"
                                      type="text"
                                      placeholder="-"
                                      sx={{
                                        minWidth: 0,
                                        '& .MuiInputBase-input': {
                                          textAlign: 'right',
                                          px: 0.6,
                                          py: 0.45,
                                          fontSize: 12,
                                          color: getQuantityTextColor(horizontalSizeValue),
                                        },
                                      }}
                                      inputProps={{
                                        inputMode: 'numeric',
                                        pattern: '[0-9]*',
                                        style: { textAlign: 'right' },
                                      }}
                                      fullWidth
                                    />
                                  </TableCell>
                                );
                              })
                            )}
                            <TableCell
                              sx={{
                                textAlign: 'right',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                color: getQuantityTextColor(colorRow.totalQuantity),
                              }}
                            >
                              {formatQuantityDisplay(colorRow.totalQuantity)}
                            </TableCell>
                            <TableCell
                              sx={{
                                textAlign: 'right',
                                fontWeight: isFirstColorRow ? 700 : 400,
                                fontVariantNumeric: 'tabular-nums',
                                color: isFirstColorRow
                                  ? getQuantityTextColor(group.styleSubtotalQuantity)
                                  : 'text.secondary',
                              }}
                            >
                              {isFirstColorRow
                                ? formatQuantityDisplay(group.styleSubtotalQuantity)
                                : ''}
                            </TableCell>
                            <TableCell sx={{ textAlign: 'center' }}>
                              <IconButton
                                size="small"
                                onClick={() => handleRemoveItem(colorTargetIds)}
                                disabled={!colorTargetIds.length}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })}
                  </TableBody>
                </Table>
              )}
          </TableContainer>
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            {orderPageText.orderTotalQuantity}: {formatQuantityDisplay(getOrderTotal())}
          </Typography>
        </Box>
          </Box>
        </Box>
      </Box>
    </AppPageContainer>
  );
};

export default OrderList;

