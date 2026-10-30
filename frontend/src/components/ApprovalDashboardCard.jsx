import React from 'react';
import {Alert,Box,Button,Chip,CircularProgress,Paper,Stack,Typography} from '@mui/material';
import useApprovalInbox from '../hooks/useApprovalInbox';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
import ApprovalInboxTable from './ApprovalInboxTable';
export function ApprovalMenuBadge({orgId}){const {rows,error,loading}=useApprovalInbox(orgId);return !error&&!loading&&rows.length?<Chip size="small" color="warning" label={rows.length}/>:null;}
export default function ApprovalDashboardCard({orgId,languageCode,onNavigate}){
 const {rows,loading,error,refresh}=useApprovalInbox(orgId),t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 return <Paper variant="outlined" sx={{p:2}} data-testid="approval-dashboard"><Stack direction="row" alignItems="center" spacing={1} sx={{mb:1}}><Typography variant="h6">{t.pendingTab}</Typography>{!loading&&!error&&<Chip size="small" color="warning" label={rows.length}/>}<Box sx={{flex:1}}/><Button onClick={()=>onNavigate('/approval-inbox')}>{t.viewAll}</Button></Stack>{loading?<CircularProgress size={22}/>:error?<Alert severity="error" action={<Button onClick={refresh}>{a.retry}</Button>}>{a.error}</Alert>:<ApprovalInboxTable rows={rows.slice(0,5)} languageCode={languageCode} onOpen={row=>onNavigate(`/outsourcing-record/edit/request/${row.id}`)}/>}</Paper>;
}
