import React from 'react';
import {Box} from '@mui/material';

// Keep country and its phone together without changing either field's value contract.
export default function EntityCountryPhoneFields({countryField,phoneField}){
 return <Box data-entity-country-phone sx={{containerType:'inline-size',minWidth:0,width:'100%'}}><Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:2,'@container (min-width: 360px)':{gridTemplateColumns:'minmax(0,1fr) minmax(0,1.4fr)'},'& > *':{minWidth:0}}}>{countryField}{phoneField}</Box></Box>;
}
