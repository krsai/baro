import React, { useState, useMemo } from 'react';
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import { useApp } from '../../../context/AppContext';

// Mock data for customers
const mockCustomers = ['더산', '나이키', '아디다스', '빈폴', '탑텐'];

// Mock data for styles
const mockStyles = [
  { id: 'S-001', name: '기본 라운드 티셔츠', code: 'TSH-01', customer: '더산' },
  { id: 'S-002', name: '기능성 스포츠 자켓', code: 'NK-SW-02', customer: '나이키' },
  { id: 'S-003', name: '오버핏 후드', code: 'AD-HO-03', customer: '아디다스' },
  { id: 'S-004', name: '슬림핏 치노 팬츠', code: 'BP-PT-04', customer: '빈폴' },
  { id: 'S-005', name: '베이직 셔츠', code: '', customer: '탑텐' },
];

const OrderList = () => {
  const { showNotification } = useApp();
  const [orders, setOrders] = useState([
    { id: 1, orderNumber: 'ORD-001', customer: '더산', styleName: '기본 라운드 티셔츠', styleCode: 'TSH-01', quantity: 100, dueDate: '2024-03-15', status: '작업중' },
    { id: 2, orderNumber: 'ORD-002', customer: '나이키', styleName: '기능성 스포츠 자켓', styleCode: 'NK-SW-02', quantity: 250, dueDate: '2024-03-20', status: '생산완료' },
    { id: 3, orderNumber: 'ORD-003', customer: '아디다스', styleName: '오버핏 후드', styleCode: 'AD-HO-03', quantity: 50, dueDate: '2024-04-01', status: '주문접수' },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  
  const initialFormData = { orderNumber: '', customer: '', styleName: '', styleCode: '', quantity: '', dueDate: '', status: '주문접수' };
  const [formData, setFormData] = useState(initialFormData);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const lowerTerm = searchTerm.toLowerCase();
    return orders.filter(
      (order) =>
        order.orderNumber.toLowerCase().includes(lowerTerm) ||
        order.customer.toLowerCase().includes(lowerTerm) ||
        order.styleName.toLowerCase().includes(lowerTerm) ||
        (order.styleCode && order.styleCode.toLowerCase().includes(lowerTerm))
    );
  }, [orders, searchTerm]);

  const handleAdd = () => {
    setEditingOrder(null);
    setFormData(initialFormData);
    setOpenDialog(true);
  };

  const handleEdit = (order) => {
    setEditingOrder(order);
    setFormData(order);
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSave = () => {
    if (editingOrder) {
      setOrders(
        orders.map((o) => (o.id === editingOrder.id ? { ...formData, id: o.id } : o))
      );
    } else {
      const newOrder = {
        ...formData,
        id: Math.max(...orders.map((o) => o.id), 0) + 1,
      };
      setOrders([...orders, newOrder]);
    }
    handleCloseDialog();
    showNotification('주문 정보가 저장되었습니다.', 'success');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newFormData = { ...prev, [name]: value };

      // 고객사가 변경되면 스타일 초기화
      if (name === 'customer') {
        newFormData.styleName = '';
        newFormData.styleCode = '';
      }
      // 스타일을 선택하면 해당 고객사 자동 선택
      else if (name === 'styleName') {
        const selectedStyle = mockStyles.find((s) => s.name === value);
        if (selectedStyle) {
          newFormData.customer = selectedStyle.customer;
          newFormData.styleCode = selectedStyle.code || '';
        }
      }
      return newFormData;
    });
  };

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
                <TableCell sx={{ fontWeight: 'bold' }}>고객사</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>스타일명</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>스타일코드</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>수량</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>납기일</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>상태</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id} hover onDoubleClick={() => handleEdit(order)} sx={{cursor: 'pointer'}}>
                  <TableCell>{order.orderNumber}</TableCell>
                  <TableCell>{order.customer}</TableCell>
                  <TableCell>{order.styleName}</TableCell>
                  <TableCell>{order.styleCode || '-'}</TableCell>
                  <TableCell sx={{ textAlign: 'right' }}>{order.quantity}</TableCell>
                  <TableCell>{order.dueDate}</TableCell>
                  <TableCell>{order.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md">
        <DialogTitle>{editingOrder ? '주문 정보 수정' : '신규 주문 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField name="orderNumber" label="주문번호" value={formData.orderNumber} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>고객사</InputLabel>
                <Select
                  name="customer"
                  value={formData.customer}
                  onChange={handleSelectChange}
                  label="고객사"
                >
                  {mockCustomers.map((customer) => (
                    <MenuItem key={customer} value={customer}>{customer}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>스타일</InputLabel>
                <Select
                  name="styleName"
                  value={formData.styleName}
                  onChange={handleSelectChange}
                  label="스타일"
                >
                  {mockStyles
                    .filter((style) => !formData.customer || style.customer === formData.customer)
                    .map((style) => (
                      <MenuItem key={style.id} value={style.name}>
                        {style.name} {style.code ? `(${style.code})` : ''}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label="스타일 코드"
                value={formData.styleCode}
                fullWidth
                InputProps={{ readOnly: true }}
                disabled
                placeholder="자동 입력"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="quantity" label="수량" type="number" value={formData.quantity} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="dueDate" label="납기일" type="date" value={formData.dueDate} onChange={handleInputChange} fullWidth InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>상태</InputLabel>
                <Select
                  name="status"
                  value={formData.status}
                  onChange={handleSelectChange}
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
        </DialogContent>
        <DialogActions>
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
