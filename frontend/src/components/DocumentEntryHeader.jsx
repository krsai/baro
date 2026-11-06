import React from 'react';
import {Box} from '@mui/material';

export default function DocumentEntryHeader({children,approval}){
 return <Box data-testid="document-entry-header" sx={{display:'flex',flexWrap:'wrap',gap:3,alignItems:'center',width:'100%',minWidth:0,boxSizing:'border-box',p:2,borderBottom:1,borderColor:'divider'}}>
  <Box data-testid="document-entry-fields" sx={{maxWidth:'100%',minWidth:0,'& > .MuiStack-root':{flexDirection:'row',flexWrap:'wrap',gap:1.5},'& > .MuiStack-root > *':{width:260,maxWidth:'100%',margin:'0 !important'},'& > .MuiStack-root > :first-child,& > .MuiStack-root > [data-entry-field="date"]':{width:144},'& > .MuiStack-root > [data-entry-field="payee"]':{width:280}}}>{children}</Box>
  <Box data-testid="document-entry-approval" sx={{maxWidth:'100%',minWidth:0,minHeight:36,ml:'auto',display:'flex',flexDirection:'column',alignItems:'flex-end',justifyContent:'center'}}>{approval}</Box>
 </Box>;
}
