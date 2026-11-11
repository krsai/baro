import SearchInput from '../../components/SearchInput';
import ChangeApprovalDialog from '../../components/ChangeApprovalDialog';
import {changeApprovalText} from '../../constants/changeApprovals';
import LedgerActivityTable from '../../components/LedgerActivityTable';
import LedgerBalanceDialog from '../../components/LedgerBalanceDialog';
import {ledgerBalanceText} from '../../constants/ledgerBalance';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Checkbox,FormControlLabel,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,TextField} from '@mui/material';
import dayjs from 'dayjs';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import SearchPanel from '../../components/SearchPanel';
import DateRangeSelector from '../../components/DateRangeSelector';
import {useAppActions} from '../../context/AppContext';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {bankLedgerMessages} from '../../constants/bankLedgerMessages';
import {ledgerEntryText} from '../../constants/ledgerEntry';
import {ledgerWorkspaceText} from '../../constants/ledgerWorkspace';
import {emitWorkspaceDataChanged,subscribeWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const ledgerAccountName=row=>row.displayName||[row.bankName,row.accountNumber].filter(Boolean).join(' / ');
export default function BankLedger(){const {activeOrgId}=useAuth();return <LedgerList key={activeOrgId} orgId={activeOrgId}/>;}
function LedgerList({orgId}){
 const {navigateToPath,showNotification}=useAppActions(),{activeOrgRole}=useAuth(),{languageCode}=useLanguage(),t=bankLedgerMessages[languageCode]||bankLedgerMessages.en,w=ledgerWorkspaceText[languageCode]||ledgerWorkspaceText.en;
 const [balanceOpen,setBalanceOpen]=useState(false),[search,setSearch]=useState('');
 const b=ledgerBalanceText[languageCode]||ledgerBalanceText.en;
 const [includeDeleted,setIncludeDeleted]=useState(false),[accountId,setAccountId]=useState(''),[data,setData]=useState(null),[start,setStart]=useState(()=>today().slice(0,7)+'-01'),[end,setEnd]=useState(today),[page,setPage]=useState(0),[reload,setReload]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const changeRef=useRef(null),changeText=changeApprovalText[languageCode]||changeApprovalText.en;
 useEffect(()=>subscribeWorkspaceDataChanged(e=>{if(Number(e?.orgId)===Number(orgId)&&['bank-ledger','business-accounts'].includes(e.source))setReload(n=>n+1);}),[orgId]);
 useEffect(()=>{if(!orgId)return;let live=true;setLoading(true);setError('');
  requestJSON(`/bank-ledger/entries${buildQueryString({orgId,accountId:accountId||undefined,includeVoided:0,search,start,end,page})}`,{skipCache:true}).then(result=>{if(live){setData(result);if(accountId&&result.selectedAccountId!==undefined&&result.selectedAccountId!==accountId)setAccountId(result.selectedAccountId);}}).catch(e=>{if(live)setError(t.errors[e.message]||`${t.failed} ${e.message}`);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};
 },[orgId,accountId,start,end,page,reload,includeDeleted,search]);
 const l=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const accounts=data?.accounts||[],selected=accounts.find(a=>a.id===accountId);
 const editEntry=row=>{if(!row.voidedAt)navigateToPath('/bank-ledger/edit/'+row.id);};
 const editKey=(event,row)=>{if(event.target===event.currentTarget&&event.key==='Enter'){event.preventDefault();editEntry(row);}};
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1}>{activeOrgRole==='ADMIN'&&<Button variant="outlined" onClick={()=>setBalanceOpen(true)}>{b.title}</Button>}<Button variant="contained" disabled={!accounts.length} onClick={()=>navigateToPath('/bank-ledger/new'+buildQueryString({accountId:accountId||undefined}))}>{t.addEntry}</Button></Stack>}><PageContentStack>
  <SearchPanel compact search={<SearchInput value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}}/>} onReset={()=>{setSearch('');setAccountId('');setIncludeDeleted(false);setStart(today().slice(0,7)+'-01');setEnd(today());setPage(0);}} controls={<DateRangeSelector independentDateBounds languageCode={languageCode} startValue={dayjs(start)} endValue={dayjs(end)} onStartChange={d=>{if(d?.isValid()){setStart(d.format('YYYY-MM-DD'));setPage(0);}}} onEndChange={d=>{if(d?.isValid()){setEnd(d.format('YYYY-MM-DD'));setPage(0);}}} minDate={selected?dayjs(selected.openingDate):undefined} maxDate={dayjs(today())}/>}/>
  {error&&<Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{error}</Alert>}
  <Paper variant="outlined"><LedgerActivityTable rows={data?.rows||[]} loading={loading} text={t} labels={{...l,delete:changeText.requestDelete}} currencyLabel={w.currency} languageCode={languageCode} onEdit={editEntry} onEditKey={editKey} onDelete={row=>changeRef.current.prepare({menu:'BANK_LEDGER',operation:'DELETE',sourceKind:'ledger',sourceId:row.id,payload:{}})}/><Stack direction="row" spacing={1} justifyContent="flex-end" sx={{p:1}}><Button disabled={!page||loading} onClick={()=>setPage(n=>n-1)}>{t.previous}</Button><Button disabled={!data?.hasMore||loading} onClick={()=>setPage(n=>n+1)}>{t.next}</Button></Stack></Paper>
 </PageContentStack>
 <ChangeApprovalDialog ref={changeRef} orgId={orgId} languageCode={languageCode}/>
 {balanceOpen&&activeOrgRole==='ADMIN'&&<LedgerBalanceDialog onNotify={showNotification} orgId={orgId} languageCode={languageCode} onClose={()=>setBalanceOpen(false)}/>}
 </AppPageContainer>;
}
