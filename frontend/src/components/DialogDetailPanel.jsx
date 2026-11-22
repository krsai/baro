import React from 'react';
import {Box,Paper,Stack,Typography} from '@mui/material';
import {ui} from '../theme/ui';

export default function DialogDetailPanel({title,actions,footer,children,sx,contentProps={},...props}){
 return <Paper {...props} variant="outlined" data-dialog-detail sx={{minWidth:0,display:'flex',flexDirection:'column',overflow:'hidden',maxHeight:{sm:ui.dialog.paneMaxHeight},...sx}}>
  {(title||actions)&&<Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1} sx={{px:1.5,pt:1.5}}><Typography component="h2" variant="subtitle2" fontWeight={700} sx={{minWidth:0,overflowWrap:'anywhere'}}>{title}</Typography>{actions}</Stack>}
  <Box {...contentProps} sx={{p:1.5,minWidth:0,minHeight:0,overflowY:'auto',...contentProps.sx}}>{children}</Box>
  {footer&&<Box sx={{p:1,borderTop:1,borderColor:'divider',flexShrink:0}}>{footer}</Box>}
 </Paper>;
}
