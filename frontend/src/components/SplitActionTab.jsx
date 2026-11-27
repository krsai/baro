import React from 'react';
import {Box,ButtonBase} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

// Two sibling actions share one surface and its complete inner height.
export default function SplitActionTab({children,selected=false,disabled=false,onClick,onAdd,addLabel,controls,...props}){
 const action={alignSelf:'stretch',minWidth:0,px:1.5,py:1,color:'inherit',borderRadius:0,
  '&:hover':{bgcolor:selected?'primary.dark':'action.hover'},
  '&.Mui-focusVisible':{outline:'2px solid currentColor',outlineOffset:-3},
  '&.Mui-disabled':{opacity:0.45}};
 return <Box {...props} sx={{display:'grid',gridTemplateColumns:onAdd?'minmax(0,1fr) 40px':'minmax(0,1fr)',minWidth:0,minHeight:'var(--ui-control-height)',border:1,borderColor:selected?'primary.main':'divider',borderRadius:1,overflow:'hidden',bgcolor:selected?'primary.main':'transparent',color:selected?'primary.contrastText':'primary.main'}}>
  <ButtonBase type="button" disabled={disabled} aria-expanded={selected} aria-controls={controls} onClick={onClick} sx={{...action,fontWeight:600,fontSize:'0.8125rem',lineHeight:1.5}}>{children}</ButtonBase>
  {onAdd&&<ButtonBase type="button" disabled={disabled} aria-label={addLabel} title={addLabel} onClick={onAdd} sx={{...action,p:0,borderLeft:1,borderColor:selected?'rgba(255,255,255,0.35)':'divider'}}><AddIcon fontSize="small"/></ButtonBase>}
 </Box>;
}
