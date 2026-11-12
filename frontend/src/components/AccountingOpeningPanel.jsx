import {ledgerEntryText} from '../constants/ledgerEntry';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField} from '@mui/material';
import OpeningBillField from './OpeningBillField';
import AccountingCodeField from './AccountingCodeField';
import LedgerCounterpartyField from './LedgerCounterpartyField';
import DecimalAmountField from './DecimalAmountField';
import AddActionButton from './AddActionButton';
import DeleteActionButton from './DeleteActionButton';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {accountingOpeningText} from '../constants/accountingOpening';
import {ledgerBalanceText} from '../constants/ledgerBalance';

const emptyRow=()=>({key:crypto.randomUUID(),kind:'OPENING',side:'AR',currencyCode:'USD',amount:'',accountingCodeId:null,counterparty:null});
const hasInput=row=>!!(row.counterparty||row.accountingCodeId||row.bill||row.amount!==''||row.side!=='AR'||row.currencyCode!=='USD');

export default function AccountingOpeningPanel({orgId,balanceDate,languageCode,locked,reload,onChange,onReady,onNotify,resetVersion=0,reasonField}){
 const t={...(ledgerBalanceText[languageCode]||ledgerBalanceText.en),...(accountingOpeningText[languageCode]||accountingOpeningText.en)};
 const [data,setData]=useState(null),[codes,setCodes]=useState([]),[manual,setManual]=useState(()=>[emptyRow()]),[busy,setBusy]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 useEffect(()=>{setManual([emptyRow()]);},[orgId,resetVersion]);
 useEffect(()=>{onChange(manual.filter(hasInput).map(({key,bill,...row})=>({...row,...(bill?{source:{side:bill.side,...(bill.sourceType?{sourceType:bill.sourceType}:{}),sourceId:bill.id,sourceVersion:bill.sourceVersion,expectedRemaining:bill.remaining}}:{})})));},[manual,onChange]);
 useEffect(()=>{let live=true;setBusy(true);setError('');onReady(false);
  const timer=setTimeout(()=>Promise.all([requestJSON('/bank-ledger/opening'+buildQueryString({orgId,balanceDate}),{skipCache:true}),requestJSON('/transaction-codes'+buildQueryString({orgId,forAccounting:'1'}),{skipCache:true})]).then(([result,codeResult])=>{if(live){setData(result);setCodes(codeResult);onReady(true);}}).catch(()=>{if(live)setError(t.failed);}).finally(()=>{if(live)setBusy(false);}),200);
  return()=>{live=false;clearTimeout(timer);};
 },[orgId,balanceDate,reload,refresh]);
 const manualSection=useRef(null);
 const edit=(key,patch)=>setManual(rows=>rows.map(row=>row.key===key?{...row,...patch}:row));
 const add=()=>{if(manual.length>=50){onNotify?.((ledgerEntryText[languageCode]||ledgerEntryText.en).limit,'warning');return;}setManual(rows=>[...rows,emptyRow()]);requestAnimationFrame(()=>{const rows=manualSection.current?.querySelectorAll('[data-opening-input]');const input=rows?.[rows.length-1]?.querySelector('input');input?.scrollIntoView({block:'nearest'});input?.focus();});};
 return <Stack spacing={2} data-accounting-opening>
  {error&&<Alert severity="error" action={<Button disabled={locked} onClick={()=>setRefresh(v=>v+1)}>{t.reload}</Button>}>{error}</Alert>}
  {busy&&<CircularProgress size={22}/>}
  <TableContainer ref={manualSection}><Table size="small" sx={{minWidth:1080}}><TableHead><TableRow>{[t.party,t.side,t.code,t.currency,t.amount,t.billNumber,''].map((label,i)=><TableCell key={i}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{manual.map(row=><TableRow key={row.key} data-opening-input>
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
  </TableRow>)}{reasonField&&<TableRow><TableCell colSpan={7}>{reasonField}</TableCell></TableRow>}</TableBody></Table></TableContainer>
 </Stack>;
}
