import React,{useEffect,useRef,useState} from 'react';
import {Alert,Autocomplete,Button,Checkbox,Stack,TextField,Typography,createFilterOptions} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {classificationName,PARTNER_CLASSIFICATION_TEXT} from '../utils/partnerClassification.mjs';

export default function PartnerClassificationFields({value,onChange,orgId,enabled=true,disabled=false,languageCode='ko',initialRoleCode,onReady}){
 const text=PARTNER_CLASSIFICATION_TEXT[languageCode]||PARTNER_CLASSIFICATION_TEXT.en;
 const [options,setOptions]=useState({roles:[],industries:[]}),[error,setError]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 const callbacks=useRef({value,onChange,onReady});callbacks.current={value,onChange,onReady};
 useEffect(()=>{
  if(!enabled||!orgId)return;
  let alive=true;setLoading(true);setError(false);callbacks.current.onReady?.(false);
  requestJSON('/partner-classifications/options'+buildQueryString({orgId}),{skipCache:true}).then(data=>{
   if(!alive)return;setOptions(data);callbacks.current.onReady?.(true);
   const current=callbacks.current.value;
   if(!current?.roleIds?.length&&initialRoleCode){const role=data.roles.find(row=>row.code===initialRoleCode);if(role)callbacks.current.onChange({...current,roleIds:[role.id]});}
  }).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[orgId,enabled,initialRoleCode,reload]);
 const industries=[...options.industries,...(value?.industries||[]).filter(row=>!options.industries.some(option=>option.id===row.id))].filter(row=>row.code!=='GENERAL');
 const roles=options.roles;
 const name=row=>classificationName(row,languageCode);
 const filterOptions=createFilterOptions({stringify:row=>[row.code,row.nameEn,row.nameKo,row.nameVi].join(' ')});
 const change=(roleIds,industryIds)=>onChange({...value,roleIds,industryIds,industries:industries.filter(row=>industryIds.includes(row.id))});
 return <Stack spacing={2}>
  {error&&<Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{text.retry}</Button>}>{text.loadError}</Alert>}
  <Autocomplete multiple disableCloseOnSelect options={roles} value={roles.filter(row=>value?.roleIds?.includes(row.id))} disabled={disabled||loading||error} loading={loading} getOptionLabel={name} isOptionEqualToValue={(row,selected)=>row.id===selected.id} filterOptions={filterOptions}
   getOptionDisabled={row=>!industries.some(industry=>industry.partnerRoleId===row.id)}
   onChange={(_,selected)=>{const roleIds=selected.map(row=>row.id);change(roleIds,(value?.industryIds||[]).filter(id=>industries.some(row=>row.id===id&&roleIds.includes(row.partnerRoleId))));}}
   renderOption={(props,row,{selected})=>{const {key,...rest}=props;return <li key={key} {...rest}><Checkbox checked={selected}/>{name(row)}</li>;}}
   renderInput={params=><TextField {...params} required size="small" label={text.category}/>}/>
  {(value?.roleIds||[]).map(roleId=>{const role=roles.find(row=>row.id===roleId),choices=industries.filter(row=>row.partnerRoleId===roleId);return <Autocomplete key={roleId} multiple disableCloseOnSelect options={choices} value={choices.filter(row=>value.industryIds.includes(row.id))} disabled={disabled||loading||error} getOptionLabel={name} isOptionEqualToValue={(row,selected)=>row.id===selected.id} filterOptions={filterOptions}
   onChange={(_,selected)=>change(value.roleIds,[...value.industryIds.filter(id=>!choices.some(row=>row.id===id)),...selected.map(row=>row.id)])}
   renderOption={(props,row,{selected})=>{const {key,...rest}=props;return <li key={key} {...rest}><Checkbox checked={selected}/>{name(row)}</li>;}}
   renderInput={params=><TextField {...params} required size="small" label={`${name(role)} > ${text.industry}`}/>}/>;})}
  {Boolean(value?.legacyGeneral?.length)&&<Typography variant="caption" color="text.secondary">{text.legacy}: {value.legacyGeneral.map(row=>row.code).join(', ')}</Typography>}
 </Stack>;
}
