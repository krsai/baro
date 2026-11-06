import React from 'react';
import {TextField} from '@mui/material';

export default function ReadOnlyField({value='',label,hideLabel=false,sx,...props}){
 return <TextField {...props} fullWidth size="small" type="text" label={hideLabel?undefined:label} value={value||'—'}
  slotProps={{inputLabel:{shrink:true},input:{readOnly:true},htmlInput:{readOnly:true,'aria-label':label,tabIndex:-1}}}
  sx={{'& .MuiOutlinedInput-root':{bgcolor:'action.hover',cursor:'default','& fieldset':{borderColor:'transparent'},'&:hover fieldset,&.Mui-focused fieldset':{borderColor:'divider',borderWidth:1}},'& input':{cursor:'default'},...sx}}/>;
}
