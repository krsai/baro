import React from 'react';
import {Paper} from '@mui/material';
import {invoiceDocumentCss} from '../utils/invoiceDocumentStyle.mjs';

export default function InvoiceSheet({children,...props}) {
  return <Paper variant="outlined" {...props} className="invoice-sheet" sx={{width:'100%',minWidth:0,p:0,borderRadius:2.5,overflow:'hidden',background:'#fff',...props.sx}}><style>{invoiceDocumentCss}</style>{children}</Paper>;
}
