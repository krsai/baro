import React,{useEffect,useState} from 'react';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,TextField} from '@mui/material';
import LookupSearchDialog from './LookupSearchDialog';
import ShippingPresetDialog from './ShippingPresetDialog';
import {usePageDialogs} from './PageDialogProvider';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';

// Mounted by a route card. Maritime terminals select a shared port FK;
// warehouses and airports support direct input and company-scoped addresses.
export default function ShippingLocationField({label,value,onChange,onClose,orgId,customerId,allowPorts,languageCode,disabled}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs();
 const [draft,setDraft]=useState(value||''),[query,setQuery]=useState(''),[lookup,setLookup]=useState(!!allowPorts),[manage,setManage]=useState(false),[rows,setRows]=useState([]),[error,setError]=useState(false),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{if(!lookup)return;let live=true;setLoading(true);setError(false);const timer=setTimeout(()=>{
  const url=allowPorts?'/shipping-requests/ports'+buildQueryString({orgId,q:query}):'/shipping-requests/presets'+buildQueryString({orgId,customerId,kind:'LOCATION'});
  if(!allowPorts&&!customerId){setRows([]);setLoading(false);return;}
  requestJSON(url,{skipCache:true}).then(result=>{if(live)setRows(allowPorts?result.rows.map(row=>({...row,id:row.code,address:`${row.name} (${row.code})`})):result.map(row=>({...row,address:row.data.address})));}).catch(()=>{if(live){setRows([]);setError(true);}}).finally(()=>live&&setLoading(false));
 },180);return()=>{live=false;clearTimeout(timer);};},[lookup,allowPorts,orgId,customerId,query,reload]);
 const close=async()=>{if(manage)return;if(draft===(value||'')||await dialogs.confirm(t.discard))onClose();};
 const select=row=>{if(allowPorts){onChange(row.address,row.code);onClose();}else{setDraft(row.address);setLookup(false);}};
 const feedback=error?<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{t.retry}</Button>}>{t.failed}</Alert>:loading?t.loading:undefined;
 if(allowPorts)return <LookupSearchDialog open maxWidth="sm" onClose={onClose} title={label+' · '+t.locationSearch} query={query} onQueryChange={setQuery} languageCode={languageCode} options={rows} filterOptions={items=>items} columns={[{key:'code',label:t.portCode,value:row=>row.code,width:85},{key:'name',label:t.portName,value:row=>row.name},{key:'country',label:t.country,value:row=>row.country,width:60}]} onSelect={select} loading={loading} feedback={feedback}/>;
 return <><Dialog open fullWidth maxWidth="sm" onClose={close} aria-label={label} data-testid="route-address-dialog"><DialogTitle>{label}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}><TextField autoFocus fullWidth size="small" label={t.savedAddress} value={draft} disabled={disabled} slotProps={{htmlInput:{maxLength:160}}} onChange={ev=>setDraft(ev.target.value)}/><Stack direction="row" gap={1}><Button disabled={disabled||!customerId} onClick={()=>{setQuery('');setLookup(true);}}>{t.savedAddresses}</Button><Button disabled={disabled||!customerId} onClick={()=>setManage(true)}>{t.presets}</Button></Stack>{!customerId&&<Alert severity="info">{t.chooseCustomer}</Alert>}</Stack></DialogContent><DialogActions><Button variant="contained" disabled={disabled||!draft.trim()} onClick={()=>{onChange(draft.trim(),null);onClose();}}>{t.applyLocation}</Button></DialogActions></Dialog>
 <LookupSearchDialog open={lookup} maxWidth="sm" onClose={()=>setLookup(false)} title={t.savedAddresses} query={query} onQueryChange={setQuery} languageCode={languageCode} options={rows} columns={[{key:'label',label:t.presetName,value:row=>row.label},{key:'address',label:t.savedAddress,value:row=>row.address}]} onSelect={select} loading={loading} feedback={feedback}/>
 {manage&&<ShippingPresetDialog orgId={orgId} customerId={customerId} kind="LOCATION" current={{address:draft}} languageCode={languageCode} onLoad={row=>setDraft(row.address)} onClose={()=>{setManage(false);setReload(v=>v+1);}}/>}</>;
}
