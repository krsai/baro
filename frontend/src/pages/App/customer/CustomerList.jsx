import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SaveIcon from '@mui/icons-material/Save';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { useApp } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../constants/layout';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';

const DEFAULT_COUNTRY_CODE = '+84';

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

const combinePhone = (countryCode, phoneNumber) =>
  [String(countryCode || '').trim(), String(phoneNumber || '').trim()].filter(Boolean).join(' ');

const buildFormData = (customer) => ({
  code: customer?.code ?? '',
  name: customer?.name ?? '',
  address: customer?.address ?? '',
  countryCode: customer?.countryCode ?? DEFAULT_COUNTRY_CODE,
  phoneNumber: customer?.phoneNumber ?? customer?.phone ?? '',
  manager: customer?.manager ?? '',
  email: customer?.email ?? '',
});

const CustomerList = () => {
  const { showNotification } = useApp();
  const { activeOrgId, activeOrgType } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState(buildFormData());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const isReadOnly = activeOrgType !== 'MANUFACTURER';
  const customerQuery = useMemo(
    () => buildQueryString({ orgId: activeOrgId }),
    [activeOrgId]
  );

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const data = await requestJSON(`/customers${customerQuery}`);
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      showNotification(error?.message || '고객 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [customerQuery]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const lowerTerm = searchTerm.toLowerCase();
    return customers.filter((customer) => {
      const searchable = [
        customer?.name,
        customer?.code,
        customer?.manager,
        customer?.address,
        customer?.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(lowerTerm);
    });
  }, [customers, searchTerm]);

  const handleAdd = () => {
    if (isReadOnly) {
      showNotification('현재 조직에서는 고객 정보를 수정할 수 없습니다.', 'info');
      return;
    }
    setEditingCustomer(null);
    setFormData(buildFormData());
    setDrawerOpen(true);
  };

  const handleRowDoubleClick = (customer) => {
    setEditingCustomer(customer);
    setFormData(buildFormData(customer));
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setEditingCustomer(null);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    if (saving || isReadOnly) return;

    const code = String(formData.code || '').trim().toUpperCase();
    const name = String(formData.name || '').trim();
    if (!code) {
      showNotification('고객 코드를 입력해 주세요.', 'error');
      return;
    }
    if (!name) {
      showNotification('고객명을 입력해 주세요.', 'error');
      return;
    }

    setSaving(true);
    const payload = {
      code,
      name,
      address: String(formData.address || '').trim(),
      countryCode: String(formData.countryCode || '').trim(),
      phoneNumber: String(formData.phoneNumber || '').trim(),
      manager: String(formData.manager || '').trim(),
      email: String(formData.email || '').trim(),
    };

    try {
      const isEdit = Boolean(editingCustomer?.id);
      const data = await requestJSON(
        isEdit
          ? `/customers/${editingCustomer.id}${customerQuery}`
          : `/customers${customerQuery}`,
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (isEdit) {
        setCustomers((prev) => prev.map((item) => (item.id === data.id ? data : item)));
      } else {
        setCustomers((prev) => [...prev, data]);
      }

      showNotification(isEdit ? '고객 정보가 수정되었습니다.' : '고객이 등록되었습니다.', 'success');
      handleCloseDrawer();
    } catch (error) {
      showNotification(error?.message || '고객 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = Boolean(editingCustomer?.id);
  const drawerTitle = isEditing ? '고객 정보 수정' : '고객 등록';

  return (
    <AppPageContainer>
      <Stack spacing={1.5}>
        <Box
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            justifyContent: 'space-between',
            alignItems: { xs: 'stretch', sm: 'center' },
            gap: 1,
          }}
        >
          <SearchInput
            placeholder="고객명, 코드, 담당자 또는 주소 검색..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            sx={{ width: { xs: '100%', sm: 420 } }}
          />
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            disabled={isReadOnly}
          >
            고객 추가
          </Button>
        </Box>

        <Paper variant="outlined" sx={{ width: '100%' }}>
          <TableContainer>
            <Table stickyHeader size="small">
              <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>고객 코드</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>고객명</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>담당자</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>연락처</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>이메일</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>등록일</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && (
                  <TableStatusRow colSpan={6} message="불러오는 중..." sx={{ py: 2 }} />
                )}
                {!loading && filteredCustomers.length === 0 && (
                  <TableStatusRow colSpan={6} message="등록된 고객이 없습니다." sx={{ py: 2 }} />
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
                    <TableCell>
                      {customer.phone ||
                        combinePhone(customer.countryCode, customer.phoneNumber) ||
                        '-'}
                    </TableCell>
                    <TableCell>{customer.email || '-'}</TableCell>
                    <TableCell>{formatDate(customer.registeredAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={handleCloseDrawer}
        PaperProps={{
          sx: {
            ...TOP_OFFSET_DRAWER_PAPER_SX,
            width: { xs: '100%', sm: 520 },
          },
        }}
      >
        <Box
          sx={{
            p: 3,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            overflowY: 'auto',
          }}
        >
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {drawerTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                고객 기본 정보를 입력합니다.
              </Typography>
            </Box>
            <IconButton onClick={handleCloseDrawer} disabled={saving} aria-label="닫기">
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Stack spacing={1.8}>
            <TextField
              fullWidth
              required
              label="고객 코드"
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              disabled={saving || isReadOnly}
            />
            <TextField
              fullWidth
              required
              label="고객명"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={saving || isReadOnly}
            />
            <TextField
              fullWidth
              label="주소"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              disabled={saving || isReadOnly}
            />
            <TextField
              fullWidth
              label="담당자"
              name="manager"
              value={formData.manager}
              onChange={handleInputChange}
              disabled={saving || isReadOnly}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="국가번호"
                name="countryCode"
                value={formData.countryCode}
                onChange={handleInputChange}
                disabled={saving || isReadOnly}
              />
              <TextField
                fullWidth
                label="전화번호"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                disabled={saving || isReadOnly}
              />
            </Stack>

            <TextField
              fullWidth
              label="이메일"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={saving || isReadOnly}
            />
          </Stack>

          <Box sx={{ mt: 'auto', pt: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
              <Button
                fullWidth
                variant="outlined"
                onClick={handleCloseDrawer}
                disabled={saving}
              >
                닫기
              </Button>
              {!isReadOnly ? (
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                >
                  {saving ? '저장 중...' : '저장'}
                </Button>
              ) : null}
            </Stack>
          </Box>
        </Box>
      </Drawer>
    </AppPageContainer>
  );
};

export default CustomerList;
