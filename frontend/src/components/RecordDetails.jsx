import React from 'react';
import {Box,Paper,Typography} from '@mui/material';

// Only explicitly supplied fields are shown; never enumerate API objects.
export default function RecordDetails({title,fields=[]}){
 return <Paper variant="outlined" data-record-details sx={{p:1.5,minWidth:0}}>
  {title&&<Typography variant="subtitle2" sx={{mb:1.5,overflowWrap:'anywhere'}}>{title}</Typography>}
  <Box component="dl" sx={{m:0,display:'grid',gridTemplateColumns:'minmax(80px,.7fr) minmax(0,1.5fr)',gap:1}}>
   {fields.map(({key,label,value})=><React.Fragment key={key}><Typography component="dt" variant="caption" color="text.secondary">{label}</Typography><Typography component="dd" variant="body2" sx={{m:0,whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums',userSelect:'text'}}>{value==null||value===''?'—':value}</Typography></React.Fragment>)}
  </Box>
 </Paper>;
}
