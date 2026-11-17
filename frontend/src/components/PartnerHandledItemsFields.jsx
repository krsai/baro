import React,{useEffect,useState} from 'react';
import {Button,Stack} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import AppNotice from './AppNotice';
import {classificationName} from '../utils/partnerClassification.mjs';
import {partnerHandledItemsText} from '../constants/partnerHandledItems';
import {requestJSON,buildQueryString} from '../utils/apiClient';
export default function PartnerHandledItemsFields({value,classification,onChange,orgId,enabled,disabled,languageCode}){
 const t=partnerHandledItemsText[languageCode]||partnerHandledItemsText.en;
 const [options,setOptions]=useState(null),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{if(!enabled||!orgId)return;let alive=true;setOptions(null);setError(false);
  requestJSON('/partner-handled-items/options'+buildQueryString({orgId}),{skipCache:true}).then(data=>{if(alive)setOptions(data);}).catch(()=>{if(alive)setError(true);});return()=>{alive=false;};
 },[enabled,orgId,reload]);
 if(error)return <AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>;
 const industries=options?.industries.filter(row=>classification?.industryIds?.includes(row.id))||[];
 return <Stack spacing={1.5}>{industries.map(industry=>{
  const group=value?.industries?.find(row=>row.industryId===industry.id),available=options.bases.filter(base=>base.industryLinks.some(link=>link.systemIndustryId===industry.id));
  const rows=[...available,...(group?.bases||[]).filter(base=>base&&!available.some(row=>row.id===base.id))];
  return <ExpenseLookupField key={industry.id} label={classificationName(industry,languageCode)+' · '+t.items} multiple options={rows} value={rows.filter(base=>group?.baseIds?.includes(base.id))} languageCode={languageCode} disabled={disabled} getOptionLabel={row=>classificationName(row,languageCode)} getCode={row=>row.code} columns={[{key:'code',label:t.code,value:row=>row.code},{key:'name',label:t.name,value:row=>classificationName(row,languageCode)}]} onChange={selected=>onChange({revision:value?.revision??0,industries:[...(value?.industries||[]).filter(row=>row.industryId!==industry.id),{industryId:industry.id,baseIds:selected.map(row=>row.id),bases:selected}]})}/>;
 })}</Stack>;
}
