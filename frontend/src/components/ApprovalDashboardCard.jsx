import ApprovalReviewDialog,{ApprovalReviewTable} from './ApprovalReviewDialog';
import React,{useEffect,useState} from 'react';
import dayjs from 'dayjs';
import {Alert,Button,CircularProgress,MenuItem,Paper,Stack,TablePagination,TextField,Typography} from '@mui/material';
import DateRangeSelector from './DateRangeSelector';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {approvalWorkflowText} from '../constants/approvalWorkflow';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
import {dashboardWidgetPaperSx,dashboardWidgetTitleSx} from './dashboardWidgetStyles';
export default function ApprovalDashboardCard({orgId,languageCode,onNavigate}){
 const t=approvalWorkflowText[languageCode]||approvalWorkflowText.en,a=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 const [start,setStart]=useState(()=>dayjs().startOf('month')),[end,setEnd]=useState(()=>dayjs()),[status,setStatus]=useState('UNAPPROVED'),[page,setPage]=useState(0),[pageSize,setPageSize]=useState(20),[result,setResult]=useState(null),[loading,setLoading]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0),[selected,setSelected]=useState(null);
 const scope=JSON.stringify({orgId,start:start.format('YYYY-MM-DD'),end:end.format('YYYY-MM-DD'),status,page,pageSize}),data=result?.scope===scope?result.data:{rows:[],total:0};
 useEffect(()=>{setPage(0);setResult(null);setSelected(null);},[orgId]);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&event.topics?.some(topic=>['expense-approvals','change-approvals','bank-ledger'].includes(topic)))setReload(n=>n+1);}),[orgId]);
 useEffect(()=>{const focus=()=>setReload(n=>n+1);window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[]);
 useEffect(()=>{if(!orgId)return;let alive=true;const controller=new AbortController();setLoading(true);setError(false);requestJSON('/approval-reviews'+buildQueryString(JSON.parse(scope)),{skipCache:true,signal:controller.signal}).then(value=>{if(alive)setResult({scope,data:value});}).catch(e=>{if(alive&&e.name!=='AbortError')setError(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;controller.abort();};},[scope,reload]);
 return <Paper variant="outlined" data-testid="approval-dashboard" sx={dashboardWidgetPaperSx}><Typography variant="subtitle1" sx={{...dashboardWidgetTitleSx,mb:1.5,flexShrink:0}}>{t.overview}</Typography>
 <Stack direction={{xs:'column',sm:'row'}} alignItems={{xs:'stretch',sm:'center'}} justifyContent="space-between" spacing={1.5} sx={{pb:1.5,flexShrink:0}}><TextField id="approval-overview-status" sx={{minWidth:140,width:{xs:'100%',sm:160}}} select SelectProps={{inputProps:{'aria-label':t.status}}} size="small" label={t.status} value={status} onChange={e=>{setStatus(e.target.value);setPage(0);}}>{['UNAPPROVED','ALL','REQUESTED','IN_REVIEW','APPROVED','REJECTED','UNKNOWN'].map(value=><MenuItem key={value} value={value}>{value==='ALL'?t.all:value==='UNAPPROVED'?t.unapproved:t.statuses[value]}</MenuItem>)}</TextField><Stack sx={{minWidth:0,alignSelf:{xs:'flex-end',sm:'auto'}}}><DateRangeSelector independentDateBounds languageCode={languageCode} startValue={start} endValue={end} onStartChange={value=>{if(value?.isValid()){setStart(value);setPage(0);}}} onEndChange={value=>{if(value?.isValid()){setEnd(value);setPage(0);}}} maxDate={dayjs()}/></Stack></Stack>
 <Stack sx={{flex:1,minHeight:0,overflow:'auto'}}>{loading?<CircularProgress size={22} sx={{m:2}}/>:error?<Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{a.retry}</Button>}>{a.error}</Alert>:<ApprovalReviewTable rows={data.rows} languageCode={languageCode} onView={setSelected}/>}</Stack>
 {data.total>0&&<TablePagination component="div" count={data.total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10,20,50]} onPageChange={(_,value)=>setPage(value)} onRowsPerPageChange={e=>{setPageSize(Number(e.target.value));setPage(0);}} labelRowsPerPage={t.perPage} labelDisplayedRows={({from,to,count})=>`${from}–${to} / ${count}`} getItemAriaLabel={type=>type==='next'?t.next:t.previous}/>}<ApprovalReviewDialog key={orgId} row={selected} orgId={orgId} languageCode={languageCode} onClose={()=>setSelected(null)} onDecided={()=>setReload(n=>n+1)}/></Paper>;
}
