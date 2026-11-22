import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import DialogRecordActions from './DialogRecordActions';
import PageActions from './PageActions';
import SearchInput from './SearchInput';
import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack} from '@mui/material';
import Alert from "./AppNotice";
import ShippingAddressFields,{addressValue} from './ShippingAddressFields';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import {shippingEditorText} from '../constants/shippingEditor';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

const record=row=>({id:row.id,version:row.version,...addressValue({...row.data,label:row.label})});
export default function ShippingAddressBook({orgId,customerId,current,registeredParty,languageCode,onLoad,onClose,title,personLabel,resolveCustomer,locationLookup,disabled=false,testId='shipping-address-book'}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [initial]=useState(()=>({id:crypto.randomUUID(),...addressValue(current)}));
 const [scopeCustomerId,setScopeCustomerId]=useState(customerId),[rows,setRows]=useState([]),[edit,setEdit]=useState(initial),[query,setQuery]=useState(''),[loading,setLoading]=useState(!!customerId),[busy,setBusy]=useState(false),[readError,setReadError]=useState(false),[saveError,setSaveError]=useState(false),[uncertain,setUncertain]=useState(false),[reload,setReload]=useState(0);
 const baseline=useRef(JSON.stringify(initial)),pending=useRef(null),lock=useRef(false),alive=useRef(true),content=useRef(null);
 const blocked=disabled||busy||uncertain,dirty=JSON.stringify(edit)!==baseline.current,addressValid=!!edit.address.trim()&&edit.address.length<=160&&(!personLabel||!!edit.label.trim());
 const url='/shipping-requests/presets'+buildQueryString({orgId,customerId:scopeCustomerId,kind:'LOCATION'});
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!busy&&!loading&&content.current&&!content.current.contains(document.activeElement))content.current.focus();},[busy,loading,rows]);
 useEffect(()=>{
  if(!scopeCustomerId)return;
  let live=true;setLoading(true);setReadError(false);
  requestJSON(url,{skipCache:true}).then(value=>{if(live)setRows(value);}).catch(()=>live&&setReadError(true)).finally(()=>live&&setLoading(false));
  return()=>{live=false;};
 },[url,reload,scopeCustomerId]);
 const leave=async()=>!blocked&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'}));
 const open=async row=>{
  if(!await leave())return;
  const next=row?.registered?{id:crypto.randomUUID(),...addressValue({...row.data,label:row.label})}:row?record(row):{id:crypto.randomUUID(),...addressValue()};
  baseline.current=JSON.stringify(next);setEdit(next);setSaveError(false);
 };
 const mutate=async(remove=false)=>{
  if(lock.current||disabled)return;
  if(remove&&!pending.current&&!await dialogs.confirm(t.deleteConfirm))return;
  lock.current=true;setBusy(true);setSaveError(false);
  try{
   const resolvedId=scopeCustomerId||await resolveCustomer?.();if(!resolvedId)throw new Error('SHIPPING_CUSTOMER_REQUIRED');if(!scopeCustomerId)setScopeCustomerId(resolvedId);
   pending.current=pending.current||{remove,path:remove?'/'+edit.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId:resolvedId,version:edit.version}:{id:edit.id,version:edit.version,customerId:resolvedId,kind:'LOCATION',label:edit.label,data:{address:edit.address,contactName:edit.contactName,phone:edit.phone,...(edit.country?{country:edit.country}:{})}})};
   const work=pending.current;
   const saved=await requestJSON('/shipping-requests/presets'+work.path+buildQueryString({orgId}),{method:work.method,body:work.body});
   pending.current=null;
   if(alive.current){
    const next=work.remove?{id:crypto.randomUUID(),...addressValue(edit)}:record(saved);
    baseline.current=JSON.stringify(next);setEdit(next);setUncertain(false);setReload(v=>v+1);showNotification(t.saved,'success');
   }
  }catch(e){const unknown=!e.status||e.status>=500;if(!unknown)pending.current=null;if(alive.current){setUncertain(unknown);setSaveError(true);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 const registered=registeredParty?.address?.trim()?{id:'registered-party',label:registeredParty.name,data:addressValue({...registeredParty,label:registeredParty.name}),registered:true}:null;
 const filtered=[...(registered?[registered]:[]),...rows].filter(row=>[row.label,row.data.country,row.data.address,row.data.contactName,row.data.phone].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const apply=()=>{onLoad(addressValue(edit));onClose();};
 return <ListDetailDialog open onClose={async()=>{if(await leave())onClose();}} data-testid={testId} aria-label={title||t.savedAddresses} title={title||t.savedAddresses} contentRef={content} contentProps={{tabIndex:-1}}
  onNew={()=>open()} newLabel={t.newAddress} newDisabled={blocked}
  tools={<>{!scopeCustomerId&&!resolveCustomer&&<Alert severity="info">{t.chooseCustomer}</Alert>}{locationLookup?.(place=>setEdit({id:crypto.randomUUID(),label:place,address:place,contactName:'',phone:''}),blocked)}</>}
  search={<SearchInput sx={{width:'100%'}} label={t.addressSearch} autoComplete="off" value={query} disabled={blocked||!scopeCustomerId&&!resolveCustomer} onChange={event=>setQuery(event.target.value)}/>}
  layoutProps={{'data-address-workspace':true}} listProps={{'data-address-list':true}} detailProps={{'data-address-detail':true}}
  list={<DialogRecordList rows={filtered} columns={[{key:'name',label:personLabel||t.addressTitle,value:row=>row.label,width:'40%'},{key:'address',label:t.savedAddress,value:row=>row.data.address}]} selectedKey={edit.version!=null?edit.id:null} onSelect={open} disabled={blocked} loading={loading} error={readError} loaded={!!scopeCustomerId||!!resolveCustomer} onRetry={blocked?undefined:()=>setReload(v=>v+1)} languageCode={languageCode}/>}
  frameDetail detailTitle={t.addressHeading} detail={<Stack spacing={2}>
   {edit.address.length>160&&<Alert severity="error">{t.routeAddressTooLong}</Alert>}
   {saveError&&<Alert severity="error">{t.failed}</Alert>}
   <ShippingAddressFields value={edit} onChange={setEdit} t={t} languageCode={languageCode} disabled={blocked} autoFocus personLabel={personLabel}/>
  </Stack>}
  detailFooter={<DialogRecordActions onDelete={edit.version!=null?()=>mutate(true):undefined} deleteLabel={t.deleteAddress} deleteDisabled={blocked} busy={busy} onSave={()=>mutate()} saveLabel={uncertain?t.retry:edit.version?t.saveAddress:t.addToAddressBook} saveDisabled={disabled||!uncertain&&(!scopeCustomerId&&!resolveCustomer||loading||readError||!edit.label.trim()||!addressValid||!!edit.version&&!dirty)}/>}
  actions={<PageActions secondary={<Button disabled={blocked} onClick={async()=>{if(await leave())onClose();}}>{t.close}</Button>} primary={<Button variant="contained" disabled={blocked||!addressValid} onClick={apply}>{t.applyLocation}</Button>}/>}/>
 ;
}
