import React from 'react';
import {Box,Typography} from '@mui/material';

// Shared compact summary for selectors that open an adjacent editing panel.
export default function SelectionSummaryRow({title,children,action,...props}){
 return <Box data-selection-summary {...props} sx={{display:'flex',alignItems:'center',gap:1.5,p:2,minWidth:0,border:1,borderColor:'divider',borderRadius:2}}>
  <Typography component="h2" variant="subtitle2" sx={{flexShrink:0,fontWeight:600}}>{title}</Typography>
  <Box data-selection-items sx={{flex:1,minWidth:0,display:'flex',alignItems:'center',gap:.75,flexWrap:'wrap',maxHeight:112,overflowY:'auto'}}>{children}</Box>
  <Box sx={{flexShrink:0,display:'flex',alignItems:'center'}}>{action}</Box>
 </Box>;
}
