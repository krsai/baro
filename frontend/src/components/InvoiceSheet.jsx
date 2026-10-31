import React from 'react';
import {Paper} from '@mui/material';

export default function InvoiceSheet({children,...props}) {
  return <Paper variant="outlined" {...props} sx={{width:'100%',maxWidth:1120,mx:'auto',p:{xs:2,md:4},borderRadius:1,background:'#fff',
    '& .invoice-heading':{fontSize:{xs:24,md:30},fontWeight:700,letterSpacing:2,borderBottom:'2px solid #243746',pb:2},
    '& .invoice-parties':{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:3},
    '& .invoice-metadata':{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2},
    '& th':{background:'#f2f5f8',fontWeight:700},...props.sx}}>{children}</Paper>;
}
