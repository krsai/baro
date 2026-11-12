import React from 'react';
import {Box,Button,ButtonBase,Chip,Typography} from '@mui/material';
import {dashboardItemSx,dashboardCardText} from './dashboardWidgetStyles';
import {getCurrentLanguageCode} from '../utils/appLanguage';
export default function DashboardAlertItem({title,detail,countLabel,onClick,disabled=false,kind,actions,showConfirm=true,confirmLabel,languageCode=getCurrentLanguageCode()}){
 const t=dashboardCardText[languageCode]||dashboardCardText.en;
 const content=<Box sx={{textAlign:'left',minWidth:0,overflowWrap:'anywhere'}}><Typography fontWeight={600}>{title}</Typography>{detail&&<Typography variant="caption" color="text.secondary" component="div" sx={{whiteSpace:'pre-wrap'}}>{detail}</Typography>}</Box>;
 return <Box data-dashboard-card data-dashboard-alert-kind={kind} sx={dashboardItemSx}>
  <Box sx={{flex:1,minHeight:0,overflow:'auto'}}>{onClick?<ButtonBase disabled={disabled} onClick={onClick} sx={{width:'100%',minHeight:'100%',display:'block',p:1.5,pb:.5,color:'text.primary','&:hover':{bgcolor:'action.hover'}}}>{content}</ButtonBase>:<Box sx={{p:1.5,pb:.5}}>{content}</Box>}</Box>
  <Box sx={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:1,px:1.5,pb:1,minHeight:36,flexShrink:0}}>{countLabel&&<Chip size="small" label={countLabel} sx={{mr:'auto',flexShrink:0}}/>}{actions}{showConfirm&&onClick&&<Button size="small" disabled={disabled} onClick={onClick}>{confirmLabel||t.confirm}</Button>}</Box>
 </Box>;
}
