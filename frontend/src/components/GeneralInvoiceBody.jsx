import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import InvoiceFormHeader from './InvoiceFormHeader';
import InvoiceFormSummary from './InvoiceFormSummary';
import {generalInvoiceText} from '../constants/generalInvoice';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';

export default function GeneralInvoiceBody({fields,languageCode,readOnly=false,onChange,currencyCode,currencyTotals,children,summaryProps,numberReadOnly=false}){
 const t=generalInvoiceText[languageCode]||generalInvoiceText.en;
 return <>
  <InvoiceFormHeader hideNumber={!readOnly&&!numberReadOnly} numberReadOnly={numberReadOnly} fields={fields} languageCode={languageCode} readOnly={readOnly} onChange={onChange}/>
  {children}
  <InvoiceFormSummary {...summaryProps} subtotals={currencyTotals} fields={fields} languageCode={languageCode} readOnly={readOnly} currencyCode={currencyCode} currencyTotals={currencyTotals}/>
 </>;
}
