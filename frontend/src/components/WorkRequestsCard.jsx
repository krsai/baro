import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Chip,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import SearchableSelect from './SearchableSelect';
import DeleteActionButton from './DeleteActionButton';
import {useAppActions} from '../context/AppContext';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {workRequestText} from '../constants/dashboardWorkRequests';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
export default function WorkRequestsCard({orgId,languageCode}){
 const t=workRequestText[languageCode]||workRequestText.en,{active}=useRequestScopeContext(),{showNotification}=useAppActions();
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[page,setPage]=useState(0),[status,setStatus]=useState('ALL'),[direction,setDirection]=useState('ALL'),[reload,setReload]=useState(0);
 const [open,setOpen]=useState(false),[people,setPeople]=useState([]),[peopleFailed,setPeopleFailed]=useState(false),[peopleLoading,setPeopleLoading]=useState(false),[recipient,setRecipient]=useState(null),[title,setTitle]=useState(''),[message,setMessage]=useState(''),[formError,setFormError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const [mutationError,setMutationError]=useState('');
 const attempt=useRef(null),mutation=useRef(false),clientKey=useRef(''),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useUnsavedChanges(open&&Boolean(title||message||recipient));
 const api=useCallback((path='',body)=>requestJSON('/dashboard/work-requests'+path+buildQueryString({orgId,...(!body&&!path?{page,status,direction}:{})}),{skipCache:true,skipGlobalLoading:true,...(body?{method:'POST',body:JSON.stringify(body)}:{})}),[orgId,page,status,direction]);
 useEffect(()=>{if(!active)return;let live=true,pending=false,timer;
  const load=async()=>{if(!live||pending||document.visibilityState==='hidden')return;pending=true;setLoading(true);clearTimeout(timer);
   try{const result=await api();if(live){if(page>0&&!result.rows.length){setPage(page-1);return;}setData(result);setError('');timer=setTimeout(load,10000);}}
   catch{if(live)setError(t.failed);}finally{pending=false;if(live)setLoading(false);}};
  const focus=()=>{if(document.visibilityState!=='hidden')void load();};
  void load();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{live=false;clearTimeout(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
 },[api,active,reload,t.failed,page]);
 const loadPeople=async()=>{setPeopleLoading(true);setPeopleFailed(false);try{const rows=await api('/recipients');if(alive.current)setPeople(rows);}catch{if(alive.current)setPeopleFailed(true);}finally{if(alive.current)setPeopleLoading(false);}};
 const create=()=>{clientKey.current=crypto.randomUUID();attempt.current=null;setRecipient(null);setTitle('');setMessage('');setFormError('');setUncertain(false);setOpen(true);void loadPeople();};
 const send=async()=>{if(mutation.current)return;mutation.current=true;setBusy(true);setFormError('');const payload=attempt.current||{clientKey:clientKey.current,recipientId:recipient?.id,title,message};attempt.current=payload;
  try{await api('',payload);if(!alive.current)return;setOpen(false);setUncertain(false);attempt.current=null;setPage(0);setReload(n=>n+1);showNotification(t.sent,'success');}
  catch(e){if(!alive.current)return;const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)attempt.current=null;setFormError(unknown?t.uncertain:t.failed);}finally{mutation.current=false;if(alive.current)setBusy(false);}};
 const act=async(row,action)=>{if(mutation.current)return;mutation.current=true;setBusy(true);setMutationError('');try{await api('/'+encodeURIComponent(row.id),{action,version:row.version});if(!alive.current)return;showNotification(action==='COMPLETE'?t.completed:t.hidden,'success');setReload(n=>n+1);}catch(e){if(alive.current){setMutationError(e.status===409?t.changed:t.failed);setReload(n=>n+1);}}finally{mutation.current=false;if(alive.current)setBusy(false);}};
 return <Paper variant="outlined" data-testid="dashboard-work-requests" sx={{p:2,height:540,display:'flex',flexDirection:'column',minWidth:0}}>
  <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="h6">{t.title}</Typography>{data?.canCreate&&<Button onClick={create}>{t.create}</Button>}</Stack>
  <Stack direction="row" spacing={1} sx={{my:1.5}}>{[['status',status,setStatus,['ALL','OPEN','DONE']],['direction',direction,setDirection,['ALL','RECEIVED','SENT']]].map(([key,value,set,keys])=><TextField key={key} select fullWidth size="small" label={t[key]} value={value} onChange={e=>{set(e.target.value);setPage(0);}}>{keys.map(k=><MenuItem key={k} value={k}>{t[k]}</MenuItem>)}</TextField>)}</Stack>
  {(error||mutationError)&&<Alert severity="error" action={<Button onClick={()=>{setMutationError('');setReload(n=>n+1);}}>{t.retry}</Button>}>{mutationError||error}</Alert>}
  <Box sx={{flex:1,minHeight:0,overflow:'auto'}}>{loading&&!data?<CircularProgress size={20}/>:!error&&data?.rows.length===0?<Typography color="text.secondary">{t.empty}</Typography>:<Stack spacing={1}>{data?.rows.map(row=><Paper key={row.id} variant="outlined" sx={{p:1.5}}>
   <Stack direction="row" gap={1} justifyContent="space-between"><Typography fontWeight={600} sx={{overflowWrap:'anywhere'}}>{row.title}</Typography><Chip size="small" label={t[row.status]} color={row.status==='DONE'?'success':'info'}/></Stack>
   <Typography variant="caption" color="text.secondary">{row.senderName} → {row.recipientName}</Typography><Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',my:1}}>{row.message}</Typography>
   <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography variant="caption" color="text.secondary">{new Date(row.completedAt||row.createdAt).toLocaleString({ko:'ko-KR',en:'en-GB',vi:'vi-VN'}[languageCode]||'en-GB')}</Typography>{row.status==='OPEN'&&row.recipientId===data.actorId?<Button disabled={busy} onClick={()=>act(row,'COMPLETE')}>{t.complete}</Button>:row.status==='DONE'?<DeleteActionButton aria-label={t.hide} title={t.hide} disabled={busy} onClick={()=>act(row,'HIDE')}/>:null}</Stack>
  </Paper>)}</Stack>}</Box>
  <Stack direction="row" justifyContent="flex-end"><Button disabled={!page||loading} onClick={()=>setPage(n=>n-1)}>{t.previous}</Button><Button disabled={!data?.hasMore||loading} onClick={()=>setPage(n=>n+1)}>{t.next}</Button></Stack>
  <Dialog open={open} onClose={()=>!busy&&!uncertain&&setOpen(false)} fullWidth maxWidth="sm"><DialogTitle>{t.create}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
   {formError&&<Alert severity="error">{formError}</Alert>}{peopleFailed&&<Alert severity="error" action={<Button onClick={loadPeople}>{t.retry}</Button>}>{t.failed}</Alert>}
   <SearchableSelect options={people} value={recipient} onChange={(_event,value)=>setRecipient(value)} disabled={busy||uncertain||peopleLoading||peopleFailed} getOptionLabel={person=>[person.employeeNo,person.name].filter(Boolean).join(' · ')} isOptionEqualToValue={(a,b)=>a.id===b.id} renderInput={params=><TextField {...params} size="small" required label={t.recipient}/>}/>
   <TextField size="small" required label={t.subject} value={title} disabled={busy||uncertain} onChange={e=>setTitle(e.target.value)} inputProps={{maxLength:200}}/>
   <TextField size="small" multiline minRows={4} label={t.message} value={message} disabled={busy||uncertain} onChange={e=>setMessage(e.target.value)} inputProps={{maxLength:4000}}/>
  </Stack></DialogContent><DialogActions><Button disabled={busy||uncertain} onClick={()=>setOpen(false)}>{t.cancel}</Button><Button variant="contained" disabled={busy||!recipient||!title.trim()||peopleFailed} onClick={send}>{t.send}</Button></DialogActions></Dialog>
 </Paper>;
}
