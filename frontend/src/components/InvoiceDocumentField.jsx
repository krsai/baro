import React,{useId} from 'react';
import {TextField} from '@mui/material';

export default function InvoiceDocumentField({label,value,onChange,type,multiline=false,placeholder,maxLength=2000,readOnly=false}) {
  const id=useId();
  return <div className="invoice-cell"><label className="invoice-cell-label" htmlFor={id}>{label}</label><div className="invoice-cell-value">
    <TextField id={id} variant="standard" fullWidth type={type||'text'} value={value||''} onChange={onChange} multiline={multiline} minRows={multiline?1:undefined} maxRows={multiline?4:undefined} placeholder={placeholder} InputProps={{disableUnderline:true,readOnly}} inputProps={{maxLength}}/>
  </div></div>;
}
