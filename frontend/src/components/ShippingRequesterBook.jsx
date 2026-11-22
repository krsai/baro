import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,List,ListItemButton,Stack,TextField,Typography} from '@mui/material';
import Alert from './AppNotice';
import ListDetailLayout from './ListDetailLayout';
import SaveButton from './SaveButton';
import ShippingRequesterHistory from './ShippingRequesterHistory';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingEditorText} from '../constants/shippingEditor';

const draft=row=>({id:row?.id||crypto.randomUUID(),version:row?.version,name:row?.data?.name||row?.name||'',phone:row?.data?.phone||row?.phone||''});
export default function ShippingRequesterBook({orgId,customerId,resolveCustomer,current,languageCode,onSelect,onClose,disabled=false}){
 const t=shippingEditorText[languageCode]||shippingEditorText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [scopeId,setScopeId]=useState(customerId),[rows,setRows]=useState([]),[edit,setEdit]=useState(()=>draft(current)),[query,setQuery]=useState(''),[loading,setLoading]=useState(!!customerId),[readError,setReadError]=useState(false),[saveError,setSaveError]=useState(false),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[reload,setReload]=useState(0),[history,setHistory]=useState(false);
 const baseline=useRef(JSON.stringify(edit)),pending=useRef(null),lock=useRef(false),alive=useRef(true);
 const dirty=JSON.stringify(edit)!==baseline.current,blocked=disabled||busy||uncertain;
 const valid=!!edit.name.trim()&&edit.name.length<=200&&/^\d{1,80}$/.test(edit.phone);
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
   pending.current=pending.current||{remove,path:remove?'/'+edit.id:'',method:remove?'DELETE':'POST',body:JSON.stringify(remove?{customerId:id,version:edit.version}:{id:edit.id,version:edit.version,customerId:id,kind:'REQUESTER',label:edit.name.trim(),data:{name:edit.name.trim(),phone:edit.phone}})};
   const work=pending.current,saved=await requestJSON('/shipping-requests/presets'+work.path+buildQueryString({orgId}),{method:work.method,body:work.body});pending.current=null;
   if(alive.current){const next=work.remove?draft():draft(saved);baseline.current=JSON.stringify(next);setEdit(next);setUncertain(false);setReload(v=>v+1);showNotification(t.saved,'success');}
  }catch(error){const unknown=!error.status||error.status>=500;if(!unknown)pending.current=null;if(alive.current){setUncertain(unknown);setSaveError(true);}}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 };
 return <Dialog open fullWidth maxWidth="md" onClose={async()=>{if(!history&&await leave())onClose();}} aria-label={t.requesterBook} data-testid="shipping-requester-book">
  <DialogTitle>{t.requesterBook}</DialogTitle>
  <DialogContent dividers><ListDetailLayout breakpoint="sm" list={<Stack spacing={2}>
   <Stack direction="row" gap={1} flexWrap="wrap"><Button disabled={blocked} onClick={()=>open()}>{t.newRequester}</Button><Button disabled={blocked} onClick={()=>setHistory(true)}>{t.requesterHistory}</Button></Stack>
   <TextField fullWidth size="small" label={t.requesterSearch} value={query} onChange={event=>setQuery(event.target.value)}/>
   {readError?<><Alert severity="error">{t.failed}</Alert><Button disabled={blocked} onClick={()=>setReload(v=>v+1)}>{t.retry}</Button></>:loading?<Typography role="status">{t.loading}</Typography>:<List disablePadding sx={{maxHeight:360,overflowY:'auto'}}>
    {!rows.length&&<Typography color="text.secondary">{t.presetEmpty}</Typography>}
    {rows.filter(row=>[row.data.name,row.data.phone].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(row=><ListItemButton key={row.id} selected={row.id===edit.id} disabled={blocked} onClick={()=>open(row)}><Box sx={{minWidth:0,overflowWrap:'anywhere'}}><Typography fontWeight={600}>{row.data.name}</Typography><Typography variant="body2">{row.data.phone}</Typography></Box></ListItemButton>)}
   </List>}
  </Stack>} detail={<Stack spacing={2}>
   {saveError&&<Alert severity="error">{t.failed}</Alert>}
   <TextField fullWidth required label={t.actualRequesterName} value={edit.name} disabled={blocked} slotProps={{htmlInput:{maxLength:200}}} onChange={event=>setEdit(v=>({...v,name:event.target.value}))}/>
   <TextField fullWidth required label={t.actualRequesterPhone} value={edit.phone} disabled={blocked} slotProps={{htmlInput:{maxLength:80,inputMode:'numeric',pattern:'[0-9]*'}}} onChange={event=>setEdit(v=>({...v,phone:event.target.value.replace(/\D/g,'')}))}/>
   <Stack direction="row" justifyContent="flex-end" gap={1}>{edit.version!=null&&<Button color="error" disabled={blocked} onClick={()=>mutate(true)}>{t.deletePreset}</Button>}<SaveButton disabled={disabled||busy||!uncertain&&(!valid||loading||readError||!!edit.version&&!dirty)} onClick={()=>mutate()}>{uncertain?t.retry:edit.version?t.savePreset:t.addRequester}</SaveButton></Stack>
  </Stack>}/></DialogContent>
  <DialogActions><Button disabled={blocked} onClick={async()=>{if(await leave())onClose();}}>{t.close}</Button><Button variant="contained" disabled={blocked||!valid||!edit.version||dirty||loading||readError} onClick={()=>{onSelect({name:edit.name,phone:edit.phone});onClose();}}>{t.loadPreset}</Button></DialogActions>
  {history&&<ShippingRequesterHistory orgId={orgId} languageCode={languageCode} onClose={()=>setHistory(false)} onSelect={row=>open({...row,phone:row.phone.replace(/\D/g,'')})}/>}
 </Dialog>;
}
