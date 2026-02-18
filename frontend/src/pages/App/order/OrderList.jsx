import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Grid,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import {
  loadOrderDraft,
  saveOrderDraft,
  clearOrderDraft,
} from '../../../utils/localData';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import { fetchAttributes } from '../../../utils/attributeApi';
import {
  SIZE_CODES,
  GENDER_CODES,
  normalizeGenderCode,
} from '../../../constants/productAttributes';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import {
  fetchOrders as fetchOrdersFromApi,
  createOrder as createOrderToApi,
  updateOrder as updateOrderToApi,
  deleteOrder as deleteOrderToApi,
} from '../../../utils/orderApi';

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORDER_STATUSES = ['주문접수', '작업중', '생산완료', '출고완료'];
const ORDER_FILTER_ALL = 'ALL';
const GENDER_OPTIONS = GENDER_CODES;
const SIZE_COLUMNS = SIZE_CODES;
const LAST_SIZE_COLUMN = SIZE_COLUMNS[SIZE_COLUMNS.length - 1] || '';
const ORDER_DETAIL_SIZE_COLUMN_WIDTH = `${(38 / SIZE_COLUMNS.length).toFixed(3)}%`;
const ORDER_LIST_COLUMN_WIDTHS = {
  orderNumber: '12%',
  buyer: '18%',
  seller: '18%',
  style: '20%',
  totalQuantity: '10%',
  dueDate: '10%',
  status: '8%',
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
const normalizeOrderStatus = (status) => (status || '').replace(/\s+/g, '').trim();

const isOrderDeletable = (status) => normalizeOrderStatus(status) === '주문접수';
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
const getStyleColorGenderKey = (styleIdentity, colorCode, gender) => {
  const normalizedGender = normalizeGenderCode(gender, '');
  const normalizedColorCode = normalizeColorCode(colorCode);
  if (!styleIdentity || !normalizedColorCode || !normalizedGender) return '';
  return `${styleIdentity}::${normalizedColorCode}::${normalizedGender}`;
};
const getItemColorCode = (item) =>
  normalizeColorCode(item?.colorCode || item?.colorId || item?.color || '');
const hasDuplicateStyleColorGender = (items = []) => {
  const seen = new Set();
  for (const item of items) {
    const key = getStyleColorGenderKey(
      getStyleIdentity(item),
      getItemColorCode(item),
      item?.gender
    );
    if (!key) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
};
const normalizeTextKey = (value) => String(value || '').trim().toLowerCase();
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
  status: ORDER_STATUSES[0],
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
    status: order.status || base.status,
  };
};

const getStyleDisplayNames = (items = []) =>
  items.map((item) => item.styleName || item.styleCode || '').filter(Boolean);

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
  const { showNotification, navigateToPath } = useApp();
  const { activeOrgId } = useAuth();

  const [orders, setOrders] = useState([]);
  const [styles, setStyles] = useState([]);
  const [colorOptions, setColorOptions] = useState([]);
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [sellerOptions, setSellerOptions] = useState([]);
  const [relationshipPairs, setRelationshipPairs] = useState([]);
  const [currentOrgOption, setCurrentOrgOption] = useState(null);
  const [partyRoleHint, setPartyRoleHint] = useState('');
  const [loadingParties, setLoadingParties] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(ORDER_FILTER_ALL);
  const [formData, setFormData] = useState(buildInitialFormData);
  const detailInitKeyRef = useRef(null);
  const styleAddButtonRef = useRef(null);
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

  const refreshStyles = async (orgId = null) => {
    try {
      const items = await fetchStylesFromApi({ orgId });
      setStyles(items);
    } catch (error) {
      setStyles([]);
      showNotification(error?.message || '스타일 목록을 불러오지 못했습니다.', 'error');
    }
  };

  useEffect(() => {
    refreshStyles(activeOrgId);
  }, [activeOrgId]);

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
  }, [activeOrgId]);

  useEffect(() => {
    let cancelled = false;

    const loadOrdersFromDb = async () => {
      try {
        const items = await fetchOrdersFromApi({ orgId: activeOrgId });
        if (!cancelled) {
          setOrders(Array.isArray(items) ? items : []);
        }
      } catch (error) {
        if (!cancelled) {
          setOrders([]);
          showNotification(error?.message || '주문 목록을 불러오지 못했습니다.', 'error');
        }
      }
    };

    loadOrdersFromDb();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, showNotification]);

  useEffect(() => {
    const fetchOrderParties = async () => {
      setLoadingParties(true);
      try {
        const query = buildQueryString({ orgId: activeOrgId });
        const data = await requestJSON('/order-parties' + query);
        setBuyerOptions(Array.isArray(data?.buyerOrgOptions) ? data.buyerOrgOptions : []);
        setSellerOptions(Array.isArray(data?.sellerOrgOptions) ? data.sellerOrgOptions : []);
        setRelationshipPairs(
          Array.isArray(data?.relationshipPairs) ? data.relationshipPairs : []
        );
        setCurrentOrgOption(data?.currentOrg || null);
        setPartyRoleHint(data?.roleHint || '');
      } catch (error) {
        setBuyerOptions([]);
        setSellerOptions([]);
        setRelationshipPairs([]);
        setCurrentOrgOption(null);
        setPartyRoleHint('');
        showNotification(error?.message || '주문 파트너 정보를 불러오지 못했습니다.', 'error');
      } finally {
        setLoadingParties(false);
      }
    };

    fetchOrderParties();
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
  }, [isDetailMode, isNewOrder, orderId, orders, navigateToPath, showNotification]);

  useEffect(() => {
    if (!isDetailMode || !isNewOrder) return;
    saveOrderDraft(formData);
  }, [formData, isDetailMode, isNewOrder]);

  const filteredOrders = useMemo(() => {
    const lowerTerm = searchTerm.toLowerCase();
    return orders.filter((order) => {
      const matchesStatus =
        statusFilter === ORDER_FILTER_ALL ||
        normalizeOrderStatus(order.status) === normalizeOrderStatus(statusFilter);
      if (!matchesStatus) return false;

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
  }, [orders, searchTerm, statusFilter]);

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
        .map((item) => ({
          id: item?.id ?? null,
          code: normalizeColorCode(item?.code),
          name: String(item?.name || item?.code || '').trim(),
        }))
        .filter((item) => item.code),
    [colorOptions]
  );
  const colorOptionByCode = useMemo(
    () =>
      new Map(
        normalizedColorOptions.map((item) => [
          item.code,
          { id: item.id, code: item.code, name: item.name },
        ])
      ),
    [normalizedColorOptions]
  );

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
      const styleA = String(a.styleName || a.styleCode || a.styleId || '').toLowerCase();
      const styleB = String(b.styleName || b.styleCode || b.styleId || '').toLowerCase();
      const styleDiff = styleA.localeCompare(styleB);
      if (styleDiff !== 0) return styleDiff;
      return String(a.key).localeCompare(String(b.key));
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

  const handleAdd = () => {
    navigateToPath('/order/new', { label: '신규 주문' });
  };

  const handleEdit = (order) => {
    if (!order?.id) return;
    navigateToPath(`/order/${order.id}`, {
      label: `주문 ${order.orderNumber || order.id}`,
    });
  };

  const handleDeleteOrder = async (order) => {
    if (!order?.id) return;
    if (!isOrderDeletable(order.status)) {
      showNotification('주문접수 상태의 주문만 삭제할 수 있습니다.', 'warning');
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

  const handleCloseDetail = () => {
    closeDetailAndGoList();
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

  const handleStyleChange = (itemIdOrIds, style) => {
    if (!selectedBuyerName) {
      showNotification('발주자를 먼저 선택해 주세요.', 'warning');
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
  };

  const handleColorChange = (itemId, value) => {
    const nextColorCode = normalizeColorCode(value);
    const selectedColor = colorOptionByCode.get(nextColorCode) || null;
    const previewItems = formData.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            colorId: selectedColor?.id ?? null,
            colorCode: nextColorCode,
            colorName: selectedColor?.name || '',
          }
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
  };

  const handleGenderChange = (itemId, value) => {
    if (!GENDER_OPTIONS.includes(value)) return;
    const previewItems = formData.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            gender: value,
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
              gender: value,
            }
          : item
      ),
    }));
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
      } else {
        payload.id = createId('order');
        payload.createdAt = payload.updatedAt;
        const created = await createOrderToApi(payload, { orgId: activeOrgId });
        setOrders((prev) => [created, ...prev]);
      }

      clearOrderDraft();
      showNotification('주문 정보가 저장되었습니다.', 'success');
      closeDetailAndGoList();
    } catch (error) {
      showNotification(resolveOrderSaveErrorMessage(error), 'error');
    }
  };

  if (!isDetailMode) {
    return (
      <AppPageContainer>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', md: 'center' },
            flexDirection: { xs: 'column', md: 'row' },
            gap: 1.5,
            mb: 2,
          }}
        >
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ alignItems: { xs: 'stretch', sm: 'center' }, flex: 1, minWidth: 0 }}
          >
            <SearchInput
              placeholder="주문번호, 발주자, 수주자, 스타일 검색.."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{
                width: { xs: '100%', sm: 'auto' },
                minWidth: { sm: 320 },
                maxWidth: { lg: 640 },
                flex: 1,
              }}
            />
            <FormControl size="small" sx={{ width: { xs: '100%', sm: 160 }, flexShrink: 0 }}>
              <InputLabel id="order-status-filter-label">상태</InputLabel>
              <Select
                labelId="order-status-filter-label"
                value={statusFilter}
                label="상태"
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <MenuItem value={ORDER_FILTER_ALL}>전체 상태</MenuItem>
                {ORDER_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            sx={{ minWidth: 144, alignSelf: { xs: 'stretch', md: 'auto' }, flexShrink: 0 }}
          >
            주문 추가
          </Button>
        </Box>
        <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden' }}>
          <TableContainer sx={{ width: '100%', overflowX: 'auto' }}>
            <Table stickyHeader size="small" sx={{ tableLayout: 'fixed', minWidth: 980 }}>
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell
                    sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.orderNumber }}
                  >
                    주문번호
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.buyer }}>
                    발주자(브랜드)
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.seller }}>
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
                  <TableCell sx={{ fontWeight: 'bold', width: ORDER_LIST_COLUMN_WIDTHS.status }}>
                    상태
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
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                      등록된 주문이 없습니다.
                    </TableCell>
                  </TableRow>
                )}
                {filteredOrders.map((order) => {
                  const deletable = isOrderDeletable(order.status);
                  return (
                    <TableRow
                      key={order.id}
                      hover
                      onDoubleClick={() => handleEdit(order)}
                      sx={{ cursor: 'pointer' }}
                    >
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
                      <TableCell sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {order.totalQuantity ?? '-'}
                      </TableCell>
                      <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>{order.dueDate || '-'}</TableCell>
                      <TableCell sx={ORDER_LIST_TEXT_ELLIPSIS_SX}>{order.status || '-'}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={!deletable}
                          title={deletable ? '주문 삭제' : '주문접수 상태에서만 삭제 가능합니다.'}
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
                })}
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
        <Typography variant="h6">{isNewOrder ? '신규 주문 등록' : '주문 정보 수정'}</Typography>
        <Stack direction="row" spacing={1}>
          {isNewOrder && (
            <Button onClick={handleClearDraft} color="inherit">
              임시 저장 삭제
            </Button>
          )}
          <Button onClick={handleCloseDetail}>취소</Button>
          <Button onClick={handleSave} variant="contained">
            저장
          </Button>
        </Stack>
      </Box>

      {!loadingParties && (buyerOptions.length === 0 || sellerOptions.length === 0) && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          연결된 주문 파트너가 없습니다. 고객 관계를 먼저 등록해 주세요.
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Grid container spacing={2} sx={{ mt: 1 }}>
          <Grid item xs={12} sm={6}>
            <TextField
              name="orderNumber"
              label="주문번호"
              value={formData.orderNumber}
              onChange={handleInputChange}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={6}>
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
                  label="발주자(Brand)"
                  placeholder={loadingParties ? '불러오는 중...' : '발주자를 선택해 주세요'}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
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
                  label="수주자(Manufacturer)"
                  placeholder={loadingParties ? '불러오는 중...' : '수주자를 선택해 주세요'}
                />
              )}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              name="dueDate"
              label="납기일"
              type="date"
              value={formData.dueDate}
              onChange={handleInputChange}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>상태</InputLabel>
              <Select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                label="상태"
              >
                {ORDER_STATUSES.map((status) => (
                  <MenuItem key={status} value={status}>
                    {status}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

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
                            <Autocomplete
                              options={availableStyleOptions}
                              value={groupStyleOption}
                              disabled={!selectedBuyerName}
                              onChange={(_event, newValue) => handleStyleChange(group.rowItemIds, newValue)}
                              getOptionLabel={(option) => option?.name || ''}
                              isOptionEqualToValue={(option, value) => option?.id === value?.id}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  size="small"
                                  placeholder="스타일명 검색"
                                />
                              )}
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
                              label="스타일 코드"
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
                            <Select
                              value={rowColorCode}
                              onChange={(event) => handleColorChange(item.id, event.target.value)}
                              displayEmpty
                              disabled={!rowStyleIdentity}
                            >
                              <MenuItem value="">
                                <em>색상 선택</em>
                              </MenuItem>
                              {normalizedColorOptions.map((color) => (
                                <MenuItem key={color.code} value={color.code}>
                                  {color.name || color.code}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <FormControl fullWidth size="small">
                            <Select
                              value={normalizeGenderCode(item.gender, 'M')}
                              onChange={(event) => handleGenderChange(item.id, event.target.value)}
                              disabled={!rowStyleIdentity || !rowColorCode}
                            >
                              {GENDER_OPTIONS.map((gender) => (
                                <MenuItem
                                  key={gender}
                                  value={gender}
                                  disabled={Boolean(rowStyleIdentity) && disabledGenderSet.has(gender)}
                                >
                                  {gender}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        {SIZE_COLUMNS.map((size) => (
                          <TableCell key={`${item.id}-${size}`} sx={{ textAlign: 'center', px: 0.25 }}>
                            <TextField
                              value={normalizedSizeQuantities[size]}
                              onChange={(event) => handleSizeQuantityChange(item.id, size, event.target.value)}
                              onKeyDown={size === LAST_SIZE_COLUMN ? handleLastSizeInputKeyDown : undefined}
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
            주문 합계 수량: {getOrderTotal()}
          </Typography>
        </Box>
      </Paper>
    </AppPageContainer>
  );
};

export default OrderList;
