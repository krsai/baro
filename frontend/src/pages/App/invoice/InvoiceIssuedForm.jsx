import React from 'react';
import {Box,Typography,Table,TableHead,TableBody,TableRow,TableCell,TextField} from '@mui/material';
import InvoiceSheet from '../../../components/InvoiceSheet';
import InvoiceFormHeader from '../../../components/InvoiceFormHeader';
import InvoiceFormSummary from '../../../components/InvoiceFormSummary';
import {invoiceStyleRows,invoiceNumber} from '../../../utils/invoiceStyleRows.mjs';
import {formatInvoiceMoney} from '../../../utils/invoiceItemGrid.mjs';
import {invoiceUi} from '../../../constants/invoiceUi';
import {invoiceDocumentText} from '../../../constants/invoiceDocument';
import {invoiceDetailText} from '../../../constants/invoiceDetail';

export default function InvoiceIssuedForm({invoice,languageCode}){
  const snapshot=invoice.snapshot,fields=snapshot.fields||{},currency=snapshot.currencyCode;
  const ui=invoiceUi[languageCode]||invoiceUi.en,text=invoiceDocumentText[languageCode]||invoiceDocumentText.en,d=invoiceDetailText[languageCode]||invoiceDetailText.en;
  const rows=invoiceStyleRows(snapshot.lines.filter(line=>line.quantity>0));
  const orders=new Map(snapshot.orders.map(order=>[order.sourceOrderId,order.sourceOrderNumber]));
  return <InvoiceSheet>
    <InvoiceFormHeader fields={fields} languageCode={languageCode} readOnly/>
    <Typography className="invoice-section-title">{ui.details} · {invoiceNumber(rows.length)}{invoice.status!=='ISSUED'&&<Box component="span" sx={{float:'right',color:'error.main'}}>{invoice.status==='CANCELLED'?ui.cancelled:ui.superseded}</Box>}</Typography>
    <Box sx={{overflowX:'auto'}}><Table className="invoice-lines" size="small" sx={{minWidth:660}}><colgroup>{[40,null,130,120,160].map((width,index)=><col key={index} style={width?{width}:undefined}/>)}</colgroup>
      <TableHead><TableRow>{[text.row,text.description,d.unitPrice,d.quantity,ui.summary].map((label,index)=><TableCell key={index} align={index===0||index>=2?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{rows.map((group,index)=>{const line=group.lines[0];return <TableRow key={group.key}><TableCell align="right">{invoiceNumber(index+1)}</TableCell><TableCell><Typography variant="caption" display="block">{orders.get(line.orderId)}</Typography>{line.description||line.styleName||'—'}</TableCell>
        <TableCell align="right">{formatInvoiceMoney(line.unitPrice,currency)}</TableCell><TableCell align="right">{invoiceNumber(group.quantity)}</TableCell><TableCell align="right">{formatInvoiceMoney(group.amount,currency)}</TableCell></TableRow>;})}</TableBody>
    </Table></Box>
    <Box sx={{p:2,overflowX:'auto'}}><Table size="small" sx={{minWidth:600}}><TableHead><TableRow>{[ui.orders,text.billing,text.deduction,ui.summary].map((label,index)=><TableCell key={index} align={index?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{snapshot.orders.map(order=><TableRow key={order.sourceOrderId}><TableCell>{order.sourceOrderNumber}</TableCell><TableCell align="right"><TextField size="small" value={order.billingPercentage||''} InputProps={{readOnly:true}} inputProps={{style:{textAlign:'right'}}} sx={{width:100}}/></TableCell><TableCell align="right">{formatInvoiceMoney(order.appliedDeductionAmount||'0',currency)}</TableCell><TableCell align="right">{formatInvoiceMoney(order.netAmount,currency)}</TableCell></TableRow>)}</TableBody></Table></Box>
    <InvoiceFormSummary fields={fields} total={snapshot.total} currencyCode={currency} languageCode={languageCode} readOnly/>
  </InvoiceSheet>;
}
