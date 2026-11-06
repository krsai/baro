import Autocomplete from './SearchableSelect';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Checkbox,Chip,FormControlLabel,IconButton,Stack,TextField,Typography,createFilterOptions} from '@mui/material';
import {Close,ViewSidebarOutlined} from '@mui/icons-material';
import {createPortal} from 'react-dom';
import {partnerClassificationPanelText} from '../constants/partnerClassificationPanel';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {classificationName,PARTNER_CLASSIFICATION_TEXT} from '../utils/partnerClassification.mjs';

export default function PartnerClassificationFields({value,onChange,orgId,enabled=true,disabled=false,languageCode='ko',onReady,inline=false,expandable=false,sidePanelTarget,sidePanelOpen=false,onPanelOpenChange}){
 const text=PARTNER_CLASSIFICATION_TEXT[languageCode]||PARTNER_CLASSIFICATION_TEXT.en;
 const [options,setOptions]=useState({roles:[],industries:[]}),[error,setError]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 const [search,setSearch]=useState(''),panelText=partnerClassificationPanelText[languageCode]||partnerClassificationPanelText.en;
 const readyCallback=useRef(onReady);readyCallback.current=onReady;
 useEffect(()=>{
  if(!enabled||!orgId)return;
  let alive=true;setLoading(true);setError(false);readyCallback.current?.(false);
  requestJSON('/partner-classifications/options'+buildQueryString({orgId}),{skipCache:true}).then(data=>{
   if(!alive)return;setOptions(data);readyCallback.current?.(true);
  }).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[orgId,enabled,reload]);
 const industries=[...options.industries,...(value?.industries||[]).filter(row=>!options.industries.some(option=>option.id===row.id))].filter(row=>row.code!=='GENERAL');
 const roles=options.roles;
 const name=row=>classificationName(row,languageCode);
 const filterOptions=createFilterOptions({stringify:row=>[row.code,row.nameEn,row.nameKo,row.nameVi].join(' ')});
 const change=(roleIds,industryIds)=>onChange({...value,roleIds,industryIds,industries:industries.filter(row=>industryIds.includes(row.id))});
 const toggleRole=id=>{const roleIds=value.roleIds.includes(id)?value.roleIds.filter(item=>item!==id):[...value.roleIds,id];change(roleIds,value.industryIds.filter(item=>industries.some(row=>row.id===item&&roleIds.includes(row.partnerRoleId))));};
 const toggleIndustry=row=>change(value.roleIds.includes(row.partnerRoleId)?value.roleIds:[...value.roleIds,row.partnerRoleId],value.industryIds.includes(row.id)?value.industryIds.filter(id=>id!==row.id):[...value.industryIds,row.id]);
 if(expandable){
  const matches=filterOptions(industries.map(row=>({...row,nameEn:[row.nameEn,roles.find(role=>role.id===row.partnerRoleId)?.nameEn].join(' '),nameKo:[row.nameKo,roles.find(role=>role.id===row.partnerRoleId)?.nameKo].join(' '),nameVi:[row.nameVi,roles.find(role=>role.id===row.partnerRoleId)?.nameVi].join(' ')})),{inputValue:search,getOptionLabel:name});
  const visible=roles.filter(role=>!search||filterOptions([role],{inputValue:search,getOptionLabel:name}).length||matches.some(row=>row.partnerRoleId===role.id));
  return <Stack spacing={1}>
   {error&&<Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{text.retry}</Button>}>{text.loadError}</Alert>}
   <Button variant="outlined" startIcon={<ViewSidebarOutlined/>} disabled={disabled||loading||error} aria-expanded={sidePanelOpen} onClick={()=>{setSearch('');onPanelOpenChange(true);}}>{panelText.select}</Button>
   {value.roleIds.map(id=><Box key={id}><Typography variant="caption" color="text.secondary">{name(roles.find(role=>role.id===id))}</Typography><Stack direction="row" useFlexGap flexWrap="wrap" gap={.5}>{industries.filter(row=>row.partnerRoleId===id&&value.industryIds.includes(row.id)).map(row=><Chip size="small" key={row.id} label={name(row)} onDelete={disabled?undefined:()=>toggleIndustry(row)}/>)}</Stack></Box>)}
   {!value.roleIds.length&&<Typography variant="body2" color="text.secondary">{panelText.empty}</Typography>}
   {sidePanelTarget&&createPortal(<Box component="aside" aria-label={panelText.select} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onPanelOpenChange(false);}}} sx={{border:1,borderColor:'divider',borderRadius:1,minWidth:0,display:'flex',flexDirection:'column',maxHeight:{xs:'60dvh',md:'70dvh'},position:{md:'sticky'},top:0}}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{p:1,borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{panelText.select}</Typography><IconButton aria-label={panelText.close} onClick={()=>onPanelOpenChange(false)}><Close fontSize="small"/></IconButton></Stack>
    <Box sx={{p:1}}><TextField autoFocus fullWidth size="small" label={panelText.search} value={search} onChange={event=>setSearch(event.target.value)}/></Box>
    <Box sx={{overflowY:'auto',minHeight:0}}>{visible.map(role=><Box key={role.id} sx={{borderTop:1,borderColor:'divider'}}>
     <FormControlLabel sx={{m:0,px:1,bgcolor:'grey.50',display:'flex'}} control={<Checkbox checked={value.roleIds.includes(role.id)} disabled={disabled||!industries.some(row=>row.partnerRoleId===role.id)} onChange={()=>toggleRole(role.id)}/>} label={<Typography variant="subtitle2">{name(role)}</Typography>}/>
     {industries.filter(row=>row.partnerRoleId===role.id&&(!search||matches.some(item=>item.id===row.id))).map(row=><FormControlLabel key={row.id} sx={{display:'flex',m:0,pl:3,pr:1,'& .MuiFormControlLabel-label':{overflowWrap:'anywhere'}}} control={<Checkbox checked={value.industryIds.includes(row.id)} disabled={disabled} onChange={()=>toggleIndustry(row)}/>} label={name(row)}/>)}
    </Box>)}{!visible.length&&<Typography sx={{p:2}}>{panelText.noResults}</Typography>}</Box>
   </Box>,sidePanelTarget)}
  </Stack>;
 }
 return <Stack spacing={2}>
  {error&&<Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{text.retry}</Button>}>{text.loadError}</Alert>}
  <Box data-testid={inline?'classification-inline':undefined} sx={{display:'grid',gridTemplateColumns:inline?{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'}:'minmax(0,1fr)',gap:2,alignItems:'start'}}>
  <Autocomplete hideCode multiple disableCloseOnSelect options={roles} value={roles.filter(row=>value?.roleIds?.includes(row.id))} disabled={disabled||loading||error} loading={loading} getOptionLabel={name} isOptionEqualToValue={(row,selected)=>row.id===selected.id} filterOptions={filterOptions}
   getOptionDisabled={row=>!industries.some(industry=>industry.partnerRoleId===row.id)}
   onChange={(_,selected)=>{const roleIds=selected.map(row=>row.id);change(roleIds,(value?.industryIds||[]).filter(id=>industries.some(row=>row.id===id&&roleIds.includes(row.partnerRoleId))));}}
   renderOption={(props,row,{selected})=>{const {key,...rest}=props;return <li key={key} {...rest}><Checkbox checked={selected}/>{name(row)}</li>;}}
   renderInput={params=><TextField {...params} required size="small" label={text.category}/>}/>
  <Stack spacing={2}>{(value?.roleIds||[]).map(roleId=>{const role=roles.find(row=>row.id===roleId),choices=industries.filter(row=>row.partnerRoleId===roleId);return <Autocomplete hideCode key={roleId} multiple disableCloseOnSelect options={choices} value={choices.filter(row=>value.industryIds.includes(row.id))} disabled={disabled||loading||error} getOptionLabel={name} isOptionEqualToValue={(row,selected)=>row.id===selected.id} filterOptions={filterOptions}
   onChange={(_,selected)=>change(value.roleIds,[...value.industryIds.filter(id=>!choices.some(row=>row.id===id)),...selected.map(row=>row.id)])}
   renderOption={(props,row,{selected})=>{const {key,...rest}=props;return <li key={key} {...rest}><Checkbox checked={selected}/>{name(row)}</li>;}}
   renderInput={params=><TextField {...params} required size="small" label={`${name(role)} > ${text.industry}`}/>}/>;})}</Stack></Box>
  {Boolean(value?.legacyGeneral?.length)&&<Typography variant="caption" color="text.secondary">{text.legacy}: {value.legacyGeneral.map(row=>row.code).join(', ')}</Typography>}
 </Stack>;
}
