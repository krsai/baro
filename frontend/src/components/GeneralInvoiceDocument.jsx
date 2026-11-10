import React from 'react';
import {Box,Stack,Table,TableBody,TableCell,TableHead,TableRow,Typography} from '@mui/material';
import InvoiceSheet from './InvoiceSheet';
import InvoiceFormHeader from './InvoiceFormHeader';
import InvoiceFormSummary from './InvoiceFormSummary';
import {generalInvoiceText} from '../constants/generalInvoice';
import {invoiceUi} from '../constants/invoiceUi';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {invoiceNumber} from '../utils/invoiceStyleRows.mjs';

export default function GeneralInvoiceDocument({invoice,languageCode}){
 const s=invoice.snapshot,t=generalInvoiceText[languageCode]||generalInvoiceText.en,ui=invoiceUi[languageCode]||invoiceUi.en;
 return <InvoiceSheet><InvoiceFormHeader fields={s.fields} languageCode={languageCode} readOnly/>
  <Typography sx={{p:2}} fontWeight={700}>{t.general}{invoice.status!=='ISSUED'?' · '+(invoice.status==='CANCELLED'?ui.cancelled:ui.superseded):''}</Typography>
  <Box sx={{overflowX:'auto'}}><Table size="small" data-table-layout="document" sx={{minWidth:900}}><TableHead><TableRow>{['#',t.description,t.unit,t.quantity,t.price,t.vat,t.tax,t.total].map((label,index)=><TableCell key={index} align={index>=3?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{s.lines.map((line,index)=><TableRow key={line.lineKey}><TableCell>{index+1}</TableCell><TableCell>{line.description}</TableCell><TableCell>{line.unit}</TableCell><TableCell align="right">{invoiceNumber(line.quantity)}</TableCell><TableCell align="right">{invoiceNumber(line.unitPrice)}</TableCell><TableCell align="right">{invoiceNumber(line.vatRate)}%</TableCell><TableCell align="right">{formatInvoiceMoney(line.vatAmount,s.currencyCode)}</TableCell><TableCell align="right">{formatInvoiceMoney(line.amount,s.currencyCode)}</TableCell></TableRow>)}</TableBody></Table></Box>
  <Stack alignItems="flex-end" sx={{p:2}}><Typography>{t.subtotal}: {formatInvoiceMoney(s.subtotal,s.currencyCode)}</Typography><Typography>{t.tax}: {formatInvoiceMoney(s.vatAmount,s.currencyCode)}</Typography></Stack>
  <InvoiceFormSummary fields={s.fields} total={s.total} currencyCode={s.currencyCode} languageCode={languageCode} readOnly/>
 </InvoiceSheet>;
}
