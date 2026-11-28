import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Button,Chip,Paper,Stack,TextField,Typography} from '@mui/material';
import AppNotice from './AppNotice';
import DocumentEvidenceFiles from './DocumentEvidenceFiles';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {taskReportText} from '../constants/taskReports';
import {workRequestText} from '../constants/dashboardWorkRequests';
import {useAppActions} from '../context/AppContext';

export default function TaskReportPanel({task,actorId,orgId,languageCode,disabled=false,onBusyChange,onDirtyChange,onSubmitted,actionsTarget}){
 const t={...(workRequestText[languageCode]||workRequestText.en),...(taskReportText[languageCode]||taskReportText.en)},{showNotification}=useAppActions();
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[body,setBody]=useState(''),[files,setFiles]=useState([]),[retry,setRetry]=useState(0),[saving,setSaving]=useState(false),[uploading,setUploading]=useState(false),[uncertain,setUncertain]=useState(false);
 const live=useRef(true),lock=useRef(false),attempt=useRef(null),clientKey=useRef(crypto.randomUUID());
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);
  requestJSON(`/dashboard/work-requests/${encodeURIComponent(task.id)}/reports`+buildQueryString({orgId}),{signal:abort.signal,skipCache:true,forceRefresh:true}).then(value=>{if(!value?.task||!Array.isArray(value.reports))throw new Error('Invalid task response');if(!abort.signal.aborted){setData(value);setError('');}}).catch(()=>{if(!abort.signal.aborted)setError(t.reportFailed);}).finally(()=>{if(!abort.signal.aborted)setLoading(false);});return()=>abort.abort();
 },[task.id,orgId,retry,t.reportFailed]);
 useEffect(()=>{onBusyChange?.(saving||uploading||uncertain);return()=>onBusyChange?.(false);},[saving,uploading,uncertain,onBusyChange]);
 useEffect(()=>{onDirtyChange?.(Boolean(body||files.length||uncertain));return()=>onDirtyChange?.(false);},[body,files,uncertain,onDirtyChange]);
 const current=data?.task,canSubmit=current?.recipientId===actorId&&current.status==='OPEN'&&!current.cancelledAt;
 const submit=async()=>{
  if(lock.current||disabled||loading||uploading||!canSubmit)return;
  if(current.reportFileRequired&&!files.length){setError(t.fileRequiredError);return;}
  if(!body.trim()&&!files.length){setError(t.reportRequiredError);return;}
  lock.current=true;setSaving(true);setError('');
  const payload=attempt.current||{clientKey:clientKey.current,body,attachmentIds:files.map(file=>file.path.split('/')[2]),requirementVersion:current.requirementVersion};attempt.current=payload;
  try{
   const report=await requestJSON(`/dashboard/work-requests/${encodeURIComponent(task.id)}/report`+buildQueryString({orgId}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!live.current)return;
   if(!report?.id)throw Object.assign(new Error('unconfirmed'),{status:503});
   attempt.current=null;setUncertain(false);setBody('');setFiles([]);onDirtyChange?.(false);showNotification(t.submitted,'success');onSubmitted?.(report);
  }catch(e){if(live.current){const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)attempt.current=null;setError(unknown?t.uncertain:e.message==='TASK_REPORT_FILE_REQUIRED'?t.fileRequiredError:e.status===409?t.changed:t.reportFailed);}}
  finally{lock.current=false;if(live.current)setSaving(false);}
 };
 const format=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:current?.timeZone||task.timeZone||'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
 return <Stack spacing={2} data-task-report>
  {error&&<AppNotice severity="error" action={uncertain?<Button disabled={saving||uploading} onClick={submit}>{t.retry}</Button>:<Button disabled={saving||uploading} onClick={()=>setRetry(value=>value+1)}>{t.refresh}</Button>}>{error}</AppNotice>}
  {loading&&<Typography>{t.refresh}</Typography>}
  {current?.dueAt&&<Typography variant="body2">{t.dueAt}: {format(current.dueAt)} ({current.timeZone})</Typography>}
  {current?.cancelledAt&&<Typography>{t.CANCELLED}: {current.cancellationReason}</Typography>}
  <Typography variant="subtitle2">{t.reports}</Typography>
  {data&&!data.reports.length&&<Typography color="text.secondary">{t.noReports}</Typography>}
  {data?.reports.map(report=><Paper key={report.id} variant="outlined" sx={{p:1.5}}><Stack spacing={1}>
   <Typography variant="caption">{t.submittedAt}: {format(report.submittedAt)}</Typography>
   <Chip size="small" label={new Date(report.submittedAt)<=new Date(report.taskSnapshot.dueAt)?t.onTime:t.late}/>
   <Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{report.body}</Typography>
   {report.files?.length>0&&<DocumentEvidenceFiles title={t.reportFiles} value={report.files} attachmentOnly languageCode={languageCode} orgId={orgId} purpose="WORK_REPORT"/>}
  </Stack></Paper>)}
  {data&&canSubmit&&<>
   <TextField data-text-case="preserve" label={t.reportBody} placeholder={t.bodyPlaceholder} value={body} onChange={event=>setBody(event.target.value)} multiline minRows={5} disabled={disabled||saving||uncertain} slotProps={{htmlInput:{maxLength:20000,'data-text-case':'preserve'}}}/>
   <DocumentEvidenceFiles title={t.reportFiles} attachmentOnly orgId={orgId} purpose="WORK_REPORT" languageCode={languageCode} value={files} onChange={setFiles} disabled={disabled||saving||uncertain} onBusyChange={setUploading}/>
   {actionsTarget?createPortal(<Button variant="contained" disabled={disabled||loading||saving||uploading} onClick={submit}>{uncertain?t.retry:t.submit}</Button>,actionsTarget):<Button variant="contained" disabled={disabled||loading||saving||uploading} onClick={submit}>{uncertain?t.retry:t.submit}</Button>}
  </>}
 </Stack>;
}
