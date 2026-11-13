import {approvalVacancyText} from '../constants/approvalVacancy';
import ApprovalStageFlow from './ApprovalStageFlow';
import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,LinearProgress,Paper,Stack,TextField,Typography} from '@mui/material';
import {changeApprovalText,changeApprovalError} from '../constants/changeApprovals';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
export default forwardRef(function ChangeApprovalDialog({orgId,languageCode='ko'},ref){
 const t=changeApprovalText[languageCode]||changeApprovalText.en;
 const [input,setInput]=useState(null),[selection,setSelection]=useState({}),[reason,setReason]=useState(''),[preview,setPreview]=useState(null),[grades,setGrades]=useState([]),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const resolver=useRef(null),key=useRef(''),submitted=useRef(null),locked=useRef(false),scope=useRef(orgId);scope.current=orgId;
 const finish=value=>{setInput(null);resolver.current?.(value);resolver.current=null;};
 useImperativeHandle(ref,()=>({prepare:value=>new Promise(resolve=>{resolver.current?.(null);resolver.current=resolve;key.current=crypto.randomUUID();submitted.current=null;setSelection(value.selection||{});setReason(value.reason||'');setError('');setUncertain(false);setPreview(null);setInput(JSON.parse(JSON.stringify(value)));})}),[]);
 useEffect(()=>{finish(null);setGrades([]);return()=>{resolver.current?.(null);resolver.current=null;};},[orgId]);
 useEffect(()=>{if(!input)return;let alive=true;requestJSON('/approval-action-settings'+buildQueryString({orgId,menu:input.menu,operation:input.operation}),{skipCache:true}).then(data=>{if(alive)setGrades(data.grades);}).catch(e=>{if(alive)setError(e);});return()=>{alive=false;};},[orgId,input?.menu,input?.operation]);
 const selected=JSON.stringify(selection);
 useEffect(()=>{if(!input||uncertain)return;let alive=true;setLoading(true);setError('');const timer=setTimeout(()=>requestJSON('/change-approval-preview'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({...input,selection})}).then(data=>{if(alive)setPreview(data);}).catch(e=>{if(alive){setPreview(null);setError(e);}}).finally(()=>{if(alive)setLoading(false);}),120);return()=>{alive=false;clearTimeout(timer);};},[orgId,input,selected,uncertain]);
 const send=async()=>{if(locked.current)return;locked.current=true;setBusy(true);setError('');const company=orgId;
  const chosen={...selection,...Object.fromEntries((preview?.stages||[]).filter(s=>s.employeeId).map(s=>[s.key+'EmployeeId',s.employeeId]))};
  if(input.selectionOnly){locked.current=false;setBusy(false);finish({selection:chosen,preview});return;}
  submitted.current=submitted.current||{...input,reason:reason.trim(),selection:chosen,clientKey:key.current};
  try{const result=await requestJSON('/change-approval-requests'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(submitted.current)});emitWorkspaceDataChanged({orgId,source:'change-approval',topics:['change-approvals','bank-ledger','expense-requests','issued-invoices']});if(scope.current===company)finish(result);}
  catch(e){if(scope.current===company){const unknown=!e.status||e.status>=500;setUncertain(unknown);setError(unknown?{uncertain:true}:e);if(!unknown)submitted.current=null;}}
  finally{locked.current=false;if(scope.current===company)setBusy(false);}
 };
 return <Dialog open={!!input} onClose={()=>{if(!busy&&!uncertain)finish(null);}} fullWidth maxWidth="md"><DialogTitle>{t[input?.menu]} · {input?.menu==='INVOICE'?t.requestCancel:input?.operation==='CREATE'?t.CREATE:input?.operation==='DELETE'?t.requestDelete:t.requestUpdate}</DialogTitle><DialogContent dividers><Stack spacing={2}>
  {loading&&<LinearProgress/>}{error&&<Alert severity="error">{error.uncertain?t.uncertain:changeApprovalError(error,t)}</Alert>}
  <Typography variant="body2">{preview?.policy?.totals?.map(row=>formatInvoiceMoney(row.amount,row.currency)).join(' / ')}</Typography>
  <TextField fullWidth label={t.reason} required={input?.operation==='DELETE'} value={reason} disabled={busy||uncertain} inputProps={{maxLength:1000}} onChange={e=>{setReason(e.target.value);key.current=crypto.randomUUID();submitted.current=null;}}/>
  {preview?.policy?.autoApproved&&<Typography variant="body2">{(approvalVacancyText[languageCode]||approvalVacancyText.en).automatic}</Typography>}
  <ApprovalStageFlow drafter={preview?.drafter} stages={preview?.stages?.filter(s=>!s.vacant)||[]} grades={grades} languageCode={languageCode} value={selection} disabled={busy||uncertain||loading} onChange={(stageKey,id)=>{setSelection(current=>({...current,[stageKey+'EmployeeId']:id}));key.current=crypto.randomUUID();submitted.current=null;}}/>

  {preview&&!preview.complete&&<Alert severity="warning">{t.required}</Alert>}
 </Stack></DialogContent><DialogActions><Button variant="contained" disabled={busy||loading||!uncertain&&(!preview?.complete||!!error||input?.operation==='DELETE'&&!reason.trim())} onClick={send}>{uncertain?t.retry:t.request}</Button></DialogActions></Dialog>;
});
