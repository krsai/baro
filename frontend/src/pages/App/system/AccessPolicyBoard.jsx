import useIndustryMenuPolicy from '../../../hooks/useIndustryMenuPolicy';
import {INDUSTRY_SPECIFIC_FEATURES} from '../../../utils/industryMenuFeatures.mjs';
import {accessPolicyLayoutText} from '../../../constants/accessPolicyLayout';
import {subscriberMenuBlueprint} from '../../../utils/subscriberMenus.mjs';
import {subscriberAccessText} from '../../../constants/subscriberAccess';
import {organizeCompanyMenu} from '../../../utils/companyMenuLayout.mjs';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import React from 'react';
import {Button,Chip,Paper,Stack,Switch,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import Alert from "../../../components/AppNotice";
import AppPageContainer from '../../../components/AppPageContainer';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { useMenuBlueprint } from '../../../context/MenuBlueprintContext';
import { getUiMessage } from '../../../constants/uiMessages';
import { resolveFeatureByPath } from '../../../utils/accessControl';
import {
  getDefaultRoleAccessPolicy,
  ORG_TYPE_KEYS,
  ROLE_ACCESS_POLICY_SCHEMA_VERSION,
} from '../../../utils/roleAccessPolicyCore.mjs';

const ROLE_ACCESS_POLICY_SCHEMA_VERSION_KEY = '__schemaVersion';
const NON_EDITABLE_FEATURE_KEYS = new Set([
  'SUBSCRIPTION',
  'SYSTEM_SETTING',
  'SYSTEM_ONBOARDING',
  'PROFILE',
  'ATTRIBUTE',
]);

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

const TYPES=['MANUFACTURER','SERVICE'];
const mergeMenus=(left,right)=>{
 const result=[...left];
 for(const node of right){const index=result.findIndex(item=>(item.path||item.id)===(node.path||node.id));if(index<0)result.push(node);else if(node.type==='group')result[index]={...result[index],children:mergeMenus(result[index].children,node.children)};}
 return result;
};
function AccessPolicyBoard(){
 const {activeProfile}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions();
 const allowed=activeProfile?.entryType==='SYSTEM'&&activeProfile?.systemRole==='SYSTEM_ADMIN';
 const menus=useIndustryMenuPolicy(allowed),blueprint=useMenuBlueprint();
 const t=subscriberAccessText[languageCode]||subscriberAccessText.en,layout=accessPolicyLayoutText[languageCode]||accessPolicyLayoutText.en;
 const [saving,setSaving]=React.useState(false);
 const trees=React.useMemo(()=>Object.fromEntries(TYPES.map(type=>[type,buildMenuTree(subscriberMenuBlueprint(organizeCompanyMenu(blueprint,key=>getUiMessage(key,key,languageCode),type),type),'root',type)])),[blueprint,languageCode]);
 const byType=React.useMemo(()=>Object.fromEntries(TYPES.map(type=>[type,new Map(flattenMenuTree(trees[type]).filter(row=>row.path).map(row=>[row.path,row]))])),[trees]);
 const rows=React.useMemo(()=>flattenMenuTree(mergeMenus(trees.MANUFACTURER,trees.SERVICE)),[trees]);
 useUnsavedChanges(menus.dirty);
 const save=async()=>{if(!allowed||saving||!menus.dirty)return;setSaving(true);try{await menus.save();showNotification(t.saved,'success');}catch{}finally{setSaving(false);}};
 return <AppPageContainer title={getUiMessage('menu.accessPolicy','Access policy',languageCode)} titleActions={allowed?<Button variant="contained" disabled={!menus.dirty||menus.loading||saving||!menus.loaded} onClick={save}>{layout.save}</Button>:null}>
  {!allowed?<Alert severity="error">{t.denied}</Alert>:<>
   {menus.error&&<Alert severity="error" action={<Button onClick={menus.reload} disabled={saving}>{layout.reload}</Button>}>{t[menus.error]}</Alert>}
   <Paper variant="outlined" sx={{overflow:'hidden',borderRadius:2}}><TableContainer><Table size="small" stickyHeader>
    <TableHead><TableRow><TableCell>{getUiMessage('accessPolicy.menuTree','Menu structure',languageCode)}</TableCell><TableCell align="center">{t.factory}</TableCell><TableCell align="center">{t.logistics}</TableCell></TableRow></TableHead>
    <TableBody>{rows.map(row=>row.type==='group'?<TableRow key={row.id} sx={{bgcolor:'action.hover'}}><TableCell colSpan={3}><Stack direction="row" alignItems="center" spacing={1}>{cloneMenuIcon(row.icon)}<Typography variant="subtitle2" fontWeight={700}>{row.label}</Typography></Stack></TableCell></TableRow>:<TableRow key={row.path} data-menu-path={row.path} hover>
     <TableCell><Stack direction="row" spacing={1} alignItems="center" sx={{pl:row.depth*2}}>{cloneMenuIcon(row.icon)}<Typography>{row.label}</Typography></Stack></TableCell>
     {TYPES.map(type=>{const item=byType[type].get(row.path),features=item?.featureKeys.filter(feature=>INDUSTRY_SPECIFIC_FEATURES.includes(feature))||[];return <TableCell key={type} align="center">{!item?'\u2014':!features.length?<Chip size="small" variant="outlined" label={layout.commonProvided}/>:<Switch size="small" checked={features.every(feature=>menus.features(type).includes(feature))} disabled={menus.loading||saving||!menus.loaded||item.disabled} onChange={(_,checked)=>features.forEach(feature=>menus.toggle(type,feature,checked))} slotProps={{input:{role:'switch','aria-label':row.label+' '+(type==='MANUFACTURER'?t.factory:t.logistics)}}}/>}</TableCell>;})}
    </TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={3}>{getUiMessage('accessPolicy.noMenu','Menu blueprint not available',languageCode)}</TableCell></TableRow>}</TableBody>
   </Table></TableContainer></Paper>
  </>}
 </AppPageContainer>;
}
export default AccessPolicyBoard;
