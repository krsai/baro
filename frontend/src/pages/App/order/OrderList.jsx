import React, { useEffect, useMemo, useState } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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

const createId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createQuantityRow = () => ({
  id: createId('qty'),
  colorId: '',
  sizeId: '',
  quantity: '',
});

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
  quantities: [createQuantityRow()],
});

const normalizeOrderItem = (item) => ({
  id: item?.id || createId('item'),
  styleId: item?.styleId || '',
  styleName: item?.styleName || '',
  styleCode: item?.styleCode || '',
  quantities: Array.isArray(item?.quantities) && item.quantities.length > 0
    ? item.quantities.map(normalizeQuantityRow)
    : [createQuantityRow()],
});

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

const formatStyleSummary = (items = []) => {
  const names = items.map((item) => item.styleName).filter(Boolean);
  if (names.length === 0) return '-';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} 외 ${names.length - 2}건`;
};

const OrderList = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const { showNotification, navigateToPath } = useApp();

  const [orders, setOrders] = useState(() => loadOrders());
  const [styles, setStyles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [colors, setColors] = useState([]);
  const [sizes, setSizes] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingAttributes, setLoadingAttributes] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [formData, setFormData] = useState(buildInitialFormData);

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
    const fetchAttributes = async () => {
      setLoadingAttributes(true);
      try {
        const response = await fetch(`${API_BASE}/attributes`);
        const data = await response.json();
        if (response.ok) {
          const normalizeList = (list) =>
            Array.isArray(list)
              ? list.map((item) => ({
                  id: item.id || item.code || item.name,
                  name: item.name || item.code || item.id,
                }))
              : [];
          setColors(normalizeList(data?.colors));
          setSizes(normalizeList(data?.sizes));
        } else {
          setColors([]);
          setSizes([]);
        }
      } catch (_error) {
        setColors([]);
        setSizes([]);
      } finally {
        setLoadingAttributes(false);
      }
    };

    fetchAttributes();
  }, [API_BASE]);

  useEffect(() => {
    if (formData.customerId || !formData.customerName) return;
    const match = customers.find((customer) => customer.name === formData.customerName);
    if (match) {
      setFormData((prev) => ({ ...prev, customerId: match.id }));
    }
  }, [customers, formData.customerId, formData.customerName]);

  useEffect(() => {
    if (!openDialog || editingOrder) return;
    saveOrderDraft(formData);
  }, [formData, openDialog, editingOrder]);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const lowerTerm = searchTerm.toLowerCase();
    return orders.filter((order) => {
      const orderNumber = order.orderNumber || '';
      const customer = order.customerName || order.customer || '';
      const styleSummary = formatStyleSummary(order.items || []);
      return (
        orderNumber.toLowerCase().includes(lowerTerm) ||
        customer.toLowerCase().includes(lowerTerm) ||
        styleSummary.toLowerCase().includes(lowerTerm)
      );
    });
  }, [orders, searchTerm]);

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
    if (!formData.customerName) return styleOptions;
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

  const handleAdd = async () => {
    await refreshStyles();
    setEditingOrder(null);
    const draft = loadOrderDraft();
    if (draft) {
      setFormData(normalizeOrderForm(draft));
      showNotification('임시 저장된 주문을 불러왔습니다.', 'info');
    } else {
      setFormData(buildInitialFormData());
    }
    setOpenDialog(true);
  };

  const handleEdit = async (order) => {
    await refreshStyles();
    setEditingOrder(order);
    setFormData(normalizeOrderForm(order));
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingOrder(null);
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
          quantities: [createQuantityRow()],
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
    setFormData((prev) => {
      let nextCustomerId = prev.customerId;
      let nextCustomerName = prev.customerName;

      if (!prev.customerName && style?.customer) {
        const match = customers.find((customer) => customer.name === style.customer);
        nextCustomerId = match?.id || '';
        nextCustomerName = style.customer;
      }

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
          quantities: [createQuantityRow()],
        };
      });

      return {
        ...prev,
        customerId: nextCustomerId,
        customerName: nextCustomerName,
        items: nextItems,
      };
    });
  };

  const handleAddQuantityRow = (itemId) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? { ...item, quantities: [...item.quantities, createQuantityRow()] }
          : item
      ),
    }));
  };

  const handleRemoveQuantityRow = (itemId, rowId) => {
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) => {
        if (item.id !== itemId) return item;
        const nextRows = item.quantities.filter((row) => row.id !== rowId);
        return {
          ...item,
          quantities: nextRows.length ? nextRows : [createQuantityRow()],
        };
      }),
    }));
  };

  const handleQuantityChange = (itemId, rowId, field, value) => {
    const normalizedValue = field === 'quantity' ? value.replace(/[^\d]/g, '') : value;
    setFormData((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              quantities: item.quantities.map((row) =>
                row.id === rowId ? { ...row, [field]: normalizedValue } : row
              ),
            }
          : item
      ),
    }));
  };

  const getItemTotal = (item) =>
    item.quantities.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);

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
      const validRows = item.quantities.filter(
        (row) => row.colorId && row.sizeId && Number(row.quantity) > 0
      );
      if (validRows.length === 0) {
        return '색상/사이즈별 수량을 입력하세요.';
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
      const cleanRows = item.quantities
        .filter((row) => row.colorId && row.sizeId && Number(row.quantity) > 0)
        .map((row) => ({
          ...row,
          quantity: Number(row.quantity),
        }));
      const totalQuantity = cleanRows.reduce((sum, row) => sum + row.quantity, 0);
      return {
        ...item,
        quantities: cleanRows,
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
    if (editingOrder?.id) {
      payload.id = editingOrder.id;
      payload.createdAt = editingOrder.createdAt || payload.updatedAt;
      nextOrders = orders.map((order) => (order.id === editingOrder.id ? payload : order));
    } else {
      payload.id = createId('order');
      payload.createdAt = payload.updatedAt;
      nextOrders = [...orders, payload];
    }

    setOrders(nextOrders);
    saveOrders(nextOrders);
    clearOrderDraft();
    setOpenDialog(false);
    setEditingOrder(null);
    showNotification('주문 정보가 저장되었습니다.', 'success');
  };

  const hasAttributes = colors.length > 0 && sizes.length > 0;

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <SearchInput
          placeholder="주문번호, 고객사, 스타일 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
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
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    등록된 주문이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {filteredOrders.map((order) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="lg" fullWidth>
        <DialogTitle>{editingOrder ? '주문 정보 수정' : '신규 주문 등록'}</DialogTitle>
        <DialogContent>
          {!loadingCustomers && customers.length === 0 && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              연결된 고객사가 없습니다. 고객 관리에서 브랜드를 먼저 등록하세요.
            </Alert>
          )}
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
                  <MenuItem value="주문접수">주문접수</MenuItem>
                  <MenuItem value="작업중">작업중</MenuItem>
                  <MenuItem value="생산완료">생산완료</MenuItem>
                  <MenuItem value="출고완료">출고완료</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Divider sx={{ my: 3 }} />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              스타일 구성
            </Typography>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddItem}>
              스타일 추가
            </Button>
          </Box>

          {formData.items.map((item, index) => {
            const itemTotal = getItemTotal(item);
            const selectedStyle = availableStyleOptions.find((option) => option.id === item.styleId) || null;

            return (
              <Paper key={item.id} variant="outlined" sx={{ p: 2, mb: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="subtitle2">스타일 {index + 1}</Typography>
                  <Button color="error" size="small" onClick={() => handleRemoveItem(item.id)}>
                    삭제
                  </Button>
                </Box>

                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      options={availableStyleOptions}
                      value={selectedStyle}
                      onChange={(_event, newValue) => handleStyleChange(item.id, newValue)}
                      getOptionLabel={(option) =>
                        option?.name
                          ? `${option.name}${option.styleCode ? ` (${option.styleCode})` : ''}`
                          : ''
                      }
                      isOptionEqualToValue={(option, value) => option?.id === value?.id}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="스타일 선택"
                          placeholder="스타일명 검색"
                        />
                      )}
                      noOptionsText={
                        formData.customerName ? '등록된 스타일이 없습니다.' : '고객사를 먼저 선택하세요.'
                      }
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <TextField
                      label="스타일 코드"
                      value={item.styleCode}
                      fullWidth
                      InputProps={{ readOnly: true }}
                      disabled
                      placeholder="자동 입력"
                    />
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Button
                      variant="outlined"
                      startIcon={<OpenInNewIcon />}
                      onClick={handleOpenStyleRegistration}
                      fullWidth
                    >
                      스타일 등록
                    </Button>
                  </Grid>
                </Grid>

                <Box sx={{ mt: 2 }}>
                  {!hasAttributes && !loadingAttributes && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                      색상/사이즈가 등록되어 있지 않습니다. 속성 관리에서 먼저 등록하세요.
                    </Alert>
                  )}
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 'bold' }}>색상</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>사이즈</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>수량</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 80 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {item.quantities.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <FormControl fullWidth size="small" disabled={!hasAttributes}>
                              <Select
                                value={row.colorId}
                                onChange={(event) =>
                                  handleQuantityChange(item.id, row.id, 'colorId', event.target.value)
                                }
                                displayEmpty
                              >
                                <MenuItem value="" disabled>
                                  색상 선택
                                </MenuItem>
                                {colors.map((color) => (
                                  <MenuItem key={color.id} value={color.id}>
                                    {color.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell>
                            <FormControl fullWidth size="small" disabled={!hasAttributes}>
                              <Select
                                value={row.sizeId}
                                onChange={(event) =>
                                  handleQuantityChange(item.id, row.id, 'sizeId', event.target.value)
                                }
                                displayEmpty
                              >
                                <MenuItem value="" disabled>
                                  사이즈 선택
                                </MenuItem>
                                {sizes.map((size) => (
                                  <MenuItem key={size.id} value={size.id}>
                                    {size.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>
                            <TextField
                              value={row.quantity}
                              onChange={(event) =>
                                handleQuantityChange(item.id, row.id, 'quantity', event.target.value)
                              }
                              size="small"
                              type="text"
                              placeholder="0"
                              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                              disabled={!hasAttributes}
                              sx={{ maxWidth: 120 }}
                            />
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>
                            <IconButton
                              size="small"
                              onClick={() => handleRemoveQuantityRow(item.id, row.id)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => handleAddQuantityRow(item.id)}
                    >
                      수량 추가
                    </Button>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      합계 수량: {itemTotal}
                    </Typography>
                  </Stack>
                </Box>
              </Paper>
            );
          })}

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              주문 합계 수량: {getOrderTotal()}
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          {!editingOrder && (
            <Button onClick={handleClearDraft} color="inherit">
              임시 저장 삭제
            </Button>
          )}
          <Button onClick={handleCloseDialog}>취소</Button>
          <Button onClick={handleSave} variant="contained">
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default OrderList;
