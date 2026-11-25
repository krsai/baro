import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import InvoiceFormHeader from './InvoiceFormHeader';
import InvoiceFormSummary from './InvoiceFormSummary';
import {generalInvoiceText} from '../constants/generalInvoice';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';

export default function GeneralInvoiceBody({fields,languageCode,readOnly=false,onChange,currencyCode,currencyTotals,children,summaryProps}){
 const t=generalInvoiceText[languageCode]||generalInvoiceText.en;
 return <>
  <InvoiceFormHeader fields={fields} languageCode={languageCode} readOnly={readOnly} onChange={onChange}/>
  {children}
  <Stack className="invoice-subtotals" alignItems="flex-end" sx={{p:2}}>{currencyTotals.map(total=><Box key={total.currencyCode}><Typography variant="body2">{currencyTotals.length>1?total.currencyCode+' / ':''}{t.subtotal}: {formatInvoiceMoney(total.subtotal,total.currencyCode)}</Typography><Typography variant="body2">{t.tax}: {formatInvoiceMoney(total.vatAmount,total.currencyCode)}</Typography></Box>)}</Stack>
  <InvoiceFormSummary {...summaryProps} fields={fields} languageCode={languageCode} readOnly={readOnly} currencyCode={currencyCode} currencyTotals={currencyTotals}/>
 </>;
}
