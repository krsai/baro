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

const ROLE_LABELS = {
  [ORG_ROLE_KEYS.ADMIN]: 'Admin',
  [ORG_ROLE_KEYS.OPERATOR]: 'Operator',
  [ORG_ROLE_KEYS.ACCOUNTANT]: 'Accountant',
  [ORG_ROLE_KEYS.WORKER]: 'Worker',
};

const FEATURE_LABELS = {
  ORDER: 'Order',
  STYLE: 'Style',
  ST_REVIEW: 'ST Review',
  SHIPMENT_REVIEW: 'Quantity Settlement',
  ASSIGNMENT: 'Assignment',
  PRODUCTION_PLAN: 'Production Plan',
  PRODUCTION_RESULT: 'Production Result',
  INVENTORY: 'Inventory',
  ATTENDANCE: 'Attendance',
  WORK_HISTORY: 'Work History',
  PAYROLL: 'Payroll',
  BUSINESS: 'Business',
  LINE: 'Line',
  EMPLOYEE: 'Employee',
  CUSTOMER: 'Customer',
  ATTRIBUTE: 'Attribute',
  PERMISSION: 'Permission',
  HOLIDAY: 'Holiday',
  SUBSCRIPTION: 'Subscription',
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
      getUiMessage('accessPolicy.saved', 'Access policy saved.', languageCode),
      'success'
    );
  }, [draftPolicy, languageCode, showNotification]);

  const handleReset = React.useCallback(() => {
    const defaults = resetRoleAccessPolicy();
    setDraftPolicy(toEditablePolicy(defaults));
    showNotification(
      getUiMessage('accessPolicy.reset', 'Access policy reset to default.', languageCode),
      'info'
    );
  }, [languageCode, showNotification]);

  if (!isSystemAdmin) {
    return (
      <AppPageContainer
        title={getUiMessage('menu.accessPolicy', 'Access Policy', languageCode)}
      >
        <Alert severity="error">
          {getUiMessage(
            'accessPolicy.systemAdminOnly',
            'Only system admins can edit access policy.',
            languageCode
          )}
        </Alert>
      </AppPageContainer>
    );
  }

  return (
    <AppPageContainer title={getUiMessage('menu.accessPolicy', 'Access Policy', languageCode)}>
      <Stack spacing={2}>
        <Alert severity="info">
          {getUiMessage(
            'accessPolicy.autoLinked',
            'This table is linked to current menu order automatically.',
            languageCode
          )}
        </Alert>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {getUiMessage(
              'accessPolicy.targetScope',
              'Target scope: Manufacturer organization roles',
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
                    {getUiMessage('accessPolicy.group', 'Group', languageCode)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 180 }}>
                    {getUiMessage('accessPolicy.menu', 'Menu', languageCode)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 130 }}>
                    {getUiMessage('accessPolicy.feature', 'Feature', languageCode)}
                  </TableCell>
                  {EDITABLE_ROLE_ORDER.map((role) => (
                    <TableCell key={role} align="center" sx={{ minWidth: 120 }}>
                      {ROLE_LABELS[role] || role}
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
                        'Menu blueprint not available yet.',
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
                      <TableCell>{FEATURE_LABELS[row.featureKey] || row.featureKey}</TableCell>
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
