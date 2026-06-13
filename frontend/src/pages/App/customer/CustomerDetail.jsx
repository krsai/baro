import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
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
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
import SearchInput from '../../../components/SearchInput';
import { getUiMessage } from '../../../constants/uiMessages';
import { getStaticOptionLabel, getStaticOptionOptions } from '../../../constants/staticOptionRegistry';
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
  resolveCustomerStyleOwnerOrgId,
  resolveDefaultCountryCode,
  normalizeCountry,
} from './customerFormShared';
const HIDDEN_BUCKETS = new Set([2, 20]);
const PRICE_BUCKETS = ST_STANDARD_BUCKETS.filter((quantity) => !HIDDEN_BUCKETS.has(quantity));
const TRADE_TYPES = ['CMPT', 'FOB'];
const PROTOTYPE_STORAGE_PREFIX = 'baro:customer-pricing-prototype';

const DETAIL_TEXT = {
  ko: {
    newTab: '고객 추가',
    detailTab: '고객: {name}',
    titleNew: '고객 추가',
    titleDetail: '고객 상세',
    subtitle: '고객 기본정보와 고객별 스타일 단가를 한 화면에서 관리합니다.',
    tabBasic: '기본정보',
    tabPricing: '단가 관리',
    basicInfo: '기본정보',
    pricingInfo: '단가 관리',
    saveCustomer: '고객 저장',
    pricingSaveDraft: '브라우저 임시 저장',
    resetDraft: '되돌리기',
    saveCustomerSuccess: '고객 정보를 저장했습니다.',
    saveDraftSuccess: '단가 프로토타입을 이 브라우저에 저장했습니다.',
    saveError: '고객 정보를 저장하지 못했습니다.',
    customerLoadError: '고객 정보를 불러오지 못했습니다.',
    stylesLoadError: '스타일 목록을 불러오지 못했습니다.',
    codeRequired: '고객 코드를 입력해주세요.',
    nameRequired: '고객명을 입력해주세요.',
    pricingDisabledTitle: '고객을 먼저 저장해주세요.',
    pricingDisabledBody: '단가 표는 저장된 고객 상세에서만 확인할 수 있습니다.',
    prototypeNotice:
      '단가 관리 탭은 UX 검토용 프로토타입입니다. 현재 저장은 브라우저 임시 저장으로만 동작합니다.',
    defaultTradeType: '기본 거래방식',
    pricingMemo: '단가 메모',
    pricingMemoPlaceholder: '고객별 거래 기준이나 예외 메모를 남겨보세요.',
    styleSearch: '스타일 검색',
    incompleteOnly: '미입력만',
    exceptionsOnly: '예외만',
    showAltPrices: '보조 타입 펼치기',
    stylesCount: '스타일',
    startedCount: '입력 시작',
    completeCount: '입력 완료',
    exceptionCount: '예외',
    primaryPrice: '기본 표',
    alternatePrice: '보조 표',
    styleCode: '스타일 코드',
    styleName: '스타일명',
    pricingRule: '적용 방식',
    actions: '작업',
    emptyStyles: '연결된 스타일이 없습니다.',
    loadingStyles: '스타일을 불러오는 중입니다.',
    draftOpen: '보조 단가',
    draftClose: '접기',
    ruleDefault: '기본 사용',
    ruleCmpt: 'CMPT만',
    ruleFob: 'FOB만',
    ruleBoth: '둘 다',
    basicRuleSuffix: '{type} 기본',
    compareModeHelper: '스타일별 예외가 있으면 적용 방식을 바꿔서 다른 타입 단가를 함께 입력할 수 있습니다.',
    manageStyle: '스타일 열기',
    viewPricing: '단가 관리 열기',
    infoSavedAt: '등록일',
    infoCountry: '국가',
    infoManager: '담당자',
    infoEmail: '이메일',
    customerName: '고객명',
    customerCode: '고객 코드',
    countryCode: '국가번호',
    phoneNumber: '전화번호',
    registeredStyles: '등록 스타일',
  },
  en: {
    newTab: 'Add Customer',
    detailTab: 'Customer: {name}',
    titleNew: 'Add Customer',
    titleDetail: 'Customer Detail',
    subtitle: 'Manage the customer profile and customer-level style pricing together.',
    tabBasic: 'Basic Info',
    tabPricing: 'Pricing',
    basicInfo: 'Basic Info',
    pricingInfo: 'Pricing',
    saveCustomer: 'Save Customer',
    pricingSaveDraft: 'Save Browser Draft',
    resetDraft: 'Revert',
    saveCustomerSuccess: 'Customer information has been saved.',
    saveDraftSuccess: 'Pricing prototype draft was saved in this browser.',
    saveError: 'Failed to save customer information.',
    customerLoadError: 'Failed to load customer information.',
    stylesLoadError: 'Failed to load styles.',
    codeRequired: 'Enter a customer code.',
    nameRequired: 'Enter a customer name.',
    pricingDisabledTitle: 'Save the customer first.',
    pricingDisabledBody: 'The pricing matrix is available after the customer record exists.',
    prototypeNotice:
      'The pricing tab is a UX prototype. Saving currently writes to a browser-only draft.',
    defaultTradeType: 'Default Trade Type',
    pricingMemo: 'Pricing Memo',
    pricingMemoPlaceholder: 'Leave notes for the customer pricing policy or exceptions.',
    styleSearch: 'Search styles',
    incompleteOnly: 'Incomplete only',
    exceptionsOnly: 'Exceptions only',
    showAltPrices: 'Expand alternate prices',
    stylesCount: 'Styles',
    startedCount: 'Started',
    completeCount: 'Complete',
    exceptionCount: 'Exceptions',
    primaryPrice: 'Primary grid',
    alternatePrice: 'Alternate grid',
    styleCode: 'Style Code',
    styleName: 'Style Name',
    pricingRule: 'Rule',
    actions: 'Actions',
    emptyStyles: 'No linked styles found.',
    loadingStyles: 'Loading styles...',
    draftOpen: 'Alt prices',
    draftClose: 'Collapse',
    ruleDefault: 'Use default',
    ruleCmpt: 'CMPT only',
    ruleFob: 'FOB only',
    ruleBoth: 'Both',
    basicRuleSuffix: 'Default {type}',
    compareModeHelper:
      'Switch a style to an exception rule when it needs the other trade type or both.',
    manageStyle: 'Open style',
    viewPricing: 'Open pricing',
    infoSavedAt: 'Registered',
    infoCountry: 'Country',
    infoManager: 'Manager',
    infoEmail: 'Email',
    customerName: 'Customer Name',
    customerCode: 'Customer Code',
    countryCode: 'Country Code',
    phoneNumber: 'Phone Number',
    registeredStyles: 'Linked styles',
  },
  vi: {
    newTab: 'Them khach hang',
    detailTab: 'Khach hang: {name}',
    titleNew: 'Them khach hang',
    titleDetail: 'Chi tiet khach hang',
    subtitle: 'Quan ly thong tin khach hang va bang don gia theo style trong cung mot man hinh.',
    tabBasic: 'Thong tin co ban',
    tabPricing: 'Don gia',
    basicInfo: 'Thong tin co ban',
    pricingInfo: 'Don gia',
    saveCustomer: 'Luu khach hang',
    pricingSaveDraft: 'Luu nhap tren trinh duyet',
    resetDraft: 'Hoan tac',
    saveCustomerSuccess: 'Da luu thong tin khach hang.',
    saveDraftSuccess: 'Da luu ban nhap don gia tren trinh duyet.',
    saveError: 'Khong the luu thong tin khach hang.',
    customerLoadError: 'Khong the tai thong tin khach hang.',
    stylesLoadError: 'Khong the tai danh sach style.',
    codeRequired: 'Hay nhap ma khach hang.',
    nameRequired: 'Hay nhap ten khach hang.',
    pricingDisabledTitle: 'Hay luu khach hang truoc.',
    pricingDisabledBody: 'Bang don gia chi hien khi da co ban ghi khach hang.',
    prototypeNotice:
      'Tab don gia la ban mau UX. Hien tai chi luu tam tren trinh duyet.',
    defaultTradeType: 'Loai giao dich mac dinh',
    pricingMemo: 'Ghi chu don gia',
    pricingMemoPlaceholder: 'Ghi chu chinh sach gia hoac ngoai le cho khach hang.',
    styleSearch: 'Tim style',
    incompleteOnly: 'Chi hien thieu',
    exceptionsOnly: 'Chi hien ngoai le',
    showAltPrices: 'Mo don gia bo sung',
    stylesCount: 'Style',
    startedCount: 'Da nhap',
    completeCount: 'Hoan tat',
    exceptionCount: 'Ngoai le',
    primaryPrice: 'Bang chinh',
    alternatePrice: 'Bang phu',
    styleCode: 'Ma style',
    styleName: 'Ten style',
    pricingRule: 'Quy tac',
    actions: 'Tac vu',
    emptyStyles: 'Khong co style lien ket.',
    loadingStyles: 'Dang tai style...',
    draftOpen: 'Gia bo sung',
    draftClose: 'Thu gon',
    ruleDefault: 'Dung mac dinh',
    ruleCmpt: 'Chi CMPT',
    ruleFob: 'Chi FOB',
    ruleBoth: 'Ca hai',
    basicRuleSuffix: 'Mac dinh {type}',
    compareModeHelper:
      'Doi quy tac cua tung style neu can giao dich khac loai hoac can luu ca hai loai gia.',
    manageStyle: 'Mo style',
    viewPricing: 'Mo don gia',
    infoSavedAt: 'Ngay dang ky',
    infoCountry: 'Quoc gia',
    infoManager: 'Nguoi phu trach',
    infoEmail: 'Email',
    customerName: 'Ten khach hang',
    customerCode: 'Ma khach hang',
    countryCode: 'Ma quoc gia',
    phoneNumber: 'So dien thoai',
    registeredStyles: 'Style lien ket',
  },
};

const createMessageGetter = (languageCode) => {
  const locale =
    languageCode === 'ko' || languageCode === 'en' || languageCode === 'vi'
      ? languageCode
      : 'en';
  const dictionary = DETAIL_TEXT[locale] || DETAIL_TEXT.en;
  return (key, params = {}) =>
    Object.entries(params).reduce(
      (message, [token, value]) =>
        message.replaceAll(`{${token}}`, String(value ?? '')),
      dictionary[key] ?? DETAIL_TEXT.en[key] ?? key
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
  memo: '',
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
  next.memo = typeof value?.memo === 'string' ? value.memo : '';

  if (value?.rows && typeof value.rows === 'object') {
    Object.entries(value.rows).forEach(([styleId, rowValue]) => {
      const key = String(styleId || '').trim();
      if (!key) return;
      next.rows[key] = normalizePricingRow(rowValue);
    });
  }

  return next;
};

const getPricingStorageKey = (orgId, customerId) =>
  `${PROTOTYPE_STORAGE_PREFIX}:${orgId || 'global'}:${customerId || 'new'}`;

const readPricingDraft = (storageKey) => {
  if (typeof window === 'undefined' || !storageKey) return createEmptyPricingDraft();
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return createEmptyPricingDraft();
    return normalizePricingDraft(JSON.parse(raw));
  } catch (_error) {
    return createEmptyPricingDraft();
  }
};

const writePricingDraft = (storageKey, draft) => {
  if (typeof window === 'undefined' || !storageKey) return;
  window.localStorage.setItem(storageKey, JSON.stringify(normalizePricingDraft(draft)));
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

const hasBucketValue = (row, tradeType, bucketQuantity) =>
  String(row?.prices?.[tradeType]?.[bucketQuantity] ?? '').trim() !== '';

const hasAnyPriceForTradeType = (row, tradeType) =>
  PRICE_BUCKETS.some((bucketQuantity) => hasBucketValue(row, tradeType, bucketQuantity));

const hasCompletePriceForTradeType = (row, tradeType) =>
  PRICE_BUCKETS.every((bucketQuantity) => hasBucketValue(row, tradeType, bucketQuantity));

const formatPriceDisplay = (value) => {
  if (value == null || value === '') return '';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric % 1 === 0 ? String(numeric) : numeric.toFixed(2);
};

const compareStyles = (left, right) => {
  const codeDiff = String(left?.styleCode || '').localeCompare(String(right?.styleCode || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (codeDiff !== 0) return codeDiff;
  return String(left?.name || '').localeCompare(String(right?.name || ''), undefined, {
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

  const detailMessage = useMemo(() => createMessageGetter(languageCode), [languageCode]);
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
  const [pricingDraft, setPricingDraft] = useState(createEmptyPricingDraft);
  const [savedPricingSnapshot, setSavedPricingSnapshot] = useState(JSON.stringify(createEmptyPricingDraft()));
  const [loadingStyles, setLoadingStyles] = useState(false);
  const [styles, setStyles] = useState([]);
  const [styleSearchTerm, setStyleSearchTerm] = useState('');
  const [showIncompleteOnly, setShowIncompleteOnly] = useState(false);
  const [showExceptionsOnly, setShowExceptionsOnly] = useState(false);
  const [showAlternatePrices, setShowAlternatePrices] = useState(false);
  const [expandedStyleIds, setExpandedStyleIds] = useState({});

  const countryOptions = useMemo(
    () => getStaticOptionOptions('country', languageCode),
    [languageCode]
  );

  const detailTabLabel = useMemo(
    () =>
      isNew
        ? detailMessage('newTab')
        : detailMessage('detailTab', {
            name:
              resolveCustomerDisplayName(customerFormData, languageCode) ||
              resolveCustomerDisplayName(originalCustomerData, languageCode) ||
              customerId,
          }),
    [customerFormData, customerId, detailMessage, isNew, languageCode, originalCustomerData]
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
          throw new Error(detailMessage('customerLoadError'));
        }

        const nextData = buildCustomerFormData(matched);
        if (!active) return;
        setCustomerFormData(nextData);
        setOriginalCustomerData(nextData);
      } catch (error) {
        if (!active) return;
        showNotification(error?.message || detailMessage('customerLoadError'), 'error');
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
  }, [customerId, customerQuery, detailMessage, isNew, showNotification]);

  const pricingStorageKey = useMemo(
    () => (isNew ? '' : getPricingStorageKey(activeOrgId, customerId)),
    [activeOrgId, customerId, isNew]
  );

  const styleOwnerOrgId = useMemo(
    () => resolveCustomerStyleOwnerOrgId(customerFormData, activeOrgId),
    [activeOrgId, customerFormData]
  );

  useEffect(() => {
    let active = true;

    const loadCustomerStyles = async () => {
      if (isNew || !styleOwnerOrgId) {
        setStyles([]);
        setPricingDraft(createEmptyPricingDraft());
        setSavedPricingSnapshot(JSON.stringify(createEmptyPricingDraft()));
        return;
      }

      setLoadingStyles(true);
      try {
        const nextStyles = await fetchStyles({
          orgId: activeOrgId,
          ownerOrgId: styleOwnerOrgId,
          compact: true,
          forceRefresh: true,
          skipGlobalLoading: true,
        });

        if (!active) return;
        const sortedStyles = [...nextStyles].sort(compareStyles);
        setStyles(sortedStyles);

        const mergedDraft = mergeDraftWithStyles(readPricingDraft(pricingStorageKey), sortedStyles);
        const snapshot = JSON.stringify(mergedDraft);
        setPricingDraft(mergedDraft);
        setSavedPricingSnapshot(snapshot);
      } catch (error) {
        if (!active) return;
        setStyles([]);
        showNotification(error?.message || detailMessage('stylesLoadError'), 'error');
      } finally {
        if (active) {
          setLoadingStyles(false);
        }
      }
    };

    loadCustomerStyles();
    return () => {
      active = false;
    };
  }, [activeOrgId, detailMessage, isNew, pricingStorageKey, showNotification, styleOwnerOrgId]);

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
      showNotification(detailMessage('codeRequired'), 'error');
      return;
    }
    if (!payload.name) {
      showNotification(detailMessage('nameRequired'), 'error');
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
      showNotification(detailMessage('saveCustomerSuccess'), 'success');

      if (isNew) {
        navigateToPath(`/customer/${response.id}`, {
          label: detailMessage('detailTab', {
            name: resolveCustomerDisplayName(response, languageCode) || response?.code || response?.id,
          }),
          closeTabId: '/customer/new',
          skipUnsavedChangesCheck: true,
        });
      }
    } catch (error) {
      showNotification(error?.message || detailMessage('saveError'), 'error');
    } finally {
      setSavingCustomer(false);
    }
  }, [
    customerFormData,
    customerId,
    customerQuery,
    detailMessage,
    isNew,
    languageCode,
    navigateToPath,
    savingCustomer,
    showNotification,
  ]);

  const updatePricingDraft = useCallback((updater) => {
    setPricingDraft((prev) => normalizePricingDraft(typeof updater === 'function' ? updater(prev) : updater));
  }, []);

  const handlePricingMetaChange = useCallback((field, value) => {
    updatePricingDraft((prev) => ({
      ...prev,
      [field]: value,
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
      const nextTradeTypeMap = {
        ...currentRow.prices[tradeType],
      };

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

  const handleSavePricingDraft = useCallback(() => {
    if (!pricingStorageKey) return;
    const normalized = normalizePricingDraft(pricingDraft);
    writePricingDraft(pricingStorageKey, normalized);
    setSavedPricingSnapshot(JSON.stringify(normalized));
    showNotification(detailMessage('saveDraftSuccess'), 'success');
  }, [detailMessage, pricingDraft, pricingStorageKey, showNotification]);

  const handleResetPricingDraft = useCallback(() => {
    const restored = normalizePricingDraft(JSON.parse(savedPricingSnapshot));
    setPricingDraft(restored);
  }, [savedPricingSnapshot]);

  const handleOpenStyle = useCallback((style) => {
    const ownerOrgId = resolveCustomerStyleOwnerOrgId({ brandOrgId: style?.ownerOrgId }, activeOrgId);
    const query = buildQueryString({ ownerOrgId });
    navigateToPath(`/style/${style.id}${query}`, {
      label: style?.name || style?.styleCode || style?.id || getUiMessage('menu.style', 'Style', languageCode),
    });
  }, [activeOrgId, languageCode, navigateToPath]);

  const openPricingTabFromBasic = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set('tab', 'pricing');
    navigate(
      {
        pathname: location.pathname,
        search: `?${params.toString()}`,
      },
      { replace: true }
    );
  }, [location.pathname, location.search, navigate]);

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
      const row = normalizePricingRow(pricingDraft.rows[style.id]);
      const primaryTradeType = resolvePrimaryTradeType(row, pricingDraft.defaultTradeType);
      const isException = row.mode !== 'DEFAULT';
      const isIncomplete = !hasCompletePriceForTradeType(row, primaryTradeType);
      const matchesSearch =
        !lowerSearch ||
        String(style?.styleCode || '').toLowerCase().includes(lowerSearch) ||
        String(style?.name || '').toLowerCase().includes(lowerSearch);

      if (!matchesSearch) return false;
      if (showIncompleteOnly && !isIncomplete) return false;
      if (showExceptionsOnly && !isException) return false;
      return true;
    });
  }, [pricingDraft, showExceptionsOnly, showIncompleteOnly, styleSearchTerm, styles]);

  const pricingStats = useMemo(() => {
    let started = 0;
    let complete = 0;
    let exceptions = 0;

    styles.forEach((style) => {
      const row = normalizePricingRow(pricingDraft.rows[style.id]);
      const primaryTradeType = resolvePrimaryTradeType(row, pricingDraft.defaultTradeType);
      if (hasAnyPriceForTradeType(row, primaryTradeType)) started += 1;
      if (hasCompletePriceForTradeType(row, primaryTradeType)) complete += 1;
      if (row.mode !== 'DEFAULT') exceptions += 1;
    });

    return {
      total: styles.length,
      started,
      complete,
      exceptions,
    };
  }, [pricingDraft, styles]);

  const summaryItems = useMemo(
    () => [
      {
        label: detailMessage('infoCountry'),
        value:
          getStaticOptionLabel(
            'country',
            normalizeCountry(customerFormData.country),
            customerFormData.country || '-',
            languageCode
          ) || '-',
      },
      {
        label: detailMessage('infoManager'),
        value: customerFormData.manager || '-',
      },
      {
        label: detailMessage('infoEmail'),
        value: customerFormData.email || '-',
      },
      {
        label: detailMessage('registeredStyles'),
        value: String(pricingStats.total || 0),
      },
    ],
    [customerFormData.country, customerFormData.email, customerFormData.manager, detailMessage, languageCode, pricingStats.total]
  );

  return (
    <AppPageContainer
      title={isNew ? detailMessage('titleNew') : detailMessage('titleDetail')}
      titleActions={
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {currentTab === 'pricing' ? (
            <>
              <Button
                variant="outlined"
                onClick={handleResetPricingDraft}
                disabled={!pricingDirty}
              >
                {detailMessage('resetDraft')}
              </Button>
              <SaveButton
                onClick={handleSavePricingDraft}
                disabled={loadingStyles || isNew || !pricingDirty}
              >
                {detailMessage('pricingSaveDraft')}
              </SaveButton>
            </>
          ) : (
            <SaveButton
              onClick={handleCustomerSave}
              disabled={loadingCustomer || savingCustomer || !customerDirty}
              loading={savingCustomer}
            >
              {detailMessage('saveCustomer')}
            </SaveButton>
          )}
        </Stack>
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
              <ToggleButton value="basic">{detailMessage('tabBasic')}</ToggleButton>
              <ToggleButton value="pricing" disabled={isNew}>
                {detailMessage('tabPricing')}
              </ToggleButton>
            </ToggleButtonGroup>
          }
          right={(
            <Typography variant="body2" color="text.secondary">
              {detailMessage('subtitle')}
            </Typography>
          )}
        />
      }
    >
      <Stack spacing={2.5}>
        <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.25 }}>
          <Stack spacing={1.5}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1.5}
              justifyContent="space-between"
              sx={{ alignItems: { md: 'center' } }}
            >
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                  {resolveCustomerDisplayName(customerFormData, languageCode) ||
                    customerFormData.code ||
                    detailMessage('titleNew')}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {customerFormData.code || '-'}
                </Typography>
              </Box>
              {!isNew && currentTab !== 'pricing' && (
                <Button
                  variant="outlined"
                  endIcon={<OpenInNewRoundedIcon fontSize="small" />}
                  onClick={openPricingTabFromBasic}
                >
                  {detailMessage('viewPricing')}
                </Button>
              )}
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} useFlexGap flexWrap="wrap">
              {summaryItems.map((item) => (
                <Box
                  key={item.label}
                  sx={{
                    minWidth: 148,
                    px: 1.5,
                    py: 1.25,
                    borderRadius: 1.5,
                    bgcolor: 'rgba(15, 23, 42, 0.03)',
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    {item.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>
                    {item.value}
                  </Typography>
                </Box>
              ))}
            </Stack>
          </Stack>
        </Paper>

        {loadedTabs.basic && (
          <Box sx={{ display: currentTab === 'basic' ? 'block' : 'none' }}>
            <Paper variant="outlined" sx={{ borderRadius: 2, p: 3 }}>
              <Stack spacing={1.8}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    required
                    label={detailMessage('customerCode')}
                    name="code"
                    value={customerFormData.code}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                  <TextField
                    fullWidth
                    required
                    label={detailMessage('customerName')}
                    name="name"
                    value={customerFormData.name}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                </Stack>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label="고객명 (한국어)"
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
                    label={detailMessage('infoCountry')}
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
                    label={detailMessage('infoSavedAt')}
                    value={formatCustomerDate(customerFormData.registeredAt, languageCode)}
                    disabled
                  />
                </Stack>
                <TextField
                  fullWidth
                  label={getUiMessage('customerBoard.address', 'Address', languageCode)}
                  name="address"
                  value={customerFormData.address}
                  onChange={handleBasicFieldChange}
                  disabled={savingCustomer}
                />
                <TextField
                  fullWidth
                  label={detailMessage('infoManager')}
                  name="manager"
                  value={customerFormData.manager}
                  onChange={handleBasicFieldChange}
                  disabled={savingCustomer}
                />
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                  <TextField
                    fullWidth
                    label={detailMessage('countryCode')}
                    name="countryCode"
                    value={customerFormData.countryCode}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                  <TextField
                    fullWidth
                    label={detailMessage('phoneNumber')}
                    name="phoneNumber"
                    value={customerFormData.phoneNumber}
                    onChange={handleBasicFieldChange}
                    disabled={savingCustomer}
                  />
                </Stack>
                <TextField
                  fullWidth
                  label={detailMessage('infoEmail')}
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
                  {detailMessage('pricingDisabledTitle')}
                </Typography>
                <Typography variant="body2">{detailMessage('pricingDisabledBody')}</Typography>
              </Alert>
            ) : (
              <Stack spacing={2}>
                <Alert severity="info">{detailMessage('prototypeNotice')}</Alert>

                <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.25 }}>
                  <Stack spacing={2}>
                    <Stack
                      direction={{ xs: 'column', lg: 'row' }}
                      spacing={2}
                      justifyContent="space-between"
                      sx={{ alignItems: { lg: 'center' } }}
                    >
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
                        <Typography variant="body2" color="text.secondary">
                          {detailMessage('defaultTradeType')}
                        </Typography>
                        <ToggleButtonGroup
                          size="small"
                          value={pricingDraft.defaultTradeType}
                          exclusive
                          onChange={(_event, nextTradeType) => {
                            if (!nextTradeType) return;
                            handlePricingMetaChange('defaultTradeType', nextTradeType);
                          }}
                        >
                          {TRADE_TYPES.map((tradeType) => (
                            <ToggleButton key={tradeType} value={tradeType}>
                              {tradeType}
                            </ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      </Stack>
                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
                        <Box sx={{ minWidth: { md: 260 } }}>
                          <SearchInput
                            placeholder={detailMessage('styleSearch')}
                            value={styleSearchTerm}
                            onChange={(event) => setStyleSearchTerm(event.target.value)}
                          />
                        </Box>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={showIncompleteOnly}
                              onChange={(event) => setShowIncompleteOnly(event.target.checked)}
                            />
                          }
                          label={detailMessage('incompleteOnly')}
                        />
                        <FormControlLabel
                          control={
                            <Switch
                              checked={showExceptionsOnly}
                              onChange={(event) => setShowExceptionsOnly(event.target.checked)}
                            />
                          }
                          label={detailMessage('exceptionsOnly')}
                        />
                        <FormControlLabel
                          control={
                            <Switch
                              checked={showAlternatePrices}
                              onChange={(event) => setShowAlternatePrices(event.target.checked)}
                            />
                          }
                          label={detailMessage('showAltPrices')}
                        />
                      </Stack>
                    </Stack>

                    <TextField
                      multiline
                      minRows={2}
                      label={detailMessage('pricingMemo')}
                      placeholder={detailMessage('pricingMemoPlaceholder')}
                      value={pricingDraft.memo}
                      onChange={(event) => handlePricingMetaChange('memo', event.target.value)}
                    />

                    <Typography variant="body2" color="text.secondary">
                      {detailMessage('compareModeHelper')}
                    </Typography>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25} useFlexGap flexWrap="wrap">
                      <Chip label={`${detailMessage('stylesCount')} ${pricingStats.total}`} />
                      <Chip color="info" variant="outlined" label={`${detailMessage('startedCount')} ${pricingStats.started}`} />
                      <Chip color="success" variant="outlined" label={`${detailMessage('completeCount')} ${pricingStats.complete}`} />
                      <Chip color="warning" variant="outlined" label={`${detailMessage('exceptionCount')} ${pricingStats.exceptions}`} />
                    </Stack>
                  </Stack>
                </Paper>

                <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                  <TableContainer sx={{ maxHeight: 'calc(100vh - 360px)' }}>
                    <Table stickyHeader size="small" sx={{ minWidth: 1600 }}>
                      <TableHead>
                        <TableRow>
                          <TableCell
                            sx={{
                              left: 0,
                              position: 'sticky',
                              zIndex: 3,
                              minWidth: 132,
                              backgroundColor: 'background.paper',
                            }}
                          >
                            {detailMessage('styleCode')}
                          </TableCell>
                          <TableCell
                            sx={{
                              left: 132,
                              position: 'sticky',
                              zIndex: 3,
                              minWidth: 220,
                              backgroundColor: 'background.paper',
                            }}
                          >
                            {detailMessage('styleName')}
                          </TableCell>
                          <TableCell sx={{ minWidth: 136 }}>{detailMessage('pricingRule')}</TableCell>
                          {PRICE_BUCKETS.map((bucketQuantity) => (
                            <TableCell key={`bucket:${bucketQuantity}`} align="center" sx={{ minWidth: 108 }}>
                              {formatNumberWithCommas(bucketQuantity)}
                            </TableCell>
                          ))}
                          <TableCell align="center" sx={{ minWidth: 120 }}>
                            {detailMessage('actions')}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {loadingStyles && (
                          <TableRow>
                            <TableCell colSpan={PRICE_BUCKETS.length + 4} sx={{ py: 3, textAlign: 'center' }}>
                              {detailMessage('loadingStyles')}
                            </TableCell>
                          </TableRow>
                        )}
                        {!loadingStyles && filteredStyles.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={PRICE_BUCKETS.length + 4} sx={{ py: 3, textAlign: 'center' }}>
                              {detailMessage('emptyStyles')}
                            </TableCell>
                          </TableRow>
                        )}
                        {filteredStyles.map((style) => {
                          const row = normalizePricingRow(pricingDraft.rows[style.id]);
                          const primaryTradeType = resolvePrimaryTradeType(row, pricingDraft.defaultTradeType);
                          const alternateTradeType = resolveAlternateTradeType(primaryTradeType);
                          const isExpanded =
                            showAlternatePrices ||
                            expandedStyleIds[style.id] === true ||
                            row.mode === 'BOTH';
                          const isComplete = hasCompletePriceForTradeType(row, primaryTradeType);
                          const isStarted = hasAnyPriceForTradeType(row, primaryTradeType);
                          const ruleLabelMap = {
                            DEFAULT: detailMessage('ruleDefault'),
                            CMPT: detailMessage('ruleCmpt'),
                            FOB: detailMessage('ruleFob'),
                            BOTH: detailMessage('ruleBoth'),
                          };

                          return (
                            <React.Fragment key={style.id}>
                              <TableRow
                                hover
                                sx={{
                                  '& > .sticky-cell': {
                                    backgroundColor: row.mode !== 'DEFAULT' ? 'rgba(254, 243, 199, 0.55)' : 'background.paper',
                                  },
                                }}
                              >
                                <TableCell
                                  className="sticky-cell"
                                  sx={{
                                    left: 0,
                                    position: 'sticky',
                                    zIndex: 2,
                                    backgroundColor: 'background.paper',
                                    fontVariantNumeric: 'tabular-nums',
                                  }}
                                >
                                  {style.styleCode || style.id || '-'}
                                </TableCell>
                                <TableCell
                                  className="sticky-cell"
                                  sx={{
                                    left: 132,
                                    position: 'sticky',
                                    zIndex: 2,
                                    backgroundColor: 'background.paper',
                                  }}
                                >
                                  <Stack spacing={0.5}>
                                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                      {style.name || '-'}
                                    </Typography>
                                    <Stack direction="row" spacing={0.75}>
                                      <Chip
                                        size="small"
                                        variant={row.mode === 'DEFAULT' ? 'outlined' : 'filled'}
                                        color={row.mode === 'DEFAULT' ? 'default' : 'warning'}
                                        label={row.mode === 'DEFAULT'
                                          ? detailMessage('basicRuleSuffix', { type: primaryTradeType })
                                          : ruleLabelMap[row.mode]}
                                      />
                                      {isStarted ? (
                                        <Chip size="small" color={isComplete ? 'success' : 'info'} label={isComplete ? detailMessage('completeCount') : detailMessage('startedCount')} />
                                      ) : null}
                                    </Stack>
                                  </Stack>
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    select
                                    size="small"
                                    value={row.mode}
                                    onChange={(event) =>
                                      handlePricingModeChange(style.id, event.target.value)
                                    }
                                    sx={{ minWidth: 112 }}
                                  >
                                    <MenuItem value="DEFAULT">{detailMessage('ruleDefault')}</MenuItem>
                                    <MenuItem value="CMPT">{detailMessage('ruleCmpt')}</MenuItem>
                                    <MenuItem value="FOB">{detailMessage('ruleFob')}</MenuItem>
                                    <MenuItem value="BOTH">{detailMessage('ruleBoth')}</MenuItem>
                                  </TextField>
                                </TableCell>
                                {PRICE_BUCKETS.map((bucketQuantity) => {
                                  const value = row.prices?.[primaryTradeType]?.[bucketQuantity] ?? '';
                                  return (
                                    <TableCell key={`${style.id}:${primaryTradeType}:${bucketQuantity}`} align="center">
                                      <TextField
                                        value={value}
                                        onChange={(event) =>
                                          handlePriceChange(
                                            style.id,
                                            primaryTradeType,
                                            bucketQuantity,
                                            event.target.value
                                          )
                                        }
                                        size="small"
                                        placeholder="-"
                                        inputProps={{
                                          inputMode: 'decimal',
                                          style: {
                                            width: 84,
                                            textAlign: 'right',
                                            fontSize: 13,
                                            fontVariantNumeric: 'tabular-nums',
                                          },
                                        }}
                                        sx={{
                                          '& .MuiOutlinedInput-root': {
                                            backgroundColor: value
                                              ? 'rgba(15, 23, 42, 0.03)'
                                              : 'rgba(248, 250, 252, 0.95)',
                                          },
                                        }}
                                      />
                                    </TableCell>
                                  );
                                })}
                                <TableCell align="center">
                                  <Stack direction="row" justifyContent="center" spacing={0.5}>
                                    <Tooltip title={detailMessage('manageStyle')}>
                                      <IconButton size="small" onClick={() => handleOpenStyle(style)}>
                                        <OpenInNewRoundedIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title={isExpanded ? detailMessage('draftClose') : detailMessage('draftOpen')}>
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
                                <TableRow sx={{ backgroundColor: 'rgba(248, 250, 252, 0.85)' }}>
                                  <TableCell className="sticky-cell" sx={{ left: 0, position: 'sticky', zIndex: 1, backgroundColor: 'rgba(248, 250, 252, 0.98)' }}>
                                    {alternateTradeType}
                                  </TableCell>
                                  <TableCell className="sticky-cell" sx={{ left: 132, position: 'sticky', zIndex: 1, backgroundColor: 'rgba(248, 250, 252, 0.98)' }}>
                                    <Stack spacing={0.25}>
                                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                        {detailMessage('alternatePrice')}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {style.name || '-'}
                                      </Typography>
                                    </Stack>
                                  </TableCell>
                                  <TableCell>
                                    <Chip size="small" variant="outlined" label={alternateTradeType} />
                                  </TableCell>
                                  {PRICE_BUCKETS.map((bucketQuantity) => {
                                    const value = row.prices?.[alternateTradeType]?.[bucketQuantity] ?? '';
                                    return (
                                      <TableCell key={`${style.id}:${alternateTradeType}:${bucketQuantity}`} align="center">
                                        <TextField
                                          value={value}
                                          onChange={(event) =>
                                            handlePriceChange(
                                              style.id,
                                              alternateTradeType,
                                              bucketQuantity,
                                              event.target.value
                                            )
                                          }
                                          size="small"
                                          placeholder="-"
                                          inputProps={{
                                            inputMode: 'decimal',
                                            style: {
                                              width: 84,
                                              textAlign: 'right',
                                              fontSize: 13,
                                              fontVariantNumeric: 'tabular-nums',
                                            },
                                          }}
                                        />
                                      </TableCell>
                                    );
                                  })}
                                  <TableCell align="center">
                                    <Typography variant="caption" color="text.secondary">
                                      {formatPriceDisplay(
                                        PRICE_BUCKETS
                                          .map((bucketQuantity) => row.prices?.[alternateTradeType]?.[bucketQuantity])
                                          .find((value) => String(value || '').trim() !== '')
                                      ) || '-'}
                                    </Typography>
                                  </TableCell>
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
