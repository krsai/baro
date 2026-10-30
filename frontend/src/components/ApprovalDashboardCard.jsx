import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Button,Chip,CircularProgress,Paper,Stack,Tab,TablePagination,Tabs,TextField,Typography} from '@mui/material';
import useApprovalInbox from '../hooks/useApprovalInbox';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
import {normalizeLookupText} from '../utils/expenseLookup.mjs';
import ApprovalInboxTable,{approvalRequestDestination} from './ApprovalInboxTable';
export default function ApprovalDashboardCard({orgId,languageCode,onNavigate,role='ACCOUNTANT'}){
 const canDecide=['ADMIN','ACCOUNTANT'].includes(role),[view,setView]=useState(canDecide?'pending':'requested'),[search,setSearch]=useState(''),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(10);
 const effectiveView=canDecide?view:'requested';
 useEffect(()=>{setView(canDecide?'pending':'requested');setSearch('');setPage(0);},[orgId,canDecide]);
 const {rows,loading,error,refresh}=useApprovalInbox(orgId,effectiveView),t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 const filtered=useMemo(()=>rows.filter(row=>normalizeLookupText([row.kind==='EXPENSE_REQUEST'?t.expense:row.kindLabel||row.kind,row.managementNumber,row.requestDate,row.drafter,t.statuses[row.status],row.reason].filter(Boolean).join(' ')).includes(normalizeLookupText(search))),[rows,search,t]);
 const safePage=Math.min(page,Math.max(0,Math.ceil(filtered.length/pageSize)-1));
 return <Paper variant="outlined" data-testid="approval-dashboard" id="dashboard-approvals" sx={{overflow:'hidden'}}>
  <Stack direction="row" spacing={1} alignItems="center" sx={{px:2,pt:2}}><Typography variant="h6">{t.dashboard}</Typography>{!loading&&!error&&<Chip size="small" label={filtered.length}/>}</Stack>
  <Tabs value={effectiveView} onChange={(_,value)=>{setView(value);setSearch('');setPage(0);}} variant="scrollable" allowScrollButtonsMobile sx={{px:1,mt:1,borderBottom:1,borderColor:'divider'}}>{(canDecide?[['pending',t.pendingTab],['inProgress',t.progressTab],['completed',t.completedTab],['requested',t.requestedTab]]:[['requested',t.requestedTab]]).map(([value,label])=><Tab key={value} value={value} label={label}/>)}</Tabs>
  <TextField fullWidth size="small" label={t.search} value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}} sx={{m:2,width:'calc(100% - 32px)'}}/>
  {loading?<CircularProgress size={22} sx={{m:2}}/>:error?<Alert severity="error" action={<Button onClick={refresh}>{a.retry}</Button>}>{a.error}</Alert>:<ApprovalInboxTable rows={filtered.slice(safePage*pageSize,(safePage+1)*pageSize)} languageCode={languageCode} completed={effectiveView==='completed'} onOpen={row=>{const path=approvalRequestDestination(row);if(path)onNavigate(path);}}/>}
  <TablePagination component="div" count={filtered.length} page={safePage} rowsPerPage={pageSize} rowsPerPageOptions={[10,20,50]} onPageChange={(_,value)=>setPage(value)} onRowsPerPageChange={event=>{setPageSize(Number(event.target.value));setPage(0);}} labelRowsPerPage={t.perPage} labelDisplayedRows={({from,to,count})=>`${from}–${to} / ${count}`} getItemAriaLabel={type=>type==='next'?t.next:t.previous}/>
 </Paper>;
}
