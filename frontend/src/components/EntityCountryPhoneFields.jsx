import React from 'react';
import {Box} from '@mui/material';

// Keep country and its phone together without changing either field's value contract.
export default function EntityCountryPhoneFields({countryField,phoneField}){
 return <Box data-entity-country-phone sx={{minWidth:0,width:'100%',display:'grid',gridTemplateColumns:'minmax(0,.85fr) minmax(0,2fr)',gap:1,'& > *':{minWidth:0}}}>{countryField}{phoneField}</Box>;
}
