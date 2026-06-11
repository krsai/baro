import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  MenuItem,
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
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { getStaticOptionLabel, getStaticOptionOptions } from '../../../constants/staticOptionRegistry';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { TOP_OFFSET_DRAWER_PAPER_SX } from '../../../constants/layout';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { resolveCustomerDisplayName } from '../../../utils/appLanguage';

const COUNTRY_CODE_BY_COUNTRY = {
  KR: '+82',
  VN: '+84',
};

const DEFAULT_COUNTRY = 'VN';
const DEFAULT_COUNTRY_CODE = COUNTRY_CODE_BY_COUNTRY[DEFAULT_COUNTRY];

const normalizeCountry = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'KR' || normalized === 'VN' ? normalized : '';
};

const inferCountryFromCountryCode = (value) => {
  const normalizedCode = String(value || '').trim();
  if (normalizedCode === COUNTRY_CODE_BY_COUNTRY.KR) return 'KR';
  if (normalizedCode === COUNTRY_CODE_BY_COUNTRY.VN) return 'VN';
  return '';
};

const resolveDefaultCountryCode = (country) =>
  COUNTRY_CODE_BY_COUNTRY[normalizeCountry(country)] || DEFAULT_COUNTRY_CODE;

const resolveCountryForForm = (customer) => {
  const fromPayload = normalizeCountry(customer?.country);
  if (fromPayload) return fromPayload;
  const fromCode = inferCountryFromCountryCode(customer?.countryCode);
  if (fromCode) return fromCode;
  return DEFAULT_COUNTRY;
};
const resolveCountryForDisplay = (customer) => {
  const fromPayload = normalizeCountry(customer?.country);
  if (fromPayload) return fromPayload;
  return inferCountryFromCountryCode(customer?.countryCode);
};

const formatDate = (value, languageCode) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const locale = languageCode === 'ko' ? 'ko-KR' : languageCode === 'vi' ? 'vi-VN' : 'en-US';
  return date.toLocaleDateString(locale);
};

const combinePhone = (countryCode, phoneNumber) =>
  [String(countryCode || '').trim(), String(phoneNumber || '').trim()].filter(Boolean).join(' ');

const buildFormData = (customer) => {
  const country = resolveCountryForForm(customer);
  const countryCode =
    String(customer?.countryCode || '').trim() || resolveDefaultCountryCode(country);
  return {
    code: customer?.code ?? '',
    name: customer?.name ?? '',
    nameKo: customer?.nameKo ?? '',
    nameVi: customer?.nameVi ?? '',
    country,
    address: customer?.address ?? '',
    countryCode,
    phoneNumber: customer?.phoneNumber ?? customer?.phone ?? '',
    manager: customer?.manager ?? '',
    email: customer?.email ?? '',
  };
};


const CustomerList = () => {
  const { showNotification } = useAppActions();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();

  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [formData, setFormData] = useState(buildFormData());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const customerQuery = useMemo(() => buildQueryString({ orgId: activeOrgId }), [activeOrgId]);
  const countryOptions = useMemo(
    () => getStaticOptionOptions('country', languageCode),
    [languageCode]
  );
  const countryOptionByCode = useMemo(
    () => new Map(countryOptions.map((option) => [String(option?.value || ''), option])),
    [countryOptions]
  );
  const customerText = useMemo(
    () => ({
      title: getUiMessage('customerBoard.title', 'Customer', languageCode),
      searchPlaceholder: getUiMessage(
        'customerBoard.searchPlaceholder',
        'Search customer name, code, manager, or address...',
        languageCode
      ),
      addCustomer: getUiMessage('customerBoard.addCustomer', 'Add Customer', languageCode),
      code: getUiMessage('customerBoard.code', 'Customer Code', languageCode),
      name: getUiMessage('customerBoard.name', 'Customer Name', languageCode),
      country: getUiMessage('customerBoard.country', 'Country', languageCode),
      address: getUiMessage('customerBoard.address', 'Address', languageCode),
      manager: getUiMessage('customerBoard.manager', 'Manager', languageCode),
      contact: getUiMessage('customerBoard.contact', 'Contact', languageCode),
      email: getUiMessage('customerBoard.email', 'Email', languageCode),
      registeredAt: getUiMessage('customerBoard.registeredAt', 'Registered', languageCode),
      loadingMessage: getUiMessage('customerBoard.loadingMessage', 'Loading customers...', languageCode),
      emptyMessage: getUiMessage('customerBoard.emptyMessage', 'No customers found.', languageCode),
      createTitle: getUiMessage('customerBoard.createTitle', 'Add Customer', languageCode),
      editTitle: getUiMessage('customerBoard.editTitle', 'Edit Customer', languageCode),
      drawerDescription: getUiMessage(
        'customerBoard.drawerDescription',
        'Enter the customer basic information.',
        languageCode
      ),
      countryCode: getUiMessage('customerBoard.countryCode', 'Country Code', languageCode),
      phoneNumber: getUiMessage('customerBoard.phoneNumber', 'Phone Number', languageCode),
      fetchError: getUiMessage(
        'customerBoard.fetchError',
        'Failed to load customer list.',
        languageCode
      ),
      saveError: getUiMessage(
        'customerBoard.saveError',
        'An error occurred while saving customer information.',
        languageCode
      ),
      createSuccess: getUiMessage(
        'customerBoard.createSuccess',
        'Customer has been created.',
        languageCode
      ),
      updateSuccess: getUiMessage(
        'customerBoard.updateSuccess',
        'Customer information has been updated.',
        languageCode
      ),
      codeRequired: getUiMessage(
        'customerBoard.codeRequired',
        'Please enter a customer code.',
        languageCode
      ),
      nameRequired: getUiMessage(
        'customerBoard.nameRequired',
        'Please enter a customer name.',
        languageCode
      ),
    }),
    [languageCode]
  );

  const fetchCustomers = useCallback(async () => {
    if (!activeOrgId) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    try {
      const data = await requestJSON(`/customers${customerQuery}`);
      setCustomers(Array.isArray(data) ? data : []);
    } catch (error) {
      showNotification(error?.message || customerText.fetchError, 'error');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, customerQuery, customerText.fetchError, showNotification]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const lowerTerm = searchTerm.toLowerCase();
    return customers.filter((customer) => {
      const countryCodeForDisplay = resolveCountryForDisplay(customer);
      const localizedCountryLabel = countryCodeForDisplay
        ? getStaticOptionLabel('country', countryCodeForDisplay, countryCodeForDisplay, languageCode)
        : '';
      const searchable = [
        customer?.name,
        customer?.nameKo,
        customer?.nameVi,
        customer?.code,
        customer?.manager,
        customer?.address,
        customer?.email,
        customer?.country,
        localizedCountryLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchable.includes(lowerTerm);
    });
  }, [customers, languageCode, searchTerm]);

  const handleAdd = () => {
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

  const handleCountryChange = (event) => {
    const nextCountry = normalizeCountry(event.target.value) || DEFAULT_COUNTRY;
    setFormData((prev) => ({
      ...prev,
      country: nextCountry,
      // Auto-align to selected country, but users can still edit this field manually afterward.
      countryCode: resolveDefaultCountryCode(nextCountry),
    }));
  };

  const handleSave = async () => {
    if (saving) return;

    const code = String(formData.code || '').trim().toUpperCase();
    const name = String(formData.name || '').trim();
    if (!code) {
      showNotification(customerText.codeRequired, 'error');
      return;
    }
    if (!name) {
      showNotification(customerText.nameRequired, 'error');
      return;
    }

    setSaving(true);
    const payload = {
      code,
      name,
      nameKo: String(formData.nameKo || '').trim() || null,
      nameVi: String(formData.nameVi || '').trim() || null,
      country: normalizeCountry(formData.country) || null,
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

      showNotification(isEdit ? customerText.updateSuccess : customerText.createSuccess, 'success');
      handleCloseDrawer();
    } catch (error) {
      showNotification(error?.message || customerText.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const isEditing = Boolean(editingCustomer?.id);
  const drawerTitle = isEditing ? customerText.editTitle : customerText.createTitle;

  return (
    <AppPageContainer
      title={customerText.title}
      titleActions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
          {customerText.addCustomer}
        </Button>
      }
      toolbar={
        <PageToolbar
          left={
            <SearchInput
              placeholder={customerText.searchPlaceholder}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          }
        />
      }
    >
      <Paper variant="outlined" sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
        <TableContainer>
          <Table stickyHeader size="small">
            <TableHead sx={{ backgroundColor: '#f5f5f5' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.code}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.name}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.country}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.manager}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.contact}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.email}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.registeredAt}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableStatusRow colSpan={7} message={customerText.loadingMessage} sx={{ py: 2 }} />
              )}
              {!loading && filteredCustomers.length === 0 && (
                <TableStatusRow colSpan={7} message={customerText.emptyMessage} sx={{ py: 2 }} />
              )}
              {filteredCustomers.map((customer) => (
                <TableRow
                  key={customer.id}
                  hover
                  onDoubleClick={() => handleRowDoubleClick(customer)}
                  sx={{ cursor: 'pointer' }}
                >
                  {/*
                    목록은 country가 비어 있어도 countryCode로 국가를 추론해 표시한다.
                  */}
                  {(() => {
                    const countryCodeForDisplay = resolveCountryForDisplay(customer);
                    const countryLabel = countryCodeForDisplay
                      ? getStaticOptionLabel(
                          'country',
                          countryCodeForDisplay,
                          countryCodeForDisplay,
                          languageCode
                        )
                      : '-';
                    return (
                      <>
                  <TableCell>{customer.code || '-'}</TableCell>
                  <TableCell>{resolveCustomerDisplayName(customer, languageCode) || '-'}</TableCell>
                  <TableCell>{countryLabel || '-'}</TableCell>
                  <TableCell>{customer.manager || '-'}</TableCell>
                  <TableCell>
                    {customer.phone || combinePhone(customer.countryCode, customer.phoneNumber) || '-'}
                  </TableCell>
                  <TableCell>{customer.email || '-'}</TableCell>
                  <TableCell>{formatDate(customer.registeredAt, languageCode)}</TableCell>
                      </>
                    );
                  })()}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

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
                {customerText.drawerDescription}
              </Typography>
            </Box>
            <IconButton
              onClick={handleCloseDrawer}
              disabled={saving}
              aria-label={getUiMessage('common.close', 'Close', languageCode)}
            >
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <Divider sx={{ mb: 2 }} />

          <Stack spacing={1.8}>
            <TextField
              fullWidth
              required
              label={customerText.code}
              name="code"
              value={formData.code}
              onChange={handleInputChange}
              disabled={saving}
            />
            <Stack direction="row" spacing={1.5}>
              <TextField
                fullWidth
                required
                label="고객명 (영문)"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                disabled={saving}
              />
              <TextField
                fullWidth
                label="고객명 (한글)"
                name="nameKo"
                value={formData.nameKo}
                onChange={handleInputChange}
                disabled={saving}
              />
              <TextField
                fullWidth
                label="고객명 (베트남어)"
                name="nameVi"
                value={formData.nameVi}
                onChange={handleInputChange}
                disabled={saving}
              />
            </Stack>
            <TextField
              fullWidth
              select
              label={customerText.country}
              name="country"
              value={normalizeCountry(formData.country) || DEFAULT_COUNTRY}
              onChange={handleCountryChange}
              disabled={saving}
            >
              {countryOptions.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
              {!countryOptionByCode.has(formData.country) && normalizeCountry(formData.country) ? (
                <MenuItem value={formData.country}>{formData.country}</MenuItem>
              ) : null}
            </TextField>
            <TextField
              fullWidth
              label={customerText.address}
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              disabled={saving}
            />
            <TextField
              fullWidth
              label={customerText.manager}
              name="manager"
              value={formData.manager}
              onChange={handleInputChange}
              disabled={saving}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label={customerText.countryCode}
                name="countryCode"
                value={formData.countryCode}
                onChange={handleInputChange}
                disabled={saving}
              />
              <TextField
                fullWidth
                label={customerText.phoneNumber}
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleInputChange}
                disabled={saving}
              />
            </Stack>

            <TextField
              fullWidth
              label={customerText.email}
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              disabled={saving}
            />
          </Stack>

          <Box sx={{ mt: 'auto', pt: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
              <Button fullWidth variant="outlined" onClick={handleCloseDrawer} disabled={saving}>
                {getUiMessage('common.close', 'Close', languageCode)}
              </Button>
              <SaveButton
                fullWidth
                onClick={handleSave}
                disabled={saving}
                loading={saving}
              />
            </Stack>
          </Box>
        </Box>
      </Drawer>
    </AppPageContainer>
  );
};

export default CustomerList;
