import SearchableSelect from '../../../components/SearchableSelect';
import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Button,FormControlLabel,Paper,Stack,Switch,Typography} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import {useLanguage} from '../../../context/LanguageContext';
import {useAppActions} from '../../../context/AppContext';
import {useMenuBlueprint} from '../../../context/MenuBlueprintContext';
import {resolveFeatureByPath} from '../../../utils/accessControl';
import {requestJSON} from '../../../utils/apiClient';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';

import {industryMenuText} from '../../../constants/industryMenu';

export default function IndustryMenuSettings(){
 const {languageCode}=useLanguage(),t=industryMenuText[languageCode]||industryMenuText.en,{showNotification}=useAppActions(),blueprint=useMenuBlueprint();
 const [loaded,setLoaded]=useState(null),[draft,setDraft]=useState({}),[selected,setSelected]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 const dirty=Boolean(loaded)&&JSON.stringify(draft)!==JSON.stringify(loaded.industries);
 useUnsavedChanges(dirty);
 useEffect(()=>{let alive=true;requestJSON('/system/industry-menu-policy',{skipCache:true}).then(data=>{if(alive){setLoaded(data);setDraft(data.industries);setSelected(String(data.catalogue[0]?.id||''));}}).catch(()=>alive&&setError(t.failed));return()=>{alive=false;};},[t.failed]);
 const rows=useMemo(()=>{const result=new Map();const visit=nodes=>nodes.forEach(node=>{if(node.children)visit(node.children);const options=node.accessChildren?.length?node.accessChildren:[node];options.forEach(item=>{const feature=resolveFeatureByPath(item.path);if(loaded?.features.includes(feature)&&!result.has(feature))result.set(feature,item.label);});});visit(blueprint);return [...result];},[blueprint,loaded]);
 const custom=Object.hasOwn(draft,selected),features=draft[selected]||loaded?.features||[];
 const name=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.nameEn||row?.name||row?.nameKo||row?.nameVi;
 const save=async()=>{if(saving||!dirty)return;setSaving(true);setError('');try{const data=await requestJSON('/system/industry-menu-policy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:loaded.revision,industries:draft})});setLoaded(previous=>({...previous,...data}));setDraft(data.industries);showNotification(t.saved,'success');}catch(e){setError(e?.status===409?t.conflict:t.failed);}finally{setSaving(false);}};
 return <AppPageContainer title={t.title} titleActions={<Button variant="contained" disabled={!dirty||saving} onClick={save}>{t.save}</Button>}><Stack spacing={2}>{error&&<Alert severity="error">{error}</Alert>}<Paper variant="outlined" sx={{p:2}}><Stack spacing={2}><Typography variant="body2" color="text.secondary">{t.note}</Typography><SearchableSelect hideCode label={t.industry} options={loaded?.catalogue||[]} value={loaded?.catalogue.find(row=>String(row.id)===selected)||null} disabled={!loaded||saving} onChange={(_,row)=>setSelected(row?String(row.id):'')} getOptionLabel={row=>name(row.partnerRole)+' > '+name(row)} isOptionEqualToValue={(a,b)=>a.id===b.id} sx={{width:{xs:'100%',sm:420}}}/><FormControlLabel label={t.custom} control={<Switch checked={custom} disabled={!selected||saving} onChange={(_,checked)=>setDraft(previous=>{const next={...previous};if(checked)next[selected]=[...loaded.features];else delete next[selected];return next;})}/>}/><Typography variant="caption" color="text.secondary">{t.required}</Typography>{rows.map(([feature,label])=><FormControlLabel key={feature} label={label} control={<Switch inputProps={{'aria-label':label}} checked={features.includes(feature)} disabled={!custom||saving||loaded.required.includes(feature)} onChange={(_,checked)=>setDraft(previous=>({...previous,[selected]:checked?[...features,feature]:features.filter(value=>value!==feature)}))}/>}/>)}</Stack></Paper></Stack></AppPageContainer>;
}
