import {subscriberMenuBlueprint} from '../../../utils/subscriberMenus.mjs';
import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Button,FormControlLabel,Paper,Stack,Switch,Typography} from '@mui/material';
import {useLanguage} from '../../../context/LanguageContext';
import {useAppActions} from '../../../context/AppContext';
import {useMenuBlueprint} from '../../../context/MenuBlueprintContext';
import {resolveFeatureByPath} from '../../../utils/accessControl';
import {getDefaultRoleAccessPolicy} from '../../../utils/roleAccessPolicyCore.mjs';
import {requestJSON} from '../../../utils/apiClient';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import {subscriberAccessText} from '../../../constants/subscriberAccess';

export default function SubscriberMenuSettings({orgType}){
 const {languageCode}=useLanguage(),t=subscriberAccessText[languageCode]||subscriberAccessText.en,{showNotification}=useAppActions(),blueprint=useMenuBlueprint();
 const [loaded,setLoaded]=useState(null),[draft,setDraft]=useState({}),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const fallback=useMemo(()=>[...new Set(['DASHBOARD','BUSINESS',...Object.values(getDefaultRoleAccessPolicy()[orgType]||{}).flat()])],[orgType]);
 const features=draft[orgType]||fallback.filter(feature=>loaded?.features.includes(feature));
 const dirty=Boolean(loaded)&&JSON.stringify(draft)!==JSON.stringify(loaded.subscribers||{});
 useUnsavedChanges(dirty);
 useEffect(()=>{let alive=true;setLoaded(null);setError('');requestJSON('/system/industry-menu-policy',{skipCache:true}).then(value=>{if(alive){setLoaded(value);setDraft(value.subscribers||{});}}).catch(()=>alive&&setError(t.failed));return()=>{alive=false;};},[t.failed]);
 const rows=useMemo(()=>{const result=new Map();const visit=nodes=>nodes.forEach(node=>{if(node.children)visit(node.children);for(const item of node.accessChildren?.length?node.accessChildren:[node]){const feature=resolveFeatureByPath(item.path);if(loaded?.features.includes(feature)&&!result.has(feature))result.set(feature,item.label);}});visit(subscriberMenuBlueprint(blueprint,orgType));return [...result];},[blueprint,loaded,orgType]);
 const save=async()=>{if(!loaded||saving)return;setSaving(true);setError('');try{const value=await requestJSON('/system/industry-menu-policy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:loaded.revision,industries:loaded.industries,subscribers:{...draft,[orgType]:features}})});setLoaded(previous=>({...previous,...value}));setDraft(value.subscribers||{});showNotification(t.saved,'success');}catch(e){setError(e.status===409?t.conflict:t.failed);}finally{setSaving(false);}};
 return <Stack spacing={2}>{error&&<Alert severity="error">{error}</Alert>}{loaded&&!loaded.subscribers?.[orgType]&&Object.keys(loaded.industries||{}).length>0&&<Alert severity="info">{t.legacy}</Alert>}<Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="caption" color="text.secondary">{t.required}</Typography><Button variant="contained" disabled={!loaded||!dirty&&Boolean(loaded.subscribers?.[orgType])||saving} onClick={save}>{t.save}</Button></Stack><Paper variant="outlined" sx={{p:2,display:'grid',gridTemplateColumns:{xs:'1fr',md:'repeat(2,minmax(0,1fr))'},gap:1}}>{rows.map(([feature,label])=><FormControlLabel key={feature} label={label} control={<Switch inputProps={{'aria-label':label}} checked={features.includes(feature)} disabled={!loaded||saving||loaded.required.includes(feature)} onChange={(_,checked)=>setDraft(previous=>({...previous,[orgType]:checked?[...features,feature]:features.filter(value=>value!==feature)}))}/>}/>)}</Paper></Stack>;
}
