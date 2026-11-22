import {shippingEnglishValid,shippingEnglishText} from '../utils/shippingEnglish.mjs';
import {shippingPartyChoices,shippingPartySourceText} from '../utils/shippingParties.mjs';
import EntityCountryPhoneFields from './EntityCountryPhoneFields';
import {splitEntityPhone} from '../utils/entityPhone.mjs';
import EntityCountryField from './EntityCountryField';
import EntityPhoneField from './EntityPhoneField';
﻿import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import DialogRecordActions from './DialogRecordActions';
import PageActions from './PageActions';
import SearchInput from './SearchInput';
import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack,TextField,Typography} from '@mui/material';
import Alert from './AppNotice';
import {usePageDialogs} from './PageDialogProvider';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';
import {useAppActions} from '../context/AppContext';
import ShippingAddressBook from './ShippingAddressBook';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

const fields=['name','address','contactName','phone','email'];
const draft=value=>({partyId:value?.id??null,directoryParty:!!value?.directoryParty,country:value?.country||'',...Object.fromEntries(fields.map(key=>[key,value?.[key]||'']))});
export default function ShippingPresetDialog(props){
 if(props.kind==='LOCATION')return <ShippingAddressBook {...props}/>;
 return <PartyPresets {...props}/>;
}
function PartyPresets({orgId,customerId,current,parties=[],fixedPartyId,excludedParty,languageCode,onLoad,onClose,title,initialQuery=''}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [edit,setEdit]=useState(()=>({id:crypto.randomUUID(),...draft(current)})),[query,setQuery]=useState(initialQuery),[rows,setRows]=useState([]),[error,setError]=useState(false),[saveError,setSaveError]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const [historyLoading,setHistoryLoading]=useState(!fixedPartyId);
 const [recent,setRecent]=useState([]),[found,setFound]=useState([]),[directoryError,setDirectoryError]=useState(false),[directoryLoading,setDirectoryLoading]=useState(false),[directoryReload,setDirectoryReload]=useState(0);
 const choices=[...parties.map(row=>recent.some(previous=>previous.id===row.id)?{...row,recentShippingParty:true}:row),...recent,...found,...(current?.id?[current]:[])].filter((row,index,all)=>all.findIndex(other=>other.id===row.id)===index).sort((a,b)=>Number(!!b.recentShippingParty)-Number(!!a.recentShippingParty));
 const baseline=useRef(JSON.stringify(edit)),lock=useRef(false),pending=useRef(null),live=useRef(true);
 const blocked=busy||uncertain,dirty=JSON.stringify(edit)!==baseline.current,englishValid=shippingEnglishValid(edit,JSON.parse(baseline.current)),valid=!!edit.name.trim()&&englishValid;
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;setLoading(true);setError(false);requestJSON('/shipping-requests/presets'+buildQueryString({orgId,customerId,kind:'PARTY'}),{skipCache:true}).then(value=>{if(active)setRows(value);}).catch(()=>active&&setError(true)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[orgId,customerId,reload]);
 useEffect(()=>{if(fixedPartyId)return;let active=true;setHistoryLoading(true);setRecent([]);requestJSON('/shipping-requests/parties'+buildQueryString({orgId,customerId}),{skipCache:true}).then(value=>{if(active)setRecent(value);}).catch(()=>{if(active)setDirectoryError(true);}).finally(()=>{if(active)setHistoryLoading(false);});return()=>{active=false;};},[orgId,customerId,fixedPartyId,directoryReload]);
 useEffect(()=>{let active=true;setFound([]);setDirectoryError(false);setDirectoryLoading(false);if(fixedPartyId||query.trim().length<2)return;setDirectoryLoading(true);const timer=setTimeout(()=>requestJSON('/shipping-requests/parties'+buildQueryString({orgId,customerId,query:query.trim()}),{skipCache:true}).then(value=>{if(active)setFound(value);}).catch(()=>{if(active)setDirectoryError(true);}).finally(()=>{if(active)setDirectoryLoading(false);}),300);return()=>{active=false;clearTimeout(timer);};},[orgId,customerId,query,fixedPartyId,directoryReload]);
 const leave=async()=>!blocked&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'}));
 const toEdit=row=>({id:row.registered?crypto.randomUUID():row.id,selectionKey:row.id,version:row.registered?undefined:row.version,partyId:row.partyId??null,directoryParty:!!row.directoryParty,businessNumber:row.businessNumber||'',country:row.data.country||'',...Object.fromEntries(fields.map(key=>[key,key==='name'?(row.partyId!=null?choices.find(p=>p.id===row.partyId)?.name||'':row.data.name||''):row.data[key]||'']))});
 const open=async row=>{if(!await leave())return;const next=row?toEdit(row):{id:crypto.randomUUID(),...draft(fixedPartyId?parties.find(p=>p.id===fixedPartyId):null)};baseline.current=JSON.stringify(next);setEdit(next);setSaveError(false);};
 const mutate=async(remove=false)=>{if(lock.current)return;if(remove&&!pending.current&&!await dialogs.confirm(t.deleteConfirm))return;lock.current=true;setBusy(true);setSaveError(false);try{
  pending.current=pending.current||{remove,path:remove?'/'+edit.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId,version:edit.version}:{id:edit.id,version:edit.version,customerId,kind:'PARTY',label:edit.name,partyId:edit.partyId,data:{...Object.fromEntries(fields.map(key=>[key,edit[key]])),...(edit.country?{country:edit.country}:{})}})};
  const work=pending.current;const saved=await requestJSON('/shipping-requests/presets'+pending.current.path+buildQueryString({orgId}),{method:pending.current.method,body:pending.current.body});
  const next=work.remove?{...edit,id:crypto.randomUUID(),version:undefined}:toEdit(saved);pending.current=null;if(live.current){baseline.current=JSON.stringify(next);setEdit(next);setUncertain(false);setReload(v=>v+1);showNotification(t.saved,'success');}
 }catch(error){const unknown=!error.status||error.status>=500;if(!unknown)pending.current=null;if(live.current){setUncertain(unknown);setSaveError(true);}}finally{lock.current=false;if(live.current)setBusy(false);}};
 const source=shippingPartySourceText[languageCode]||shippingPartySourceText.en;
 const visible=shippingPartyChoices(choices,rows,{fixedPartyId,excludedParty}).filter(row=>[row.label,row.businessNumber,row.country,...(row.searchNames||[]),...Object.values(row.data)].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())||!!query.trim().replace(/[^a-z0-9]/gi,'')&&row.businessNumber?.replace(/[^a-z0-9]/gi,'').toLowerCase().includes(query.trim().replace(/[^a-z0-9]/gi,'').toLowerCase()));
 const labels={name:t.partyName,address:t.savedAddress,contactName:t.addressContact,phone:t.addressPhone,email:'Email'};
 return <ListDetailDialog open data-testid="shipping-party-book" onClose={async()=>{if(await leave())onClose();}} title={title||t.presets} aria-label={title||t.presets}
  onNew={()=>open()} newLabel={t.newPreset} newDisabled={blocked||loading}
  search={<SearchInput sx={{width:'100%'}} label={source.search} value={query} disabled={blocked||loading} onChange={event=>setQuery(event.target.value)}/>}
  list={<DialogRecordList rows={visible} selectedKey={edit.selectionKey||null} columns={[{key:'name',label:t.partyName,width:'32%',value:row=><Stack sx={{alignItems:'flex-start',minWidth:0,maxWidth:'100%'}}><span data-truncate-text title={row.label}>{row.label}</span><Typography variant="caption" color="text.secondary">{row.recentShippingParty?source.recent:row.directoryParty?source.directory:row.registered?source.registered:source.saved}</Typography></Stack>},{key:'businessNumber',label:source.businessNumber,width:'26%',value:row=>row.businessNumber},{key:'country',label:t.country,width:64,value:row=>row.country},{key:'address',label:t.savedAddress,value:row=><span data-truncate-text title={row.data.address}>{row.data.address}</span>}]} onSelect={open} previewDisabled={dirty} disabled={blocked} loading={loading||historyLoading||directoryLoading} error={error||directoryError} onRetry={blocked?undefined:()=>{setReload(v=>v+1);setDirectoryReload(v=>v+1);}} languageCode={languageCode}/>}
  frameDetail detailTitle={title||t.presets} detail={<Stack spacing={2}>
   {edit.businessNumber&&<TextField fullWidth label={source.businessNumber} value={edit.businessNumber} InputProps={{readOnly:true}}/>}
    {!englishValid&&<Alert severity="error">{shippingEnglishText[languageCode]||shippingEnglishText.en}</Alert>}
   {saveError&&<Alert severity="error">{t.failed}</Alert>}
   <TextField fullWidth label={labels.name} required value={edit.name} disabled={blocked||edit.partyId!=null} slotProps={{htmlInput:{maxLength:200}}} onChange={event=>setEdit({...edit,name:event.target.value})}/>
   <EntityCountryPhoneFields countryField={<EntityCountryField label={t.country} languageCode={languageCode} value={edit.country} disabled={blocked} onChange={country=>setEdit({...edit,country,phone:edit.phone.startsWith('+')?splitEntityPhone(edit.phone,edit.country).local.replace(/\D/g,''):edit.phone})}/>} phoneField={<EntityPhoneField languageCode={languageCode} country={edit.country} digitsOnly localValue fullWidth label={labels.phone} value={edit.phone} disabled={blocked} slotProps={{htmlInput:{maxLength:320,inputMode:'numeric',pattern:'[0-9]*'}}} onChange={event=>setEdit({...edit,phone:event.target.value.replace(/\D/g,'')})}/>}/>
   {['address','contactName','email'].map(key=><TextField key={key} fullWidth label={labels[key]} value={edit[key]} disabled={blocked} slotProps={{htmlInput:{maxLength:key==='address'?1000:320}}} onChange={event=>setEdit({...edit,[key]:event.target.value})}/>)}

  </Stack>}
  detailFooter={!edit.directoryParty&&<DialogRecordActions onDelete={edit.version?()=>mutate(true):undefined} deleteLabel={t.deletePreset} busy={busy} deleteDisabled={blocked} onSave={()=>mutate()} saveLabel={uncertain?t.retry:t.savePreset} saveDisabled={!uncertain&&(loading||error||!valid||!!edit.version&&!dirty)}/>}
  actions={<PageActions secondary={<Button disabled={blocked} onClick={async()=>{if(await leave())onClose();}}>{t.close}</Button>} primary={<Button variant="contained" disabled={blocked||loading||error||!valid} onClick={()=>{onLoad({id:edit.partyId,directoryParty:edit.directoryParty,...(edit.country?{country:edit.country}:{}),...Object.fromEntries(fields.map(key=>[key,edit[key]]))});onClose();}}>{t.loadPreset}</Button>}/>}/>;
}
