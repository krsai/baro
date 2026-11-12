import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,Stack} from '@mui/material';
import LookupInput from './LookupInput';
import LookupSearchDialog from './LookupSearchDialog';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';

export default function OpeningBillField({orgId,balanceDate,languageCode,t,value,onChange,disabled}){
 const searchInput=useRef(null),restoreSearch=useRef(false);
 const retryLookup=()=>{searchInput.current?.focus();restoreSearch.current=true;setRetry(v=>v+1);};
 const [query,setQuery]=useState(null),[options,setOptions]=useState([]),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[retry,setRetry]=useState(0),[more,setMore]=useState(false);
 useEffect(()=>{let live=true;const controller=new AbortController();setOptions([]);setMore(false);setError(false);
  if(query===null||disabled){setBusy(false);return()=>{live=false;};}
  setBusy(true);
  const timer=setTimeout(()=>requestJSON('/bank-ledger/opening'+buildQueryString({orgId,balanceDate,search:query,lookup:1}),{skipCache:true,skipGlobalLoading:true,signal:controller.signal}).then(result=>{if(live){setOptions(result.documents);setMore(result.hasMore);}}).catch(()=>{if(live)setError(true);}).finally(()=>{if(live){setBusy(false);if(restoreSearch.current){restoreSearch.current=false;requestAnimationFrame(()=>searchInput.current?.focus());}}}),200);
  return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[orgId,balanceDate,query,retry,disabled]);
 useEffect(()=>{if(disabled)setOpen(false);},[disabled]);
 const key=row=>(row.sourceType||row.side)+':'+row.id;
 return <Stack spacing={.5}>
  <LookupInput allowEmpty label={t.billNumber} value={value} options={more?[]:options} getLabel={row=>row.reference} getCode={row=>row.billNumber||row.reference} getValues={row=>[row.reference,row.billNumber]} getOptionDisabled={row=>!!row.hasUnlinkedReceipt} getOptionKey={key} disabled={disabled} onChange={onChange} onInputChange={(_,input,reason)=>{if(reason!=='reset'){setOptions([]);setQuery(input.trim()?input:null);}}} onSearch={input=>{setQuery(input);setOpen(true);}}/>
  {busy&&<CircularProgress size={16}/>}
  {error&&<Alert severity="error" action={<Button disabled={disabled} onClick={retryLookup}>{t.reload}</Button>}>{t.failed}</Alert>}
  {more&&<Alert severity="info">{t.more}</Alert>}
  <LookupSearchDialog searchInputRef={searchInput} open={open} loading={busy} feedback={error?<Alert severity="error" action={<Button onClick={()=>setRetry(v=>v+1)}>{t.reload}</Button>}>{t.failed}</Alert>:more?t.more:undefined} onClose={()=>setOpen(false)} title={t.billNumber} query={query||''} onQueryChange={input=>{setOptions([]);setBusy(true);setQuery(input);}} options={options} filterOptions={rows=>rows} getOptionKey={key} getOptionDisabled={row=>!!row.hasUnlinkedReceipt} languageCode={languageCode} onSelect={row=>{onChange(row);setOpen(false);}} columns={[
   {key:'reference',label:t.billNumber,value:row=>row.reference,width:180},
   {key:'party',label:t.party,value:row=>row.party,width:150},
   {key:'description',label:t.code,value:row=>row.hasUnlinkedReceipt?t.receipt:row.description,width:140},
   {key:'remaining',label:t.remaining,value:row=>formatLedgerMoney(row.remaining,row.currencyCode),align:'right',width:150},
  ]}/>
 </Stack>;
}
