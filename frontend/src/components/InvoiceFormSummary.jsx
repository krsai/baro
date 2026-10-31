import React from 'react';
import {Box,Stack,Typography,TextField} from '@mui/material';
import {invoiceUi} from '../constants/invoiceUi';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';

export default function InvoiceFormSummary({fields,total,currencyCode,languageCode,onRemark,readOnly=false}){
  const ui=invoiceUi[languageCode]||invoiceUi.en;
  return <Box className="invoice-summary">
    <TextField fullWidth multiline minRows={3} label={ui.notes} value={fields.notes||''} onChange={e=>onRemark?.(e.target.value)} InputProps={{readOnly}} inputProps={{maxLength:2000}}/>
    <Stack spacing={1.5} sx={{minWidth:0}}><Typography variant="caption">{currencyCode}</Typography><Box className="invoice-total"><span>{ui.summary}</span><span>{formatInvoiceMoney(total,currencyCode)}</span></Box>
      <Typography variant="caption" color="text.secondary">{ui.bank}</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{fields.bank||'—'}</Typography>
    </Stack>
  </Box>;
}
