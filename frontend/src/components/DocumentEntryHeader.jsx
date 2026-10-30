import React from 'react';
import {Box} from '@mui/material';

export default function DocumentEntryHeader({children,approval}){
 return <Box data-testid="document-entry-header" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'minmax(220px,1fr) 480px'},gap:2,alignItems:'start',p:2,borderBottom:1,borderColor:'divider'}}>
  <Box sx={{width:'100%',maxWidth:400,minWidth:0}}>{children}</Box>
  <Box data-testid="document-entry-approval" sx={{width:'100%',minWidth:0,minHeight:36,display:'flex',flexDirection:'column',justifyContent:'center'}}>{approval}</Box>
 </Box>;
}
