import React from 'react';
import {IconButton,Stack} from '@mui/material';
import {ArrowUpward,ArrowDownward} from '@mui/icons-material';

export default function CatalogueOrderButtons({label,index,count,disabled,languageCode,onMove}){
 const text=({ko:['위로','아래로'],en:['Move up','Move down'],vi:['Lên','Xuống']})[languageCode]||['Move up','Move down'];
 return <Stack direction="row" sx={{flexShrink:0}}>
  <IconButton size="small" aria-label={`${label} ${text[0]}`} disabled={disabled||index===0} onClick={()=>onMove(index,-1)}><ArrowUpward fontSize="small"/></IconButton>
  <IconButton size="small" aria-label={`${label} ${text[1]}`} disabled={disabled||index===count-1} onClick={()=>onMove(index,1)}><ArrowDownward fontSize="small"/></IconButton>
 </Stack>;
}
