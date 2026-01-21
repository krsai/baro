import React, { useState } from 'react';
import {
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AppPageContainer from '../../components/AppPageContainer';

const Customer = () => {
  const [customers, setCustomers] = useState([
    { id: 1, code: 'C001', name: '더산', manager: '김철수', registeredAt: '2023-01-15' },
    { id: 2, code: 'C002', name: '나이키', manager: '이영희', registeredAt: '2023-02-20' },
    { id: 3, code: 'C003', name: '아디다스', manager: '박지성', registeredAt: '2023-03-10' },
  ]);

  const [openDialog, setOpenDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  
  const initialFormData = { code: '', name: '', manager: '', registeredAt: '' };
  const [formData, setFormData] = useState(initialFormData);

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData(initialFormData);
    setOpenDialog(true);
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData(customer);
    setOpenDialog(true);
  };

  const handleDelete = (id) => {
    if (window.confirm('정말로 이 고객사를 삭제하시겠습니까?')) {
      setCustomers(customers.filter((c) => c.id !== id));
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSave = () => {
    if (editingCustomer) {
      setCustomers(
        customers.map((c) => (c.id === editingCustomer.id ? { ...formData, id: c.id } : c))
      );
    } else {
      const newCustomer = {
        ...formData,
        id: Math.max(...customers.map((c) => c.id), 0) + 1,
      };
      setCustomers([...customers, newCustomer]);
    }
    handleCloseDialog();
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <AppPageContainer
      header={
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Typography component="h1" variant="h4">
            고객 관리
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
            고객 추가
          </Button>
        </Box>
      }
    >
      <Paper sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>고객 코드</TableCell>
                <TableCell>고객사명</TableCell>
                <TableCell>담당자</TableCell>
                <TableCell>등록일</TableCell>
                <TableCell align="center">작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} hover>
                  <TableCell>{customer.id}</TableCell>
                  <TableCell>{customer.code}</TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell>{customer.manager}</TableCell>
                  <TableCell>{customer.registeredAt}</TableCell>
                  <TableCell align="center">
                    <IconButton color="primary" onClick={() => handleEdit(customer)} title="수정">
                      <EditIcon />
                    </IconButton>
                    <IconButton color="secondary" onClick={() => handleDelete(customer.id)} title="삭제">
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog}>
        <DialogTitle>{editingCustomer ? '고객사 정보 수정' : '신규 고객사 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField name="code" label="고객 코드" value={formData.code} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="name" label="고객사명" value={formData.name} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="manager" label="담당자" value={formData.manager} onChange={handleInputChange} fullWidth />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField name="registeredAt" label="등록일" type="date" value={formData.registeredAt} onChange={handleInputChange} fullWidth InputLabelProps={{ shrink: true }} />
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

export default Customer;