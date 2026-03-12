import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
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
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { formatDigitsWithCommas, parseNumberLike } from '../../../utils/numberFormat';

const DEFAULT_COUNTRY_CODE = '+84';
const WORK_SECONDS_PER_MONTH = 26 * 8 * 60 * 60;

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
};

const combinePhone = (countryCode, phoneNumber) =>
  [String(countryCode || '').trim(), String(phoneNumber || '').trim()].filter(Boolean).join(' ');

const parseNumber = (value) => parseNumberLike(value);

const buildBrandOption = (organization) => ({
  id: Number(organization?.id) || null,
  code: organization?.code ?? '',
  name: organization?.name ?? '',
  address: organization?.address ?? '',
  countryCode: organization?.countryCode ?? DEFAULT_COUNTRY_CODE,
  phoneNumber: organization?.phone ?? '',
  manager: organization?.representative ?? '',
  email: organization?.email ?? '',
  targetMonthlyWage: organization?.targetMonthlyWage ?? '',
  wagePerSecond: organization?.wagePerSecond ?? '',
});

const buildFormData = (customer) => ({
  brandOrgId: customer?.brandOrgId ?? null,
  code: customer?.code ?? '',
  name: customer?.name ?? '',
  address: customer?.address ?? '',
  countryCode: customer?.countryCode ?? DEFAULT_COUNTRY_CODE,
  phoneNumber: customer?.phoneNumber ?? customer?.phone ?? '',
  manager: customer?.manager ?? '',
  email: customer?.email ?? '',
  targetMonthlyWage: customer?.targetMonthlyWage ?? '',
  wagePerSecond: customer?.wagePerSecond ?? '',
});

const CustomerList = () => {
  const { showNotification } = useApp();
  const { activeOrgId, activeOrgType } = useAuth();

  const [customers, setCustomers] = useState([]);
  const [brandOrganizations, setBrandOrganizations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [selectedBrandOption, setSelectedBrandOption] = useState(null);
  const [formData, setFormData] = useState(buildFormData());
  const [loading, setLoading] = useState(false);
  const [loadingBrandOrganizations, setLoadingBrandOrganizations] = useState(false);
  const [saving, setSaving] = useState(false);
  const isReadOnly = activeOrgType === 'BRAND';
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

  const fetchBrandOrganizations = async () => {
    setLoadingBrandOrganizations(true);
    try {
      const data = await requestJSON('/organizations');
      const rows = Array.isArray(data) ? data : [];
      const nextOptions = rows
        .filter((row) => String(row?.type || '').toUpperCase() === 'BRAND')
        .map(buildBrandOption)
        .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')));
      setBrandOrganizations(nextOptions);
    } catch (_error) {
      setBrandOrganizations([]);
    } finally {
      setLoadingBrandOrganizations(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [customerQuery]);

  useEffect(() => {
    fetchBrandOrganizations();
  }, []);

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

  const linkedBrandIdSet = useMemo(
    () =>
      new Set(
        customers
          .map((customer) => Number(customer?.brandOrgId))
          .filter((brandOrgId) => Number.isFinite(brandOrgId) && brandOrgId > 0)
      ),
    [customers]
  );

  const selectableBrandOptions = useMemo(() => {
    const editingBrandOrgId = Number(editingCustomer?.brandOrgId);
    return brandOrganizations.filter((option) => {
      if (!option?.id) return false;
      if (Number.isFinite(editingBrandOrgId) && option.id === editingBrandOrgId) {
        return true;
      }
      return !linkedBrandIdSet.has(option.id);
    });
  }, [brandOrganizations, editingCustomer?.brandOrgId, linkedBrandIdSet]);

  const computedWagePerSecond = useMemo(() => {
    const targetMonthlyWage = parseNumber(formData.targetMonthlyWage);
    if (Number.isFinite(targetMonthlyWage)) {
      return Math.round((targetMonthlyWage / WORK_SECONDS_PER_MONTH) * 100) / 100;
    }
    const fallback = parseNumber(formData.wagePerSecond);
    return Number.isFinite(fallback) ? fallback : Number.NaN;
  }, [formData.targetMonthlyWage, formData.wagePerSecond]);

  const computedWageDisplay = Number.isFinite(computedWagePerSecond)
    ? computedWagePerSecond.toFixed(2)
    : '';

  const handleAdd = () => {
    if (isReadOnly) {
      showNotification('브랜드 조직은 고객 정보를 수정할 수 없습니다. 조회만 가능합니다.', 'info');
      return;
    }
    setEditingCustomer(null);
    setSelectedBrandOption(null);
    setFormData(buildFormData());
    setDrawerOpen(true);
  };

  const handleRowDoubleClick = (customer) => {
    setEditingCustomer(customer);
    setSelectedBrandOption(
      brandOrganizations.find((option) => option.id === Number(customer?.brandOrgId)) || null
    );
    setFormData(buildFormData(customer));
    setDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    if (saving) return;
    setDrawerOpen(false);
    setEditingCustomer(null);
    setSelectedBrandOption(null);
  };

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    if (name === 'targetMonthlyWage') {
      setFormData((prev) => ({
        ...prev,
        targetMonthlyWage: value.replace(/[^\d]/g, ''),
      }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleBrandOptionChange = (_event, nextOption) => {
    setSelectedBrandOption(nextOption || null);
    if (!nextOption) {
      setFormData((prev) => ({ ...prev, brandOrgId: null }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      brandOrgId: nextOption.id,
      code: nextOption.code || '',
      name: nextOption.name || '',
      address: nextOption.address || '',
      countryCode: nextOption.countryCode || DEFAULT_COUNTRY_CODE,
      phoneNumber: nextOption.phoneNumber || '',
      manager: nextOption.manager || '',
      email: nextOption.email || '',
      targetMonthlyWage: nextOption.targetMonthlyWage ?? '',
      wagePerSecond: nextOption.wagePerSecond ?? '',
    }));
  };

  const handleSave = async () => {
    if (saving || isReadOnly) return;

    const code = String(formData.code || '').trim().toUpperCase();
    const name = String(formData.name || '').trim();
    if (!code) {
      showNotification('브랜드 코드를 입력해 주세요.', 'error');
      return;
    }
    if (!name) {
      showNotification('브랜드 업체명을 입력해 주세요.', 'error');
      return;
    }

    setSaving(true);
    const targetMonthlyWage = parseNumber(formData.targetMonthlyWage);
    const payload = {
      brandOrgId: formData.brandOrgId || undefined,
      code,
      name,
      address: String(formData.address || '').trim(),
      countryCode: String(formData.countryCode || '').trim(),
      phoneNumber: String(formData.phoneNumber || '').trim(),
      manager: String(formData.manager || '').trim(),
      email: String(formData.email || '').trim(),
      targetMonthlyWage: Number.isFinite(targetMonthlyWage) ? targetMonthlyWage : null,
      wagePerSecond: Number.isFinite(computedWagePerSecond) ? computedWagePerSecond : null,
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
      await fetchBrandOrganizations();

      showNotification(
        isEdit ? '브랜드 업체 정보가 수정되었습니다.' : '브랜드 업체가 등록되었습니다.',
        'success'
      );
      handleCloseDrawer();
    } catch (error) {
      showNotification(error?.message || '브랜드 업체 저장 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = Boolean(editingCustomer?.id);
  const isDrawerReadOnly = isReadOnly;
  const drawerTitle = isEditing ? '브랜드 업체 수정' : '브랜드 업체 등록';
  const selectedBrandSummary = selectedBrandOption
    ? `${selectedBrandOption.name} (${selectedBrandOption.code || '-'})`
    : '';

  return (
    <AppPageContainer>
      <Stack spacing={1.5}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <SearchInput
            placeholder="고객명, 코드, 담당자 또는 주소 검색..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            sx={{ width: 420 }}
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

        <Alert severity="info">
          고객(브랜드) 정보는 조직 공통 데이터로 공유됩니다. 한 곳에서 수정하면 연결된 다른 조직에도
          같은 정보가 반영됩니다.
        </Alert>

        {isReadOnly ? (
          <Alert severity="info">
            현재 조직은 브랜드 유형이라 고객 정보는 조회 전용입니다.
          </Alert>
        ) : null}

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
            width: { xs: '100%', sm: 520 },
          },
        }}
      >
        <Box sx={{ p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {drawerTitle}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                공장 등록과 같은 형식으로 브랜드 업체 정보를 입력합니다.
              </Typography>
            </Box>
            <IconButton onClick={handleCloseDrawer} disabled={saving} aria-label="닫기">
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Stack spacing={1.8}>
            {!isEditing ? (
              <Autocomplete
                options={selectableBrandOptions}
                value={selectedBrandOption}
                onChange={handleBrandOptionChange}
                loading={loadingBrandOrganizations}
                isOptionEqualToValue={(option, value) => Number(option?.id) === Number(value?.id)}
                getOptionLabel={(option) =>
                  option?.code ? `${option.name} (${option.code})` : option?.name || ''
                }
                noOptionsText="연결 가능한 공유 브랜드 업체가 없습니다."
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="기존 공유 브랜드 업체 선택"
                    helperText={
                      selectedBrandSummary
                        ? `${selectedBrandSummary} 정보를 불러왔습니다.`
                        : '이미 등록된 브랜드 업체를 선택하면 공유 정보를 그대로 연결합니다.'
                    }
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingBrandOrganizations ? (
                            <CircularProgress color="inherit" size={18} />
                          ) : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                    disabled={saving || isDrawerReadOnly}
                  />
                )}
              />
            ) : null}

            <Alert severity="info">
              이 화면의 수정 내용은 브랜드 조직 원본 데이터에 저장됩니다.
            </Alert>

            <TextField
              fullWidth
              required
              label="브랜드 코드"
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              disabled={saving || isDrawerReadOnly}
            />
            <TextField
              fullWidth
              required
              label="브랜드 업체명"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              disabled={saving || isDrawerReadOnly}
            />
            <TextField
              fullWidth
              label="주소"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              disabled={saving || isDrawerReadOnly}
            />
            <TextField
              fullWidth
              label="담당자"
              name="manager"
              value={formData.manager}
              onChange={handleInputChange}
              disabled={saving || isDrawerReadOnly}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="국가번호"
                name="countryCode"
                value={formData.countryCode}
                onChange={handleInputChange}
                disabled={saving || isDrawerReadOnly}
              />
              <TextField
                fullWidth
                label="전화번호"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                disabled={saving || isDrawerReadOnly}
              />
            </Stack>

            <TextField
              fullWidth
              label="이메일"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={saving || isDrawerReadOnly}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                label="월 목표 급여"
                name="targetMonthlyWage"
                value={formatDigitsWithCommas(formData.targetMonthlyWage)}
                onChange={handleInputChange}
                disabled={saving || isDrawerReadOnly}
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                helperText="월 26일, 하루 8시간 기준"
              />
              <TextField
                fullWidth
                label="초당 급여 (자동계산)"
                name="wagePerSecond"
                value={computedWageDisplay}
                InputProps={{ readOnly: true }}
                helperText="월 목표 급여 기준 자동 계산"
                sx={{ '& .MuiInputBase-root': { backgroundColor: '#f8fafc' } }}
              />
            </Stack>
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
              {!isDrawerReadOnly ? (
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
