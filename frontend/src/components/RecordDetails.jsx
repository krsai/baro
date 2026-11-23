import DialogDetailPanel from './DialogDetailPanel';
import React from 'react';
import {Box,Typography} from '@mui/material';
import {humanTextDisplay} from '../utils/humanTextDisplay.mjs';

// Only explicitly supplied fields are shown; never enumerate API objects.
export default function RecordDetails({title,fields=[],framed=true}){
 const content=<Box component="dl" data-record-details sx={{m:0,display:'grid',gridTemplateColumns:'minmax(80px,.7fr) minmax(0,1.5fr)',gap:1}}>
   {fields.map(({key,label,value,textCase})=><React.Fragment key={key}><Typography component="dt" variant="caption" color="text.secondary">{label}</Typography><Typography component="dd" variant="body2" sx={{m:0,whiteSpace:'pre-wrap',overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums',userSelect:'text'}}>{value==null||value===''?'—':humanTextDisplay(value,{key,label,textCase})}</Typography></React.Fragment>)}
  </Box>;
 return framed?<DialogDetailPanel title={title}>{content}</DialogDetailPanel>:content;
}
