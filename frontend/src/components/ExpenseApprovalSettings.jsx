import {expenseDeletionText} from '../constants/expenseDeletion';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {approvalRuleText} from './ApprovalRuleEditor';
import ApprovalStagePerson from './ApprovalStagePerson';
import {approvalLineText} from '../constants/approvalLine';
import {approvalStepState,approvalStepLabels,approvalStepTone} from '../utils/approvalStepState.mjs';
import ArrowForward from '@mui/icons-material/ArrowForward';
import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,LinearProgress,Paper,Stack,Typography} from '@mui/material';
import StatusLabel from './StatusLabel';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {approvalSettingsText} from '../constants/approvalSettings';
import {expenseHeaderActions} from '../constants/expenseHeaderActions';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';

export default forwardRef(function ExpenseApprovalSettings({orgId,languageCode,steps=[],drafter,items=[],sourceKind,sourceId,value=null,onChange,disabled,actions,approvalStatus,vertical=false,horizontalStages=false,documentLoading=false,draftDirty=false,existingDocument=Boolean(sourceKind&&sourceId)},ref){
 disabled=disabled||documentLoading;
 const lineText=approvalLineText[languageCode]||approvalLineText.en,ruleText=approvalRuleText[languageCode]||approvalRuleText.en;
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
 const needsSettings=Boolean(orgId)&&(!existingDocument||open&&!viewOnly);
 useEffect(()=>{setState(null);if(!needsSettings)return;let alive=true;
  requestJSON(`/expense-approval-settings${buildQueryString({orgId})}`,{skipCache:true}).then(data=>{if(alive)setState(data);}).catch(()=>{if(alive)setError(t.error);});
  return()=>{alive=false;};
 },[orgId,reload,needsSettings]);
 useEffect(()=>{let alive=true;setPreview(null);setError('');
  if(!open||viewOnly)return;
  setBusy(true);
  const timeout=setTimeout(()=>requestJSON(`/expense-approval-preview${buildQueryString({orgId})}`,{method:'POST',body:JSON.stringify({...JSON.parse(input),selection:JSON.parse(selection)||{}})})
   .then(result=>{if(alive)setPreview(result);})
   .catch(failure=>{if(alive){const code=failure.details?.error||failure.message;setError(code==='EXPENSE_DRAFTER_NOT_ALLOWED'?(expenseDeletionText[languageCode]||expenseDeletionText.en).notAllowed:['APPROVAL_RULE_NOT_FOUND','APPROVAL_RULE_ORDER_CONFLICT','INVALID_APPROVAL_RULE','EXPENSE_DRAFTER_NOT_ALLOWED'].includes(code)?ruleText.error:code==='EXPENSE_DRAFTER_FIXED'?lineText.sameCompany:code==='APPROVAL_CURRENCY_LIMIT_REQUIRED'?rules.limitMissing:code==='INVALID_EXPENSE_APPROVERS'?ruleText.error:code==='EXPENSE_SELF_APPROVAL'?rules.selfError:lineText.invalidAmount);}})
   .finally(()=>{if(alive)setBusy(false);}),180);
  return()=>{alive=false;clearTimeout(timeout);};
 },[orgId,input,selection,open,reload,viewOnly]);
 const name=(id)=>state?.candidates?.find(row=>row.id===id)?.name||steps.find(row=>row.employeeId===id)?.employee?.name||String(id);
 const progressText=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 const stateLabels=approvalStepLabels[languageCode]||approvalStepLabels.en;
 const drafterState=existingDocument&&!draftDirty?'submitted':'draft';
 const progressState=id=>draftDirty?'unconfirmed':approvalStepState(approvalStatus,id);
 const progress=id=>' · '+stateLabels[progressState(id)];
 const configured=value!==null||steps.length>0||approvalStatus!=null;
 const selfDirected=approvalStatus?.exempt===true||applied?.policy?.exempt===true||approvalStatus?.exemptionReason==='ADMIN_DRAFTER'||(!existingDocument&&!approvalStatus&&!drafter&&!applied&&state?.drafter?.orgRole==='ADMIN'&&!state?.settings?.rules?.some(rule=>['ALL','ADMIN'].includes(rule.drafterRole)));
 const selfAuthorized=!documentLoading&&!draftDirty&&(approvalStatus?.exempt===true||approvalStatus?.exemptionReason==='ADMIN_DRAFTER');
 const emptySummary=selfAuthorized?'':approvalStatus?.exempt||applied?.complete?'':configured?progressText.none:'';
 const summary=documentLoading?[]:applied?.stages?.filter(stage=>!stage.vacant&&stage.employeeId).map(stage=>({id:stage.employeeId,name:stage.name||name(stage.employeeId)}))||steps.map(step=>({id:step.employeeId,name:step.employee?.name||name(step.employeeId)}));
 const stageText=({ko:{review:'중간 결재',final:'최종 결재'},en:{review:'Review',final:'Final approval'},vi:{review:'Duyệt trung gian',final:'Duyệt cuối'}})[languageCode]||{review:'Review',final:'Final approval'};
 const actualDrafter=documentLoading?null:drafter||(!existingDocument?state?.drafter:null);
 const cells=[{key:'drafter',label:t.drafter,name:actualDrafter?.name||'—',description:(actualDrafter?.name||'—')+' · '+stateLabels[drafterState],status:'drafter'},...(summary.length?summary.map((step,index)=>({key:step.id,label:index===summary.length-1?stageText.final:`${stageText.review} ${index+1}`,name:step.name,description:step.name+progress(step.id),status:progressState(step.id)})):[{key:'review',label:stageText.review,name:'—',status:'unconfirmed'},{key:'final',label:stageText.final,name:selfDirected?actualDrafter?.name||'—':'—',status:selfAuthorized?'approved':'unconfirmed'}])];
 const previewStages=preview?.stages?.filter(stage=>!stage.vacant)||[],previewDrafter=preview?.drafter||actualDrafter;
 const flowStages=preview?.policy?.exempt&&previewDrafter?[{key:'final-self',role:previewDrafter.orgRole,gradeId:previewDrafter.gradeId,employeeId:previewDrafter.id,candidates:[previewDrafter],final:true}]:previewStages;
 const flowCardCount=Math.max(2,flowStages.length+1,preview?0:summary.length+1);
 const confirm=()=>{const selected={...draft,...Object.fromEntries(previewStages.filter(stage=>stage.employeeId).map(stage=>[stage.key+'EmployeeId',stage.employeeId]))};setApplied(preview);onChange(selected);setOpen(false);pending.current?.(selected);pending.current=null;};
 return <>
  {horizontalStages&&<Button variant="text" disabled={disabled} onClick={()=>{setError('');setDraft(value||{});setViewOnly(false);setOpen(true);}} aria-label={t.approval} data-testid="expense-approval-button" sx={{p:0,width:'100%',minWidth:0,minHeight:36,textTransform:'none',textAlign:'left',borderRadius:1}}>
   <Box data-testid="expense-approval-stages" sx={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(140px,100%),1fr))',width:'100%',minWidth:0,border:1,borderColor:'divider',borderRadius:1,bgcolor:'background.paper',boxSizing:'border-box'}}>
    {cells.map(cell=><Box key={cell.key} sx={{p:.75,minWidth:0,display:'flex',flexDirection:'column',justifyContent:'flex-start',gap:.25}}>
     <Typography variant="caption" color="text.secondary" title={cell.label} sx={{minWidth:0,fontSize:11}}>{cell.label}</Typography>
     {cell.name==='—'?<Typography variant="body2" color="text.disabled" sx={{px:.75}}>—</Typography>:<StatusLabel tone={approvalStepTone(cell.status)} label={<><span>{cell.name}</span><span style={{fontSize:10}}>{stateLabels[cell.key==='drafter'?drafterState:cell.status]}</span></>} title={cell.description||cell.name} aria-label={cell.description||cell.name} data-approval-state={cell.status} sx={{height:'auto',minHeight:22,borderRadius:.75,width:'100%',minWidth:0,'& .MuiChip-label':{px:.75,py:.25,fontSize:12,display:'flex',flexDirection:'column',gap:.125,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.3}}}/>}
    </Box>)}
   </Box>
  </Button>}
  {!horizontalStages&&(vertical?<Box data-testid="expense-approval-column" sx={{minWidth:0}}><Typography variant="caption" color="text.secondary" sx={{display:'block',mb:.5}}>{t.approval}</Typography><Button variant="text" disabled={disabled} onClick={()=>{setError('');setDraft(value||{});setViewOnly(false);setOpen(true);}} aria-label={t.approval} data-testid="expense-approval-button" sx={{p:0,minWidth:0,justifyContent:'flex-start',textTransform:'none',textAlign:'left','&:hover':{bgcolor:'transparent'}}}><Stack spacing={.75} alignItems="flex-start">{summary.map((step,index)=>{const status=progressState(step.id),description=step.name+progress(step.id);return <Stack direction="row" spacing={1} alignItems="center" key={step.id} sx={{minHeight:30}}><Typography variant="caption" color="text.secondary">{index+1}</Typography><StatusLabel tone={approvalStepTone(status)} label={step.name+' / '+stateLabels[status]} title={description} aria-label={description} data-approval-state={status}/></Stack>;})}{!summary.length&&<Stack spacing={.5} alignItems="flex-start"><StatusLabel tone='blue' label={(actualDrafter?.name||t.drafter)+' / '+stateLabels[drafterState]} title={actualDrafter?.name||t.drafter} data-approval-state='drafter'/></Stack>}</Stack></Button></Box>:<Button variant="outlined" disabled={disabled} onClick={()=>{setError('');setDraft(value||{});setViewOnly(false);setOpen(true);}} aria-label={t.approval} data-testid="expense-approval-button" sx={{height:36,justifyContent:'flex-start',minWidth:0,textTransform:'none'}}>
   <Box sx={{display:'flex',alignItems:'center',gap:.5,overflowX:'auto',whiteSpace:'nowrap',width:'100%',scrollbarWidth:'none','&::-webkit-scrollbar':{display:'none'},'& .MuiChip-root':{flexShrink:0}}}><Typography variant="caption" sx={{flexShrink:0}}>{t.approval}</Typography><StatusLabel tone='blue' label={(actualDrafter?.name||t.drafter)+' / '+stateLabels[drafterState]} title={actualDrafter?.name||t.drafter} data-approval-state='drafter'/>{summary.map(step=>{const status=progressState(step.id),description=step.name+progress(step.id);return <React.Fragment key={step.id}><Typography>›</Typography><StatusLabel tone={approvalStepTone(status)} label={step.name+' / '+stateLabels[status]} title={description} aria-label={description} data-approval-state={status}/></React.Fragment>;})}{configured&&!summary.length&&<Typography variant="caption">› {emptySummary}</Typography>}</Box>
  </Button>)}
  <Dialog open={open} onClose={close} maxWidth={false} slotProps={{paper:{sx:{width:Math.min(1440,flowCardCount*240+(flowCardCount-1)*24+50),maxWidth:'calc(100% - 32px)',m:2}}}} aria-labelledby="expense-approval-title">
   <DialogTitle id="expense-approval-title"><Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}><Typography component="span" variant="inherit">{t.approval}</Typography><Typography component="span" variant="body2" data-testid="approval-modal-amount">{preview?.policy?.totals?.map(row=>formatInvoiceMoney(row.amount,row.currency)).join(' / ')}</Typography></Stack></DialogTitle>
   <DialogContent dividers><Stack spacing={1.5}>
    {busy&&<LinearProgress/>}
    {error&&<Alert severity="warning">{error}</Alert>}
    <Stack data-testid="approval-dialog-flow" direction="row" alignItems="center" sx={{overflowX:'auto',py:1}}>
     <Paper variant="outlined" data-approval-flow-card="drafter" sx={{p:1.5,width:240,minWidth:240,alignSelf:'stretch',boxSizing:'border-box'}}><Typography variant="subtitle2" sx={{mb:1.5}}>{t.drafter}</Typography>{previewDrafter&&<ApprovalStagePerson stage={{key:'drafter',role:previewDrafter.orgRole,gradeId:previewDrafter.gradeId,employeeId:previewDrafter.id,candidates:[previewDrafter]}} personLabel={lineText.name} grades={state?.grades} languageCode={languageCode} disabled onChange={()=>{}}/>}</Paper>
     {flowStages.map((stage,index)=><React.Fragment key={stage.key}><ArrowForward data-flow-arrow sx={{fontSize:18,width:24,minWidth:24,color:'text.disabled'}}/><Paper variant="outlined" data-approval-flow-card={stage.key} sx={{p:1.5,width:240,minWidth:240,alignSelf:'stretch',boxSizing:'border-box'}}><Typography variant="subtitle2" sx={{mb:1.5}}>{index===flowStages.length-1?lineText.final:`${lineText.middle} ${index+1}`}</Typography><ApprovalStagePerson stage={{...stage,final:index===flowStages.length-1}} personLabel={lineText.name} value={draft[stage.key+'EmployeeId']} onChange={employeeId=>setDraft(current=>({...current,[stage.key+'EmployeeId']:employeeId}))} grades={state?.grades} languageCode={languageCode} disabled={busy||stage.key==='final-self'}/></Paper></React.Fragment>)}
    </Stack>
    {preview?.stages?.some(stage=>stage.required)&&<Alert severity="error">{rules.accountantRequired}</Alert>}
   </Stack></DialogContent>
   <DialogActions><Button onClick={close}>{t.cancel}</Button><Button variant="contained" disabled={busy||!preview?.complete||!!error} onClick={confirm}>{t.confirmSave}</Button></DialogActions>
  </Dialog>
 </>;
});
const getCloseText=languageCode=>({ko:'닫기',en:'Close',vi:'Đóng'})[languageCode]||'Close';
