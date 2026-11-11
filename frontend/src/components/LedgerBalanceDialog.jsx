import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import DecimalAmountField from './DecimalAmountField';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {ledgerBalanceText} from '../constants/ledgerBalance';

const scale=(value,code)=>{
 if(!new RegExp(`^-?\\d{1,20}${code==='USD'?'(\\.\\d{1,2})?':''}$`).test(value))return null;
 const negative=value.startsWith('-'),[whole,fraction='']=value.replace(/^-/,'').split('.');
 return (negative?-1n:1n)*(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0')));
};
const decimal=value=>`${value<0n?'-':''}${(value<0n?-value:value)/100n}.${String((value<0n?-value:value)%100n).padStart(2,'0')}`;

export default function LedgerBalanceDialog({orgId,languageCode,onClose}){
 const t=ledgerBalanceText[languageCode]||ledgerBalanceText.en;
 const [balanceDate,setBalanceDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const [accounts,setAccounts]=useState([]),[targets,setTargets]=useState({}),[reason,setReason]=useState(''),[reload,setReload]=useState(0),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const request=useRef(null),busy=useRef(false),locked=loading||saving||uncertain;
 useUnsavedChanges(!!reason||Object.values(targets).some(value=>value!=='')||uncertain);
 useEffect(()=>{let live=true;setLoading(true);setAccounts([]);setTargets({});setError('');request.current=null;
  if(!balanceDate){setLoading(false);return()=>{live=false;};}
  requestJSON('/bank-ledger/accounts'+buildQueryString({orgId,balanceDate}),{skipCache:true}).then(data=>{if(live)setAccounts(data.accounts);}).catch(()=>{if(live)setError(t.failed);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[orgId,reload,balanceDate]);
 const edited=accounts.filter(account=>targets[account.id]!==undefined&&targets[account.id]!==''),valid=!!balanceDate&&edited.length>0&&edited.length<=50&&edited.every(account=>scale(targets[account.id],account.currencyCode)!==null)&&reason.trim().length>0;
 const save=async()=>{
  if(busy.current||loading)return;if(!request.current&&!valid){setError(t.invalid);return;}
  busy.current=true;setSaving(true);setError('');
  if(!request.current)request.current={clientKey:crypto.randomUUID(),reason,balanceDate,accounts:edited.map(account=>({accountId:account.id,currencyCode:account.currencyCode,expectedBalance:account.currentBalance,targetBalance:targets[account.id]}))};
  try{await requestJSON('/bank-ledger/balance-adjustments'+buildQueryString({orgId}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current)});emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger']});onClose();}
  catch(e){const unknown=!e.status||e.status>=500;setUncertain(unknown);setError(unknown?t.uncertain:e.message==='LEDGER_BALANCE_CHANGED'?t.changed:t.failed);if(!unknown)request.current=null;}
  finally{busy.current=false;setSaving(false);}
 };
 return <Dialog open onClose={()=>{if(!saving&&!uncertain)onClose();}} fullWidth maxWidth="md"><DialogTitle>{t.title}</DialogTitle><DialogContent dividers><Stack spacing={2}>
  <TextField type="date" label={t.date} value={balanceDate} disabled={saving||uncertain} sx={{width:180}} slotProps={{inputLabel:{shrink:true}}} onChange={event=>{setBalanceDate(event.target.value);setLoading(true);}}/>
  <Typography variant="body2" color="text.secondary">{t.hint}</Typography>
  {error&&<Alert severity="error" action={!saving&&!uncertain?<Button onClick={()=>setReload(value=>value+1)}>{t.reload}</Button>:undefined}>{error}</Alert>}
  {loading?<CircularProgress size={24}/>:<TableContainer><Table size="small" sx={{minWidth:680}}><TableHead><TableRow>{[t.account,t.currency,t.book,t.actual,t.difference].map((label,index)=><TableCell key={label} align={index>=2?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{accounts.map(account=>{
   const value=targets[account.id]??'',target=scale(value,account.currencyCode),book=scale(account.currentBalance,account.currencyCode),difference=target!==null&&book!==null?target-book:null;
   return <TableRow key={account.id}><TableCell>{account.displayName||[account.bankName,account.accountNumber].filter(Boolean).join(' / ')}</TableCell><TableCell>{account.currencyCode}</TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}>{formatLedgerMoney(account.currentBalance,account.currencyCode)}</TableCell><TableCell sx={{width:190}}><DecimalAmountField currencyCode={account.currencyCode} allowNegative fullWidth size="small" disabled={locked} value={value} error={value!==''&&target===null} inputProps={{'aria-label':`${t.actual} ${account.displayName||account.accountNumber}`,style:{textAlign:'right'},maxLength:30}} onValueChange={next=>{request.current=null;setTargets(current=>({...current,[account.id]:next}));}}/></TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}>{difference===null?'—':formatLedgerMoney(decimal(difference),account.currencyCode)}</TableCell></TableRow>;
  })}</TableBody></Table></TableContainer>}
  <TextField label={t.reason} required fullWidth multiline minRows={2} value={reason} disabled={locked} inputProps={{maxLength:1000}} onChange={event=>{request.current=null;setReason(event.target.value);}}/>
 </Stack></DialogContent><DialogActions><Button variant="contained" disabled={loading||saving||(!uncertain&&!valid)} onClick={save}>{uncertain?t.retry:t.save}</Button></DialogActions></Dialog>;
}
