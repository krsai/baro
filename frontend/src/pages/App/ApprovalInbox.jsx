import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Button,CircularProgress,Paper,Stack,Tab,Tabs,TextField} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import ApprovalInboxTable from '../../components/ApprovalInboxTable';
import useApprovalInbox from '../../hooks/useApprovalInbox';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {approvalWorkflowText} from '../../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../../constants/expenseApprovalActions';
import {normalizeLookupText} from '../../utils/expenseLookup.mjs';
export default function ApprovalInbox(){
 const {activeOrgId,activeProfile}=useAuth(),{languageCode}=useLanguage(),{navigateToPath}=useAppActions();
 const canDecide=['ADMIN','ACCOUNTANT'].includes(activeProfile?.orgRole),[view,setView]=useState(canDecide?'pending':'requested'),[search,setSearch]=useState('');
 useEffect(()=>{setView(canDecide?'pending':'requested');setSearch('');},[activeOrgId,canDecide]);
 const {rows,loading,error,refresh}=useApprovalInbox(activeOrgId,view),t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 const filtered=useMemo(()=>rows.filter(row=>normalizeLookupText([row.managementNumber,row.payee,row.drafter,row.reason].filter(Boolean).join(' ')).includes(normalizeLookupText(search))),[rows,search]);
 return <AppPageContainer title={t.center}><Stack spacing={2}><Paper variant="outlined"><Tabs value={view} onChange={(_,value)=>setView(value)} variant="scrollable" allowScrollButtonsMobile>{(canDecide?[['pending',t.pendingTab],['inProgress',t.progressTab],['completed',t.completedTab],['requested',t.requestedTab]]:[['requested',t.requestedTab]]).map(([value,label])=><Tab key={value} value={value} label={label}/>)}</Tabs></Paper><TextField size="small" label={t.search} value={search} onChange={event=>setSearch(event.target.value)}/><Paper variant="outlined">{loading?<CircularProgress size={24} sx={{m:2}}/>:error?<Alert severity="error" action={<Button onClick={refresh}>{a.retry}</Button>}>{a.error}</Alert>:<ApprovalInboxTable rows={filtered} languageCode={languageCode} completed={view==='completed'} onOpen={row=>navigateToPath(`/outsourcing-record/edit/request/${row.id}`)}/>}</Paper></Stack></AppPageContainer>;
}
