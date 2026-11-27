import React,{useEffect,useRef,useState} from 'react';
import {Button,DialogActions,DialogContent,DialogTitle,Stack,TextField,Typography} from '@mui/material';
import Dialog from '../../../components/AppDialog';
import AppNotice from '../../../components/AppNotice';
import SaveButton from '../../../components/SaveButton';
import SearchableSelect from '../../../components/SearchableSelect';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {emitWorkspaceDataChanged} from '../../../utils/workspaceDataEvents';
import {workTimeText} from '../../../constants/workTime';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import {useAppActions} from '../../../context/AppContext';

export default function AnnualLeaveManager({open,onClose,orgId,employees,languageCode,onSaved}){
 const t=workTimeText[languageCode]||workTimeText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [employeeId,setEmployeeId]=useState(null),[year,setYear]=useState(new Date().getFullYear()),[balance,setBalance]=useState(null),[days,setDays]=useState(''),[reason,setReason]=useState(''),[error,setError]=useState(false),[loading,setLoading]=useState(false),[saving,setSaving]=useState(false),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const retry=useRef({}),lock=useRef(false);
 const dirty=balance&&(Number(days)!==balance.granted||Boolean(reason));
 useUnsavedChanges(Boolean(open&&(dirty||uncertain)));
 useEffect(()=>{if(!open||!employeeId)return;let active=true;setBalance(null);setLoading(true);setError(false);
  requestJSON('/work-time/leave-balance'+buildQueryString({orgId,employeeId,year}),{skipCache:true}).then(value=>{if(active){setBalance(value);setDays(String(value.granted));setReason('');}}).catch(()=>{if(active)setError(true);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[open,orgId,employeeId,year,reload]);
 const close=async()=>{if(saving||uncertain)return;if(dirty&&!await dialogs.confirm(t.discard,{purpose:'discard'}))return;setEmployeeId(null);setBalance(null);onClose();};
 const save=async()=>{if(lock.current||!balance)return;lock.current=true;setSaving(true);setError(false);
  const payload={employeeId,year,days:Number(days)-balance.granted,expectedGranted:balance.granted,reason};
  const signature=JSON.stringify(payload);if(retry.current.signature!==signature)retry.current={signature,clientKey:crypto.randomUUID()};
  try{const result=await requestJSON('/work-time/leave-grants'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({...payload,clientKey:retry.current.clientKey})});setBalance(result);setDays(String(result.granted));setReason('');setUncertain(false);showNotification(t.saved,'success');onSaved();emitWorkspaceDataChanged({orgId,topics:['employee-leaves','work-time'],source:'annual-leave-grant'});}
  catch(e){setError(true);setUncertain(!e.status||e.status>=500);}finally{lock.current=false;setSaving(false);}
 };
 return <Dialog open={open} onClose={close} fullWidth maxWidth="sm"><DialogTitle>{t.annualManage}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
  <SearchableSelect label={t.employee} options={employees} value={employees.find(row=>row.id===employeeId)||null} getOptionLabel={row=>row.name} getLookupCode={row=>row.employeeNo} isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={async(_,row)=>{if(dirty&&!await dialogs.confirm(t.discard,{purpose:'discard'}))return;setEmployeeId(row?.id||null);setBalance(null);}} disabled={saving||uncertain}/>
  <TextField label={t.year} type="number" value={year} onChange={async event=>{const value=Number(event.target.value);if(dirty&&!await dialogs.confirm(t.discard,{purpose:'discard'}))return;if(Number.isInteger(value)&&value>=1900&&value<=2200)setYear(value);}} disabled={saving||uncertain}/>
  {error&&<AppNotice severity="error" action={!uncertain&&<Button onClick={async()=>{if(dirty&&!await dialogs.confirm(t.discard,{purpose:'discard'}))return;setReload(value=>value+1);}}>{t.retry}</Button>}>{t.error}</AppNotice>}
  {loading&&<Typography>{t.refresh}</Typography>}
  {balance&&<><Typography>{t.granted}: {balance.granted} · {t.used}: {balance.used} · {t.remaining}: {balance.remaining}</Typography><TextField label={t.annualDays} type="number" value={days} onChange={event=>setDays(event.target.value)} disabled={saving||uncertain} inputProps={{min:Math.ceil(balance.used),max:366,step:1}}/><TextField label={t.reason} value={reason} onChange={event=>setReason(event.target.value)} disabled={saving||uncertain} inputProps={{maxLength:1000}}/></>}
 </Stack></DialogContent><DialogActions><Button onClick={close} disabled={saving||uncertain}>{t.close}</Button><SaveButton loading={saving} disabled={!balance||loading||!reason.trim()||!Number.isInteger(Number(days))||Number(days)<balance.used||Number(days)>366||Number(days)===balance.granted} onClick={save}>{t.save}</SaveButton></DialogActions></Dialog>;
}
