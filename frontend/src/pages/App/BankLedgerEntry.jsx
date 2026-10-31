import React,{useEffect,useRef,useState} from 'react';
import {useLocation,useParams} from 'react-router-dom';
import LedgerEntryGrid from '../../components/LedgerEntryGrid';
import {Alert,Box,Button,IconButton,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {Add,DeleteOutline,ExpandLess,ExpandMore} from '@mui/icons-material';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import SaveButton from '../../components/SaveButton';
import CustomDatePicker from '../../components/CustomDatePicker';
import LedgerDocumentPicker from '../../components/LedgerDocumentPicker';
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
import {ledgerEntryText} from '../../constants/ledgerEntry';
import {formatLedgerMoney} from '../../utils/bankLedgerMoney.mjs';
import {ledgerAccountName} from './BankLedger';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
const newRow=(accountId='')=>({clientKey:crypto.randomUUID(),entryKind:'BANK',accountId,transactionDate:today(),direction:'IN',amount:'',purpose:'',purposeCodeId:'',evidenceType:'FILE',evidenceNumber:'',expenseItems:[],document:null});
const snapshot=rows=>JSON.stringify(rows);
const minor=value=>/^\d+(\.\d{0,2})?$/.test(String(value))?BigInt(String(value).split('.')[0])*100n+BigInt((String(value).split('.')[1]||'').padEnd(2,'0')):0n;
const decimal=value=>`${value/100n}.${String(value%100n).padStart(2,'0')}`;
export default function BankLedgerEntry(){const {activeOrgId}=useAuth(),{entryId}=useParams();return <Entry key={activeOrgId+':'+(entryId||'new')} orgId={activeOrgId} entryId={entryId}/>;}
function Entry({orgId,entryId}){
 const location=useLocation(),path=useRef(location.pathname+location.search),{navigateToPath}=useAppActions(),{active}=useRequestScopeContext(),activeRef=useRef(active);activeRef.current=active;
 const {languageCode}=useLanguage(),t=bankLedgerMessages[languageCode]||bankLedgerMessages.en,e=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en,w=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en,l=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const [codes,setCodes]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[accounts,setAccounts]=useState([]),[rows,setRows]=useState(()=>[newRow(new URLSearchParams(location.search).get('accountId')||'')]),[expanded,setExpanded]=useState({}),[error,setError]=useState(''),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false);
 const initial=useRef(snapshot(rows)),batchKey=useRef(crypto.randomUUID()),busy=useRef(false),locked=saving||uncertain||loading||loadError;
 useUnsavedChanges(snapshot(rows)!==initial.current||uncertain);
 useEffect(()=>{if(!orgId)return;let live=true;Promise.all([requestJSON('/bank-ledger/accounts'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/bank-ledger/purpose-codes'+buildQueryString({orgId}),{skipCache:true}),entryId?requestJSON('/bank-ledger/entries/'+entryId+buildQueryString({orgId}),{skipCache:true}):null]).then(([result,options,source])=>{if(!live)return;setAccounts(result.accounts);setCodes(options);if(source){const main={...newRow(source.accountId),transactionDate:source.transactionDate,direction:source.direction,amount:source.amount,purpose:source.purpose,purposeCodeId:source.purposeCodeId||'',evidenceType:source.evidenceType,evidenceNumber:source.evidenceNumber,expenseItems:source.expenseItems,document:source.document};const details=source.settlementLines.length?source.settlementLines:Number(source.bankFee)>0?[{kind:'FEE',amount:source.bankFee,purpose:'',purposeCodeId:''}]:[];const next=[main,...details.map(line=>({clientKey:crypto.randomUUID(),parentClientKey:main.clientKey,entryKind:line.kind,amount:line.amount,purpose:line.purpose,purposeCodeId:line.purposeCodeId||''}))];setRows(next);initial.current=snapshot(next);setCodes(current=>[...current,...[source.purposeCode,...source.settlementLines.map(line=>line.purposeCode)].filter(option=>option&&!current.some(row=>row.id===option.id))]);}}).catch(err=>{if(live){setLoadError(true);setError(t.errors[err.message]||t.failed);}}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[orgId,entryId]);
 const mutate=fn=>{if(locked)return;batchKey.current=crypto.randomUUID();setRows(fn);};
 const edit=(key,patch)=>mutate(current=>current.map(row=>row.clientKey===key?{...row,...patch}:row));
 const resetEvidence=(key,patch)=>{mutate(current=>current.filter(row=>row.parentClientKey!==key).map(row=>row.clientKey===key?{...row,...patch,document:null,evidenceNumber:'',expenseItems:[]}:row));setExpanded(current=>({...current,[key]:true}));};
 const changeDirection=(row,value)=>{const adjustment=value.startsWith('BALANCE_'),direction=adjustment?value.slice(8):value;if(adjustment||row.evidenceType==='ADJUSTMENT'||row.evidenceType==='INVOICE'&&direction!=='IN'||row.evidenceType==='EXPENSE'&&direction!=='OUT')resetEvidence(row.clientKey,{direction,evidenceType:adjustment?'ADJUSTMENT':'FILE'});else edit(row.clientKey,{direction});};
 const selectDocument=(row,document)=>{resetEvidence(row.clientKey,{});edit(row.clientKey,{document,evidenceNumber:row.evidenceType==='INVOICE'?document.reference:'',amount:document.remaining,expenseItems:document.items?.map(item=>({itemId:item.id,amount:item.remaining,label:item.description}))||[]});};
 const addChild=(parent,kind)=>mutate(current=>{const index=current.findLastIndex(row=>row.clientKey===parent.clientKey||row.parentClientKey===parent.clientKey);return [...current.slice(0,index+1),{clientKey:crypto.randomUUID(),parentClientKey:parent.clientKey,entryKind:kind,amount:'',purpose:'',purposeCodeId:''},...current.slice(index+1)];});
 const payload=()=>rows.map(row=>row.entryKind==='BANK'?{clientKey:row.clientKey,entryKind:'BANK',accountId:row.accountId,transactionDate:row.transactionDate,direction:row.direction,amount:row.amount,purpose:row.purpose,purposeCodeId:Number(row.purposeCodeId),evidenceType:row.evidenceType,evidenceNumber:row.evidenceNumber,expenseRequestId:row.evidenceType==='EXPENSE'?row.document?.id:undefined,expenseVersion:row.document?.version,expenseItems:row.expenseItems.map(({itemId,amount})=>({itemId,amount}))}:{...row,purposeCodeId:Number(row.purposeCodeId)});
 const submit=async event=>{event.preventDefault();if(busy.current)return;setError('');
  const invalid=rows.findIndex(row=>!row.amount.trim()||!row.purposeCodeId||(row.entryKind==='WRITEOFF'||row.evidenceType==='ADJUSTMENT')&&!row.purpose.trim()||row.entryKind==='BANK'&&(!accounts.some(a=>a.id===row.accountId)||row.evidenceType==='FILE'&&!row.evidenceNumber.trim()||['INVOICE','EXPENSE'].includes(row.evidenceType)&&!row.document||row.evidenceType==='EXPENSE'&&!row.expenseItems.length));
  if(invalid>=0){setExpanded(current=>({...current,[rows[invalid].clientKey]:true}));setError(`${w.row} ${invalid+1}: ${w.rowError}`);return;}
  busy.current=true;setSaving(true);try{
   await requestJSON((entryId?'/bank-ledger/entries/'+entryId:'/bank-ledger/entries/batch')+buildQueryString({orgId}),{method:entryId?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schemaVersion:2,clientKey:batchKey.current,rows:payload()})});
   const next=[newRow()];initial.current=snapshot(next);setRows(next);batchKey.current=crypto.randomUUID();setUncertain(false);setExpanded({});emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger']});if(activeRef.current)navigateToPath('/bank-ledger',{closeTabId:path.current,skipUnsavedChangesCheck:true});
  }catch(err){const unknown=!err.status||err.status>=500;setUncertain(unknown);const match=/^LEDGER_ROW:(\d+):(.+)$/.exec(err.message||'');setError(unknown?t.uncertain:match?`${w.row} ${match[1]}: ${t.errors[match[2]]||w.rowError}`:t.errors[err.message]||w.batchError);}finally{busy.current=false;setSaving(false);}
 };
 return <AppPageContainer title={entryId?l.editTitle:t.addEntry} titleActions={<Stack direction="row" spacing={1}><Button disabled={locked} onClick={()=>navigateToPath('/bank-ledger',{closeTabId:path.current})}>{t.cancel}</Button><SaveButton type="submit" form="ledger-entry-form" loading={saving} disabled={loading||loadError||!accounts.length}>{uncertain?t.retry:t.save}</SaveButton></Stack>}><PageContentStack>{error&&<Alert severity="error">{error}</Alert>}
 <Box component="form" id="ledger-entry-form" onSubmit={submit} noValidate><Paper variant="outlined" sx={{overflow:'hidden'}}>
 <LedgerEntryGrid rows={rows} accounts={accounts} codes={codes} languageCode={languageCode} orgId={orgId} locked={locked} expanded={expanded} setExpanded={setExpanded} edit={edit} resetEvidence={resetEvidence} changeDirection={changeDirection} selectDocument={selectDocument} addChild={addChild} mutate={mutate}/>
 <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:2,py:1.5}}><Typography variant="caption" color="text.secondary">{l.limit}</Typography><Button startIcon={<Add/>} disabled={locked||!!entryId||rows.length>=50} onClick={()=>mutate(current=>[...current,newRow(current.findLast(r=>r.entryKind==='BANK')?.accountId)])}>{w.add}</Button></Stack>
 </Paper></Box></PageContentStack></AppPageContainer>;
}
