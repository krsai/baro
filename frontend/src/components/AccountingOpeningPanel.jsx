import {ledgerEntryText} from '../constants/ledgerEntry';
import React,{useEffect,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
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

export default function AccountingOpeningPanel({orgId,balanceDate,languageCode,locked,reload,onChange,onReady,onNotify}){
 const t={...(ledgerBalanceText[languageCode]||ledgerBalanceText.en),...(accountingOpeningText[languageCode]||accountingOpeningText.en)};
 const [data,setData]=useState(null),[codes,setCodes]=useState([]),[manual,setManual]=useState([]),[selected,setSelected]=useState({}),[search,setSearch]=useState(''),[busy,setBusy]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0),[reversal,setReversal]=useState(null),[voidReason,setVoidReason]=useState(''),[voidBusy,setVoidBusy]=useState(false),[voidUncertain,setVoidUncertain]=useState(false);
 useEffect(()=>{setSelected({});},[balanceDate,reload]);
 useEffect(()=>{onChange([...manual.map(({key,...row})=>row),...Object.values(selected)]);},[manual,selected,onChange]);
 useEffect(()=>{let live=true;setBusy(true);setError('');onReady(false);
  const timer=setTimeout(()=>Promise.all([requestJSON('/bank-ledger/opening'+buildQueryString({orgId,balanceDate,search}),{skipCache:true}),requestJSON('/transaction-codes'+buildQueryString({orgId,forAccounting:'1'}),{skipCache:true})]).then(([result,codeResult])=>{if(live){setData(result);setCodes(codeResult);onReady(true);}}).catch(()=>{if(live)setError(t.failed);}).finally(()=>{if(live)setBusy(false);}),200);
  return()=>{live=false;clearTimeout(timer);};
 },[orgId,balanceDate,search,reload,refresh]);
 const edit=(key,patch)=>setManual(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));
 const add=()=>{if(manual.length>=50){onNotify?.((ledgerEntryText[languageCode]||ledgerEntryText.en).limit,'warning');return;}setManual(rows=>[...rows,{key:crypto.randomUUID(),kind:'OPENING',side:'AR',currencyCode:'USD',amount:'',accountingCodeId:null,counterparty:null}]);};
 const reverse=async()=>{if(voidBusy||!voidReason.trim())return;setVoidBusy(true);setError('');onReady(false);try{await requestJSON('/bank-ledger/opening/'+reversal.id+'/void'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({reason:voidReason})});onNotify?.(t.saved,'success');setVoidUncertain(false);setReversal(null);setRefresh(v=>v+1);emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger','issued-invoices','expenses']});}catch(e){const unknown=!e.status||e.status>=500;setVoidUncertain(unknown);setError(unknown?t.uncertain:e.message==='OPENING_ALREADY_MATCHED'?t.matched:t.failed);if(!unknown)onReady(true);}finally{setVoidBusy(false);}};
 return <Stack spacing={2} data-accounting-opening>
  <Typography variant="subtitle2">{t.manual}</Typography><Alert severity="info">{t.hint}</Alert>
  {error&&<Alert severity="error" action={<Button disabled={locked||voidBusy||voidUncertain} onClick={()=>setRefresh(v=>v+1)}>{t.reload}</Button>}>{error}</Alert>}
  {busy&&<CircularProgress size={22}/>}
  <TableContainer><Table size="small" sx={{minWidth:850}}><TableHead><TableRow>{[t.party,t.side,t.code,t.currency,t.amount,''].map((label,i)=><TableCell key={i}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{manual.map(row=><TableRow key={row.key}>
   <TableCell sx={{minWidth:210}}><LedgerCounterpartyField row={{entryKind:'BANK',counterparty:row.counterparty}} options={data?.parties||[]} languageCode={languageCode} disabled={locked||busy||!!error} onChange={counterparty=>edit(row.key,{counterparty})}/></TableCell>
   <TableCell><TextField select size="small" value={row.side} disabled={locked} onChange={e=>edit(row.key,{side:e.target.value})}>{['AR','AP'].map(side=><MenuItem key={side} value={side}>{t[side]}</MenuItem>)}</TextField></TableCell>
   <TableCell sx={{minWidth:150}}><AccountingCodeField codes={codes} value={row.accountingCodeId} onChange={accountingCodeId=>edit(row.key,{accountingCodeId})} languageCode={languageCode} disabled={locked||busy} direction={row.side==='AR'?'IN':'OUT'}/></TableCell>
   <TableCell><TextField select size="small" value={row.currencyCode} disabled={locked} onChange={e=>edit(row.key,{currencyCode:e.target.value,amount:''})}>{['USD','VND','KRW'].map(code=><MenuItem key={code} value={code}>{code}</MenuItem>)}</TextField></TableCell>
   <TableCell sx={{minWidth:180}}><DecimalAmountField fullWidth size="small" label={t.amount} currencyCode={row.currencyCode} value={row.amount} disabled={locked} onValueChange={amount=>edit(row.key,{amount})}/></TableCell>
   <TableCell data-table-actions><AddActionButton aria-label={t.add} disabled={locked} onClick={add}/><DeleteActionButton aria-label={t.remove} disabled={locked} onClick={()=>setManual(rows=>rows.filter(r=>r.key!==row.key))}/></TableCell>
  </TableRow>)}</TableBody></Table></TableContainer>
  {!manual.length&&<Box><AddActionButton aria-label={t.add} title={t.add} disabled={locked||busy||!!error} onClick={add}/></Box>}
  <Typography variant="subtitle2">{t.documents}</Typography><Typography variant="body2" color="text.secondary">{t.documentHint}</Typography>
  <TextField size="small" label={t.search} value={search} disabled={locked} onChange={e=>setSearch(e.target.value)} />
  {data?.hasMore&&<Alert severity="warning">{t.more}</Alert>}
  <TableContainer><Table size="small" sx={{minWidth:750}}><TableHead><TableRow>{[t.side,t.party,t.reference,t.remaining,t.action].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{data?.documents.map(row=>{const key=row.side+':'+row.id;return <TableRow key={key} selected={!!selected[key]}><TableCell>{row.side}</TableCell><TableCell>{row.party}</TableCell><TableCell>{row.reference}<Typography variant="caption" display="block">{row.description}</Typography>{row.hasUnlinkedReceipt&&<Typography color="warning.main" variant="caption">{t.receipt}</Typography>}</TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}>{formatLedgerMoney(row.remaining,row.currencyCode)}</TableCell><TableCell><TextField select size="small" value={selected[key]?.kind||''} disabled={locked||busy||row.hasUnlinkedReceipt} onChange={e=>setSelected(current=>{const next={...current};if(e.target.value)next[key]={kind:e.target.value,side:row.side,sourceId:row.id,sourceVersion:row.sourceVersion,expectedRemaining:row.remaining};else delete next[key];return next;})}>{['','SETTLED','EXCLUDED'].map(kind=><MenuItem key={kind} value={kind}>{kind?t[kind]:t.keep}</MenuItem>)}</TextField></TableCell></TableRow>;})}{!busy&&data&&!data.documents.length&&<TableRow><TableCell colSpan={5}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer>
  {!!Object.keys(selected).length&&<Typography variant="body2">{t.clear}: {Object.keys(selected).length}</Typography>}
  {!!data?.history.length&&<><Typography variant="subtitle2">{t.history}</Typography><TableContainer><Table size="small" sx={{minWidth:700}}><TableBody>{data.history.map(row=><TableRow key={row.id}><TableCell>{row.balanceDate}</TableCell><TableCell>{row.party?.name||row.employee?.name}</TableCell><TableCell>{t[row.kind]}<Typography variant="caption" display="block">{row.invoice?.invoiceNumber||row.expenseItem?.description||row.accountingCode?.code}</Typography><Typography variant="caption" display="block">{row.reason}</Typography></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{formatLedgerMoney(row.amount,row.currencyCode)}</TableCell><TableCell>{row.voidedAt?t.voided:row.kind==='OPENING'?formatLedgerMoney(row.remaining,row.currencyCode):t.clear}</TableCell><TableCell><Button disabled={locked||voidBusy||!!row.voidedAt||Number(row.matched)>0} onClick={()=>{setVoidReason('');setReversal(row);}}>{t.void}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer></>}
  <Dialog open={!!reversal} onClose={()=>{if(!voidBusy&&!voidUncertain)setReversal(null);}} fullWidth maxWidth="sm"><DialogTitle>{t.void}</DialogTitle><DialogContent>{voidUncertain&&<Alert severity="error">{t.uncertain}</Alert>}<TextField autoFocus fullWidth label={t.voidReason} value={voidReason} disabled={voidBusy||voidUncertain} onChange={e=>setVoidReason(e.target.value)} inputProps={{maxLength:1000}}/></DialogContent><DialogActions><Button variant="contained" disabled={voidBusy||!voidReason.trim()} onClick={reverse}>{voidUncertain?t.retry:t.confirm}</Button></DialogActions></Dialog>
 </Stack>;
}
