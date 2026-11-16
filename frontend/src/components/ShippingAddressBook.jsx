import React,{useEffect,useRef,useState} from 'react';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import {Box,Button,Dialog,DialogContent,DialogTitle,List,ListItemButton,Stack,TextField,Typography} from '@mui/material';
import Alert from "./AppNotice";
import SaveButton from './SaveButton';
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
 const leave=async()=>!blocked&&(!dirty||await dialogs.confirm(t.discard));
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
   pending.current=pending.current||{remove,path:remove?'/'+edit.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId:resolvedId,version:edit.version}:{id:edit.id,version:edit.version,customerId:resolvedId,kind:'LOCATION',label:edit.label,data:{address:edit.address,contactName:edit.contactName,phone:edit.phone}})};
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
 const filtered=[...(registered?[registered]:[]),...rows].filter(row=>[row.label,row.data.address,row.data.contactName,row.data.phone].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 const apply=()=>{onLoad(addressValue(edit));onClose();};
 return <Dialog open fullWidth maxWidth="md" onClose={async()=>{if(await leave())onClose();}} data-testid={testId} aria-label={title||t.savedAddresses}>
  <DialogTitle component="div"><Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap"><Typography variant="h6">{title||t.savedAddresses}</Typography><Button variant="contained" disabled={blocked||!addressValid} onClick={apply}>{t.applyLocation}</Button></Stack></DialogTitle>
  <DialogContent ref={content} tabIndex={-1}><Box data-address-workspace sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'minmax(0,1fr) minmax(0,1.7fr)'},gap:3,alignItems:'start'}}>
   <Stack spacing={1.5} data-address-list sx={{minWidth:0}}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="subtitle2">{t.savedAddresses}</Typography></Stack>
    {locationLookup?.(place=>setEdit({id:crypto.randomUUID(),label:place,address:place,contactName:'',phone:''}),blocked)}
    <TextField fullWidth size="small" label={t.addressSearch} autoComplete="off" value={query} disabled={blocked||!scopeCustomerId&&!resolveCustomer} onChange={e=>setQuery(e.target.value)}/>
    {!scopeCustomerId&&!resolveCustomer?<Alert severity="info">{t.chooseCustomer}</Alert>:readError?<Alert severity="error" action={<Button disabled={busy||uncertain} onClick={()=>setReload(v=>v+1)}>{t.retry}</Button>}>{t.failed}</Alert>:loading?<Typography role="status">{t.loading}</Typography>:<List disablePadding aria-label={t.savedAddresses} sx={{maxHeight:{xs:160,sm:400},overflowY:'auto'}}>
     {!filtered.length&&<Typography color="text.secondary">{t.presetEmpty}</Typography>}
     {filtered.map(row=><ListItemButton key={row.id} selected={edit.version!=null&&row.id===edit.id} aria-pressed={edit.version!=null&&row.id===edit.id} disabled={blocked} onClick={()=>open(row)} sx={{border:1,borderColor:'divider',borderRadius:1,mb:1,px:1.5,py:1.25,gap:1,alignItems:'center',bgcolor:'background.paper','&:last-child':{mb:0},'&:hover':{borderColor:'primary.main',bgcolor:'action.hover'},'&.Mui-selected':{borderColor:'primary.main'},'&.Mui-focusVisible':{outline:'2px solid',outlineColor:'primary.main',outlineOffset:-2}}}><Stack sx={{minWidth:0,flex:1}}><Typography fontWeight={600} sx={{overflowWrap:'anywhere'}}>{row.label}</Typography><Typography variant="caption" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{row.data.address}</Typography></Stack><ChevronRightIcon aria-hidden="true" sx={{flexShrink:0,color:'primary.main'}}/></ListItemButton>)}
    </List>}
   </Stack>
   <Stack spacing={2} data-address-detail sx={{minWidth:0}}>
    {edit.address.length>160&&<Alert severity="error">{t.routeAddressTooLong}</Alert>}
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="subtitle2">{t.addressHeading}</Typography><Stack direction="row" alignItems="center" gap={1}>{edit.version!=null&&<Button color="error" disabled={blocked} onClick={()=>mutate(true)}>{t.deleteAddress}</Button>}<SaveButton disabled={blocked||!scopeCustomerId&&!resolveCustomer||loading||readError||!edit.label.trim()||!addressValid||!!edit.version&&!dirty} onClick={()=>mutate()}>{edit.version?t.saveAddress:t.addToAddressBook}</SaveButton></Stack></Stack>
    {saveError&&<Alert severity="error" action={uncertain?<Button disabled={busy} onClick={()=>mutate()}>{t.retry}</Button>:undefined}>{t.failed}</Alert>}

    <ShippingAddressFields value={edit} onChange={setEdit} t={t} disabled={blocked} autoFocus personLabel={personLabel}/>
   </Stack>
  </Box></DialogContent>
 </Dialog>;
}
