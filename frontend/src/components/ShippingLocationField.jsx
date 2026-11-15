import React,{useEffect,useState} from 'react';
import {Alert,Button,Stack} from '@mui/material';
import LookupSearchDialog from './LookupSearchDialog';
import ShippingAddressBook from './ShippingAddressBook';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';

export default function ShippingLocationField({label,value,details,defaultParty,personLabel,resolveCustomer,onChange,onClose,orgId,customerId,allowPorts,allowTerminals,languageCode,disabled}){
 const [lookup,setLookup]=useState(null);
 const t=shippingEditorText[languageCode]||shippingEditorText.en;
 if(allowPorts)return <PortLookup {...{label,onChange,onClose,orgId,languageCode}}/>;
 const current=personLabel?{label:defaultParty?.name||'',address:defaultParty?.address||'',contactName:defaultParty?.contactName||'',phone:defaultParty?.phone||'',...details,...(value?{address:value}:{})}:value||details?{...details,address:value||''}:defaultParty?{label:defaultParty.name,address:defaultParty.address,contactName:defaultParty.contactName,phone:defaultParty.phone}:{};
 return <><ShippingAddressBook locationLookup={allowTerminals?(apply,blocked)=><Stack direction="row" gap={1} flexWrap="wrap">{['SEA','AIR'].map(kind=><Button key={kind} disabled={blocked} onClick={()=>setLookup({kind,apply})}>{kind==='SEA'?t.searchSeaPort:t.searchAirport}</Button>)}</Stack>:undefined} personLabel={personLabel} resolveCustomer={resolveCustomer} title={label} testId="route-address-dialog" {...{orgId,customerId,languageCode,disabled,onClose}} current={current} onLoad={draft=>{const {address,...contact}=draft;onChange(address.trim(),null,Object.fromEntries(Object.entries(contact).map(([key,v])=>[key,v.trim()])));}}/>{lookup&&<PortLookup label={lookup.kind==='SEA'?t.searchSeaPort:t.searchAirport} kind={lookup.kind} orgId={orgId} languageCode={languageCode} onClose={()=>setLookup(null)} onChange={address=>{lookup.apply(address);setLookup(null);}}/>}</>;
}
function PortLookup({label,onChange,onClose,orgId,languageCode,kind='SEA'}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en;
 const [query,setQuery]=useState(''),[rows,setRows]=useState([]),[error,setError]=useState(false),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{let live=true;setLoading(true);setError(false);const timer=setTimeout(()=>{
  requestJSON('/shipping-requests/ports'+buildQueryString({orgId,q:query,kind}),{skipCache:true}).then(result=>{if(live)setRows(result.rows.map(row=>({...row,id:row.id||row.code})));}).catch(()=>{if(live){setRows([]);setError(true);}}).finally(()=>live&&setLoading(false));
 },180);return()=>{live=false;clearTimeout(timer);};},[orgId,query,reload,kind]);
 const feedback=error?<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{t.retry}</Button>}>{t.failed}</Alert>:loading?t.loading:undefined;
 return <LookupSearchDialog open maxWidth="md" onClose={onClose} title={label+' \u00b7 '+t.locationSearch} query={query} onQueryChange={setQuery} languageCode={languageCode} options={rows} tableMinWidth={600} searchInputProps={{maxLength:160}} filterOptions={items=>items} columns={[{key:'code',label:kind==='AIR'?t.airportCode:t.portCode,value:row=>row.code,width:120},{key:'name',label:kind==='AIR'?t.airportName:t.portName,value:row=>row.name},{key:'country',label:t.country,value:row=>row.country,width:88}]} onSelect={row=>{onChange(row.name+' ('+row.code+')',row.code);onClose();}} loading={loading} feedback={feedback}/>;
}
