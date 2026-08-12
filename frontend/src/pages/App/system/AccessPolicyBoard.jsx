import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
  fetchRoleAccessPolicy,
  getDefaultRoleAccessPolicy,
  loadLegacyRoleAccessPolicy,
  ORG_ROLE_KEYS,
  ORG_TYPE_KEYS,
  ROLE_ACCESS_POLICY_SCHEMA_VERSION,
  saveRoleAccessPolicy,
  sanitizeRoleAccessPolicy,
} from '../../../utils/roleAccessPolicy';

const MENU_BLUEPRINT_EVENT = 'baro:menu-blueprint-updated';
const MENU_BLUEPRINT_GLOBAL_KEY = '__BARO_MENU_BLUEPRINT__';
const ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY = '__schemaVersion';
const EDITABLE_ROLE_ORDER = [
  ORG_ROLE_KEYS.ADMIN,
  ORG_ROLE_KEYS.OPERATOR,
  ORG_ROLE_KEYS.ACCOUNTANT,
  ORG_ROLE_KEYS.WORKER,
];
const EDITABLE_ORG_TYPE = ORG_TYPE_KEYS.MANUFACTURER;
const NON_EDITABLE_FEATURE_KEYS = new Set([
  'SUBSCRIPTION',
  'SYSTEM_SETTING',
  'SYSTEM_ONBOARDING',
  'PROFILE',
  'ATTRIBUTE',
]);

const ACCESS_POLICY_TEXT = {
  pageTitle: {
    ko: '접근 권한',
    en: 'Access Policy',
    vi: 'Chính sách truy cap',
  },
  saved: {
    ko: '접근 권한을 저장했습니다.',
    en: 'Access policy saved.',
    vi: 'Đã lưu chinh sach truy cap.',
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
    ko: '현재 SaaS 사용자 메뉴의 그룹, 순서, 비활성 상태를 그대로 반영합니다. 메뉴 구성이 바뀌면 이 트리도 자동으로 갱신됩니다.',
    en: 'This tree mirrors the current SaaS user menu groups, order, and disabled state. It updates automatically when the menu changes.',
    vi: 'Cay nay phan anh nhom, thu tu va trang thai vo hieu hoa cua menu nguoi dung SaaS hien tai. Cay se tu dong cap nhat khi menu thay doi.',
  },
  targetScope: {
    ko: '적용 대상: 제조사 조직 역할',
    en: 'Target scope: Manufacturer organization roles',
    vi: 'Pham vi ap dung: vai tro to chuc nha san xuat',
  },
  menuTree: {
    ko: '메뉴 구성',
    en: 'Menu structure',
    vi: 'Cau truc menu',
  },
  globallyDisabled: {
    ko: '메뉴 비활성',
    en: 'Menu disabled',
    vi: 'Menu bi vo hieu hoa',
  },
  alwaysAvailable: {
    ko: '기본 제공',
    en: 'Always available',
    vi: 'Luon kha dung',
  },
  noMenu: {
    ko: '아직 메뉴 구성을 불러오지 못했습니다.',
    en: 'Menu blueprint not available yet.',
    vi: 'Chua the tai cau hinh menu.',
  },
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

const buildMenuTree = (nodes = [], parentId = 'root') =>
  (Array.isArray(nodes) ? nodes : [])
    .map((node, index) => {
      const nodeLabel = String(node?.label || '').trim();
      const path = String(node?.path || '').trim();
      const nodeId = `${parentId}:${node?.menuGroupKey || path || index}`;

      if (Array.isArray(node?.children) && node.children.length > 0) {
        const children = buildMenuTree(node.children, nodeId);
        if (children.length === 0) return null;
        return {
          id: nodeId,
          type: 'group',
          label: nodeLabel || '-',
          icon: node?.icon || null,
          children,
          featureKeys: Array.from(
            new Set(children.flatMap((child) => child.featureKeys || []))
          ),
        };
      }

      if (!path) return null;
      const featureKey = resolveFeatureByPath(path);
      if (NON_EDITABLE_FEATURE_KEYS.has(featureKey)) return null;
      if (!featureKey) return null;
      return {
        id: nodeId,
        type: 'menu',
        label: nodeLabel || path,
        icon: node?.icon || null,
        path,
        featureKey,
        featureKeys: featureKey ? [featureKey] : [],
        fixedAccess: !featureKey,
        disabled: Boolean(node?.disabled),
      };
    })
    .filter(Boolean);

const flattenMenuTree = (nodes = [], depth = 0) =>
  (Array.isArray(nodes) ? nodes : []).flatMap((node) => [
    {
      ...node,
      depth,
    },
    ...(node.type === 'group' ? flattenMenuTree(node.children, depth + 1) : []),
  ]);

const cloneMenuIcon = (icon) => {
  if (!React.isValidElement(icon)) return null;
  return React.cloneElement(icon, {
    sx: {
      ...(icon.props?.sx || {}),
      color: 'text.secondary',
      fontSize: 20,
    },
  });
};

const toEditablePolicy = (policy) => {
  const defaults = getDefaultRoleAccessPolicy();
  const source =
    policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : defaults;
  const sourceSchemaVersion = Number(source?.[ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY]);
  return {
    [ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY]:
      Number.isFinite(sourceSchemaVersion) && sourceSchemaVersion > 0
        ? sourceSchemaVersion
        : ROLE_ACCESS_POLICY_SCHEMA_VERSION,
    ...defaults,
    [EDITABLE_ORG_TYPE]: {
      ...defaults[EDITABLE_ORG_TYPE],
      ...(source[EDITABLE_ORG_TYPE] || {}),
    },
  };
};

const serializeComparablePolicy = (policy) => {
  const sanitized = sanitizeRoleAccessPolicy(policy);
  const comparable = {};
  Object.keys(sanitized)
    .sort()
    .forEach((orgType) => {
      comparable[orgType] = {};
      Object.keys(sanitized[orgType] || {})
        .sort()
        .forEach((role) => {
          comparable[orgType][role] = [
            ...(sanitized[orgType]?.[role] || []),
          ].sort();
        });
    });
  return JSON.stringify(comparable);
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
  const [savedPolicy, setSavedPolicy] = React.useState(() =>
    toEditablePolicy(getDefaultRoleAccessPolicy())
  );
  const [draftPolicy, setDraftPolicy] = React.useState(() =>
    toEditablePolicy(getDefaultRoleAccessPolicy())
  );
  const [loadingPolicy, setLoadingPolicy] = React.useState(true);
  const [savingPolicy, setSavingPolicy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    const loadPolicy = async () => {
      setLoadingPolicy(true);
      try {
        const response = await fetchRoleAccessPolicy();
        let nextPolicy = response.policy;
        const legacyPolicy = !response.stored ? loadLegacyRoleAccessPolicy() : null;
        if (legacyPolicy) {
          nextPolicy = await saveRoleAccessPolicy(legacyPolicy);
        }
        if (cancelled) return;
        const editable = toEditablePolicy(nextPolicy);
        setSavedPolicy(editable);
        setDraftPolicy(editable);
      } catch (error) {
        if (cancelled) return;
        showNotification(error?.message || 'Failed to load access policy.', 'error');
      } finally {
        if (!cancelled) setLoadingPolicy(false);
      }
    };

    loadPolicy();
    return () => {
      cancelled = true;
    };
  }, [showNotification]);

  React.useEffect(() => {
    const handleBlueprintUpdate = (event) => {
      const eventItems = event?.detail?.items;
      setMenuBlueprint(Array.isArray(eventItems) ? eventItems : readMenuBlueprint());
    };
    handleBlueprintUpdate();
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(MENU_BLUEPRINT_EVENT, handleBlueprintUpdate);
    return () => window.removeEventListener(MENU_BLUEPRINT_EVENT, handleBlueprintUpdate);
  }, []);

  const rows = React.useMemo(
    () => flattenMenuTree(buildMenuTree(menuBlueprint)),
    [menuBlueprint]
  );

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

  const countGroupFeatures = React.useCallback(
    (role, featureKeys) =>
      (Array.isArray(featureKeys) ? featureKeys : []).filter((featureKey) =>
        hasFeature(role, featureKey)
      ).length,
    [hasFeature]
  );

  const isDirty = React.useMemo(
    () =>
      serializeComparablePolicy(draftPolicy) !==
      serializeComparablePolicy(savedPolicy),
    [draftPolicy, savedPolicy]
  );

  const handleSave = React.useCallback(async () => {
    if (!isDirty || savingPolicy) return;
    setSavingPolicy(true);
    try {
      const saved = await saveRoleAccessPolicy(draftPolicy);
      const editable = toEditablePolicy(saved);
      setSavedPolicy(editable);
      setDraftPolicy(editable);
      showNotification(
        getUiMessage(
          'accessPolicy.saved',
          resolveLocalizedText(ACCESS_POLICY_TEXT.saved, languageCode),
          languageCode
        ),
        'success'
      );
    } catch (error) {
      showNotification(error?.message || 'Failed to save access policy.', 'error');
    } finally {
      setSavingPolicy(false);
    }
  }, [draftPolicy, isDirty, languageCode, savingPolicy, showNotification]);

  const handleReset = React.useCallback(() => {
    setDraftPolicy(toEditablePolicy(getDefaultRoleAccessPolicy()));
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
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={loadingPolicy || savingPolicy}
            >
              {getUiMessage('accessPolicy.resetButton', 'Reset', languageCode)}
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={!isDirty || loadingPolicy || savingPolicy}
            >
              {getUiMessage('accessPolicy.save', 'Save', languageCode)}
            </Button>
          </Stack>
        </Box>

        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <TableContainer sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 360 }}>
                    {getUiMessage(
                      'accessPolicy.menuTree',
                      resolveLocalizedText(ACCESS_POLICY_TEXT.menuTree, languageCode),
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
                    <TableCell colSpan={1 + EDITABLE_ROLE_ORDER.length}>
                      {getUiMessage(
                        'accessPolicy.noMenu',
                        resolveLocalizedText(ACCESS_POLICY_TEXT.noMenu, languageCode),
                        languageCode
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) =>
                    row.type === 'group' ? (
                      <TableRow
                        key={row.id}
                        sx={{
                          bgcolor: 'action.hover',
                          '& td': {
                            borderBottomColor: 'divider',
                          },
                        }}
                      >
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ pl: row.depth * 2 }}
                          >
                            {cloneMenuIcon(row.icon)}
                            <Typography variant="subtitle2" fontWeight={700}>
                              {row.label}
                            </Typography>
                          </Stack>
                        </TableCell>
                        {EDITABLE_ROLE_ORDER.map((role) => (
                          <TableCell key={`${row.id}:${role}`} align="center">
                            <Typography variant="caption" color="text.secondary">
                              {countGroupFeatures(role, row.featureKeys)}/
                              {row.featureKeys.length}
                            </Typography>
                          </TableCell>
                        ))}
                      </TableRow>
                    ) : (
                      <TableRow key={row.id} hover>
                        <TableCell>
                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ pl: row.depth * 2 }}
                          >
                            {cloneMenuIcon(row.icon)}
                            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography
                                  variant="body2"
                                  color={row.disabled ? 'text.disabled' : 'text.primary'}
                                >
                                  {row.label}
                                </Typography>
                                {row.disabled && (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    label={getUiMessage(
                                      'accessPolicy.globallyDisabled',
                                      resolveLocalizedText(
                                        ACCESS_POLICY_TEXT.globallyDisabled,
                                        languageCode
                                      ),
                                      languageCode
                                    )}
                                    sx={{ height: 22 }}
                                  />
                                )}
                                {row.fixedAccess && (
                                  <Chip
                                    size="small"
                                    variant="outlined"
                                    color="primary"
                                    label={getUiMessage(
                                      'accessPolicy.alwaysAvailable',
                                      resolveLocalizedText(
                                        ACCESS_POLICY_TEXT.alwaysAvailable,
                                        languageCode
                                      ),
                                      languageCode
                                    )}
                                    sx={{ height: 22 }}
                                  />
                                )}
                              </Stack>
                              <Typography variant="caption" color="text.secondary">
                                {row.path}
                              </Typography>
                            </Stack>
                          </Stack>
                        </TableCell>
                        {EDITABLE_ROLE_ORDER.map((role) => (
                          <TableCell key={`${row.featureKey}:${role}`} align="center">
                            <Switch
                              size="small"
                              checked={
                                row.fixedAccess || hasFeature(role, row.featureKey)
                              }
                              disabled={
                                loadingPolicy ||
                                savingPolicy ||
                                row.disabled ||
                                row.fixedAccess
                              }
                              onChange={(event) =>
                                setFeature(role, row.featureKey, event.target.checked)
                              }
                              inputProps={{
                                'aria-label': `${row.label} ${resolveLocalizedText(
                                  ORG_ROLE_DEFAULT_LABELS[role],
                                  languageCode
                                )}`,
                              }}
                            />
                          </TableCell>
                        ))}
                      </TableRow>
                    )
                  )
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
