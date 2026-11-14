import React,{useEffect,useState} from 'react';
import {Alert,Button} from '@mui/material';
import LookupSearchDialog from './LookupSearchDialog';
import ShippingAddressBook from './ShippingAddressBook';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';

export default function ShippingLocationField({label,value,details,onChange,onClose,orgId,customerId,allowPorts,languageCode,disabled}){
 if(allowPorts)return <PortLookup {...{label,onChange,onClose,orgId,languageCode}}/>;
 return <ShippingAddressBook title={label} testId="route-address-dialog" {...{orgId,customerId,languageCode,disabled,onClose}} current={{...details,address:value||''}} onLoad={draft=>{const {address,...contact}=draft;onChange(address.trim(),null,Object.fromEntries(Object.entries(contact).map(([key,v])=>[key,v.trim()])));}}/>;
}
function PortLookup({label,onChange,onClose,orgId,languageCode}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en;
 const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[error,setError]=useState(false),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError(false);const timer=setTimeout(()=>{
  requestJSON('/shipping-requests/ports'+buildQueryString({orgId,q:query}),{skipCache:true}).then(result=>{if(live)setRows(result.rows.map(row=>({...row,id:row.code})));}).catch(()=>{if(live){setRows([]);setError(true);}}).finally(()=>live&&setLoading(false));
 },180);return()=>{live=false;clearTimeout(timer);};},[orgId,query,reload]);
 const feedback=error?<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{t.retry}</Button>}>{t.failed}</Alert>:loading?t.loading:undefined;
 return <LookupSearchDialog open maxWidth="md" onClose={onClose} title={label+' \u00b7 '+t.locationSearch} query={query} onQueryChange={setQuery} languageCode={languageCode} options={rows} tableMinWidth={600} searchInputProps={{maxLength:160}} filterOptions={items=>items} columns={[{key:'code',label:t.portCode,value:row=>row.code,width:120},{key:'name',label:t.portName,value:row=>row.name},{key:'country',label:t.country,value:row=>row.country,width:88}]} onSelect={row=>{onChange(row.name+' ('+row.code+')',row.code);onClose();}} loading={loading} feedback={feedback}/>;
}
