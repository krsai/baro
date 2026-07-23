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
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
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
import { fetchStyles } from '../../../utils/styleApi';
import { resolveCustomerStyleOwnerOrgId } from './customerFormShared';

const SALES_BUCKET_PRESETS = Object.freeze([
  { id: '135', label: '1 · 3 · 5 방식', values: [1, 3, 5, 10, 30, 50, 100, 300, 500, 1000, 3000, 5000, 10000] },
  { id: '1257', label: '1 · 2 · 5 · 7 방식', values: [1, 2, 5, 7, 10, 20, 50, 70, 100, 200, 500, 700, 1000, 2000, 5000, 7000, 10000] },
]);
const TIME_BUCKET_PRESETS = Object.freeze([
  { id: 'standard', label: '표준 시간 버킷', values: [1, 3, 5, 10, 30, 50, 100, 300, 500, 1000, 3000, 5000, 10000] },
  { id: '1257', label: '1 · 2 · 5 · 7 시간 버킷', values: [1, 2, 5, 7, 10, 20, 50, 70, 100, 200, 500, 700, 1000, 2000, 5000, 7000, 10000] },
]);
const DEFAULT_SALES_BUCKETS = SALES_BUCKET_PRESETS[0].values;
const DEFAULT_TIME_BUCKETS = TIME_BUCKET_PRESETS[0].values;

const normalizeBuckets = (values) =>
  [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
    .sort((left, right) => left - right);

const resolvePresetId = (presets, buckets) => {
  const signature = normalizeBuckets(buckets).join(',');
  return presets.find((preset) => preset.values.join(',') === signature)?.id || 'custom';
};

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
    salesBuckets: '매출 단가 버킷',
    salesBucketsHelp: '고객 기본값을 정하고, 필요한 스타일만 별도 버킷으로 바꿀 수 있습니다.',
    bucketTarget: '적용 대상',
    customerDefault: '고객 기본값',
    useCustomerDefault: '고객 기본값 사용',
    useStyleBuckets: '이 스타일만 별도 설정',
    bucketPreset: '버킷 방식',
    customPreset: '직접 설정',
    quantity: '수량',
    addQuantity: '수량 추가',
    duplicateBucket: '이미 있는 수량입니다.',
    keepOneBucket: '버킷은 최소 하나가 필요합니다.',
    timeBuckets: '업체 시간 기준 버킷',
    timeBucketsHelp: '이 업체의 ST·CT 입력 화면에서 사용할 수량 구간입니다. 매출 단가 버킷과는 별도로 관리합니다.',
    organizationWide: '업체 전체 설정',
    inheritedHint: '현재 고객 기본 버킷을 사용합니다. 별도 설정을 선택하면 이 스타일만 변경할 수 있습니다.',
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
    salesBuckets: 'Sales price buckets',
    salesBucketsHelp: 'Set the customer default and override only the styles that need different buckets.',
    bucketTarget: 'Target',
    customerDefault: 'Customer default',
    useCustomerDefault: 'Use customer default',
    useStyleBuckets: 'Custom for this style',
    bucketPreset: 'Bucket pattern',
    customPreset: 'Custom',
    quantity: 'Quantity',
    addQuantity: 'Add quantity',
    duplicateBucket: 'That quantity already exists.',
    keepOneBucket: 'At least one bucket is required.',
    timeBuckets: 'Organization time buckets',
    timeBucketsHelp: 'Quantity ranges used for ST and CT entry. These are managed separately from sales price buckets.',
    organizationWide: 'Organization-wide',
    inheritedHint: 'This style currently uses the customer default. Choose custom to edit only this style.',
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
    salesBuckets: 'Moc so luong don gia',
    salesBucketsHelp: 'Dat moc mac dinh cua khach hang va chi sua rieng style can ngoai le.',
    bucketTarget: 'Doi tuong',
    customerDefault: 'Mac dinh khach hang',
    useCustomerDefault: 'Dung mac dinh khach hang',
    useStyleBuckets: 'Dat rieng cho style nay',
    bucketPreset: 'Kieu moc',
    customPreset: 'Tu dat',
    quantity: 'So luong',
    addQuantity: 'Them so luong',
    duplicateBucket: 'So luong nay da ton tai.',
    keepOneBucket: 'Can it nhat mot moc.',
    timeBuckets: 'Moc thoi gian cua cong ty',
    timeBucketsHelp: 'Moc so luong dung khi nhap ST va CT, duoc quan ly rieng voi moc don gia.',
    organizationWide: 'Toan cong ty',
    inheritedHint: 'Style nay dang dung moc mac dinh cua khach hang. Chon dat rieng de sua.',
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
  const [bucketTarget, setBucketTarget] = useState('customer');
  const [customerBuckets, setCustomerBuckets] = useState({});
  const [styleBucketModes, setStyleBucketModes] = useState({});
  const [styleBuckets, setStyleBuckets] = useState({});
  const [newSalesBucket, setNewSalesBucket] = useState('');
  const [timeBuckets, setTimeBuckets] = useState(DEFAULT_TIME_BUCKETS);
  const [newTimeBucket, setNewTimeBucket] = useState('');
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

  const customerBucketKey = selectedCustomerId || 'none';
  const selectedStyleId = bucketTarget.startsWith('style:')
    ? bucketTarget.slice('style:'.length)
    : '';
  const styleBucketKey = `${customerBucketKey}:${selectedStyleId}`;
  const selectedStyleUsesCustomBuckets =
    selectedStyleId && styleBucketModes[styleBucketKey] === 'custom';
  const resolvedCustomerBuckets = customerBuckets[customerBucketKey] || DEFAULT_SALES_BUCKETS;
  const activeSalesBuckets = selectedStyleUsesCustomBuckets
    ? styleBuckets[styleBucketKey] || resolvedCustomerBuckets
    : resolvedCustomerBuckets;
  const displayedStyles = selectedStyleId
    ? filteredStyles.filter((style) => String(style.id) === selectedStyleId)
    : filteredStyles;
  const canEditSalesBuckets = !selectedStyleId || selectedStyleUsesCustomBuckets;

  const updateActiveSalesBuckets = useCallback(
    (nextBuckets) => {
      const normalized = normalizeBuckets(nextBuckets);
      if (!normalized.length) {
        showNotification(text.keepOneBucket, 'warning');
        return;
      }
      if (selectedStyleId) {
        setStyleBuckets((previous) => ({ ...previous, [styleBucketKey]: normalized }));
      } else {
        setCustomerBuckets((previous) => ({ ...previous, [customerBucketKey]: normalized }));
      }
    },
    [customerBucketKey, selectedStyleId, showNotification, styleBucketKey, text.keepOneBucket]
  );

  const addBucket = useCallback(
    (kind) => {
      const rawValue = kind === 'sales' ? newSalesBucket : newTimeBucket;
      const quantity = Number(rawValue);
      const currentBuckets = kind === 'sales' ? activeSalesBuckets : timeBuckets;
      if (!Number.isInteger(quantity) || quantity <= 0) return;
      if (currentBuckets.includes(quantity)) {
        showNotification(text.duplicateBucket, 'warning');
        return;
      }
      if (kind === 'sales') {
        updateActiveSalesBuckets([...currentBuckets, quantity]);
        setNewSalesBucket('');
      } else {
        setTimeBuckets(normalizeBuckets([...currentBuckets, quantity]));
        setNewTimeBucket('');
      }
    },
    [
      activeSalesBuckets,
      newSalesBucket,
      newTimeBucket,
      showNotification,
      text.duplicateBucket,
      timeBuckets,
      updateActiveSalesBuckets,
    ]
  );

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
                    setBucketTarget('customer');
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

        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                {text.salesBuckets}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {text.salesBucketsHelp}
              </Typography>
            </Box>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} alignItems={{ md: 'center' }}>
              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel>{text.bucketTarget}</InputLabel>
                <Select
                  value={bucketTarget}
                  label={text.bucketTarget}
                  onChange={(event) => {
                    setBucketTarget(event.target.value);
                    setNewSalesBucket('');
                  }}
                >
                  <MenuItem value="customer">{text.customerDefault}</MenuItem>
                  {styles.map((style) => (
                    <MenuItem key={style.id} value={`style:${style.id}`}>
                      {style.name || style.styleCode || style.id}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {selectedStyleId && (
                <ToggleButtonGroup
                  size="small"
                  exclusive
                  value={selectedStyleUsesCustomBuckets ? 'custom' : 'customer'}
                  onChange={(_event, value) => {
                    if (!value) return;
                    if (value === 'custom') {
                      setStyleBuckets((previous) => ({
                        ...previous,
                        [styleBucketKey]: [...resolvedCustomerBuckets],
                      }));
                    }
                    setStyleBucketModes((previous) => ({
                      ...previous,
                      [styleBucketKey]: value,
                    }));
                  }}
                >
                  <ToggleButton value="customer">{text.useCustomerDefault}</ToggleButton>
                  <ToggleButton value="custom">{text.useStyleBuckets}</ToggleButton>
                </ToggleButtonGroup>
              )}

              <FormControl size="small" sx={{ minWidth: 190 }} disabled={!canEditSalesBuckets}>
                <InputLabel>{text.bucketPreset}</InputLabel>
                <Select
                  value={resolvePresetId(SALES_BUCKET_PRESETS, activeSalesBuckets)}
                  label={text.bucketPreset}
                  onChange={(event) => {
                    const preset = SALES_BUCKET_PRESETS.find(
                      (candidate) => candidate.id === event.target.value
                    );
                    if (preset) updateActiveSalesBuckets(preset.values);
                  }}
                >
                  {SALES_BUCKET_PRESETS.map((preset) => (
                    <MenuItem key={preset.id} value={preset.id}>{preset.label}</MenuItem>
                  ))}
                  <MenuItem value="custom" disabled>{text.customPreset}</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {selectedStyleId && !selectedStyleUsesCustomBuckets && (
              <Alert severity="info" icon={false}>{text.inheritedHint}</Alert>
            )}

            <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" alignItems="center">
              {activeSalesBuckets.map((quantity) => (
                <Chip
                  key={quantity}
                  label={formatNumberWithCommas(quantity)}
                  color={selectedStyleUsesCustomBuckets ? 'primary' : 'default'}
                  variant="outlined"
                  onDelete={
                    canEditSalesBuckets
                      ? () => updateActiveSalesBuckets(
                          activeSalesBuckets.filter((candidate) => candidate !== quantity)
                        )
                      : undefined
                  }
                />
              ))}
              <TextField
                size="small"
                value={newSalesBucket}
                onChange={(event) => setNewSalesBucket(event.target.value.replace(/\D/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addBucket('sales');
                }}
                label={text.quantity}
                disabled={!canEditSalesBuckets}
                inputProps={{ inputMode: 'numeric', min: 1 }}
                sx={{ width: 110 }}
              />
              <Button
                size="small"
                variant="outlined"
                startIcon={<AddOutlinedIcon />}
                onClick={() => addBucket('sales')}
                disabled={!canEditSalesBuckets || !newSalesBucket}
              >
                {text.addQuantity}
              </Button>
            </Stack>

            <Box sx={{ borderTop: 1, borderColor: 'divider', pt: 2 }}>
              <Stack
                direction={{ xs: 'column', md: 'row' }}
                spacing={1.25}
                alignItems={{ md: 'center' }}
                justifyContent="space-between"
              >
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                      {text.timeBuckets}
                    </Typography>
                    <Chip size="small" label={text.organizationWide} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {text.timeBucketsHelp}
                  </Typography>
                </Box>
                <FormControl size="small" sx={{ minWidth: 220 }}>
                  <InputLabel>{text.bucketPreset}</InputLabel>
                  <Select
                    value={resolvePresetId(TIME_BUCKET_PRESETS, timeBuckets)}
                    label={text.bucketPreset}
                    onChange={(event) => {
                      const preset = TIME_BUCKET_PRESETS.find(
                        (candidate) => candidate.id === event.target.value
                      );
                      if (preset) setTimeBuckets([...preset.values]);
                    }}
                  >
                    {TIME_BUCKET_PRESETS.map((preset) => (
                      <MenuItem key={preset.id} value={preset.id}>{preset.label}</MenuItem>
                    ))}
                    <MenuItem value="custom" disabled>{text.customPreset}</MenuItem>
                  </Select>
                </FormControl>
              </Stack>
              <Stack
                direction="row"
                spacing={0.75}
                useFlexGap
                flexWrap="wrap"
                alignItems="center"
                sx={{ mt: 1.5 }}
              >
                {timeBuckets.map((quantity) => (
                  <Chip
                    key={quantity}
                    label={formatNumberWithCommas(quantity)}
                    variant="outlined"
                    onDelete={() => {
                      if (timeBuckets.length === 1) {
                        showNotification(text.keepOneBucket, 'warning');
                        return;
                      }
                      setTimeBuckets(timeBuckets.filter((candidate) => candidate !== quantity));
                    }}
                  />
                ))}
                <TextField
                  size="small"
                  value={newTimeBucket}
                  onChange={(event) => setNewTimeBucket(event.target.value.replace(/\D/g, ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addBucket('time');
                  }}
                  label={text.quantity}
                  inputProps={{ inputMode: 'numeric', min: 1 }}
                  sx={{ width: 110 }}
                />
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<AddOutlinedIcon />}
                  onClick={() => addBucket('time')}
                  disabled={!newTimeBucket}
                >
                  {text.addQuantity}
                </Button>
              </Stack>
            </Box>
          </Stack>
        </Paper>

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
                    {activeSalesBuckets.map((quantity) => (
                      <TableCell key={quantity} align="center" sx={{ minWidth: 92, fontWeight: 800 }}>
                        {formatNumberWithCommas(quantity)}~
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!selectedCustomer && (
                    <TableStatusRow colSpan={activeSalesBuckets.length + 2} message={text.noCustomer} />
                  )}
                  {selectedCustomer && filteredStyles.length === 0 && (
                    <TableStatusRow colSpan={activeSalesBuckets.length + 2} message={text.noStyles} />
                  )}
                  {displayedStyles.map((style) => (
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
                      {activeSalesBuckets.map((quantity) => (
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
