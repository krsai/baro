import StatusLabel from '../../components/StatusLabel';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import dayjs from 'dayjs';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import SearchPanel from '../../components/SearchPanel';
import SearchInput from '../../components/SearchInput';
import SearchableSelect from '../../components/SearchableSelect';
import DateRangeSelector from '../../components/DateRangeSelector';
import SaveButton from '../../components/SaveButton';
import ApprovalStageFlow from '../../components/ApprovalStageFlow';
import {usePageDialogs} from '../../components/PageDialogProvider';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {workTimeText} from '../../constants/workTime';

const kinds=['OVERTIME','SPECIAL','ANNUAL','ANNUAL_AM','ANNUAL_PM','PAID','UNPAID'];
const defaults=()=>({start:dayjs().subtract(11,'month').startOf('month'),end:dayjs().endOf('month')});
const tone={APPROVED:'success',REJECTED:'error',PENDING:'info',CANCELLED:'warning',WITHDRAWN:'default'};
const errorText=(t,e)=>t.errors[e?.message]||t.error;
export default function WorkTimeRequests(){const {activeOrgId}=useAuth();return <CompanyRequests key={activeOrgId} orgId={activeOrgId}/>;}
function CompanyRequests({orgId}){
 const {languageCode}=useLanguage(),t=workTimeText[languageCode]||workTimeText.en,{showNotification,navigateToPath}=useAppActions(),dialogs=usePageDialogs();
 const [period,setPeriod]=useState(defaults),[query,setQuery]=useState(''),[serverQuery,setServerQuery]=useState(''),[status,setStatus]=useState(''),[catalog,setCatalog]=useState(null),[result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[reload,setReload]=useState(0);
 const [form,setForm]=useState(null),[initial,setInitial]=useState(''),[detail,setDetail]=useState(null),[detailId,setDetailId]=useState(null),[busy,setBusy]=useState(false),[minutes,setMinutes]=useState(''),[decisionReason,setDecisionReason]=useState(''),[balance,setBalance]=useState(null);
 const detailHeading=useRef(null),lock=useRef(false),live=useRef(true),dirty=!!form&&JSON.stringify(form)!==initial;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);useUnsavedChanges(dirty);
 const api=useCallback((path,options={})=>requestJSON('/work-time'+path+(path.includes('?')?'&':'?')+'orgId='+encodeURIComponent(orgId),{...options,skipCache:true}),[orgId]);
 useEffect(()=>{const timer=setTimeout(()=>setServerQuery(query),250);return()=>clearTimeout(timer);},[query]);
 const refresh=useCallback(()=>setReload(v=>v+1),[]);
 useWorkspaceRefreshOnEvent({orgId,topics:['work-time','work-time-policy','employees'],isBlocked:!!form||busy||!!detailId,onRefresh:refresh});
 useEffect(()=>{let alive=true;setLoading(true);setError('');Promise.all([api('/catalog'),api('/requests'+buildQueryString({start:period.start.format('YYYY-MM-DD'),end:period.end.format('YYYY-MM-DD'),q:serverQuery,status}))]).then(([c,r])=>{if(alive){setCatalog(c);setResult(r);}}).catch(e=>{if(alive){setResult(null);setError(errorText(t,e));}}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[api,period,reload,serverQuery,status]);
 // api() appends company scope to paths that may already contain a query string.
 useEffect(()=>{if(!detailId)return;let alive=true;setDetail(current=>current?.id===detailId?current:null);api('/requests/'+detailId).then(d=>{if(alive){setDetail(d);setMinutes(String(d.requestedMinutes||''));setDecisionReason('');}}).catch(e=>{if(alive)setError(errorText(t,e));});return()=>{alive=false;};},[api,detailId,reload]);
 useEffect(()=>{setBalance(null);if(!form?.employeeId||!form.startDate)return;let alive=true;api('/balance'+buildQueryString({employeeId:form.employeeId,year:form.startDate.slice(0,4)})).then(d=>{if(alive)setBalance(d.remaining);}).catch(e=>{if(alive)setError(errorText(t,e));});return()=>{alive=false;};},[api,form?.employeeId,form?.startDate,reload]);
 useEffect(()=>{if(!detailId||!detail||detail.canDecide)return;const frame=requestAnimationFrame(()=>detailHeading.current?.focus());return()=>cancelAnimationFrame(frame);},[detailId,detail?.revision,detail?.canDecide]);
 const begin=(original=null)=>{setDetailId(null);setDetail(null);const f={policyRevision:catalog.policy.revision,employeeId:original?.employeeId||(catalog.policy.drafterRoles.includes(catalog.actor.orgRole)?catalog.actor.id:catalog.employees.find(p=>p.id!==catalog.actor.id)?.id),kind:original?.kind||'OVERTIME',startDate:original?.startDate||dayjs().format('YYYY-MM-DD'),endDate:original?.endDate||dayjs().format('YYYY-MM-DD'),startTime:original?.startTime||'17:00',endTime:original?.endTime||'18:00',reason:'',clientKey:crypto.randomUUID(),...(original?{cancelsRequestId:original.id}:{})};setInitial(JSON.stringify(f));setForm(f);setError('');};
 const patch=(key,value)=>setForm(f=>({...f,[key]:value,...(key==='startDate'&&['OVERTIME','SPECIAL','ANNUAL_AM','ANNUAL_PM'].includes(f.kind)?{endDate:value}:{}),...(key==='kind'&&['OVERTIME','SPECIAL','ANNUAL_AM','ANNUAL_PM'].includes(value)?{endDate:f.startDate}:{})}));
 const run=async(action)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();if(live.current){showNotification(t.saved,'success');refresh();emitWorkspaceDataChanged({orgId,topics:['work-time','payroll-sources','employee-leaves']});}}catch(e){if(live.current)setError(errorText(t,e));}finally{lock.current=false;if(live.current)setBusy(false);}};
 const reloadFormPolicy=async()=>{if(lock.current)return;lock.current=true;setBusy(true);try{const c=await api('/catalog');if(live.current){setCatalog(c);setForm(f=>f?{...f,policyRevision:c.policy.revision}:f);setError('');refresh();}}catch(e){if(live.current)setError(errorText(t,e));}finally{lock.current=false;if(live.current)setBusy(false);}};
 const submit=()=>run(async()=>{const d=await api('/requests',{method:'POST',body:JSON.stringify(form)});if(live.current){setForm(null);setDetailId(d.id);}});
 const decide=decision=>run(async()=>{const d=await api('/requests/'+detail.id+'/decision',{method:'POST',body:JSON.stringify({decision,revision:detail.revision,reason:decisionReason,approvedMinutes:Number(minutes)})});if(live.current)setDetail(d);});
 const closeForm=async()=>{if(!busy&&(!dirty||await dialogs.confirm(t.discard))){setForm(null);setError('');}};
 const rows=(result?.rows||[]).filter(r=>(!status||r.status===status)&&(!query||[r.employee.name,r.employee.employeeNo,r.drafter.name,r.reason].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())));
 const extra=form&&['OVERTIME','SPECIAL'].includes(form.kind),single=form&&['OVERTIME','SPECIAL','ANNUAL_AM','ANNUAL_PM'].includes(form.kind);
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1}><Button variant="contained" disabled={loading||!catalog?.policy.approverIds.length||!(catalog?.policy.drafterRoles.includes(catalog.actor.orgRole)||catalog?.canProxy)} onClick={()=>begin()}>{t.new}</Button></Stack>}>
  <SearchPanel search={<SearchInput value={query} onChange={e=>setQuery(e.target.value)} placeholder={t.search}/>} filters={<TextField select label={t.status} value={status} onChange={e=>setStatus(e.target.value)} sx={{minWidth:170}}><MenuItem value="">{t.all}</MenuItem>{Object.keys(tone).map(k=><MenuItem key={k} value={k}>{t[k]}</MenuItem>)}</TextField>} controls={<DateRangeSelector startValue={period.start} endValue={period.end} onStartChange={value=>{if(value?.isValid())setPeriod(p=>({...p,start:value}));}} onEndChange={value=>{if(value?.isValid())setPeriod(p=>({...p,end:value}));}}/>} onReset={()=>{setPeriod(defaults());setQuery('');setStatus('');}}/>
  <Alert severity="info">{t.rules}</Alert>{catalog&&!catalog.policy.approverIds.length&&<Alert severity="warning" action={catalog.canConfigure?<Button onClick={()=>navigateToPath('/approval-settings?menu=WORK_TIME')}>{t.settings}</Button>:undefined}>{t.noPolicy}</Alert>}
  {error&&!form&&!detailId&&<Alert severity="error" action={<Button onClick={refresh}>{t.retry}</Button>}>{error}</Alert>}{result?.hasMore&&<Alert severity="warning">{t.more}</Alert>}
  <Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>{[t.employee,t.kind,t.start,t.end,t.drafter,t.status].map(k=><TableCell key={k}>{k}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(r=><TableRow hover key={r.id}><TableCell><Button onClick={()=>{setError('');setDetailId(r.id);}}>{r.employee.name}</Button></TableCell><TableCell>{r.cancelsRequestId?t.cancelRequest+' · ':''}{t[r.kind]}</TableCell><TableCell>{r.startDate}</TableCell><TableCell>{r.endDate}</TableCell><TableCell>{r.drafter.name}</TableCell><TableCell><RequestStatus row={r} t={t}/></TableCell></TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={6}>{loading?'…':result?t.empty:'—'}</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
  <Dialog open={!!form} onClose={closeForm} fullWidth maxWidth="md"><DialogTitle>{form?.cancelsRequestId?t.cancel:t.new}</DialogTitle><DialogContent><Stack spacing={2}>
   {error&&<Alert severity="error" action={<Button disabled={busy} onClick={reloadFormPolicy}>{t.refresh}</Button>}>{error}</Alert>}
   <SearchableSelect label={t.employee} options={catalog?.employees||[]} value={catalog?.employees.find(p=>p.id===form?.employeeId)||null} onChange={(_,p)=>patch('employeeId',p?.id||null)} getOptionLabel={p=>p.name} isOptionEqualToValue={(a,b)=>a.id===b.id} getOptionDisabled={p=>p.id===catalog?.actor.id&&!catalog?.policy.drafterRoles.includes(catalog.actor.orgRole)} disabled={busy||!!form?.cancelsRequestId||!catalog?.canProxy}/>
   <TextField select label={t.kind} value={form?.kind||'OVERTIME'} onChange={e=>patch('kind',e.target.value)} disabled={busy||!!form?.cancelsRequestId}>{kinds.map(k=><MenuItem key={k} value={k}>{t[k]}</MenuItem>)}</TextField>
   <Stack direction="row" gap={2} useFlexGap flexWrap="wrap">{['startDate','endDate'].map((key,i)=><TextField key={key} label={i?t.end:t.start} type="date" value={form?.[key]||''} InputLabelProps={{shrink:true}} onChange={e=>patch(key,e.target.value)} disabled={busy||!!form?.cancelsRequestId||single&&i===1}/>)}{extra&&['startTime','endTime'].map((key,i)=><TextField key={key} type="time" label={i?t.endTime:t.startTime} value={form?.[key]||''} InputLabelProps={{shrink:true}} onChange={e=>patch(key,e.target.value)} disabled={busy||!!form?.cancelsRequestId}/>)}</Stack>
   {form?.kind.startsWith('ANNUAL')&&balance!=null&&<Typography>{t.remaining}: {balance}</Typography>}
   <TextField required label={t.reason} multiline minRows={2} value={form?.reason||''} onChange={e=>patch('reason',e.target.value)} disabled={busy} inputProps={{maxLength:1000}}/>
   <ApprovalStageFlow drafter={catalog?.actor} stages={(catalog?.policy.approverIds||[]).map((id,index)=>({key:String(index+1),role:catalog.approvers?.find(p=>p.id===id)?.orgRole,employeeId:id,candidates:(catalog.approvers||[]).filter(p=>p.id===id)}))} languageCode={languageCode} disabled/>
   <Typography color="text.secondary">{t.policyNote}</Typography>
  </Stack></DialogContent><DialogActions><SaveButton loading={busy} disabled={!form?.reason.trim()||!form?.employeeId} onClick={submit}>{t.submit}</SaveButton></DialogActions></Dialog>
  <Dialog open={!!detailId} onClose={busy?undefined:()=>{setDetailId(null);setError('');}} fullWidth maxWidth="lg" slotProps={{transition:{onEntered:()=>{if(detail&&!detail.canDecide)detailHeading.current?.focus();}}}}><DialogTitle ref={detailHeading} tabIndex={-1} data-work-time-detail-heading="true">{t.detail}</DialogTitle><DialogContent><Stack spacing={2}>{error&&<Alert severity="error" action={<Button onClick={refresh}>{t.refresh}</Button>}>{error}</Alert>}{detail&&<>
   <Typography>{detail.employee.name} · {detail.cancelsRequestId?t.cancelRequest+' · ':''}{t[detail.kind]} · {detail.startDate} — {detail.endDate} {detail.startTime} {detail.endTime&&'— '+detail.endTime}</Typography><RequestStatus row={detail} t={t}/><Typography sx={{whiteSpace:'pre-wrap'}}>{detail.reason}</Typography><Typography>{detail.requestedMinutes!=null?`${t.requested}: ${detail.requestedMinutes}`:`${t.days}: ${detail.days.reduce((n,d)=>n+d.portion,0)}`}{detail.approvedMinutes!=null?` · ${t.minutes}: ${detail.approvedMinutes}`:''}</Typography>
   {detail.payrollLocked&&<Alert severity="warning">{t.locked}</Alert>}
   <ApprovalStageFlow drafter={detail.drafter} stages={detail.steps.map(s=>({key:String(s.position),role:s.role,employeeId:s.employeeId,candidates:[s.employee]}))} languageCode={languageCode} disabled/>
   {detail.decisions.map(d=><Typography key={d.id}>{detail.steps.find(s=>s.position===d.position)?.employee.name} · {t[d.decision]} · {d.createdAt.slice(0,10)} {d.reason}</Typography>)}
   {detail.canDecide&&<><TextField label={t.reason} multiline value={decisionReason} onChange={e=>setDecisionReason(e.target.value)} disabled={busy} inputProps={{maxLength:1000}}/>{detail.requestedMinutes!=null&&!detail.cancelsRequestId&&detail.decisions.length===detail.steps.length-1&&<TextField required type="number" label={t.minutes} value={minutes} onChange={e=>setMinutes(e.target.value)} disabled={busy} inputProps={{min:1,max:detail.requestedMinutes}}/>}</>}
  </>}</Stack></DialogContent><DialogActions>{detail?.canWithdraw&&<Button onClick={()=>decide('WITHDRAWN')} disabled={busy}>{t.withdraw}</Button>}{detail?.canCancel&&<Button onClick={()=>begin(detail)} disabled={busy}>{t.cancel}</Button>}{detail?.canDecide&&<><Button color="error" disabled={busy||!decisionReason.trim()} onClick={()=>decide('REJECTED')}>{t.reject}</Button><SaveButton loading={busy} onClick={()=>decide('APPROVED')}>{t.approve}</SaveButton></>}</DialogActions></Dialog>
 </AppPageContainer>;
}
function RequestStatus({row,t}){return <StatusLabel tone={{APPROVED:'green',REJECTED:'red',PENDING:'blue',CANCELLED:'gray',WITHDRAWN:'gray'}[row.status]} label={t[row.status]+(row.status==='PENDING'&&row.decisions.length?' '+row.decisions.length+'/'+row.steps.length:'')}/>;}
