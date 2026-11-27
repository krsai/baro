import {cashScheduleText} from '../constants/cashSchedule';
import React from 'react';
import {Box,Typography} from '@mui/material';
import InvoiceDocumentField from './InvoiceDocumentField';
import {invoiceUi} from '../constants/invoiceUi';
import {invoiceDocumentText} from '../constants/invoiceDocument';
import {invoicePartyLabels,invoicePartyRows} from '../utils/invoicePartyLayout.mjs';

export default function InvoiceFormHeader({fields,languageCode,onChange,readOnly=false,hideIdentifiers=false,currencyControl=null,title,disabled=false,numberLabel,dateLabel,numberPlaceholder,numberReadOnly=false}){
  const ui=invoiceUi[languageCode]||invoiceUi.en,text=invoiceDocumentText[languageCode]||invoiceDocumentText.en;
  const labels={ko:{code:'회사 코드',automatic:'발행 시 자동 채번'},en:{code:'Company code',automatic:'Assigned on issue'},vi:{code:'Mã công ty',automatic:'Cấp khi phát hành'}}[languageCode]||{code:'Company code',automatic:'Assigned on issue'};
  const appearance='document',partyLabels=invoicePartyLabels(languageCode);
  const field=(party,key)=><InvoiceDocumentField key={key} name={key==='name'?'companyName':key==='taxId'?'taxNumber':key} className={key==='address'?'invoice-party-address':''} appearance={appearance} label={partyLabels[key]} value={fields[party]?.[key]} readOnly={readOnly} disabled={disabled} multiline={readOnly&&key==='address'} onChange={e=>onChange(party,{...fields[party],[key]:e.target.value})} maxLength={1000}/>;
  return <Box data-invoice-form-header={readOnly?'readonly':'editing'} sx={{p:2,borderBottom:1,borderColor:'divider'}}>
    <Box className="invoice-document-top">
      <Typography component="h2" className="invoice-heading">{title||text.title}</Typography>
      {!hideIdentifiers&&<Box className="invoice-document-identifiers">
        <InvoiceDocumentField name="number" appearance={appearance} label={numberLabel||text.number} value={fields.number} placeholder={numberPlaceholder??labels.automatic} readOnly={readOnly||numberReadOnly} disabled={disabled} onChange={e=>onChange('number',e.target.value)} maxLength={200}/>
        <InvoiceDocumentField appearance={appearance} label={dateLabel||ui.date} type="date" value={fields.date} readOnly={readOnly} disabled={disabled} onChange={e=>onChange('date',e.target.value)}/>
        {currencyControl}
      </Box>}
    </Box>
    <Box className="invoice-parties">{['buyer','seller'].map(party=><Box className="invoice-party" key={party}>
      <Typography component="h3" className="invoice-party-title">{text[party]}</Typography>
      {invoicePartyRows.map(row=><Box key={row.className} className={`invoice-party-row ${row.className}`}>{row.keys.map(key=>field(party,key))}</Box>)}
    </Box>)}</Box>

  </Box>;
}
