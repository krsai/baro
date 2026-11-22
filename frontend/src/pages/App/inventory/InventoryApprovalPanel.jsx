import Dialog from '../../../components/AppDialog';
import {inventoryEntryText} from '../../../constants/inventoryEntry';
import {approvalDefaultsText} from '../../../constants/approvalDefaults';
import React,{useEffect,useRef,useState} from 'react';
import {Button,DialogActions,DialogContent,DialogTitle,Paper,Stack,Typography} from '@mui/material';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {useAppActions} from '../../../context/AppContext';
import AppNotice from '../../../components/AppNotice';
import SaveButton from '../../../components/SaveButton';
import ApprovalStageFlow from '../../../components/ApprovalStageFlow';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {emitWorkspaceDataChanged} from '../../../utils/workspaceDataEvents';
import {inventoryApprovalText,inventoryApprovalError} from '../../../constants/inventoryApproval';
import {materialItemName,materialItemText} from '../../../constants/materialItems';

const request=(path,orgId,options)=>requestJSON('/inventory-entry'+path+buildQueryString({orgId}),{skipCache:true,...options});
const stagesFor=stages=>stages.map((stage,index)=>({...stage,key:stage.key||'step'+(index+1),candidates:stage.candidates||[{id:stage.employeeId,name:stage.name}]}));
const changed=orgId=>emitWorkspaceDataChanged({orgId,topics:['inventory-movements','inventory-stock','inventory-approvals']});

export function InventoryDeleteDialog({row,onClose,onSaved}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions(),navigate=useNavigate();
 const t=inventoryApprovalText[languageCode]||inventoryApprovalText.en,m=materialItemText[languageCode]||materialItemText.en;
 const [selection,setSelection]=useState({});
 const [preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const pending=useRef(null),lock=useRef(false),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;setPreview(null);requestJSON('/inventory-entry/approval-preview'+buildQueryString({orgId,operation:'DELETE',selection:JSON.stringify(selection)}),{skipCache:true}).then(value=>{if(active)setPreview(value);}).catch(e=>{if(active)setError(inventoryApprovalError(e,t,m.failed));});return()=>{active=false;};},[orgId,reload,t,m.failed,selection]);
 const save=async()=>{
  if(lock.current||!preview||preview.stages.some(stage=>!stage.employeeId))return;lock.current=true;setBusy(true);setError('');
  pending.current??={clientKey:crypto.randomUUID(),revision:row.revision,approvalRevision:preview.policy.revision,approvalSelection:Object.fromEntries(preview.stages.map(stage=>[stage.key+'EmployeeId',stage.employeeId]))};
  try{await request('/'+row.id+'/delete-request',orgId,{method:'POST',body:JSON.stringify(pending.current)});if(!live.current)return;pending.current=null;changed(orgId);showNotification(preview?.stages.length?t.submitted:(approvalDefaultsText[languageCode]||approvalDefaultsText.en).noApproval,'success');onSaved();}
  catch(e){if(live.current){if(e.status>=400&&e.status<500)pending.current=null;setError(inventoryApprovalError(e,t,m.failed));}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 };
 return <Dialog open fullWidth maxWidth="md" onClose={()=>!busy&&!pending.current&&onClose()}><DialogTitle>{t.deleteTitle}</DialogTitle><DialogContent><Stack spacing={2}>
  <Typography>{[row.date,materialItemName(row.master,languageCode),row.quantity,materialItemName(row.master.unit,languageCode)].join(' · ')}</Typography><Typography>{t.deleteConfirm}</Typography>
  {error&&<AppNotice severity="error" action={<Button disabled={busy} onClick={()=>pending.current?save():setReload(n=>n+1)}>{m.retry}</Button>}>{error}</AppNotice>}
  {preview?<ApprovalStageFlow drafter={preview.drafter} stages={stagesFor(preview.stages)} languageCode={languageCode} value={selection} onChange={(key,id)=>setSelection(current=>({...current,[key+'EmployeeId']:id}))} disabled={busy||Boolean(pending.current)}/>:<Button onClick={()=>navigate('/approval-settings?menu=INVENTORY')}>{t.settings}</Button>}
 </Stack></DialogContent><DialogActions><Button variant="outlined" disabled={busy||Boolean(pending.current)} onClick={onClose}>{t.cancel}</Button><SaveButton loading={busy} disabled={!preview||preview.stages.some(stage=>!stage.employeeId)} onClick={save}>{t.submit}</SaveButton></DialogActions></Dialog>;
}

export default function InventoryApprovalPanel({onChanged}){
 const {activeOrgId:orgId}=useAuth(),{languageCode}=useLanguage(),{showNotification}=useAppActions();
 const t=inventoryApprovalText[languageCode]||inventoryApprovalText.en,m=materialItemText[languageCode]||materialItemText.en;
 const [rows,setRows]=useState([]),[error,setError]=useState(''),[reload,setReload]=useState(0),[busy,setBusy]=useState(false);
 const pending=useRef(null),locked=useRef(false),live=useRef(true);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;setError('');request('/approvals',orgId).then(value=>{if(active)setRows(value);}).catch(e=>{if(active)setError(inventoryApprovalError(e,t,m.failed));});return()=>{active=false;};},[orgId,reload,t,m.failed]);
 useWorkspaceRefreshOnEvent({orgId,topics:['inventory-movements','inventory-approvals'],isBlocked:busy||Boolean(pending.current),onRefresh:()=>setReload(n=>n+1)});
 const decide=async(row,decision)=>{
  if(locked.current)return;locked.current=true;setBusy(true);setError('');pending.current??={id:row.id,revision:row.revision,decision};
  const attempt=pending.current;
  try{await request('/approvals/'+attempt.id+'/decision',orgId,{method:'POST',body:JSON.stringify({revision:attempt.revision,decision:attempt.decision})});if(!live.current)return;pending.current=null;changed(orgId);showNotification(t.decided,'success');setReload(n=>n+1);onChanged();}
  catch(e){if(live.current){if(e.status>=400&&e.status<500)pending.current=null;setError(inventoryApprovalError(e,t,m.failed));}}
  finally{locked.current=false;if(live.current)setBusy(false);}
 };
 return <Stack spacing={2}>{error&&<AppNotice severity="error" action={<Button disabled={busy} onClick={()=>pending.current?decide():setReload(n=>n+1)}>{m.retry}</Button>}>{error}</AppNotice>}{rows.map(row=><Paper variant="outlined" key={row.id} sx={{p:2}}><Stack spacing={1}>
  <Typography variant="subtitle2">{t[row.operation]} · {row.date} · {materialItemName(row.master,languageCode)} · {row.quantity} {materialItemName(row.master.unit,languageCode)}</Typography>
  {row.userSnapshot&&<Typography variant="body2">{(inventoryEntryText[languageCode]||inventoryEntryText.en).user} ? {[row.userSnapshot.employeeNo,row.userSnapshot.name].filter(Boolean).join(' / ')}</Typography>}
  {row.purchaseSnapshot&&<Typography variant="body2">{t.purchase} · {row.purchaseSnapshot.managementNumber||row.purchaseSnapshot.requestId} / {row.purchaseSnapshot.line} · {row.purchaseSnapshot.description}</Typography>}
  <ApprovalStageFlow drafter={row.drafter} stages={stagesFor(row.stages)} languageCode={languageCode} readOnly renderStatus={stage=><Typography variant="caption">{stage.decision?t[stage.decision]:t.PENDING}</Typography>}/>
  {row.canDecide&&<Stack direction="row" spacing={1} justifyContent="flex-end"><Button disabled={busy||Boolean(pending.current)} onClick={()=>decide(row,'REJECTED')}>{t.reject}</Button><Button variant="contained" disabled={busy||Boolean(pending.current)} onClick={()=>decide(row,'APPROVED')}>{t.approve}</Button></Stack>}
 </Stack></Paper>)}</Stack>;
}
