import {splitEntityPhone} from '../utils/entityPhone.mjs';
import React from 'react';
import {Box,TextField} from '@mui/material';
import EntityCountryField from './EntityCountryField';
import EntityPhoneField from './EntityPhoneField';

export const addressValue=value=>({label:value?.label||'',address:value?.address||'',contactName:value?.contactName||'',phone:value?.phone||'',...(value?.country?{country:value.country}:{})});
export default function ShippingAddressFields({value,onChange,t,languageCode,disabled=false,autoFocus=false,personLabel}){
 return <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
  <Box sx={{gridColumn:'1 / -1'}}><EntityCountryField label={t.country} languageCode={languageCode} value={value.country} disabled={disabled} onChange={country=>onChange({...value,country,phone:value.phone.startsWith('+')?splitEntityPhone(value.phone,value.country).local.replace(/\D/g,''):value.phone})}/></Box>
  {[['label',personLabel||t.addressTitle,200],['contactName',t.addressContact,320],['phone',t.addressPhone,320],['address',t.savedAddress,160]].map(([key,label,maxLength])=>{const Field=key==='phone'?EntityPhoneField:TextField;return <Field {...(key==='phone'?{country:value.country,digitsOnly:true,localValue:true}:{})} key={key} fullWidth label={label} value={value[key]} required={!!personLabel&&(key==='label'||key==='address')} disabled={disabled} autoFocus={autoFocus&&key==='label'} autoComplete="off" placeholder={key==='address'?t.addressPlaceholder:undefined} sx={key==='address'||key==='label'?{gridColumn:'1 / -1'}:undefined} slotProps={{inputLabel:{shrink:true},htmlInput:{maxLength,...(key==='phone'?{inputMode:'numeric',pattern:'[0-9]*'}:{})}}} onChange={event=>onChange({...value,[key]:key==='phone'?event.target.value.replace(/\D/g,''):event.target.value})}/>;})}
 </Box>;
}
