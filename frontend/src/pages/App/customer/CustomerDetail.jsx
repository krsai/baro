import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Stack } from '@mui/material';
import { useLocation, useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import SaveButton from '../../../components/SaveButton';
import { getStaticOptionOptions } from '../../../constants/staticOptionRegistry';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { buildQueryString, requestJSON } from '../../../utils/apiClient';
import { resolveCustomerDisplayName } from '../../../utils/appLanguage';
import {
  buildCustomerFormData,
  buildCustomerPayload,
  createEmptyCustomerFormData,
  normalizeCountry,
  resolveDefaultCountryCode,
} from './customerFormShared';
import CustomerBasicInfoPanel from './CustomerBasicInfoPanel';

const TEXT = {
  ko: {
    newTab: '고객 추가',
    detailTab: '고객: {name}',
    titleNew: '고객 추가',
    titleDetail: '고객 상세',
    saveCustomer: '저장',
    saveCustomerSuccess: '고객 정보를 저장했습니다.',
    saveError: '고객 정보를 저장하지 못했습니다.',
    customerLoadError: '고객 정보를 불러오지 못했습니다.',
    codeRequired: '고객 코드를 입력해주세요.',
    nameRequired: '고객명을 입력해주세요.',
    customerCode: '고객 코드',
    country: '국가',
    registeredAt: '등록일',
    address: '주소',
    manager: '담당자',
    countryCode: '국가번호',
    phoneNumber: '전화번호',
    email: '이메일',
  },
  en: {
    newTab: 'Add Customer',
    detailTab: 'Customer: {name}',
    titleNew: 'Add Customer',
    titleDetail: 'Customer Detail',
    saveCustomer: 'Save',
    saveCustomerSuccess: 'Customer information has been saved.',
    saveError: 'Failed to save customer information.',
    customerLoadError: 'Failed to load customer information.',
    codeRequired: 'Enter a customer code.',
    nameRequired: 'Enter a customer name.',
    customerCode: 'Customer Code',
    country: 'Country',
    registeredAt: 'Registered',
    address: 'Address',
    manager: 'Manager',
    countryCode: 'Country Code',
    phoneNumber: 'Phone Number',
    email: 'Email',
  },
  vi: {
    newTab: 'Them khach hang',
    detailTab: 'Khach hang: {name}',
    titleNew: 'Them khach hang',
    titleDetail: 'Chi tiet khach hang',
    saveCustomer: 'Luu',
    saveCustomerSuccess: 'Da luu thong tin khach hang.',
    saveError: 'Khong the luu thong tin khach hang.',
    customerLoadError: 'Khong the tai thong tin khach hang.',
    codeRequired: 'Hay nhap ma khach hang.',
    nameRequired: 'Hay nhap ten khach hang.',
    customerCode: 'Ma khach hang',
    country: 'Quoc gia',
    registeredAt: 'Ngay dang ky',
    address: 'Dia chi',
    manager: 'Nguoi phu trach',
    countryCode: 'Ma quoc gia',
    phoneNumber: 'So dien thoai',
    email: 'Email',
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

const CustomerDetail = () => {
  const { customerId: customerIdParam } = useParams();
  const location = useLocation();
  const { activeOrgId } = useAuth();
  const { languageCode } = useLanguage();
  const { showNotification, navigateToPath } = useAppActions();

  const t = useMemo(() => createMessageGetter(languageCode), [languageCode]);
  const customerId = String(customerIdParam || '').trim();
  const isNew = customerId === 'new';
  const customerQuery = useMemo(() => buildQueryString({ orgId: activeOrgId }), [activeOrgId]);

  const [customerFormData, setCustomerFormData] = useState(createEmptyCustomerFormData);
  const [originalCustomerData, setOriginalCustomerData] = useState(createEmptyCustomerFormData);
  const [loadingCustomer, setLoadingCustomer] = useState(!isNew);
  const [savingCustomer, setSavingCustomer] = useState(false);

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

  useEffect(() => {
    navigateToPath(`${location.pathname}${location.search}`, { label: detailTabLabel });
  }, [detailTabLabel, location.pathname, location.search, navigateToPath]);

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
        if (!matched) throw new Error(t('customerLoadError'));

        const nextData = buildCustomerFormData(matched);
        if (!active) return;
        setCustomerFormData(nextData);
        setOriginalCustomerData(nextData);
      } catch (error) {
        if (!active) return;
        showNotification(error?.message || t('customerLoadError'), 'error');
      } finally {
        if (active) setLoadingCustomer(false);
      }
    };

    loadCustomer();
    return () => {
      active = false;
    };
  }, [customerId, customerQuery, isNew, showNotification, t]);

  const customerDirty = useMemo(
    () => JSON.stringify(customerFormData) !== JSON.stringify(originalCustomerData),
    [customerFormData, originalCustomerData]
  );
  useUnsavedChanges(customerDirty);

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

  return (
    <AppPageContainer
      title={isNew ? t('titleNew') : t('titleDetail')}
      titleActions={
        <SaveButton
          onClick={handleCustomerSave}
          disabled={loadingCustomer || savingCustomer || !customerDirty}
          loading={savingCustomer}
        >
          {t('saveCustomer')}
        </SaveButton>
      }
    >
      <Stack spacing={2.5}>
        <CustomerBasicInfoPanel
          customerFormData={customerFormData}
          countryOptions={countryOptions}
          savingCustomer={savingCustomer}
          languageCode={languageCode}
          onBasicFieldChange={handleBasicFieldChange}
          onCountryChange={handleCountryChange}
          t={t}
        />
      </Stack>
    </AppPageContainer>
  );
};

export default CustomerDetail;
