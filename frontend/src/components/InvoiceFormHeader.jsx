import {cashScheduleText} from '../constants/cashSchedule';
import React from 'react';
import {Box,Typography} from '@mui/material';
import InvoiceDocumentField from './InvoiceDocumentField';
import {invoiceUi} from '../constants/invoiceUi';
import {invoiceDocumentText} from '../constants/invoiceDocument';
import {invoicePartyLabels,invoicePartyRows} from '../utils/invoicePartyLayout.mjs';

export default function InvoiceFormHeader({fields,languageCode,onChange,readOnly=false,currencyControl=null}){
  const ui=invoiceUi[languageCode]||invoiceUi.en,text=invoiceDocumentText[languageCode]||invoiceDocumentText.en;
  const labels={ko:{code:'회사 코드',automatic:'발행 시 자동 채번'},en:{code:'Company code',automatic:'Assigned on issue'},vi:{code:'Mã công ty',automatic:'Cấp khi phát hành'}}[languageCode]||{code:'Company code',automatic:'Assigned on issue'};
  const appearance=readOnly?'document':'form',partyLabels=invoicePartyLabels(languageCode);
  const field=(party,key)=><InvoiceDocumentField key={key} className={key==='address'?'invoice-party-address':''} appearance={appearance} label={partyLabels[key]} value={fields[party]?.[key]} readOnly={readOnly} multiline={readOnly&&key==='address'} onChange={e=>onChange(party,{...fields[party],[key]:e.target.value})} maxLength={1000}/>;
  return <Box data-invoice-form-header={readOnly?'readonly':'editing'} sx={{p:2,borderBottom:1,borderColor:'divider',...(!readOnly?{
    '&& .invoice-document-top':{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'minmax(140px,1fr) minmax(420px,680px)'},alignItems:'end',gap:2,pb:2},
    '&& .invoice-document-identifiers':{width:'100%',maxWidth:'none',mt:0,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:currencyControl?'minmax(0,1.2fr) minmax(0,1fr) 120px':'repeat(2,minmax(0,1fr))'},gap:2},
    '&& .invoice-parties':{gap:3,mt:2,alignItems:'start'},
    '&& .invoice-party':{gap:'12px 16px',alignItems:'start'},
    '&& .invoice-party-title':{p:0,mb:.5,fontSize:13,lineHeight:'20px'},
    '&& .invoice-party-identity':{gap:2,alignItems:'start'},
    '&& .invoice-party-address':{gridColumn:'1 / -1'},
    '&& .invoice-cell':{gap:.75},
    '&& .invoice-cell-label':{minHeight:16,lineHeight:'16px',fontSize:12},
    '&& .invoice-cell-value':{borderBottom:0,p:0,minHeight:36},
    '&& .invoice-cell-value .MuiInputBase-root':{minHeight:36,fontSize:13},
    '&& .invoice-cell-value input,&& .invoice-cell-value .MuiSelect-select':{padding:'8px 12px !important',lineHeight:'20px'},
    '&& .invoice-cell-value .MuiSelect-select':{paddingRight:'32px !important'},
    '&& [data-invoice-readonly] .MuiOutlinedInput-root':{bgcolor:'action.hover'},
  }:{} )}}>
    <Box className="invoice-document-top">
      <Typography component="h2" className="invoice-heading">{text.title}</Typography>
      <Box className="invoice-document-identifiers">
        <InvoiceDocumentField appearance={appearance} label={text.number} value={fields.number} placeholder={labels.automatic} readOnly={readOnly} onChange={e=>onChange('number',e.target.value)} maxLength={200}/>
        <InvoiceDocumentField appearance={appearance} label={ui.date} type="date" value={fields.date} readOnly={readOnly} onChange={e=>onChange('date',e.target.value)}/>
        {currencyControl}
      </Box>
    </Box>
    <Box className="invoice-parties">{['buyer','seller'].map(party=><Box className="invoice-party" key={party}>
      <Typography component="h3" className="invoice-party-title">{text[party]}</Typography>
      {invoicePartyRows.map(row=><Box key={row.className} className={`invoice-party-row ${row.className}`}>{row.keys.map(key=>field(party,key))}</Box>)}
    </Box>)}</Box>

  </Box>;
}
