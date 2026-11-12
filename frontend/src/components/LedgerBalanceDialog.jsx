import AccountingOpeningPanel from './AccountingOpeningPanel';
import AccountingOpeningHistory from './AccountingOpeningHistory';
import {accountingOpeningText} from '../constants/accountingOpening';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Tab,Tabs,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
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

export default function LedgerBalanceDialog({orgId,languageCode,onClose,onNotify}){
 const t=ledgerBalanceText[languageCode]||ledgerBalanceText.en,o=accountingOpeningText[languageCode]||accountingOpeningText.en;
 const [tab,setTab]=useState('accounts'),[openedAr,setOpenedAr]=useState(false),[openedHistory,setOpenedHistory]=useState(false),[historyLocked,setHistoryLocked]=useState(false),[openingReload,setOpeningReload]=useState(0),[openingReset,setOpeningReset]=useState(0);
 const [openingRows,setOpeningRows]=useState([]),[openingReady,setOpeningReady]=useState(false);
 const [balanceDate,setBalanceDate]=useState(()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
 const [accounts,setAccounts]=useState([]),[targets,setTargets]=useState({}),[reasons,setReasons]=useState({accounts:'',arap:''}),[reload,setReload]=useState(0),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[errors,setErrors]=useState({accounts:'',arap:''}),[accountReady,setAccountReady]=useState(false);
 const reason=reasons[tab]||'',error=errors[tab],setError=value=>setErrors(current=>({...current,[tab]:value}));
 const request=useRef(null),busy=useRef(false),locked=saving||uncertain||historyLocked;
 useUnsavedChanges(openingRows.length>0||Object.values(reasons).some(Boolean)||Object.values(targets).some(value=>value!=='')||uncertain);
 useEffect(()=>{let live=true;setLoading(true);setAccountReady(false);setErrors(current=>({...current,accounts:''}));
  if(!balanceDate){setLoading(false);return()=>{live=false;};}
  requestJSON('/bank-ledger/accounts'+buildQueryString({orgId,balanceDate}),{skipCache:true}).then(data=>{if(live){setAccounts(data.accounts);setAccountReady(true);}}).catch(()=>{if(live)setErrors(current=>({...current,accounts:t.failed}));}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[orgId,reload,balanceDate]);
 const edited=accounts.filter(account=>targets[account.id]!==undefined&&targets[account.id]!==''),count=tab==='accounts'?edited.length:openingRows.length;
 const valid=tab!=='history'&&!!balanceDate&&reason.trim().length>0&&(tab==='accounts'
  ?accountReady&&!loading&&edited.length>0&&edited.length<=50&&edited.every(account=>scale(targets[account.id],account.currencyCode)!==null)
  :openingReady&&openingRows.length>0&&openingRows.length<=100&&openingRows.every(row=>row.kind!=='OPENING'||row.counterparty&&row.accountingCodeId&&scale(row.amount,row.currencyCode)>0n));
 const save=async()=>{
  if(busy.current)return;if(!request.current&&!valid){setError(t.invalid);return;}
  busy.current=true;setSaving(true);setError('');
  if(!request.current)request.current={clientKey:crypto.randomUUID(),reason,balanceDate,openingRows:tab==='arap'?openingRows:[],accounts:tab==='accounts'?edited.map(account=>({accountId:account.id,currencyCode:account.currencyCode,expectedBalance:account.currentBalance,targetBalance:targets[account.id]})):[]};
  try{await requestJSON('/bank-ledger/balance-adjustments'+buildQueryString({orgId}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current)});emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger','issued-invoices','expenses']});onNotify?.(o.saved,'success');request.current=null;setUncertain(false);setReasons(current=>({...current,[tab]:''}));if(tab==='accounts'){setTargets({});setReload(value=>value+1);}else{setOpeningRows([]);setOpeningReset(value=>value+1);setOpeningReload(value=>value+1);}}
  catch(e){const unknown=!e.status||e.status>=500;setUncertain(unknown);setError(unknown?t.uncertain:['LEDGER_BALANCE_CHANGED','OPENING_SOURCE_CHANGED'].includes(e.message)?o.changed:e.message==='OPENING_UNLINKED_RECEIPT'?o.receipt:t.failed);if(!unknown)request.current=null;}
  finally{busy.current=false;setSaving(false);}
 };
 const reasonField=<TextField label={t.reason} required fullWidth multiline minRows={2} value={reason} disabled={locked} inputProps={{maxLength:1000}} onChange={event=>{request.current=null;setReasons(current=>({...current,[tab]:event.target.value}));}}/>;
 return <Dialog open onClose={()=>{if(!locked)onClose();}} fullWidth maxWidth="xl"><DialogTitle component="div"><Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2} useFlexGap flexWrap="wrap"><Typography component="h2" variant="h6">{o.title}</Typography>
  {tab!=='history'&&<TextField size="small" type="date" label={t.date} value={balanceDate} disabled={locked} sx={{width:180}} slotProps={{inputLabel:{shrink:true}}} onChange={event=>{setBalanceDate(event.target.value);setLoading(true);setOpeningReady(false);}}/>}
 </Stack></DialogTitle><Stack sx={{px:3,pb:1}}>
  <Tabs variant="fullWidth" value={tab} onChange={(_,value)=>{setTab(value);if(value==='arap')setOpenedAr(true);if(value==='history')setOpenedHistory(true);}} aria-label={o.title}><Tab value="accounts" label={o.accountTab} disabled={locked}/><Tab value="arap" label={o.arapTab} disabled={locked}/><Tab value="history" label={o.history} disabled={locked}/></Tabs>
 </Stack><DialogContent dividers><Stack spacing={2}>
  <Box hidden={tab!=='accounts'} role="tabpanel" aria-label={o.accountTab}>
  {tab==='accounts'&&error&&<Alert severity="error" action={!saving&&!uncertain?<Button onClick={()=>setReload(value=>value+1)}>{t.reload}</Button>:undefined}>{error}</Alert>}
  {loading?<CircularProgress size={24}/>:<TableContainer><Table size="small" sx={{minWidth:680}}><TableHead><TableRow>{[t.account,t.currency,t.book,t.actual,t.difference].map((label,index)=><TableCell key={label} align={index>=2?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{accounts.map(account=>{
   const value=targets[account.id]??'',target=scale(value,account.currencyCode),book=scale(account.currentBalance,account.currencyCode),difference=target!==null&&book!==null?target-book:null;
   return <TableRow key={account.id}><TableCell>{account.displayName||[account.bankName,account.accountNumber].filter(Boolean).join(' / ')}</TableCell><TableCell>{account.currencyCode}</TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}>{formatLedgerMoney(account.currentBalance,account.currencyCode)}</TableCell><TableCell sx={{width:190}}><DecimalAmountField currencyCode={account.currencyCode} allowNegative fullWidth size="small" disabled={locked||loading||!accountReady} value={value} error={value!==''&&target===null} inputProps={{'aria-label':`${t.actual} ${account.displayName||account.accountNumber}`,style:{textAlign:'right'},maxLength:30}} onValueChange={next=>{request.current=null;setTargets(current=>({...current,[account.id]:next}));}}/></TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}>{difference===null?'—':formatLedgerMoney(decimal(difference),account.currencyCode)}</TableCell></TableRow>;
  })}<TableRow><TableCell colSpan={5}>{tab==='accounts'?reasonField:null}</TableCell></TableRow></TableBody></Table></TableContainer>}
  </Box>
  {openedAr&&<Box hidden={tab!=='arap'} role="tabpanel" aria-label={o.arapTab}><AccountingOpeningPanel reasonField={tab==='arap'?reasonField:null} resetVersion={openingReset} onNotify={onNotify} orgId={orgId} balanceDate={balanceDate} languageCode={languageCode} locked={locked} reload={openingReload} onChange={setOpeningRows} onReady={setOpeningReady}/></Box>}
  {tab==='arap'&&error&&<Alert severity="error" action={!locked?<Button onClick={()=>setOpeningReload(value=>value+1)}>{t.reload}</Button>:undefined}>{error}</Alert>}
  {openedHistory&&<Box hidden={tab!=='history'} role="tabpanel" aria-label={o.history}><AccountingOpeningHistory orgId={orgId} languageCode={languageCode} active={tab==='history'} reload={openingReload+reload} onLocked={setHistoryLocked} onNotify={onNotify} onChanged={()=>{setReload(v=>v+1);setOpeningReload(v=>v+1);}}/></Box>}
 </Stack></DialogContent>{tab!=='history'&&<DialogActions><Typography variant="body2" color="text.secondary" sx={{mr:'auto',pl:2}}>{tab==='accounts'?o.accountTab:o.arapTab}: {count}</Typography><Button variant="contained" disabled={saving||(!uncertain&&!valid)} onClick={save}>{uncertain?t.retry:tab==='accounts'?o.saveAccounts:o.saveAr}</Button></DialogActions>}</Dialog>;
}
