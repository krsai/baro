import useIndustryMenuPolicy from '../../../hooks/useIndustryMenuPolicy';
import useNavigationOrder from '../../../hooks/useNavigationOrder';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {applyNavigationOrder,moveNavigationNode,navigationNodeId} from '../../../utils/navigationOrder.mjs';
import {SERVICE_FEATURES} from '../../../utils/serviceCompany.mjs';
import {ORG_ROLE_KEYS} from '../../../constants/organizationAccess';
import {getStaticOptionLabel} from '../../../constants/staticOptionRegistry';
import {fetchRoleAccessPolicy,saveRoleAccessPolicy} from '../../../utils/roleAccessPolicy';
import {accessPolicyLayoutText,accessPolicyActionText} from '../../../constants/accessPolicyLayout';
import {subscriberMenuBlueprint} from '../../../utils/subscriberMenus.mjs';
import {subscriberAccessText} from '../../../constants/subscriberAccess';
import {organizeCompanyMenu} from '../../../utils/companyMenuLayout.mjs';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import React from 'react';
import DragIndicator from '@mui/icons-material/DragIndicator';
import {DndContext,PointerSensor,useSensor,useSensors,useDraggable,useDroppable,closestCenter,DragOverlay} from '@dnd-kit/core';
import {IconButton,Button,Checkbox,Paper,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
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
          menuGroupKey: node.menuGroupKey,
          isParent: true,
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
function ReorderRow({row,parentId,locked,onMove,children,...props}){
 const {languageCode}=useLanguage();
 const label={ko:'순서 변경',en:'Reorder',vi:'Đổi Thứ Tự'}[languageCode]||'Reorder';
 const id=navigationNodeId(row),data={parentId,row};
 const drag=useDraggable({id,data,disabled:locked}),drop=useDroppable({id,data,disabled:locked});
 const handle=<IconButton {...drag.attributes} {...drag.listeners} data-menu-drag-handle={id} aria-label={`${row.label} ${label}`} title={label} disabled={locked} size="small" onKeyDown={event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();onMove(event.key==='ArrowUp'?-1:1);}}} sx={{mr:1,color:'text.disabled',touchAction:'none',cursor:locked?'default':'grab','&:active':{cursor:'grabbing'}}}><DragIndicator fontSize="small"/></IconButton>;
 return <TableRow {...props} ref={node=>{drag.setNodeRef(node);drop.setNodeRef(node);}} data-record-interaction="drag" sx={{...props.sx,opacity:drag.isDragging?.4:1,outline:drop.isOver?'2px solid var(--ui-color-primary, #2f75ed)':undefined,outlineOffset:-2}}>{children(handle)}</TableRow>;
}
function AccessPolicyBoard(){
 const {activeProfile}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions();
 const allowed=activeProfile?.entryType==='SYSTEM'&&activeProfile?.systemRole==='SYSTEM_ADMIN';
 const menus=useIndustryMenuPolicy(allowed),blueprint=useMenuBlueprint();
 const ordering=useNavigationOrder(allowed,activeProfile?.entryType,true);
 const dialogs=usePageDialogs();
 const t=subscriberAccessText[languageCode]||subscriberAccessText.en,layout=accessPolicyLayoutText[languageCode]||accessPolicyLayoutText.en;

 const [saving,setSaving]=React.useState(false);
 const [dragged,setDragged]=React.useState(null);
 const sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:5}}));
 const [policy,setPolicy]=React.useState(null),[original,setOriginal]=React.useState(null),[roleError,setRoleError]=React.useState(false);
 const loadRoles=React.useCallback(async()=>{setRoleError(false);try{const value=toEditablePolicy((await fetchRoleAccessPolicy()).policy);setPolicy(value);setOriginal(value);}catch{setRoleError(true);}},[]);
 React.useEffect(()=>{if(allowed)loadRoles();},[allowed,loadRoles]);
 const tree=React.useMemo(()=>applyNavigationOrder(mergeMenus(...TYPES.map(type=>buildMenuTree(organizeCompanyMenu(subscriberMenuBlueprint(blueprint,type),key=>getUiMessage(key,key,languageCode),type),'root',type))),ordering.draft),[blueprint,languageCode,ordering.draft]);
 const rows=React.useMemo(()=>flattenMenuTree(tree),[tree]);
 const roles=Object.values(ORG_ROLE_KEYS);
 const labels=roles.map(role=>getStaticOptionLabel('orgRole',role,role,languageCode));
 const roleDirty=!!policy&&JSON.stringify(policy)!==JSON.stringify(original),dirty=menus.dirty||roleDirty||ordering.dirty;
 useUnsavedChanges(dirty);
 const locked=menus.loading||ordering.loading||saving||!menus.loaded||!ordering.loaded||!policy||roleError;
 const actionText=accessPolicyActionText[languageCode]||accessPolicyActionText.en;
 const positionFor=row=>{
  const parent=row.depth===0?'root':row.id.split(':').slice(0,-1).join(':'),parentNode=rows.find(node=>node.id===parent);
  const parentId=row.depth===0?'root':navigationNodeId(parentNode||{}),siblings=row.depth===0?tree:parentNode?.children||[],index=siblings.findIndex(node=>node.id===row.id);
  return {parentId,siblings,index};
 };
 const finishDrag=({active,over})=>{setDragged(null);if(locked||!over||active.id===over.id||active.data.current.parentId!==over.data.current.parentId)return;
  const {parentId,siblings,index}=positionFor(active.data.current.row),target=siblings.findIndex(node=>navigationNodeId(node)===over.id);
  if(index<0||target<0)return;
  ordering.setDraft(previous=>{let next=previous;const step=target>index?1:-1;for(let i=index;i!==target;i+=step)next=moveNavigationNode(applyNavigationOrder(tree,next),next,parentId,active.id,step);return next;});
 };
 const toggleRole=(type,features,role,checked)=>setPolicy(previous=>({...previous,[type]:{...previous[type],[role]:checked?[...new Set([...previous[type][role],...features])]:previous[type][role].filter(key=>!features.includes(key))}}));
 const save=async()=>{if(locked||!dirty)return;setSaving(true);try{if(ordering.dirty)await ordering.save();if(menus.dirty)await menus.save();if(roleDirty){const saved=toEditablePolicy(await saveRoleAccessPolicy(policy));setPolicy(saved);setOriginal(saved);}showNotification(layout.saved,'success');}catch{showNotification(layout.partial,'error');}finally{setSaving(false);}};
 return <AppPageContainer title={getUiMessage('menu.accessPolicy','Access policy',languageCode)} titleActions={allowed?<Button variant="contained" disabled={locked||!dirty} onClick={save}>{layout.save}</Button>:null}>
 {!allowed?<Alert severity="error">{t.denied}</Alert>:<>
 {ordering.error&&<Alert severity="error" action={<Button onClick={async()=>{if(!ordering.dirty||await dialogs.confirm('',{purpose:'discard'}))ordering.reload({discard:true});}} disabled={saving}>{layout.reload}</Button>}>{t[ordering.error]}</Alert>}
 {menus.error&&<Alert severity="error" action={<Button onClick={menus.reload} disabled={saving}>{layout.reload}</Button>}>{t[menus.error]}</Alert>}
 {roleError&&<Alert severity="error" action={<Button onClick={loadRoles} disabled={saving}>{layout.reload}</Button>}>{t.failed}</Alert>}
 <DndContext sensors={sensors} accessibility={{screenReaderInstructions:{draggable:{ko:'드래그하거나 위·아래 방향키로 순서를 변경하세요.',en:'Drag or use the up and down arrow keys to reorder.',vi:'Kéo hoặc dùng phím mũi tên lên và xuống để đổi thứ tự.'}[languageCode]||'Drag or use the up and down arrow keys to reorder.'}}} collisionDetection={args=>closestCenter({...args,droppableContainers:args.droppableContainers.filter(item=>item.data.current?.parentId===args.active.data.current?.parentId)})} onDragStart={({active})=>setDragged(active.data.current.row)} onDragCancel={()=>setDragged(null)} onDragEnd={finishDrag}>
 <Paper variant="outlined" sx={{overflow:'hidden',borderRadius:2}}><TableContainer><Table size="small" stickyHeader sx={{minWidth:1100}}>
 <TableHead><TableRow><TableCell rowSpan={2}>{getUiMessage('accessPolicy.menuTree','Menu structure',languageCode)}</TableCell>{TYPES.map(type=><TableCell key={type} align="center" colSpan={5}>{type==='MANUFACTURER'?t.factory:t.logistics}</TableCell>)}</TableRow><TableRow>{TYPES.map(type=><React.Fragment key={type}><TableCell align="center">{layout.provided}</TableCell>{roles.map((role,index)=><TableCell key={role} align="center">{labels[index]}</TableCell>)}</React.Fragment>)}</TableRow></TableHead>
 <TableBody>{rows.map(row=>{
 const position=positionFor(row),onMove=delta=>{if(!locked)ordering.setDraft(previous=>moveNavigationNode(tree,previous,position.parentId,navigationNodeId(row),delta));};
 if(row.type==='group')return <ReorderRow key={row.id} row={row} parentId={position.parentId} locked={locked} onMove={onMove} data-menu-group={row.menuGroupKey} sx={{bgcolor:'action.hover'}}>{handle=><TableCell colSpan={11}><Typography variant="subtitle2" fontWeight={700}>{handle}{row.label}</Typography></TableCell>}</ReorderRow>;
 return <ReorderRow key={row.path} row={row} parentId={position.parentId} locked={locked} onMove={onMove} data-menu-path={row.path}>{handle=><>
 <TableCell><Typography sx={{pl:row.depth*2}}>{handle}{row.label.replace(/[\p{Extended_Pictographic}\uFE0F]/gu,'').trim()}</Typography></TableCell>
 {TYPES.map(type=>{
 const features=row.featureKeys;
 const supported=features.every(feature=>type==='SERVICE'?SERVICE_FEATURES.includes(feature):feature!=='FREIGHT');
 const enabled=supported&&(row.fixedAccess||features.every(feature=>menus.features(type).includes(feature)));
 const unavailable=!enabled||row.disabled;
 const industryLabel=type==='MANUFACTURER'?t.factory:t.logistics;
 return <React.Fragment key={type}>
 <TableCell align="center" data-menu-availability={type} sx={{borderLeft:1,borderColor:'divider'}}>{!supported||row.fixedAccess?<Typography variant="caption" color="text.secondary">{supported?actionText.always:layout.unsupported}</Typography>:<Checkbox size="small" checked={enabled} disabled={locked||row.disabled} onChange={(_,checked)=>features.forEach(feature=>menus.toggle(type,feature,checked))} slotProps={{input:{'aria-label':industryLabel+' '+row.label+' '+layout.provided}}}/>}</TableCell>
 {roles.map((role,index)=><TableCell key={role} align="center">{!supported?<Typography variant="caption" color="text.disabled">—</Typography>:<Checkbox size="small" checked={row.fixedAccess||features.every(feature=>policy?.[type]?.[role]?.includes(feature))} disabled={locked||unavailable||row.fixedAccess||(role==='WORKER'&&features.some(feature=>(['FREIGHT','INVOICE','SHIPPING_REQUEST','ORDER_SHIPMENTS'].includes(feature)||type==='SERVICE'&&feature==='PRODUCTION_STATUS')))} onChange={(_,checked)=>toggleRole(type,features,role,checked)} slotProps={{input:{'aria-label':industryLabel+' '+row.label+' '+labels[index]}}}/>}</TableCell>)}
 </React.Fragment>;
 })}
 </>}</ReorderRow>;
 })}</TableBody></Table></TableContainer></Paper><DragOverlay>{dragged?<Paper variant="outlined" sx={{p:1,display:'flex',alignItems:'center',gap:1}}><DragIndicator fontSize="small"/>{dragged.label}</Paper>:null}</DragOverlay></DndContext></>}
 </AppPageContainer>;
}
export default AccessPolicyBoard;
