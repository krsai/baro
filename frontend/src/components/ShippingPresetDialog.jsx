import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import DialogRecordActions from './DialogRecordActions';
import PageActions from './PageActions';
import SearchInput from './SearchInput';
import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack,TextField} from '@mui/material';
import Alert from './AppNotice';
import {usePageDialogs} from './PageDialogProvider';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';
import {useAppActions} from '../context/AppContext';
import ShippingAddressBook from './ShippingAddressBook';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

const fields=['name','address','contactName','phone','email'];
const draft=value=>({partyId:value?.id??null,...Object.fromEntries(fields.map(key=>[key,value?.[key]||'']))});
export default function ShippingPresetDialog(props){
 if(props.kind==='LOCATION')return <ShippingAddressBook {...props}/>;
 return <PartyPresets {...props}/>;
}
function PartyPresets({orgId,customerId,current,parties=[],fixedPartyId,languageCode,onLoad,onClose,title}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [edit,setEdit]=useState(()=>({id:crypto.randomUUID(),...draft(current)})),[query,setQuery]=useState(''),[rows,setRows]=useState([]),[error,setError]=useState(false),[saveError,setSaveError]=useState(false),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const baseline=useRef(JSON.stringify(edit)),lock=useRef(false),pending=useRef(null),live=useRef(true);
 const blocked=busy||uncertain,dirty=JSON.stringify(edit)!==baseline.current,valid=!!edit.name.trim();
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;setLoading(true);setError(false);requestJSON('/shipping-requests/presets'+buildQueryString({orgId,customerId,kind:'PARTY'}),{skipCache:true}).then(value=>{if(active)setRows(value);}).catch(()=>active&&setError(true)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[orgId,customerId,reload]);
 const leave=async()=>!blocked&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'}));
 const toEdit=row=>({id:row.id,version:row.version,partyId:row.partyId??null,...Object.fromEntries(fields.map(key=>[key,key==='name'?(row.partyId!=null?parties.find(p=>p.id===row.partyId)?.name||'':row.data.name||''):row.data[key]||'']))});
 const open=async row=>{if(!await leave())return;const next=row?toEdit(row):{id:crypto.randomUUID(),...draft(fixedPartyId?parties.find(p=>p.id===fixedPartyId):null)};baseline.current=JSON.stringify(next);setEdit(next);setSaveError(false);};
 const mutate=async(remove=false)=>{if(lock.current)return;if(remove&&!pending.current&&!await dialogs.confirm(t.deleteConfirm))return;lock.current=true;setBusy(true);setSaveError(false);try{
  pending.current=pending.current||{remove,path:remove?'/'+edit.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId,version:edit.version}:{id:edit.id,version:edit.version,customerId,kind:'PARTY',label:edit.name,partyId:edit.partyId,data:Object.fromEntries(fields.map(key=>[key,edit[key]]))})};
  const work=pending.current;const saved=await requestJSON('/shipping-requests/presets'+pending.current.path+buildQueryString({orgId}),{method:pending.current.method,body:pending.current.body});
  const next=work.remove?{...edit,id:crypto.randomUUID(),version:undefined}:toEdit(saved);pending.current=null;if(live.current){baseline.current=JSON.stringify(next);setEdit(next);setUncertain(false);setReload(v=>v+1);showNotification(t.saved,'success');}
 }catch(error){const unknown=!error.status||error.status>=500;if(!unknown)pending.current=null;if(live.current){setUncertain(unknown);setSaveError(true);}}finally{lock.current=false;if(live.current)setBusy(false);}};
 const visible=rows.filter(row=>(!fixedPartyId||row.partyId===fixedPartyId)&&[row.label,...Object.values(row.data)].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const labels={name:t.partyName,address:t.savedAddress,contactName:t.addressContact,phone:t.addressPhone,email:'Email'};
 return <ListDetailDialog open data-testid="shipping-party-book" onClose={async()=>{if(await leave())onClose();}} title={title||t.presets} aria-label={title||t.presets}
  onNew={()=>open()} newLabel={t.newPreset} newDisabled={blocked||loading}
  search={<SearchInput sx={{width:'100%'}} label={t.addressSearch} value={query} disabled={blocked||loading} onChange={event=>setQuery(event.target.value)}/>}
  list={<DialogRecordList rows={visible} selectedKey={edit.version?edit.id:null} columns={[{key:'name',label:t.partyName,value:row=>row.label},{key:'address',label:t.savedAddress,value:row=>row.data.address}]} onSelect={open} disabled={blocked} loading={loading} error={error} onRetry={blocked?undefined:()=>setReload(v=>v+1)} languageCode={languageCode}/>}
  frameDetail detailTitle={title||t.presets} detail={<Stack spacing={2}>
   {saveError&&<Alert severity="error">{t.failed}</Alert>}
   {fields.map(key=><TextField key={key} fullWidth label={labels[key]} required={key==='name'} value={edit[key]} disabled={blocked||key==='name'&&edit.partyId!=null} slotProps={{htmlInput:{maxLength:key==='name'?200:key==='address'?1000:320,...(key==='phone'?{inputMode:'numeric',pattern:'[0-9]*'}:{})}}} onChange={event=>setEdit({...edit,[key]:key==='phone'?event.target.value.replace(/\D/g,''):event.target.value})}/>)}
  </Stack>}
  detailFooter={<DialogRecordActions onDelete={edit.version?()=>mutate(true):undefined} deleteLabel={t.deletePreset} busy={busy} deleteDisabled={blocked} onSave={()=>mutate()} saveLabel={uncertain?t.retry:t.savePreset} saveDisabled={!uncertain&&(loading||error||!valid||!!edit.version&&!dirty)}/>}
  actions={<PageActions secondary={<Button disabled={blocked} onClick={async()=>{if(await leave())onClose();}}>{t.close}</Button>} primary={<Button variant="contained" disabled={blocked||!valid} onClick={()=>{onLoad({id:edit.partyId,...Object.fromEntries(fields.map(key=>[key,edit[key]]))});onClose();}}>{t.loadPreset}</Button>}/>}/>;
}
