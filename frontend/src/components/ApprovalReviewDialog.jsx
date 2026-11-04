import {approvalBandText} from '../constants/approvalBands';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {ExpenseRequestContent} from './ExpenseRequestView';
import StatusLabel from './StatusLabel';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {approvalReviewText} from '../constants/approvalReview';
import {changeApprovalText,changeApprovalError} from '../constants/changeApprovals';
import {getUiMessage} from '../constants/uiMessages';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';

const tone=s=>({REQUESTED:'yellow',WAITING:'gray',APPROVED:'green',REJECTED:'red',STOPPED:'orange'})[s]||'gray';
export function ApprovalReviewTable({rows,languageCode,onView,empty}){
 const t=approvalReviewText[languageCode]||approvalReviewText.en,w=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 return <TableContainer><Table size="small" sx={{minWidth:700}}><TableHead><TableRow>{[w.type,a.number,a.drafter,t.operation,t.date,t.view].map(label=><TableCell key={label} sx={{whiteSpace:'nowrap'}}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.kind+':'+row.id} hover><TableCell>{getUiMessage(row.menu==='BANK_LEDGER'?'menu.bankLedger':'menu.outsourcingRecord','',languageCode)}</TableCell><TableCell sx={{overflowWrap:'anywhere'}}>{row.managementNumber}</TableCell><TableCell>{row.drafter}</TableCell><TableCell>{t[row.operation]}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{row.requestDate}</TableCell><TableCell><Button size="small" onClick={()=>onView(row)}>{t.view}</Button></TableCell></TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={6}>{empty||w.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer>;
}
export default function ApprovalReviewDialog({row,orgId,languageCode,onClose,onDecided}){
 const t=approvalReviewText[languageCode]||approvalReviewText.en,c=changeApprovalText[languageCode]||changeApprovalText.en;
 const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reason,setReason]=useState(''),[reload,setReload]=useState(0),lock=useRef(false),current=useRef('');
 useEffect(()=>()=>{current.current='';},[]);
 const scope=row?`${orgId}:${row.kind}:${row.id}`:'';current.current=scope;const detail=result?.scope===scope?result.value:null;
 useEffect(()=>{setResult(null);setError('');setReason('');setBusy(false);lock.current=false;if(!row)return;let live=true;const controller=new AbortController();requestJSON(`/approval-reviews/${row.kind}/${row.id}`+buildQueryString({orgId}),{skipCache:true,signal:controller.signal}).then(value=>{if(live)setResult({scope,value});}).catch(e=>{if(live&&e.name!=='AbortError')setError(changeApprovalError(e,c));});return()=>{live=false;controller.abort();};},[scope,reload]);
 const decide=async decision=>{if(lock.current||!detail?.canDecide)return;if(decision==='REJECTED'&&!reason.trim())return;lock.current=true;setBusy(true);setError('');const submitted=scope;
  const path=row.kind==='CHANGE_APPROVAL'?`/change-approval-requests/${row.id}/decision`:row.kind==='EXPENSE_DELETION'?`/expense-deletion-requests/${row.id}/decision`:`/expense-requests/${row.id}/approval`;
  try{await requestJSON(path+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({decision,reason:reason.trim(),...(row.kind==='EXPENSE_REQUEST'?{version:detail.version}:{})})});emitWorkspaceDataChanged({orgId,source:'approval-review',topics:['expense-approvals','change-approvals','expense-requests','bank-ledger']});if(current.current===submitted){onDecided?.();onClose();}}
  catch(e){if(current.current===submitted)setError(changeApprovalError(e,c));}finally{if(current.current===submitted){lock.current=false;setBusy(false);}}
 };
 const person=p=>p?[(approvalBandText[languageCode]||approvalBandText.en)[p.orgRole],p.name,p.grade?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||p.grade?.name].filter(Boolean).join(' · '):'—';
 const content=(source,proposed=false)=>{
  if(detail.menu==='EXPENSE'){const document=source?.document||{},items=source?.costs||document.items||[];return <ExpenseRequestContent languageCode={languageCode} document={{...document,items,currencyTotals:document.currencyTotals||[]}}/>;}
  const main=proposed?detail.after?.rows?.find(r=>r.entryKind==='BANK'):source?.entry,account=proposed?detail.before.proposedAccount||detail.before.account:source?.account,party=proposed?detail.before.proposedCounterparty?.name:main?.counterpartyName;
  const values=[[t.dateTransaction,main?.transactionDate],[t.account,account?.name],[t.party,party],[t.direction,t[main?.direction]],[t.amount,main?.amount==null?'—':formatInvoiceMoney(String(main.amount),account?.currencyCode)],[t.purpose,main?.remark||main?.purpose],[t.reference,main?.evidenceNumber],...(!proposed?[[t.fee,main?.bankFee],[t.writeoff,main?.writeOffAmount]]:[])];
  return <Stack spacing={1}>{values.map(([label,value])=><Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{value??'—'}</Typography></Box>)}{proposed&&detail.after.rows.filter(r=>r.entryKind!=='BANK').map((r,index)=><Typography key={index}>{r.entryKind}: {formatInvoiceMoney(String(r.amount),account?.currencyCode)} · {r.purpose}</Typography>)}</Stack>;
 };
 return <Dialog open={!!row} onClose={()=>{if(!busy)onClose();}} fullWidth maxWidth="xl" aria-labelledby="approval-review-title"><DialogTitle id="approval-review-title">{getUiMessage((detail?.menu||row?.menu)==='BANK_LEDGER'?'menu.bankLedger':'menu.outsourcingRecord','',languageCode)} · {t[detail?.operation||row?.operation]} · {row?.managementNumber}</DialogTitle><DialogContent dividers><Stack spacing={2}>
 {error&&<Alert severity="error" action={!detail&&<Button onClick={()=>setReload(n=>n+1)}>{c.retry}</Button>}>{error}</Alert>}
 {!detail&&!error?<CircularProgress size={24}/>:detail&&<>
 <Paper variant="outlined" sx={{p:2}}><Stack direction={{xs:'column',sm:'row'}} spacing={2}><Typography>{t.drafter}: {person(detail.drafter)}</Typography><Typography>{t.date}: {row.requestDate}</Typography></Stack><Typography variant="subtitle2" sx={{mt:1}}>{t.reason}</Typography><Typography sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{detail.reason||'—'}</Typography></Paper>
 <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:detail.operation==='UPDATE'?'repeat(2,minmax(0,1fr))':'minmax(0,1fr)'},gap:2}}><Paper variant="outlined" sx={{p:2,minWidth:0}}><Typography variant="h6" sx={{mb:2}}>{detail.operation==='DELETE'?t.deleted:t.before}</Typography>{detail.operation==='DELETE'&&<Typography color="text.secondary" variant="body2" sx={{mb:1}}>{t.deletedNote}</Typography>}{content(detail.before)}</Paper>{detail.operation==='UPDATE'&&<Paper variant="outlined" sx={{p:2,minWidth:0}}><Typography variant="h6" sx={{mb:2}}>{t.after}</Typography>{content(detail.after,true)}</Paper>}</Box>
 <Paper variant="outlined" sx={{p:2}}><Typography variant="h6" sx={{mb:1}}>{t.line}</Typography><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(auto-fit,minmax(200px,1fr))'},gap:1}}><Paper variant="outlined" sx={{p:1.5,bgcolor:'#EAF2FF'}}><Typography variant="caption">{t.drafter}</Typography><Typography variant="body2">{person(detail.drafter)}</Typography></Paper>{detail.approvalLine.map((stage,index)=><Paper key={index} variant="outlined" sx={{p:1.5,minWidth:0}}><Typography variant="caption">{index===detail.approvalLine.length-1?t.final:`${t.middle} ${index+1}`}</Typography><Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{stage.person?person(stage.person):`${t.candidates}: ${(stage.candidates||[]).map(person).join(', ')||'—'}`}</Typography><StatusLabel tone={tone(stage.state)} label={t[stage.state]||stage.state}/>{stage.reason&&<Typography variant="caption" display="block">{stage.reason}</Typography>}</Paper>)}</Box>{detail.exempt&&<Typography variant="body2" sx={{mt:1}}>{t.exempt}</Typography>}</Paper>
 {!detail.canDecide&&<Typography variant="caption" color="text.secondary">{t.readonly}</Typography>}
 {detail.canDecide&&<TextField id="approval-review-reason" fullWidth multiline minRows={2} label={t.rejectReason} value={reason} disabled={busy} inputProps={{maxLength:1000}} onChange={e=>setReason(e.target.value)}/>}
 </>}
 </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>{t.close}</Button>{detail?.canDecide&&<><Button disabled={busy||!reason.trim()} onClick={()=>decide('REJECTED')}>{t.reject}</Button><Button variant="contained" disabled={busy} onClick={()=>decide('APPROVED')}>{t.approve}</Button></>}</DialogActions></Dialog>;
}
