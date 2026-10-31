import React,{useEffect,useState} from 'react';
import dayjs from 'dayjs';
import {Alert,Button,Chip,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TablePagination,TableRow,TextField,Typography} from '@mui/material';
import DateRangeSelector from './DateRangeSelector';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
import {ledgerChangesText} from '../constants/ledgerChanges';
import {useRequestScopeContext} from '../context/RequestScopeContext';

const businessToday=()=>dayjs(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()));
export default function LedgerChangesDashboardCard({orgId,languageCode}){
 const {active}=useRequestScopeContext();
 const t=ledgerChangesText[languageCode]||ledgerChangesText.en;
 const [start,setStart]=useState(()=>businessToday().startOf('month')),[end,setEnd]=useState(businessToday),[action,setAction]=useState('ALL'),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(20),[result,setResult]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[reload,setReload]=useState(0),[selected,setSelected]=useState(null);
 const scope=JSON.stringify({orgId,start:start.format('YYYY-MM-DD'),end:end.format('YYYY-MM-DD'),action,page,pageSize});
 const data=result?.scope===scope?result.data:{rows:[],total:0};
 useEffect(()=>{setPage(0);setSelected(null);setResult(null);},[orgId]);
 useEffect(()=>{if(!active)setSelected(null);},[active]);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&(event.source==='bank-ledger'||event.topics?.includes('bank-ledger')))setReload(value=>value+1);}),[orgId]);
 useEffect(()=>{const focus=()=>setReload(value=>value+1);window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
 useEffect(()=>{if(!orgId||!active)return;let alive=true;const controller=new AbortController();setLoading(true);setError(false);
  requestJSON('/bank-ledger/changes'+buildQueryString(JSON.parse(scope)),{skipCache:true,skipGlobalLoading:true,signal:controller.signal}).then(value=>{if(alive)setResult({scope,data:value});}).catch(err=>{if(alive&&err.name!=='AbortError')setError(true);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;controller.abort();};
 },[scope,reload,active]);
 const time=value=>new Intl.DateTimeFormat({ko:'ko-KR',en:'en-GB',vi:'vi-VN'}[languageCode]||'en-GB',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value));
 const money=snapshot=>formatLedgerMoney(snapshot.amount,snapshot.currencyCode);
 const value=(snapshot,key)=>{
  if(!snapshot)return '—';
  if(key==='amount')return money(snapshot);
  if(key==='accountId')return snapshot.accountName||'—';
  if(key==='accountingCodeId')return snapshot.accountingCode||'—';
  if(key==='direction'||key==='evidenceType')return t[snapshot[key]]||snapshot[key];
  if(key==='settlementLines')return snapshot.settlementLines?.length?snapshot.settlementLines.map(line=>[t[line.kind]||line.kind,line.accountingCode,formatLedgerMoney(line.amount,snapshot.currencyCode),line.purpose].filter(Boolean).join(' \u00b7 ')).join('\n'):[snapshot.bankFee&&Number(snapshot.bankFee)!==0?`${t.FEE}: ${formatLedgerMoney(snapshot.bankFee,snapshot.currencyCode)}`:'',snapshot.writeOffAmount&&Number(snapshot.writeOffAmount)!==0?`${t.WRITEOFF}: ${formatLedgerMoney(snapshot.writeOffAmount,snapshot.currencyCode)}`:''].filter(Boolean).join('\n')||'\u2014';
  if(key==='allocations')return (snapshot.allocations||[]).map(line=>`${line.reference||t[line.invoiceId?'INVOICE':'EXPENSE']}: ${formatLedgerMoney(line.amount,snapshot.currencyCode)}`).join('\n')||'—';
  return snapshot[key]||'—';
 };
 const enter=(event,row)=>{if(event.target===event.currentTarget&&event.key==='Enter'){event.preventDefault();setSelected(row);}};
 return <>
  <Paper variant="outlined" data-testid="ledger-changes-dashboard" sx={{height:540,minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
   <Typography variant="h6" sx={{p:2,pb:1}}>{t.title}</Typography>
   <Stack direction={{xs:'column',md:'row'}} spacing={1.5} sx={{px:2,pb:2}}><DateRangeSelector independentDateBounds languageCode={languageCode} startValue={start} endValue={end} onStartChange={date=>{if(date?.isValid()){setStart(date);setPage(0);}}} onEndChange={date=>{if(date?.isValid()){setEnd(date);setPage(0);}}} maxDate={businessToday()}/><TextField select size="small" label={t.action} value={action} sx={{minWidth:140}} SelectProps={{inputProps:{'aria-label':t.action}}} onChange={event=>{setAction(event.target.value);setPage(0);}}>{['ALL','EDIT','DELETE'].map(type=><MenuItem key={type} value={type}>{t[type]}</MenuItem>)}</TextField></Stack>
   <TableContainer sx={{flex:1,minHeight:0}}>{loading?<CircularProgress size={22} sx={{m:2}}/>:error?<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.error}</Alert>:<Table size="small" stickyHeader sx={{minWidth:900}}><TableHead><TableRow>{[t.time,t.action,t.fields.transactionDate,t.fields.accountId,t.fields.amount,t.changes,t.actor].map((label,index)=><TableCell key={index} align={index===4?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
    {data.rows.map(row=><TableRow key={row.id} hover tabIndex={0} onClick={()=>setSelected(row)} onKeyDown={event=>enter(event,row)} sx={{cursor:'pointer'}}><TableCell sx={{whiteSpace:'nowrap'}}>{time(row.changedAt)}</TableCell><TableCell><Chip size="small" variant="outlined" color={row.action==='EDIT'?'primary':'error'} label={t[row.action]}/></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{row.before.transactionDate}</TableCell><TableCell>{row.before.accountName}</TableCell><TableCell align="right" sx={{whiteSpace:'nowrap'}}><Typography variant="body2" sx={{textDecoration:row.action==='DELETE'?'line-through':undefined}}>{money(row.before)}</Typography>{row.after&&(row.before.amount!==row.after.amount||row.before.currencyCode!==row.after.currencyCode)&&<Typography variant="body2" color="primary">→ {money(row.after)}</Typography>}</TableCell><TableCell>{row.action==='DELETE'?row.reason||'—':row.changedFields.map(key=>t.fields[key]).filter(Boolean).join(', ')||'—'}</TableCell><TableCell sx={{overflowWrap:'anywhere'}}>{row.actor||'—'}</TableCell></TableRow>)}
    {!data.rows.length&&<TableRow><TableCell colSpan={7}>{t.empty}</TableCell></TableRow>}
   </TableBody></Table>}</TableContainer>
   <TablePagination component="div" count={data.total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10,20,50]} onPageChange={(_,value)=>setPage(value)} onRowsPerPageChange={event=>{setPageSize(Number(event.target.value));setPage(0);}} labelRowsPerPage={t.perPage} labelDisplayedRows={({from,to,count})=>`${from}–${to} / ${count}`} getItemAriaLabel={type=>type==='next'?t.next:t.previous}/>
  </Paper>
  <Dialog open={Boolean(selected)} onClose={()=>setSelected(null)} fullWidth maxWidth="md"><DialogTitle>{t.title}{selected?' \u00b7 '+t[selected.action]:''}</DialogTitle><DialogContent>{selected&&<Stack spacing={2}><Stack direction={{xs:'column',sm:'row'}} spacing={2}><Typography variant="body2">{time(selected.changedAt)}</Typography><Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{selected.actor||'—'}</Typography></Stack>{selected.reason&&<Typography variant="body2">{t.reason}: {selected.reason}</Typography>}<TableContainer><Table size="small" sx={{minWidth:500}}><TableHead><TableRow><TableCell>{t.field}</TableCell><TableCell>{t.before}</TableCell><TableCell>{t.after}</TableCell></TableRow></TableHead><TableBody>{Object.keys(t.fields).map(key=><TableRow key={key} sx={{bgcolor:selected.changedFields.includes(key)?'action.hover':undefined}}><TableCell>{t.fields[key]}</TableCell>{[selected.before,selected.after].map((snapshot,index)=><TableCell key={index} align={key==='amount'?'right':'left'} sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{value(snapshot,key)}</TableCell>)}</TableRow>)}</TableBody></Table></TableContainer></Stack>}</DialogContent><DialogActions><Button onClick={()=>setSelected(null)}>{t.close}</Button></DialogActions></Dialog>
 </>;
}
