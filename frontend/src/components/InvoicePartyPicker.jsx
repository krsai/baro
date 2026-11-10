import React,{useEffect,useState} from 'react';
import {Box,Stack} from '@mui/material';
import LookupInput from './LookupInput';
import LookupSearchDialog from './LookupSearchDialog';
import ReadOnlyField from './ReadOnlyField';
import {PayeeDetails} from './ExpensePayeePicker';
import {invoicePartyText} from '../constants/invoiceParty';
import {INDUSTRY_TREE_TEXT} from '../constants/industryHierarchy';
import {partnerIndustryLabel} from '../utils/partnerIndustry.mjs';
export default function InvoicePartyPicker({orgId,options,value,onChange,disabled,languageCode}){
 const t=invoicePartyText[languageCode]||invoicePartyText.en;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[highlight,setHighlight]=useState(null),[reset,setReset]=useState(0);
 useEffect(()=>{setOpen(false);setHighlight(null);},[orgId]);
 const draft=options.find(row=>row.id===highlight),name=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||'';
 const close=()=>{setOpen(false);setReset(n=>n+1);};
 return <>
  <Stack data-testid="invoice-party-picker" direction="row" spacing={1} sx={{minWidth:0}}><Box sx={{width:104,flexShrink:0}}><LookupInput label={t.target} required resetKey={reset} options={options} value={value} disabled={disabled} getLabel={row=>row.code||''} getCode={row=>row.code||''} getValues={row=>[row.name,row.nameKo,row.nameVi,...String(row.searchText||'').split(/\s+/)]} onChange={onChange} searchLabel={t.select} onSearch={(text,candidate)=>{setHighlight(candidate?.id||value?.id||null);setQuery(text);setOpen(true);}}/></Box><ReadOnlyField hideLabel label={t.name} value={name(value)}/></Stack>
  <LookupSearchDialog open={open} onClose={close} title={t.select} query={query} onQueryChange={setQuery} options={options} languageCode={languageCode} getSearchText={row=>[row.code,row.searchText,row.name,row.nameKo,row.nameVi].filter(Boolean).join(' ')} columns={[{key:'code',label:t.code,width:'20%',value:row=>row.code},{key:'name',label:t.target,width:'44%',value:name},{key:'industry',label:(INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en).industry,width:'22%',value:row=>row.serviceTypes?.map(item=>partnerIndustryLabel(item,languageCode)).join(', ')}]} highlightedKey={highlight} onHighlight={row=>setHighlight(row.id)} onSelect={row=>{onChange(row);close();}} details={<PayeeDetails draft={draft?{...draft,name:name(draft)}:null} languageCode={languageCode} t={{payee:t.target}} showAccounts={false}/>}/>
 </>;
}
