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

const OrderList = () => {
  const [orders, setOrders] = useState([
    { id: 1, orderNumber: 'ORD-001', customer: '더산', style: 'TSH-01', quantity: 100, dueDate: '2024-03-15', status: '작업중' },
    { id: 2, orderNumber: 'ORD-002', customer: '나이키', style: 'NK-SW-02', quantity: 250, dueDate: '2024-03-20', status: '생산완료' },
    { id: 3, orderNumber: 'ORD-003', customer: '아디다스', style: 'AD-HO-03', quantity: 50, dueDate: '2024-04-01', status: '주문접수' },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  
  const initialFormData = { orderNumber: '', customer: '', style: '', quantity: '', dueDate: '', status: '주문접수' };
  const [formData, setFormData] = useState(initialFormData);

  const filteredOrders = useMemo(() => {
    if (!searchTerm) return orders;
    const lowerTerm = searchTerm.toLowerCase();
    return orders.filter(
      (order) =>
        order.orderNumber.toLowerCase().includes(lowerTerm) ||
        order.customer.toLowerCase().includes(lowerTerm) ||
        order.style.toLowerCase().includes(lowerTerm)
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
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };
  
  const handleSelectChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
                <TableCell sx={{ fontWeight: 'bold' }}>스타일</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'right' }}>수량</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>납기일</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>상태</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredOrders.map((order) => (
                <TableRow key={order.id} hover onClick={() => handleEdit(order)} sx={{cursor: 'pointer'}}>
                  <TableCell>{order.orderNumber}</TableCell>
                  <TableCell>{order.customer}</TableCell>
                  <TableCell>{order.style}</TableCell>
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
              <TextField name="customer" label="고객사" value={formData.customer} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="style" label="스타일" value={formData.style} onChange={handleInputChange} fullWidth />
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