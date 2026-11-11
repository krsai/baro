import {cashScheduleText} from '../constants/cashSchedule';
import React from 'react';
import {Box,Typography} from '@mui/material';
import InvoiceDocumentField from './InvoiceDocumentField';
import {invoiceUi} from '../constants/invoiceUi';
import {invoiceDocumentText} from '../constants/invoiceDocument';

export default function InvoiceFormHeader({fields,languageCode,onChange,readOnly=false}){
  const ui=invoiceUi[languageCode]||invoiceUi.en,text=invoiceDocumentText[languageCode]||invoiceDocumentText.en;
  const labels={ko:{code:'회사 코드',automatic:'발행 시 자동 채번'},en:{code:'Company code',automatic:'Assigned on issue'},vi:{code:'Mã công ty',automatic:'Cấp khi phát hành'}}[languageCode]||{code:'Company code',automatic:'Assigned on issue'};
  const field=(party,key)=><InvoiceDocumentField key={key} label={ui[key]} value={fields[party]?.[key]} readOnly={readOnly} multiline={readOnly&&key==='address'} onChange={e=>onChange(party,{...fields[party],[key]:e.target.value})} maxLength={1000}/>;
  return <Box sx={{p:2,borderBottom:1,borderColor:'divider'}}>
    <Box className="invoice-document-top">
      <Typography component="h2" className="invoice-heading">{text.title}</Typography>
      <Box className="invoice-document-identifiers">
        <InvoiceDocumentField label={text.number} value={fields.number} placeholder={labels.automatic} readOnly={readOnly} onChange={e=>onChange('number',e.target.value)} maxLength={200}/>
        <InvoiceDocumentField label={ui.date} type="date" value={fields.date} readOnly={readOnly} onChange={e=>onChange('date',e.target.value)}/>
      </Box>
    </Box>
    <Box className="invoice-parties">{['buyer','seller'].map(party=><Box className="invoice-party" key={party}>
      <Typography component="h3" className="invoice-party-title">{text[party]}</Typography>
      <Box className="invoice-party-identity">
        {fields[party]?.code&&<InvoiceDocumentField label={labels.code} value={fields[party].code} readOnly/>}
        {field(party,'name')}
      </Box>
      {field(party,'taxId')}{field(party,'address')}
      {field(party,'phone')}{field(party,'email')}
    </Box>)}</Box>

  </Box>;
}