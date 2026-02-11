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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import { useApp } from '../../../context/AppContext';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

const buildFormData = (customer) => ({
  code: customer?.code ?? '',
  name: customer?.name ?? '',
  manager: customer?.manager ?? '',
  phone: customer?.phone ?? '',
  email: customer?.email ?? '',
});

const CustomerList = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
  const { showNotification } = useApp();

  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState(buildFormData());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/customers`);
      const data = await response.json();
      if (response.ok) {
        setCustomers(Array.isArray(data) ? data : []);
      } else {
        showNotification(data?.error || '고객사 목록을 불러오지 못했습니다.', 'error');
      }
    } catch (_error) {
      showNotification('고객사 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [API_BASE]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const lowerTerm = searchTerm.toLowerCase();
    return customers.filter((customer) => {
      const name = customer?.name ?? '';
      const code = customer?.code ?? '';
      const manager = customer?.manager ?? '';
      return (
        name.toLowerCase().includes(lowerTerm) ||
        code.toLowerCase().includes(lowerTerm) ||
        manager.toLowerCase().includes(lowerTerm)
      );
    });
  }, [customers, searchTerm]);

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData(buildFormData());
    setOpenDialog(true);
  };

  const handleRowDoubleClick = (customer) => {
    setEditingCustomer(customer);
    setFormData(buildFormData(customer));
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    if (saving) return;
    setOpenDialog(false);
    setEditingCustomer(null);
  };

  const handleSave = async () => {
    if (saving) return;
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      showNotification('고객사명을 입력해 주세요.', 'error');
      return;
    }

    setSaving(true);
    const payload = {
      code: formData.code.trim(),
      name: trimmedName,
      manager: formData.manager.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
    };

    try {
      const isEdit = Boolean(editingCustomer?.id);
      const response = await fetch(
        isEdit ? `${API_BASE}/customers/${editingCustomer.id}` : `${API_BASE}/customers`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        showNotification(data?.error || '고객사 저장에 실패했습니다.', 'error');
        return;
      }

      if (isEdit) {
        setCustomers((prev) => prev.map((c) => (c.id === data.id ? data : c)));
      } else {
        setCustomers((prev) => [...prev, data]);
      }

      showNotification('고객사 정보가 저장되었습니다.', 'success');
      setOpenDialog(false);
      setEditingCustomer(null);
    } catch (_error) {
      showNotification('고객사 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <AppPageContainer>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <SearchInput
          placeholder="고객사명, 코드 또는 담당자 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          sx={{ width: 420 }}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          고객 추가
        </Button>
      </Box>
      <Paper variant="outlined" sx={{ width: '100%' }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>고객 코드</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>고객사명</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>담당자</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>연락처</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>이메일</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>등록일</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    불러오는 중...
                  </TableCell>
                </TableRow>
              )}
              {!loading && filteredCustomers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                    등록된 고객사가 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {filteredCustomers.map((customer) => (
                <TableRow
                  key={customer.id}
                  hover
                  onDoubleClick={() => handleRowDoubleClick(customer)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>{customer.code || '-'}</TableCell>
                  <TableCell>{customer.name || '-'}</TableCell>
                  <TableCell>{customer.manager || '-'}</TableCell>
                  <TableCell>{customer.phone || '-'}</TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>{formatDate(customer.registeredAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCustomer ? '고객사 정보 수정' : '신규 고객사 등록'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6}>
              <TextField
                name="code"
                label="고객 코드"
                value={formData.code}
                onChange={handleInputChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="name"
                label="고객사명"
                value={formData.name}
                onChange={handleInputChange}
                fullWidth
                required
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="manager"
                label="담당자"
                value={formData.manager}
                onChange={handleInputChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="phone"
                label="연락처"
                value={formData.phone}
                onChange={handleInputChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="email"
                label="이메일"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                fullWidth
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} disabled={saving}>
            취소
          </Button>
          <Button onClick={handleSave} variant="contained" disabled={saving}>
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default CustomerList;
