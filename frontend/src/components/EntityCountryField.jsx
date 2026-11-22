import React from 'react';
import ExpenseLookupField from './ExpenseLookupField';
import {getStaticOptionOptions} from '../constants/staticOptionRegistry';

// Store the same ISO country values as partner profiles; never infer identity from a phone.
export default function EntityCountryField({value,onChange,label,languageCode,disabled=false}){
 const options=getStaticOptionOptions('country',languageCode).map(row=>({...row,id:row.value}));
 return <ExpenseLookupField label={label} languageCode={languageCode} disabled={disabled} options={options} value={options.find(row=>row.value===value)||null} getOptionLabel={row=>row.label} getCode={row=>row.value} columns={[{key:'code',label,value:row=>row.value},{key:'name',label,value:row=>row.label}]} onChange={row=>onChange(row?.value||'')}/>;
}
