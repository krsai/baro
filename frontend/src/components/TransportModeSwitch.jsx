import React from 'react';
import {ToggleButton,ToggleButtonGroup} from '@mui/material';

export default function TransportModeSwitch({label,options,value,onChange,disabled}){
 return <ToggleButtonGroup exclusive role="group" aria-label={label} data-focus-next="group" value={value} disabled={disabled} onChange={(_,next)=>next&&onChange(next)}
  sx={{display:'grid',width:'100%',boxSizing:'border-box',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:.5,
   '& .MuiToggleButtonGroup-grouped':{m:0,minWidth:0,width:'100%',px:1,minHeight:36,whiteSpace:'normal'},
   '& .MuiToggleButtonGroup-grouped:not(:first-of-type)':{ml:0},
   '& .MuiToggleButtonGroup-grouped:last-of-type':{gridColumn:'1 / -1'},
   '@container (min-width: 640px)':{gridTemplateColumns:'repeat(5,minmax(0,1fr))','& .MuiToggleButtonGroup-grouped:last-of-type':{gridColumn:'auto'}}}}>
  {options.map(([key,text])=><ToggleButton key={key} value={key} data-initial-focus={value===key?'true':undefined}>{text}</ToggleButton>)}
 </ToggleButtonGroup>;
}
