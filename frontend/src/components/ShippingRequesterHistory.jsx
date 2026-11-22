import React,{useEffect,useState} from 'react';
import {Button} from '@mui/material';
import Alert from './AppNotice';
import LookupSearchDialog from './LookupSearchDialog';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';

export default function ShippingRequesterHistory({orgId,languageCode,onSelect,onClose}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en;
 const [rows,setRows]=useState([]),[query,setQuery]=useState(''),[loading,setLoading]=useState(true),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{
  let live=true;setLoading(true);setError(false);setRows([]);
  requestJSON('/shipping-requests/requesters'+buildQueryString({orgId}),{skipCache:true}).then(value=>{if(live)setRows(value);}).catch(()=>{if(live)setError(true);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[orgId,reload]);
 return <LookupSearchDialog titleActions={error?<><Alert severity="error">{t.failed}</Alert><Button onClick={()=>setReload(v=>v+1)}>{t.retry}</Button></>:undefined} open title={t.requesterHistory} languageCode={languageCode} onClose={onClose} query={query} onQueryChange={setQuery} options={rows} loading={loading} getOptionKey={row=>JSON.stringify([row.name,row.phone])} columns={[{key:'name',label:t.actualRequesterName,value:row=>row.name},{key:'phone',label:t.actualRequesterPhone,value:row=>row.phone}]} feedback={error?t.failed:undefined} onSelect={row=>{onSelect(row);onClose();}}/>;
}
