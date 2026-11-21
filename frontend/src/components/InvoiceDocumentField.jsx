import React,{useId} from 'react';
import {TextField} from '@mui/material';

export default function InvoiceDocumentField({label,value,onChange,type,multiline=false,placeholder,maxLength=2000,readOnly=false,appearance='document',select=false,disabled=false,children,className=''}) {
  const id=useId();
  return <div className={`invoice-cell ${className}`} data-invoice-readonly={readOnly||undefined}><label id={`${id}-label`} className="invoice-cell-label" htmlFor={id}>{label}</label><div className="invoice-cell-value">
    <TextField id={id} size={appearance==='form'?'small':undefined} variant={appearance==='form'?'outlined':'standard'} fullWidth select={select} disabled={disabled} type={type||'text'} value={value??''} onChange={onChange} multiline={multiline} minRows={multiline?1:undefined} maxRows={multiline?4:undefined} placeholder={placeholder} InputProps={{...(appearance==='form'?{}:{disableUnderline:true}),readOnly}} inputProps={{maxLength,'aria-label':label}} slotProps={select?{select:{'aria-labelledby':`${id}-label`}}:undefined}>{children}</TextField>
  </div></div>;
}
