import {splitEntityPhone} from '../utils/entityPhone.mjs';
import React from 'react';
import {Box,TextField} from '@mui/material';
import EntityCountryField from './EntityCountryField';
import EntityPhoneField from './EntityPhoneField';
import EntityCountryPhoneFields from './EntityCountryPhoneFields';

export const addressValue=value=>({label:value?.label||'',address:value?.address||'',contactName:value?.contactName||'',phone:value?.phone||'',...(value?.country?{country:value.country}:{})});
export default function ShippingAddressFields({value,onChange,t,languageCode,disabled=false,autoFocus=false,personLabel}){
 return <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
  <TextField fullWidth label={personLabel||t.addressTitle} value={value.label} required={!!personLabel} disabled={disabled} autoFocus={autoFocus} sx={{gridColumn:'1 / -1'}} slotProps={{htmlInput:{maxLength:200,'data-text-case':personLabel?'title':'upper'}}} onChange={event=>onChange({...value,label:event.target.value})}/>
  <Box sx={{gridColumn:'1 / -1'}}><EntityCountryPhoneFields countryField={<EntityCountryField label={t.country} languageCode={languageCode} value={value.country} disabled={disabled} onChange={country=>onChange({...value,country,phone:value.phone.startsWith('+')?splitEntityPhone(value.phone,value.country).local.replace(/\D/g,''):value.phone})}/>} phoneField={<EntityPhoneField languageCode={languageCode} country={value.country} digitsOnly localValue fullWidth label={t.addressPhone} value={value.phone} disabled={disabled} slotProps={{htmlInput:{maxLength:320,inputMode:'numeric',pattern:'[0-9]*'}}} onChange={event=>onChange({...value,phone:event.target.value.replace(/\D/g,'')})}/>}/></Box>
  <TextField fullWidth label={t.savedAddress} value={value.address} required={!!personLabel} disabled={disabled} placeholder={t.addressPlaceholder} sx={{gridColumn:'1 / -1'}} slotProps={{inputLabel:{shrink:true},htmlInput:{maxLength:160}}} onChange={event=>onChange({...value,address:event.target.value})}/>
  <TextField fullWidth name="contactName" label={t.addressContact} value={value.contactName} disabled={disabled} sx={{gridColumn:'1 / -1'}} slotProps={{htmlInput:{maxLength:320}}} onChange={event=>onChange({...value,contactName:event.target.value})}/>
 </Box>;
}
