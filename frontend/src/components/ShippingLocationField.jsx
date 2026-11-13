import React,{useEffect,useState} from 'react';
import {Alert,Button,Dialog,DialogContent,DialogTitle,IconButton,InputAdornment,Stack,TextField,Typography} from '@mui/material';
import LookupSearchDialog from './LookupSearchDialog';
import SearchIcon from '@mui/icons-material/Search';
import SaveButton from './SaveButton';
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
 if(allowPorts)return <LookupSearchDialog open maxWidth="md" onClose={onClose} title={label+' · '+t.locationSearch} query={query} onQueryChange={setQuery} languageCode={languageCode} options={rows} tableMinWidth={600} searchInputProps={{maxLength:160}} filterOptions={items=>items} columns={[{key:'code',label:t.portCode,value:row=>row.code,width:120},{key:'name',label:t.portName,value:row=>row.name},{key:'country',label:t.country,value:row=>row.country,width:88}]} onSelect={select} loading={loading} feedback={feedback}/>;
 return <><Dialog open fullWidth maxWidth="md" onClose={close} aria-label={label} data-testid="route-address-dialog"><DialogTitle component="div"><Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}><Typography variant="h6">{label}</Typography><SaveButton disabled={disabled||!draft.trim()||draft.length>160} onClick={()=>{onChange(draft.trim(),null);onClose();}}>{t.applyLocation}</SaveButton></Stack></DialogTitle><DialogContent><Stack spacing={1.5}><TextField autoFocus fullWidth size="small" label={t.savedAddress} placeholder={t.addressPlaceholder} value={draft} disabled={disabled} slotProps={{inputLabel:{shrink:true},htmlInput:{maxLength:160},input:{endAdornment:<InputAdornment position="end"><IconButton size="small" aria-label={t.savedAddresses} disabled={disabled||!customerId} onClick={()=>{setQuery('');setLookup(true);}}><SearchIcon fontSize="small"/></IconButton></InputAdornment>}}} onChange={ev=>setDraft(ev.target.value)}/><Stack direction="row" justifyContent="flex-end"><Button disabled={disabled||!customerId} onClick={()=>setManage(true)}>{t.presets}</Button></Stack>{!customerId&&<Alert severity="info">{t.chooseCustomer}</Alert>}</Stack></DialogContent></Dialog>
 <LookupSearchDialog open={lookup} maxWidth="md" onClose={()=>setLookup(false)} title={t.savedAddresses} query={query} onQueryChange={setQuery} languageCode={languageCode} options={rows} columns={[{key:'label',label:t.presetName,value:row=>row.label},{key:'address',label:t.savedAddress,value:row=>row.address}]} onSelect={select} loading={loading} feedback={feedback}/>
 {manage&&<ShippingPresetDialog orgId={orgId} customerId={customerId} kind="LOCATION" current={{address:draft}} languageCode={languageCode} onLoad={row=>setDraft(row.address)} onClose={()=>{setManage(false);setReload(v=>v+1);}}/>}</>;
}
