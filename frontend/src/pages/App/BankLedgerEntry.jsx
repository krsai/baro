import React,{useEffect,useRef,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Alert,Box,Button,IconButton,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import DeleteOutline from '@mui/icons-material/DeleteOutline';
import AppPageContainer from '../../components/AppPageContainer';
import LedgerEvidenceFields from '../../components/LedgerEvidenceFields';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {useRequestScopeContext} from '../../context/RequestScopeContext';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {bankLedgerMessages} from '../../constants/bankLedgerMessages';
import {ledgerEvidenceText} from '../../constants/ledgerEvidence';
import {ledgerWorkspaceText} from '../../constants/ledgerWorkspace';
import {ledgerAccountName} from './BankLedger';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
const newRow=(accountId='')=>({uiId:crypto.randomUUID(),clientKey:crypto.randomUUID(),accountId,transactionDate:today(),direction:'IN',amount:'',purpose:'',evidenceType:'FILE',evidenceNumber:'',bankFee:'0',expenseItems:[]});
const snapshot=rows=>JSON.stringify(rows.map(({uiId,clientKey,...row})=>row));
export default function BankLedgerEntry(){const {activeOrgId}=useAuth();return <Entry key={activeOrgId} orgId={activeOrgId}/>;}
function Entry({orgId}){
 const location=useLocation(),path=useRef(location.pathname+location.search),{navigateToPath}=useAppActions(),{active}=useRequestScopeContext(),activeRef=useRef(active);activeRef.current=active;
 const {languageCode}=useLanguage(),t=bankLedgerMessages[languageCode]||bankLedgerMessages.en,e=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en,w=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en;
 const [accounts,setAccounts]=useState([]),[rows,setRows]=useState(()=>[newRow(new URLSearchParams(location.search).get('accountId')||'')]),[expanded,setExpanded]=useState(null),[error,setError]=useState(''),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false);
 const initial=useRef(snapshot(rows)),batchKey=useRef(crypto.randomUUID()),busy=useRef(false);const locked=saving||uncertain;
 useUnsavedChanges(snapshot(rows)!==initial.current||uncertain);
 useEffect(()=>{if(!orgId)return;let live=true;requestJSON(`/bank-ledger/accounts${buildQueryString({orgId})}`,{skipCache:true}).then(result=>{if(live)setAccounts(result.accounts);}).catch(err=>{if(live)setError(t.errors[err.message]||t.failed);});return()=>{live=false;};},[orgId]);
 const mutate=fn=>{if(locked)return;batchKey.current=crypto.randomUUID();setRows(fn);};
 const edit=(index,patch)=>mutate(current=>current.map((row,i)=>i===index?{...row,...patch,clientKey:crypto.randomUUID()}:row));
 const changeType=(index,type)=>{edit(index,{evidenceType:type,evidenceNumber:'',expenseItems:[],bankFee:'0',...(type==='INVOICE'?{direction:'IN'}:type==='EXPENSE'?{direction:'OUT'}:{})});setExpanded(type==='EXPENSE'?index:null);};
 const submit=async event=>{event.preventDefault();if(busy.current)return;setError('');
  const invalid=rows.findIndex(row=>!accounts.some(a=>a.id===row.accountId)||!row.amount.trim()||!row.purpose.trim()||(['FILE','INVOICE'].includes(row.evidenceType)&&!row.evidenceNumber.trim())||(row.evidenceType==='EXPENSE'&&!row.expenseItems.length));
  if(invalid>=0){setError(`${w.row} ${invalid+1}: ${w.rowError}`);return;}
  busy.current=true;setSaving(true);try{
   await requestJSON(`/bank-ledger/entries/batch${buildQueryString({orgId})}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientKey:batchKey.current,rows:rows.map(({uiId,...row})=>({...row,expenseItems:row.expenseItems.map(({itemId,amount})=>({itemId,amount}))}))})});
   const next=[newRow()];initial.current=snapshot(next);setRows(next);batchKey.current=crypto.randomUUID();setUncertain(false);setExpanded(null);emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger']});if(activeRef.current)navigateToPath('/bank-ledger',{closeTabId:path.current,skipUnsavedChangesCheck:true});
  }catch(err){const unknown=!err.status||err.status>=500;setUncertain(unknown);const match=/^LEDGER_ROW:(\d+):(.+)$/.exec(err.message||'');setError(unknown?t.uncertain:match?`${w.row} ${match[1]}: ${t.errors[match[2]]||w.rowError}`:t.errors[err.message]||w.batchError);}finally{busy.current=false;setSaving(false);}
 };
 return <AppPageContainer title={t.addEntry}><Box component="form" onSubmit={submit}><Paper variant="outlined" sx={{overflow:'hidden'}}><Stack spacing={2} sx={{p:2}}><Typography variant="body2">{w.batchHint}</Typography>{error&&<Alert severity="error">{error}</Alert>}</Stack>
  <TableContainer><Table size="small" sx={{minWidth:1500,tableLayout:'fixed'}}><TableHead><TableRow>{['#',t.account,t.transactionDate,t.direction,t.amount,t.purpose,w.evidence,''].map((label,index)=><TableCell key={index} sx={{width:[42,220,150,110,150,210,360,50][index]}}>{label}</TableCell>)}</TableRow></TableHead><TableBody>
   {rows.map((row,index)=>{const account=accounts.find(a=>a.id===row.accountId),input=(field,extra={})=><TextField fullWidth size="small" required label={t[field]} value={row[field]} disabled={locked} onChange={ev=>edit(index,{[field]:ev.target.value})} {...extra}/>;return <React.Fragment key={row.uiId}><TableRow data-ledger-entry-row={index} sx={{'& td':{verticalAlign:'top',py:2}}}>
    <TableCell>{index+1}</TableCell><TableCell><TextField select fullWidth size="small" required label={t.account} value={row.accountId} disabled={locked} onChange={ev=>edit(index,{accountId:ev.target.value,expenseItems:[]})}><MenuItem value="" disabled>{w.choose}</MenuItem>{accounts.map(a=><MenuItem key={a.id} value={a.id}>{ledgerAccountName(a)} / {a.currencyCode}</MenuItem>)}</TextField></TableCell>
    <TableCell>{input('transactionDate',{type:'date',InputLabelProps:{shrink:true},inputProps:{min:account?.openingDate,max:today()}})}</TableCell><TableCell>{input('direction',{select:true,children:['IN','OUT'].map(d=><MenuItem key={d} value={d}>{t[d]}</MenuItem>)})}</TableCell><TableCell>{input('amount',{helperText:account?.currencyCode||' ',inputProps:{inputMode:'decimal',maxLength:25}})}</TableCell><TableCell>{input('purpose',{multiline:true,minRows:2,inputProps:{maxLength:1000}})}</TableCell>
    <TableCell><Stack spacing={1}><TextField select fullWidth size="small" label={e.type} value={row.evidenceType} disabled={locked} onChange={ev=>changeType(index,ev.target.value)}>{['FILE','INVOICE','EXPENSE','ADJUSTMENT'].map(type=><MenuItem key={type} value={type}>{e[type]}</MenuItem>)}</TextField>
     {['FILE','INVOICE'].includes(row.evidenceType)&&<TextField fullWidth size="small" required label={row.evidenceType==='FILE'?e.reference:e.invoice} value={row.evidenceNumber} disabled={locked} inputProps={{maxLength:row.evidenceType==='FILE'?500:200}} onChange={ev=>edit(index,{evidenceNumber:ev.target.value})}/>}
     {row.evidenceType==='EXPENSE'&&<Button disabled={locked||!account} onClick={()=>setExpanded(expanded===index?null:index)}>{w.evidence} ({row.expenseItems.length})</Button>}
     {['INVOICE','EXPENSE'].includes(row.evidenceType)&&<TextField fullWidth size="small" required label={e.fee} value={row.bankFee} disabled={locked} inputProps={{inputMode:'decimal'}} onChange={ev=>edit(index,{bankFee:ev.target.value})}/>}
    </Stack></TableCell><TableCell><IconButton aria-label={w.remove} disabled={locked||rows.length===1} onClick={()=>{mutate(current=>current.filter((_,i)=>i!==index));setExpanded(null);}}><DeleteOutline fontSize="small"/></IconButton></TableCell>
   </TableRow>{expanded===index&&row.evidenceType==='EXPENSE'&&<TableRow><TableCell colSpan={8} sx={{p:2,bgcolor:'action.hover'}}><LedgerEvidenceFields key={`${row.uiId}:${row.accountId}`} form={row} change={(field,value)=>edit(index,{[field]:value})} disabled={locked} orgId={orgId} currencyCode={account?.currencyCode} languageCode={languageCode} detailsOnly/></TableCell></TableRow>}</React.Fragment>;})}
  </TableBody></Table></TableContainer><Stack direction="row" justifyContent="space-between" sx={{p:2}}><Button disabled={locked||rows.length>=50} onClick={()=>mutate(current=>[...current,newRow(current.at(-1)?.accountId)])}>{w.add}</Button><Stack direction="row" spacing={1}><Button disabled={locked} onClick={()=>navigateToPath('/bank-ledger',{closeTabId:path.current})}>{t.cancel}</Button><Button type="submit" variant="contained" disabled={saving||!accounts.length}>{uncertain?t.retry:t.save}</Button></Stack></Stack>
 </Paper></Box></AppPageContainer>;
}
