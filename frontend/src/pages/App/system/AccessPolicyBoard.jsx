import useIndustryMenuPolicy from '../../../hooks/useIndustryMenuPolicy';
import {INDUSTRY_SPECIFIC_FEATURES} from '../../../utils/industryMenuFeatures.mjs';
import {accessPolicyLayoutText} from '../../../constants/accessPolicyLayout';
import FactoryOutlined from '@mui/icons-material/FactoryOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import {subscriberMenuBlueprint} from '../../../utils/subscriberMenus.mjs';
import {subscriberAccessText} from '../../../constants/subscriberAccess';
import {organizeCompanyMenu} from '../../../utils/companyMenuLayout.mjs';
import PageContentStack from '../../../components/PageContentStack';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
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
  Tabs,
  Tab,
} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import { ORG_ROLE_DEFAULT_LABELS } from '../../../constants/organizationAccess';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useMenuBlueprint } from '../../../context/MenuBlueprintContext';
import { getUiMessage } from '../../../constants/uiMessages';
import { resolveFeatureByPath } from '../../../utils/accessControl';
import {
  fetchRoleAccessPolicy,
  getDefaultRoleAccessPolicy,
  ORG_ROLE_KEYS,
  ORG_TYPE_KEYS,
  ROLE_ACCESS_POLICY_SCHEMA_VERSION,
  saveRoleAccessPolicy,
  sanitizeRoleAccessPolicy,
} from '../../../utils/roleAccessPolicy';

const ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY = '__schemaVersion';
const EDITABLE_ROLE_ORDER = [
  ORG_ROLE_KEYS.ADMIN,
  ORG_ROLE_KEYS.OPERATOR,
  ORG_ROLE_KEYS.ACCOUNTANT,
  ORG_ROLE_KEYS.WORKER,
];

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

const buildMenuTree = (nodes = [], parentId = 'root', orgType = 'SERVICE') =>
  (Array.isArray(nodes) ? nodes : [])
    .map((node, index) => {
      const nodeLabel = String(node?.label || '').trim();
      const path = String(node?.path || '').trim();
      const nodeId = `${parentId}:${node?.menuGroupKey || path || index}`;

      const childNodes=node?.children;
      if (Array.isArray(childNodes) && childNodes.length > 0) {
        const children = buildMenuTree(childNodes, nodeId, orgType);
        if (children.length === 0) return null;
        return {
          id: nodeId,
          type: 'group',
          label: nodeLabel || '-',
          icon: node?.icon || null,
          children,
          permissionGroups: children.flatMap(child => child.type === 'group' ? child.permissionGroups : child.featureKeys.length ? [child.featureKeys] : []),
          featureKeys: Array.from(
            new Set(children.flatMap((child) => child.featureKeys || []))
          ),
        };
      }

      if (!path) return null;
      const featureKey = resolveFeatureByPath(path,orgType);
      if (NON_EDITABLE_FEATURE_KEYS.has(featureKey) && featureKey !== 'PROFILE') return null;
      const permissionOptions = (node.accessChildren || []).map(child => ({label:child.label,path:child.path,featureKey:resolveFeatureByPath(child.path,orgType)})).filter(child=>child.featureKey && !NON_EDITABLE_FEATURE_KEYS.has(child.featureKey));
      const featureKeys = permissionOptions.length ? [...new Set(permissionOptions.map(child=>child.featureKey))] : featureKey && !NON_EDITABLE_FEATURE_KEYS.has(featureKey) ? [featureKey] : [];
      if (!featureKey && !permissionOptions.length) return null;
      return {
        id: nodeId,
        type: 'menu',
        label: nodeLabel || path,
        icon: node?.icon || null,
        path,
        featureKey,
        featureKeys,
        permissionOptions,
        fixedAccess: featureKeys.length === 0,
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
    ...Object.fromEntries(Object.values(ORG_TYPE_KEYS).map(type=>[type,{...defaults[type],...(source[type]||{})}])),
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

const RolePolicyBoard = ({orgType}) => {
  const [scope,setScope]=React.useState('common');
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

  const menus=useIndustryMenuPolicy(isSystemAdmin);
  const layout=accessPolicyLayoutText[languageCode]||accessPolicyLayoutText.en;
  const menuText=subscriberAccessText[languageCode]||subscriberAccessText.en;
  const [roleError,setRoleError]=React.useState(false);
  const menuBlueprint = useMenuBlueprint();
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
      setRoleError(false);
      try {
        const response = await fetchRoleAccessPolicy();
        const nextPolicy = response.policy;
        if (cancelled) return;
        const editable = toEditablePolicy(nextPolicy);
        setSavedPolicy(editable);
        setDraftPolicy(editable);
      } catch (error) {
        if (cancelled) return;
        setRoleError(true);
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

  const rows = React.useMemo(()=>{
    const include=feature=>scope==='industry'?INDUSTRY_SPECIFIC_FEATURES.includes(feature):!INDUSTRY_SPECIFIC_FEATURES.includes(feature);
    const filter=nodes=>nodes.flatMap(node=>{
      if(node.type==='group'){const children=filter(node.children);if(!children.length)return [];const permissionGroups=children.flatMap(child=>child.type==='group'?child.permissionGroups:child.featureKeys.length?[child.featureKeys]:[]);return [{...node,children,permissionGroups,featureKeys:[...new Set(children.flatMap(child=>child.featureKeys))]}];}
      const featureKeys=node.featureKeys.filter(include);return featureKeys.length||node.fixedAccess&&scope==='common'?[{...node,featureKeys}]:[];
    });
    return flattenMenuTree(filter(buildMenuTree(subscriberMenuBlueprint(organizeCompanyMenu(menuBlueprint,key=>getUiMessage(key,key,languageCode),orgType),orgType),'root',orgType)));
  },[menuBlueprint,orgType,languageCode,scope]);

  const hasFeature = React.useCallback(
    (role, featureKey) => {
      const features = Array.isArray(draftPolicy?.[orgType]?.[role])
        ? draftPolicy[orgType][role]
        : [];
      return features.includes(featureKey);
    },
    [draftPolicy,orgType]
  );

  const setFeature = React.useCallback((role, featureKeys, checked) => {
    setDraftPolicy((prev) => {
      const next = toEditablePolicy(prev);
      const currentFeatures = Array.isArray(next?.[orgType]?.[role])
        ? next[orgType][role]
        : [];
      const featureSet = new Set(currentFeatures);
      if (checked) {
        featureKeys.forEach(key => featureSet.add(key));
      } else {
        featureKeys.forEach(key => featureSet.delete(key));
      }
      next[orgType][role] = Array.from(featureSet.values());
      return next;
    });
  }, [orgType]);

  const countGroupFeatures = React.useCallback(
    (role, permissionGroups) =>
      (permissionGroups || []).filter(keys => keys.some(key => hasFeature(role, key))).length,
    [hasFeature]
  );

  const isDirty = React.useMemo(
    () =>
      serializeComparablePolicy(draftPolicy) !==
      serializeComparablePolicy(savedPolicy),
    [draftPolicy, savedPolicy]
  );
  useUnsavedChanges(isDirty||menus.dirty);

  const handleSave = async()=>{
    if((!isDirty&&!menus.dirty)||savingPolicy||roleError)return;
    setSavingPolicy(true);
    try{
      const results=await Promise.allSettled([
        isDirty?saveRoleAccessPolicy(draftPolicy).then(saved=>{const editable=toEditablePolicy(saved);setSavedPolicy(editable);setDraftPolicy(editable);}):Promise.resolve(),
        menus.dirty?menus.save():Promise.resolve(),
      ]);
      showNotification(results.some(result=>result.status==='rejected')?layout.partial:layout.saved,results.some(result=>result.status==='rejected')?'error':'success');
    }finally{setSavingPolicy(false);}
  };

  const handleReset = React.useCallback(() => {
    setDraftPolicy(previous=>({...previous,[orgType]:getDefaultRoleAccessPolicy()[orgType]}));
    showNotification(
      getUiMessage(
        'accessPolicy.reset',
        resolveLocalizedText(ACCESS_POLICY_TEXT.reset, languageCode),
        languageCode
      ),
      'info'
    );
  }, [languageCode, showNotification,orgType]);

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
    <Box>
      <PageContentStack>
        <Paper variant="outlined" sx={{p:.5,borderRadius:2,bgcolor:'background.default'}}>
          <Tabs value={scope} onChange={(_,value)=>setScope(value)} variant="fullWidth" sx={{'& .MuiTab-root':{minHeight:44},'& .Mui-selected':{bgcolor:'background.paper',borderRadius:1.5}}}>
            <Tab value="common" label={layout.common}/><Tab value="industry" label={layout.industry}/>
          </Tabs>
        </Paper>
        {menus.error&&<Alert severity="error" action={<Button color="inherit" onClick={menus.reload} disabled={savingPolicy}>{layout.reload}</Button>}>{menuText[menus.error]}</Alert>}
        {roleError&&<Alert severity="error">{menuText.failed}</Alert>}
        {scope==='industry'&&menus.loaded&&!menus.loaded.subscribers?.[orgType]&&Object.keys(menus.loaded.industries||{}).length>0&&<Alert severity="info">{menuText.legacy}</Alert>}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">
            {scope==='common'?layout.commonNote:layout.industryNote}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            {(isDirty||menus.dirty)&&<Chip size="small" color="warning" variant="outlined" label={layout.pending}/>}
            <Button
              variant="outlined"
              onClick={handleReset}
              disabled={loadingPolicy || savingPolicy}
            >
              {layout.resetRoles}
            </Button>
            <Button
              variant="contained"
              onClick={handleSave}
              disabled={(!isDirty&&!menus.dirty) || loadingPolicy || savingPolicy || menus.loading || roleError || (!menus.loaded&&!!menus.error)}
            >
              {layout.save}
            </Button>
          </Stack>
        </Box>

        <Paper variant="outlined" sx={{ overflow: 'hidden',borderRadius:2,'& th:first-of-type, & td:first-of-type':{position:'sticky',left:0,zIndex:1,bgcolor:'background.paper'},'& thead th:first-of-type':{zIndex:4} }}>
          <TableContainer sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: {xs:200,md:280} }}>
                    {getUiMessage(
                      'accessPolicy.menuTree',
                      resolveLocalizedText(ACCESS_POLICY_TEXT.menuTree, languageCode),
                      languageCode
                    )}
                  </TableCell>
                  <TableCell align="center" sx={{minWidth:120}}>{scope==='industry'?layout.provided:layout.commonProvided}</TableCell>
                  {EDITABLE_ROLE_ORDER.map((role) => (
                    <TableCell key={role} align="center" sx={{ minWidth: 104 }}>
                      {resolveLocalizedText(ORG_ROLE_DEFAULT_LABELS[role], languageCode) || role}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2 + EDITABLE_ROLE_ORDER.length}>
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
                        <TableCell/>
                        {EDITABLE_ROLE_ORDER.map((role) => (
                          <TableCell key={`${row.id}:${role}`} align="center">
                            <Typography variant="caption" color="text.secondary">
                              {countGroupFeatures(role, row.permissionGroups)}/
                              {row.permissionGroups.length}
                            </Typography>
                          </TableCell>
                        ))}
                      </TableRow>
                    ) : (
                      <TableRow key={row.id} data-menu-path={row.path} hover>
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
                            </Stack>
                          </Stack>
                        </TableCell>
                        <TableCell align="center">{scope==='common'?<Chip size="small" label={layout.commonProvided} variant="outlined" sx={{borderColor:'divider',color:'text.secondary'}}/>:<Switch size="small" checked={row.featureKeys.every(feature=>menus.features(orgType).includes(feature))} disabled={!menus.loaded||menus.loading||savingPolicy||row.disabled} onChange={(_,checked)=>row.featureKeys.forEach(feature=>menus.toggle(orgType,feature,checked))} slotProps={{input:{role:'switch','aria-label':row.label+' '+layout.provided}}}/>}</TableCell>
                        {EDITABLE_ROLE_ORDER.map((role) => (
                          <TableCell key={`${row.featureKey}:${role}`} align="center">
                            <Switch size="small" checked={row.fixedAccess || row.featureKeys.some(key => hasFeature(role, key))}
                              disabled={loadingPolicy || savingPolicy || roleError || row.disabled || row.fixedAccess || (scope==='industry'&&(!menus.loaded||!row.featureKeys.every(feature=>menus.features(orgType).includes(feature))))}
                              onChange={event=>setFeature(role,row.featureKeys,event.target.checked)}
                              slotProps={{input:{role:'switch','aria-label':row.label+' '+resolveLocalizedText(ORG_ROLE_DEFAULT_LABELS[role],languageCode)}}} />
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
      </PageContentStack>
    </Box>
  );
};

function AccessPolicyBoard(){
 const {languageCode}=useLanguage(),{activeProfile}=useAuth(),t=subscriberAccessText[languageCode]||subscriberAccessText.en;
 const layout=accessPolicyLayoutText[languageCode]||accessPolicyLayoutText.en;
 const [orgType,setOrgType]=React.useState('MANUFACTURER');
 if(activeProfile?.entryType!=='SYSTEM'||activeProfile?.systemRole!=='SYSTEM_ADMIN')return <RolePolicyBoard orgType={orgType}/>;
 return <AppPageContainer title={getUiMessage('menu.accessPolicy','Access policy',languageCode)}><Stack spacing={2}>
  <Typography variant="body2" color="text.secondary">{layout.intro}</Typography>
  <Tabs value={orgType} onChange={(_event,value)=>setOrgType(value)} variant="fullWidth" sx={{minHeight:88,'& .MuiTabs-indicator':{display:'none'},'& .MuiTab-root':{border:1,borderColor:'divider',borderRadius:2,mr:1,alignItems:'flex-start',textAlign:'left',textTransform:'none',minHeight:84},'& .Mui-selected':{borderColor:'primary.main',bgcolor:'#EAF2FF'}}}>
    {[['MANUFACTURER',t.factory,layout.factoryNote,<FactoryOutlined/>],['SERVICE',t.logistics,layout.logisticsNote,<LocalShippingOutlined/>]].map(([type,label,note,icon])=><Tab key={type} value={type} aria-label={label} icon={icon} iconPosition="start" label={<Stack spacing={.5}><Typography variant="subtitle2">{label}</Typography><Typography variant="caption" color="text.secondary">{note}</Typography></Stack>}/>)}
  </Tabs>
  <RolePolicyBoard orgType={orgType}/>
 </Stack></AppPageContainer>;
}
export default AccessPolicyBoard;
