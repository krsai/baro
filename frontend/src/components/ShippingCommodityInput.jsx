import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack,Typography} from '@mui/material';
import LookupInput from './LookupInput';
import LookupSearchDialog from './LookupSearchDialog';
import {shippingEditorText} from '../constants/shippingEditor';
import {freightJobEditorText} from '../constants/freightJobEditor';
import {titleCaseWords} from '../utils/humanTextCase.mjs';

export default function ShippingCommodityInput({value,hsCode,onChange,disabled,languageCode}){
 const t={...(shippingEditorText[languageCode]||shippingEditorText.en),cargo:(freightJobEditorText[languageCode]||freightJobEditorText.en).cargo};
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[open,setOpen]=useState(false),[query,setQuery]=useState('');
 useEffect(()=>{let live=true;setLoading(true);setFailed(false);import('../data/hs2022.json').then(module=>{if(live)setRows(module.default.rows);}).catch(()=>{if(live)setFailed(true);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[retry]);
 const edited=useRef(false),name=row=>titleCaseWords(row.name);
 const choose=(row,event)=>{if(event?.type==='blur'&&!edited.current)return;if(row){edited.current=false;onChange({cargo:name(row),hsCode:row.code});setOpen(false);}};
 return <>
  <LookupInput label={t.cargo} options={rows} value={null} inputValue={value||''} allowEmpty disabled={disabled} getLabel={name} getCode={row=>row.code} onChange={choose} onInputChange={(_,text,reason)=>{if(reason==='input'){edited.current=true;const selected=rows.find(row=>row.code===hsCode&&name(row)===value);onChange({cargo:text,...(selected?{hsCode:''}:{})});}}} onSearch={text=>{setQuery(text);setOpen(true);}} searchLabel={t.commoditySearch} textFieldProps={{onBlur:event=>{if(edited.current){edited.current=false;onChange({cargo:titleCaseWords(event.target.value)});}},slotProps:{htmlInput:{maxLength:2000}}}}/>
  {open&&<LookupSearchDialog open onClose={()=>setOpen(false)} title={t.commoditySearch} titleActions={<Stack direction="row" gap={1}>{failed&&<Button onClick={()=>setRetry(value=>value+1)}>{t.retry}</Button>}<Button disabled={!query.trim()} onClick={()=>{onChange({cargo:titleCaseWords(query),...(rows.some(row=>row.code===hsCode&&name(row)===value)&&query!==value?{hsCode:''}:{})});setOpen(false);}}>{t.useDirectCommodity}</Button></Stack>} query={query} onQueryChange={setQuery} options={rows} loading={loading} feedback={failed?t.failed:undefined} languageCode={languageCode} onSelect={choose} columns={[{key:'code',label:'HS 6',value:row=>row.code,textCase:'preserve'},{key:'name',label:t.cargo,value:row=>row.name}]} getSearchText={row=>row.code+' '+row.name} renderDetails={row=><Stack spacing={2}><Typography fontWeight={600}>{row.code}</Typography><Typography>{row.name}</Typography><Typography variant="caption" color="text.secondary">HS 2022 · UN Comtrade</Typography></Stack>}/>}
 </>;
}
