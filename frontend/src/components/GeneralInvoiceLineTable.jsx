import {getRowActionsLabel} from '../constants/rowActions';
import React from 'react';
import {Box,Table,TableHead,TableBody,TableRow,TableCell} from '@mui/material';
import {generalInvoiceText} from '../constants/generalInvoice';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {invoiceNumber} from '../utils/invoiceStyleRows.mjs';
import {generalInvoiceColumns} from '../utils/generalInvoiceLayout.mjs';
export default function GeneralInvoiceLineTable({lines,currencyCode,languageCode,renderers,gridRef}){
 const t=generalInvoiceText[languageCode]||generalInvoiceText.en;
 const columns=[...generalInvoiceColumns,...(renderers?[{key:'actions',width:72}]:[])];
 const display=(key,line,index)=>key==='row'?index+1:key==='description'?line.description:key==='unit'?line.unit:key==='currency'?line.currencyCode||currencyCode:key==='quantity'?invoiceNumber(line.quantity):key==='price'?invoiceNumber(line.unitPrice):key==='vat'?invoiceNumber(line.vatRate)+'%':formatInvoiceMoney(key==='tax'?line.vatAmount:line.amount,line.currencyCode||currencyCode);
 return <Box ref={gridRef} className="invoice-line-scroll" sx={{overflowX:'auto'}}><Table className="invoice-lines" data-table-layout="document" data-invoice-entry-grid={renderers?true:undefined} size="small" sx={{minWidth:renderers?1200:1128}}>
  <colgroup>{columns.map(column=><col key={column.key} style={{width:column.width}}/>)}</colgroup>
  <TableHead><TableRow>{columns.map(column=><TableCell key={column.key} align={column.numeric?'right':'left'}>{column.key==='row'?'#':column.key==='actions'?getRowActionsLabel(languageCode):t[column.key]}</TableCell>)}</TableRow></TableHead>
  <TableBody>{lines.map((line,index)=><TableRow key={line.key||line.lineKey||index} data-testid={renderers?'general-invoice-line':undefined} data-invoice-line-key={line.key||line.lineKey}>{columns.map(column=><TableCell key={column.key} align={column.numeric?'right':'left'} data-table-actions={column.key==='actions'?true:undefined}>{renderers?.[column.key]?renderers[column.key](line,index):display(column.key,line,index)}</TableCell>)}</TableRow>)}</TableBody>
 </Table></Box>;
}
