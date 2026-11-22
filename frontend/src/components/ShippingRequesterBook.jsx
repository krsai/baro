import {shippingEnglishValid,shippingEnglishText} from '../utils/shippingEnglish.mjs';
import EntityCountryPhoneFields from './EntityCountryPhoneFields';
import {splitEntityPhone} from '../utils/entityPhone.mjs';
import {displayEntityPhone} from '../utils/entityPhone.mjs';
import EntityCountryField from './EntityCountryField';
import EntityPhoneField from './EntityPhoneField';
import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import DialogRecordActions from './DialogRecordActions';
import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack,TextField} from '@mui/material';
import Alert from './AppNotice';
import PageActions from './PageActions';
import SearchInput from './SearchInput';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';

const draft=row=>({id:row?.id||crypto.randomUUID(),version:row?.version,name:row?.data?.name||row?.name||'',phone:row?.data?.phone||row?.phone||'',address:row?.data?.address||row?.address||'',country:row?.data?.country||row?.country||''});
export default function ShippingRequesterBook({orgId,customerId,resolveCustomer,current,languageCode,onSelect,onClose,disabled=false,initialQuery=''}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [scopeId,setScopeId]=useState(customerId),[rows,setRows]=useState([]),[edit,setEdit]=useState(()=>draft(current)),[query,setQuery]=useState(initialQuery),[loading,setLoading]=useState(!!customerId),[readError,setReadError]=useState(false),[saveError,setSaveError]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[reload,setReload]=useState(0);
 const baseline=useRef(JSON.stringify(edit)),pending=useRef(null),lock=useRef(false),alive=useRef(true);
 const dirty=JSON.stringify(edit)!==baseline.current,blocked=disabled||busy||uncertain;
 const englishValid=shippingEnglishValid(edit,JSON.parse(baseline.current));
 const valid=englishValid&&!!edit.name.trim()&&edit.name.length<=200&&/^\d{1,80}$/.test(edit.phone)&&edit.address.length<=1000;
 const visible=rows.filter(row=>[row.data.name,row.data.country,displayEntityPhone(row.data.phone,row.data.country),row.data.phone,row.data.address].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  if(!scopeId)return;
  let live=true;setLoading(true);setReadError(false);setRows([]);
  requestJSON('/shipping-requests/presets'+buildQueryString({orgId,customerId:scopeId,kind:'REQUESTER'}),{skipCache:true}).then(value=>{if(live)setRows(value);}).catch(()=>{if(live)setReadError(true);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[orgId,scopeId,reload]);
 const leave=async()=>!blocked&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'}));
 const open=async row=>{if(!await leave())return;const next=draft(row);baseline.current=JSON.stringify(next);setEdit(next);setSaveError(false);};
 const mutate=async(remove=false)=>{
  if(lock.current||disabled)return;
  if(remove&&!pending.current&&!await dialogs.confirm(t.deleteConfirm))return;
  lock.current=true;setBusy(true);setSaveError(false);
  try{
   const id=scopeId||await resolveCustomer();if(!scopeId)setScopeId(id);
   pending.current=pending.current||{remove,path:remove?'/'+edit.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId:id,version:edit.version}:{id:edit.id,version:edit.version,customerId:id,kind:'REQUESTER',label:edit.name.trim(),data:{name:edit.name.trim(),phone:edit.phone,address:edit.address.trim(),...(edit.country?{country:edit.country}:{})}})};
   const work=pending.current,saved=await requestJSON('/shipping-requests/presets'+work.path+buildQueryString({orgId}),{method:work.method,body:work.body});pending.current=null;
   if(alive.current){const next=work.remove?draft():draft(saved);baseline.current=JSON.stringify(next);setEdit(next);setUncertain(false);setReload(v=>v+1);showNotification(t.saved,'success');}
  }catch(error){const unknown=!error.status||error.status>=500;if(!unknown)pending.current=null;if(alive.current){setUncertain(unknown);setSaveError(true);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 return <ListDetailDialog open onClose={async()=>{if(await leave())onClose();}} aria-label={t.requesterBook} data-testid="shipping-requester-book" title={t.requesterBook}
  onNew={()=>open()} newLabel={t.newRequester} newDisabled={blocked}
  search={<SearchInput sx={{width:'100%'}} placeholder={t.requesterSearch} inputProps={{'aria-label':t.requesterSearch}} value={query} disabled={blocked} onChange={event=>setQuery(event.target.value)}/>}
  list={<DialogRecordList rows={visible} columns={[{key:'name',label:t.requesterName,value:row=>row.data.name},{key:'country',label:t.country,width:64,value:row=>row.data.country},{key:'phone',label:t.requesterPhone,value:row=>displayEntityPhone(row.data.phone,row.data.country)}]} selectedKey={edit.id} onSelect={open} previewDisabled={dirty} disabled={blocked} loading={loading} error={readError} onRetry={blocked?undefined:()=>setReload(v=>v+1)} languageCode={languageCode}/>}
  frameDetail detailTitle={t.requesterDetails} detail={<Stack spacing={2}>
   {!englishValid&&<Alert severity="error">{shippingEnglishText[languageCode]||shippingEnglishText.en}</Alert>}
   {saveError&&<Alert severity="error">{t.failed}</Alert>}
   <TextField fullWidth required label={t.requesterName} value={edit.name} disabled={blocked} slotProps={{htmlInput:{maxLength:200}}} onChange={event=>setEdit(v=>({...v,name:event.target.value}))}/>
   <EntityCountryPhoneFields countryField={<EntityCountryField label={t.country} languageCode={languageCode} value={edit.country} disabled={blocked} onChange={country=>setEdit(v=>({...v,country,phone:v.phone.startsWith('+')?splitEntityPhone(v.phone,v.country).local.replace(/\D/g,''):v.phone}))}/>} phoneField={
   <EntityPhoneField languageCode={languageCode} digitsOnly localValue country={edit.country} fullWidth required label={t.requesterPhone} value={edit.phone} disabled={blocked} slotProps={{htmlInput:{maxLength:80,inputMode:'numeric',pattern:'[0-9]*'}}} onChange={event=>setEdit(v=>({...v,phone:event.target.value.replace(/\D/g,'')}))}/>}/>
   <TextField fullWidth label={t.savedAddress} value={edit.address} disabled={blocked} slotProps={{htmlInput:{maxLength:1000}}} onChange={event=>setEdit(v=>({...v,address:event.target.value}))}/>
  </Stack>}
  detailFooter={<DialogRecordActions onDelete={edit.version!=null?()=>mutate(true):undefined} deleteLabel={t.deletePreset} deleteDisabled={blocked} busy={busy} onSave={()=>mutate()} saveLabel={uncertain?t.retry:edit.version?t.savePreset:t.addRequester} saveDisabled={disabled||!uncertain&&(!valid||loading||readError||!!edit.version&&!dirty)}/>}
  actions={<PageActions secondary={<Button disabled={blocked} onClick={async()=>{if(await leave())onClose();}}>{t.close}</Button>} primary={<Button variant="contained" disabled={blocked||!valid||!edit.version||dirty||loading||readError} onClick={()=>{onSelect({name:edit.name,phone:edit.phone,address:edit.address,country:edit.country});onClose();}}>{t.loadPreset}</Button>}/>}/>;
}
