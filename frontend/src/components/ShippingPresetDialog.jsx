import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import DialogRecordActions from './DialogRecordActions';
import PageActions from './PageActions';
import SearchInput from './SearchInput';
import RecordDetails from './RecordDetails';
import GlobalNotice from "./AppNotice";
import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack,TextField} from '@mui/material';
import Alert from "./AppNotice";

import {usePageDialogs} from './PageDialogProvider';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';
import {useAppActions} from '../context/AppContext';
import ShippingAddressBook from './ShippingAddressBook';
export default function ShippingPresetDialog({orgId,customerId,kind,current,parties=[],fixedPartyId,languageCode,onLoad,onClose}){
 if(kind==='LOCATION')return <ShippingAddressBook {...{orgId,customerId,current,languageCode,onLoad,onClose}}/>;
 return <PartyPresets {...{orgId,customerId,kind,current,parties,fixedPartyId,languageCode,onLoad,onClose}}/>;
}
function PartyPresets({orgId,customerId,kind,current,parties,fixedPartyId,languageCode,onLoad,onClose}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [selectedRow,setSelectedRow]=useState(null),[query,setQuery]=useState(''),[rows,setRows]=useState([]),[label,setLabel]=useState((current?.name||current?.address||'').slice(0,200)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const content=useRef(null),lock=useRef(false),newId=useRef(crypto.randomUUID()),pending=useRef(null),live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(!busy&&!loading&&content.current&&!content.current.contains(document.activeElement))content.current.focus();},[busy,loading,rows]);
 useEffect(()=>{let active=true;setLoading(true);requestJSON('/shipping-requests/presets'+buildQueryString({orgId,customerId,kind}),{skipCache:true}).then(value=>{if(active){setRows(value);setError('');}}).catch(()=>active&&setError(t.failed)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[orgId,customerId,kind,reload]);
 const mutate=async(row,remove)=>{if(lock.current)return;if(remove&&!pending.current&&!await dialogs.confirm(t.deleteConfirm))return;lock.current=true;setBusy(true);setError('');try{
  pending.current=pending.current||{path:remove?'/'+row.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId,version:row.version}:{id:newId.current,customerId,kind,label,data:current,partyId:kind==='PARTY'?current?.id??null:null})};
  await requestJSON('/shipping-requests/presets'+pending.current.path+buildQueryString({orgId}),{method:pending.current.method,body:pending.current.body});
  pending.current=null;if(live.current){setUncertain(false);newId.current=crypto.randomUUID();setSelectedRow(null);setReload(v=>v+1);showNotification(t.saved,'success');}
 }catch(error){const unknown=!error.status||error.status>=500;if(!unknown)pending.current=null;if(live.current){setUncertain(unknown);setError(t.failed);}}finally{lock.current=false;if(live.current)setBusy(false);}};
 const visible=rows.filter(row=>(!fixedPartyId||row.partyId===fixedPartyId||row.partyId==null&&!row.data.name)&&[row.label,row.data.name,row.data.address,row.data.contactName,row.data.phone,row.data.email].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const linked=row=>row.partyId==null?null:parties.find(party=>party.id===row.partyId);
 const load=row=>{const party=linked(row);if(row.partyId!=null&&!party)return;onLoad({...((row.partyId==null&&!row.data.name)?current:party),...((row.partyId==null&&!row.data.name)?{}:{id:row.partyId??null,name:party?.name||row.data.name||''}),...Object.fromEntries(['address','contactName','phone','email'].map(key=>[key,row.data[key]||'']))});onClose();};
 return <ListDetailDialog open onClose={()=>!busy&&!uncertain&&onClose()} title={t.presets} aria-label={t.presets} contentRef={content} contentProps={{tabIndex:-1}}
  onNew={()=>setSelectedRow(null)} newLabel={t.newPreset} newDisabled={busy||uncertain}
  search={<SearchInput sx={{width:'100%'}} label={t.addressSearch} value={query} disabled={busy||uncertain||loading} onChange={event=>setQuery(event.target.value)}/>}
  list={<DialogRecordList rows={visible} selectedKey={selectedRow?.id} columns={[{key:'name',label:t.presetName,value:row=>row.label},{key:'address',label:t.savedAddress,value:row=>row.data.address}]} onSelect={setSelectedRow} disabled={busy||uncertain} loading={loading} error={!!error} onRetry={busy||uncertain?undefined:()=>setReload(v=>v+1)} languageCode={languageCode}/>}
  frameDetail detailTitle={t.presets} detail={<Stack spacing={2}>
   {error&&<Alert severity="error">{error}</Alert>}
   {selectedRow?.partyId!=null&&!linked(selectedRow)&&<GlobalNotice severity="error">{t.partyUnavailable}</GlobalNotice>}
   {!selectedRow&&<TextField fullWidth label={t.presetName} value={label} disabled={busy||uncertain} slotProps={{htmlInput:{maxLength:200}}} onChange={event=>{setLabel(event.target.value);newId.current=crypto.randomUUID();}}/>}
   <RecordDetails framed={false} fields={['name','address','contactName','phone','email'].map(key=>({key,label:({name:t.partyName,address:t.savedAddress,contactName:t.addressContact,phone:t.addressPhone,email:'Email'})[key],value:selectedRow?key==='name'?linked(selectedRow)?.name||selectedRow.data.name:selectedRow.data[key]:current?.[key]}))}/>
  </Stack>}
  detailFooter={<DialogRecordActions onDelete={selectedRow?()=>mutate(selectedRow,true):undefined} deleteLabel={t.deletePreset} deleteDisabled={busy||uncertain} busy={busy} onSave={uncertain||!selectedRow?()=>mutate(null,false):undefined} saveLabel={uncertain?t.retry:t.savePreset} saveDisabled={!uncertain&&(loading||!!error||!label.trim()||!current?.name?.trim())}/>}
  actions={<PageActions secondary={<Button disabled={busy||uncertain} onClick={onClose}>{t.close}</Button>} primary={<Button variant="contained" disabled={busy||uncertain||loading||!!error||!selectedRow||(selectedRow.partyId!=null?!linked(selectedRow):!selectedRow.data.name?.trim()&&!current?.name?.trim())} onClick={()=>load(selectedRow)}>{t.loadPreset}</Button>}/>}/>
 ;
}
