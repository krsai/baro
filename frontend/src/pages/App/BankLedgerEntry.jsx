import {ledgerDocumentPartyMismatch} from '../../utils/ledgerCounterparty.mjs';
import {permitsAccountingDirection} from '../../constants/accountingDirection';
import ChangeApprovalDialog from '../../components/ChangeApprovalDialog';
import {changeApprovalText} from '../../constants/changeApprovals';
import React,{useEffect,useRef,useState} from 'react';
import {useLocation,useParams} from 'react-router-dom';
import LedgerEntryGrid from '../../components/LedgerEntryGrid';
import {Alert,Box,Button,Paper,Stack,Typography} from '@mui/material';
import {Add} from '@mui/icons-material';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import SaveButton from '../../components/SaveButton';
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
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
const newRow=(accountId='')=>({clientKey:crypto.randomUUID(),entryKind:'BANK',accountId,transactionDate:today(),direction:'IN',amount:'',purpose:'',accountingCodeId:'',evidenceType:'FILE',evidenceNumber:'',expenseItems:[],document:null,counterparty:null});
const snapshot=rows=>JSON.stringify(rows);
export default function BankLedgerEntry(){const {activeOrgId}=useAuth(),{entryId}=useParams();return <Entry key={activeOrgId+':'+(entryId||'new')} orgId={activeOrgId} entryId={entryId}/>;}
function Entry({orgId,entryId}){
 const location=useLocation(),path=useRef(location.pathname+location.search),{navigateToPath}=useAppActions(),{active}=useRequestScopeContext(),activeRef=useRef(active);activeRef.current=active;
 const {languageCode}=useLanguage(),t=bankLedgerMessages[languageCode]||bankLedgerMessages.en,e=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en,w=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en,l=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const sourceRevision=useRef(null),changeRef=useRef(null);const [parties,setParties]=useState([]);
 const [codes,setCodes]=useState([]),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState(false),[accounts,setAccounts]=useState([]),[rows,setRows]=useState(()=>[newRow(new URLSearchParams(location.search).get('accountId')||'')]),[expanded,setExpanded]=useState({}),[error,setError]=useState(''),[errorRow,setErrorRow]=useState(null),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false);
 const initial=useRef(snapshot(rows)),batchKey=useRef(crypto.randomUUID()),busy=useRef(false),locked=saving||uncertain||loading||loadError;
 useUnsavedChanges(snapshot(rows)!==initial.current||uncertain);
 useEffect(()=>{if(!orgId)return;let live=true;Promise.all([requestJSON('/bank-ledger/accounts'+buildQueryString({orgId}),{skipCache:true}),requestJSON('/transaction-codes'+buildQueryString({orgId,forAccounting:'1'}),{skipCache:true}),entryId?requestJSON('/bank-ledger/entries/'+entryId+buildQueryString({orgId}),{skipCache:true}):null,requestJSON('/bank-ledger/counterparties'+buildQueryString({orgId}),{skipCache:true})]).then(([result,options,source,partyOptions])=>{if(!live)return;setAccounts(result.accounts);setCodes(options);setParties(partyOptions);if(source){sourceRevision.current=source.revision;const main={...newRow(source.accountId),transactionDate:source.transactionDate,direction:source.direction,amount:source.amount,purpose:source.purpose,accountingCodeId:source.accountingCodeId||'',evidenceType:source.evidenceType,evidenceNumber:source.evidenceNumber,expenseItems:source.expenseItems,document:source.document,counterparty:source.counterparty||null};const details=source.settlementLines.length?source.settlementLines:Number(source.bankFee)>0?[{kind:'FEE',amount:source.bankFee,purpose:'',accountingCodeId:''}]:[];const next=[main,...details.map(line=>({clientKey:crypto.randomUUID(),parentClientKey:main.clientKey,entryKind:line.kind,amount:line.amount,purpose:line.purpose,accountingCodeId:line.accountingCodeId||''}))];setRows(next);initial.current=snapshot(next);setCodes(current=>[...current,...[source.accountingCode,...source.settlementLines.map(line=>line.accountingCode)].filter(option=>option&&!current.some(row=>row.id===option.id))]);}}).catch(err=>{if(live){setLoadError(true);setError(t.errors[err.message]||t.failed);}}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[orgId,entryId]);
 const mutate=fn=>{if(locked)return;setErrorRow(null);setError('');batchKey.current=crypto.randomUUID();setRows(fn);};
 const edit=(key,patch)=>mutate(current=>current.map(row=>row.clientKey===key?{...row,...patch}:row));
 const resetEvidence=(key,patch)=>{mutate(current=>current.filter(row=>row.parentClientKey!==key).map(row=>row.clientKey===key?{...row,...patch,document:null,counterparty:patch.evidenceType==='ADJUSTMENT'?null:row.counterparty,evidenceNumber:'',expenseItems:[]}:row));setExpanded(current=>({...current,[key]:true}));};
 const changeDirection=(row,value)=>{const adjustment=value.startsWith('BALANCE_');if(adjustment)return;const direction=adjustment?value.slice(8):value;if(adjustment||row.evidenceType==='ADJUSTMENT'||row.evidenceType==='INVOICE'&&direction!=='IN'||row.evidenceType==='EXPENSE'&&direction!=='OUT')resetEvidence(row.clientKey,{direction,evidenceType:adjustment?'ADJUSTMENT':'FILE'});else edit(row.clientKey,{direction});};
 const selectDocument=(row,document)=>{resetEvidence(row.clientKey,{});edit(row.clientKey,{document,counterparty:row.counterparty||document.counterparty||null,evidenceNumber:row.evidenceType==='INVOICE'?document.reference:'',amount:document.remaining,expenseItems:document.items?.map(item=>({itemId:item.id,amount:item.remaining,label:item.description}))||[]});};
 const addChild=(parent,kind)=>mutate(current=>{const index=current.findLastIndex(row=>row.clientKey===parent.clientKey||row.parentClientKey===parent.clientKey);return [...current.slice(0,index+1),{clientKey:crypto.randomUUID(),parentClientKey:parent.clientKey,entryKind:kind,amount:'',purpose:'',accountingCodeId:''},...current.slice(index+1)];});
 const payload=()=>rows.map(row=>row.entryKind==='BANK'?{clientKey:row.clientKey,entryKind:'BANK',...(row.counterparty?{counterparty:row.counterparty}:{}),accountId:row.accountId,transactionDate:row.transactionDate,direction:row.direction,amount:row.amount,purpose:row.purpose,remark:row.purpose,accountingCodeId:Number(row.accountingCodeId),evidenceType:row.evidenceType,evidenceNumber:row.evidenceNumber,expenseRequestId:row.evidenceType==='EXPENSE'?row.document?.id:undefined,expenseVersion:row.document?.version,expenseItems:row.expenseItems.map(({itemId,amount})=>({itemId,amount}))}:{...row,accountingCodeId:Number(row.accountingCodeId)});
 const submit=async event=>{event.preventDefault();if(busy.current)return;setError('');setErrorRow(null);
  const invalid=rows.findIndex(row=>!row.amount.trim()||!row.accountingCodeId||(row.entryKind==='BANK'||row.entryKind==='WRITEOFF')&&!row.purpose.trim()||row.entryKind==='BANK'&&(!accounts.some(a=>a.id===row.accountId)||row.evidenceType==='FILE'&&(!row.evidenceNumber.trim()||!row.counterparty)||['INVOICE','EXPENSE'].includes(row.evidenceType)&&!row.document||row.evidenceType==='EXPENSE'&&!row.expenseItems.length));
  if(invalid>=0){setErrorRow(rows[invalid].clientKey);setExpanded(current=>({...current,[rows[invalid].clientKey]:true}));setError(`${w.row} ${invalid+1}: ${w.rowError}`);return;}
  const wrongParty=rows.findIndex(ledgerDocumentPartyMismatch);
  if(wrongParty>=0){setErrorRow(rows[wrongParty].clientKey);setError(w.row+' '+(wrongParty+1)+': '+t.errors.LEDGER_COUNTERPARTY_MISMATCH);document.querySelector('[data-ledger-entry-row="'+wrongParty+'"]')?.scrollIntoView({block:'center',behavior:'smooth'});return;}
  const wrongDirection=rows.findIndex(row=>{const code=codes.find(code=>code.id===row.accountingCodeId);return code&&!permitsAccountingDirection(code,row.entryKind==='BANK'?row.direction:'OUT');});
  if(wrongDirection>=0){setErrorRow(rows[wrongDirection].clientKey);setError(w.row+' '+(wrongDirection+1)+': '+t.errors.ACCOUNTING_CODE_DIRECTION_MISMATCH);document.querySelector('[data-ledger-entry-row="'+wrongDirection+'"]')?.scrollIntoView({block:'center',behavior:'smooth'});return;}
  busy.current=true;setSaving(true);try{
   const body={schemaVersion:2,accountingCodeVersion:1,clientKey:batchKey.current,rows:payload()};
   if(entryId){const result=await changeRef.current.prepare({menu:'BANK_LEDGER',operation:'UPDATE',sourceKind:'ledger',sourceId:entryId,revision:sourceRevision.current,payload:body});if(!result)return;}else await requestJSON('/bank-ledger/entries/batch'+buildQueryString({orgId}),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const next=[newRow()];initial.current=snapshot(next);setRows(next);batchKey.current=crypto.randomUUID();setUncertain(false);setExpanded({});emitWorkspaceDataChanged({orgId,source:'bank-ledger',topics:['bank-ledger']});if(activeRef.current)navigateToPath('/bank-ledger',{closeTabId:path.current,skipUnsavedChangesCheck:true});
  }catch(err){const unknown=!err.status||err.status>=500;setUncertain(unknown);const match=/^LEDGER_ROW:(\d+):(.+)$/.exec(err.message||'');if(match){const index=Number(match[1])-1;const failed=rows[index];if(failed){setErrorRow(failed.clientKey);document.querySelector('[data-ledger-entry-row="'+index+'"]')?.scrollIntoView({block:'center',behavior:'smooth'});}}setError(unknown?t.uncertain:match?`${w.row} ${match[1]}: ${t.errors[match[2]]||w.rowError}`:t.errors[err.message]||w.batchError);}finally{busy.current=false;setSaving(false);}
 };
 return <AppPageContainer title={entryId?l.editTitle:t.addEntry} titleActions={<Stack direction="row" spacing={1}><Button disabled={locked} onClick={()=>navigateToPath('/bank-ledger',{closeTabId:path.current})}>{t.cancel}</Button><SaveButton type="submit" form="ledger-entry-form" loading={saving} disabled={loading||loadError||!accounts.length}>{uncertain?t.retry:entryId?(changeApprovalText[languageCode]||changeApprovalText.en).requestUpdate:t.save}</SaveButton></Stack>}><PageContentStack>{error&&<Alert severity="error">{error}</Alert>}
 <Box component="form" id="ledger-entry-form" onSubmit={submit} noValidate><Paper variant="outlined" sx={{overflow:'hidden'}}>
 <LedgerEntryGrid errorRow={errorRow} errorMessage={error} rows={rows} accounts={accounts} codes={codes} parties={parties} languageCode={languageCode} orgId={orgId} locked={locked} expanded={expanded} setExpanded={setExpanded} edit={edit} resetEvidence={resetEvidence} changeDirection={changeDirection} selectDocument={selectDocument} addChild={addChild} mutate={mutate}/>
 <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:2,py:1.5}}><Typography variant="caption" color="text.secondary">{l.limit}</Typography><Button startIcon={<Add/>} disabled={locked||!!entryId||rows.length>=50} onClick={()=>mutate(current=>[...current,newRow(current.findLast(r=>r.entryKind==='BANK')?.accountId)])}>{w.add}</Button></Stack>
 </Paper></Box><ChangeApprovalDialog ref={changeRef} orgId={orgId} languageCode={languageCode}/></PageContentStack></AppPageContainer>;
}
