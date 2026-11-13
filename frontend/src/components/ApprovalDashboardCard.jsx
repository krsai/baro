import DashboardFilter from './DashboardFilter';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import ApprovalReviewDialog from './ApprovalReviewDialog';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,Paper,Stack,TablePagination,Typography} from '@mui/material';
import DashboardAlertItem from './DashboardAlertItem';
import {approvalReviewText} from '../constants/approvalReview';
import {getUiMessage} from '../constants/uiMessages';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
import {dashboardWidgetPaperSx,dashboardWidgetTitleSx,dashboardCardText} from './dashboardWidgetStyles';
export default function ApprovalDashboardCard({orgId,languageCode,onNavigate}){
 const {active}=useRequestScopeContext(),lastAttempt=useRef(0);
 const t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 const [status,setStatus]=useState('UNAPPROVED'),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(20),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0),[selected,setSelected]=useState(null);
 const scope=JSON.stringify({orgId,status,page,pageSize}),data=result?.scope===scope?result.data:{rows:[],total:0};
 useEffect(()=>{setPage(0);setResult(null);setSelected(null);},[orgId]);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&event.topics?.some(topic=>['expense-approvals','change-approvals','bank-ledger'].includes(topic)))setReload(n=>n+1);}),[orgId]);
 useEffect(()=>{const focus=()=>{if(active&&!selected&&document.visibilityState!=='hidden'&&Date.now()-lastAttempt.current>=30000)setReload(n=>n+1);};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,Boolean(selected)]);
 useEffect(()=>{if(!orgId||!active||selected)return;lastAttempt.current=Date.now();let alive=true;const controller=new AbortController();setLoading(true);setError(false);requestJSON('/approval-reviews'+buildQueryString(JSON.parse(scope)),{skipCache:true,signal:controller.signal}).then(value=>{if(alive)setResult({scope,data:value});}).catch(e=>{if(alive&&e.name!=='AbortError')setError(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;controller.abort();};},[scope,reload,active,Boolean(selected)]);
 return <Paper variant="outlined" data-testid="approval-dashboard" sx={dashboardWidgetPaperSx}><Stack direction="row" useFlexGap flexWrap="wrap" gap={1} alignItems="center" sx={{mb:1.5,flexShrink:0}}><Typography variant="subtitle1" sx={{...dashboardWidgetTitleSx,mr:'auto'}}>{t.overview}</Typography><DashboardFilter id="approval-overview-status" label={t.status} value={status} onChange={value=>{setStatus(value);setPage(0);}} options={['UNAPPROVED','ALL','REQUESTED','IN_REVIEW','APPROVED','REJECTED','UNKNOWN'].map(value=>({value,label:value==='ALL'?t.all:value==='UNAPPROVED'?t.unapproved:t.statuses[value]}))}/></Stack>
 <Stack sx={{flex:1,minHeight:0,overflow:'auto'}}>{loading&&result?.scope!==scope?<CircularProgress size={22} sx={{m:2}}/>:error?<Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{a.retry}</Button>}>{a.error}</Alert>:<Stack spacing={1}>{!data.rows.length&&<Typography color="text.secondary">{t.empty}</Typography>}{data.rows.map(row=><DashboardAlertItem key={row.kind+':'+row.id} languageCode={languageCode} confirmLabel={['REQUESTED','IN_REVIEW','UNKNOWN'].includes(row.status)?(dashboardCardText[languageCode]||dashboardCardText.en).review:undefined} title={[getUiMessage(row.menu==='INVOICE'?'menu.invoice':row.menu==='BANK_LEDGER'?'menu.bankLedger':'menu.outsourcingRecord','',languageCode),row.managementNumber].filter(Boolean).join(' · ')} detail={[row.drafter,(approvalReviewText[languageCode]||approvalReviewText.en)[row.operation],row.requestDate].filter(Boolean).join(' · ')} countLabel={t.statuses[row.status]} onClick={()=>setSelected(row)}/>)}</Stack>}</Stack>
 {data.total>0&&<TablePagination component="div" count={data.total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10,20,50]} onPageChange={(_,value)=>setPage(value)} onRowsPerPageChange={e=>{setPageSize(Number(e.target.value));setPage(0);}} labelRowsPerPage={t.perPage} labelDisplayedRows={({from,to,count})=>`${from}–${to} / ${count}`} getItemAriaLabel={type=>type==='next'?t.next:t.previous}/>}<ApprovalReviewDialog key={orgId} row={selected} orgId={orgId} languageCode={languageCode} onClose={()=>setSelected(null)} onDecided={()=>setReload(n=>n+1)}/></Paper>;
}
