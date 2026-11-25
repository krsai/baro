import React from 'react';
import {Box,Stack,Typography,TextField} from '@mui/material';
import {invoiceUi} from '../constants/invoiceUi';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {invoiceAmountFormulaRows} from '../utils/invoiceAmountFormula.mjs';
import {invoiceMessages} from '../constants/invoiceMessages';
import InvoicePaymentAccount from './InvoicePaymentAccount';

export default function InvoiceFormSummary({orgId,fields,total,currencyTotals,orders=[],currencyCode,languageCode,onRemark,readOnly=false,bankAccounts,onBankChange,disabled=false}){
  const ui=invoiceUi[languageCode]||invoiceUi.en;
  const text=invoiceMessages[languageCode]||invoiceMessages.en;
  const formulas=invoiceAmountFormulaRows(orders,currencyCode);
  return <Box className="invoice-summary">
    <TextField className="invoice-remark" fullWidth multiline minRows={6} label={ui.notes} value={fields.notes||''} onChange={e=>onRemark?.(e.target.value)} InputProps={{readOnly}} inputProps={{maxLength:2000}}/>
    <Stack className="invoice-summary-details" spacing={1.5} sx={{minWidth:0}}>{!currencyTotals&&<Typography variant="caption">{currencyCode}</Typography>}
      {formulas.map(row=><Box className="invoice-amount-formula" key={row.key}><Typography variant="caption" color="text.secondary">{row.label} · {text.subtotal}</Typography><Typography variant="body2">{row.formula}</Typography>{row.deduction&&<Typography variant="body2">{row.deduction}</Typography>}</Box>)}
      {orders.some(order=>order.vatRate!==undefined)&&<Typography variant="body2">VAT: {orders.map(order=>formatInvoiceMoney(order.vatAmount,currencyCode)+' ('+order.vatRate+'%)').join(' / ')}</Typography>}
      {(currencyTotals||[{currencyCode,amount:total}]).map(row=><Box key={row.currencyCode} className="invoice-total"><span>{ui.summary} / {row.currencyCode}</span><span>{formatInvoiceMoney(row.amount??row.total,row.currencyCode)}</span></Box>)}
      <Typography variant="caption" color="text.secondary">{ui.bank}</Typography><InvoicePaymentAccount orgId={orgId} fields={fields} accounts={bankAccounts} languageCode={languageCode} onChange={onBankChange} readOnly={readOnly} disabled={disabled}/>
    </Stack>
  </Box>;
}
