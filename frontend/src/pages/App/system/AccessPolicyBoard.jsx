import useIndustryMenuPolicy from '../../../hooks/useIndustryMenuPolicy';
import {SERVICE_FEATURES} from '../../../utils/serviceCompany.mjs';
import {fetchRoleAccessPolicy,saveRoleAccessPolicy} from '../../../utils/roleAccessPolicy';
import {accessPolicyLayoutText,accessPolicyActionText} from '../../../constants/accessPolicyLayout';
import {subscriberMenuBlueprint} from '../../../utils/subscriberMenus.mjs';
import {subscriberAccessText} from '../../../constants/subscriberAccess';
import {organizeCompanyMenu} from '../../../utils/companyMenuLayout.mjs';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import React from 'react';
import {Button,Checkbox,Paper,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
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
    .flatMap(node => node?.mergedEntry ? node.accessChildren : [node])
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
 const [policy,setPolicy]=React.useState(null),[original,setOriginal]=React.useState(null),[roleError,setRoleError]=React.useState(false);
 const loadRoles=React.useCallback(async()=>{setRoleError(false);try{const value=toEditablePolicy((await fetchRoleAccessPolicy()).policy);setPolicy(value);setOriginal(value);}catch{setRoleError(true);}},[]);
 React.useEffect(()=>{if(allowed)loadRoles();},[allowed,loadRoles]);
 const rows=React.useMemo(()=>flattenMenuTree(mergeMenus(...TYPES.map(type=>buildMenuTree(organizeCompanyMenu(subscriberMenuBlueprint(blueprint,type),key=>getUiMessage(key,key,languageCode),type),'root',type)))),[blueprint,languageCode]);
 const roles=['ADMIN','OPERATOR','ACCOUNTANT','WORKER'];
 const labels={ko:['관리자','운영자','회계','직원'],en:['Administrator','Operator','Accountant','Worker'],vi:['Quản trị','Điều hành','Kế toán','Nhân viên']}[languageCode]||['Administrator','Operator','Accountant','Worker'];
 const roleDirty=!!policy&&JSON.stringify(policy)!==JSON.stringify(original),dirty=menus.dirty||roleDirty;
 useUnsavedChanges(dirty);
 const locked=menus.loading||saving||!menus.loaded||!policy||roleError;
 const actionText=accessPolicyActionText[languageCode]||accessPolicyActionText.en;
 const toggleRole=(type,features,role,checked)=>setPolicy(previous=>({...previous,[type]:{...previous[type],[role]:checked?[...new Set([...previous[type][role],...features])]:previous[type][role].filter(key=>!features.includes(key))}}));
 const save=async()=>{if(locked||!dirty)return;setSaving(true);try{if(menus.dirty)await menus.save();if(roleDirty){const saved=toEditablePolicy(await saveRoleAccessPolicy(policy));setPolicy(saved);setOriginal(saved);}showNotification(layout.saved,'success');}catch{showNotification(layout.partial,'error');}finally{setSaving(false);}};
 return <AppPageContainer title={getUiMessage('menu.accessPolicy','Access policy',languageCode)} titleActions={allowed?<Button variant="contained" disabled={locked||!dirty} onClick={save}>{layout.save}</Button>:null}>
 {!allowed?<Alert severity="error">{t.denied}</Alert>:<>
 {menus.error&&<Alert severity="error" action={<Button onClick={menus.reload} disabled={saving}>{layout.reload}</Button>}>{t[menus.error]}</Alert>}
 {roleError&&<Alert severity="error" action={<Button onClick={loadRoles} disabled={saving}>{layout.reload}</Button>}>{t.failed}</Alert>}
 <Paper variant="outlined" sx={{overflow:'hidden',borderRadius:2}}><TableContainer><Table size="small" stickyHeader sx={{minWidth:1100}}>
 <TableHead><TableRow><TableCell rowSpan={2}>{getUiMessage('accessPolicy.menuTree','Menu structure',languageCode)}</TableCell>{TYPES.map(type=><TableCell key={type} align="center" colSpan={5}>{type==='MANUFACTURER'?t.factory:t.logistics}</TableCell>)}</TableRow><TableRow>{TYPES.map(type=><React.Fragment key={type}><TableCell align="center">{layout.provided}</TableCell>{roles.map((role,index)=><TableCell key={role} align="center">{labels[index]}</TableCell>)}</React.Fragment>)}</TableRow></TableHead>
 <TableBody>{rows.map(row=>{
 if(row.type==='group')return <TableRow key={row.id} sx={{bgcolor:'action.hover'}}><TableCell colSpan={11}><Typography variant="subtitle2" fontWeight={700}>{row.label}</Typography></TableCell></TableRow>;
 return <TableRow key={row.path} data-menu-path={row.path}>
 <TableCell><Typography sx={{pl:row.depth*2}}>{row.label.replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').trim()}</Typography></TableCell>
 {TYPES.map(type=>{
 const features=row.featureKeys;
 const supported=features.every(feature=>type==='SERVICE'?SERVICE_FEATURES.includes(feature):feature!=='FREIGHT');
 const enabled=supported&&(row.fixedAccess||features.every(feature=>menus.features(type).includes(feature)));
 const unavailable=!enabled||row.disabled;
 const industryLabel=type==='MANUFACTURER'?t.factory:t.logistics;
 return <React.Fragment key={type}>
 <TableCell align="center" sx={{borderLeft:1,borderColor:'divider'}}><Checkbox size="small" checked={enabled} title={!supported?layout.unsupported:row.fixedAccess?actionText.always:undefined} disabled={locked||!supported||row.disabled||row.fixedAccess} onChange={(_,checked)=>features.forEach(feature=>menus.toggle(type,feature,checked))} slotProps={{input:{'aria-label':industryLabel+' '+row.label+' '+layout.provided}}}/></TableCell>
 {roles.map((role,index)=><TableCell key={role} align="center"><Checkbox size="small" checked={supported&&(row.fixedAccess||features.every(feature=>policy?.[type]?.[role]?.includes(feature)))} disabled={locked||unavailable||row.fixedAccess||(role==='WORKER'&&features.some(feature=>['FREIGHT','INVOICE','SHIPPING_REQUEST','ORDER_SHIPMENTS'].includes(feature)))} onChange={(_,checked)=>toggleRole(type,features,role,checked)} slotProps={{input:{'aria-label':industryLabel+' '+row.label+' '+labels[index]}}}/></TableCell>)}
 </React.Fragment>;
 })}
 </TableRow>;
 })}</TableBody></Table></TableContainer></Paper></>}
 </AppPageContainer>;
}
export default AccessPolicyBoard;
