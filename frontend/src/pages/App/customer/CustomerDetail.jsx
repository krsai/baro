import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  IconButton,
  InputAdornment,
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
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
import SearchInput from '../../../components/SearchInput';
import { getUiMessage } from '../../../constants/uiMessages';
import { getStaticOptionOptions } from '../../../constants/staticOptionRegistry';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { resolveCustomerDisplayName } from '../../../utils/appLanguage';
import { formatNumberWithCommas } from '../../../utils/numberFormat';
import { ST_STANDARD_BUCKETS } from '../../../utils/processTime';
import { fetchStyles } from '../../../utils/styleApi';
import {
  buildCustomerFormData,
  buildCustomerPayload,
  createEmptyCustomerFormData,
  formatCustomerDate,
  normalizeCountry,
  resolveCustomerStyleOwnerOrgId,
  resolveDefaultCountryCode,
} from './customerFormShared';

const HIDDEN_BUCKETS = new Set([2, 20]);
const PRICE_BUCKETS = ST_STANDARD_BUCKETS.filter((quantity) => !HIDDEN_BUCKETS.has(quantity));
const TRADE_TYPES = ['CMPT', 'FOB'];

const TEXT = {
  ko: {
    newTab: '고객 추가',
    detailTab: '고객: {name}',
    titleNew: '고객 추가',
    titleDetail: '고객 상세',
    tabBasic: '기본정보',
    tabPricing: '단가 관리',
    saveCustomer: '고객 저장',
    saveCustomerSuccess: '고객 정보를 저장했습니다.',
    saveError: '고객 정보를 저장하지 못했습니다.',
    customerLoadError: '고객 정보를 불러오지 못했습니다.',
    pricingLoadError: '고객 단가를 불러오지 못했습니다.',
    pricingSaveError: '고객 단가를 저장하지 못했습니다.',
    savePricing: '단가 저장',
    savePricingSuccess: '고객 단가를 저장했습니다.',
    stylesLoadError: '스타일 목록을 불러오지 못했습니다.',
    codeRequired: '고객 코드를 입력해주세요.',
    nameRequired: '고객명을 입력해주세요.',
    pricingDisabledTitle: '고객을 먼저 저장해주세요.',
    pricingDisabledBody: '단가 관리는 저장된 고객에서만 사용할 수 있습니다.',
    customerCode: '고객 코드',
    customerName: '고객명',
    country: '국가',
    registeredAt: '등록일',
    address: '주소',
    manager: '담당자',
    countryCode: '국가번호',
    phoneNumber: '전화번호',
    email: '이메일',
    customerPricingTitle: '고객별 스타일 단가',
    styleSearch: '스타일 검색',
    stylesCount: '스타일',
    styleName: '스타일명',
    pricingRule: '조건',
    actions: '작업',
    emptyStyles: '연결된 스타일이 없습니다.',
    loadingStyles: '스타일을 불러오는 중입니다.',
    manageStyle: '스타일 열기',
    draftOpen: '보조 단가',
    draftClose: '접기',
  },
  en: {
    newTab: 'Add Customer',
    detailTab: 'Customer: {name}',
    titleNew: 'Add Customer',
    titleDetail: 'Customer Detail',
    tabBasic: 'Basic Info',
    tabPricing: 'Pricing',
    saveCustomer: 'Save Customer',
    saveCustomerSuccess: 'Customer information has been saved.',
    saveError: 'Failed to save customer information.',
    customerLoadError: 'Failed to load customer information.',
    pricingLoadError: 'Failed to load pricing data.',
    pricingSaveError: 'Failed to save pricing data.',
    savePricing: 'Save Pricing',
    savePricingSuccess: 'Pricing has been saved.',
    stylesLoadError: 'Failed to load styles.',
    codeRequired: 'Enter a customer code.',
    nameRequired: 'Enter a customer name.',
    pricingDisabledTitle: 'Save the customer first.',
    pricingDisabledBody: 'Pricing is available only after the customer exists.',
    customerCode: 'Customer Code',
    customerName: 'Customer Name',
    country: 'Country',
    registeredAt: 'Registered',
    address: 'Address',
    manager: 'Manager',
    countryCode: 'Country Code',
    phoneNumber: 'Phone Number',
    email: 'Email',
    customerPricingTitle: 'Customer Style Pricing',
    styleSearch: 'Search styles',
    stylesCount: 'Styles',
    styleName: 'Style Name',
    pricingRule: 'Condition',
    actions: 'Actions',
    emptyStyles: 'No linked styles found.',
    loadingStyles: 'Loading styles...',
    manageStyle: 'Open style',
    draftOpen: 'Alt prices',
    draftClose: 'Collapse',
  },
  vi: {
    newTab: 'Them khach hang',
    detailTab: 'Khach hang: {name}',
    titleNew: 'Them khach hang',
    titleDetail: 'Chi tiet khach hang',
    tabBasic: 'Thong tin co ban',
    tabPricing: 'Don gia',
    saveCustomer: 'Luu khach hang',
    saveCustomerSuccess: 'Da luu thong tin khach hang.',
    saveError: 'Khong the luu thong tin khach hang.',
    customerLoadError: 'Khong the tai thong tin khach hang.',
    pricingLoadError: 'Khong the tai don gia khach hang.',
    pricingSaveError: 'Khong the luu don gia khach hang.',
    savePricing: 'Luu don gia',
    savePricingSuccess: 'Da luu don gia khach hang.',
    stylesLoadError: 'Khong the tai danh sach style.',
    codeRequired: 'Hay nhap ma khach hang.',
    nameRequired: 'Hay nhap ten khach hang.',
    pricingDisabledTitle: 'Hay luu khach hang truoc.',
    pricingDisabledBody: 'Chi co the quan ly don gia sau khi da tao khach hang.',
    customerCode: 'Ma khach hang',
    customerName: 'Ten khach hang',
    country: 'Quoc gia',
    registeredAt: 'Ngay dang ky',
    address: 'Dia chi',
    manager: 'Nguoi phu trach',
    countryCode: 'Ma quoc gia',
    phoneNumber: 'So dien thoai',
    email: 'Email',
    customerPricingTitle: 'Don gia style theo khach hang',
    styleSearch: 'Tim style',
    stylesCount: 'Style',
    styleName: 'Ten style',
    pricingRule: 'Dieu kien',
    actions: 'Tac vu',
    emptyStyles: 'Khong co style lien ket.',
    loadingStyles: 'Dang tai style...',
    manageStyle: 'Mo style',
    draftOpen: 'Gia bo sung',
    draftClose: 'Thu gon',
  },
};

const createMessageGetter = (languageCode) => {
  const locale =
    languageCode === 'ko' || languageCode === 'en' || languageCode === 'vi'
      ? languageCode
      : 'en';
  const dictionary = TEXT[locale] || TEXT.en;
  return (key, params = {}) =>
    Object.entries(params).reduce(
      (message, [token, value]) => message.replaceAll(`{${token}}`, String(value ?? '')),
      dictionary[key] ?? TEXT.en[key] ?? key
    );
};

const createEmptyPricingRow = () => ({
  mode: 'DEFAULT',
  prices: {
    CMPT: {},
    FOB: {},
  },
});

const createEmptyPricingDraft = () => ({
  defaultTradeType: 'CMPT',
  rows: {},
});

const normalizeTradeType = (value) => (value === 'FOB' ? 'FOB' : 'CMPT');
const normalizeRowMode = (value) =>
  ['DEFAULT', 'CMPT', 'FOB', 'BOTH'].includes(String(value || '').toUpperCase())
    ? String(value || '').toUpperCase()
    : 'DEFAULT';

const normalizePriceInput = (value) => {
  const cleaned = String(value ?? '')
    .replace(/[^\d.]/g, '')
    .replace(/(\..*)\./g, '$1');
  return cleaned;
};

const formatPriceDisplay = (value) => {
  const normalized = normalizePriceInput(value);
  if (!normalized || normalized === '.') return '';
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '';
};

const PricingAmountField = ({ value, onChange, shaded = false }) => {
  const [isFocused, setIsFocused] = useState(false);
  const rawValue = String(value ?? '');
  const displayValue = isFocused ? rawValue : formatPriceDisplay(rawValue);

  return (
    <TextField
      value={displayValue}
      onFocus={() => setIsFocused(true)}
      onBlur={() => {
        setIsFocused(false);
        const formattedValue = formatPriceDisplay(rawValue);
        if (formattedValue !== rawValue) onChange(formattedValue);
      }}
      onChange={(event) => onChange(event.target.value)}
      size="small"
      placeholder="-"
      inputProps={{
        inputMode: 'decimal',
        style: {
          width: '100%',
          textAlign: 'right',
          fontSize: 13,
          fontVariantNumeric: 'tabular-nums',
        },
      }}
      InputProps={{
        startAdornment: displayValue ? (
          <InputAdornment position="start">$</InputAdornment>
        ) : null,
      }}
      sx={{
        width: '100%',
        ...(shaded
          ? {
              '& .MuiOutlinedInput-root': {
                backgroundColor: displayValue
                  ? 'rgba(15, 23, 42, 0.03)'
                  : 'rgba(248, 250, 252, 0.95)',
              },
            }
          : {}),
      }}
    />
  );
};

const normalizePricingRow = (value = {}) => {
  const next = createEmptyPricingRow();
  next.mode = normalizeRowMode(value?.mode);

  TRADE_TYPES.forEach((tradeType) => {
    const source = value?.prices?.[tradeType];
    if (!source || typeof source !== 'object') return;
    Object.entries(source).forEach(([bucketKey, priceValue]) => {
      const normalizedPrice = normalizePriceInput(priceValue);
      if (normalizedPrice === '') return;
      next.prices[tradeType][bucketKey] = normalizedPrice;
    });
  });

  return next;
};

const normalizePricingDraft = (value = {}) => {
  const next = createEmptyPricingDraft();
  next.defaultTradeType = normalizeTradeType(value?.defaultTradeType);
  if (value?.rows && typeof value.rows === 'object') {
    Object.entries(value.rows).forEach(([styleId, rowValue]) => {
      const key = String(styleId || '').trim();
      if (!key) return;
      next.rows[key] = normalizePricingRow(rowValue);
    });
  }
  return next;
};

const mergeDraftWithStyles = (draft, styles = []) => {
  const normalizedDraft = normalizePricingDraft(draft);
  const nextRows = { ...normalizedDraft.rows };

  styles.forEach((style) => {
    const styleId = String(style?.id || '').trim();
    if (!styleId || nextRows[styleId]) return;
    nextRows[styleId] = createEmptyPricingRow();
  });

  return {
    ...normalizedDraft,
    rows: nextRows,
  };
};

const resolvePrimaryTradeType = (row, defaultTradeType) => {
  const mode = normalizeRowMode(row?.mode);
  if (mode === 'CMPT' || mode === 'FOB') return mode;
  return normalizeTradeType(defaultTradeType);
};

const resolveAlternateTradeType = (tradeType) =>
  normalizeTradeType(tradeType) === 'CMPT' ? 'FOB' : 'CMPT';

const compareStyles = (left, right) => {
  const nameDiff = String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (nameDiff !== 0) return nameDiff;
  return String(left?.styleCode || '').localeCompare(String(right?.styleCode || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const CustomerDetail = () => {
  const { customerId: customerIdParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const { showNotification, navigateToPath } = useAppActions();

  const t = useMemo(() => createMessageGetter(languageCode), [languageCode]);
  const customerId = String(customerIdParam || '').trim();
  const isNew = customerId === 'new';
  const customerQuery = useMemo(() => buildQueryString({ orgId: activeOrgId }), [activeOrgId]);

  const tabFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('tab') === 'pricing' ? 'pricing' : 'basic';
  }, [location.search]);
  const resolvedTab = isNew ? 'basic' : tabFromQuery;

  const [currentTab, setCurrentTab] = useState(resolvedTab);
  const [loadedTabs, setLoadedTabs] = useState({
    basic: true,
    pricing: resolvedTab === 'pricing',
  });
  const [customerFormData, setCustomerFormData] = useState(createEmptyCustomerFormData);
  const [originalCustomerData, setOriginalCustomerData] = useState(createEmptyCustomerFormData);
  const [loadingCustomer, setLoadingCustomer] = useState(!isNew);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [styles, setStyles] = useState([]);
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [pricingDraft, setPricingDraft] = useState(createEmptyPricingDraft);
  const [savedPricingSnapshot, setSavedPricingSnapshot] = useState(
    JSON.stringify(createEmptyPricingDraft())
  );
  const [pricingLoaded, setPricingLoaded] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);
  const [pricingSaveError, setPricingSaveError] = useState('');
  const [styleSearchTerm, setStyleSearchTerm] = useState('');
  const [expandedStyleIds, setExpandedStyleIds] = useState({});

  const countryOptions = useMemo(
    () => getStaticOptionOptions('country', languageCode),
    [languageCode]
  );

  const detailTabLabel = useMemo(
    () =>
      isNew
        ? t('newTab')
        : t('detailTab', {
            name:
              resolveCustomerDisplayName(customerFormData, languageCode) ||
              resolveCustomerDisplayName(originalCustomerData, languageCode) ||
              customerId,
          }),
    [customerFormData, customerId, isNew, languageCode, originalCustomerData, t]
  );

  const customerName = useMemo(
    () =>
      resolveCustomerDisplayName(customerFormData, languageCode) ||
      customerFormData.code ||
      t('titleDetail'),
    [customerFormData, languageCode, t]
  );

  useEffect(() => {
    navigateToPath(`${location.pathname}${location.search}`, { label: detailTabLabel });
  }, [detailTabLabel, location.pathname, location.search, navigateToPath]);

  useEffect(() => {
    setCurrentTab(resolvedTab);
    if (resolvedTab === 'pricing') {
      setLoadedTabs((prev) => ({ ...prev, pricing: true }));
    }
  }, [resolvedTab]);

  useEffect(() => {
    let active = true;

    const loadCustomer = async () => {
      if (isNew) {
        const empty = createEmptyCustomerFormData();
        if (!active) return;
        setCustomerFormData(empty);
        setOriginalCustomerData(empty);
        setLoadingCustomer(false);
        return;
      }

      setLoadingCustomer(true);
      try {
        const customers = await requestJSON(`/customers${customerQuery}`);
        const matched = Array.isArray(customers)
          ? customers.find((item) => String(item?.id || '') === customerId)
          : null;
        if (!matched) {
          throw new Error(t('customerLoadError'));
        }

        const nextData = buildCustomerFormData(matched);
        if (!active) return;
        setCustomerFormData(nextData);
        setOriginalCustomerData(nextData);
      } catch (error) {
        if (!active) return;
        showNotification(error?.message || t('customerLoadError'), 'error');
      } finally {
        if (active) {
          setLoadingCustomer(false);
        }
      }
    };

    loadCustomer();
    return () => {
      active = false;
    };
  }, [customerId, customerQuery, isNew, showNotification, t]);

  const styleOwnerOrgId = useMemo(
    () => resolveCustomerStyleOwnerOrgId(customerFormData, activeOrgId),
    [activeOrgId, customerFormData]
  );

  useEffect(() => {
    let active = true;

    const loadPricing = async () => {
      if (isNew || !loadedTabs.pricing || !styleOwnerOrgId || !customerFormData.id) {
        return;
      }

      setLoadingStyles(true);
      setPricingLoaded(false);
      setSavingPricing(false);
      setPricingSaveError('');

      try {
        const [nextStyles, pricingResponse] = await Promise.all([
          fetchStyles({
            orgId: activeOrgId,
            ownerOrgId: styleOwnerOrgId,
            compact: true,
            forceRefresh: true,
            skipGlobalLoading: true,
          }),
          requestJSON(`/customers/${customerId}/pricing${customerQuery}`, {
            skipGlobalLoading: true,
          }),
        ]);

        if (!active) return;
        const sortedStyles = [...nextStyles].sort(compareStyles);
        const mergedDraft = mergeDraftWithStyles(pricingResponse, sortedStyles);
        const snapshot = JSON.stringify(mergedDraft);
        setStyles(sortedStyles);
        setExpandedStyleIds({});
        setPricingDraft(mergedDraft);
        setSavedPricingSnapshot(snapshot);
        setPricingLoaded(true);
      } catch (error) {
        if (!active) return;
        showNotification(error?.message || t('pricingLoadError'), 'error');
      } finally {
        if (active) {
          setLoadingStyles(false);
        }
      }
    };

    loadPricing();
    return () => {
      active = false;
    };
  }, [
    activeOrgId,
    customerFormData.id,
    customerId,
    customerQuery,
    isNew,
    loadedTabs.pricing,
    showNotification,
    styleOwnerOrgId,
    t,
  ]);

  const customerDirty = useMemo(
    () => JSON.stringify(customerFormData) !== JSON.stringify(originalCustomerData),
    [customerFormData, originalCustomerData]
  );
  const pricingDirty = useMemo(
    () => JSON.stringify(pricingDraft) !== savedPricingSnapshot,
    [pricingDraft, savedPricingSnapshot]
  );
  useUnsavedChanges(customerDirty || pricingDirty);

  const handleBasicFieldChange = useCallback((event) => {
    const { name, value } = event.target;
    setCustomerFormData((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleCountryChange = useCallback((event) => {
    const nextCountry = normalizeCountry(event.target.value) || 'VN';
    setCustomerFormData((prev) => ({
      ...prev,
      country: nextCountry,
      countryCode: resolveDefaultCountryCode(nextCountry),
    }));
  }, []);

  const handleCustomerSave = useCallback(async () => {
    if (savingCustomer) return;

    const payload = buildCustomerPayload(customerFormData);
    if (!payload.code) {
      showNotification(t('codeRequired'), 'error');
      return;
    }
    if (!payload.name) {
      showNotification(t('nameRequired'), 'error');
      return;
    }

    setSavingCustomer(true);
    try {
      const response = await requestJSON(
        isNew ? `/customers${customerQuery}` : `/customers/${customerId}${customerQuery}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const nextData = buildCustomerFormData(response);
      setCustomerFormData(nextData);
      setOriginalCustomerData(nextData);
      showNotification(t('saveCustomerSuccess'), 'success');

      if (isNew) {
        navigateToPath(`/customer/${response.id}`, {
          label: t('detailTab', {
            name: resolveCustomerDisplayName(response, languageCode) || response?.code || response?.id,
          }),
          closeTabId: '/customer/new',
          skipUnsavedChangesCheck: true,
        });
      }
    } catch (error) {
      showNotification(error?.message || t('saveError'), 'error');
    } finally {
      setSavingCustomer(false);
    }
  }, [
    customerFormData,
    customerId,
    customerQuery,
    isNew,
    languageCode,
    navigateToPath,
    savingCustomer,
    showNotification,
    t,
  ]);

  const handlePricingSave = useCallback(async () => {
    if (isNew || savingPricing || !pricingLoaded || !pricingDirty) return;

    setSavingPricing(true);
    setPricingSaveError('');
    try {
      const response = await requestJSON(`/customers/${customerId}/pricing${customerQuery}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pricingDraft),
        skipGlobalLoading: true,
      });

      const mergedDraft = mergeDraftWithStyles(response, styles);
      const mergedSnapshot = JSON.stringify(mergedDraft);
      setSavedPricingSnapshot(mergedSnapshot);
      setPricingDraft(mergedDraft);
      showNotification(t('savePricingSuccess'), 'success');
    } catch (error) {
      setPricingSaveError(error?.message || t('pricingSaveError'));
    } finally {
      setSavingPricing(false);
    }
  }, [
    customerId,
    customerQuery,
    isNew,
    pricingDirty,
    pricingDraft,
    pricingLoaded,
    savingPricing,
    showNotification,
    styles,
    t,
  ]);

  const updatePricingDraft = useCallback((updater) => {
    setPricingSaveError('');
    setPricingDraft((prev) =>
      normalizePricingDraft(typeof updater === 'function' ? updater(prev) : updater)
    );
  }, []);

  const handleDefaultTradeTypeChange = useCallback((nextTradeType) => {
    updatePricingDraft((prev) => ({
      ...prev,
      defaultTradeType: nextTradeType,
    }));
  }, [updatePricingDraft]);

  const handlePricingModeChange = useCallback((styleId, nextMode) => {
    updatePricingDraft((prev) => ({
      ...prev,
      rows: {
        ...prev.rows,
        [styleId]: {
          ...normalizePricingRow(prev.rows[styleId]),
          mode: nextMode,
        },
      },
    }));
  }, [updatePricingDraft]);

  const handlePriceChange = useCallback((styleId, tradeType, bucketQuantity, rawValue) => {
    const normalizedValue = normalizePriceInput(rawValue);
    updatePricingDraft((prev) => {
      const currentRow = normalizePricingRow(prev.rows[styleId]);
      const nextTradeTypeMap = { ...currentRow.prices[tradeType] };

      if (normalizedValue === '') {
        delete nextTradeTypeMap[bucketQuantity];
      } else {
        nextTradeTypeMap[bucketQuantity] = normalizedValue;
      }

      return {
        ...prev,
        rows: {
          ...prev.rows,
          [styleId]: {
            ...currentRow,
            prices: {
              ...currentRow.prices,
              [tradeType]: nextTradeTypeMap,
            },
          },
        },
      };
    });
  }, [updatePricingDraft]);

  const handleOpenStyle = useCallback((style) => {
    const ownerOrgId = resolveCustomerStyleOwnerOrgId(
      { brandOrgId: style?.ownerOrgId },
      activeOrgId
    );
    const query = buildQueryString({ ownerOrgId });
    navigateToPath(`/style/${style.id}${query}`, {
      label: style?.name || style?.styleCode || style?.id || getUiMessage('menu.style', 'Style', languageCode),
    });
  }, [activeOrgId, languageCode, navigateToPath]);

  const handleTabChange = useCallback((_, nextTab) => {
    if (!nextTab) return;
    if (nextTab === 'pricing' && isNew) return;

    setCurrentTab(nextTab);
    setLoadedTabs((prev) => ({ ...prev, [nextTab]: true }));

    const params = new URLSearchParams(location.search);
    if (nextTab === 'pricing') {
      params.set('tab', 'pricing');
    } else {
      params.delete('tab');
    }

    const nextSearch = params.toString();
    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : '',
      },
      { replace: true }
    );
  }, [isNew, location.pathname, location.search, navigate]);

  const filteredStyles = useMemo(() => {
    const lowerSearch = styleSearchTerm.trim().toLowerCase();
    return styles.filter((style) => {
      const matchesSearch =
        !lowerSearch || String(style?.name || '').toLowerCase().includes(lowerSearch);
      return matchesSearch;
    });
  }, [styleSearchTerm, styles]);

  return (
    <AppPageContainer
      title={isNew ? t('titleNew') : t('titleDetail')}
      titleActions={
        currentTab === 'basic' ? (
          <SaveButton
            onClick={handleCustomerSave}
            disabled={loadingCustomer || savingCustomer || !customerDirty}
            loading={savingCustomer}
          >
            {t('saveCustomer')}
          </SaveButton>
        ) : currentTab === 'pricing' && !isNew ? (
          <SaveButton
            onClick={handlePricingSave}
            disabled={loadingStyles || savingPricing || !pricingLoaded || !pricingDirty}
            loading={savingPricing}
          >
            {t('savePricing')}
          </SaveButton>
        ) : null
      }
      toolbar={
        <PageToolbar
          left={
            <ToggleButtonGroup
              value={currentTab}
              exclusive
              onChange={handleTabChange}
              aria-label="customer detail tabs"
            >
              <ToggleButton value="basic">{t('tabBasic')}</ToggleButton>
              <ToggleButton value="pricing" disabled={isNew}>
                {t('tabPricing')}
              </ToggleButton>
            </ToggleButtonGroup>
          }
        />
      }
    >
      <Stack spacing={2.5}>
        {loadedTabs.basic && (
          <Box sx={{ display: currentTab === 'basic' ? 'block' : 'none' }}>
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 3 }}>
              <Stack spacing={1.8}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    required
                    label={t('customerCode')}
                    name="code"
                    value={customerFormData.code}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                  <TextField
                    fullWidth
                    required
                    label={t('customerName')}
                    name="name"
                    value={customerFormData.name}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label="고객명 (한글)"
                    name="nameKo"
                    value={customerFormData.nameKo}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                  <TextField
                    fullWidth
                    label="고객명 (베트남어)"
                    name="nameVi"
                    value={customerFormData.nameVi}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    select
                    label={t('country')}
                    name="country"
                    value={normalizeCountry(customerFormData.country) || 'VN'}
                    onChange={handleCountryChange}
                    disabled={savingCustomer}
                  >
                    {countryOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    fullWidth
                    label={t('registeredAt')}
                    value={formatCustomerDate(customerFormData.registeredAt, languageCode)}
                    disabled
                  />
                </Stack>
                <TextField
                  fullWidth
                  label={t('address')}
                  name="address"
                  value={customerFormData.address}
                  onChange={handleBasicFieldChange}
                  disabled={savingCustomer}
                />
                <TextField
                  fullWidth
                  label={t('manager')}
                  name="manager"
                  value={customerFormData.manager}
                  onChange={handleBasicFieldChange}
                  disabled={savingCustomer}
                />
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label={t('countryCode')}
                    name="countryCode"
                    value={customerFormData.countryCode}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                  <TextField
                    fullWidth
                    label={t('phoneNumber')}
                    name="phoneNumber"
                    value={customerFormData.phoneNumber}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                </Stack>
                <TextField
                  fullWidth
                  label={t('email')}
                  name="email"
                  type="email"
                  value={customerFormData.email}
                  onChange={handleBasicFieldChange}
                  disabled={savingCustomer}
                />
              </Stack>
            </Paper>
          </Box>
        )}

        {loadedTabs.pricing && (
          <Box sx={{ display: currentTab === 'pricing' ? 'block' : 'none' }}>
            {isNew ? (
              <Alert severity="info">
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {t('pricingDisabledTitle')}
                </Typography>
                <Typography variant="body2">{t('pricingDisabledBody')}</Typography>
              </Alert>
            ) : (
              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ borderRadius: 2, p: 2 }}>
                  <Stack spacing={1.75}>
                    <Stack
                      direction={{ xs: 'column', xl: 'row' }}
                      spacing={1.5}
                      justifyContent="space-between"
                      sx={{ alignItems: { xl: 'center' } }}
                    >
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <Typography variant="h6" sx={{ fontWeight: 800 }}>
                          {customerName}
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                        <ToggleButtonGroup
                          size="small"
                          value={pricingDraft.defaultTradeType}
                          exclusive
                          onChange={(_event, nextTradeType) => {
                            if (!nextTradeType) return;
                            handleDefaultTradeTypeChange(nextTradeType);
                          }}
                        >
                          {TRADE_TYPES.map((tradeType) => (
                            <ToggleButton key={tradeType} value={tradeType}>
                              {tradeType}
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      </Stack>
                    </Stack>

                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: { xs: 'column', lg: 'row' },
                        alignItems: { lg: 'center' },
                        gap: 1.5,
                        width: '100%',
                      }}
                    >
                      <Box sx={{ width: { xs: '100%', md: 280 }, maxWidth: '100%' }}>
                        <SearchInput
                          placeholder={t('styleSearch')}
                          value={styleSearchTerm}
                          onChange={(event) => setStyleSearchTerm(event.target.value)}
                        />
                      </Box>

                      <Stack
                        direction="row"
                        spacing={1}
                        useFlexGap
                        sx={{
                          flexWrap: 'wrap',
                          flex: { lg: '1 1 auto' },
                          justifyContent: { xs: 'flex-start', lg: 'flex-end' },
                          marginLeft: { lg: 'auto' },
                          width: { xs: '100%', lg: 'auto' },
                        }}
                      >
                        <Chip size="small" label={`${t('stylesCount')} ${styles.length}`} />
                      </Stack>
                    </Box>
                  </Stack>
                </Paper>

                {pricingSaveError ? (
                  <Alert severity="error">{pricingSaveError}</Alert>
                ) : null}

                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <TableContainer sx={{ maxHeight: 'calc(100vh - 320px)', overflowX: 'hidden' }}>
                    <Table stickyHeader size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '7%' }} />
                        {PRICE_BUCKETS.map((bucketQuantity) => (
                          <col key={`col:${bucketQuantity}`} style={{ width: `${78 / PRICE_BUCKETS.length}%` }} />
                        ))}
                        <col style={{ width: '5%' }} />
                      </colgroup>
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('styleName')}</TableCell>
                          <TableCell align="center">{t('pricingRule')}</TableCell>
                          {PRICE_BUCKETS.map((bucketQuantity) => (
                            <TableCell key={`bucket:${bucketQuantity}`} align="center">
                              {formatNumberWithCommas(bucketQuantity)}
                            </TableCell>
                          ))}
                          <TableCell align="center">{t('actions')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {loadingStyles && (
                          <TableRow>
                            <TableCell colSpan={PRICE_BUCKETS.length + 3} sx={{ py: 3, textAlign: 'center' }}>
                              {t('loadingStyles')}
                            </TableCell>
                          </TableRow>
                        )}
                        {!loadingStyles && filteredStyles.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={PRICE_BUCKETS.length + 3} sx={{ py: 3, textAlign: 'center' }}>
                              {t('emptyStyles')}
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredStyles.map((style) => {
                          const row = normalizePricingRow(pricingDraft.rows[style.id]);
                          const primaryTradeType = resolvePrimaryTradeType(row, pricingDraft.defaultTradeType);
                          const alternateTradeType = resolveAlternateTradeType(primaryTradeType);
                          const isExpanded =
                            expandedStyleIds[style.id] === true || row.mode === 'BOTH';

                          return (
                            <React.Fragment key={style.id}>
                              <TableRow hover>
                                <TableCell>
                                  <Typography
                                    variant="body2"
                                    sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                  >
                                    {style.name || '-'}
                                  </Typography>
                                </TableCell>
                                <TableCell align="center">
                                  <TextField
                                    select
                                    size="small"
                                    value={primaryTradeType}
                                    onChange={(event) => {
                                      const nextTradeType = event.target.value;
                                      handlePricingModeChange(
                                        style.id,
                                        nextTradeType === pricingDraft.defaultTradeType
                                          ? 'DEFAULT'
                                          : nextTradeType
                                      );
                                    }}
                                    sx={{ width: '100%' }}
                                  >
                                    {TRADE_TYPES.map((tradeType) => (
                                      <MenuItem key={tradeType} value={tradeType}>
                                        {tradeType}
                                      </MenuItem>
                                    ))}
                                  </TextField>
                                </TableCell>
                                {PRICE_BUCKETS.map((bucketQuantity) => {
                                  const value = row.prices?.[primaryTradeType]?.[bucketQuantity] ?? '';
                                  return (
                                    <TableCell key={`${style.id}:${primaryTradeType}:${bucketQuantity}`} align="center">
                                      <PricingAmountField
                                        value={value}
                                        onChange={(nextValue) =>
                                          handlePriceChange(
                                            style.id,
                                            primaryTradeType,
                                            bucketQuantity,
                                            nextValue
                                          )
                                        }
                                        shaded
                                      />
                                    </TableCell>
                                  );
                                })}
                                <TableCell align="center">
                                  <Stack direction="row" justifyContent="center" spacing={0.25}>
                                    <Tooltip title={t('manageStyle')}>
                                      <IconButton size="small" onClick={() => handleOpenStyle(style)}>
                                        <OpenInNewRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title={isExpanded ? t('draftClose') : t('draftOpen')}>
                                      <IconButton
                                        size="small"
                                        onClick={() =>
                                          setExpandedStyleIds((prev) => ({
                                            ...prev,
                                            [style.id]: !isExpanded,
                                          }))
                                        }
                                      >
                                        {isExpanded ? (
                                          <ExpandLessRoundedIcon fontSize="small" />
                                        ) : (
                                          <ExpandMoreRoundedIcon fontSize="small" />
                                        )}
                                      </IconButton>
                                    </Tooltip>
                                  </Stack>
                                </TableCell>
                              </TableRow>

                              {isExpanded && (
                                <TableRow sx={{ backgroundColor: 'rgba(248, 250, 252, 0.8)' }}>
                                  <TableCell>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                      {style.name || '-'}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {alternateTradeType}
                                    </Typography>
                                  </TableCell>
                                  <TableCell align="center">
                                    <Chip size="small" variant="outlined" label={alternateTradeType} />
                                  </TableCell>
                                  {PRICE_BUCKETS.map((bucketQuantity) => {
                                    const value = row.prices?.[alternateTradeType]?.[bucketQuantity] ?? '';
                                    return (
                                      <TableCell key={`${style.id}:${alternateTradeType}:${bucketQuantity}`} align="center">
                                        <PricingAmountField
                                          value={value}
                                          onChange={(nextValue) =>
                                            handlePriceChange(
                                              style.id,
                                              alternateTradeType,
                                              bucketQuantity,
                                              nextValue
                                            )
                                          }
                                        />
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell />
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Stack>
            )}
          </Box>
        )}
      </Stack>
    </AppPageContainer>
  );
};

export default CustomerDetail;
