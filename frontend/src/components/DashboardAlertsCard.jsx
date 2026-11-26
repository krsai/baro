import React,{useState} from 'react';
import DashboardPagination,{DashboardPaginationHost} from './DashboardPagination';
import {Box,Button,CircularProgress,Paper,Stack,Typography} from '@mui/material';
import Alert from "./AppNotice";
import {dashboardWidgetPaperSx,dashboardWidgetTitleSx} from './dashboardWidgetStyles';
import DashboardAlertItem from './DashboardAlertItem';
import DashboardWidgetSettings from './DashboardWidgetSettings';
export default function DashboardAlertsCard({title,items,loading,error,onRetry,onSelect,text,children,languageCode}){
 const [page,setPage]=useState(0);
 const safePage=Math.min(page,Math.max(0,Math.ceil(items.length/5)-1));
 return <Paper variant="outlined" sx={dashboardWidgetPaperSx}>
  <Stack direction="row" alignItems="center" spacing={1} sx={{mb:1.5,flexShrink:0}}><Typography variant="subtitle1" sx={{...dashboardWidgetTitleSx,flex:1,minWidth:0}}>{title}</Typography><DashboardWidgetSettings/></Stack>
  {error&&<Alert severity="error" action={<Button onClick={onRetry}>{text.retry}</Button>}>{text.failed}</Alert>}
  <DashboardPaginationHost languageCode={languageCode}><Box sx={{flex:1,minHeight:0,overflow:'auto'}} aria-busy={loading}><Stack spacing={1}>{loading&&!items.length&&!children&&<CircularProgress size={20}/>}{!loading&&!error&&!items.length&&!children&&<Typography color="text.secondary">{text.empty}</Typography>}{items.slice(safePage*5,safePage*5+5).map(item=><DashboardAlertItem languageCode={languageCode} key={item.key} title={item.text} countLabel={item.countLabel} kind={item.recordAlert?'missing-record':'notification'} onClick={()=>onSelect(item)} detail={item.recordAlert?[item.recordAlert.factoryName,item.recordAlert.processes.map(process=>`${process.processCode||process.styleProcessId}: 0 / ${process.targetQuantity}`).join(' · ')].filter(Boolean).join(' · '):null}/>)}{children}</Stack></Box>
  {items.length>0&&<DashboardPagination label={title} languageCode={languageCode} onPrevious={()=>setPage(safePage-1)} onNext={()=>setPage(safePage+1)} previousDisabled={loading||safePage===0} nextDisabled={loading||(safePage+1)*5>=items.length}/>}
  </DashboardPaginationHost>
 </Paper>;
}
