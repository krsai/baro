import React, { useState } from 'react';
import {
  Container,
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

const Customer = () => {
  // 샘플 데이터 (나중에 API 연동 또는 Context API로 관리)
  const [customers, setCustomers] = useState([
    { id: 1, name: '더산' },
    { id: 2, name: '나이키' },
    { id: 3, name: '아디다스' },
  ]);

  const [openDialog, setOpenDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState({ name: '' });

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData({ name: '' });
    setOpenDialog(true);
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData(customer);
    setOpenDialog(true);
  };

  const handleDelete = (id) => {
    // 간단한 확인 절차
    if (window.confirm('정말로 이 고객사를 삭제하시겠습니까? 연관된 모든 데이터가 영향을 받을 수 있습니다.')) {
      setCustomers(customers.filter((c) => c.id !== id));
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleSave = () => {
    if (editingCustomer) {
      // 수정
      setCustomers(
        customers.map((c) => (c.id === editingCustomer.id ? { ...formData, id: c.id } : c))
      );
    } else {
      // 추가
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
    <Container component="main" maxWidth="lg">
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        {/* 페이지 타이틀 및 추가 버튼 */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', mb: 3 }}>
          <Typography component="h1" variant="h4">
            고객 관리
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
            고객 추가
          </Button>
        </Box>

        {/* 고객 목록 테이블 */}
        <TableContainer component={Paper} sx={{ width: '100%' }}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>고객사명</TableCell>
                <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>작업</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} hover>
                  <TableCell>{customer.id}</TableCell>
                  <TableCell>{customer.name}</TableCell>
                  <TableCell sx={{ textAlign: 'center' }}>
                    <IconButton size="small" color="primary" onClick={() => handleEdit(customer)} title="수정">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(customer.id)} title="삭제">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {customers.length === 0 && (
          <Box sx={{ width: '100%', textAlign: 'center', py: 5 }}>
            <Typography color="text.secondary">등록된 고객사가 없습니다. 새로운 고객사를 추가해주세요.</Typography>
          </Box>
        )}
      </Box>

      {/* 고객 추가/수정 다이얼로그 */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCustomer ? '고객사 정보 수정' : '신규 고객사 등록'}</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                autoFocus
                fullWidth
                label="고객사명"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="예: 더산"
              />
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
    </Container>
  );
};

export default Customer;
