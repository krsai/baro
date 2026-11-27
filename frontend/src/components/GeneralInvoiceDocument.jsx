import React from 'react';
import {Typography} from '@mui/material';
import InvoiceSheet from './InvoiceSheet';
import GeneralInvoiceBody from './GeneralInvoiceBody';
import GeneralInvoiceLineTable from './GeneralInvoiceLineTable';
import {invoiceUi} from '../constants/invoiceUi';
export default function GeneralInvoiceDocument({invoice,languageCode}){
 const s=invoice.snapshot,ui=invoiceUi[languageCode]||invoiceUi.en;
 const totals=s.currencyTotals||[{currencyCode:s.currencyCode,subtotal:s.subtotal,vatAmount:s.vatAmount,total:s.total}];
 return <InvoiceSheet><GeneralInvoiceBody fields={s.fields} languageCode={languageCode} readOnly currencyCode={s.currencyCode} currencyTotals={totals} summaryProps={{total:s.total,receivedTotals:invoice.receivedTotals}}>
 {invoice.status!=='ISSUED'&&<Typography sx={{p:2}} fontWeight={700}>{invoice.status==='CANCELLED'?ui.cancelled:ui.superseded}</Typography>}
 <GeneralInvoiceLineTable lines={s.lines} currencyCode={s.currencyCode} languageCode={languageCode}/>
 </GeneralInvoiceBody></InvoiceSheet>;
}
