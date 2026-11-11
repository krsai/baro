import React,{useEffect,useState} from 'react';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,LinearProgress,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import {productionExcessText} from '../constants/productionExcess';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import useWorkspaceRefreshOnEvent from '../hooks/useWorkspaceRefreshOnEvent';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import {WORKSPACE_DATA_TOPICS} from '../utils/workspaceDataEvents';
const number=value=>Number(value||0).toLocaleString('en-US',{maximumFractionDigits:2});
const path=row=>'/work-logs/production-excess/'+row.workOrderId+'/'+row.styleId+'/'+row.styleProcessId;
export default function ProductionExcessCard({orgId,languageCode='ko',onNavigate,canOpenExpense=false,embedded=false}){
 const t=productionExcessText[languageCode]||productionExcessText.en,{active}=useRequestScopeContext();
 const [page,setPage]=useState(0),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false),[reload,setReload]=useState(0);
 const [selected,setSelected]=useState(null),[detail,setDetail]=useState(null),[detailPage,setDetailPage]=useState(0),[detailLoading,setDetailLoading]=useState(false),[detailError,setDetailError]=useState(false);
 useWorkspaceRefreshOnEvent({orgId,topics:[WORKSPACE_DATA_TOPICS.ORDERS,WORKSPACE_DATA_TOPICS.ASSIGNMENT_BOARD,WORKSPACE_DATA_TOPICS.PAYROLL_SOURCES,'work-logs','expense-requests'],isActive:active,onRefresh:()=>setReload(value=>value+1)});
 useEffect(()=>{let live=true;setLoading(true);setError(false);requestJSON('/work-logs/production-excess'+buildQueryString({orgId,page,pageSize:5}),{skipCache:true,skipGlobalLoading:true}).then(result=>{if(!live)return;if(page>0&&page*5>=result.total){setPage(0);return;}setData(result);}).catch(()=>{if(live)setError(true);}).finally(()=>{if(live)setLoading(false);});return()=>{live=false;};},[orgId,page,reload]);
 useEffect(()=>{if(!selected)return;let live=true;setDetailLoading(true);setDetailError(false);setDetail(null);requestJSON(path(selected)+buildQueryString({orgId,page:detailPage,pageSize:20}),{skipCache:true,skipGlobalLoading:true}).then(result=>{if(live)setDetail(result);}).catch(()=>{if(live)setDetailError(true);}).finally(()=>{if(live)setDetailLoading(false);});return()=>{live=false;};},[orgId,selected,detailPage,reload]);
 const close=()=>{setSelected(null);setDetail(null);setReload(value=>value+1);};
 const openRecord=row=>{setSelected(null);setDetail(null);onNavigate(row.kind==='OUTSOURCING'?'/outsourcing-record/edit/legacy/'+row.recordId:'/work-history/'+row.workLogId+'?quantityReviewRefresh='+Date.now());};
 const summary=detail?detail.group:selected;
 return <Paper variant={embedded?undefined:'outlined'} elevation={0} data-testid="production-excess-card" sx={{overflow:'hidden',minWidth:0,borderColor:data?.total>0?'error.light':'divider'}}>
  {!embedded&&<Stack direction="row" alignItems="center" spacing={1} sx={{p:2}}><WarningAmberIcon color={data?.total>0?'error':'disabled'}/><Typography variant="h6" sx={{flex:1}}>{t.title}</Typography>{!error&&data&&<Chip size="small" label={number(data.total)+' '+t.groups} color={data.total?'error':'default'}/>}</Stack>}
  {loading&&<LinearProgress/>}{error?<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>:<>
   {data?.unverified>0&&<Alert severity="warning">{t.unverified} ({number(data.unverified)})</Alert>}
   {!loading&&data?.total===0?(!embedded&&<Typography variant="body2" color="text.secondary" sx={{px:2,pb:2}}>{t.empty}</Typography>):data?.rows?.length>0&&<>
    <TableContainer><Table size="small"><TableHead><TableRow>{[t.order,t.style,t.process,t.target,t.recorded,t.excess,t.latest,''].map((label,index)=><TableCell key={index} align={index>=3&&index<=5?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{data.rows.map(row=><TableRow key={path(row)}><TableCell>{row.orderNumber}</TableCell><TableCell>{row.styleCode||row.styleName}</TableCell><TableCell>{row.processCode}<Typography variant="caption" display="block" color="text.secondary">{row.processName}</Typography></TableCell><TableCell align="right">{number(row.target)}</TableCell><TableCell align="right">{number(row.recorded)}</TableCell><TableCell align="right" sx={{color:'error.main',fontWeight:700}}>+{number(row.excess)}{row.excessPercent!==null&&<Typography variant="caption" display="block">+{number(row.excessPercent)}%</Typography>}</TableCell><TableCell>{row.lastDate||'—'}</TableCell><TableCell><Button disabled={loading} onClick={()=>{setDetailPage(0);setSelected(row);}}>{t.review}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
    <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{p:1}}><Button disabled={loading||page===0} onClick={()=>setPage(value=>value-1)}>{t.previous}</Button><Button disabled={loading||(page+1)*5>=data.total} onClick={()=>setPage(value=>value+1)}>{t.next}</Button></Stack>
   </>}
  </>}
  <Dialog open={!!selected} onClose={close} fullWidth maxWidth="lg"><DialogTitle>{t.details}</DialogTitle><DialogContent>
   <Stack spacing={2}>{detailLoading&&<LinearProgress/>}{detailError&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>}
    <Typography variant="subtitle2">{selected?.orderNumber} · {selected?.styleCode||selected?.styleName} · {selected?.processCode} {selected?.processName}</Typography>
    {detail?.resolved&&<Alert severity="success">{t.resolved}</Alert>}{detail?.unverified>0&&<Alert severity="warning">{t.unverified}</Alert>}
    <Box sx={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:2}}>{[['target',summary?.target],['recorded',summary?.recorded],['excess',summary?.excess]].map(([key,value])=><Box key={key}><Typography variant="caption" color="text.secondary">{t[key]}</Typography><Typography variant="h6" align="right" color={key==='excess'&&value>0?'error.main':'text.primary'}>{value==null?'—':number(value)}</Typography></Box>)}</Box>
    {detail&&!detailError&&<TableContainer><Table size="small"><TableHead><TableRow>{[t.date,t.factory,t.worker,t.kind,t.quantity,''].map((label,index)=><TableCell key={index} align={index===4?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{detail.records.map(row=><TableRow key={row.kind+':'+row.recordId}><TableCell>{row.coverageStartDate&&row.coverageEndDate&&row.coverageStartDate!==row.coverageEndDate?row.coverageStartDate+' ~ '+row.coverageEndDate:row.coverageEndDate||row.workDate}</TableCell><TableCell>{row.factoryName||'—'}</TableCell><TableCell>{row.name||'—'}</TableCell><TableCell>{t[row.kind]}</TableCell><TableCell align="right">{number(row.quantity)}</TableCell><TableCell><Button disabled={row.kind==='OUTSOURCING'&&!canOpenExpense} onClick={()=>openRecord(row)}>{t.open}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>}
   </Stack>
  </DialogContent><DialogActions><Button disabled={detailLoading||detailPage===0} onClick={()=>setDetailPage(value=>value-1)}>{t.previous}</Button><Button disabled={detailLoading||!detail||(detailPage+1)*20>=detail.total} onClick={()=>setDetailPage(value=>value+1)}>{t.next}</Button><Button onClick={close}>{t.close}</Button></DialogActions></Dialog>
 </Paper>;
}
