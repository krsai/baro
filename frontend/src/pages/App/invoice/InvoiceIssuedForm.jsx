import React from 'react';
import GeneralInvoiceDocument from '../../../components/GeneralInvoiceDocument';
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
  if(invoice.snapshot?.documentKind==='GENERAL')return <GeneralInvoiceDocument invoice={invoice} languageCode={languageCode}/>;
  const snapshot=invoice.snapshot,fields=snapshot.fields||{},currency=snapshot.currencyCode;
  const ui=invoiceUi[languageCode]||invoiceUi.en,text=invoiceDocumentText[languageCode]||invoiceDocumentText.en,d=invoiceDetailText[languageCode]||invoiceDetailText.en;
  const rows=invoiceStyleRows(snapshot.lines.filter(line=>line.quantity>0));
  const orders=new Map(snapshot.orders.map(order=>[order.sourceOrderId,order.sourceOrderNumber]));
  return <InvoiceSheet>
    <InvoiceFormHeader fields={fields} languageCode={languageCode} readOnly/>
    <Typography className="invoice-section-title">{ui.details} · {invoiceNumber(rows.length)}{invoice.status!=='ISSUED'&&<Box component="span" sx={{float:'right',color:'error.main'}}>{invoice.status==='CANCELLED'?ui.cancelled:ui.superseded}</Box>}</Typography>
    <Box sx={{overflowX:'auto'}}><Table data-table-layout="document" className="invoice-lines" size="small" sx={{minWidth:760}}><colgroup>{[40,110,null,130,120,160].map((width,index)=><col key={index} style={width?{width}:undefined}/>)}</colgroup>
      <TableHead><TableRow>{[text.row,text.orderNumber,text.style,d.unitPrice,d.quantity,ui.summary].map((label,index)=><TableCell key={index} align={index===0||index>=3?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead>
      <TableBody>{rows.map((group,index)=>{const line=group.lines[0];const order=snapshot.orders.find(o=>o.sourceOrderId===line.orderId);return <React.Fragment key={group.key}>{(index===0||rows[index-1].lines[0].orderId!==line.orderId)&&<TableRow><TableCell colSpan={6}><Box sx={{display:'flex',gap:3,flexWrap:'wrap',alignItems:'center'}}><Typography fontWeight={700}>{orders.get(line.orderId)}</Typography><Typography>{text.billing}: {order?.billingPercentage||100}%</Typography><Typography>{text.deduction}: {formatInvoiceMoney(order?.appliedDeductionAmount||'0',currency)}</Typography><Typography sx={{ml:'auto'}}>{ui.summary}: {formatInvoiceMoney(order?.netAmount,currency)}</Typography></Box></TableCell></TableRow>}<TableRow key={group.key}><TableCell align="right">{invoiceNumber(index+1)}</TableCell><TableCell>{orders.get(line.orderId)}</TableCell><TableCell>{line.description||line.styleName||'—'}</TableCell>
        <TableCell align="right">{formatInvoiceMoney(line.unitPrice,currency)}</TableCell><TableCell align="right">{invoiceNumber(group.quantity)}</TableCell><TableCell align="right">{formatInvoiceMoney(group.amount,currency)}</TableCell></TableRow></React.Fragment>;})}</TableBody>
    </Table></Box>
    <InvoiceFormSummary fields={fields} total={snapshot.total} currencyCode={currency} languageCode={languageCode} readOnly/>
  </InvoiceSheet>;
}
