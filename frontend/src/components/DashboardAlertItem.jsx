import React from 'react';
import {Box,Button,ButtonBase,Chip,Typography} from '@mui/material';
import {dashboardItemSx,dashboardCardText} from './dashboardWidgetStyles';
import {getCurrentLanguageCode} from '../utils/appLanguage';
export default function DashboardAlertItem({title,detail,countLabel,titleStatus=false,onClick,disabled=false,kind,actions,showConfirm=true,confirmLabel,languageCode=getCurrentLanguageCode()}){
 const t=dashboardCardText[languageCode]||dashboardCardText.en;
 const titleCount=titleStatus||['missing-record','production-excess'].includes(kind);
 const content=<Box sx={{textAlign:'left',width:'100%',minWidth:0,overflowWrap:'anywhere'}}><Box data-dashboard-card-title sx={{display:'flex',alignItems:'center',gap:.75,minWidth:0}}><Typography fontWeight={600} sx={{minWidth:0}}>{title}</Typography>{titleCount&&countLabel&&<Chip size="small" label={countLabel} sx={{flexShrink:0,...(titleStatus?{ml:'auto'}:{})}}/>}</Box>{detail&&<Typography variant="caption" color="text.secondary" component="div" sx={{whiteSpace:'pre-wrap'}}>{detail}</Typography>}{!titleCount&&countLabel&&<Chip size="small" label={countLabel} sx={{mt:.5}}/>}</Box>;
 return <Box data-dashboard-card data-dashboard-alert-kind={kind} sx={dashboardItemSx}>
  <Box sx={{flex:1,minWidth:0,display:'flex'}}>{onClick?<ButtonBase disabled={disabled} onClick={onClick} sx={{width:'100%',display:'flex',justifyContent:'flex-start',p:1.5,color:'text.primary','&:hover':{bgcolor:'action.hover'}}}>{content}</ButtonBase>:<Box sx={{p:1.5}}>{content}</Box>}</Box>
  {(actions||showConfirm&&onClick)&&<Box data-dashboard-card-actions sx={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:.5,px:1,py:1,minWidth:80,maxWidth:'45%',boxSizing:'border-box',flexShrink:0}}>{actions}{showConfirm&&onClick&&<Button size="small" disabled={disabled} onClick={onClick}>{confirmLabel||t.confirm}</Button>}</Box>}
 </Box>;
}
