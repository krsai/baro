import React,{useEffect,useRef,useState} from 'react';
import {Button,Checkbox,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,Stack,Typography} from '@mui/material';
import AppNotice from './AppNotice';
import {useAppActions} from '../context/AppContext';
import {usePageDialogs} from './PageDialogProvider';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {dashboardRecipientText,dashboardSettingsTitle} from '../constants/dashboardRecipientSettings';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

export default function DashboardRecipientSettings({orgId,widget,languageCode,onClose}){
 const t=dashboardRecipientText[languageCode]||dashboardRecipientText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [result,setResult]=useState(null),[roles,setRoles]=useState([]),[error,setError]=useState(null),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const saving=useRef(false),alive=useRef(true),scope=String(orgId)+':'+widget.id,loaded=result?.scope===scope?result.value:null;
 const rolesKey=widget.id==='suspected-errors'?'uncodedRoles':'handledRoles',supported=['notifications','suspected-errors'].includes(widget.id),dirty=!!loaded&&JSON.stringify(roles)!==JSON.stringify(loaded[rolesKey]??['ADMIN','ACCOUNTANT']);
 useUnsavedChanges(dirty);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{if(!supported)return;let live=true;const controller=new AbortController();setLoading(true);setError(null);
  requestJSON('/dashboard/alert-recipients'+buildQueryString({orgId}),{skipCache:true,skipGlobalLoading:true,signal:controller.signal}).then(value=>{if(live){setResult({scope,value});setRoles(value[rolesKey]??['ADMIN','ACCOUNTANT']);}}).catch(e=>{if(live&&e.name!=='AbortError')setError('load');}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;controller.abort();};
 },[scope,reload,supported,orgId,rolesKey]);
 const close=async()=>{if(!saving.current&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'})))onClose();};
 const refresh=async()=>{if(!saving.current&&(!dirty||await dialogs.confirm(t.discard,{purpose:'discard'})))setReload(n=>n+1);};
 const save=async()=>{if(saving.current||!loaded)return;saving.current=true;setBusy(true);setError(null);
  try{await requestJSON('/dashboard/alert-recipients'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify({revision:loaded.revision,[rolesKey]:roles})});if(!alive.current)return;emitWorkspaceDataChanged({orgId,source:'dashboard-recipients',topics:['accounting-alerts']});showNotification(t.saved,'success');onClose();}
  catch(e){if(alive.current)setError(e.status===409?'changed':'save');}finally{saving.current=false;if(alive.current)setBusy(false);}
 };
 return <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="dashboard-recipients-title">
  <DialogTitle id="dashboard-recipients-title">{dashboardSettingsTitle(widget.label,languageCode)}</DialogTitle>
  <DialogContent><Stack spacing={2} sx={{pt:1}}>
   {error&&<AppNotice severity="error" action={<Button disabled={busy} onClick={error==='save'?save:refresh}>{error==='changed'?t.reload:t.retry}</Button>}>{error==='changed'?t.changed:t.failed}</AppNotice>}
   {!supported?<Typography color="text.secondary">{t.empty}</Typography>:loading?<CircularProgress size={22}/>:loaded?<><Typography fontWeight={600}>{rolesKey==='uncodedRoles'?t.uncoded:t.handled}</Typography><Stack direction="row" useFlexGap flexWrap="wrap" columnGap={2} role="group" aria-label={t.roles}>{['ADMIN','ACCOUNTANT','OPERATOR'].map(role=><FormControlLabel key={role} label={t[role]} control={<Checkbox checked={roles.includes(role)} disabled={busy} onChange={event=>setRoles(current=>['ADMIN','ACCOUNTANT','OPERATOR'].filter(item=>item===role?event.target.checked:current.includes(item)))}/>}/>)}</Stack></>:null}
  </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={close}>{t.close}</Button>{supported&&<Button variant="contained" disabled={!dirty||loading||busy||error==='changed'||error==='load'} onClick={save}>{busy?<CircularProgress size={18}/>:t.save}</Button>}</DialogActions>
 </Dialog>;
}
