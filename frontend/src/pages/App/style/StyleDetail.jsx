import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { useLocation, useParams } from 'react-router-dom';
import AppPageContainer from '../../../components/AppPageContainer';
import LastUpdaterLabel from '../../../components/LastUpdaterLabel';
import PageToolbar from '../../../components/PageToolbar';
import SaveButton from '../../../components/SaveButton';
import StyleInfo from './styleDetail/StyleInfo';
import StyleBom from './styleDetail/StyleBom';
import StyleProcess from './styleDetail/StyleProcess';
import StyleTimeMatrix from './styleDetail/StyleTimeMatrix';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import { useAppActions } from '../../../context/AppContext';
import { useAuth } from '../../../context/AuthContext';
import { useLanguage } from '../../../context/LanguageContext';
import { RequestScopeBoundary } from '../../../context/RequestScopeContext';
import { buildQueryString } from '../../../utils/apiClient';
import {
  createStyle as createStyleOnApi,
  fetchStyleById,
  updateStyle as updateStyleOnApi,
} from '../../../utils/styleApi';
import { todayDateKey } from '../../../utils/dateKey.mjs';
import { normalizeProcesses, ST_STANDARD_BUCKETS } from '../../../utils/processTime';

const STYLE_DETAIL_MESSAGES = {
  ko: {
    tabStyleAnalysis: '스타일 분석',
    tabBasicInfo: '기본 정보',
    tabProcessInfo: '공정 정보',
    tabTimeMatrix: '매입 단가',
    tabBom: 'BOM',
    save: '저장',
    loading: '스타일 정보를 불러오는 중입니다.',
    newTab: '스타일 추가',
    detailTab: '스타일: {name}',
    createSuccess: '새 스타일이 생성되었습니다.',
    updateSuccess: '스타일이 업데이트되었습니다.',
    saveError: '스타일을 저장하지 못했습니다.',
    nameRequired: '스타일명을 입력해주세요.',
    customerRequired: '고객사를 선택해주세요.',
  },
  en: {
    tabStyleAnalysis: 'Style Analysis',
    tabBasicInfo: 'Basic Info',
    tabProcessInfo: 'Process Info',
    tabTimeMatrix: 'Purchase Price',
    tabBom: 'BOM',
    save: 'Save',
    loading: 'Loading style details...',
    newTab: 'Add Style',
    detailTab: 'Style: {name}',
    createSuccess: 'A new style has been created.',
    updateSuccess: 'Style updated.',
    saveError: 'Failed to save the style.',
    nameRequired: 'Enter a style name.',
    customerRequired: 'Select a customer.',
  },
  vi: {
    tabStyleAnalysis: 'Phan tich style',
    tabBasicInfo: 'Thong tin co ban',
    tabProcessInfo: 'Thong tin cong doan',
    tabTimeMatrix: 'Don gia mua vao',
    tabBom: 'BOM',
    save: 'Luu',
    loading: 'Dang tai thong tin style...',
    newTab: 'Them style',
    detailTab: 'Style: {name}',
    createSuccess: 'Da tao style moi.',
    updateSuccess: 'Da cap nhat style.',
    saveError: 'Khong the luu style.',
    nameRequired: 'Hay nhap ten style.',
    customerRequired: 'Hay chon khach hang.',
  },
};

const getStyleDetailMessage = (languageCode, key, params = {}) => {
  const locale =
    languageCode === 'ko' || languageCode === 'vi' || languageCode === 'en'
      ? languageCode
      : 'en';
  const template =
    STYLE_DETAIL_MESSAGES[locale]?.[key] ??
    STYLE_DETAIL_MESSAGES.en[key] ??
    '';
  return Object.entries(params).reduce(
    (message, [token, value]) => message.replaceAll(`{${token}}`, String(value ?? '')),
    template
  );
};

const toOrgId = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const createEmptyStyle = () => ({
  id: '',
  ownerOrgId: null,
  customerOrgId: null,
  styleCode: '',
  name: '',
  customer: '',
  customerNameKo: '',
  customerNameVi: '',
  registrationDate: '',
  designer: '',
  collection: '',
  season: '',
  imageUrls: [],
  processes: [],
  bom: [],
  bomNotes: '',
  revenueMemo: '',
  timeBucketQuantities: [...ST_STANDARD_BUCKETS],
});

const createStyleId = () => `S-${Date.now().toString(36).slice(-6).toUpperCase()}`;

// stBuckets[].setAt/updatedAt are write-only bookkeeping timestamps that the
// frontend always nulls out on edit (the backend stamps the real value on save).
// They carry no visible meaning to the user, so they must be excluded from the
// dirty-check snapshot below - otherwise editing a PT/ST value and then typing it
// back to the originally saved number would never clear the save button, since
// the timestamp fields would still differ from the original snapshot even though
// every value the user can actually see matches again.
const buildDirtyCheckProcesses = (processes) =>
  (Array.isArray(processes) ? processes : []).map((process) => {
    if (!process || typeof process !== 'object') return process;
    const stBuckets = Array.isArray(process.stBuckets) ? process.stBuckets : [];
    return {
      ...process,
      stBuckets: stBuckets.map(({ setAt: _setAt, updatedAt: _updatedAt, ...rest }) => rest),
    };
  });

const buildDirtyCheckSnapshot = (data) =>
  JSON.stringify({ ...data, processes: buildDirtyCheckProcesses(data?.processes) });

const buildPayload = (data) => {
  const today = todayDateKey();
  const trimmedName = (data.name || '').trim();
  const trimmedCode = (data.styleCode || '').trim();
  const fallbackCode = trimmedName || (data.id || '').trim();
  return {
    ...createEmptyStyle(),
    ...data,
    id: data.id,
    ownerOrgId: toOrgId(data.ownerOrgId ?? data.customerOrgId),
    customerOrgId: toOrgId(data.customerOrgId ?? data.ownerOrgId),
    name: trimmedName,
    customer: (data.customer || '').trim(),
    styleCode: trimmedCode || fallbackCode,
    registrationDate: data.registrationDate || today,
  };
};

const StyleDetail = () => {
  const { styleId: styleIdParam } = useParams();
  const location = useLocation();
  const { activeOrgId, activeOrgType, activeProfile } = useAuth();
  const { languageCode } = useLanguage();
  const { showNotification, navigateToPath } = useAppActions();

  const ownerOrgIdFromQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return toOrgId(params.get('ownerOrgId'));
  }, [location.search]);

  const isBrandOrg = activeOrgType === 'BRAND';
  const defaultBrandCustomerName = useMemo(
    () => (isBrandOrg ? String(activeProfile?.orgName || '').trim() : ''),
    [activeProfile?.orgName, isBrandOrg]
  );

  const canViewProcessInfo = !isBrandOrg;
  const styleId = styleIdParam ?? 'new';
  const isNew = styleId === 'new';

  const [currentTab, setCurrentTab] = useState('basicInfo');
  const [loadedTabs, setLoadedTabs] = useState({
    basicInfo: true,
    processInfo: false,
    timeMatrix: false,
    bom: false,
  });
  const [originalData, setOriginalData] = useState(createEmptyStyle);
  const [styleFormData, setStyleFormData] = useState(createEmptyStyle);
  const [loadingStyle, setLoadingStyle] = useState(true);
  const [processMasterReloadKey, setProcessMasterReloadKey] = useState(0);

  const resolvedOwnerOrgId = useMemo(
    () =>
      toOrgId(
        ownerOrgIdFromQuery ??
          styleFormData.ownerOrgId ??
          styleFormData.customerOrgId ??
          originalData.ownerOrgId ??
          originalData.customerOrgId
      ),
    [
      ownerOrgIdFromQuery,
      originalData.customerOrgId,
      originalData.ownerOrgId,
      styleFormData.customerOrgId,
      styleFormData.ownerOrgId,
    ]
  );

  const detailTabLabel = useMemo(
    () =>
      isNew
        ? getStyleDetailMessage(languageCode, 'newTab')
        : getStyleDetailMessage(languageCode, 'detailTab', {
            name: styleFormData.name || originalData.name || styleId,
          }),
    [isNew, languageCode, originalData.name, styleFormData.name, styleId]
  );

  const isStyleDetailRoute = useMemo(
    () => location.pathname.startsWith('/style/'),
    [location.pathname]
  );

  useEffect(() => {
    if (!isStyleDetailRoute) return;
    navigateToPath(`${location.pathname}${location.search}`, { label: detailTabLabel });
  }, [detailTabLabel, isStyleDetailRoute, location.pathname, location.search, navigateToPath]);

  useEffect(() => {
    let active = true;

    const loadStyle = async () => {
      if (isNew) {
        if (active) {
          const empty = createEmptyStyle();
          if (isBrandOrg) {
            empty.customer = defaultBrandCustomerName;
            empty.ownerOrgId = activeOrgId;
            empty.customerOrgId = activeOrgId;
          }
          setOriginalData(empty);
          setStyleFormData(empty);
          setLoadingStyle(false);
        }
        return;
      }

      setLoadingStyle(true);
      try {
        const style = await fetchStyleById(styleId, {
          orgId: activeOrgId,
          ownerOrgId: ownerOrgIdFromQuery,
        });
        const normalized = {
          ...createEmptyStyle(),
          ...style,
          id: style.id || styleId,
          ownerOrgId: toOrgId(style.ownerOrgId ?? style.customerOrgId),
          customerOrgId: toOrgId(style.customerOrgId ?? style.ownerOrgId),
          // Normalize processes the same way StyleProcess.jsx does before comparing
          // originalData vs styleFormData, otherwise the dirty-check would keep
          // reporting a change even after reverting a field back to its saved value.
          processes: normalizeProcesses(style.processes),
        };
        if (!active) return;
        setOriginalData(normalized);
        setStyleFormData(normalized);
      } catch (error) {
        if (!active) return;
        const fallback = {
          ...createEmptyStyle(),
          id: styleId,
          styleCode: styleId,
          ownerOrgId: ownerOrgIdFromQuery,
          customerOrgId: ownerOrgIdFromQuery,
          customer: isBrandOrg ? defaultBrandCustomerName : '',
        };
        setOriginalData(fallback);
        setStyleFormData(fallback);
        showNotification(error?.message || getStyleDetailMessage(languageCode, 'saveError'), 'error');
      } finally {
        if (active) {
          setLoadingStyle(false);
        }
      }
    };

    loadStyle();

    return () => {
      active = false;
    };
  }, [
    activeOrgId,
    defaultBrandCustomerName,
    isBrandOrg,
    isNew,
    languageCode,
    ownerOrgIdFromQuery,
    showNotification,
    styleId,
  ]);

  const originalSnapshot = useMemo(
    () => buildDirtyCheckSnapshot(originalData),
    [originalData]
  );
  const formSnapshot = useMemo(
    () => buildDirtyCheckSnapshot(styleFormData),
    [styleFormData]
  );
  const isDirty = !loadingStyle && originalSnapshot !== formSnapshot;
  useUnsavedChanges(isDirty);

  const handleChange = (_event, newValue) => {
    if (
      (newValue === 'processInfo' || newValue === 'timeMatrix') &&
      !canViewProcessInfo
    ) {
      return;
    }
    if (newValue !== null) {
      setCurrentTab(newValue);
      setLoadedTabs((prev) =>
        prev[newValue]
          ? prev
          : {
              ...prev,
              [newValue]: true,
            }
      );
    }
  };

  const handleStyleInputChange = (event) => {
    const { name, value } = event.target;
    setStyleFormData((prev) => {
      if (name !== 'customer') {
        return { ...prev, [name]: value };
      }
      const nextCustomer = String(value || '').trim();
      return {
        ...prev,
        customer: value,
        customerOrgId: nextCustomer ? prev.customerOrgId : null,
      };
    });
  };

  const handleProcessesChange = (newProcesses) => {
    setStyleFormData((prev) => ({ ...prev, processes: newProcesses }));
  };

  const handleSave = async () => {
    if (!styleFormData.name?.trim()) {
      showNotification(getStyleDetailMessage(languageCode, 'nameRequired'), 'error');
      return;
    }
    if (!isBrandOrg && !styleFormData.customer?.trim()) {
      showNotification(getStyleDetailMessage(languageCode, 'customerRequired'), 'error');
      return;
    }

    if (isNew) {
      const newId = styleFormData.id || createStyleId();
      const payload = buildPayload({
        ...styleFormData,
        id: newId,
        customer: isBrandOrg
          ? styleFormData.customer || defaultBrandCustomerName
          : styleFormData.customer,
        customerOrgId: styleFormData.customerOrgId || resolvedOwnerOrgId || null,
      });
      try {
        const saved = await createStyleOnApi(payload, { orgId: activeOrgId });
        showNotification(getStyleDetailMessage(languageCode, 'createSuccess'), 'success');
        const normalizedSaved = { ...saved, processes: normalizeProcesses(saved.processes) };
        setOriginalData(normalizedSaved);
        setStyleFormData(normalizedSaved);
        setProcessMasterReloadKey((prev) => prev + 1);
        const savedOwnerOrgId = toOrgId(saved?.ownerOrgId ?? saved?.customerOrgId);
        const savedQuery = buildQueryString({ ownerOrgId: savedOwnerOrgId });
        const savedStyleId = saved?.id || newId;
        navigateToPath(`/style/${savedStyleId}${savedQuery}`, {
          closeTabId: '/style/new',
          skipUnsavedChangesCheck: true,
        });
      } catch (error) {
        showNotification(error?.message || getStyleDetailMessage(languageCode, 'saveError'), 'error');
      }
      return;
    }
    const payload = buildPayload({
      ...styleFormData,
      id: originalData.id || styleId,
      customer: isBrandOrg
        ? styleFormData.customer || defaultBrandCustomerName
        : styleFormData.customer,
      customerOrgId: styleFormData.customerOrgId || resolvedOwnerOrgId || null,
    });

    try {
      const saved = await updateStyleOnApi(styleId, payload, {
        orgId: activeOrgId,
        ownerOrgId: resolvedOwnerOrgId,
      });
      showNotification(getStyleDetailMessage(languageCode, 'updateSuccess'), 'success');
      const normalizedSaved = { ...saved, processes: normalizeProcesses(saved.processes) };
      setOriginalData(normalizedSaved);
      setStyleFormData(normalizedSaved);
      setProcessMasterReloadKey((prev) => prev + 1);
    } catch (error) {
      showNotification(error?.message || getStyleDetailMessage(languageCode, 'saveError'), 'error');
    }
  };

  return (
    <AppPageContainer
      title={detailTabLabel}
      titleActions={(
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <LastUpdaterLabel />
          <SaveButton
            onClick={handleSave}
            disabled={loadingStyle || (!isNew && !isDirty)}
          />
        </Stack>
      )}
      toolbar={(
        <PageToolbar
          showLastUpdater={false}
          left={(
            <ToggleButtonGroup
              value={currentTab}
              exclusive
              onChange={handleChange}
              aria-label="style management toggle"
              sx={{ maxWidth: '100%', overflowX: 'auto' }}
            >
              <ToggleButton value="basicInfo">
                {getStyleDetailMessage(languageCode, 'tabBasicInfo')}
              </ToggleButton>
              {canViewProcessInfo ? (
                <ToggleButton value="processInfo">
                  {getStyleDetailMessage(languageCode, 'tabProcessInfo')}
                </ToggleButton>
              ) : null}
              {canViewProcessInfo ? (
                <ToggleButton value="timeMatrix">
                  {getStyleDetailMessage(languageCode, 'tabTimeMatrix')}
                </ToggleButton>
              ) : null}
              <ToggleButton value="bom">{getStyleDetailMessage(languageCode, 'tabBom')}</ToggleButton>
            </ToggleButtonGroup>
          )}
        />
      )}
    >
      {loadingStyle && !isNew ? (
        <Typography color="text.secondary">{getStyleDetailMessage(languageCode, 'loading')}</Typography>
      ) : (
        <>
          {loadedTabs.basicInfo && (
            <RequestScopeBoundary scopeId="basicInfo" active={currentTab === 'basicInfo'}>
              <Box sx={{ display: currentTab === 'basicInfo' ? 'block' : 'none' }}>
                <StyleInfo
                  isNew={isNew}
                  formData={styleFormData}
                  processes={styleFormData.processes}
                  showStyleAnalysis={canViewProcessInfo}
                  handleInputChange={handleStyleInputChange}
                  isBrandOrg={isBrandOrg}
                  defaultCustomerName={defaultBrandCustomerName}
                />
              </Box>
            </RequestScopeBoundary>
          )}

          {canViewProcessInfo && loadedTabs.processInfo && (
            <RequestScopeBoundary scopeId="processInfo" active={currentTab === 'processInfo'}>
              <Box sx={{ display: currentTab === 'processInfo' ? 'block' : 'none' }}>
                <StyleProcess
                  processes={styleFormData.processes}
                  onProcessesChange={handleProcessesChange}
                  optionsReloadKey={processMasterReloadKey}
                  bucketQuantities={styleFormData.timeBucketQuantities}
                />
              </Box>
            </RequestScopeBoundary>
          )}

          {canViewProcessInfo && loadedTabs.timeMatrix && (
            <RequestScopeBoundary scopeId="timeMatrix" active={currentTab === 'timeMatrix'}>
              <Box sx={{ display: currentTab === 'timeMatrix' ? 'block' : 'none' }}>
                <StyleTimeMatrix
                  processes={styleFormData.processes}
                  onProcessesChange={handleProcessesChange}
                  bucketQuantities={styleFormData.timeBucketQuantities}
                />
              </Box>
            </RequestScopeBoundary>
          )}

          {loadedTabs.bom && (
            <RequestScopeBoundary scopeId="bom" active={currentTab === 'bom'}>
              <Box sx={{ display: currentTab === 'bom' ? 'block' : 'none' }}>
                <StyleBom formData={styleFormData} handleInputChange={handleStyleInputChange} />
              </Box>
            </RequestScopeBoundary>
          )}

        </>
      )}
    </AppPageContainer>
  );
};

export default StyleDetail;

