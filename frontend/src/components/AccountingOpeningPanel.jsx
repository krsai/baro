import {payrollPayableText,payrollPayableMessage} from '../constants/payrollPayable';
import {ledgerEntryText} from '../constants/ledgerEntry';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import OpeningBillField from './OpeningBillField';
import AccountingCodeField from './AccountingCodeField';
import LedgerCounterpartyField from './LedgerCounterpartyField';
import DecimalAmountField from './DecimalAmountField';
import AddActionButton from './AddActionButton';
import DeleteActionButton from './DeleteActionButton';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {accountingOpeningText} from '../constants/accountingOpening';
import {ledgerBalanceText} from '../constants/ledgerBalance';

const emptyRow=()=>({key:crypto.randomUUID(),kind:'OPENING',side:'AR',currencyCode:'USD',amount:'',accountingCodeId:null,counterparty:null});
const hasInput=row=>!!(row.counterparty||row.accountingCodeId||row.bill||row.amount!==''||row.side!=='AR'||row.currencyCode!=='USD');

export default function AccountingOpeningPanel({orgId,balanceDate,languageCode,locked,reload,onChange,onReady,onNotify,resetVersion=0}){
 const t={...(ledgerBalanceText[languageCode]||ledgerBalanceText.en),...(accountingOpeningText[languageCode]||accountingOpeningText.en)};
 const [data,setData]=useState(null),[codes,setCodes]=useState([]),[manual,setManual]=useState(()=>[emptyRow()]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[reversal,setReversal]=useState(null),[voidReason,setVoidReason]=useState(''),[voidBusy,setVoidBusy]=useState(false),[voidUncertain,setVoidUncertain]=useState(false);
 useEffect(()=>{setManual([emptyRow()]);},[orgId,resetVersion]);
 useEffect(()=>{onChange(manual.filter(hasInput).map(({key,bill,...row})=>({...row,...(bill?{source:{side:bill.side,...(bill.sourceType?{sourceType:bill.sourceType}:{}),sourceId:bill.id,sourceVersion:bill.sourceVersion,expectedRemaining:bill.remaining}}:{})})));},[manual,onChange]);
 useEffect(()=>{let live=true;setBusy(true);setError('');onReady(false);
  const timer=setTimeout(()=>Promise.all([requestJSON('/bank-ledger/opening'+buildQueryString({orgId,balanceDate}),{skipCache:true}),requestJSON('/transaction-codes'+buildQueryString({orgId,forAccounting:'1'}),{skipCache:true})]).then(([result,codeResult])=>{if(live){setData(result);setCodes(codeResult);onReady(true);}}).catch(()=>{if(live)setError(t.failed);}).finally(()=>{if(live)setBusy(false);}),200);
  return()=>{live=false;clearTimeout(timer);};
 },[orgId,balanceDate,reload,refresh]);
 const [importBusy,setImportBusy]=useState(false);
 const payrollText=payrollPayableText[languageCode]||payrollPayableText.en;
 const importPayroll=async()=>{if(importBusy||locked)return;setImportBusy(true);setError('');onReady(false);try{const result=await requestJSON('/bank-ledger/payroll/import'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({balanceDate})});onNotify?.(payrollText.importDone.replace('{count}',result.importedCount),'success');setRefresh(v=>v+1);emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger','payroll-sources']});}catch(e){setError(payrollPayableMessage(languageCode,e.message)||t.failed);}finally{setImportBusy(false);}};
 const manualSection=useRef(null);
 const edit=(key,patch)=>setManual(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));
 const add=()=>{if(manual.length>=50){onNotify?.((ledgerEntryText[languageCode]||ledgerEntryText.en).limit,'warning');return;}setManual(rows=>[...rows,emptyRow()]);requestAnimationFrame(()=>{const input=manualSection.current?.querySelector('tbody tr:last-child input');input?.scrollIntoView({block:'nearest'});input?.focus();});};
 const reverse=async()=>{if(voidBusy||!voidReason.trim())return;setVoidBusy(true);setError('');onReady(false);try{await requestJSON('/bank-ledger/opening/'+reversal.id+'/void'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({reason:voidReason})});onNotify?.(t.saved,'success');setVoidUncertain(false);setReversal(null);setRefresh(v=>v+1);emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger','issued-invoices','expenses','payroll-sources']});}catch(e){const unknown=!e.status||e.status>=500;setVoidUncertain(unknown);setError(unknown?t.uncertain:e.message==='OPENING_ALREADY_MATCHED'?t.matched:t.failed);if(!unknown)onReady(true);}finally{setVoidBusy(false);}};
 return <Stack spacing={2} data-accounting-opening>
  <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}><Typography variant="subtitle2">{t.manual}</Typography><Stack direction="row" spacing={1}><Button variant="outlined" disabled={locked||busy||importBusy} title={payrollText.importHint} onClick={importPayroll}>{payrollText.importPayroll}</Button></Stack></Stack><Alert severity="info">{t.hint}</Alert>
  {error&&<Alert severity="error" action={<Button disabled={locked||voidBusy||voidUncertain} onClick={()=>setRefresh(v=>v+1)}>{t.reload}</Button>}>{error}</Alert>}
  {busy&&<CircularProgress size={22}/>}
  <TableContainer ref={manualSection}><Table size="small" sx={{minWidth:1080}}><TableHead><TableRow>{[t.party,t.side,t.code,t.currency,t.amount,t.billNumber,''].map((label,i)=><TableCell key={i}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{manual.map(row=><TableRow key={row.key}>
   <TableCell sx={{minWidth:210}}><LedgerCounterpartyField row={{entryKind:'BANK',counterparty:row.counterparty}} options={data?.parties||[]} languageCode={languageCode} disabled={locked||busy||!!error} onChange={counterparty=>edit(row.key,{counterparty})}/></TableCell>
   <TableCell><TextField select size="small" value={row.side} disabled={locked} onChange={e=>edit(row.key,{side:e.target.value})}>{['AR','AP'].map(side=><MenuItem key={side} value={side}>{t[side]}</MenuItem>)}</TextField></TableCell>
   <TableCell sx={{minWidth:150}}><AccountingCodeField codes={codes} value={row.accountingCodeId} onChange={accountingCodeId=>edit(row.key,{accountingCodeId})} languageCode={languageCode} disabled={locked||busy} direction={row.side==='AR'?'IN':'OUT'}/></TableCell>
   <TableCell><TextField select size="small" value={row.currencyCode} disabled={locked} onChange={e=>edit(row.key,{currencyCode:e.target.value,amount:''})}>{['USD','VND','KRW'].map(code=><MenuItem key={code} value={code}>{code}</MenuItem>)}</TextField></TableCell>
   <TableCell sx={{minWidth:180}}><DecimalAmountField fullWidth size="small" label={t.amount} currencyCode={row.currencyCode} value={row.amount} disabled={locked} onValueChange={amount=>edit(row.key,{amount})}/></TableCell>
   <TableCell sx={{minWidth:220}}><OpeningBillField orgId={orgId} balanceDate={balanceDate} languageCode={languageCode} t={t} value={row.bill||null} disabled={locked||busy||!!error} onChange={bill=>{
    if(!bill){edit(row.key,{bill:null});return;}
    if(manual.some(other=>other.key!==row.key&&other.bill?.id===bill.id&&(other.bill.sourceType||other.bill.side)===(bill.sourceType||bill.side))){onNotify?.(t.duplicateBill,'warning');return;}
    const counterparty=data?.parties.find(p=>p.kind===bill.counterparty?.kind&&p.id===bill.counterparty?.id)||bill.counterparty;
    edit(row.key,{bill,side:bill.side,counterparty:counterparty?{...counterparty,name:counterparty.name||bill.party}:null,accountingCodeId:bill.accountingCodeId||null,currencyCode:bill.currencyCode,amount:bill.remaining});
   }}/></TableCell>
   <TableCell data-table-actions><AddActionButton aria-label={t.add} disabled={locked||busy||!!error} onClick={add}/><DeleteActionButton aria-label={t.remove} disabled={locked||busy||!!error} onClick={()=>setManual(rows=>rows.length===1?[emptyRow()]:rows.filter(r=>r.key!==row.key))}/></TableCell>
  </TableRow>)}</TableBody></Table></TableContainer>
  {!!data?.history.length&&<><Typography variant="subtitle2">{t.history}</Typography><TableContainer><Table size="small" sx={{minWidth:700}}><TableBody>{data.history.map(row=><TableRow key={row.id} data-cancelled={!!row.voidedAt}><TableCell>{row.balanceDate}</TableCell><TableCell>{row.party?.name||row.employee?.name}</TableCell><TableCell>{row.kind==='OPENING'?t.OPENING:t.clear}<Typography variant="caption" display="block">{row.replacesItem?.invoice?.invoiceNumber||row.replacesItem?.expenseItem?.expenseRequest?.managementNumber||row.replacesItem?.payrollItem?.document?.managementNumber||row.payrollItem?.document?.managementNumber||row.invoice?.invoiceNumber||row.expenseItem?.description||row.accountingCode?.code}</Typography><Typography variant="caption" display="block">{row.reason}</Typography></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{formatLedgerMoney(row.amount,row.currencyCode)}</TableCell><TableCell>{row.voidedAt?t.voided:row.kind==='OPENING'?formatLedgerMoney(row.remaining,row.currencyCode):t.clear}</TableCell><TableCell><Button disabled={locked||voidBusy||!!row.voidedAt||Number(row.matched)>0} onClick={()=>{setVoidReason('');setReversal(row);}}>{t.void}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
  <Dialog open={!!reversal} onClose={()=>{if(!voidBusy&&!voidUncertain)setReversal(null);}} fullWidth maxWidth="sm"><DialogTitle>{t.void}</DialogTitle><DialogContent>{voidUncertain&&<Alert severity="error">{t.uncertain}</Alert>}<TextField autoFocus fullWidth label={t.voidReason} value={voidReason} disabled={voidBusy||voidUncertain} onChange={e=>setVoidReason(e.target.value)} inputProps={{maxLength:1000}}/></DialogContent><DialogActions><Button variant="contained" disabled={voidBusy||!voidReason.trim()} onClick={reverse}>{voidUncertain?t.retry:t.confirm}</Button></DialogActions></Dialog>
 </Stack>;
}
