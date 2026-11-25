import React from 'react';
import {Box} from '@mui/material';
import InvoiceDocumentField from './InvoiceDocumentField';
import {invoiceDocumentText} from '../constants/invoiceDocument';
import {invoiceUi} from '../constants/invoiceUi';

export default function InvoiceEntrySettings({selection,fields,languageCode,onChange,currencyControl,disabled=false}){
 const text=invoiceDocumentText[languageCode]||invoiceDocumentText.en,ui=invoiceUi[languageCode]||invoiceUi.en;
 const automatic={ko:'발행 시 자동 채번',en:'Assigned on issue',vi:'Cấp khi phát hành'};
 return <Box data-invoice-entry-settings sx={{p:2,borderBottom:1,borderColor:'divider',display:'grid',gap:2,minWidth:0}}>
  {selection}
  {fields&&<Box data-invoice-entry-metadata sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'minmax(0,1.2fr) minmax(0,1fr) 120px'},gap:2,width:'100%',maxWidth:680,'& .invoice-cell':{gap:.75},'& .invoice-cell-label':{minHeight:16,lineHeight:'16px',fontSize:12},'& .invoice-cell-value':{borderBottom:0,p:0,minHeight:36},'& .MuiInputBase-root':{height:36,fontSize:13}}}>
   <InvoiceDocumentField appearance="form" name="number" label={text.number} value={fields.number} placeholder={automatic[languageCode]||automatic.en} disabled={disabled} onChange={event=>onChange('number',event.target.value)} maxLength={200}/>
   <InvoiceDocumentField appearance="form" label={ui.date} type="date" value={fields.date} disabled={disabled} onChange={event=>onChange('date',event.target.value)}/>
   {currencyControl}
  </Box>}
 </Box>;
}
