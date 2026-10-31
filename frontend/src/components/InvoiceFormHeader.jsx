import React from 'react';
import {Box,Typography} from '@mui/material';
import InvoiceDocumentField from './InvoiceDocumentField';
import {invoiceUi} from '../constants/invoiceUi';
import {invoiceDocumentText} from '../constants/invoiceDocument';

export default function InvoiceFormHeader({fields,languageCode,onChange,readOnly=false}){
  const ui=invoiceUi[languageCode]||invoiceUi.en,text=invoiceDocumentText[languageCode]||invoiceDocumentText.en;
  return <Box sx={{p:2,borderBottom:1,borderColor:'divider'}}>
    <Box className="invoice-metadata">
      <InvoiceDocumentField label={text.buyer} value={fields.buyer?.name} readOnly/>
      <InvoiceDocumentField label={text.number} value={fields.number} placeholder="INV-YYYY-000001" readOnly={readOnly} onChange={e=>onChange('number',e.target.value)} maxLength={200}/>
      <InvoiceDocumentField label={ui.date} type="date" value={fields.date} readOnly={readOnly} onChange={e=>onChange('date',e.target.value)}/>
      <InvoiceDocumentField label={ui.dueDate} type="date" value={fields.dueDate} readOnly={readOnly} onChange={e=>onChange('dueDate',e.target.value)}/>
      <InvoiceDocumentField label={ui.paymentTerms} value={fields.paymentTerms} readOnly={readOnly} onChange={e=>onChange('paymentTerms',e.target.value)}/>
      <InvoiceDocumentField label={ui.incoterm} value={fields.incoterm} readOnly={readOnly} onChange={e=>onChange('incoterm',e.target.value)}/>
    </Box>
    <Box component="details" sx={{mt:1,'& summary':{cursor:'pointer',fontSize:12,color:'text.secondary'}}}><summary>{ui.parties}</summary>
      <Box className="invoice-parties">{['buyer','seller'].map(party=><Box className="invoice-party" key={party}><Typography component="h2" className="invoice-party-title">{text[party]}</Typography>
        {['name','address','taxId','phone','email'].map(key=><InvoiceDocumentField key={key} label={ui[key]} value={fields[party]?.[key]} readOnly={readOnly} multiline={key==='address'} onChange={e=>onChange(party,{...fields[party],[key]:e.target.value})} maxLength={1000}/>)}
      </Box>)}</Box>
    </Box>
  </Box>;
}
