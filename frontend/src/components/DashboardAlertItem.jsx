import React from 'react';
import {Box,ButtonBase,Chip,Typography} from '@mui/material';
export default function DashboardAlertItem({title,detail,countLabel,onClick,disabled=false,kind,actions}){
 const content=<><Box sx={{textAlign:'left',minWidth:0,overflowWrap:'anywhere'}}><Typography fontWeight={600}>{title}</Typography>{detail&&<Typography variant="caption" color="text.secondary" component="div" sx={{whiteSpace:'pre-wrap'}}>{detail}</Typography>}</Box>{countLabel&&<Chip size="small" label={countLabel} sx={{flexShrink:0}}/>}</>;
 return <Box data-dashboard-alert-kind={kind} sx={{border:1,borderColor:'divider',borderRadius:1,overflow:'hidden',flexShrink:0}}>{onClick?<ButtonBase disabled={disabled} onClick={onClick} sx={{width:'100%',minHeight:44,display:'flex',justifyContent:'space-between',gap:1,p:1.5,color:'text.primary','&:hover':{bgcolor:'action.hover'}}}>{content}</ButtonBase>:<Box sx={{minHeight:44,display:'flex',justifyContent:'space-between',alignItems:'center',gap:1,p:1.5}}>{content}</Box>}{actions&&<Box sx={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:1,px:1.5,pb:1}}>{actions}</Box>}</Box>;
}
