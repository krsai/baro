import React,{useEffect,useState} from 'react';
import {Alert,Button,Stack,ToggleButton,ToggleButtonGroup,Typography} from '@mui/material';
import LookupInput from './LookupInput';
import LookupSearchDialog from './LookupSearchDialog';
import ShippingPresetDialog from './ShippingPresetDialog';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {normalizeLookupText} from '../utils/expenseLookup.mjs';
import {shippingEditorText} from '../constants/shippingEditor';
import {hasWorkspaceDataTopic,subscribeWorkspaceDataChanged,WORKSPACE_DATA_TOPICS} from '../utils/workspaceDataEvents';
import {useRequestScopeContext} from '../context/RequestScopeContext';

export default function ShippingLocationField({label,value,portCode,onChange,orgId,customerId,allowPorts,languageCode,disabled}){
 const {active:pageActive}=useRequestScopeContext();
 const t=shippingEditorText[languageCode]||shippingEditorText.en;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[draftQuery,setDraftQuery]=useState(portCode||value||''),[source,setSource]=useState(allowPorts?'PORT':'SAVED'),[manage,setManage]=useState(false),[reload,setReload]=useState(0);
 const [ports,setPorts]=useState([]),[saved,setSaved]=useState([]),[portError,setPortError]=useState(false),[savedError,setSavedError]=useState(false),[loadingPorts,setLoadingPorts]=useState(false),[loadingSaved,setLoadingSaved]=useState(false),[hasMore,setHasMore]=useState(false);
 useEffect(()=>{const refresh=()=>{if(pageActive&&!disabled&&document.visibilityState==='visible'){setPorts([]);if(open)setReload(v=>v+1);}};window.addEventListener('focus',refresh);const unsubscribe=subscribeWorkspaceDataChanged(detail=>{if(hasWorkspaceDataTopic(detail,WORKSPACE_DATA_TOPICS.SHIPPING_PORTS))refresh();});return()=>{window.removeEventListener('focus',refresh);unsubscribe();};},[open,disabled,pageActive]);
 useEffect(()=>{setSource(allowPorts?'PORT':'SAVED');setPorts([]);setPortError(false);},[allowPorts]);
 useEffect(()=>{let active=true;setSaved([]);setSavedError(false);if(!customerId){setLoadingSaved(false);return;}setLoadingSaved(true);
  requestJSON('/shipping-requests/presets'+buildQueryString({orgId,customerId,kind:'LOCATION'}),{skipCache:true}).then(rows=>{if(active)setSaved(rows.map(row=>({id:row.id,source:'SAVED',label:row.label,address:row.data.address,code:''})));}).catch(()=>active&&setSavedError(true)).finally(()=>active&&setLoadingSaved(false));return()=>{active=false;};
 },[orgId,customerId,reload]);
 const search=open?query:draftQuery;
 useEffect(()=>{let active=true;if(!allowPorts)return;setLoadingPorts(true);setPortError(false);setPorts([]);const timer=setTimeout(()=>{
  requestJSON('/shipping-requests/ports'+buildQueryString({orgId,q:search}),{skipCache:true}).then(result=>{if(active){setPorts(result.rows.map(row=>({...row,id:row.code,source:'PORT',label:row.name,address:`${row.name} (${row.code})`})));setHasMore(result.hasMore);}}).catch(()=>active&&setPortError(true)).finally(()=>active&&setLoadingPorts(false));
 },180);return()=>{active=false;clearTimeout(timer);};},[orgId,allowPorts,search,reload,open]);
 const matches=(row,text)=>normalizeLookupText([row.label,row.address,row.code,row.country].join(' ')).includes(normalizeLookupText(text));
 const options=[...saved,...ports],selected=portCode?{id:portCode,label:value,address:value,code:portCode}:saved.find(row=>row.address===value)||null;
 const choose=row=>{if(!row)return;onChange(row.address,row.source==='PORT'?row.code:null);setDraftQuery(row.source==='PORT'?row.code:row.address);setOpen(false);};
 const error=source==='PORT'?portError:savedError,loading=source==='PORT'?loadingPorts:loadingSaved;
 return <><LookupInput label={label} value={selected} inputValue={value||''} onInputChange={(_event,text,reason)=>{if(reason==='input'){onChange(text,null);setDraftQuery(text);}}} options={options} getLabel={row=>row.address} getCode={row=>row.code} getValues={row=>[row.label,row.address,row.code]} onChange={row=>row&&choose(row)} disabled={disabled} textFieldProps={{inputProps:{maxLength:160}}} onSearch={text=>{setQuery(portCode||text);setOpen(true);}}/>
 <LookupSearchDialog open={open} maxWidth="sm" onClose={()=>!manage&&setOpen(false)} title={label+' · '+t.locationSearch} query={query} onQueryChange={setQuery} languageCode={languageCode} options={source==='PORT'?ports:saved} filterOptions={(rows,text)=>source==='PORT'?rows:rows.filter(row=>matches(row,text))} columns={source==='PORT'?[{key:'code',label:t.portCode,value:row=>row.code,width:85},{key:'name',label:t.portName,value:row=>row.name},{key:'country',label:t.country,value:row=>row.country,width:60}]:[{key:'label',label:t.presetName,value:row=>row.label},{key:'address',label:t.savedAddress,value:row=>row.address}]} onSelect={choose} loading={loading} feedback={error?<Alert severity="error" action={<Button onClick={()=>setReload(v=>v+1)}>{t.retry}</Button>}>{t.failed}</Alert>:loading?t.loading:undefined} searchTools={<Stack spacing={1}><Stack direction="row" gap={1} alignItems="center" justifyContent="space-between"><ToggleButtonGroup exclusive size="small" value={source} onChange={(_,next)=>next&&setSource(next)}>{allowPorts&&<ToggleButton value="PORT">{t.ports}</ToggleButton>}<ToggleButton value="SAVED">{t.savedAddresses}</ToggleButton></ToggleButtonGroup><Button disabled={!customerId} onClick={()=>setManage(true)}>{t.presets}</Button></Stack>{source==='PORT'&&<Typography variant="caption" color="text.secondary">{t.portSource}{hasMore?' '+t.refineSearch:''}</Typography>}{source==='SAVED'&&!customerId&&<Typography color="text.secondary">{t.chooseCustomer}</Typography>}</Stack>}/>
 {manage&&<ShippingPresetDialog orgId={orgId} customerId={customerId} kind="LOCATION" current={{address:value||''}} languageCode={languageCode} onLoad={row=>{onChange(row.address,null);setDraftQuery(row.address);setOpen(false);}} onClose={()=>{setManage(false);setReload(v=>v+1);}}/>}
 </>;
}
