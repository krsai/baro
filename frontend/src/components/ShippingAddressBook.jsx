import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Dialog,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import DeleteActionButton from './DeleteActionButton';
import SaveButton from './SaveButton';
import ShippingAddressFields,{addressValue} from './ShippingAddressFields';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import {shippingEditorText} from '../constants/shippingEditor';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

export default function ShippingAddressBook({orgId,customerId,current,languageCode,onLoad,onClose}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [rows,setRows]=useState([]),[edit,setEdit]=useState(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(false),[uncertain,setUncertain]=useState(false),[reload,setReload]=useState(0);
 const baseline=useRef(''),pending=useRef(null),lock=useRef(false),alive=useRef(true),content=useRef(null);
 const url='/shipping-requests/presets'+buildQueryString({orgId,customerId,kind:'LOCATION'});
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!busy&&!loading&&content.current&&!content.current.contains(document.activeElement))content.current.focus();},[busy,loading,rows,edit]);
 useEffect(()=>{let live=true;setLoading(true);setError(false);requestJSON(url,{skipCache:true}).then(value=>{if(live)setRows(value);}).catch(()=>live&&setError(true)).finally(()=>live&&setLoading(false));return()=>{live=false;};},[url,reload]);
 const open=row=>{const next=row?{id:row.id,version:row.version,...addressValue({...row.data,label:row.label})}:{id:crypto.randomUUID(),...addressValue(current)};baseline.current=JSON.stringify(next);setEdit(next);setError(false);};
 const dirty=edit&&JSON.stringify(edit)!==baseline.current;
 useUnsavedChanges(!!dirty||uncertain);
 const leave=async()=>!busy&&!uncertain&&(!dirty||await dialogs.confirm(t.discard));
 const close=async()=>{if(await leave())onClose();};
 const mutate=async(row,remove=false)=>{
  if(lock.current)return;
  if(remove&&!pending.current&&!await dialogs.confirm(t.deleteConfirm))return;
  lock.current=true;setBusy(true);setError(false);
  try{
   pending.current=pending.current||{path:remove?'/'+row.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId,version:row.version}:{id:edit.id,version:edit.version,customerId,kind:'LOCATION',label:edit.label,data:{address:edit.address,contactName:edit.contactName,phone:edit.phone}})};
   const work=pending.current;
   await requestJSON('/shipping-requests/presets'+work.path+buildQueryString({orgId}),{method:work.method,body:work.body});
   pending.current=null;
   if(alive.current){setUncertain(false);setEdit(null);setReload(v=>v+1);showNotification(t.saved,'success');}
  }catch(e){const unknown=!e.status||e.status>=500;if(!unknown)pending.current=null;if(alive.current){setUncertain(unknown);setError(true);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 return <Dialog open fullWidth maxWidth="md" onClose={close} data-testid="shipping-address-book"><DialogTitle component="div"><Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}><Typography variant="h6">{t.savedAddresses}</Typography>{edit?<SaveButton disabled={busy||uncertain||!edit.label.trim()||!edit.address.trim()} onClick={()=>mutate(null)}>{t.savePreset}</SaveButton>:<Button disabled={busy||uncertain||loading||error} onClick={()=>open(null)}>{t.addAddress}</Button>}</Stack></DialogTitle><DialogContent ref={content} tabIndex={-1}><Stack spacing={2}>
 {error&&<Alert severity="error" action={<Button disabled={busy} onClick={()=>uncertain?mutate(null):setReload(v=>v+1)}>{t.retry}</Button>}>{t.failed}</Alert>}
 {edit?<><ShippingAddressFields value={edit} onChange={setEdit} t={t} disabled={busy||uncertain} autoFocus/><Button sx={{alignSelf:'flex-start'}} disabled={busy||uncertain} onClick={async()=>{if(await leave())setEdit(null);}}>{t.addressList}</Button></>:<>{loading&&<Typography>{t.loading}</Typography>}{!loading&&!error&&!rows.length&&<Typography color="text.secondary">{t.presetEmpty}</Typography>}{!loading&&!error&&rows.map(row=><Stack key={row.id} direction={{xs:'column',sm:'row'}} alignItems={{xs:'stretch',sm:'center'}} gap={1} sx={{borderBottom:1,borderColor:'divider',pb:2}}><Stack sx={{flex:1,minWidth:0}}><Typography fontWeight={600}>{row.label}</Typography><Typography sx={{overflowWrap:'anywhere'}}>{row.data.address}</Typography><Typography color="text.secondary" sx={{overflowWrap:'anywhere'}}>{[row.data.contactName,row.data.phone].filter(Boolean).join(' · ')}</Typography></Stack><Stack direction="row" justifyContent="flex-end"><Button disabled={busy||uncertain} onClick={()=>{onLoad({...row.data,label:row.label});onClose();}}>{t.loadPreset}</Button><Button disabled={busy||uncertain} onClick={()=>open(row)}>{t.editAddress}</Button><DeleteActionButton disabled={busy||uncertain} title={t.deletePreset} onClick={()=>mutate(row,true)}/></Stack></Stack>)}</>}
 </Stack></DialogContent></Dialog>;
}
