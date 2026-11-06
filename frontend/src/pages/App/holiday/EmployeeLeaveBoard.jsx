import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import dayjs from 'dayjs';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchableSelect from '../../../components/SearchableSelect';
import QueryFeedback from '../../../components/QueryFeedback';
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {useAppActions} from '../../../context/AppContext';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {employeeLeaveText} from '../../../constants/employeeLeave';
import {HOLIDAY_UPDATED_EVENT} from '../../../utils/holidayApi';
import {emitWorkspaceDataChanged} from '../../../utils/workspaceDataEvents';
export default function EmployeeLeaveBoard(){
 const {activeOrgId,activeOrgRole}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions(),t=employeeLeaveText[languageCode]||employeeLeaveText.en;
 const [employeeId,setEmployeeId]=useState(null),[year,setYear]=useState(dayjs().year()),[data,setData]=useState(null),[reload,setReload]=useState(0),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [form,setForm]=useState({startDate:dayjs().format('YYYY-MM-DD'),endDate:dayjs().format('YYYY-MM-DD'),kind:'ANNUAL',reason:''}),[grant,setGrant]=useState({days:'',reason:''}),[cancel,setCancel]=useState(null),[cancelReason,setCancelReason]=useState('');
 const currentScope=useRef(null);
 const requestKey=useRef({signature:'',key:''}),scope=String(activeOrgId)+':'+year+':'+employeeId;currentScope.current=scope;
 useEffect(()=>{setEmployeeId(null);setData(null);setCancel(null);},[activeOrgId]);
 useEffect(()=>{if(!activeOrgId||!Number.isInteger(Number(year))||year<1900||year>2200)return;let live=true;setLoading(true);setError('');requestJSON('/employee-leaves'+buildQueryString({orgId:activeOrgId,year,employeeId:employeeId||undefined}),{forceRefresh:true}).then(value=>{if(live)setData({...value,scope});}).catch(err=>{if(live)setError(t.errors[err.message]||t.failed);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[activeOrgId,year,employeeId,reload,languageCode]);
 useEffect(()=>{const changed=event=>{if(Number(event.detail?.orgId)===Number(activeOrgId))setReload(value=>value+1);};window.addEventListener(HOLIDAY_UPDATED_EVENT,changed);return()=>window.removeEventListener(HOLIDAY_UPDATED_EVENT,changed);},[activeOrgId]);
 const balance=data?.scope===scope?data.balance:null,employees=data?.scope?.startsWith(String(activeOrgId)+':')?data.employees:[],selected=employees.find(row=>row.id===employeeId)||null;
 const update=(key,value)=>setForm(current=>({...current,[key]:value}));
 const send=async(action,payload)=>{
  if(!employeeId||busy)return;if(action==='record'&&(Number(payload.startDate.slice(0,4))!==Number(year)||Number(payload.endDate.slice(0,4))!==Number(year))){setError(t.errors.LEAVE_INVALID_INPUT);return;}setBusy(true);setError('');
  const signature=JSON.stringify({scope,action,payload});if(requestKey.current.signature!==signature)requestKey.current={signature,key:crypto.randomUUID()};
  const path=action==='grant'?`/employees/${employeeId}/leave-grants`:action==='cancel'?`/employees/${employeeId}/leaves/${cancel.id}/cancel`:`/employees/${employeeId}/leaves`;
  try{const result=await requestJSON(path+buildQueryString({orgId:activeOrgId}),{method:'POST',body:JSON.stringify({...payload,clientKey:requestKey.current.key})});if(currentScope.current!==scope)return;setData({employees,balance:result,scope});setCancel(null);setCancelReason('');requestKey.current.signature='';showNotification(t.saved,'success');emitWorkspaceDataChanged({orgId:activeOrgId,topics:['salary-system-settings','employee-leaves'],source:'employee-leaves'});}
  catch(err){if(currentScope.current===scope)setError(t.errors[err.message]||t.failed);}finally{setBusy(false);}
 };
 return <AppPageContainer title={t.title}>
  <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center"><Box sx={{width:300,maxWidth:'100%'}}><SearchableSelect label={t.employee} options={employees} value={selected} onChange={(_,row)=>setEmployeeId(row?.id||null)} getOptionLabel={row=>[row.employeeNo,row.name].filter(Boolean).join(' · ')} getLookupCode={row=>row.employeeNo} languageCode={languageCode} disabled={busy}/></Box><TextField size="small" type="number" label={t.year} value={year} onChange={event=>setYear(Number(event.target.value))} disabled={busy} sx={{width:120}}/></Stack>
  <QueryFeedback error={Boolean(error)&&!balance} onRetry={()=>setReload(value=>value+1)}/>{error&&<Alert severity="error">{error}</Alert>}
  {!employeeId&&<Typography color="text.secondary">{t.select}</Typography>}
  {balance&&<Stack spacing={2}>
   <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">{['granted','used','remaining'].map(key=><Chip key={key} variant="outlined" label={`${t[key]}: ${balance[key]}`}/>)}</Stack>
   <Paper variant="outlined" sx={{p:2}}><Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
    <TextField type="date" size="small" label={t.start} value={form.startDate} onChange={event=>update('startDate',event.target.value)} InputLabelProps={{shrink:true}}/><TextField type="date" size="small" label={t.end} value={form.endDate} onChange={event=>update('endDate',event.target.value)} InputLabelProps={{shrink:true}}/>
    <TextField select size="small" label={t.kind} value={form.kind} onChange={event=>update('kind',event.target.value)} sx={{minWidth:150}}>{['ANNUAL','PAID','UNPAID'].map(kind=><MenuItem key={kind} value={kind}>{t[kind]}</MenuItem>)}</TextField><TextField size="small" label={t.reason} value={form.reason} onChange={event=>update('reason',event.target.value)} sx={{flex:1,minWidth:180}}/><Button variant="contained" disabled={busy||loading} onClick={()=>send('record',form)}>{t.record}</Button>
   </Stack></Paper>
   {activeOrgRole==='ADMIN'&&<Paper variant="outlined" sx={{p:2}}><Typography variant="subtitle2" sx={{mb:1}}>{t.grantTitle}</Typography><Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap"><TextField type="number" size="small" label={t.days} value={grant.days} onChange={event=>setGrant(current=>({...current,days:event.target.value}))} sx={{width:140}}/><TextField size="small" label={t.reason} value={grant.reason} onChange={event=>setGrant(current=>({...current,reason:event.target.value}))} sx={{flex:1,minWidth:180}}/><Button variant="outlined" disabled={busy||loading} onClick={()=>send('grant',{year,days:Number(grant.days),reason:grant.reason})}>{t.grant}</Button></Stack></Paper>}
   <Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>{[t.date,t.kind,t.reason,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{balance.leaves.map(row=><TableRow key={row.id} sx={{opacity:row.cancelledAt?.6:1}}><TableCell>{row.leaveDate}</TableCell><TableCell>{t[row.kind]} {row.cancelledAt?<Chip size="small" label={t.cancelled}/>:!row.counted?<Chip size="small" label={t.notCounted}/>:null}</TableCell><TableCell>{row.reason}{row.cancellationReason&&<Typography variant="caption" display="block">{row.cancellationReason}</Typography>}</TableCell><TableCell align="right">{!row.cancelledAt&&<Button disabled={busy} onClick={()=>{setCancel(row);setCancelReason('');}}>{t.cancel}</Button>}</TableCell></TableRow>)}{!balance.leaves.length&&<TableRow><TableCell colSpan={4}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
  </Stack>}
  <Dialog open={Boolean(cancel)} onClose={busy?undefined:()=>setCancel(null)} fullWidth maxWidth="sm"><DialogTitle>{t.cancel}</DialogTitle><DialogContent><TextField fullWidth autoFocus required label={t.reason} value={cancelReason} onChange={event=>setCancelReason(event.target.value)} sx={{mt:1}}/></DialogContent><DialogActions><Button disabled={busy||!cancelReason.trim()} onClick={()=>send('cancel',{reason:cancelReason})}>{t.cancel}</Button></DialogActions></Dialog>
 </AppPageContainer>;
}
