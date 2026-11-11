import React from 'react';
import {Alert,Box,Button,CircularProgress,Paper,Stack,Typography} from '@mui/material';
import {dashboardWidgetPaperSx,dashboardWidgetTitleSx} from './dashboardWidgetStyles';
import DashboardAlertItem from './DashboardAlertItem';
export default function DashboardAlertsCard({title,items,loading,error,onRetry,onSelect,text,children}){
 return <Paper variant="outlined" sx={dashboardWidgetPaperSx}>
  <Typography variant="subtitle1" sx={{...dashboardWidgetTitleSx,mb:1.5,flexShrink:0}}>{title}</Typography>
  {error&&<Alert severity="error" action={<Button onClick={onRetry}>{text.retry}</Button>}>{text.failed}</Alert>}
  <Box sx={{flex:1,minHeight:0,overflow:'auto'}}>{loading?<CircularProgress size={20}/>:!error&&<Stack spacing={1}>{!items.length&&!children&&<Typography color="text.secondary">{text.empty}</Typography>}{items.map(item=><DashboardAlertItem key={item.key} title={item.text} countLabel={item.countLabel} kind={item.recordAlert?'missing-record':'notification'} onClick={()=>onSelect(item)} detail={item.recordAlert?[item.recordAlert.factoryName,item.recordAlert.processes.map(process=>`${process.processCode||process.styleProcessId}: 0 / ${process.targetQuantity}`).join(' · ')].filter(Boolean).join(' · '):null}/>)}{children}</Stack>}</Box>
 </Paper>;
}
