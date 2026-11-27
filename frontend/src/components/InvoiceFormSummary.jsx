import React from 'react';
import {invoiceEditText} from '../constants/invoiceEdit';
import {Box,Stack,Typography,TextField} from '@mui/material';
import {invoiceUi} from '../constants/invoiceUi';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {invoiceAmountFormulaRows} from '../utils/invoiceAmountFormula.mjs';
import InvoicePaymentAccount from './InvoicePaymentAccount';

export default function InvoiceFormSummary({orgId,fields,total,currencyTotals,orders=[],currencyCode,languageCode,onRemark,readOnly=false,bankAccounts,onBankChange,disabled=false,orderControls,subtotals,receivedTotals}){
  const ui=invoiceUi[languageCode]||invoiceUi.en;
  const edit=invoiceEditText[languageCode]||invoiceEditText.en;
  return <Box className="invoice-summary invoice-form-summary">
    <TextField className="invoice-remark" fullWidth multiline minRows={3} label={ui.notes} value={fields.notes||''} onChange={e=>onRemark?.(e.target.value)} InputProps={{readOnly}} inputProps={{maxLength:2000}}/>
    <Stack className="invoice-summary-details" spacing={1.5} sx={{minWidth:0}}>
      {subtotals?.map(row=><Box key={row.currencyCode}><Typography variant="body2">{edit.supply}: {formatInvoiceMoney(row.subtotal,row.currencyCode)}</Typography><Typography variant="body2">VAT: {formatInvoiceMoney(row.vatAmount,row.currencyCode)}</Typography></Box>)}
      {orders.map(order=><Box key={order.orderId||order.sourceOrderId} className="invoice-settlement"><Typography variant="body2">{edit.full}: {formatInvoiceMoney(order.subtotal??order.basisAmount,currencyCode)}</Typography>{!receivedTotals&&<Typography variant="body2">{edit.settled}: {formatInvoiceMoney(order.priorReceivedAmount||'0',currencyCode)}</Typography>}</Box>)}
      {(receivedTotals&&(receivedTotals.length?receivedTotals:(currencyTotals||[{currencyCode}]).map(row=>({...row,amount:'0'}))))?.map(row=><Typography key={row.currencyCode} variant="body2">{edit.received}: {formatInvoiceMoney(row.amount,row.currencyCode)}</Typography>)}
      {orders.some(order=>order.vatRate!==undefined)&&<Typography variant="body2">VAT: {orders.map(order=>formatInvoiceMoney(order.vatAmount,currencyCode)+' ('+order.vatRate+'%)').join(' / ')}</Typography>}
      {(currencyTotals||[{currencyCode,amount:total}]).map(row=><Box key={row.currencyCode} className="invoice-total"><span>{ui.summary}{currencyTotals?.length>1?' / '+row.currencyCode:''}</span><span>{formatInvoiceMoney(row.amount??row.total,row.currencyCode)}</span></Box>)}

      {orderControls}
    </Stack>
      <Box className="invoice-bank-section"><InvoicePaymentAccount orgId={orgId} fields={fields} accounts={bankAccounts} languageCode={languageCode} onChange={onBankChange} readOnly={readOnly} disabled={disabled}/></Box>
  </Box>;
}
