import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getUiMessage } from '../../../constants/uiMessages';
import { getStaticOptionLabel } from '../../../constants/staticOptionRegistry';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { resolveCustomerDisplayName } from '../../../utils/appLanguage';
import {
  combinePhone,
  formatCustomerDate,
  resolveCountryForDisplay,
} from './customerFormShared';

const resolveCustomerWorkspaceTabLabel = (languageCode, customer) => {
  const displayName = resolveCustomerDisplayName(customer, languageCode) || customer?.code || '-';
  if (languageCode === 'ko') return `고객: ${displayName}`;
  if (languageCode === 'vi') return `Khach hang: ${displayName}`;
  return `Customer: ${displayName}`;
};

const CustomerList = () => {
  const { showNotification, navigateToPath } = useAppActions();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();

  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);

  const customerQuery = useMemo(() => buildQueryString({ orgId: activeOrgId }), [activeOrgId]);
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
      manager: getUiMessage('customerBoard.manager', 'Manager', languageCode),
      contact: getUiMessage('customerBoard.contact', 'Contact', languageCode),
      email: getUiMessage('customerBoard.email', 'Email', languageCode),
      registeredAt: getUiMessage('customerBoard.registeredAt', 'Registered', languageCode),
      loadingMessage: getUiMessage('customerBoard.loadingMessage', 'Loading customers...', languageCode),
      emptyMessage: getUiMessage('customerBoard.emptyMessage', 'No customers found.', languageCode),
      fetchError: getUiMessage('customerBoard.fetchError', 'Failed to load customer list.', languageCode),
      openDetail: languageCode === 'ko' ? '상세' : languageCode === 'vi' ? 'Chi tiet' : 'Detail',
      openPricing:
        languageCode === 'ko' ? '단가' : languageCode === 'vi' ? 'Don gia' : 'Pricing',
      actions: languageCode === 'ko' ? '작업' : languageCode === 'vi' ? 'Tac vu' : 'Actions',
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

  const openCustomerDetail = useCallback(
    (customer) => {
      navigateToPath(`/customer/${customer.id}`, {
        label: resolveCustomerWorkspaceTabLabel(languageCode, customer),
      });
    },
    [languageCode, navigateToPath]
  );

  const openCustomerPricing = useCallback(
    (customer) => {
      navigateToPath(`/customer-pricing?customerId=${customer.id}`, {
        label: customerText.openPricing,
      });
    },
    [customerText.openPricing, navigateToPath]
  );

  const handleAdd = useCallback(() => {
    navigateToPath('/customer/new', {
      label: languageCode === 'ko' ? '고객 추가' : languageCode === 'vi' ? 'Them khach hang' : 'Add Customer',
    });
  }, [languageCode, navigateToPath]);

  return (
    <AppPageContainer
      title={customerText.title}
      titleActions={
        <Button variant="contained" onClick={handleAdd}>
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
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.code}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.name}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.country}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.manager}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.contact}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.email}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>{customerText.registeredAt}</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }} align="center">
                  {customerText.actions}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && (
                <TableStatusRow colSpan={8} message={customerText.loadingMessage} sx={{ py: 2 }} />
              )}
              {!loading && filteredCustomers.length === 0 && (
                <TableStatusRow colSpan={8} message={customerText.emptyMessage} sx={{ py: 2 }} />
              )}
              {filteredCustomers.map((customer) => {
                const countryCodeForDisplay = resolveCountryForDisplay(customer);
                const countryLabel = countryCodeForDisplay
                  ? getStaticOptionLabel('country', countryCodeForDisplay, countryCodeForDisplay, languageCode)
                  : '-';

                return (
                  <TableRow
                    key={customer.id}
                    hover
                    onDoubleClick={() => openCustomerDetail(customer)}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>{customer.code || '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="text"
                        onClick={() => openCustomerDetail(customer)}
                        sx={{ px: 0, minWidth: 0, justifyContent: 'flex-start', textTransform: 'none' }}
                      >
                        {resolveCustomerDisplayName(customer, languageCode) || '-'}
                      </Button>
                    </TableCell>
                    <TableCell>{countryLabel || '-'}</TableCell>
                    <TableCell>{customer.manager || '-'}</TableCell>
                    <TableCell>
                      {customer.phone || combinePhone(customer.countryCode, customer.phoneNumber) || '-'}
                    </TableCell>
                    <TableCell>{customer.email || '-'}</TableCell>
                    <TableCell>{formatCustomerDate(customer.registeredAt, languageCode)}</TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={1} justifyContent="center">
                        <Button size="small" variant="outlined" onClick={() => openCustomerDetail(customer)}>
                          {customerText.openDetail}
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => openCustomerPricing(customer)}
                        >
                          {customerText.openPricing}
                        </Button>
                      </Stack>
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
};

export default CustomerList;
