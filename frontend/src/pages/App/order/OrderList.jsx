import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
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
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AppPageContainer from '../../../components/AppPageContainer';
import CustomDatePicker from '../../../components/CustomDatePicker';
import PageSectionHeader from '../../../components/PageSectionHeader';
import SearchInput from '../../../components/SearchInput';
import SearchableSelect from '../../../components/SearchableSelect';
import { createAutocompleteFilterOptions } from '../../../utils/autocompleteSearch';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import {
  loadOrderDraft,
  saveOrderDraft,
  clearOrderDraft,
} from '../../../utils/localData';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import { createColorAttribute, fetchAttributes } from '../../../utils/attributeApi';
import {
  SIZE_CODES,
  GENDER_CODES,
  normalizeGenderCode,
} from '../../../constants/productAttributes';
import { collectAttributeTextCandidates, resolveLocalizedAttributeName } from '../../../utils/appLanguage';
import {
  ORDER_CONFIRMATION_TEXT,
  ORDER_CONFIRMATION_STATUS_KEYS,
  ORDER_CONFIRMATION_STATUS_OPTIONS,
  getOrderConfirmationDeleteOnlyMessage,
  getOrderConfirmationDeleteTooltip,
  getOrderConfirmationStatusLabel as getOrderConfirmationStatusLabelFromConst,
  hasOrderProgressStage,
  isOrderConfirmationPlanned,
  normalizeOrderConfirmationStatus as normalizeOrderConfirmationStatusFromConst,
} from '../../../constants/orderConfirmationStatus';
import {
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
} from '../../../utils/orderApi';
import {
  calculateProcessTotalForOrderQuantity,
  normalizeProcesses,
} from '../../../utils/processTime';
import { reconcileBoardStateForQuantityChanges } from '../../../utils/quantityChangeBoard.mjs';

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORDER_CONFIRMATION_STATUSES = ORDER_CONFIRMATION_STATUS_OPTIONS.map(
  (option) => option.value
);
const ORDER_PROGRESS_STAGE_NONE = '__NONE__';
const ORDER_PROGRESS_STAGES = ORDER_STATUS_OPTIONS.map((option) => option.value);
const ORDER_PROGRESS_STAGE_DEFAULT = ORDER_PROGRESS_STAGES[0] || '';
const ORDER_FILTER_ALL = 'ALL';
const GENDER_OPTIONS = GENDER_CODES;
const SIZE_COLUMNS = SIZE_CODES;
const LAST_SIZE_COLUMN = SIZE_COLUMNS[SIZE_COLUMNS.length - 1] || '';
const ORDER_DETAIL_SIZE_COLUMN_WIDTH = `${(38 / SIZE_COLUMNS.length).toFixed(3)}%`;
const ORDER_CONFIRMATION_FILTER_OPTIONS = [
  {
    value: ORDER_FILTER_ALL,
    label: ORDER_CONFIRMATION_TEXT.filterAllLabel,
  },
  ...ORDER_CONFIRMATION_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  })),
];
const ORDER_PROGRESS_FILTER_OPTIONS = [
  {
    value: ORDER_FILTER_ALL,
    label: ORDER_STATUS_TEXT.filterAllLabel,
  },
  {
    value: ORDER_PROGRESS_STAGE_NONE,
    label: ORDER_STATUS_TEXT.noneLabel,
  },
  ...ORDER_STATUS_OPTIONS.map((option) => ({
    value: option.value,
    label: option.label,
  })),
];
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
  confirmation: '8%',
  progress: '8%',
  orderNumber: '10%',
  buyer: '16%',
  seller: '16%',
  style: '18%',
  totalQuantity: '10%',
  dueDate: '10%',
  actions: '4%',
};
const ORDER_LIST_TEXT_ELLIPSIS_SX = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const GENDER_SORT_ORDER = {
  M: 0,
  W: 1,
  U: 2,
};
const GENDER_PASTEL_STYLES = {
  M: { background: '#eaf4ff', border: '#cfe2ff', accent: '#7ab6ff' },
  W: { background: '#ffeef3', border: '#ffd6e0', accent: '#ff9eb9' },
  U: { background: '#edf9f0', border: '#d4eedb', accent: '#8fcea0' },
  default: { background: '#f7f7f7', border: '#ececec', accent: '#c6c6c6' },
};
const normalizeOrderConfirmation = (status) =>
  normalizeOrderConfirmationStatusFromConst(status);
const getOrderConfirmationLabel = (status) =>
  getOrderConfirmationStatusLabelFromConst(status, String(status || '').trim() || '-');
const normalizeOrderProgressStage = (status) => normalizeOrderStatusFromConst(status);
const getOrderProgressStageLabel = (status) =>
  getOrderStatusLabelFromConst(status, String(status || '').trim() || '-');
const isOrderDeletable = (confirmationStatus) => isOrderConfirmationPlanned(confirmationStatus);
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
const buildOrderTabLabel = (order) => {
  const orderNumber = String(order?.orderNumber || order?.id || '').trim();
  return orderNumber ? `주문: ${orderNumber}` : '주문';
};
const ORDER_MODIFICATION_LOCK_NOTICE =
  '\uC8FC\uBB38\uC744 \uD655\uC815\uD558\uBA74 \uAE30\uBCF8 \uC815\uBCF4\uB294 \uC7A0\uAE30\uACE0, \uC9C4\uD589 \uB2E8\uACC4\uB294 \uC790\uB3D9\uC73C\uB85C \uC5C5\uB370\uC774\uD2B8\uB429\uB2C8\uB2E4.';
const ORDER_MODIFICATION_LOCK_MESSAGE =
  '\uC7A0\uAE34 \uC8FC\uBB38\uC740 \uAE30\uBCF8 \uC815\uBCF4\uB294 \uC218\uC815\uD560 \uC218 \uC5C6\uACE0, \uACC4\uD68D/\uD655\uC815 \uC804\uD658\uB9CC \uAC00\uB2A5\uD569\uB2C8\uB2E4.';
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
const getStyleGroupKey = (item) => {
  if (item?.styleId) return `style:${item.styleId}`;
  if (item?.styleName) return `style-name:${item.styleName}`;
  if (item?.styleCode) return `style-code:${item.styleCode}`;
  return `item:${item?.id || ''}`;
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
const normalizeBoardKey = (value) => String(value ?? '').trim();
const normalizeBoardGender = (value) => {
  const code = normalizeGenderCode(value, '').toUpperCase();
  return GENDER_OPTIONS.includes(code) ? code : 'U';
};
const buildAssignmentOriginCardId = (orderId, styleId, colorId, gender) =>
  `${normalizeBoardKey(orderId)}::${normalizeBoardKey(styleId)}::${normalizeColorCode(colorId)}::${normalizeBoardGender(gender)}`;
const sumLegacyQuantities = (rows = []) =>
  rows.reduce((sum, row) => sum + (Number(row?.quantity) || 0), 0);
const resolveLegacyRowColorKeyForBoard = (row) => {
  const fromCode = normalizeColorCode(row?.colorCode || row?.color || row?.colorName);
  if (fromCode) return fromCode;
  const fromId = normalizeColorCode(row?.colorId);
  if (!fromId || GENDER_OPTIONS.includes(fromId)) return 'UNSPEC';
  return fromId;
};
const resolveOrderItemQuantityForBoard = (item) => {
  if (Number(item?.totalQuantity) > 0) return Number(item.totalQuantity);
  if (item?.sizeQuantities && typeof item.sizeQuantities === 'object') {
    const qty = sumSizeQuantities(item.sizeQuantities);
    if (qty > 0) return qty;
  }
  if (Array.isArray(item?.quantities)) {
    const qty = sumLegacyQuantities(item.quantities);
    if (qty > 0) return qty;
  }
  return 0;
};
const resolveVariantBucketsFromLegacyRowsForBoard = (rows = []) => {
  const bucket = new Map();
  rows.forEach((row) => {
    const quantity = Number(row?.quantity) || 0;
    if (quantity <= 0) return;
    const colorId = resolveLegacyRowColorKeyForBoard(row);
    const gender = normalizeBoardGender(row?.gender || row?.colorId);
    const bucketKey = `${colorId}::${gender}`;
    const current = bucket.get(bucketKey);
    if (!current) {
      bucket.set(bucketKey, { colorId, gender, quantity });
      return;
    }
    current.quantity += quantity;
  });
  return Array.from(bucket.values());
};
const resolveOrderItemVariantBucketsForBoard = (item) => {
  const fromLegacyRows = resolveVariantBucketsFromLegacyRowsForBoard(
    Array.isArray(item?.quantities) ? item.quantities : []
  );
  if (fromLegacyRows.length > 0) return fromLegacyRows;

  const fallbackQuantity = resolveOrderItemQuantityForBoard(item);
  if (fallbackQuantity <= 0) return [];
  const fallbackColor = normalizeColorCode(item?.colorCode || item?.colorId || item?.color || 'UNSPEC');
  const fallbackGender = normalizeBoardGender(item?.gender);
  return [{ colorId: fallbackColor || 'UNSPEC', gender: fallbackGender, quantity: fallbackQuantity }];
};
const buildOrderVariantMapForBoard = ({ orderId, items }) => {
  const normalizedOrderId = normalizeBoardKey(orderId);
  if (!normalizedOrderId) return new Map();

  return (Array.isArray(items) ? items : []).reduce((map, item) => {
    const styleId = normalizeBoardKey(item?.styleId);
    if (!styleId) return map;

    const styleName = String(item?.styleName || '').trim();
    const styleCode = String(item?.styleCode || '').trim();
    const colorName = String(item?.colorName || item?.color || '').trim();
    const variantBuckets = resolveOrderItemVariantBucketsForBoard(item);
    variantBuckets.forEach(({ colorId, gender, quantity }) => {
      const qty = Number(quantity) || 0;
      if (qty <= 0) return;
      const normalizedColor = normalizeColorCode(colorId || 'UNSPEC') || 'UNSPEC';
      const normalizedGender = normalizeBoardGender(gender);
      const originId = buildAssignmentOriginCardId(
        normalizedOrderId,
        styleId,
        normalizedColor,
        normalizedGender
      );
      const current = map.get(originId);
      if (!current) {
        map.set(originId, {
          originId,
          styleId,
          styleName,
          styleCode,
          colorId: normalizedColor,
          colorName,
          gender: normalizedGender,
          quantity: qty,
        });
        return;
      }
      current.quantity += qty;
      if (!current.styleName && styleName) current.styleName = styleName;
      if (!current.styleCode && styleCode) current.styleCode = styleCode;
      if (!current.colorName && colorName) current.colorName = colorName;
    });
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
const setInputElementInMap = (mapRef, key, node) => {
  if (!key) return;
  if (node) {
    mapRef.current.set(key, node);
    return;
  }
  mapRef.current.delete(key);
};
const focusInputElementInMap = (mapRef, key) => {
  if (!key) return;
  requestAnimationFrame(() => {
    const node = mapRef.current.get(key);
    if (node && typeof node.focus === 'function') {
      node.focus();
      if (typeof node.select === 'function') {
        node.select();
      }
    }
  });
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
const resolveOrderSaveErrorMessage = (error) => {
  const message = String(error?.message || '').trim();
  if (message.includes('order modification is locked')) {
    return ORDER_MODIFICATION_LOCK_MESSAGE;
  }
  if (message.includes('manufacturer cannot change confirmation status')) {
    return '공장은 주문을 확정할 수 없습니다.';
  }
  if (message === 'order number already exists for this customer') {
    return '같은 고객사에는 동일한 주문번호를 사용할 수 없습니다.';
  }
  return message || '주문 저장 중 오류가 발생했습니다.';
};
const getGenderOrder = (gender) =>
  Number.isFinite(GENDER_SORT_ORDER[gender]) ? GENDER_SORT_ORDER[gender] : 99;
const getGenderPastelStyle = (gender) => GENDER_PASTEL_STYLES[gender] || GENDER_PASTEL_STYLES.default;
const getLegacyGenderCodeFromRows = (rows = []) => {
  for (const row of rows) {
    const code = normalizeGenderCode(row?.gender || row?.colorId, '');
    if (code) return code;
  }
  return '';
};
const getLegacyColorCodeFromRows = (rows = []) => {
  for (const row of rows) {
    const fromCode = normalizeColorCode(row?.colorCode || row?.color);
    if (fromCode) return fromCode;
    const fromId = normalizeColorCode(row?.colorId);
    if (fromId && !GENDER_OPTIONS.includes(fromId)) return fromId;
  }
  return '';
};
const getLegacyColorNameFromRows = (rows = []) => {
  for (const row of rows) {
    const name = String(row?.colorName || row?.color || '').trim();
    if (name) return name;
  }
  return '';
};
const getLegacyColorIdFromRows = (rows = []) => {
  for (const row of rows) {
    const parsed = Number(row?.colorId);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
};
const normalizeSizeKey = (value) => {
  const raw = String(value || '')
    .toUpperCase()
    .replace(/\s+/g, '');
  if (!raw) return '';
  if (SIZE_COLUMNS.includes(raw)) return raw;
  if (raw === 'XXL' || raw === '2X') return '2XL';
  if (raw === 'XXXL' || raw === '3X') return '3XL';
  if (raw === 'XXXXL' || raw === '4X') return '4XL';
  return '';
};
const toNumericInputString = (value) => String(value ?? '').replace(/[^\d]/g, '');
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
  gender: 'M',
  sizeQuantities: createSizeQuantities(),
});

const normalizeOrderItem = (item) => {
  const legacyRows =
    Array.isArray(item?.quantities) && item.quantities.length > 0
      ? item.quantities.map(normalizeQuantityRow)
      : [];
  const normalizedGender = normalizeGenderCode(item?.gender, '');
  const legacyGender = getLegacyGenderCodeFromRows(legacyRows);
  const colorCodeFromItem = normalizeColorCode(item?.colorCode || item?.color || '');
  const colorCodeFromLegacy = getLegacyColorCodeFromRows(legacyRows);
  const colorCode = colorCodeFromItem || colorCodeFromLegacy;
  const colorNameFromItem = String(item?.colorName || '').trim();
  const colorName = colorNameFromItem || getLegacyColorNameFromRows(legacyRows);
  const colorIdFromItem = Number(item?.colorId);
  const colorId =
    Number.isFinite(colorIdFromItem) && colorIdFromItem > 0
      ? colorIdFromItem
      : getLegacyColorIdFromRows(legacyRows);

  return {
    id: item?.id || createId('item'),
    styleId: item?.styleId || '',
    styleName: item?.styleName || '',
    styleCode: item?.styleCode || '',
    colorId,
    colorCode,
    colorName,
    gender: normalizedGender || legacyGender || 'M',
    sizeQuantities:
      item?.sizeQuantities && typeof item.sizeQuantities === 'object'
        ? normalizeSizeQuantities(item.sizeQuantities)
        : buildSizeQuantitiesFromLegacyRows(legacyRows),
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
  confirmationStatus: ORDER_CONFIRMATION_STATUSES[0],
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
    confirmationStatus: normalizeOrderConfirmation(order.confirmationStatus) || base.confirmationStatus,
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
  const normalizedConfirmationStatus =
    normalizeOrderConfirmation(source?.confirmationStatus) || ORDER_CONFIRMATION_STATUSES[0];
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
      gender: normalizeGenderCode(item?.gender, 'M') || 'M',
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
    confirmationStatus: normalizedConfirmationStatus,
    status: hasOrderProgressStage(normalizedConfirmationStatus)
      ? normalizeOrderProgressStage(source?.status) || ORDER_PROGRESS_STAGE_DEFAULT
      : '',
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

const formatStyleSummary = (items = []) => {
  const names = getStyleDisplayNames(items);
  if (names.length === 0) return '-';
  if (names.length === 1) return names[0];
  return `${names[0]} 외 ${names.length - 1}개`;
};

const OrderList = () => {
  const { orderId } = useParams();
  const isDetailMode = Boolean(orderId);
  const isNewOrder = orderId === 'new';
  const currentOrderRoutePath = isDetailMode ? `/order/${orderId}` : '/order';
  const { showNotification, navigateToPath, activePath, refreshSignals, markPathForRefresh } = useApp();
  const { activeOrgId, activeOrgType, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
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
  const [confirmationFilter, setConfirmationFilter] = useState(ORDER_FILTER_ALL);
  const [progressFilter, setProgressFilter] = useState(ORDER_FILTER_ALL);
  const [dueDateFilterStart, setDueDateFilterStart] = useState(() => getMonthStart(new Date()));
  const [dueDateFilterEnd, setDueDateFilterEnd] = useState(() => getMonthEnd(new Date()));
  const [formData, setFormData] = useState(buildInitialFormData);
  const [ordersLoaded, setOrdersLoaded] = useState(false);
  const detailInitKeyRef = useRef(null);
  const hasTouchedDueDateFilterRef = useRef(false);
  const styleAddButtonRef = useRef(null);
  const colorInputRefs = useRef(new Map());
  const genderInputRefs = useRef(new Map());
  const sizeInputRefs = useRef(new Map());
  const handledOrderRefreshRef = useRef(0);
  const handledOrderStylesRefreshRef = useRef(0);
  const orderRefreshSignal = refreshSignals['/order'] || 0;
  const orderStylesRefreshSignal = refreshSignals['/order/styles'] || 0;
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
      showNotification(error?.message || '스타일 목록을 불러오지 못했습니다.', 'error');
    }
  }, [showNotification]);

  useEffect(() => {
    handledOrderStylesRefreshRef.current = orderStylesRefreshSignal;
    refreshStyles(activeOrgId);
  }, [activeOrgId, refreshStyles]);

  useEffect(() => {
    if (activePath !== currentOrderRoutePath) return;
    if (orderStylesRefreshSignal <= handledOrderStylesRefreshRef.current) return;
    handledOrderStylesRefreshRef.current = orderStylesRefreshSignal;
    refreshStyles(activeOrgId, { forceRefresh: true });
  }, [activePath, activeOrgId, currentOrderRoutePath, orderStylesRefreshSignal, refreshStyles]);

  useEffect(() => {
    let cancelled = false;

    const loadColors = async () => {
      try {
        const data = await fetchAttributes({ orgId: activeOrgId });
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
        showNotification(error?.message || '주문 목록을 불러오지 못했습니다.', 'error');
      }
    } finally {
      if (!cancelledRef?.current) {
        setOrdersLoaded(true);
      }
    }
  }, [activeOrgId, showNotification]);

  useEffect(() => {
    const cancelledRef = { current: false };
    handledOrderRefreshRef.current = orderRefreshSignal;
    loadOrdersFromDb({ cancelledRef });
    return () => {
      cancelledRef.current = true;
    };
  }, [activeOrgId, loadOrdersFromDb]);

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
    if (activePath !== '/order') return;
    if (orderRefreshSignal <= handledOrderRefreshRef.current) return;
    handledOrderRefreshRef.current = orderRefreshSignal;
    loadOrdersFromDb({ forceRefresh: true });
  }, [activePath, loadOrdersFromDb, orderRefreshSignal]);

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
        showNotification(error?.message || '주문 파트너 정보를 불러오지 못했습니다.', 'error');
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
  }, [activeOrgId, showNotification]);

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
      const draft = loadOrderDraft();
      if (draft) {
        setFormData(normalizeOrderForm(draft));
        showNotification('임시 저장한 주문을 불러왔습니다.', 'info');
      } else {
        setFormData(buildInitialFormData());
      }
      return;
    }

    const targetOrder = orders.find((order) => order.id === orderId);
    if (!targetOrder) {
      showNotification('주문 정보를 찾을 수 없습니다.', 'error');
      navigateToPath('/order', { label: '주문' });
      return;
    }
    setFormData(normalizeOrderForm(targetOrder));
  }, [isDetailMode, isNewOrder, orderId, orders, ordersLoaded, navigateToPath, showNotification]);

  useEffect(() => {
    if (!isDetailMode || !isNewOrder) return;
    saveOrderDraft(formData);
  }, [formData, isDetailMode, isNewOrder]);

  useEffect(() => {
    if (
      confirmationFilter === ORDER_CONFIRMATION_STATUS_KEYS.PLANNED &&
      progressFilter !== ORDER_PROGRESS_STAGE_NONE
    ) {
      setProgressFilter(ORDER_PROGRESS_STAGE_NONE);
    }
    if (
      confirmationFilter === ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED &&
      progressFilter === ORDER_PROGRESS_STAGE_NONE
    ) {
      setProgressFilter(ORDER_FILTER_ALL);
    }
  }, [confirmationFilter, progressFilter]);

  const filteredOrders = useMemo(() => {
    const lowerTerm = searchTerm.toLowerCase();
    return orders.filter((order) => {
      const normalizedConfirmation = normalizeOrderConfirmation(order.confirmationStatus);
      const matchesStatus =
        confirmationFilter === ORDER_FILTER_ALL
          ? true
          : normalizedConfirmation === normalizeOrderConfirmation(confirmationFilter);
      if (!matchesStatus) return false;

      const orderHasProgressStage = hasOrderProgressStage(order.confirmationStatus);
      const normalizedProgressStage = orderHasProgressStage
        ? normalizeOrderProgressStage(order.status)
        : '';
      const matchesProgress =
        progressFilter === ORDER_FILTER_ALL
          ? true
          : progressFilter === ORDER_PROGRESS_STAGE_NONE
            ? !orderHasProgressStage
          : orderHasProgressStage &&
            normalizedProgressStage === normalizeOrderProgressStage(progressFilter);
      if (!matchesProgress) return false;

      const dueDateKey = normalizeDateKey(order.dueDate);
      if (
        !dueDateKey ||
        dueDateKey < dueDateFilterStartKey ||
        dueDateKey > dueDateFilterEndKey
      ) {
        return false;
      }

      if (!searchTerm) return true;

      const orderNumber = order.orderNumber || '';
      const buyer = order.buyerOrgName || order.customerName || order.customer || '';
      const seller = order.sellerOrgName || '';
      const styleSummary = formatStyleSummary(order.items || []);
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
    confirmationFilter,
    dueDateFilterEndKey,
    dueDateFilterStartKey,
    orders,
    progressFilter,
    searchTerm,
  ]);

  const styleOptions = useMemo(
    () =>
      styles.map((style) => ({
        id: style.id,
        name: style.name || '',
        styleCode: style.styleCode || '',
        customer: style.customer || '',
      })),
    [styles]
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
        label: GENDER_OPTION_LABELS[code] || code,
      })),
    []
  );
  const genderOptionByCode = useMemo(
    () => new Map(genderSelectOptions.map((item) => [item.code, item])),
    [genderSelectOptions]
  );
  const getSelectedColorOption = (item) => {
    const colorId = toPositiveColorId(item?.colorId);
    if (colorId) {
      return colorOptionById.get(colorId) || null;
    }
    const colorCode = getItemColorCode(item);
    return colorOptionByCode.get(colorCode) || null;
  };
  const getSelectedGenderOption = (item) =>
    genderOptionByCode.get(normalizeGenderCode(item?.gender, 'M')) || null;
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

  const groupedStyleItems = useMemo(() => {
    const groupMap = new Map();

    formData.items.forEach((item, sourceIndex) => {
      const groupKey = getStyleGroupKey(item);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          styleId: item.styleId || '',
          styleName: item.styleName || '',
          styleCode: item.styleCode || '',
          rows: [],
        });
      }
      const targetGroup = groupMap.get(groupKey);
      if (!targetGroup.styleId && item.styleId) targetGroup.styleId = item.styleId;
      if (!targetGroup.styleName && item.styleName) targetGroup.styleName = item.styleName;
      if (!targetGroup.styleCode && item.styleCode) targetGroup.styleCode = item.styleCode;
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
      const rows = [...group.rows]
        .sort((a, b) => {
          const colorA = String(a.item?.colorName || a.item?.colorCode || '').toLowerCase();
          const colorB = String(b.item?.colorName || b.item?.colorCode || '').toLowerCase();
          const colorDiff = colorA.localeCompare(colorB);
          if (colorDiff !== 0) return colorDiff;
          const genderDiff = getGenderOrder(a.item.gender) - getGenderOrder(b.item.gender);
          if (genderDiff !== 0) return genderDiff;
          return a.sourceIndex - b.sourceIndex;
        })
        .map((row) => ({
          ...row,
          displayNo: nextDisplayNo++,
        }));

      return {
        ...group,
        rows,
        rowItemIds: rows.map((row) => row.item.id),
      };
    });
  }, [formData.items]);
  const currentDetailOrder = useMemo(() => {
    if (isNewOrder) return null;
    return orders.find((order) => order.id === orderId) || null;
  }, [isNewOrder, orderId, orders]);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [pendingConfirmationStatus, setPendingConfirmationStatus] = useState('');
  useEffect(() => {
    if (!isDetailMode || isNewOrder || !currentDetailOrder?.id) return;
    navigateToPath(`/order/${currentDetailOrder.id}`, {
      label: buildOrderTabLabel(currentDetailOrder),
    });
  }, [
    currentDetailOrder?.id,
    currentDetailOrder?.orderNumber,
    isDetailMode,
    isNewOrder,
    navigateToPath,
  ]);
  const hasFormChanges = useMemo(() => {
    if (isNewOrder) return true;
    if (!currentDetailOrder) return false;

    const baselineSnapshot = toComparableOrderSnapshot(
      normalizeOrderForm(currentDetailOrder),
      fixedSellerOrg
    );
    const currentSnapshot = toComparableOrderSnapshot(formData, fixedSellerOrg);
    return toStableJsonText(currentSnapshot) !== toStableJsonText(baselineSnapshot);
  }, [currentDetailOrder, fixedSellerOrg, formData, isNewOrder]);
  const hasChangesForForm = (candidateFormData) => {
    if (isNewOrder) return true;
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
  const displayedConfirmationStatus =
    pendingConfirmationStatus ||
    normalizeOrderConfirmation(formData.confirmationStatus) ||
    ORDER_CONFIRMATION_STATUSES[0];
  const handleAdd = () => {
    navigateToPath('/order/new', { label: '신규 주문' });
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
      label: buildOrderTabLabel(order),
    });
  };

  const handleDeleteOrder = async (order) => {
    if (!order?.id) return;
    if (order?.isModificationLocked) {
      showNotification(ORDER_MODIFICATION_LOCK_MESSAGE, 'warning');
      return;
    }
    if (!isOrderDeletable(order.confirmationStatus)) {
      showNotification(
        getOrderConfirmationDeleteOnlyMessage(ORDER_CONFIRMATION_STATUS_KEYS.PLANNED),
        'warning'
      );
      return;
    }

    const orderLabel = order.orderNumber ? `주문 ${order.orderNumber}` : '해당 주문';
    if (!window.confirm(`${orderLabel}을(를) 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteOrderToApi(order.id, { orgId: activeOrgId });
      setOrders((prev) => prev.filter((target) => target.id !== order.id));
      showNotification('주문이 삭제되었습니다.', 'success');
    } catch (error) {
      showNotification(error?.message || '주문 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const closeDetailAndGoList = () => {
    if (isNewOrder) {
      navigateToPath('/order', { label: '주문', closeTabId: '/order/new' });
      return;
    }
    if (orderId) {
      navigateToPath('/order', {
        label: '주문',
        closeTabId: `/order/${orderId}`,
      });
      return;
    }
    navigateToPath('/order', { label: '주문' });
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
          gender: 'M',
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

  const handleAddItem = () => {
    setFormData((prev) => ({ ...prev, items: [...prev.items, createOrderItem()] }));
  };

  const handleRemoveItem = (itemId) => {
    setFormData((prev) => {
      const nextItems = prev.items.filter((item) => item.id !== itemId);
      return { ...prev, items: nextItems.length ? nextItems : [createOrderItem()] };
    });
  };

  const focusColorInput = (itemId) => {
    focusInputElementInMap(colorInputRefs, itemId);
  };
  const focusGenderInput = (itemId) => {
    focusInputElementInMap(genderInputRefs, itemId);
  };
  const focusFirstSizeInput = (itemId) => {
    focusInputElementInMap(sizeInputRefs, `${itemId}::${SIZE_COLUMNS[0] || ''}`);
  };
  const isTabAutocompleteSelection = (event, reason) =>
    event?.key === 'Tab' && reason === 'selectOption';

  const handleStyleChange = (itemIdOrIds, style, options = {}) => {
    if (!selectedBuyerName) {
      showNotification(orderPartyText.selectBuyerFirst, 'warning');
      return;
    }

    const targetIds = Array.isArray(itemIdOrIds) ? itemIdOrIds : [itemIdOrIds];
    const targetIdSet = new Set(targetIds.filter(Boolean));
    if (!targetIdSet.size) return;

    const nextStyleId = style?.id || '';
    const nextStyleName = style?.name || '';
    const nextStyleCode = style?.styleCode || '';
    const nextStyleIdentity = nextStyleId || nextStyleName || nextStyleCode;

    const previewItems = formData.items.map((item) =>
      targetIdSet.has(item.id)
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
              gender: styleChanged ? 'M' : normalizeGenderCode(item.gender, 'M'),
              sizeQuantities: styleChanged
                ? createSizeQuantities()
                : normalizeSizeQuantities(item.sizeQuantities),
            };
          })()
        : item
    );

    if (hasDuplicateStyleColorGender(previewItems)) {
      showNotification('같은 스타일/색상/성별 조합은 중복 선택할 수 없습니다.', 'warning');
      return;
    }

    setFormData((prev) => ({
      ...prev,
      items: previewItems,
    }));
    if (options.focusNext && options.focusItemId) {
      focusColorInput(options.focusItemId);
    }
  };

  const applyColorSelection = (itemId, selectedColor, options = {}) => {
    const nextColorId = toPositiveColorId(selectedColor?.id);
    const nextColorCode = normalizeColorCode(selectedColor?.code);
    const nextColorName = String(
      selectedColor?.displayName || selectedColor?.name || selectedColor?.code || ''
    ).trim();
    const previewItems = formData.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            colorId: nextColorId,
            colorCode: nextColorCode,
            colorName: nextColorName,
          }
        : item
    );
    if (hasDuplicateStyleColorGender(previewItems)) {
      showNotification('같은 스타일/색상/성별 조합은 중복 선택할 수 없습니다.', 'warning');
      return false;
    }
    setFormData((prev) => ({
      ...prev,
      items: previewItems,
    }));
    if (options.focusNext) {
      focusGenderInput(itemId);
    }
    return true;
  };

  const handleCreateColorOption = async (itemId, rawName, options = {}) => {
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
      applyColorSelection(itemId, existingColor, options);
      return;
    }

    if (creatingColorItemId) {
      return;
    }

    setCreatingColorItemId(itemId);
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
      const applied = applyColorSelection(itemId, normalizedCreatedColor, options);
      if (applied) {
        showNotification('새 색상을 추가했습니다.', 'success');
      }
    } catch (error) {
      showNotification(error?.message || '색상 추가 중 오류가 발생했습니다.', 'error');
    } finally {
      setCreatingColorItemId('');
    }
  };

  const handleColorChange = async (itemId, value, options = {}) => {
    if (!value) {
      applyColorSelection(itemId, null, options);
      return;
    }
    if (typeof value === 'string') {
      await handleCreateColorOption(itemId, value, options);
      return;
    }
    if (value?.isCreateOption) {
      await handleCreateColorOption(
        itemId,
        value.inputValue || value.name || '',
        options
      );
      return;
    }
    applyColorSelection(itemId, value, options);
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
      showNotification('같은 스타일/색상/성별 조합은 중복 선택할 수 없습니다.', 'warning');
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
      focusFirstSizeInput(itemId);
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
  const handleLastSizeInputKeyDown = (event) => {
    if (event.key !== 'Tab' || event.shiftKey) return;
    if (!styleAddButtonRef.current) return;
    event.preventDefault();
    styleAddButtonRef.current.focus();
  };

  const getItemTotal = (item) => sumSizeQuantities(item?.sizeQuantities);

  const getOrderTotal = () =>
    formData.items.reduce((sum, item) => sum + getItemTotal(item), 0);

  const handleOpenStyleRegistration = () => {
    saveOrderDraft(formData);
    navigateToPath('/style/new', { label: '신규 스타일' });
  };

  const handleClearDraft = () => {
    clearOrderDraft();
    setFormData(buildInitialFormData());
    showNotification('임시 저장본을 삭제했습니다.', 'info');
    if (isDetailMode) {
      closeDetailAndGoList();
    }
  };

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
      return '주문번호를 입력해 주세요.';
    }
    if (!formData.buyerOrgName || !toOrgId(formData.buyerOrgId)) {
      return '발주자를 선택해 주세요.';
    }
    if (!resolvedSellerOrgName || !resolvedSellerOrgId) {
      return '수주자를 선택해 주세요.';
    }
    if (!hasRelationshipPair(relationshipPairs, formData.buyerOrgId, resolvedSellerOrgId)) {
      return '연결된 관계의 발주자/수주자 조합만 선택할 수 있습니다.';
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
      return '같은 고객사에는 동일한 주문번호를 사용할 수 없습니다.';
    }
    if (!formData.dueDate) {
      return '납기일을 입력해 주세요.';
    }
    if (!formData.items.length) {
      return '스타일을 추가해 주세요.';
    }
    for (const item of formData.items) {
      if (!item.styleId) {
        return '모든 스타일을 선택해 주세요.';
      }
      if (!getItemColorCode(item)) {
        return '모든 스타일에 색상을 선택해 주세요.';
      }
      if (!GENDER_OPTIONS.includes(item.gender)) {
        return '모든 스타일의 성별 코드(M/W/U)를 선택해 주세요.';
      }
      const totalQuantity = sumSizeQuantities(item.sizeQuantities);
      if (totalQuantity <= 0) {
        return '스타일별 사이즈 수량을 입력해 주세요.';
      }
    }
    if (hasDuplicateStyleColorGender(formData.items)) {
      return '같은 스타일/색상/성별 조합은 한 번만 입력할 수 있습니다.';
    }
    return null;
  };

  const handleSave = async () => {
    if (isCurrentOrderModificationLocked) {
      showNotification(ORDER_MODIFICATION_LOCK_MESSAGE, 'warning');
      return;
    }
    if (!isNewOrder && !hasFormChanges) {
      showNotification('변경된 내용이 없습니다.', 'info');
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
      const legacyQuantities = SIZE_COLUMNS
        .filter((size) => numericSizeQuantities[size] > 0)
        .map((size) => ({
          id: createId('qty'),
          colorId: safeColorId ?? safeColorCode,
          colorCode: safeColorCode,
          colorName: safeColorName,
          gender: item.gender,
          sizeId: size,
          quantity: numericSizeQuantities[size],
        }));
      return {
        ...item,
        colorId: safeColorId,
        colorCode: safeColorCode,
        colorName: safeColorName,
        gender: GENDER_OPTIONS.includes(item.gender) ? item.gender : 'M',
        sizeQuantities: numericSizeQuantities,
        quantities: legacyQuantities,
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
      confirmationStatus: formData.confirmationStatus,
      status: hasOrderProgressStage(formData.confirmationStatus)
        ? normalizeOrderProgressStage(formData.status) || ORDER_PROGRESS_STAGE_DEFAULT
        : undefined,
      items: sanitizedItems,
      totalQuantity,
      updatedAt: new Date().toISOString(),
    };

    try {
      if (!isNewOrder) {
        const existingOrder = orders.find((order) => order.id === orderId);
        if (!existingOrder) {
          showNotification('수정할 주문 정보를 찾을 수 없습니다.', 'error');
          return;
        }
        payload.id = existingOrder.id;
        payload.createdAt = existingOrder.createdAt || payload.updatedAt;
        const updated = await updateOrderToApi(existingOrder.id, payload, { orgId: activeOrgId });
        setOrders((prev) =>
          prev.map((order) => (order.id === existingOrder.id ? updated : order))
        );

        // 수량 변경 감지 → 기존 배정 취소 후 미배정 카드 재생성
        const oldVariantMap = buildOrderVariantMapForBoard({
          orderId: existingOrder.id,
          items: existingOrder.items || [],
        });
        const nextVariantMap = buildOrderVariantMapForBoard({
          orderId: existingOrder.id,
          items: sanitizedItems,
        });
        const changedVariantIds = Array.from(
          new Set([...oldVariantMap.keys(), ...nextVariantMap.keys()])
        ).filter((originId) => {
          const oldQty = Number(oldVariantMap.get(originId)?.quantity) || 0;
          const nextQty = Number(nextVariantMap.get(originId)?.quantity) || 0;
          return oldQty !== nextQty;
        });

        if (changedVariantIds.length > 0) {
          try {
            const boardQuery = buildQueryString({ orgId: activeOrgId });
            const boardState = await requestJSON('/assignment-board-view' + boardQuery).catch(
              () => ({ cards: [], assignments: [] })
            );
            const currentCards = Array.isArray(boardState?.cards) ? boardState.cards : [];
            const currentAssignments = Array.isArray(boardState?.assignments)
              ? boardState.assignments
              : [];
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
                `\uACC4\uC57D \uC218\uB7C9 \uBCC0\uACBD\uC73C\uB85C \uAE30\uC874 \uBC30\uC815 ${nextBoardState.cancelledAssignmentCount}\uAC74\uC774 \uCDE8\uC18C\uB418\uC5B4 \uBBF8\uBC30\uC815 \uCE74\uB4DC\uB85C \uC804\uD658\uB418\uC5C8\uC2B5\uB2C8\uB2E4.`,
                'info'
              );
            }
          } catch (_boardUpdateErr) {
            // Keep order save successful even if board sync fails.
          }
        }
      } else {
        payload.id = createId('order');
        payload.createdAt = payload.updatedAt;
        const created = await createOrderToApi(payload, { orgId: activeOrgId });
        setOrders((prev) => [created, ...prev]);
      }

      clearOrderDraft();
      markPathForRefresh('/order');
      showNotification('주문 정보가 저장되었습니다.', 'success');
      closeDetailAndGoList();
    } catch (error) {
      showNotification(resolveOrderSaveErrorMessage(error), 'error');
    }
  };

  if (!isDetailMode) {
    return (
      <AppPageContainer
        header={
          <PageSectionHeader
            title="주문"
            actionLabel="주문 추가"
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
            <InputLabel id="order-confirmation-filter-label">
              {ORDER_CONFIRMATION_TEXT.fieldLabel}
            </InputLabel>
            <Select
              labelId="order-confirmation-filter-label"
              value={confirmationFilter}
              label={ORDER_CONFIRMATION_TEXT.fieldLabel}
              onChange={(event) => setConfirmationFilter(event.target.value)}
            >
              {ORDER_CONFIRMATION_FILTER_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ width: { xs: '100%', sm: 180 }, flexShrink: 0 }}>
            <InputLabel id="order-progress-filter-label">{ORDER_STATUS_TEXT.fieldLabel}</InputLabel>
            <Select
              labelId="order-progress-filter-label"
              value={progressFilter}
              label={ORDER_STATUS_TEXT.fieldLabel}
              onChange={(event) => setProgressFilter(event.target.value)}
            >
              {ORDER_PROGRESS_FILTER_OPTIONS.map((option) => (
                <MenuItem
                  key={option.value}
                  value={option.value}
                  disabled={
                    (confirmationFilter === ORDER_CONFIRMATION_STATUS_KEYS.PLANNED &&
                      option.value !== ORDER_FILTER_ALL &&
                      option.value !== ORDER_PROGRESS_STAGE_NONE) ||
                    (confirmationFilter === ORDER_CONFIRMATION_STATUS_KEYS.CONFIRMED &&
                      option.value === ORDER_PROGRESS_STAGE_NONE)
                  }
                >
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
              <IconButton
                size="small"
                onClick={() => shiftDueDateFilterMonth(-1)}
                title="이전 달"
              >
                <ChevronLeftIcon sx={{ fontSize: 18 }} />
              </IconButton>
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
              <IconButton
                size="small"
                onClick={() => shiftDueDateFilterMonth(1)}
                title="다음 달"
              >
                <ChevronRightIcon sx={{ fontSize: 18 }} />
              </IconButton>
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
                  <TableCell
                    sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.confirmation }}
                  >
                    {ORDER_CONFIRMATION_TEXT.fieldLabel}
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.progress }}>
                    {ORDER_STATUS_TEXT.fieldLabel}
                  </TableCell>
                  <TableCell
                    sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.orderNumber }}
                  >
                    주문번호
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.buyer, fontSize: 0 }}>
                    <Box component="span" sx={{ fontSize: '0.875rem' }}>
                      {orderPartyText.buyerWithType}
                    </Box>
                    발주자(브랜드)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.seller, fontSize: 0 }}>
                    <Box component="span" sx={{ fontSize: '0.875rem' }}>
                      {orderPartyText.sellerWithType}
                    </Box>
                    수주자(제조사)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.style }}>
                    스타일
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      width: ORDER_LIST_COLUMN_WIDTHS.totalQuantity,
                      textAlign: 'right',
                    }}
                  >
                    합계 수량
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.dueDate }}>
                    납기일
                  </TableCell>
                  <TableCell
                    sx={{
                      fontWeight: 'bold',
                      width: ORDER_LIST_COLUMN_WIDTHS.actions,
                      textAlign: 'center',
                    }}
                  >
                    관리
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!ordersLoaded ? (
                  <TableStatusRow colSpan={9} message="주문 목록을 불러오는 중입니다." />
                ) : filteredOrders.length === 0 ? (
                  <TableStatusRow colSpan={9} message="조건에 맞는 주문이 없습니다." />
                ) : (
                  filteredOrders.map((order) => {
                    const deletable =
                      !order?.isModificationLocked && isOrderDeletable(order.confirmationStatus);
                    const progressStageLabel = hasOrderProgressStage(order.confirmationStatus)
                      ? getOrderProgressStageLabel(order.status)
                      : ORDER_STATUS_TEXT.noneLabel;
                    return (
                      <TableRow
                        key={order.id}
                        hover
                        onDoubleClick={() => handleEdit(order)}
                        sx={{ cursor: 'pointer' }}
                      >
                        <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>
                          {getOrderConfirmationLabel(order.confirmationStatus)}
                        </TableCell>
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
                          {formatStyleSummary(order.items)}
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
                          <IconButton
                            size="small"
                            color="error"
                            disabled={!deletable}
                            title={
                              deletable
                                ? '주문 삭제'
                                : getOrderConfirmationDeleteTooltip(
                                    ORDER_CONFIRMATION_STATUS_KEYS.PLANNED
                                  )
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDeleteOrder(order);
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
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
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6">{isNewOrder ? '신규 주문 등록' : '주문 정보 수정'}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {ORDER_MODIFICATION_LOCK_NOTICE}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          {isNewOrder && (
            <Button onClick={handleClearDraft} color="inherit">
              임시 저장 삭제
            </Button>
          )}
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!isNewOrder && (!hasFormChanges || isCurrentOrderModificationLocked)}
          >
            저장
          </Button>
        </Stack>
      </Box>

      {!loadingParties && (buyerOptions.length === 0 || sellerOptions.length === 0) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          연결된 주문 파트너가 없습니다. 고객 관계를 먼저 등록해 주세요.
        </Alert>
      )}

      {isCurrentOrderModificationLocked && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {ORDER_MODIFICATION_LOCK_MESSAGE}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Box
          component="fieldset"
          disabled={isCurrentOrderModificationLocked}
          sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}
        >
          <Box
            sx={{
              mt: 1,
              display: 'grid',
              gap: 2,
              gridTemplateColumns: {
                xs: '1fr',
                md: 'repeat(2, minmax(0, 1fr))',
                lg: 'minmax(180px, 1fr) minmax(240px, 1.2fr) minmax(240px, 1.2fr) minmax(180px, 0.9fr)',
              },
              alignItems: 'start',
            }}
          >
            <TextField
              name="orderNumber"
              label="주문번호"
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
                    label="발주자(Brand)"
                    placeholder={loadingParties ? '불러오는 중...' : '발주자를 선택해 주세요'}
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
                    label="수주자(Manufacturer)"
                    placeholder={loadingParties ? '불러오는 중...' : '수주자를 선택해 주세요'}
                    fullWidth
                  />
                )}
              />
            </Box>
            <TextField
              name="dueDate"
              label="납기일"
              type="date"
              value={formData.dueDate}
              onChange={handleInputChange}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Box>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              스타일 구성
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                onClick={handleOpenStyleRegistration}
              >
                스타일 등록
              </Button>
              <Button
                ref={styleAddButtonRef}
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddItem}
              >
                스타일 추가
              </Button>
            </Stack>
          </Box>

          <Paper variant="outlined" sx={{ mb: 2 }}>
            <TableContainer sx={{ width: '100%', overflowX: 'hidden' }}>
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
                  <TableCell sx={{ fontWeight: 'bold', width: '20%' }}>스타일명/코드 선택</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '9%' }}>스타일 코드</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '10%' }}>색상</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '7%' }}>성별</TableCell>
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
                      {size}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 'bold', width: '8%', textAlign: 'right' }}>합계</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: '4%', textAlign: 'center' }}>삭제</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupedStyleItems.map((group) =>
                  group.rows.map(({ item, displayNo }, rowIndex) => {
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
                    const genderStyle = getGenderPastelStyle(item.gender);
                    const isFirstRow = rowIndex === 0;
                    const rowStyleIdentity = getStyleIdentity(item);
                    const rowColorCode = getItemColorCode(item);
                    const selectedColorOption = getSelectedColorOption(item);
                    const selectedGenderOption = getSelectedGenderOption(item);
                    const disabledGenderSet = new Set(
                      formData.items
                        .filter(
                          (other) =>
                            other.id !== item.id &&
                            getStyleIdentity(other) === rowStyleIdentity &&
                            getItemColorCode(other) === rowColorCode
                        )
                        .map((other) => normalizeGenderCode(other.gender, ''))
                        .filter(Boolean)
                    );

                    return (
                      <TableRow
                        key={item.id}
                        sx={{
                          '& > td': {
                            backgroundColor: genderStyle.background,
                            borderBottomColor: genderStyle.border,
                          },
                          '& > td:first-of-type': {
                            borderLeft: `4px solid ${genderStyle.accent}`,
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
                              backgroundColor: '#f8fafc !important',
                            }}
                          >
                            <SearchableSelect
                              options={availableStyleOptions}
                              value={groupStyleOption}
                              disabled={!selectedBuyerName}
                              onChange={(event, newValue, reason) =>
                                handleStyleChange(group.rowItemIds, newValue, {
                                  focusNext: isTabAutocompleteSelection(event, reason),
                                  focusItemId: group.rows[0]?.item?.id || '',
                                })
                              }
                              getOptionLabel={(option) => option?.name || ''}
                              isOptionEqualToValue={(option, value) => option?.id === value?.id}
                              autoHighlight
                              textFieldProps={{
                                size: 'small',
                                placeholder: '스타일명 검색',
                              }}
                              noOptionsText={
                                selectedBuyerName
                                  ? '등록된 스타일이 없습니다.'
                                  : '발주자를 먼저 선택해 주세요.'
                              }
                            />
                          </TableCell>
                        )}
                        {isFirstRow && (
                          <TableCell
                            rowSpan={group.rows.length}
                            sx={{
                              verticalAlign: 'top',
                              pt: 1,
                              backgroundColor: '#f8fafc !important',
                            }}
                          >
                            <TextField
                              size="small"
                              label={group.styleCode ? '스타일 코드 (자동입력)' : '스타일 코드'}
                              className={group.styleCode ? 'auto-selected-field' : undefined}
                              value={group.styleCode || ''}
                              fullWidth
                              InputProps={{ readOnly: true }}
                              disabled
                              placeholder="자동 입력"
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <SearchableSelect
                              options={normalizedColorOptions}
                              value={selectedColorOption}
                              disabled={!rowStyleIdentity || creatingColorItemId === item.id}
                              loading={creatingColorItemId === item.id}
                              onChange={(event, newValue, reason) => {
                                void handleColorChange(item.id, newValue, {
                                  focusNext: isTabAutocompleteSelection(event, reason),
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
                                    ? `새 색상 추가: ${option.inputValue || option.name || ''}`
                                    : option?.displayName || option?.name || option?.code || ''}
                                </li>
                              )}
                              autoHighlight
                              selectOnFocus
                              clearOnBlur
                              handleHomeEndKeys
                              noOptionsText={
                                canCreateColorAttribute
                                  ? '입력한 이름으로 새 색상을 추가할 수 있습니다.'
                                  : '등록된 색상을 찾을 수 없습니다.'
                              }
                              textFieldProps={{
                                size: 'small',
                                placeholder: canCreateColorAttribute
                                  ? '색상 검색 또는 추가'
                                  : '색상 검색',
                                inputRef: (node) =>
                                  setInputElementInMap(colorInputRefs, item.id, node),
                              }}
                            />
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <SearchableSelect
                              options={genderSelectOptions}
                              value={selectedGenderOption}
                              onChange={(event, newValue, reason) =>
                                handleGenderChange(item.id, newValue, {
                                  focusNext: isTabAutocompleteSelection(event, reason),
                                })
                              }
                              getOptionLabel={(option) => option?.label || option?.code || ''}
                              isOptionEqualToValue={(option, value) => option?.code === value?.code}
                              getOptionDisabled={(option) =>
                                Boolean(rowStyleIdentity) && disabledGenderSet.has(option?.code)
                              }
                              autoHighlight
                              disabled={!rowStyleIdentity || !rowColorCode}
                              noOptionsText="선택 가능한 성별이 없습니다."
                              textFieldProps={{
                                size: 'small',
                                placeholder: '성별 선택',
                                inputRef: (node) =>
                                  setInputElementInMap(genderInputRefs, item.id, node),
                              }}
                            />
                          </FormControl>
                        </TableCell>
                        {SIZE_COLUMNS.map((size) => (
                          <TableCell key={`${item.id}-${size}`} sx={{ textAlign: 'center', px: 0.25 }}>
                            <TextField
                              value={normalizedSizeQuantities[size]}
                              onChange={(event) => handleSizeQuantityChange(item.id, size, event.target.value)}
                              onKeyDown={size === LAST_SIZE_COLUMN ? handleLastSizeInputKeyDown : undefined}
                              inputRef={(node) =>
                                setInputElementInMap(sizeInputRefs, `${item.id}::${size}`, node)
                              }
                              size="small"
                              type="text"
                              placeholder="0"
                              sx={{
                                minWidth: 0,
                                '& .MuiInputBase-input': {
                                  textAlign: 'right',
                                  px: 0.75,
                                  py: 0.625,
                                  fontSize: 12,
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
                        ))}
                        <TableCell sx={{ textAlign: 'right', fontWeight: 600 }}>{itemTotal}</TableCell>
                        <TableCell sx={{ textAlign: 'center' }}>
                          <IconButton size="small" onClick={() => handleRemoveItem(item.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            주문 합계 수량: {getOrderTotal().toLocaleString()}
          </Typography>
        </Box>
        </Box>
      </Paper>
    </AppPageContainer>
  );
};

export default OrderList;
