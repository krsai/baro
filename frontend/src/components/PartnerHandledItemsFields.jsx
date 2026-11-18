import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Box,Button,Checkbox,FormControlLabel,IconButton,Stack,TextField,Typography} from '@mui/material';
import {Close,ViewSidebarOutlined} from '@mui/icons-material';
import ExpenseLookupField from './ExpenseLookupField';
import LookupInput from './LookupInput';
import {keyboardAction} from '../utils/keyboardPolicy.mjs';
import AppNotice from './AppNotice';
import {classificationName} from '../utils/partnerClassification.mjs';
import {partnerHandledItemsText,partnerHandledItemsPanelText} from '../constants/partnerHandledItems';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {handledIndustryBases,missingHandledIndustries} from '../utils/partnerHandledItems.mjs';
export default function PartnerHandledItemsFields({value,classification,onChange,orgId,enabled,disabled,languageCode,onValidationChange,showErrors=false,expandable=false,sidePanelTarget,sidePanelOpen=false,onPanelOpenChange}){
 const t={...(partnerHandledItemsText[languageCode]||partnerHandledItemsText.en),...(partnerHandledItemsPanelText[languageCode]||partnerHandledItemsPanelText.en)};
 const [options,setOptions]=useState(null),[error,setError]=useState(false),[reload,setReload]=useState(0);
 const [industryId,setIndustryId]=useState(null),[query,setQuery]=useState('');
 const origin=useRef(null),skipFocus=useRef(false),panelSearch=useRef(null),focusSearch=useRef(false);
 useEffect(()=>{if(sidePanelOpen&&focusSearch.current&&panelSearch.current){focusSearch.current=false;panelSearch.current.focus();}});
 useEffect(()=>{if(!enabled||!orgId)return;let alive=true;setOptions(null);setError(false);
  requestJSON('/partner-handled-items/options'+buildQueryString({orgId}),{skipCache:true}).then(data=>{if(alive)setOptions(data);}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};
 },[enabled,orgId,reload]);
 const missing=missingHandledIndustries(options,classification,value),ready=Boolean(enabled&&orgId&&options&&!error);
 useEffect(()=>{onValidationChange?.({ready,missing:missing.length>0});},[onValidationChange,ready,missing.length]);
 const industries=options?.industries.filter(row=>classification?.industryIds?.includes(row.id))||[];
 const activeIndustry=industries.find(row=>row.id===industryId);
 useEffect(()=>{if(expandable&&sidePanelOpen&&options&&!activeIndustry)onPanelOpenChange(false);},[expandable,sidePanelOpen,options,activeIndustry,onPanelOpenChange]);
 if(error)return <AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>;
 const select=(industry,selected)=>onChange({revision:value?.revision??0,industries:[...(value?.industries||[]).filter(row=>row.industryId!==industry.id),{industryId:industry.id,baseIds:selected.map(row=>row.id),bases:selected}]});
 const openPanel=(industry,search='',source,focus=false)=>{if(disabled)return;setIndustryId(industry.id);setQuery(search);if(source)origin.current=source;if(focus){focusSearch.current=true;panelSearch.current?.focus();}onPanelOpenChange(true);};
 const closePanel=()=>{onPanelOpenChange(false);skipFocus.current=Boolean(origin.current?.matches('input'));origin.current?.focus();};
 const activeBases=activeIndustry?handledIndustryBases(options,activeIndustry.id):[];
 const activeGroup=value?.industries?.find(row=>row.industryId===industryId);
 const selectedBases=[...activeBases,...(activeGroup?.bases||[]).filter(base=>base&&!activeBases.some(row=>row.id===base.id))].filter(base=>activeGroup?.baseIds?.includes(base.id));
 const search=query.trim().toLocaleLowerCase();
 const visibleBases=activeBases.filter(base=>[base.code,base.nameEn,base.nameKo,base.nameVi].some(text=>String(text||'').toLocaleLowerCase().includes(search)));
 return <Stack spacing={1.5}>{industries.map(industry=>{
  const group=value?.industries?.find(row=>row.industryId===industry.id),available=handledIndustryBases(options,industry.id);
  const rows=[...available,...(group?.bases||[]).filter(base=>base&&!available.some(row=>row.id===base.id))];
  if(expandable){
   const selected=rows.filter(base=>group?.baseIds?.includes(base.id)),label=classificationName(industry,languageCode)+' · '+t.items;
   return <Stack key={industry.id} spacing={.5}>
    <Box sx={{display:'flex',justifyContent:'flex-end'}}><Button size="small" startIcon={<ViewSidebarOutlined/>} disabled={disabled} aria-label={label+' · '+t.choose} aria-expanded={sidePanelOpen&&industryId===industry.id} onClick={event=>openPanel(industry,'',event.currentTarget,true)}>{t.choose}</Button></Box>
    <LookupInput multiple selectedOptions={selected} options={available} value={null} clearAfterChoose hasSelection={selected.length>0} required error={showErrors&&missing.some(row=>row.id===industry.id)} label={label} disabled={disabled} getLabel={base=>classificationName(base,languageCode)} getCode={base=>base.code} getValues={base=>[base.nameEn,base.nameKo,base.nameVi]} getOptionKey={base=>base.id} onChange={base=>{if(base&&!selected.some(row=>row.id===base.id))select(industry,[...selected,base]);}} onRemoveOption={base=>select(industry,selected.filter(row=>row.id!==base.id))} onSearch={search=>openPanel(industry,search,undefined,true)} searchLabel={label+' · '+t.choose} textFieldProps={{onFocus:event=>{if(skipFocus.current){skipFocus.current=false;return;}if(!sidePanelOpen||industryId!==industry.id)openPanel(industry,'',event.target);}}}/>
   </Stack>;
  }
  return <ExpenseLookupField key={industry.id} required error={showErrors&&missing.some(row=>row.id===industry.id)} label={classificationName(industry,languageCode)+' · '+t.items} multiple options={available} value={rows.filter(base=>group?.baseIds?.includes(base.id))} languageCode={languageCode} disabled={disabled} getOptionLabel={row=>classificationName(row,languageCode)} getCode={row=>row.code} columns={[{key:'code',label:t.code,value:row=>row.code},{key:'name',label:t.name,value:row=>classificationName(row,languageCode)}]} onChange={selected=>onChange({revision:value?.revision??0,industries:[...(value?.industries||[]).filter(row=>row.industryId!==industry.id),{industryId:industry.id,baseIds:selected.map(row=>row.id),bases:selected}]})}/>;
 })}{expandable&&sidePanelOpen&&sidePanelTarget&&activeIndustry&&createPortal(<Box component="aside" aria-label={t.choose} onKeyDown={event=>{if(keyboardAction(event,'lookup')==='dismiss'){event.stopPropagation();closePanel();}}} sx={{border:1,borderColor:'divider',borderRadius:1,minWidth:0,display:'flex',flexDirection:'column',maxHeight:{xs:'60dvh',md:'70dvh'},position:{md:'sticky'},top:0}}>
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{p:1,borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{classificationName(activeIndustry,languageCode)+' · '+t.items}</Typography><IconButton aria-label={t.close} onClick={closePanel}><Close fontSize="small"/></IconButton></Stack>
  <Box sx={{p:1}}><TextField inputRef={panelSearch} fullWidth size="small" label={t.search} value={query} onChange={event=>setQuery(event.target.value)}/></Box>
  <Box sx={{overflowY:'auto',minHeight:0}}>{visibleBases.map(base=><FormControlLabel key={base.id} sx={{display:'flex',m:0,px:1,'& .MuiFormControlLabel-label':{overflowWrap:'anywhere'}}} control={<Checkbox checked={activeGroup?.baseIds?.includes(base.id)||false} disabled={disabled} onChange={(_,checked)=>select(activeIndustry,checked?[...selectedBases,base]:selectedBases.filter(row=>row.id!==base.id))}/>} label={<><Typography variant="body2">{classificationName(base,languageCode)}</Typography><Typography variant="caption" color="text.secondary">{base.code}</Typography></>}/>)}{!visibleBases.length&&<Typography sx={{p:2}}>{t.empty}</Typography>}</Box>
 </Box>,sidePanelTarget)}</Stack>;
}
