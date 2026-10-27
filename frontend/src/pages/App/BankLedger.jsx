import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import dayjs from 'dayjs';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import SearchPanel from '../../components/SearchPanel';
import DateRangeSelector from '../../components/DateRangeSelector';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {formatLedgerMoney} from '../../utils/bankLedgerMoney.mjs';
import {bankLedgerMessages} from '../../constants/bankLedgerMessages';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default function BankLedger(){const {activeOrgId}=useAuth();return <CompanyLedger key={activeOrgId} orgId={activeOrgId}/>;}
function CompanyLedger({orgId}){
 const {activeProfile}=useAuth(),{languageCode}=useLanguage(),t=bankLedgerMessages[languageCode]||bankLedgerMessages.en;
 const [accounts,setAccounts]=useState([]),[accountId,setAccountId]=useState(''),[data,setData]=useState(null),[reload,setReload]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [start,setStart]=useState(()=>today().slice(0,7)+'-01'),[end,setEnd]=useState(today),[page,setPage]=useState(0);
 const [dialog,setDialog]=useState(null),[form,setForm]=useState({}),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[formError,setFormError]=useState(''),[members,setMembers]=useState([]);
 const busy=useRef(false),key=useRef(''),initialForm=useRef('');
 const account=accounts.find(row=>row.id===accountId),scope=buildQueryString({orgId});
 const dirty=!!dialog&&JSON.stringify(form)!==initialForm.current;
 useUnsavedChanges(dirty||uncertain);
 const message=e=>t.errors[e.message]||`${t.failed} ${e.message||''}`;
 useEffect(()=>{
  let active=true;if(!orgId)return;
  requestJSON(`/bank-ledger/accounts${scope}`,{skipCache:true}).then(result=>{if(!active)return;setAccounts(result.accounts);setAccountId(previous=>result.accounts.some(row=>row.id===previous)?previous:result.accounts[0]?.id||'');}).catch(e=>{if(active)setError(message(e));});
  return()=>{active=false;};
 },[orgId,reload]);
 useEffect(()=>{
  if(!accountId){setData(null);return;}
  let active=true;setLoading(true);setError('');setData(null);
  requestJSON(`/bank-ledger/accounts/${accountId}/entries${buildQueryString({orgId,start,end,page})}`,{skipCache:true}).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(message(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[orgId,accountId,start,end,page,reload]);
 const open=(mode,entry=null)=>{
  const next=mode==='account'?{bankName:'',accountNumber:'',accountHolder:activeProfile?.orgName||'',currencyCode:'VND',openingDate:today(),openingBalance:'0'}:mode==='entry'?{transactionDate:today(),direction:'IN',amount:'',purpose:'',evidenceNumber:''}:mode==='members'?{name:'',email:'',role:'ACCOUNTANT'}:{reason:''};
  key.current=crypto.randomUUID();initialForm.current=JSON.stringify(next);setForm(next);setFormError('');setUncertain(false);setDialog({mode,entry});
  if(mode==='members')requestJSON(`/company-members${scope}`,{skipCache:true}).then(result=>setMembers(result.members)).catch(e=>setFormError(message(e)));
 };
 const change=(field,value)=>{setForm(previous=>({...previous,[field]:value}));key.current=crypto.randomUUID();};
 const close=()=>{if(saving||uncertain)return;setDialog(null);};
 const submit=async event=>{
  event?.preventDefault();if(busy.current)return;busy.current=true;setSaving(true);setFormError('');
  const mode=dialog.mode;
  const url=mode==='account'?'/bank-ledger/accounts':mode==='members'?'/company-members':`/bank-ledger/accounts/${accountId}/entries${mode==='void'?`/${dialog.entry.id}/void`:''}`;
  try{
   await requestJSON(`${url}${scope}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,clientKey:key.current})});
   setUncertain(false);setDialog(null);setReload(value=>value+1);
  }catch(e){const unknown=(!e.status||e.status>=500)&&mode!=='members';setUncertain(unknown);setFormError(unknown?t.uncertain:message(e));}
  finally{busy.current=false;setSaving(false);}
 };
 const input=(field,extra={})=><TextField key={field} fullWidth required label={t[field]} value={form[field]??''} disabled={saving||uncertain} onChange={e=>change(field,e.target.value)} {...extra}/>;
 const money=value=>formatLedgerMoney(value,account?.currencyCode||'VND');
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
  <Button disabled={loading} onClick={()=>setReload(value=>value+1)}>{t.refresh}</Button>
  {activeProfile?.orgRole==='ADMIN'&&<Button onClick={()=>open('members')}>{t.members}</Button>}
  <Button variant="outlined" onClick={()=>open('account')}>{t.addAccount}</Button><Button variant="contained" disabled={!accountId||loading} onClick={()=>open('entry')}>{t.addEntry}</Button>
 </Stack>}><PageContentStack>
  <Typography variant="body2">{activeProfile?.orgName}</Typography>
  <SearchPanel search={<TextField select fullWidth size="small" label={t.account} value={accountId} onChange={e=>{setAccountId(e.target.value);setPage(0);}} sx={{minWidth:220}}>{accounts.map(row=><MenuItem key={row.id} value={row.id}>{row.bankName} · {row.accountNumber} · {row.currencyCode}</MenuItem>)}</TextField>}
   controls={<DateRangeSelector independentDateBounds languageCode={languageCode} startValue={dayjs(start)} endValue={dayjs(end)} onStartChange={date=>{if(date?.isValid()){setStart(date.format('YYYY-MM-DD'));setPage(0);}}} onEndChange={date=>{if(date?.isValid()){setEnd(date.format('YYYY-MM-DD'));setPage(0);}}} minDate={account?dayjs(account.openingDate):undefined} maxDate={dayjs(today())}/>}/>
  {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{error}</Alert>}
  {!accounts.length&&!error&&<Alert severity="info">{t.noAccounts}</Alert>}
  {account&&<>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,minmax(0,1fr))'},gap:2}}>{[[t.currentBalance,data?.currentBalance??account.currentBalance],[t.totalIn,data?.totalIn],[t.totalOut,data?.totalOut]].map(([label,value])=><Paper key={label} variant="outlined" sx={{p:2}}><Typography variant="body2">{label}</Typography><Typography variant="h6">{money(value)}</Typography></Paper>)}</Box>
   <Typography variant="caption">{t.openingDate}: {account.openingDate} · {t.openingBalance}: {money(account.openingBalance)}</Typography>
   <Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>{[t.transactionDate,t.IN,t.OUT,t.purpose,t.evidenceNumber,t.balance,t.createdBy,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
    {!data?.rows?.length&&<TableRow><TableCell colSpan={8}>{loading?'…':t.empty}</TableCell></TableRow>}
    {data?.rows.map(row=><TableRow key={row.id}><TableCell sx={{whiteSpace:'nowrap'}}>{row.transactionDate}{row.voidedAt&&<Typography variant="caption" display="block">{t.voided}</Typography>}</TableCell><TableCell sx={{whiteSpace:'nowrap',textDecoration:row.voidedAt?'line-through':undefined}}>{row.direction==='IN'?money(row.amount):'—'}</TableCell><TableCell sx={{whiteSpace:'nowrap',textDecoration:row.voidedAt?'line-through':undefined}}>{row.direction==='OUT'?money(row.amount):'—'}</TableCell><TableCell sx={{minWidth:180,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.purpose}{row.voidedAt&&<Typography variant="caption" display="block">{row.voidReason}</Typography>}</TableCell><TableCell>{row.evidenceNumber}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{money(row.balance)}</TableCell><TableCell>{row.createdBy}</TableCell><TableCell>{!row.voidedAt&&<Button onClick={()=>open('void',row)}>{t.void}</Button>}</TableCell></TableRow>)}
   </TableBody></Table></TableContainer><Stack direction="row" spacing={1} justifyContent="flex-end" sx={{p:1}}><Button disabled={!page||loading} onClick={()=>setPage(value=>value-1)}>{t.previous}</Button><Button disabled={!data?.hasMore||loading} onClick={()=>setPage(value=>value+1)}>{t.next}</Button></Stack></Paper>
  </>}
 </PageContentStack>
 <Dialog open={!!dialog} onClose={close} fullWidth maxWidth="sm"><Box component="form" onSubmit={submit}>
  <DialogTitle>{dialog?.mode==='account'?t.addAccount:dialog?.mode==='entry'?t.addEntry:dialog?.mode==='members'?t.members:t.void}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
   {dialog?.mode==='account'&&<>{['bankName','accountNumber','accountHolder'].map(field=>input(field,{inputProps:{maxLength:field==='accountNumber'?100:120}}))}{input('currencyCode',{select:true,children:['VND','USD','KRW'].map(code=><MenuItem key={code} value={code}>{code}</MenuItem>)})}{input('openingDate',{type:'date',InputLabelProps:{shrink:true},inputProps:{max:today()}})}{input('openingBalance',{inputProps:{inputMode:'decimal',maxLength:25}})}<Typography variant="body2">{t.openingHint}</Typography></>}
   {dialog?.mode==='entry'&&<>{input('transactionDate',{type:'date',InputLabelProps:{shrink:true},inputProps:{min:account?.openingDate,max:today()}})}{input('direction',{select:true,children:['IN','OUT'].map(direction=><MenuItem key={direction} value={direction}>{t[direction]}</MenuItem>)})}{input('amount',{inputProps:{inputMode:'decimal',maxLength:25},helperText:account?.currencyCode})}{input('purpose',{multiline:true,minRows:2,inputProps:{maxLength:1000}})}{input('evidenceNumber',{inputProps:{maxLength:160}})}</>}
   {dialog?.mode==='void'&&input('reason',{label:t.voidReason,multiline:true,minRows:2,inputProps:{maxLength:1000}})}
   {dialog?.mode==='members'&&<>{members.map(row=><Typography key={row.id} variant="body2">{row.name} · {row.email} · {t[row.orgRole]||row.orgRole} · {row.status}</Typography>)}{input('name')}{input('email',{type:'email'})}{input('role',{select:true,children:['ACCOUNTANT','ADMIN'].map(role=><MenuItem key={role} value={role}>{t[role]}</MenuItem>)})}</>}
   {formError&&<Alert severity="error">{formError}</Alert>}
  </Stack></DialogContent><DialogActions><Button disabled={saving||uncertain} onClick={close}>{t.cancel}</Button><Button type="submit" variant="contained" disabled={saving}>{uncertain?t.retry:t.save}</Button></DialogActions>
 </Box></Dialog>
 </AppPageContainer>;
}
