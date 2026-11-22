import React from 'react';
import {Box,TextField} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import {getStaticOptionOptions} from '../constants/staticOptionRegistry';

export const addressValue=value=>({label:value?.label||'',address:value?.address||'',contactName:value?.contactName||'',phone:value?.phone||'',...(value?.country?{country:value.country}:{})});
export default function ShippingAddressFields({value,onChange,t,languageCode,disabled=false,autoFocus=false,personLabel}){
 const countries=getStaticOptionOptions('country',languageCode).map(row=>({...row,id:row.value}));
 return <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>
  <Box sx={{gridColumn:'1 / -1'}}><ExpenseLookupField label={t.country} languageCode={languageCode} disabled={disabled} options={countries} value={countries.find(row=>row.value===value.country)||null} getOptionLabel={row=>row.label} getCode={row=>row.value} columns={[{key:'code',label:t.country,value:row=>row.value},{key:'name',label:t.country,value:row=>row.label}]} onChange={row=>onChange({...value,country:row?.value||''})}/></Box>
  {[['label',personLabel||t.addressTitle,200],['contactName',t.addressContact,320],['phone',t.addressPhone,320],['address',t.savedAddress,160]].map(([key,label,maxLength])=><TextField key={key} fullWidth label={label} value={value[key]} required={!!personLabel&&(key==='label'||key==='address')} disabled={disabled} autoFocus={autoFocus&&key==='label'} autoComplete="off" placeholder={key==='address'?t.addressPlaceholder:undefined} sx={key==='address'||key==='label'?{gridColumn:'1 / -1'}:undefined} slotProps={{inputLabel:{shrink:true},htmlInput:{maxLength,...(key==='phone'?{inputMode:'numeric',pattern:'[0-9]*'}:{})}}} onChange={event=>onChange({...value,[key]:key==='phone'?event.target.value.replace(/\D/g,''):event.target.value})}/>)}
 </Box>;
}
