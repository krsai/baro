import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  InputLabel,
  InputAdornment,
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
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SearchInput from '../../../components/SearchInput';
import TableStatusRow from '../../../components/TableStatusRow';
import { getStaticOptionOptions } from '../../../constants/staticOptionRegistry';
import { getUiMessage } from '../../../constants/uiMessages';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { resolveCustomerDisplayName } from '../../../utils/appLanguage';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { CURRENCY_CODES, CURRENCY_SYMBOLS } from '../../../constants/currencies';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import {
  WORKSPACE_DATA_TOPICS,
  emitWorkspaceDataChanged,
} from '../../../utils/workspaceDataEvents';

const SALES_BUCKET_PRESETS = Object.freeze([
  { id: '135', label: '1 · 3 · 5 방식', values: [1, 3, 5, 10, 30, 50, 100, 300, 500, 1000, 3000, 5000, 10000] },
  { id: '1257', label: '1 · 2 · 5 · 7 방식', values: [1, 2, 5, 7, 10, 20, 50, 70, 100, 200, 500, 700, 1000, 2000, 5000, 7000, 10000] },
]);
const DEFAULT_SALES_BUCKETS = SALES_BUCKET_PRESETS[0].values;

const normalizeBuckets = (values) =>
  [...new Set(values.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
    .sort((left, right) => left - right);

const resolvePresetId = (presets, buckets) => {
  const signature = normalizeBuckets(buckets).join(',');
  return presets.find((preset) => preset.values.join(',') === signature)?.id || 'custom';
};

const TEXT = {
  ko: {
    title: '단가',
    preview: '가격 입력 준비중',
    noticeTitle: '매출 단가와 수량 버킷을 관리합니다.',
    noticeBody: '고객 기본 버킷 또는 스타일 예외 버킷을 정한 뒤, 판매 방식과 통화별 단가를 입력하고 저장하세요.',
    customer: '고객사',
    selectCustomer: '고객사를 선택하세요',
    searchStyle: '스타일명 또는 코드 검색...',
    currency: '통화',
    defaultCurrency: '기본 통화',
    styleCurrency: '스타일 통화',
    useDefaultCurrency: '고객 기본 통화 사용',
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
    inheritedHint: '현재 고객 기본 버킷을 사용합니다. 별도 설정을 선택하면 이 스타일만 변경할 수 있습니다.',
    saveBuckets: '버킷 저장',
    bucketSaved: '수량 버킷을 저장했습니다.',
    noBucketChanges: '변경된 버킷이 없습니다.',
    savePricesFirst: '버킷을 변경하기 전에 편집 중인 단가를 저장하거나 취소하세요.',
    cancel: '취소',
    confirmBucketChange: '버킷 변경',
    addedBuckets: '추가',
    removedBuckets: '삭제',
    none: '없음',
    bucketChangeImpact: '기존 단가와 과거 급여는 유지됩니다. 신규 단가는 빈값이며, 신규 ST는 가장 가까운 하위 버킷 값이 복사되어 검토가 필요합니다.',
  },
  en: {
    title: 'Pricing',
    preview: 'Price entry pending',
    noticeTitle: 'Manage sales prices and quantity buckets.',
    noticeBody: 'Choose customer-default or style-specific buckets, then enter and save prices by pricing basis and currency.',
    customer: 'Customer',
    selectCustomer: 'Select a customer',
    searchStyle: 'Search style name or code...',
    currency: 'Currency',
    defaultCurrency: 'Default currency',
    styleCurrency: 'Style currency',
    useDefaultCurrency: 'Use customer default currency',
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
    inheritedHint: 'This style currently uses the customer default. Choose custom to edit only this style.',
    saveBuckets: 'Save buckets',
    bucketSaved: 'Quantity buckets saved.',
    noBucketChanges: 'There are no bucket changes.',
    savePricesFirst: 'Save or discard the edited prices before changing buckets.',
    cancel: 'Cancel',
    confirmBucketChange: 'Change buckets',
    addedBuckets: 'Added',
    removedBuckets: 'Removed',
    none: 'none',
    bucketChangeImpact: 'Existing prices and historical payroll remain unchanged. New prices stay empty, and newly created ST values are copied from the nearest lower bucket and require review.',
  },
  vi: {
    title: 'Đơn giá',
    preview: 'Nhap gia dang cho',
    noticeTitle: 'Quản lý don gia ban va moc so luong.',
    noticeBody: 'Chon moc mac dinh cua khach hang hoac moc rieng cua style, sau do nhap va luu don gia theo hinh thuc gia va tien te.',
    customer: 'Khách hàng',
    selectCustomer: 'Chon khach hang',
    searchStyle: 'Tim ten hoac ma style...',
    currency: 'Tien te',
    defaultCurrency: 'Tien te mac dinh',
    styleCurrency: 'Tien te style',
    useDefaultCurrency: 'Dung tien te mac dinh cua khach hang',
    style: 'Style',
    styleCode: 'Ma style',
    unitPrice: 'Đơn giá / chiec',
    noCustomer: 'Chon khach hang de xem bang don gia style.',
    noStyles: 'Không có style lien ket voi khach hang nay.',
    loadFailed: 'Không thể tai du lieu cho giao dien quan ly don gia.',
    save: 'Luu don gia',
    styleCount: '{count} style',
    selectedCustomer: 'Khách hàng',
    pricingBasis: 'Hinh thuc gia',
    salesBuckets: 'Moc so luong don gia',
    salesBucketsHelp: 'Dat moc mac dinh cua khach hang va chi sua rieng style can ngoai le.',
    bucketTarget: 'Doi tuong',
    customerDefault: 'Mặc định khach hang',
    useCustomerDefault: 'Dung mac dinh khach hang',
    useStyleBuckets: 'Dat rieng cho style nay',
    bucketPreset: 'Kieu moc',
    customPreset: 'Tu dat',
    quantity: 'Số lượng',
    addQuantity: 'Them so luong',
    duplicateBucket: 'Số lượng nay da ton tai.',
    keepOneBucket: 'Can it nhat mot moc.',
    inheritedHint: 'Style nay dang dung moc mac dinh cua khach hang. Chon dat rieng de sua.',
    saveBuckets: 'Luu moc',
    bucketSaved: 'Đã lưu moc so luong.',
    noBucketChanges: 'Không có thay doi moc so luong.',
    savePricesFirst: 'Hay luu hoac huy gia dang sua truoc khi doi moc.',
    cancel: 'Huy',
    confirmBucketChange: 'Doi moc',
    addedBuckets: 'Them',
    removedBuckets: 'Xóa',
    none: 'khong co',
    bucketChangeImpact: 'Đơn giá hien tai va bang luong cu duoc giu nguyen. Đơn giá moi de trong; ST moi duoc sao chep tu moc thap hon gan nhat va can kiem tra.',
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
const canonicalPrice = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  const [integerPart, decimalPart = ''] = normalized.split('.');
  const integer = integerPart.replace(/^0+(?=\d)/, '') || '0';
  const decimal = decimalPart.replace(/0+$/, '');
  return decimal ? `${integer}.${decimal}` : integer;
};
const isValidPositivePrice = (value) => {
  const normalized = String(value ?? '').trim();
  return /^\d{1,14}(?:\.\d{1,4})?$/.test(normalized) &&
    canonicalPrice(normalized) !== '0';
};

const resolveNumberLocale = (languageCode) => languageCode === 'vi' ? 'vi-VN' : languageCode === 'ko' ? 'ko-KR' : 'en-US';
const formatPriceForDisplay = (value, currencyCode, languageCode) => {
  if (value === null || value === undefined || value === '') return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  const usd = currencyCode === 'USD';
  return new Intl.NumberFormat(resolveNumberLocale(languageCode), {
    minimumFractionDigits: usd ? 2 : 0,
    maximumFractionDigits: usd ? 2 : 4,
  }).format(parsed);
};

const PricingRow = memo(function PricingRow({
  style,
  quantities,
  scopePrefix,
  draftPrices,
  focusedPriceKey,
  currencyCode,
  languageCode,
  unitPriceLabel,
  disabled,
  onPriceChange,
  onPriceFocus,
  onPriceBlur,
}) {
  return (
    <TableRow hover>
      <TableCell
        sx={{
          position: 'sticky',
          left: 0,
          zIndex: 1,
          backgroundColor: 'background.paper',
          fontWeight: 700,
        }}
      >
        <Stack direction="row" spacing={0.75} alignItems="center">
          <span>{style.name || '-'}</span>
          <Chip size="small" label={currencyCode} variant="outlined" />
        </Stack>
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
      {quantities.map((quantity) => {
        const key = `${scopePrefix}${style.id}:${quantity}`;
        const price = draftPrices[key] || '';
        return (
          <TableCell key={key} align="center" sx={{ px: 0.75 }}>
            <TextField
              value={
                focusedPriceKey === key
                  ? price
                  : formatPriceForDisplay(price, currencyCode, languageCode)
              }
              onChange={(event) => onPriceChange(key, event.target.value)}
              onFocus={() => onPriceFocus(key)}
              onBlur={onPriceBlur}
              size="small"
              disabled={disabled}
              error={Boolean(price) && !isValidPositivePrice(price)}
              placeholder="-"
              inputProps={{
                inputMode: 'decimal',
                'aria-label': `${style.name || style.id} ${quantity} ${unitPriceLabel}`,
                style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
              }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    {CURRENCY_SYMBOLS[currencyCode] || currencyCode}
                  </InputAdornment>
                ),
              }}
              sx={{ width: 112 }}
            />
          </TableCell>
        );
      })}
      <TableCell />
    </TableRow>
  );
}, (previous, next) => {
  if (
    previous.style !== next.style ||
    previous.quantities !== next.quantities ||
    previous.scopePrefix !== next.scopePrefix ||
    previous.currencyCode !== next.currencyCode ||
    previous.languageCode !== next.languageCode ||
    previous.unitPriceLabel !== next.unitPriceLabel ||
    previous.disabled !== next.disabled
  ) return false;

  const rowPrefix = `${next.scopePrefix}${next.style.id}:`;
  if (
    previous.focusedPriceKey !== next.focusedPriceKey &&
    (previous.focusedPriceKey.startsWith(rowPrefix) || next.focusedPriceKey.startsWith(rowPrefix))
  ) return false;

  return next.quantities.every((quantity) => {
    const key = `${rowPrefix}${quantity}`;
    return previous.draftPrices[key] === next.draftPrices[key];
  });
});

const CustomerPricingBoard = () => {
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const { showNotification } = useAppActions();
  const text = useMemo(() => ({
    ...getText(languageCode),
    title: getUiMessage('customerPricingBoard.title', 'Pricing', languageCode),
    save: getUiMessage('customerPricingBoard.save', 'Save Prices', languageCode),
  }), [languageCode]);
  const pricingBasisOptions = useMemo(
    () => getStaticOptionOptions('commercialPricingBasis', languageCode),
    [languageCode]
  );

  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [styles, setStyles] = useState([]);
  const [pricingBasis, setPricingBasis] = useState('MANUFACTURING_SERVICE_PRICE');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [styleCurrencyOverrides, setStyleCurrencyOverrides] = useState({});
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [draftPrices, setDraftPrices] = useState({});
  const [savedPrices, setSavedPrices] = useState({});
  const [focusedPriceKey, setFocusedPriceKey] = useState('');
  const [bucketTarget, setBucketTarget] = useState('customer');
  const [customerBuckets, setCustomerBuckets] = useState({});
  const [savedCustomerBuckets, setSavedCustomerBuckets] = useState({});
  const [savedCustomerBucketVersionIds, setSavedCustomerBucketVersionIds] = useState({});
  const [styleBucketModes, setStyleBucketModes] = useState({});
  const [styleBuckets, setStyleBuckets] = useState({});
  const [savedStyleBuckets, setSavedStyleBuckets] = useState({});
  const [savedStyleBucketVersionIds, setSavedStyleBucketVersionIds] = useState({});
  const [newSalesBucket, setNewSalesBucket] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [savingBuckets, setSavingBuckets] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);
  const [priceReloadKey, setPriceReloadKey] = useState(0);
  const [bucketConfirmation, setBucketConfirmation] = useState(null);
  const bucketConfirmationResolver = useRef(null);

  const requestBucketConfirmation = useCallback((details) => {
    setBucketConfirmation(details);
    return new Promise((resolve) => {
      bucketConfirmationResolver.current = resolve;
    });
  }, []);

  const closeBucketConfirmation = useCallback((confirmed) => {
    bucketConfirmationResolver.current?.(confirmed);
    bucketConfirmationResolver.current = null;
    setBucketConfirmation(null);
  }, []);

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
    const loadBuckets = async () => {
      if (!selectedCustomerId) {
        setStyles([]);
        return;
      }
      setLoadingStyles(true);
      try {
        const [payload, currencyPayload] = await Promise.all([
          requestJSON(`/customers/${selectedCustomerId}/quantity-buckets${customerQuery}`, {
            skipGlobalLoading: true,
          }),
          requestJSON(`/customers/${selectedCustomerId}/sales-currencies${customerQuery}`, {
            skipGlobalLoading: true,
          }),
        ]);
        if (!active) return;
        const customerKey = String(selectedCustomerId);
        const defaultQuantities = Array.isArray(payload?.defaultVersion?.quantities)
          ? normalizeBuckets(payload.defaultVersion.quantities)
          : DEFAULT_SALES_BUCKETS;
        setCustomerBuckets((previous) => ({
          ...previous,
          [customerKey]: defaultQuantities,
        }));
        setSavedCustomerBuckets((previous) => ({
          ...previous,
          [customerKey]: defaultQuantities,
        }));
        setSavedCustomerBucketVersionIds((previous) => ({
          ...previous,
          [customerKey]: Number(payload?.defaultVersion?.id) || null,
        }));
        const nextModes = {};
        const nextBuckets = {};
        const nextVersionIds = {};
        const payloadStyles = Array.isArray(payload?.styles) ? payload.styles : [];
        setStyles(payloadStyles.map((style) => ({
          id: style.id,
          name: style.name || '',
          styleCode: style.code || '',
          code: style.code || '',
        })));
        payloadStyles.forEach((style) => {
          const key = `${customerKey}:${style.id}`;
          nextModes[key] = style.source === 'STYLE_OVERRIDE' ? 'custom' : 'customer';
          if (Array.isArray(style?.version?.quantities)) {
            nextBuckets[key] = normalizeBuckets(style.version.quantities);
          }
          nextVersionIds[key] = Number(style?.version?.id) || null;
        });
        setStyleBucketModes((previous) => ({ ...previous, ...nextModes }));
        setStyleBuckets((previous) => ({ ...previous, ...nextBuckets }));
        setSavedStyleBuckets((previous) => ({ ...previous, ...nextBuckets }));
        setSavedStyleBucketVersionIds((previous) => ({ ...previous, ...nextVersionIds }));
        setCurrencyCode(currencyPayload?.defaultCurrencyCode || 'USD');
        setStyleCurrencyOverrides(
          Object.fromEntries(
            (Array.isArray(currencyPayload?.styleOverrides) ? currencyPayload.styleOverrides : [])
              .map((override) => [String(override.styleId), override.currencyCode])
          )
        );
      } catch (error) {
        if (active) showNotification(error?.message || text.loadFailed, 'error');
      } finally {
        if (active) setLoadingStyles(false);
      }
    };
    loadBuckets();
    return () => {
      active = false;
    };
  }, [customerQuery, selectedCustomerId, showNotification, text.loadFailed]);

  useEffect(() => {
    let active = true;
    const loadPrices = async () => {
      if (!selectedCustomerId) return;
      setLoadingPrices(true);
      try {
        const payloads = await Promise.all(CURRENCY_CODES.map(async (code) => ({
          code,
          payload: await requestJSON(
            `/customers/${selectedCustomerId}/sales-prices${buildQueryString({
              orgId: activeOrgId,
              pricingBasis,
              currencyCode: code,
            })}`,
            { skipGlobalLoading: true }
          ),
        })));
        if (!active) return;
        const loadedPrices = {};
        payloads.forEach(({ code, payload }) => {
          (Array.isArray(payload?.styles) ? payload.styles : []).forEach((style) => {
            (Array.isArray(style?.prices) ? style.prices : []).forEach((price) => {
              loadedPrices[
                `${selectedCustomerId}:${pricingBasis}:${code}:${style.styleId}:${price.bucketQuantity}`
              ] = String(price.unitPrice ?? '');
            });
          });
        });
        const scopePrefix = `${selectedCustomerId}:${pricingBasis}:`;
        setDraftPrices((previous) => {
          const next = Object.fromEntries(
            Object.entries(previous).filter(([key]) => !key.startsWith(scopePrefix))
          );
          return { ...next, ...loadedPrices };
        });
        setSavedPrices((previous) => {
          const next = Object.fromEntries(
            Object.entries(previous).filter(([key]) => !key.startsWith(scopePrefix))
          );
          return { ...next, ...loadedPrices };
        });
      } catch (error) {
        if (active) showNotification(error?.message || text.loadFailed, 'error');
      } finally {
        if (active) setLoadingPrices(false);
      }
    };
    loadPrices();
    return () => {
      active = false;
    };
  }, [
    activeOrgId,
    pricingBasis,
    priceReloadKey,
    selectedCustomerId,
    showNotification,
    text.loadFailed,
  ]);

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
    : filteredStyles.filter(
        (style) => styleBucketModes[`${customerBucketKey}:${style.id}`] !== 'custom'
      );
  const canEditSalesBuckets = !selectedStyleId || selectedStyleUsesCustomBuckets;
  const hiddenCustomStyleCount = selectedStyleId
    ? 0
    : filteredStyles.length - displayedStyles.length;
  const resolveStyleCurrencyCode = useCallback(
    (styleId) => styleCurrencyOverrides[String(styleId)] || currencyCode,
    [currencyCode, styleCurrencyOverrides]
  );

  const saveCurrencySetting = useCallback(async ({ styleId = null, nextCurrencyCode }) => {
    if (!selectedCustomerId) return;
    setSavingCurrency(true);
    try {
      await requestJSON(`/customers/${selectedCustomerId}/sales-currencies${customerQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styleId, currencyCode: nextCurrencyCode || null }),
        skipGlobalLoading: true,
      });
      if (styleId == null) setCurrencyCode(nextCurrencyCode);
      else setStyleCurrencyOverrides((previous) => {
        const next = { ...previous };
        if (nextCurrencyCode) next[String(styleId)] = nextCurrencyCode;
        else delete next[String(styleId)];
        return next;
      });
      emitWorkspaceDataChanged({
        topics: [WORKSPACE_DATA_TOPICS.SALES_PRICES],
        orgId: activeOrgId,
        source: 'customer-sales-currency',
      });
    } catch (error) {
      showNotification(error?.message || text.loadFailed, 'error');
    } finally {
      setSavingCurrency(false);
    }
  }, [activeOrgId, customerQuery, selectedCustomerId, showNotification, text.loadFailed]);

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

  const addSalesBucket = useCallback(
    () => {
      const quantity = Number(newSalesBucket);
      if (!Number.isInteger(quantity) || quantity <= 0) return;
      if (activeSalesBuckets.includes(quantity)) {
        showNotification(text.duplicateBucket, 'warning');
        return;
      }
      updateActiveSalesBuckets([...activeSalesBuckets, quantity]);
      setNewSalesBucket('');
    },
    [
      activeSalesBuckets,
      newSalesBucket,
      showNotification,
      text.duplicateBucket,
      updateActiveSalesBuckets,
    ]
  );

  const saveActiveBuckets = useCallback(async () => {
    if (!selectedCustomerId) return;
    const priceScopePrefix = `${selectedCustomerId}:${pricingBasis}:`;
    const hasUnsavedPriceInScope = Object.entries(draftPrices).some(
      ([key, value]) =>
        key.startsWith(priceScopePrefix) &&
        canonicalPrice(value) !== canonicalPrice(savedPrices[key])
    );
    if (hasUnsavedPriceInScope) {
      showNotification(
        text.savePricesFirst || 'Save or discard the edited prices before changing buckets.',
        'warning'
      );
      return;
    }
    const previousBuckets = selectedStyleId
      ? savedStyleBuckets[styleBucketKey] || resolvedCustomerBuckets
      : savedCustomerBuckets[customerBucketKey] || DEFAULT_SALES_BUCKETS;
    const expectedVersionId = selectedStyleId
      ? savedStyleBucketVersionIds[styleBucketKey]
      : savedCustomerBucketVersionIds[customerBucketKey];
    if (!expectedVersionId) {
      showNotification(text.loadFailed, 'error');
      return;
    }
    const added = activeSalesBuckets.filter((quantity) => !previousBuckets.includes(quantity));
    const removed = previousBuckets.filter((quantity) => !activeSalesBuckets.includes(quantity));
    if (added.length === 0 && removed.length === 0) {
      showNotification(text.noBucketChanges, 'info');
      return;
    }
    const targetLabel = selectedStyleId
      ? styles.find((style) => String(style.id) === selectedStyleId)?.name || selectedStyleId
      : selectedCustomer?.name || selectedCustomer?.companyName || selectedCustomerId;
    const confirmation = languageCode === 'ko'
      ? `${targetLabel} 버킷을 변경합니다.\n\n추가: ${added.join(', ') || '없음'}\n삭제: ${removed.join(', ') || '없음'}\n\n기존 단가와 과거 급여 자료는 유지됩니다. 새 버킷의 단가는 비어 있고, ST는 바로 아래 구간 값으로 복사되어 빨간색 검토 대상으로 표시됩니다. 계속할까요?`
      : `Change buckets for ${targetLabel}?\n\nAdded: ${added.join(', ') || 'none'}\nRemoved: ${removed.join(', ') || 'none'}\n\nExisting prices and historical payroll remain unchanged. New prices stay empty and new ST values require review.`;
    const confirmed = await requestBucketConfirmation({ targetLabel, added, removed, confirmation });
    if (!confirmed) return;
    setSavingBuckets(true);
    try {
      const result = await requestJSON(
        `/customers/${selectedCustomerId}/quantity-buckets${customerQuery}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            quantities: activeSalesBuckets,
            expectedVersionId,
            ...(selectedStyleId ? { styleId: Number(selectedStyleId) } : {}),
            useCustomerDefault: Boolean(selectedStyleId && !selectedStyleUsesCustomBuckets),
          }),
          skipGlobalLoading: true,
        }
      );
      if (selectedStyleId) {
        setSavedStyleBuckets((previous) => ({
          ...previous,
          [styleBucketKey]: [...activeSalesBuckets],
        }));
        setSavedStyleBucketVersionIds((previous) => ({
          ...previous,
          [styleBucketKey]: Number(result?.versionId) || expectedVersionId,
        }));
      } else {
        setSavedCustomerBuckets((previous) => ({
          ...previous,
          [customerBucketKey]: [...activeSalesBuckets],
        }));
        setSavedCustomerBucketVersionIds((previous) => ({
          ...previous,
          [customerBucketKey]: Number(result?.versionId) || expectedVersionId,
        }));
      }
      setPriceReloadKey((value) => value + 1);
      emitWorkspaceDataChanged({
        topics: [WORKSPACE_DATA_TOPICS.SALES_PRICES],
        orgId: activeOrgId,
        source: 'customer-pricing-buckets',
      });
      const summary = languageCode === 'ko'
        ? `영향 스타일 ${result?.affectedStyleCount || 0}개 · 유지 단가 ${result?.copiedPriceCount || 0}개 · 검토할 신규 ST ${result?.unreviewedStandardCount || 0}개`
        : `${result?.affectedStyleCount || 0} affected styles · ${result?.copiedPriceCount || 0} retained prices · ${result?.unreviewedStandardCount || 0} ST values to review`;
      showNotification(`${text.bucketSaved} ${summary}`, 'success');
    } catch (error) {
      showNotification(error?.message || text.loadFailed, 'error');
    } finally {
      setSavingBuckets(false);
    }
  }, [
    activeOrgId,
    activeSalesBuckets,
    customerBucketKey,
    customerQuery,
    draftPrices,
    languageCode,
    pricingBasis,
    resolvedCustomerBuckets,
    requestBucketConfirmation,
    savedCustomerBuckets,
    savedCustomerBucketVersionIds,
    savedPrices,
    savedStyleBuckets,
    savedStyleBucketVersionIds,
    selectedCustomerId,
    selectedCustomer,
    selectedStyleId,
    selectedStyleUsesCustomBuckets,
    showNotification,
    styleBucketKey,
    styles,
    text.bucketSaved,
    text.noBucketChanges,
    text.loadFailed,
  ]);

  const handlePriceChange = useCallback(
    (key, value) => {
      setDraftPrices((previous) => ({ ...previous, [key]: normalizePriceInput(value) }));
    },
    []
  );
  const handlePriceFocus = useCallback((key) => setFocusedPriceKey(key), []);
  const handlePriceBlur = useCallback(() => setFocusedPriceKey(''), []);
  const dirtyPriceChanges = useMemo(
    () => displayedStyles.flatMap((style) =>
      activeSalesBuckets.flatMap((bucketQuantity) => {
        const effectiveCurrencyCode = resolveStyleCurrencyCode(style.id);
        const key =
          `${selectedCustomerId}:${pricingBasis}:${effectiveCurrencyCode}:${style.id}:${bucketQuantity}`;
        const draft = draftPrices[key] || '';
        const saved = savedPrices[key] || '';
        if (canonicalPrice(draft) === canonicalPrice(saved)) return [];
        return [{
          key,
          styleId: Number(style.id),
          styleName: style.name || style.styleCode || String(style.id),
          currencyCode: effectiveCurrencyCode,
          bucketQuantity,
          unitPrice: draft || null,
        }];
      })
    ),
    [
      activeSalesBuckets,
      displayedStyles,
      draftPrices,
      pricingBasis,
      savedPrices,
      selectedCustomerId,
      resolveStyleCurrencyCode,
    ]
  );
  const invalidPriceChanges = useMemo(
    () => dirtyPriceChanges.filter(
      (change) => change.unitPrice !== null && !isValidPositivePrice(change.unitPrice)
    ),
    [dirtyPriceChanges]
  );
  useUnsavedChanges(dirtyPriceChanges.length > 0);

  const savePrices = useCallback(async () => {
    if (!selectedCustomerId || dirtyPriceChanges.length === 0) return;
    if (invalidPriceChanges.length > 0) {
      const invalid = invalidPriceChanges[0];
      showNotification(
        `${invalid.styleName} / ${invalid.bucketQuantity}: ` +
          'price must be greater than 0 with at most 14 integer digits and 4 decimals.',
        'error'
      );
      return;
    }
    setSavingPrices(true);
    try {
      const changesByCurrency = dirtyPriceChanges.reduce((map, change) => {
        const bucket = map.get(change.currencyCode) || [];
        bucket.push(change);
        map.set(change.currencyCode, bucket);
        return map;
      }, new Map());
      await Promise.all(Array.from(changesByCurrency.entries()).map(([code, changes]) =>
        requestJSON(`/customers/${selectedCustomerId}/sales-prices${customerQuery}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pricingBasis,
            currencyCode: code,
            prices: changes.map(({ styleId, bucketQuantity, unitPrice }) => ({
              styleId, bucketQuantity, unitPrice,
            })),
          }),
          skipGlobalLoading: true,
        })
      ));
      setPriceReloadKey((value) => value + 1);
      emitWorkspaceDataChanged({
        topics: [WORKSPACE_DATA_TOPICS.SALES_PRICES],
        orgId: activeOrgId,
        source: 'customer-sales-prices',
      });
      showNotification(
        languageCode === 'ko'
          ? '매출 단가를 저장했습니다.'
          : languageCode === 'vi'
            ? 'Đã lưu don gia ban.'
            : 'Sales prices saved.',
        'success'
      );
    } catch (error) {
      showNotification(error?.message || text.loadFailed, 'error');
    } finally {
      setSavingPrices(false);
    }
  }, [
    activeOrgId,
    customerQuery,
    dirtyPriceChanges,
    invalidPriceChanges,
    languageCode,
    pricingBasis,
    selectedCustomerId,
    showNotification,
    text.loadFailed,
  ]);

  const customerLabel = selectedCustomer
    ? resolveCustomerDisplayName(selectedCustomer, languageCode) || selectedCustomer.code || '-'
    : '-';

  return (
    <AppPageContainer
      title={text.title}
      titleActions={
        <Stack direction="row" spacing={1} alignItems="center">
          <Button
            variant="contained"
            onClick={savePrices}
            disabled={
              loadingPrices ||
              savingPrices ||
              !selectedCustomerId ||
              displayedStyles.length === 0 ||
              dirtyPriceChanges.length === 0 ||
              invalidPriceChanges.length > 0
            }
          >
            {text.save}
          </Button>
        </Stack>
      }
      toolbar={
        <PageToolbar
          showLastUpdater={false}
          left={(
            <SearchInput
              placeholder={text.searchStyle}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          )}
          right={
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              spacing={1.25}
              alignItems={{ lg: 'center' }}
              sx={{ width: 'auto', flexWrap: { lg: 'wrap' } }}
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
                <InputLabel>{text.defaultCurrency}</InputLabel>
                <Select
                  value={currencyCode}
                  label={text.defaultCurrency}
                  onChange={(event) => saveCurrencySetting({
                    nextCurrencyCode: event.target.value,
                  })}
                  disabled={savingCurrency || dirtyPriceChanges.length > 0}
                >
                  {CURRENCY_CODES.map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
                </Select>
              </FormControl>
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
          <Chip label={`${text.defaultCurrency}: ${currencyCode}`} variant="outlined" />
        </Stack>
        {hiddenCustomStyleCount > 0 && (
          <Alert severity="warning">
            {hiddenCustomStyleCount} style(s) use custom buckets and are not shown in the
            customer-default table. Select each style in the bucket target to edit its prices.
          </Alert>
        )}

        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          {loadingCustomers || loadingStyles ? (
            <Stack spacing={1} sx={{ p: 2 }}>
              {Array.from({ length: 5 }, (_value, index) => (
                <Skeleton key={index} height={44} variant="rounded" />
              ))}
            </Stack>
          ) : (
            <TableContainer>
              <Table size="small" sx={{ minWidth: 1450 }}>
                <TableHead>
                  <TableRow>
                    <TableCell
                      colSpan={activeSalesBuckets.length + 3}
                      sx={{ py: 1.25, backgroundColor: 'grey.50' }}
                    >
                      <Stack
                        direction={{ xs: 'column', lg: 'row' }}
                        spacing={1}
                        alignItems={{ lg: 'center' }}
                      >
                        <Box sx={{ minWidth: 175 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                            {text.salesBuckets}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {text.salesBucketsHelp}
                          </Typography>
                        </Box>
                        <FormControl size="small" sx={{ minWidth: 240 }}>
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
                            <ToggleButton value="customer">
                              {text.useCustomerDefault}
                            </ToggleButton>
                            <ToggleButton value="custom">
                              {text.useStyleBuckets}
                            </ToggleButton>
                          </ToggleButtonGroup>
                        )}

                        {selectedStyleId && (
                          <FormControl size="small" sx={{ minWidth: 190 }}>
                            <InputLabel>{text.styleCurrency}</InputLabel>
                            <Select
                              value={styleCurrencyOverrides[String(selectedStyleId)] || ''}
                              label={text.styleCurrency}
                              disabled={savingCurrency || dirtyPriceChanges.length > 0}
                              onChange={(event) => saveCurrencySetting({
                                styleId: Number(selectedStyleId),
                                nextCurrencyCode: event.target.value,
                              })}
                            >
                              <MenuItem value="">{text.useDefaultCurrency} ({currencyCode})</MenuItem>
                              {CURRENCY_CODES.map((code) => <MenuItem key={code} value={code}>{code}</MenuItem>)}
                            </Select>
                          </FormControl>
                        )}

                        <FormControl
                          size="small"
                          sx={{ minWidth: 180 }}
                          disabled={!canEditSalesBuckets}
                        >
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
                              <MenuItem key={preset.id} value={preset.id}>
                                {preset.label}
                              </MenuItem>
                            ))}
                            <MenuItem value="custom" disabled>{text.customPreset}</MenuItem>
                          </Select>
                        </FormControl>

                        {selectedStyleId && !selectedStyleUsesCustomBuckets && (
                          <Typography variant="caption" color="text.secondary">
                            {text.inheritedHint}
                          </Typography>
                        )}
                        <Button
                          size="small"
                          variant="contained"
                          onClick={saveActiveBuckets}
                          disabled={savingBuckets || !selectedCustomerId}
                        >
                          {text.saveBuckets}
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell sx={{ minWidth: 190, fontWeight: 800, position: 'sticky', left: 0, zIndex: 4 }}>
                      {text.style}
                    </TableCell>
                    <TableCell sx={{ minWidth: 120, fontWeight: 800, position: 'sticky', left: 190, zIndex: 4 }}>
                      {text.styleCode}
                    </TableCell>
                    {activeSalesBuckets.map((quantity) => (
                      <TableCell key={quantity} align="center" sx={{ minWidth: 92, fontWeight: 800 }}>
                        <Chip
                          size="small"
                          label={`${formatNumberWithCommas(quantity, { locale: resolveNumberLocale(languageCode) })}~`}
                          color={selectedStyleUsesCustomBuckets ? 'primary' : 'default'}
                          onDelete={
                            canEditSalesBuckets
                              ? () => updateActiveSalesBuckets(
                                  activeSalesBuckets.filter(
                                    (candidate) => candidate !== quantity
                                  )
                                )
                              : undefined
                          }
                        />
                      </TableCell>
                    ))}
                    <TableCell align="center" sx={{ minWidth: 155, px: 0.75 }}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <TextField
                          size="small"
                          value={newSalesBucket}
                          onChange={(event) =>
                            setNewSalesBucket(event.target.value.replace(/\D/g, ''))
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') addSalesBucket();
                          }}
                          placeholder={text.quantity}
                          disabled={!canEditSalesBuckets}
                          inputProps={{
                            inputMode: 'numeric',
                            min: 1,
                            'aria-label': text.addQuantity,
                            style: { textAlign: 'right' },
                          }}
                          sx={{ width: 88 }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          aria-label={text.addQuantity}
                          onClick={addSalesBucket}
                          disabled={!canEditSalesBuckets || !newSalesBucket}
                          sx={{ minWidth: 36, px: 0.75 }}
                        >
                          <AddOutlinedIcon fontSize="small" />
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!selectedCustomer && (
                    <TableStatusRow colSpan={activeSalesBuckets.length + 3} message={text.noCustomer} />
                  )}
                  {selectedCustomer && filteredStyles.length === 0 && (
                    <TableStatusRow colSpan={activeSalesBuckets.length + 3} message={text.noStyles} />
                  )}
                  {displayedStyles.map((style) => (
                    <PricingRow
                      key={style.id}
                      style={style}
                      quantities={activeSalesBuckets}
                      scopePrefix={`${selectedCustomerId}:${pricingBasis}:${resolveStyleCurrencyCode(style.id)}:`}
                      draftPrices={draftPrices}
                      focusedPriceKey={focusedPriceKey}
                      currencyCode={resolveStyleCurrencyCode(style.id)}
                      languageCode={languageCode}
                      unitPriceLabel={text.unitPrice}
                      disabled={loadingPrices || savingPrices}
                      onPriceChange={handlePriceChange}
                      onPriceFocus={handlePriceFocus}
                      onPriceBlur={handlePriceBlur}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Stack>
      <Dialog
        open={Boolean(bucketConfirmation)}
        onClose={() => closeBucketConfirmation(false)}
        aria-labelledby="bucket-change-dialog-title"
      >
        <DialogTitle id="bucket-change-dialog-title">
          {text.confirmBucketChange || 'Change buckets'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText component="div">
            <Stack spacing={1}>
              <Typography>{bucketConfirmation?.targetLabel}</Typography>
              <Typography>
                {text.addedBuckets}: {bucketConfirmation?.added?.join(', ') || text.none}
              </Typography>
              <Typography>
                {text.removedBuckets}: {bucketConfirmation?.removed?.join(', ') || text.none}
              </Typography>
              <Typography>{text.bucketChangeImpact}</Typography>
            </Stack>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeBucketConfirmation(false)}>
            {text.cancel || 'Cancel'}
          </Button>
          <Button variant="contained" onClick={() => closeBucketConfirmation(true)} autoFocus>
            {text.confirmBucketChange || 'Change buckets'}
          </Button>
        </DialogActions>
      </Dialog>
    </AppPageContainer>
  );
};

export default CustomerPricingBoard;
