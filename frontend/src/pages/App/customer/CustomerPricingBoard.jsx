import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getStaticOptionOptions } from '../../../constants/staticOptionRegistry';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { resolveCustomerDisplayName } from '../../../utils/appLanguage';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { ST_STANDARD_BUCKETS } from '../../../utils/processTime';
import { fetchStyles } from '../../../utils/styleApi';
import { resolveCustomerStyleOwnerOrgId } from './customerFormShared';

const HIDDEN_BUCKETS = new Set([2, 20]);
const PRICE_BUCKETS = ST_STANDARD_BUCKETS.filter((quantity) => !HIDDEN_BUCKETS.has(quantity));

const TEXT = {
  ko: {
    title: '단가 관리',
    preview: 'UI 검토용',
    noticeTitle: '현재는 화면 시안입니다.',
    noticeBody: '입력한 값은 저장되지 않습니다. 화면 구성을 확정한 뒤 DB와 저장 기능을 연결합니다.',
    customer: '고객사',
    selectCustomer: '고객사를 선택하세요',
    searchStyle: '스타일명 또는 코드 검색...',
    currency: '통화',
    style: '스타일',
    styleCode: '스타일 코드',
    unitPrice: '한 벌 단가',
    noCustomer: '고객사를 선택하면 등록된 스타일의 단가표가 표시됩니다.',
    noStyles: '이 고객사에 연결된 스타일이 없습니다.',
    loadFailed: '단가 관리 화면에 필요한 정보를 불러오지 못했습니다.',
    save: '단가 저장',
    styleCount: '{count}개 스타일',
    selectedCustomer: '선택 고객',
    pricingBasis: '판매 방식',
  },
  en: {
    title: 'Price Management',
    preview: 'UI Preview',
    noticeTitle: 'This is a UI preview.',
    noticeBody: 'Values are not saved. Data storage will be connected after the layout is approved.',
    customer: 'Customer',
    selectCustomer: 'Select a customer',
    searchStyle: 'Search style name or code...',
    currency: 'Currency',
    style: 'Style',
    styleCode: 'Style Code',
    unitPrice: 'Unit Price',
    noCustomer: 'Select a customer to view the style price table.',
    noStyles: 'No styles are linked to this customer.',
    loadFailed: 'Failed to load data for the price management preview.',
    save: 'Save Prices',
    styleCount: '{count} styles',
    selectedCustomer: 'Customer',
    pricingBasis: 'Pricing Basis',
  },
  vi: {
    title: 'Quan ly don gia',
    preview: 'Ban xem truoc UI',
    noticeTitle: 'Day la ban xem truoc giao dien.',
    noticeBody: 'Gia tri nhap chua duoc luu. Chuc nang luu se duoc ket noi sau khi duyet giao dien.',
    customer: 'Khach hang',
    selectCustomer: 'Chon khach hang',
    searchStyle: 'Tim ten hoac ma style...',
    currency: 'Tien te',
    style: 'Style',
    styleCode: 'Ma style',
    unitPrice: 'Don gia / chiec',
    noCustomer: 'Chon khach hang de xem bang don gia style.',
    noStyles: 'Khong co style lien ket voi khach hang nay.',
    loadFailed: 'Khong the tai du lieu cho giao dien quan ly don gia.',
    save: 'Luu don gia',
    styleCount: '{count} style',
    selectedCustomer: 'Khach hang',
    pricingBasis: 'Hinh thuc gia',
  },
};

const getText = (languageCode) => TEXT[languageCode] || TEXT.en;
const formatMessage = (message, values = {}) =>
  Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    message
  );

const normalizePriceInput = (value) =>
  String(value ?? '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');

const CustomerPricingBoard = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const text = useMemo(() => getText(languageCode), [languageCode]);
  const pricingBasisOptions = useMemo(
    () => getStaticOptionOptions('commercialPricingBasis', languageCode),
    [languageCode]
  );

  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [styles, setStyles] = useState([]);
  const [pricingBasis, setPricingBasis] = useState('MANUFACTURING_SERVICE_PRICE');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [searchTerm, setSearchTerm] = useState('');
  const [draftPrices, setDraftPrices] = useState({});
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingStyles, setLoadingStyles] = useState(false);

  const customerQuery = useMemo(() => buildQueryString({ orgId: activeOrgId }), [activeOrgId]);
  const selectedCustomer = useMemo(
    () => customers.find((customer) => String(customer?.id) === selectedCustomerId) || null,
    [customers, selectedCustomerId]
  );

  useEffect(() => {
    let active = true;
    const loadCustomers = async () => {
      if (!activeOrgId) {
        setCustomers([]);
        return;
      }
      setLoadingCustomers(true);
      try {
        const rows = await requestJSON(`/customers${customerQuery}`, {
          skipGlobalLoading: true,
        });
        if (!active) return;
        const nextCustomers = Array.isArray(rows) ? rows : [];
        setCustomers(nextCustomers);

        const params = new URLSearchParams(window.location.search);
        const requestedCustomerId = String(params.get('customerId') || '');
        const hasRequestedCustomer = nextCustomers.some(
          (customer) => String(customer?.id) === requestedCustomerId
        );
        setSelectedCustomerId(
          hasRequestedCustomer ? requestedCustomerId : String(nextCustomers[0]?.id || '')
        );
      } catch (error) {
        if (active) showNotification(error?.message || text.loadFailed, 'error');
      } finally {
        if (active) setLoadingCustomers(false);
      }
    };
    loadCustomers();
    return () => {
      active = false;
    };
  }, [activeOrgId, customerQuery, showNotification, text.loadFailed]);

  useEffect(() => {
    let active = true;
    const loadStyles = async () => {
      if (!selectedCustomer) {
        setStyles([]);
        return;
      }
      const ownerOrgId = resolveCustomerStyleOwnerOrgId(selectedCustomer, activeOrgId);
      if (!ownerOrgId) {
        setStyles([]);
        return;
      }

      setLoadingStyles(true);
      try {
        const rows = await fetchStyles({
          orgId: activeOrgId,
          ownerOrgId,
          compact: true,
          forceRefresh: true,
          skipGlobalLoading: true,
        });
        if (!active) return;
        setStyles(
          [...rows].sort((left, right) =>
            String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
              numeric: true,
              sensitivity: 'base',
            })
          )
        );
      } catch (error) {
        if (active) showNotification(error?.message || text.loadFailed, 'error');
      } finally {
        if (active) setLoadingStyles(false);
      }
    };
    loadStyles();
    return () => {
      active = false;
    };
  }, [activeOrgId, selectedCustomer, showNotification, text.loadFailed]);

  const filteredStyles = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return styles;
    return styles.filter((style) =>
      [style?.name, style?.styleCode, style?.code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [searchTerm, styles]);

  const handlePriceChange = useCallback(
    (styleId, bucketQuantity, value) => {
      const key = `${selectedCustomerId}:${pricingBasis}:${styleId}:${bucketQuantity}`;
      setDraftPrices((previous) => ({ ...previous, [key]: normalizePriceInput(value) }));
    },
    [pricingBasis, selectedCustomerId]
  );

  const resolveDraftPrice = useCallback(
    (styleId, bucketQuantity) =>
      draftPrices[`${selectedCustomerId}:${pricingBasis}:${styleId}:${bucketQuantity}`] || '',
    [draftPrices, pricingBasis, selectedCustomerId]
  );

  const customerLabel = selectedCustomer
    ? resolveCustomerDisplayName(selectedCustomer, languageCode) || selectedCustomer.code || '-'
    : '-';

  return (
    <AppPageContainer
      title={text.title}
      titleActions={
        <Stack direction="row" spacing={1} alignItems="center">
          <Chip size="small" color="warning" variant="outlined" label={text.preview} />
          <Button variant="contained" startIcon={<LockOutlinedIcon />} disabled>
            {text.save}
          </Button>
        </Stack>
      }
      toolbar={
        <PageToolbar
          left={
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.25}
              alignItems={{ lg: 'center' }}
              sx={{ width: '100%' }}
            >
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel>{text.customer}</InputLabel>
                <Select
                  value={selectedCustomerId}
                  label={text.customer}
                  onChange={(event) => {
                    setSelectedCustomerId(String(event.target.value));
                    setSearchTerm('');
                  }}
                  disabled={loadingCustomers}
                >
                  {customers.length === 0 && (
                    <MenuItem value="">
                      <em>{text.selectCustomer}</em>
                    </MenuItem>
                  )}
                  {customers.map((customer) => (
                    <MenuItem key={customer.id} value={String(customer.id)}>
                      {resolveCustomerDisplayName(customer, languageCode) || customer.code || customer.id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <ToggleButtonGroup
                size="small"
                value={pricingBasis}
                exclusive
                onChange={(_event, value) => {
                  if (value) setPricingBasis(value);
                }}
              >
                {pricingBasisOptions.map((option) => (
                  <ToggleButton key={option.value} value={option.value}>
                    {option.label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>

              <FormControl size="small" sx={{ minWidth: 110 }}>
                <InputLabel>{text.currency}</InputLabel>
                <Select
                  value={currencyCode}
                  label={text.currency}
                  onChange={(event) => setCurrencyCode(event.target.value)}
                >
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="VND">VND</MenuItem>
                  <MenuItem value="KRW">KRW</MenuItem>
                </Select>
              </FormControl>

              <Box sx={{ minWidth: 240, flex: '1 1 320px' }}>
                <SearchInput
                  placeholder={text.searchStyle}
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                />
              </Box>
            </Stack>
          }
        />
      }
    >
      <Stack spacing={2}>
        <Alert severity="info">
          <Typography variant="body2" sx={{ fontWeight: 800 }}>
            {text.noticeTitle}
          </Typography>
          <Typography variant="body2">{text.noticeBody}</Typography>
        </Alert>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Chip label={`${text.selectedCustomer}: ${customerLabel}`} />
          <Chip
            label={formatMessage(text.styleCount, { count: styles.length })}
            variant="outlined"
          />
          <Chip label={`${text.currency}: ${currencyCode}`} variant="outlined" />
        </Stack>

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loadingCustomers || loadingStyles ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              {Array.from({ length: 5 }, (_value, index) => (
                <Skeleton key={index} height={44} variant="rounded" />
              ))}
            </Stack>
          ) : (
            <TableContainer sx={{ maxHeight: 'calc(100vh - 310px)' }}>
              <Table stickyHeader size="small" sx={{ minWidth: 1450 }}>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 190, fontWeight: 800, position: 'sticky', left: 0, zIndex: 4 }}>
                      {text.style}
                    </TableCell>
                    <TableCell sx={{ minWidth: 120, fontWeight: 800, position: 'sticky', left: 190, zIndex: 4 }}>
                      {text.styleCode}
                    </TableCell>
                    {PRICE_BUCKETS.map((quantity) => (
                      <TableCell key={quantity} align="center" sx={{ minWidth: 92, fontWeight: 800 }}>
                        {formatNumberWithCommas(quantity)}~
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!selectedCustomer && (
                    <TableStatusRow colSpan={PRICE_BUCKETS.length + 2} message={text.noCustomer} />
                  )}
                  {selectedCustomer && filteredStyles.length === 0 && (
                    <TableStatusRow colSpan={PRICE_BUCKETS.length + 2} message={text.noStyles} />
                  )}
                  {filteredStyles.map((style) => (
                    <TableRow key={style.id} hover>
                      <TableCell
                        sx={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 1,
                          backgroundColor: 'background.paper',
                          fontWeight: 700,
                        }}
                      >
                        {style.name || '-'}
                      </TableCell>
                      <TableCell
                        sx={{
                          position: 'sticky',
                          left: 190,
                          zIndex: 1,
                          backgroundColor: 'background.paper',
                          color: 'text.secondary',
                        }}
                      >
                        {style.styleCode || style.code || '-'}
                      </TableCell>
                      {PRICE_BUCKETS.map((quantity) => (
                        <TableCell key={`${style.id}:${quantity}`} align="center" sx={{ px: 0.75 }}>
                          <TextField
                            value={resolveDraftPrice(style.id, quantity)}
                            onChange={(event) =>
                              handlePriceChange(style.id, quantity, event.target.value)
                            }
                            size="small"
                            placeholder="-"
                            inputProps={{
                              inputMode: 'decimal',
                              'aria-label': `${style.name || style.id} ${quantity} ${text.unitPrice}`,
                              style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
                            }}
                            sx={{ width: 80 }}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default CustomerPricingBoard;
