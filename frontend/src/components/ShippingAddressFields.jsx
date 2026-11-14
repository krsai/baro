import React from 'react';
import {Box,TextField} from '@mui/material';

export const addressValue=value=>({label:value?.label||'',address:value?.address||'',contactName:value?.contactName||'',phone:value?.phone||''});
export default function ShippingAddressFields({value,onChange,t,disabled=false,autoFocus=false}){
 return <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
  {[['label',t.addressTitle,200],['contactName',t.addressContact,320],['phone',t.addressPhone,320],['address',t.savedAddress,160]].map(([key,label,maxLength])=><TextField key={key} fullWidth label={label} value={value[key]} disabled={disabled} autoFocus={autoFocus&&key==='label'} autoComplete="off" placeholder={key==='address'?t.addressPlaceholder:undefined} sx={key==='address'||key==='label'?{gridColumn:'1 / -1'}:undefined} slotProps={{inputLabel:{shrink:true},htmlInput:{maxLength,...(key==='phone'?{inputMode:'tel'}:{})}}} onChange={event=>onChange({...value,[key]:event.target.value})}/>)}
 </Box>;
}
