import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,Dialog,DialogContent,DialogTitle,Stack,TextField,Typography} from '@mui/material';
import DeleteActionButton from './DeleteActionButton';
import {usePageDialogs} from './PageDialogProvider';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';
import {useAppActions} from '../context/AppContext';
import ShippingAddressBook from './ShippingAddressBook';
export default function ShippingPresetDialog({orgId,customerId,kind,current,languageCode,onLoad,onClose}){
 if(kind==='LOCATION')return <ShippingAddressBook {...{orgId,customerId,current,languageCode,onLoad,onClose}}/>;
 return <PartyPresets {...{orgId,customerId,kind,current,languageCode,onLoad,onClose}}/>;
}
function PartyPresets({orgId,customerId,kind,current,languageCode,onLoad,onClose}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [rows,setRows]=useState([]),[label,setLabel]=useState((current?.name||current?.address||'').slice(0,200)),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const content=useRef(null),lock=useRef(false),newId=useRef(crypto.randomUUID()),pending=useRef(null),live=useRef(true);useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{if(!busy&&!loading&&content.current&&!content.current.contains(document.activeElement))content.current.focus();},[busy,loading,rows]);
 useEffect(()=>{let active=true;setLoading(true);requestJSON('/shipping-requests/presets'+buildQueryString({orgId,customerId,kind}),{skipCache:true}).then(value=>{if(active){setRows(value);setError('');}}).catch(()=>active&&setError(t.failed)).finally(()=>active&&setLoading(false));return()=>{active=false;};},[orgId,customerId,kind,reload]);
 const mutate=async(row,remove)=>{if(lock.current)return;if(remove&&!pending.current&&!await dialogs.confirm(t.deleteConfirm))return;lock.current=true;setBusy(true);setError('');try{
  pending.current=pending.current||{path:remove?'/'+row.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId,version:row.version}:{id:newId.current,customerId,kind,label,data:current,partyId:kind==='PARTY'?current?.id??null:null})};
  await requestJSON('/shipping-requests/presets'+pending.current.path+buildQueryString({orgId}),{method:pending.current.method,body:pending.current.body});
  pending.current=null;if(live.current){setUncertain(false);newId.current=crypto.randomUUID();setReload(v=>v+1);showNotification(t.saved,'success');}
 }catch(error){const unknown=!error.status||error.status>=500;if(!unknown)pending.current=null;if(live.current){setUncertain(unknown);setError(t.failed);}}finally{lock.current=false;if(live.current)setBusy(false);}};
 return <Dialog open fullWidth maxWidth="sm" onClose={()=>!busy&&!uncertain&&onClose()}><DialogTitle>{t.presets}</DialogTitle><DialogContent ref={content} tabIndex={-1}><Stack spacing={2} sx={{pt:1}}>{error&&<Alert severity="error" action={<Button disabled={busy} onClick={()=>uncertain?mutate(null,false):setReload(v=>v+1)}>{t.retry}</Button>}>{error}</Alert>}
 <Stack direction="row" gap={1}><TextField fullWidth label={t.presetName} value={label} disabled={busy||uncertain} inputProps={{maxLength:200}} onChange={e=>{setLabel(e.target.value);newId.current=crypto.randomUUID();}}/><Button disabled={busy||uncertain||loading||!label.trim()||!(current?.name||current?.address)} onClick={()=>mutate(null,false)}>{t.savePreset}</Button></Stack>
 {!loading&&!error&&!rows.length&&<Typography color="text.secondary">{t.presetEmpty}</Typography>}{rows.map(row=><Stack key={row.id} direction="row" alignItems="center" gap={1} sx={{borderBottom:1,borderColor:'divider',pb:1}}><Stack sx={{flex:1,minWidth:0}}><Typography fontWeight={600}>{row.label}</Typography><Typography variant="caption" sx={{overflowWrap:'anywhere'}}>{row.data.name||row.data.address}</Typography></Stack><Button disabled={busy||uncertain} onClick={()=>{onLoad(Object.fromEntries(['address','contactName','phone','email'].map(key=>[key,row.data[key]||''])));onClose();}}>{t.loadPreset}</Button><DeleteActionButton disabled={busy||uncertain} title={t.deletePreset} onClick={()=>mutate(row,true)}/></Stack>)}
 </Stack></DialogContent></Dialog>;
}
