import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Chip,CircularProgress,Collapse,Dialog,DialogActions,DialogContent,DialogTitle,Paper,Stack,Typography} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {ledgerEvidenceErrors} from '../constants/ledgerEvidence';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
import {emitWorkspaceDataChanged,subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export default function ExpenseApprovalActions({requestId,version,orgId,languageCode,disabled,dirty=false,onRefresh,drafter,onState}) {
 const t=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 const [result,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[reload,setReload]=useState(0),[history,setHistory]=useState(true),[confirm,setConfirm]=useState(false);
 const scope=`${orgId}:${requestId}:${version}`,current=useRef(scope),lock=useRef(false);current.current=scope;
 const state=result?.scope===scope?result.value:null;
 const path=`/expense-requests/${requestId}/approval${buildQueryString({orgId})}`;
 useEffect(()=>{onState?.(state);},[state,onState]);
 const message=e=>{const code=e.details?.error||e.message;return code==='EXPENSE_REQUEST_CHANGED'?t.changed:(ledgerEvidenceErrors[languageCode]||ledgerEvidenceErrors.en)[code]||t.failed;};
 useEffect(()=>subscribeWorkspaceDataChanged(detail=>{if(Number(detail.orgId)===Number(orgId)&&detail.topics?.includes('expense-approvals'))setReload(n=>n+1);}),[orgId]);
 useEffect(()=>{current.current=scope;setHistory(true);setConfirm(false);setBusy(false);lock.current=false;return()=>{if(current.current===scope)current.current='';};},[scope]);
 useEffect(()=>{
  setState(null);setError('');if(!requestId)return;let active=true;
  const controller=new AbortController();setLoading(true);
  requestJSON(path,{skipCache:true,signal:controller.signal}).then(value=>{if(active)setState({scope,value});}).catch(()=>{if(active)setError(t.error);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;controller.abort();};
 },[requestId,orgId,version,reload]);
 if(!requestId)return null;
 const stale=state&&Number(state.version)!==Number(version);
 const next=state?.steps?.find(step=>!step.approved);
 const approve=async()=>{
  if(lock.current||disabled||stale||!state?.canApprove)return;
  lock.current=true;setBusy(true);setError('');const submittedScope=scope,reviewedVersion=Number(version);
  try{
   const result=await requestJSON(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:reviewedVersion})});
   if(current.current!==submittedScope)return;
   setState({scope:submittedScope,value:result});setConfirm(false);
   emitWorkspaceDataChanged({orgId,topics:['expense-approvals','bank-ledger'],source:'expense-approval'});
  }catch(e){if(current.current===submittedScope){setError(message(e));const code=e.details?.error||e.message;if(['EXPENSE_REQUEST_CHANGED','EXPENSE_APPROVAL_NOT_YOUR_TURN'].includes(code)){setConfirm(false);setReload(value=>value+1);}}}
  finally{if(current.current===submittedScope){lock.current=false;setBusy(false);}}
 };
 return <Paper variant="outlined" sx={{p:2}} data-testid="expense-approval-actions">
  <Stack direction={{xs:'column',sm:'row'}} spacing={1} alignItems={{sm:'center'}}>
   <Box sx={{flex:1}}><Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={600}>{t.title}</Typography>{loading?<CircularProgress size={16}/>:state&&<Chip size="small" variant="outlined" color={state.approved?'success':'default'} label={state.approved?t.approved:t.pending}/>}</Stack>
    {next&&<Typography variant="body2" sx={{mt:.5}}>{t.next}: {next.employee?.name || '—'}</Typography>}
   </Box>
   {state&&<Button onClick={()=>setHistory(value=>!value)}>{t.history}</Button>}
   {state?.canApprove&&<Button variant="contained" disabled={busy||disabled||stale||loading} onClick={()=>{setError('');setConfirm(true);}}>{t.approve}</Button>}
  </Stack>
  {drafter?.name&&<Typography variant="body2" sx={{mt:1}}>{t.drafter}: {drafter.name}</Typography>}
  {dirty&&<Alert severity="info" sx={{mt:1}}>{t.dirty}</Alert>}
  {stale&&<Alert severity="warning" sx={{mt:1}} action={onRefresh&&<Button disabled={disabled||busy} onClick={onRefresh}>{t.refresh}</Button>}>{t.changed}</Alert>}
  {error&&<Alert severity="error" sx={{mt:1}} action={!state&&<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{error}</Alert>}
  {state&&!state.steps?.length&&<Typography variant="body2" sx={{mt:1}}>{state.exempt?t.exempt:t.none}</Typography>}
  <Collapse in={history}><Stack spacing={1} sx={{mt:1}}>{state?.steps?.map(step=><Stack key={step.id} direction="row" spacing={1} alignItems="center"><Typography variant="body2">{step.position}. {step.employee?.name || '—'}</Typography><Chip size="small" variant="outlined" label={step.approved?t.approved:t.pending}/>{step.approvedAt&&<Typography variant="caption" color="text.secondary">{new Date(step.approvedAt).toLocaleString(languageCode)}</Typography>}</Stack>)}</Stack></Collapse>
  <Dialog open={confirm} onClose={busy?undefined:()=>setConfirm(false)} fullWidth maxWidth="xs" aria-labelledby="expense-approval-confirm-title">
   <DialogTitle id="expense-approval-confirm-title">{t.confirm}</DialogTitle><DialogContent><Stack spacing={1}><Typography>{state?.managementNumber}</Typography><Typography>{t.version}: {version}</Typography><Typography>{t.next}: {next?.employee?.name}</Typography>{error&&<Alert severity="error">{error}</Alert>}</Stack></DialogContent>
   <DialogActions><Button disabled={busy} onClick={()=>setConfirm(false)}>{t.cancel}</Button><Button variant="contained" disabled={busy||disabled||stale||!state?.canApprove} onClick={approve}>{busy?<CircularProgress size={18}/>:t.approve}</Button></DialogActions>
  </Dialog>
 </Paper>;
}
