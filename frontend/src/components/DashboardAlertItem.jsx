import React from 'react';
import {Box,Button,Chip,Typography} from '@mui/material';

export default function DashboardAlertItem({title,detail,countLabel,onClick,disabled=false,kind}){
 return <Button variant="outlined" data-dashboard-alert-kind={kind} disabled={disabled} onClick={onClick} sx={{width:'100%',height:'auto',minHeight:44,justifyContent:'space-between',gap:1,color:'text.primary',borderColor:'divider',p:1.5}}>
  <Box sx={{textAlign:'left',minWidth:0,overflowWrap:'anywhere'}}><Typography fontWeight={600}>{title}</Typography>{detail&&<Typography variant="caption" color="text.secondary" component="div">{detail}</Typography>}</Box>
  <Chip size="small" label={countLabel} sx={{flexShrink:0}}/>
 </Button>;
}
