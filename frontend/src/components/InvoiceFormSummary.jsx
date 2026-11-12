import React from 'react';
import {Box,Stack,Typography,TextField} from '@mui/material';
import {invoiceUi} from '../constants/invoiceUi';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {invoiceAmountFormulaRows} from '../utils/invoiceAmountFormula.mjs';
import {invoiceMessages} from '../constants/invoiceMessages';

export default function InvoiceFormSummary({fields,total,orders=[],currencyCode,languageCode,onRemark,readOnly=false}){
  const ui=invoiceUi[languageCode]||invoiceUi.en;
  const text=invoiceMessages[languageCode]||invoiceMessages.en;
  const formulas=invoiceAmountFormulaRows(orders,currencyCode);
  return <Box className="invoice-summary">
    <TextField className="invoice-remark" fullWidth multiline minRows={6} label={ui.notes} value={fields.notes||''} onChange={e=>onRemark?.(e.target.value)} InputProps={{readOnly}} inputProps={{maxLength:2000}}/>
    <Stack className="invoice-summary-details" spacing={1.5} sx={{minWidth:0}}><Typography variant="caption">{currencyCode}</Typography>
      {formulas.map(row=><Box className="invoice-amount-formula" key={row.key}><Typography variant="caption" color="text.secondary">{row.label} · {text.subtotal}</Typography><Typography variant="body2">{row.formula}</Typography>{row.deduction&&<Typography variant="body2">{row.deduction}</Typography>}</Box>)}
      <Box className="invoice-total"><span>{ui.summary}</span><span>{formatInvoiceMoney(total,currencyCode)}</span></Box>
      <Typography variant="caption" color="text.secondary">{ui.bank}</Typography><Box className="invoice-bank-lines">{String(fields.bank||'—').split(/\r?\n/).map((line,index)=><Typography className="invoice-bank-line" variant="body2" key={index}>{line||'\u00a0'}</Typography>)}</Box>
    </Stack>
  </Box>;
}
