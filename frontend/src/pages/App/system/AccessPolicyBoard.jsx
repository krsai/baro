import React from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { ORG_ROLE_DEFAULT_LABELS } from '../../../constants/organizationAccess';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { getUiMessage } from '../../../constants/uiMessages';
import { resolveFeatureByPath } from '../../../utils/accessControl';
import {
  getDefaultRoleAccessPolicy,
  loadRoleAccessPolicy,
  ORG_ROLE_KEYS,
  ORG_TYPE_KEYS,
  saveRoleAccessPolicy,
  resetRoleAccessPolicy,
} from '../../../utils/roleAccessPolicy';

const MENU_BLUEPRINT_EVENT = 'baro:menu-blueprint-updated';
const MENU_BLUEPRINT_GLOBAL_KEY = '__BARO_MENU_BLUEPRINT__';
const EDITABLE_ROLE_ORDER = [
  ORG_ROLE_KEYS.ADMIN,
  ORG_ROLE_KEYS.OPERATOR,
  ORG_ROLE_KEYS.ACCOUNTANT,
  ORG_ROLE_KEYS.WORKER,
];
const EDITABLE_ORG_TYPE = ORG_TYPE_KEYS.MANUFACTURER;
const NON_EDITABLE_FEATURE_KEYS = new Set([
  'SYSTEM_SETTING',
  'SYSTEM_ONBOARDING',
  'PROFILE',
]);

const ACCESS_POLICY_TEXT = {
  pageTitle: {
    ko: '접근 권한',
    en: 'Access Policy',
    vi: 'Chinh sach truy cap',
  },
  saved: {
    ko: '접근 권한을 저장했습니다.',
    en: 'Access policy saved.',
    vi: 'Da luu chinh sach truy cap.',
  },
  reset: {
    ko: '접근 권한을 기본값으로 되돌렸습니다.',
    en: 'Access policy reset to default.',
    vi: 'Da dat lai chinh sach truy cap ve mac dinh.',
  },
  systemAdminOnly: {
    ko: '시스템 관리자만 접근 권한을 수정할 수 있습니다.',
    en: 'Only system admins can edit access policy.',
    vi: 'Chi quan tri he thong moi co the sua chinh sach truy cap.',
  },
  autoLinked: {
    ko: '이 표는 현재 메뉴 순서와 자동으로 연결됩니다.',
    en: 'This table is linked to current menu order automatically.',
    vi: 'Bang nay tu dong lien ket voi thu tu menu hien tai.',
  },
  targetScope: {
    ko: '적용 대상: 제조사 조직 역할',
    en: 'Target scope: Manufacturer organization roles',
    vi: 'Pham vi ap dung: vai tro to chuc nha san xuat',
  },
  group: {
    ko: '그룹',
    en: 'Group',
    vi: 'Nhom',
  },
  menu: {
    ko: '메뉴',
    en: 'Menu',
    vi: 'Menu',
  },
  feature: {
    ko: '기능',
    en: 'Feature',
    vi: 'Tinh nang',
  },
  noMenu: {
    ko: '아직 메뉴 구성을 불러오지 못했습니다.',
    en: 'Menu blueprint not available yet.',
    vi: 'Chua the tai cau hinh menu.',
  },
};

const FEATURE_LABELS = {
  ORDER: { ko: '주문', en: 'Order', vi: 'Don hang' },
  STYLE: { ko: '스타일', en: 'Style', vi: 'Style' },
  ST_REVIEW: { ko: '표준 공임 검토', en: 'ST Review', vi: 'Xem xet cong chuan' },
  SHIPMENT_REVIEW: { ko: '수량 정산', en: 'Quantity Settlement', vi: 'Doi chieu so luong' },
  ASSIGNMENT: { ko: '배정', en: 'Assignment', vi: 'Phan cong' },
  PRODUCTION_PLAN: { ko: '생산 계획', en: 'Production Plan', vi: 'Ke hoach san xuat' },
  PRODUCTION_RESULT: { ko: '생산 결과', en: 'Production Result', vi: 'Ket qua san xuat' },
  INVENTORY: { ko: '재고', en: 'Inventory', vi: 'Ton kho' },
  ATTENDANCE: { ko: '출퇴근', en: 'Attendance', vi: 'Cham cong' },
  WORK_HISTORY: { ko: '작업 기록', en: 'Work History', vi: 'Lich su cong viec' },
  PAYROLL: { ko: '급여 계산', en: 'Payroll', vi: 'Tinh luong' },
  BUSINESS: { ko: '사업체', en: 'Business', vi: 'Doanh nghiep' },
  LINE: { ko: '라인', en: 'Line', vi: 'Chuyen may' },
  EMPLOYEE: { ko: '직원', en: 'Employee', vi: 'Nhan vien' },
  CUSTOMER: { ko: '고객', en: 'Customer', vi: 'Khach hang' },
  ATTRIBUTE: { ko: '속성', en: 'Attribute', vi: 'Thuoc tinh' },
  PERMISSION: { ko: '권한', en: 'Permission', vi: 'Quyen han' },
  HOLIDAY: { ko: '휴일', en: 'Holiday', vi: 'Ngay nghi' },
  SUBSCRIPTION: { ko: '구독', en: 'Subscription', vi: 'Goi dich vu' },
};

const resolveLocalizedText = (localizedText, languageCode) => {
  if (!localizedText || typeof localizedText !== 'object') return '';
  const normalizedLanguageCode = String(languageCode || 'ko').trim().toLowerCase();
  return (
    localizedText[normalizedLanguageCode] ||
    localizedText.en ||
    localizedText.ko ||
    localizedText.vi ||
    ''
  );
};

const readMenuBlueprint = () => {
  if (typeof window === 'undefined') return [];
  const rows = window[MENU_BLUEPRINT_GLOBAL_KEY];
  return Array.isArray(rows) ? rows : [];
};

const extractMenuRows = (menuBlueprint = []) => {
  const orderedRows = [];

  (Array.isArray(menuBlueprint) ? menuBlueprint : []).forEach((group) => {
    if (!group?.isParent || !Array.isArray(group?.children)) return;
    const groupLabel = String(group?.label || '').trim() || '-';
    group.children.forEach((child) => {
      const path = String(child?.path || '').trim();
      if (!path) return;
      const featureKey = resolveFeatureByPath(path);
      if (!featureKey || NON_EDITABLE_FEATURE_KEYS.has(featureKey)) return;
      orderedRows.push({
        groupLabel,
        menuLabel: String(child?.label || '').trim() || path,
        path,
        featureKey,
      });
    });
  });

  return orderedRows;
};

const toEditablePolicy = (policy) => {
  const defaults = getDefaultRoleAccessPolicy();
  const source =
    policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : defaults;
  return {
    ...defaults,
    [EDITABLE_ORG_TYPE]: {
      ...defaults[EDITABLE_ORG_TYPE],
      ...(source[EDITABLE_ORG_TYPE] || {}),
    },
  };
};

const AccessPolicyBoard = () => {
  const { activeProfile } = useAuth();
  const { showNotification } = useAppActions();
  const { languageCode } = useLanguage();
  const pageTitle = React.useMemo(
    () =>
      getUiMessage(
        'menu.accessPolicy',
        resolveLocalizedText(ACCESS_POLICY_TEXT.pageTitle, languageCode),
        languageCode
      ),
    [languageCode]
  );
  const isSystemAdmin =
    activeProfile?.entryType === 'SYSTEM' && activeProfile?.systemRole === 'SYSTEM_ADMIN';

  const [menuBlueprint, setMenuBlueprint] = React.useState(() => readMenuBlueprint());
  const [draftPolicy, setDraftPolicy] = React.useState(() =>
    toEditablePolicy(loadRoleAccessPolicy())
  );

  React.useEffect(() => {
    const syncFromStorage = () => setDraftPolicy(toEditablePolicy(loadRoleAccessPolicy()));
    syncFromStorage();
  }, []);

  React.useEffect(() => {
    const handleBlueprintUpdate = () => {
      setMenuBlueprint(readMenuBlueprint());
    };
    handleBlueprintUpdate();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(MENU_BLUEPRINT_EVENT, handleBlueprintUpdate);
    return () => window.removeEventListener(MENU_BLUEPRINT_EVENT, handleBlueprintUpdate);
  }, []);

  const rows = React.useMemo(() => extractMenuRows(menuBlueprint), [menuBlueprint]);

  const hasFeature = React.useCallback(
    (role, featureKey) => {
      const features = Array.isArray(draftPolicy?.[EDITABLE_ORG_TYPE]?.[role])
        ? draftPolicy[EDITABLE_ORG_TYPE][role]
        : [];
      return features.includes(featureKey);
    },
    [draftPolicy]
  );

  const setFeature = React.useCallback((role, featureKey, checked) => {
    setDraftPolicy((prev) => {
      const next = toEditablePolicy(prev);
      const currentFeatures = Array.isArray(next?.[EDITABLE_ORG_TYPE]?.[role])
        ? next[EDITABLE_ORG_TYPE][role]
        : [];
      const featureSet = new Set(currentFeatures);
      if (checked) {
        featureSet.add(featureKey);
      } else {
        featureSet.delete(featureKey);
      }
      next[EDITABLE_ORG_TYPE][role] = Array.from(featureSet.values());
      return next;
    });
  }, []);

  const handleSave = React.useCallback(() => {
    const saved = saveRoleAccessPolicy(draftPolicy);
    setDraftPolicy(toEditablePolicy(saved));
    showNotification(
      getUiMessage(
        'accessPolicy.saved',
        resolveLocalizedText(ACCESS_POLICY_TEXT.saved, languageCode),
        languageCode
      ),
      'success'
    );
  }, [draftPolicy, languageCode, showNotification]);

  const handleReset = React.useCallback(() => {
    const defaults = resetRoleAccessPolicy();
    setDraftPolicy(toEditablePolicy(defaults));
    showNotification(
      getUiMessage(
        'accessPolicy.reset',
        resolveLocalizedText(ACCESS_POLICY_TEXT.reset, languageCode),
        languageCode
      ),
      'info'
    );
  }, [languageCode, showNotification]);

  if (!isSystemAdmin) {
    return (
      <AppPageContainer title={pageTitle}>
        <Alert severity="error">
          {getUiMessage(
            'accessPolicy.systemAdminOnly',
            resolveLocalizedText(ACCESS_POLICY_TEXT.systemAdminOnly, languageCode),
            languageCode
          )}
        </Alert>
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer title={pageTitle}>
      <Stack spacing={2}>
        <Alert severity="info">
          {getUiMessage(
            'accessPolicy.autoLinked',
            resolveLocalizedText(ACCESS_POLICY_TEXT.autoLinked, languageCode),
            languageCode
          )}
        </Alert>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {getUiMessage(
              'accessPolicy.targetScope',
              resolveLocalizedText(ACCESS_POLICY_TEXT.targetScope, languageCode),
              languageCode
            )}
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={handleReset}>
              {getUiMessage('common.reset', 'Reset', languageCode)}
            </Button>
            <Button variant="contained" onClick={handleSave}>
              {getUiMessage('common.save', 'Save', languageCode)}
            </Button>
          </Stack>
        </Box>

        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 150 }}>
                    {getUiMessage(
                      'accessPolicy.group',
                      resolveLocalizedText(ACCESS_POLICY_TEXT.group, languageCode),
                      languageCode
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    {getUiMessage(
                      'accessPolicy.menu',
                      resolveLocalizedText(ACCESS_POLICY_TEXT.menu, languageCode),
                      languageCode
                    )}
                  </TableCell>
                  <TableCell sx={{ minWidth: 130 }}>
                    {getUiMessage(
                      'accessPolicy.feature',
                      resolveLocalizedText(ACCESS_POLICY_TEXT.feature, languageCode),
                      languageCode
                    )}
                  </TableCell>
                  {EDITABLE_ROLE_ORDER.map((role) => (
                    <TableCell key={role} align="center" sx={{ minWidth: 120 }}>
                      {resolveLocalizedText(ORG_ROLE_DEFAULT_LABELS[role], languageCode) || role}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3 + EDITABLE_ROLE_ORDER.length}>
                      {getUiMessage(
                        'accessPolicy.noMenu',
                        resolveLocalizedText(ACCESS_POLICY_TEXT.noMenu, languageCode),
                        languageCode
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={`${row.path}:${row.featureKey}`} hover>
                      <TableCell>{row.groupLabel}</TableCell>
                      <TableCell>
                        <Stack spacing={0.25}>
                          <span>{row.menuLabel}</span>
                          <Typography variant="caption" color="text.secondary">
                            {row.path}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        {resolveLocalizedText(FEATURE_LABELS[row.featureKey], languageCode) ||
                          row.featureKey}
                      </TableCell>
                      {EDITABLE_ROLE_ORDER.map((role) => (
                        <TableCell key={`${row.featureKey}:${role}`} align="center">
                          <Switch
                            size="small"
                            checked={hasFeature(role, row.featureKey)}
                            onChange={(event) =>
                              setFeature(role, row.featureKey, event.target.checked)
                            }
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Stack>
    </AppPageContainer>
  );
};

export default AccessPolicyBoard;
