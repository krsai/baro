import React from 'react';
import {MenuItem,Select} from '@mui/material';

export default function DashboardFilter({id,label,value,options,onChange}){
 const current=options.find(option=>option.value===value)?.label||value;
 return <Select id={id} variant="standard" size="small" disableUnderline displayEmpty value={value} onChange={event=>onChange(event.target.value)} inputProps={{'aria-label':label}} title={`${label}: ${current}`} renderValue={()=>`${label}: ${current}`} sx={{minWidth:0,maxWidth:160,border:1,borderColor:'divider',borderRadius:1,bgcolor:'background.default','& .MuiSelect-select':{pl:1,py:.5,pr:'24px !important',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}}>
  {options.map(option=><MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
 </Select>;
}
