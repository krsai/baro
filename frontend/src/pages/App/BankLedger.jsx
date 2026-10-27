import {useLocation} from 'react-router-dom';
import {useAppActions} from '../../context/AppContext';
import {useRequestScopeContext} from '../../context/RequestScopeContext';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {ledgerEvidenceText} from '../../constants/ledgerEvidence';
import LedgerEvidenceFields from '../../components/LedgerEvidenceFields';
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
import {subscribeWorkspaceDataChanged} from '../../utils/workspaceDataEvents';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const newEntry=()=>({transactionDate:today(),direction:'IN',amount:'',purpose:'',evidenceNumber:'',evidenceType:'FILE',bankFee:'0',expenseItems:[]});
export default function BankLedger({entryMode=false}){const {activeOrgId}=useAuth();return <CompanyLedger key={String(activeOrgId)+entryMode} orgId={activeOrgId} entryMode={entryMode}/>;}
function CompanyLedger({orgId,entryMode}){
 const {navigateToPath}=useAppActions(),location=useLocation(),{active}=useRequestScopeContext(),activeRef=useRef(active);activeRef.current=active;
 const formPath=useRef(location.pathname+location.search);
 const requestedAccount=useRef(new URLSearchParams(location.search).get('accountId')||'');
 const {activeProfile}=useAuth(),{languageCode}=useLanguage(),t=bankLedgerMessages[languageCode]||bankLedgerMessages.en,et=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en;
 const [accounts,setAccounts]=useState([]),[accountId,setAccountId]=useState(requestedAccount.current),[data,setData]=useState(null),[reload,setReload]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const [start,setStart]=useState(()=>today().slice(0,7)+'-01'),[end,setEnd]=useState(today),[page,setPage]=useState(0);
 const [dialog,setDialog]=useState(entryMode?{mode:'entry'}:null),[form,setForm]=useState(()=>entryMode?newEntry():{}),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[formError,setFormError]=useState('');
 const busy=useRef(false),key=useRef(crypto.randomUUID()),initialForm=useRef(JSON.stringify(form));
 const account=accounts.find(row=>row.id===accountId),scope=buildQueryString({orgId});
 const dirty=!!dialog&&JSON.stringify(form)!==initialForm.current;
 useUnsavedChanges(dirty||uncertain);
 const message=e=>t.errors[e.message]||`${t.failed} ${e.message||''}`;
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event?.orgId)===Number(orgId)&&['business-accounts','bank-ledger'].includes(event?.source))setReload(value=>value+1);}),[orgId]);
 useEffect(()=>{
  let active=true;if(!orgId)return;
  requestJSON(`/bank-ledger/accounts${scope}`,{skipCache:true}).then(result=>{if(!active)return;setAccounts(result.accounts);setAccountId(previous=>result.accounts.find(row=>row.id===previous||previous.startsWith('entity:')&&row.entityAccountId===previous.slice(7))?.id||result.accounts[0]?.id||'');}).catch(e=>{if(active)setError(message(e));});
  return()=>{active=false;};
 },[orgId,reload]);
 useEffect(()=>{
  if(entryMode||!accountId||account?.setupRequired){setData(null);return;}
  let active=true;setLoading(true);setError('');setData(null);
  requestJSON(`/bank-ledger/accounts/${accountId}/entries${buildQueryString({orgId,start,end,page})}`,{skipCache:true}).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(message(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[orgId,accountId,account?.setupRequired,start,end,page,reload]);
 const open=(mode,entry=null)=>{
  const next=mode==='entry'?{transactionDate:today(),direction:'IN',amount:'',purpose:'',evidenceNumber:'',evidenceType:'FILE',bankFee:'0',expenseItems:[]}:{reason:''};
  key.current=crypto.randomUUID();initialForm.current=JSON.stringify(next);setForm(next);setFormError('');setUncertain(false);setDialog({mode,entry});
 };
 const change=(field,value)=>{setForm(previous=>({...previous,[field]:value}));key.current=crypto.randomUUID();};
 const close=()=>{if(saving||uncertain)return;if(entryMode){navigateToPath('/bank-ledger',{closeTabId:formPath.current});return;}setDialog(null);};
 const submit=async event=>{
  event?.preventDefault();if(busy.current)return;busy.current=true;setSaving(true);setFormError('');
  const mode=dialog.mode;
  const url=`/bank-ledger/accounts/${accountId}/entries${mode==='void'?`/${dialog.entry.id}/void`:''}`;
  try{
   await requestJSON(`${url}${scope}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,clientKey:key.current})});
   setUncertain(false);
   if(entryMode){const next=newEntry();initialForm.current=JSON.stringify(next);setForm(next);key.current=crypto.randomUUID();emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger']});if(activeRef.current)navigateToPath('/bank-ledger',{closeTabId:formPath.current,skipUnsavedChangesCheck:true});}
   else{setDialog(null);setReload(value=>value+1);}
  }catch(e){const unknown=(!e.status||e.status>=500);setUncertain(unknown);setFormError(unknown?t.uncertain:message(e));}
  finally{busy.current=false;setSaving(false);}
 };
 const input=(field,extra={})=><TextField key={field} fullWidth required label={t[field]} value={form[field]??''} disabled={saving||uncertain} onChange={e=>change(field,e.target.value)} {...extra}/>;
 const money=value=>formatLedgerMoney(value,account?.currencyCode||'VND');
 if(entryMode)return <AppPageContainer title={t.addEntry}><Box component="form" onSubmit={submit}><Paper variant="outlined" sx={{p:2}}><Stack spacing={2}>
  <TextField select required fullWidth label={t.account} value={accountId} disabled={saving||uncertain} onChange={e=>setAccountId(e.target.value)}>{accounts.map(row=><MenuItem key={row.id} value={row.id}>{row.displayName||[row.bankName,row.accountNumber].filter(Boolean).join(' / ')} / {row.currencyCode}</MenuItem>)}</TextField>
  {!accounts.length&&!error&&<Alert severity="info">{t.noAccounts}</Alert>}
  <>{input('transactionDate',{type:'date',InputLabelProps:{shrink:true},inputProps:{min:account?.openingDate,max:today()}})}{input('direction',{select:true,children:['IN','OUT'].map(direction=><MenuItem key={direction} value={direction}>{t[direction]}</MenuItem>)})}{input('amount',{inputProps:{inputMode:'decimal',maxLength:25},helperText:account?.currencyCode})}{input('purpose',{multiline:true,minRows:2,inputProps:{maxLength:1000}})}<LedgerEvidenceFields form={form} change={change} disabled={saving||uncertain} orgId={orgId} currencyCode={account?.currencyCode} languageCode={languageCode}/></>
  {(formError||error)&&<Alert severity="error">{formError||error}</Alert>}
  <Stack direction="row" spacing={1} justifyContent="flex-end"><Button disabled={saving||uncertain} onClick={close}>{t.cancel}</Button><Button type="submit" variant="contained" disabled={saving||!accountId}>{uncertain?t.retry:t.save}</Button></Stack>
 </Stack></Paper></Box></AppPageContainer>;
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
  <Button variant="contained" disabled={!accountId||loading} onClick={()=>navigateToPath('/bank-ledger/new'+buildQueryString({accountId}))}>{t.addEntry}</Button>
 </Stack>}><PageContentStack>
  <Typography variant="body2">{activeProfile?.orgName}</Typography>
  <SearchPanel search={<TextField select fullWidth size="small" label={t.account} value={accountId} onChange={e=>{setAccountId(e.target.value);setPage(0);}} sx={{minWidth:220}}>{accounts.map(row=><MenuItem key={row.id} value={row.id}>{row.displayName||[row.bankName,row.accountNumber].filter(Boolean).join(' / ')} / {row.currencyCode}</MenuItem>)}</TextField>}
   controls={<DateRangeSelector independentDateBounds languageCode={languageCode} startValue={dayjs(start)} endValue={dayjs(end)} onStartChange={date=>{if(date?.isValid()){setStart(date.format('YYYY-MM-DD'));setPage(0);}}} onEndChange={date=>{if(date?.isValid()){setEnd(date.format('YYYY-MM-DD'));setPage(0);}}} minDate={account?dayjs(account.openingDate):undefined} maxDate={dayjs(today())}/>}/>
  {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{error}</Alert>}
  {!accounts.length&&!error&&<Alert severity="info">{t.noAccounts}</Alert>}
  {account&&<>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,minmax(0,1fr))'},gap:2}}>{[[t.currentBalance,data?.currentBalance??account.currentBalance??'0'],[t.totalIn,data?.totalIn],[t.totalOut,data?.totalOut]].map(([label,value])=><Paper key={label} variant="outlined" sx={{p:2}}><Typography variant="body2">{label}</Typography><Typography variant="h6">{money(value)}</Typography></Paper>)}</Box>
   <Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>{[t.transactionDate,t.IN,t.OUT,t.purpose,t.evidenceNumber,t.balance,t.createdBy,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
    {!data?.rows?.length&&<TableRow><TableCell colSpan={8}>{loading?'…':t.empty}</TableCell></TableRow>}
    {data?.rows.map(row=><TableRow key={row.id}><TableCell sx={{whiteSpace:'nowrap'}}>{row.transactionDate}{row.voidedAt&&<Typography variant="caption" display="block">{t.voided}</Typography>}</TableCell><TableCell sx={{whiteSpace:'nowrap',textDecoration:row.voidedAt?'line-through':undefined}}>{row.direction==='IN'?money(row.amount):'—'}</TableCell><TableCell sx={{whiteSpace:'nowrap',textDecoration:row.voidedAt?'line-through':undefined}}>{row.direction==='OUT'?money(row.amount):'—'}</TableCell><TableCell sx={{minWidth:180,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.purpose}{row.voidedAt&&<Typography variant="caption" display="block">{row.voidReason}</Typography>}</TableCell><TableCell>{row.evidenceNumber||et[row.evidenceType]}<Typography variant="caption" display="block">{et[row.evidenceType||'FILE']}</Typography>{Number(row.bankFee)>0&&<Typography variant="caption" display="block">{et.fee}: {money(row.bankFee)}</Typography>}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{money(row.balance)}</TableCell><TableCell>{row.createdBy}</TableCell><TableCell>{!row.voidedAt&&<Button onClick={()=>open('void',row)}>{t.void}</Button>}</TableCell></TableRow>)}
   </TableBody></Table></TableContainer><Stack direction="row" spacing={1} justifyContent="flex-end" sx={{p:1}}><Button disabled={!page||loading} onClick={()=>setPage(value=>value-1)}>{t.previous}</Button><Button disabled={!data?.hasMore||loading} onClick={()=>setPage(value=>value+1)}>{t.next}</Button></Stack></Paper>
  </>}
 </PageContentStack>
 <Dialog open={!!dialog} onClose={close} fullWidth maxWidth="sm"><Box component="form" onSubmit={submit}>
  <DialogTitle>{dialog?.mode==='entry'?t.addEntry:t.void}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>
      {dialog?.mode==='void'&&input('reason',{label:t.voidReason,multiline:true,minRows:2,inputProps:{maxLength:1000}})}
   {formError&&<Alert severity="error">{formError}</Alert>}
  </Stack></DialogContent><DialogActions><Button disabled={saving||uncertain} onClick={close}>{t.cancel}</Button><Button type="submit" variant="contained" disabled={saving}>{uncertain?t.retry:t.save}</Button></DialogActions>
 </Box></Dialog>
 </AppPageContainer>;
}
