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
import {
  loadOrders,
  saveOrders,
  loadOrderDraft,
  saveOrderDraft,
  clearOrderDraft,
} from '../../../utils/localData';
import { fetchStyles as fetchStylesFromApi } from '../../../utils/styleApi';
import {
  SIZE_CODES,
  GENDER_CODES,
  normalizeGenderCode,
} from '../../../constants/productAttributes';

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const ORDER_STATUSES = ['주문접수', '작업중', '생산완료', '출고완료'];
const ORDER_FILTER_ALL = 'ALL';
const GENDER_OPTIONS = GENDER_CODES;
const SIZE_COLUMNS = SIZE_CODES;
const STYLE_TABLE_COLUMN_COUNT = SIZE_COLUMNS.length + 6;
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
const getStyleGroupKey = (item) => {
  if (item?.styleId) return `style:${item.styleId}`;
  if (item?.styleName) return `style-name:${item.styleName}`;
  if (item?.styleCode) return `style-code:${item.styleCode}`;
  return `item:${item?.id || ''}`;
};
const getGenderOrder = (gender) =>
  Number.isFinite(GENDER_SORT_ORDER[gender]) ? GENDER_SORT_ORDER[gender] : 99;
const getGenderPastelStyle = (gender) => GENDER_PASTEL_STYLES[gender] || GENDER_PASTEL_STYLES.default;
const getLegacyGenderCodeFromRows = (rows = []) => {
  for (const row of rows) {
    const code = normalizeGenderCode(row?.colorId || row?.gender, '');
    if (code) return code;
  }
  return '';
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
  colorId: row?.colorId || '',
  sizeId: row?.sizeId || '',
  quantity: row?.quantity ?? '',
});

const createOrderItem = () => ({
  id: createId('item'),
  styleId: '',
  styleName: '',
  styleCode: '',
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

  return {
    id: item?.id || createId('item'),
    styleId: item?.styleId || '',
    styleName: item?.styleName || '',
    styleCode: item?.styleCode || '',
    gender: normalizedGender || legacyGender || 'M',
    sizeQuantities:
      item?.sizeQuantities && typeof item.sizeQuantities === 'object'
        ? normalizeSizeQuantities(item.sizeQuantities)
        : buildSizeQuantitiesFromLegacyRows(legacyRows),
  };
};

const buildInitialFormData = () => ({
  orderNumber: '',
  customerId: '',
  customerName: '',
  dueDate: '',
  status: '주문접수',
  items: [createOrderItem()],
});

const normalizeOrderForm = (order) => {
  const base = buildInitialFormData();
  if (!order) return base;
  const items = Array.isArray(order.items) && order.items.length > 0 ? order.items : base.items;
  return {
    ...base,
    ...order,
    customerName: order.customerName || order.customer || base.customerName,
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
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const { showNotification, navigateToPath, closeTab } = useApp();

  const [orders, setOrders] = useState(() => loadOrders());
  const [styles, setStyles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(ORDER_FILTER_ALL);
  const [formData, setFormData] = useState(buildInitialFormData);
  const detailInitKeyRef = useRef(null);

  const refreshStyles = async () => {
    try {
      const items = await fetchStylesFromApi();
      setStyles(items);
    } catch (error) {
      setStyles([]);
      showNotification(error?.message || '스타일 목록을 불러오지 못했습니다.', 'error');
    }
  };

  useEffect(() => {
    refreshStyles();
  }, []);

  useEffect(() => {
    const fetchCustomers = async () => {
      setLoadingCustomers(true);
      try {
        const response = await fetch(`${API_BASE}/customers`);
        const data = await response.json();
        if (response.ok) {
          setCustomers(Array.isArray(data) ? data : []);
        } else {
          setCustomers([]);
          showNotification(data?.error || '고객사 목록을 불러오지 못했습니다.', 'error');
        }
      } catch (_error) {
        setCustomers([]);
        showNotification('고객사 목록을 불러오지 못했습니다.', 'error');
      } finally {
        setLoadingCustomers(false);
      }
    };

    fetchCustomers();
  }, [API_BASE, showNotification]);

  useEffect(() => {
    if (formData.customerId || !formData.customerName) return;
    const match = customers.find((customer) => customer.name === formData.customerName);
    if (match) {
      setFormData((prev) => ({ ...prev, customerId: match.id }));
    }
  }, [customers, formData.customerId, formData.customerName]);

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
        showNotification('임시 저장된 주문을 불러왔습니다.', 'info');
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
      const customer = order.customerName || order.customer || '';
      const styleSummary = formatStyleSummary(order.items || []);
      const styleNames = getStyleDisplayNames(order.items || []).join(' ');
      return (
        orderNumber.toLowerCase().includes(lowerTerm) ||
        customer.toLowerCase().includes(lowerTerm) ||
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

  const availableStyleOptions = useMemo(() => {
    if (!formData.customerName) return [];
    return styleOptions.filter((style) => style.customer === formData.customerName);
  }, [styleOptions, formData.customerName]);

  const customerValue = useMemo(() => {
    if (formData.customerId) {
      return customers.find((customer) => customer.id === formData.customerId) || null;
    }
    if (formData.customerName) {
      return customers.find((customer) => customer.name === formData.customerName) || null;
    }
    return null;
  }, [customers, formData.customerId, formData.customerName]);

  const groupedStyleItems = useMemo(() => {
    const groupMap = new Map();

    formData.items.forEach((item, sourceIndex) => {
      const groupKey = getStyleGroupKey(item);
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          styleName: item.styleName || '',
          styleCode: item.styleCode || '',
          rows: [],
        });
      }
      const targetGroup = groupMap.get(groupKey);
      if (!targetGroup.styleName && item.styleName) targetGroup.styleName = item.styleName;
      if (!targetGroup.styleCode && item.styleCode) targetGroup.styleCode = item.styleCode;
      targetGroup.rows.push({ item, sourceIndex });
    });

    let nextDisplayNo = 1;
    return Array.from(groupMap.values()).map((group) => {
      const rows = [...group.rows]
        .sort((a, b) => {
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

  const handleDeleteOrder = (order) => {
    if (!order?.id) return;
    if (!isOrderDeletable(order.status)) {
      showNotification('주문 상태가 주문접수인 건만 삭제할 수 있습니다.', 'warning');
      return;
    }

    const orderLabel = order.orderNumber ? `주문 ${order.orderNumber}` : '해당 주문';
    if (!window.confirm(`${orderLabel}을(를) 삭제하시겠습니까?`)) {
      return;
    }

    const nextOrders = orders.filter((target) => target.id !== order.id);
    setOrders(nextOrders);
    saveOrders(nextOrders);

    showNotification('주문이 삭제되었습니다.', 'success');
  };

  const closeDetailAndGoList = () => {
    navigateToPath('/order', { label: '주문' });
    if (isNewOrder) {
      closeTab('/order/new');
      return;
    }
    if (orderId) {
      closeTab(`/order/${orderId}`);
    }
  };

  const handleCloseDetail = () => {
    closeDetailAndGoList();
  };

  const handleCustomerChange = (_event, customer) => {
    setFormData((prev) => {
      const nextCustomerId = customer?.id || '';
      const nextCustomerName = customer?.name || '';
      if (nextCustomerId === prev.customerId && nextCustomerName === prev.customerName) {
        return prev;
      }
      return {
        ...prev,
        customerId: nextCustomerId,
        customerName: nextCustomerName,
        items: prev.items.map((item) => ({
          ...item,
          styleId: '',
          styleName: '',
          styleCode: '',
          sizeQuantities: createSizeQuantities(),
        })),
      };
    });
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

  const handleStyleChange = (itemId, style) => {
    if (!formData.customerName) {
      showNotification('고객사를 먼저 선택하세요.', 'warning');
      return;
    }

    setFormData((prev) => {
      const nextItems = prev.items.map((item) => {
        if (item.id !== itemId) return item;
        if (item.styleId === (style?.id || '') && item.styleName === (style?.name || '')) {
          return item;
        }
        return {
          ...item,
          styleId: style?.id || '',
          styleName: style?.name || '',
          styleCode: style?.styleCode || '',
          sizeQuantities: createSizeQuantities(),
        };
      });

      return {
        ...prev,
        items: nextItems,
      };
    });
  };

  const handleGenderChange = (itemId, value) => {
    if (!GENDER_OPTIONS.includes(value)) return;
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
    showNotification('임시 저장을 삭제했습니다.', 'info');
    if (isDetailMode) {
      closeDetailAndGoList();
    }
  };

  const validateOrder = () => {
    if (!formData.orderNumber.trim()) {
      return '주문번호를 입력하세요.';
    }
    if (!formData.customerName) {
      return '고객사를 선택하세요.';
    }
    if (!formData.dueDate) {
      return '납기일을 입력하세요.';
    }
    if (!formData.items.length) {
      return '스타일을 추가하세요.';
    }
    for (const item of formData.items) {
      if (!item.styleId) {
        return '모든 스타일을 선택하세요.';
      }
      if (!GENDER_OPTIONS.includes(item.gender)) {
        return '모든 스타일의 성별 코드(M/W/U)를 선택하세요.';
      }
      const totalQuantity = sumSizeQuantities(item.sizeQuantities);
      if (totalQuantity <= 0) {
        return '스타일별 사이즈 수량을 입력하세요.';
      }
    }
    return null;
  };

  const handleSave = () => {
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
      const legacyQuantities = SIZE_COLUMNS.filter((size) => numericSizeQuantities[size] > 0).map((size) => ({
        id: createId('qty'),
        colorId: item.gender,
        sizeId: size,
        quantity: numericSizeQuantities[size],
      }));
      return {
        ...item,
        gender: GENDER_OPTIONS.includes(item.gender) ? item.gender : 'M',
        sizeQuantities: numericSizeQuantities,
        quantities: legacyQuantities,
        totalQuantity,
      };
    });

    const totalQuantity = sanitizedItems.reduce((sum, item) => sum + item.totalQuantity, 0);

    const payload = {
      ...formData,
      customerName: formData.customerName,
      items: sanitizedItems,
      totalQuantity,
      updatedAt: new Date().toISOString(),
    };

    let nextOrders = [];
    if (!isNewOrder) {
      const existingOrder = orders.find((order) => order.id === orderId);
      if (!existingOrder) {
        showNotification('수정할 주문을 찾을 수 없습니다.', 'error');
        return;
      }
      payload.id = existingOrder.id;
      payload.createdAt = existingOrder.createdAt || payload.updatedAt;
      nextOrders = orders.map((order) => (order.id === existingOrder.id ? payload : order));
    } else {
      payload.id = createId('order');
      payload.createdAt = payload.updatedAt;
      nextOrders = [...orders, payload];
    }

    setOrders(nextOrders);
    saveOrders(nextOrders);
    clearOrderDraft();
    showNotification('주문 정보가 저장되었습니다.', 'success');
    closeDetailAndGoList();
  };

  if (!isDetailMode) {
    return (
      <AppPageContainer>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <SearchInput
              placeholder="주문번호, 고객사, 스타일 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ width: 360 }}
            />
            <FormControl size="small" sx={{ minWidth: 140 }}>
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
            주문 추가
          </Button>
        </Box>
        <Paper variant="outlined" sx={{ width: '100%' }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>주문번호</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>고객사(브랜드)</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>스타일</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>합계 수량</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>납기일</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>상태</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>관리</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} sx={{ textAlign: 'center', color: 'text.secondary' }}>
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
                      <TableCell>{order.orderNumber}</TableCell>
                      <TableCell>{order.customerName || order.customer || '-'}</TableCell>
                      <TableCell>{formatStyleSummary(order.items)}</TableCell>
                      <TableCell sx={{ textAlign: 'right' }}>{order.totalQuantity ?? '-'}</TableCell>
                      <TableCell>{order.dueDate || '-'}</TableCell>
                      <TableCell>{order.status || '-'}</TableCell>
                      <TableCell sx={{ textAlign: 'center' }}>
                        <IconButton
                          size="small"
                          color="error"
                          disabled={!deletable}
                          title={deletable ? '주문 삭제' : '주문접수 상태에서만 삭제 가능'}
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

      {!loadingCustomers && customers.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          연결된 고객사가 없습니다. 고객 관리에서 브랜드를 먼저 등록하세요.
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
              options={customers}
              value={customerValue}
              onChange={handleCustomerChange}
              getOptionLabel={(option) => option?.name || ''}
              isOptionEqualToValue={(option, value) => option?.id === value?.id}
              loading={loadingCustomers}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="고객사(브랜드)"
                  placeholder={loadingCustomers ? '불러오는 중...' : '고객사를 선택하세요'}
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
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddItem}>
              스타일 추가
            </Button>
          </Stack>
        </Box>

        <Paper variant="outlined" sx={{ mb: 2 }}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ tableLayout: 'fixed', minWidth: 1500 }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: 52, textAlign: 'center' }}>No</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 250 }}>스타일명/코드 선택</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 124 }}>스타일 코드</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 108 }}>성별</TableCell>
                  {SIZE_COLUMNS.map((size) => (
                    <TableCell
                      key={size}
                      sx={{ fontWeight: 'bold', width: 88, textAlign: 'center', whiteSpace: 'nowrap' }}
                    >
                      {size}
                    </TableCell>
                  ))}
                  <TableCell sx={{ fontWeight: 'bold', width: 90, textAlign: 'right' }}>합계</TableCell>
                  <TableCell sx={{ fontWeight: 'bold', width: 72, textAlign: 'center' }}>삭제</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groupedStyleItems.map((group, groupIndex) => {
                  const groupTitle = group.styleName || '스타일 미선택';
                  const groupMeta = [
                    group.styleCode ? `코드 ${group.styleCode}` : null,
                    `${group.rows.length}줄`,
                  ]
                    .filter(Boolean)
                    .join(' · ');

                  return (
                    <React.Fragment key={group.key}>
                      <TableRow>
                        <TableCell
                          colSpan={STYLE_TABLE_COLUMN_COUNT}
                          sx={{
                            py: 0.75,
                            fontSize: 13,
                            fontWeight: 700,
                            color: 'text.secondary',
                            backgroundColor: '#f5f7fb',
                            borderTop:
                              groupIndex === 0 ? '1px solid rgba(224, 224, 224, 1)' : '2px solid #d9dfeb',
                          }}
                        >
                          {groupTitle}
                          {groupMeta ? `  ·  ${groupMeta}` : ''}
                        </TableCell>
                      </TableRow>
                      {group.rows.map(({ item, displayNo }) => {
                        const itemTotal = getItemTotal(item);
                        const selectedStyle =
                          availableStyleOptions.find((option) => option.id === item.styleId) || null;
                        const normalizedSizeQuantities = normalizeSizeQuantities(item.sizeQuantities);
                        const genderStyle = getGenderPastelStyle(item.gender);

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
                            <TableCell>
                              <Autocomplete
                                options={availableStyleOptions}
                                value={selectedStyle}
                                disabled={!formData.customerName}
                                onChange={(_event, newValue) => handleStyleChange(item.id, newValue)}
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
                                  formData.customerName
                                    ? '등록된 스타일이 없습니다.'
                                    : '고객사를 먼저 선택하세요.'
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                value={item.styleCode}
                                fullWidth
                                InputProps={{ readOnly: true }}
                                disabled
                                placeholder="자동 입력"
                              />
                            </TableCell>
                            <TableCell>
                              <FormControl fullWidth size="small">
                                <Select
                                  value={normalizeGenderCode(item.gender, 'M')}
                                  onChange={(event) => handleGenderChange(item.id, event.target.value)}
                                >
                                  {GENDER_OPTIONS.map((gender) => (
                                    <MenuItem key={gender} value={gender}>
                                      {gender}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </TableCell>
                            {SIZE_COLUMNS.map((size) => (
                              <TableCell key={`${item.id}-${size}`} sx={{ textAlign: 'center', px: 0.5 }}>
                                <TextField
                                  value={normalizedSizeQuantities[size]}
                                  onChange={(event) =>
                                    handleSizeQuantityChange(item.id, size, event.target.value)
                                  }
                                  size="small"
                                  type="text"
                                  placeholder="0"
                                  inputProps={{
                                    inputMode: 'numeric',
                                    pattern: '[0-9]*',
                                    style: { textAlign: 'right', paddingRight: 8 },
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
                      })}
                    </React.Fragment>
                  );
                })}
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
