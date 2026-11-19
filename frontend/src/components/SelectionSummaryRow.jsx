import React from 'react';
import {Box,Typography} from '@mui/material';

// Shared compact summary for selectors that open an adjacent editing panel.
export default function SelectionSummaryRow({title,children,action,compact=false,...props}){
 return <Box data-selection-summary {...props} sx={{display:'flex',alignItems:'center',flexWrap:{xs:'wrap',sm:'nowrap'},gap:compact?1:1.5,px:compact?1.5:2,py:compact?.75:2,minHeight:compact?48:undefined,boxSizing:'border-box',minWidth:0,border:1,borderColor:'divider',borderRadius:2}}>
  <Typography component="h2" variant="subtitle2" sx={{minWidth:0,fontWeight:600,overflowWrap:'anywhere'}}>{title}</Typography>
  <Box data-selection-items sx={{flex:1,flexBasis:{xs:'100%',sm:0},order:{xs:3,sm:0},minWidth:0,display:'flex',alignItems:'center',gap:.75,flexWrap:'wrap',maxHeight:112,overflowY:'auto'}}>{children}</Box>
  <Box sx={{ml:'auto',maxWidth:'100%',flexShrink:0,display:'flex',alignItems:'center'}}>{action}</Box>
 </Box>;
}
