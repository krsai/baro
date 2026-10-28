import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,TextField,Typography} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {approvalSettingsText} from '../constants/approvalSettings';
import {expenseHeaderActions} from '../constants/expenseHeaderActions';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export default forwardRef(function ExpenseApprovalSettings({orgId,languageCode,steps=[],drafter,items=[],sourceKind,sourceId,value=null,onChange,disabled,actions},ref){
 const t=expenseHeaderActions[languageCode]||expenseHeaderActions.en,rules=approvalSettingsText[languageCode]||approvalSettingsText.en;
 const [open,setOpen]=useState(false),[draft,setDraft]=useState({}),[preview,setPreview]=useState(null),[applied,setApplied]=useState(null),[state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [viewOnly,setViewOnly]=useState(true),pending=useRef(null);
 const close=()=>{setOpen(false);pending.current?.(null);pending.current=null;};
 useImperativeHandle(ref,()=>({prepare:()=>new Promise(resolve=>{
  pending.current=resolve;setDraft(value||{});setError('');setViewOnly(false);setOpen(true);
 })}),[value,state]);
 useEffect(()=>{setOpen(false);setApplied(null);return()=>{pending.current?.(null);pending.current=null;};},[orgId,sourceKind,sourceId]);
 const input=JSON.stringify({items,sourceKind,sourceId}),selection=JSON.stringify(open?draft:value);
 useEffect(()=>subscribeWorkspaceDataChanged(detail=>{if(Number(detail.orgId)===Number(orgId)&&detail.topics?.includes('expense-approval-settings'))setReload(n=>n+1);}),[orgId]);
 useEffect(()=>{setState(null);let alive=true;
  requestJSON(`/expense-approval-settings${buildQueryString({orgId})}`,{skipCache:true}).then(data=>{if(alive)setState(data);}).catch(()=>{if(alive)setError(t.error);});
  return()=>{alive=false;};
 },[orgId,reload]);
 useEffect(()=>{let alive=true;setPreview(null);setError('');
  if(!open||viewOnly)return;
  setBusy(true);
  const timeout=setTimeout(()=>requestJSON(`/expense-approval-preview${buildQueryString({orgId})}`,{method:'POST',body:JSON.stringify({...JSON.parse(input),selection:JSON.parse(selection)||{}})})
   .then(result=>{if(alive)setPreview(result);})
   .catch(failure=>{if(alive){const code=failure.details?.error||failure.message;setError(code==='APPROVAL_CURRENCY_LIMIT_REQUIRED'?rules.limitMissing:code==='INVALID_EXPENSE_APPROVERS'?rules.error:code==='EXPENSE_SELF_APPROVAL'?rules.selfError:t.amount);}})
   .finally(()=>{if(alive)setBusy(false);}),180);
  return()=>{alive=false;clearTimeout(timeout);};
 },[orgId,input,selection,open,reload,viewOnly]);
 const name=(id)=>state?.candidates?.find(row=>row.id===id)?.name||steps.find(row=>row.employeeId===id)?.employee?.name||String(id);
 const configured=value!==null||steps.length>0;
 const summary=applied?.stages?.filter(stage=>!stage.vacant&&stage.employeeId).map(stage=>({id:stage.employeeId,name:stage.name||name(stage.employeeId)}))||steps.map(step=>({id:step.employeeId,name:step.employee?.name||name(step.employeeId)}));
 return <>
  <Button variant="outlined" disabled={disabled||!configured} onClick={()=>{setError('');setViewOnly(true);setOpen(true);}} aria-label={t.approval} data-testid="expense-approval-button" sx={{minHeight:36,justifyContent:'flex-start',minWidth:0,textTransform:'none'}}>
   {configured?<Box sx={{display:'flex',alignItems:'center',gap:.5,overflowX:'auto',whiteSpace:'nowrap',width:'100%'}}><Typography variant="caption" sx={{flexShrink:0}}>{t.approval}</Typography><Chip size="small" label={drafter?.name||state?.drafter?.name||t.drafter}/>{summary.map(step=><React.Fragment key={step.id}><Typography>›</Typography><Chip size="small" label={step.name}/></React.Fragment>)}{!summary.length&&<Typography variant="caption">› {t.none}</Typography>}</Box>:t.approval}
  </Button>
  <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="expense-approval-title">
   <DialogTitle id="expense-approval-title">{t.approval}</DialogTitle>
   <DialogContent dividers><Stack spacing={2}>
    <TextField label={t.drafter} value={drafter?.name||preview?.drafter?.name||state?.drafter?.name||''} slotProps={{input:{readOnly:true}}}/>
    {busy&&!viewOnly&&<Typography color="text.secondary">{t.loading}</Typography>}
    {!viewOnly&&preview?.policy?.totals&&<Typography variant="body2" color="text.secondary">{rules.total}: {preview.policy.totals.map(row=>`${Number(row.amount).toLocaleString()} ${row.currency}`).join(' / ')}</Typography>}
    {error&&<Alert severity="warning">{error}</Alert>}
    {viewOnly?summary.map((step,index)=><Stack key={step.id} spacing={1} alignItems="center"><Typography color="text.secondary">↓</Typography><TextField fullWidth label={`${index+1}. ${t.approver||rules.approver}`} value={step.name} slotProps={{input:{readOnly:true}}}/></Stack>):preview?.stages?.filter(stage=>!stage.vacant).map((stage,index)=><Stack key={stage.key} spacing={1} alignItems="center"><Typography color="text.secondary">↓</Typography><TextField fullWidth select error={stage.invalid} helperText={stage.invalid?rules.error:undefined} id={`expense-stage-${stage.key}`} label={`${index+1}. ${t[stage.key]}`} value={draft[`${stage.key}EmployeeId`]||''} onChange={event=>{const selected=event.target.value;setDraft(current=>({...current,[`${stage.key}EmployeeId`]:selected&&selected!=='vacant'?Number(selected):null,[`${stage.key}Vacant`]:selected==='vacant'}));}} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}}>
     <MenuItem value="" disabled>{t.select}</MenuItem>
     {draft[`${stage.key}EmployeeId`]&&!stage.candidates?.some(row=>row.id===draft[`${stage.key}EmployeeId`])&&<MenuItem disabled value={draft[`${stage.key}EmployeeId`]}>{name(draft[`${stage.key}EmployeeId`])}</MenuItem>}
     {stage.candidates?.map(row=><MenuItem key={row.id} value={row.id}>{row.name}{row.grade?.name?` · ${row.grade[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row.grade.name}`:''}</MenuItem>)}
    </TextField></Stack>)}
    {((viewOnly&&!summary.length)||(!viewOnly&&preview?.complete&&!preview.ids.length))&&<Alert severity="info">{t.none}</Alert>}
    {viewOnly&&actions}
   </Stack></DialogContent>
   <DialogActions><Button onClick={close}>{viewOnly?getCloseText(languageCode):t.cancel}</Button>{!viewOnly&&<Button variant="contained" disabled={busy||!preview?.complete||!!error} onClick={()=>{setApplied(preview);onChange(draft);setOpen(false);pending.current?.(draft);pending.current=null;}}>{t.confirmSave}</Button>}</DialogActions>
  </Dialog>
 </>;
});
const getCloseText=languageCode=>({ko:'닫기',en:'Close',vi:'Đóng'})[languageCode]||'Close';
