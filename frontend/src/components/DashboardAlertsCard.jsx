import React from 'react';
import {Alert,Box,Button,Chip,CircularProgress,Paper,Stack,Typography} from '@mui/material';
import {dashboardWidgetPaperSx,dashboardWidgetTitleSx} from './dashboardWidgetStyles';
export default function DashboardAlertsCard({title,items,loading,error,onRetry,onSelect,text,children}){
 return <Paper variant="outlined" sx={dashboardWidgetPaperSx}>
  <Typography variant="subtitle1" sx={{...dashboardWidgetTitleSx,mb:1.5,flexShrink:0}}>{title}</Typography>
  {error&&<Alert severity="error" action={<Button onClick={onRetry}>{text.retry}</Button>}>{text.failed}</Alert>}
  <Box sx={{flex:1,minHeight:0,overflow:'auto'}}>{loading?<CircularProgress size={20}/>:!error&&<Stack spacing={1}>{!items.length&&!children&&<Typography color="text.secondary">{text.empty}</Typography>}{items.map(item=><Button key={item.key} variant="outlined" onClick={()=>onSelect(item)} sx={{height:'auto',minHeight:44,justifyContent:'space-between',gap:1,color:'text.primary',borderColor:'divider',p:1.5}}><Box sx={{textAlign:'left',overflowWrap:'anywhere'}}><Typography fontWeight={600}>{item.text}</Typography>{item.recordAlert&&<Typography variant="caption">{item.recordAlert.factoryName} · {item.recordAlert.processes.map(process=>`${process.processCode||process.styleProcessId}: 0 / ${process.targetQuantity}`).join(' · ')}</Typography>}</Box><Chip size="small" label={item.countLabel}/></Button>)}{children}</Stack>}</Box>
 </Paper>;
}
