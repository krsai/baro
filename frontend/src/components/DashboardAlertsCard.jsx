import React from 'react';
import {Alert,Box,Button,Chip,CircularProgress,Paper,Stack,Typography} from '@mui/material';
export default function DashboardAlertsCard({title,description,items,loading,error,onRetry,onSelect,text,children}){
 return <Paper variant="outlined" sx={{p:2,height:540,minWidth:0,display:'flex',flexDirection:'column'}}>
  <Typography variant="h6">{title}</Typography><Typography color="text.secondary" sx={{my:1}}>{description}</Typography>
  {error&&<Alert severity="error" action={<Button onClick={onRetry}>{text.retry}</Button>}>{text.failed}</Alert>}
  <Box sx={{flex:1,minHeight:0,overflow:'auto'}}>{loading?<CircularProgress size={20}/>:!error&&<Stack spacing={1}>{!items.length&&!children&&<Typography color="text.secondary">{text.empty}</Typography>}{items.map(item=><Button key={item.key} variant="outlined" onClick={()=>onSelect(item)} sx={{height:'auto',minHeight:44,justifyContent:'space-between',gap:1,color:'text.primary',borderColor:'divider',p:1.5}}><Box sx={{textAlign:'left',overflowWrap:'anywhere'}}><Typography fontWeight={600}>{item.text}</Typography>{item.recordAlert&&<Typography variant="caption">{item.recordAlert.factoryName} · {item.recordAlert.processes.map(process=>`${process.processCode||process.styleProcessId}: 0 / ${process.targetQuantity}`).join(' · ')}</Typography>}</Box><Chip size="small" label={item.countLabel}/></Button>)}{children}</Stack>}</Box>
 </Paper>;
}
