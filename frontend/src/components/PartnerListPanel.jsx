import React from 'react';
import {Box,Stack,Typography} from '@mui/material';

// Embedded lists share one page header, while keeping their role-specific actions.
export default function PartnerListPanel({title,titleActions,toolbar,children}) {
 return <Stack spacing={2} sx={{minWidth:0}}>
  <Stack direction={{xs:'column',sm:'row'}} alignItems={{xs:'stretch',sm:'center'}} justifyContent="space-between" spacing={1}>
   <Typography component="h2" variant="subtitle2" sx={{fontWeight:600}}>{title}</Typography><Box>{titleActions}</Box>
  </Stack>
  {toolbar}{children}
 </Stack>;
}
