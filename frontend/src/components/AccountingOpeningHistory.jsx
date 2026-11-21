import ListPagination from './ListPagination';
import TableStatusRow from './TableStatusRow';
import {dialogTitle} from '../constants/dialogTitles';
import useChangeDrivenEffect from '../hooks/useChangeDrivenEffect';
import React,{useEffect,useRef,useState} from 'react';
import {Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import Alert from "./AppNotice";
import DeleteActionButton from './DeleteActionButton';
import ChangeApprovalDialog from './ChangeApprovalDialog';
import {accountingOpeningHistoryText} from '../constants/accountingOpeningHistory';
import {accountingOpeningText} from '../constants/accountingOpening';
import {ledgerBalanceText} from '../constants/ledgerBalance';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export default function AccountingOpeningHistory({orgId,languageCode,active,reload,onChanged,onLocked,onNotify}){
 const t=accountingOpeningHistoryText[languageCode]||accountingOpeningHistoryText.en,o=accountingOpeningText[languageCode]||accountingOpeningText.en,b=ledgerBalanceText[languageCode]||ledgerBalanceText.en;
 const [data,setData]=useState(null),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState(''),[selected,setSelected]=useState(null),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false);
 const changeRef=useRef(null),request=useRef(null),sending=useRef(false);
 useChangeDrivenEffect(()=>{if(!active)return;let live=true;setLoading(true);setData(null);setError('');
  requestJSON('/bank-ledger/opening/history'+buildQueryString({orgId,page}),{skipCache:true}).then(result=>{if(live)setData(result);}).catch(()=>{if(live)setError(o.failed);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[orgId,page,reload,refresh],{active});
 useEffect(()=>{onLocked(busy||uncertain);return()=>onLocked(false);},[busy,uncertain,onLocked]);
 const changed=()=>{setRefresh(v=>v+1);onChanged();};
 const remove=async row=>{
  if(row.source==='ACCOUNT'){
   setBusy(true);
   try{const result=await changeRef.current.prepare({menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:row.id,payload:{}});if(result)changed();}finally{setBusy(false);}
  }else{request.current=null;setReason('');setSelected(row);}
 };
 const confirm=async()=>{
  if(sending.current||!reason.trim())return;sending.current=true;setBusy(true);setError('');
  request.current=request.current||{reason:reason.trim()};
  try{await requestJSON('/bank-ledger/opening/'+encodeURIComponent(selected.id)+'/void'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(request.current)});setUncertain(false);setSelected(null);onNotify?.(o.saved,'success');emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger','issued-invoices','expenses','payroll-sources']});changed();}
  catch(e){const unknown=!e.status||e.status>=500;setUncertain(unknown);setError(unknown?b.uncertain:e.message==='OPENING_ALREADY_MATCHED'?o.matched:o.failed);if(!unknown)request.current=null;}
  finally{sending.current=false;setBusy(false);}
 };
 return <Stack spacing={2} data-opening-history>
  <Typography variant="subtitle2">{t.title}</Typography>
  {error&&!selected&&<Alert severity="error" action={<Button onClick={()=>setRefresh(v=>v+1)}>{b.reload}</Button>}>{error}</Alert>}
  {loading?<CircularProgress size={24}/>:data&&<><TableContainer><Table size="small" data-table-layout="wide" sx={{minWidth:1250}}><TableHead><TableRow>{[t.date,t.side,t.party,t.code,t.reference,t.treatment,t.currency,t.amount,t.remaining,t.reason,t.status,''].map((label,index)=><TableCell key={index} align={index===7||index===8?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
   {data.rows.map(row=><TableRow key={row.source+':'+row.id} data-cancelled={!!row.voidedAt}>
    <TableCell sx={{whiteSpace:'nowrap'}}>{row.date}</TableCell><TableCell>{t[row.side]}</TableCell><TableCell>{row.party||'—'}</TableCell><TableCell>{row.code||'—'}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{row.reference||'—'}</TableCell><TableCell>{t[row.treatment]}</TableCell><TableCell>{row.currencyCode}</TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}>{formatLedgerMoney(row.amount,row.currencyCode)}</TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}>{row.voidedAt||row.remaining==null?'—':formatLedgerMoney(row.remaining,row.currencyCode)}</TableCell><TableCell sx={{minWidth:160,overflowWrap:'anywhere'}}>{row.reason||'—'}</TableCell><TableCell>{row.voidedAt?t.deleted:row.changePending?t.pending:t.active}</TableCell><TableCell data-table-actions><DeleteActionButton aria-label={t.remove} title={row.matched?o.matched:t.remove} disabled={busy||uncertain||!!row.voidedAt||row.matched||row.changePending} onClick={()=>remove(row)}/></TableCell>
   </TableRow>)}
   {!data.rows.length&&<TableStatusRow colSpan={12} languageCode={languageCode} state="empty"/>}
  </TableBody></Table></TableContainer><ListPagination languageCode={languageCode} onPrevious={()=>setPage(p=>p-1)} onNext={()=>setPage(p=>p+1)} previousDisabled={!page||busy||uncertain} nextDisabled={!data.hasMore||busy||uncertain} previousLabel={t.previous} nextLabel={t.next}></ListPagination></>}
  <Dialog open={!!selected} onClose={()=>{if(!busy&&!uncertain){setSelected(null);setError('');}}} fullWidth maxWidth="sm"><DialogTitle>{dialogTitle('openingDelete',languageCode)}</DialogTitle><DialogContent><Stack spacing={2}>{error&&<Alert severity="error">{error}</Alert>}<TextField autoFocus required fullWidth label={t.removeReason} value={reason} disabled={busy||uncertain} inputProps={{maxLength:1000}} onChange={e=>setReason(e.target.value)}/></Stack></DialogContent><DialogActions><Button variant="contained" disabled={busy||!reason.trim()} onClick={confirm}>{uncertain?b.retry:t.confirm}</Button></DialogActions></Dialog>
  <ChangeApprovalDialog ref={changeRef} orgId={orgId} languageCode={languageCode}/>
 </Stack>;
}
