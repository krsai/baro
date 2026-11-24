import React, {useState} from 'react';
import {Box} from '@mui/material';
import EntityPhoneField from './EntityPhoneField';
import EntityCountryField from './EntityCountryField';
import {phoneInputCountry,phoneForCountry} from '../utils/entityPhone.mjs';
import {getCurrentLanguageCode} from '../utils/appLanguage';

// This selection describes the phone, not the employee's nationality.
export default function PersonalPhoneField({value,onChange,languageCode=getCurrentLanguageCode(),...props}){
 const [selected,setSelected]=useState('');
 const country=phoneInputCountry(value)||selected;
 const disabled=props.disabled||props.InputProps?.readOnly;
 const label=({ko:'국가번호',en:'Dialing Code',vi:'Mã Quốc Gia'})[languageCode]||'Dialing Code';
 return <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0, 1fr)',sm:'minmax(120px, 2fr) minmax(0, 3fr)'},gap:1,minWidth:0}}>
  <EntityCountryField dialingCode label={label} languageCode={languageCode} value={country||''} disabled={disabled} onChange={next=>{setSelected(next);onChange?.({target:{name:props.name,value:phoneForCountry(value,country,next)}});}}/>
  <EntityPhoneField {...props} languageCode={languageCode} country={country} value={value} onChange={onChange}/>
 </Box>;
}
