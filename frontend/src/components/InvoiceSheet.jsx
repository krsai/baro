import React from 'react';
import {Paper} from '@mui/material';
import {invoiceDocumentCss} from '../utils/invoiceDocumentStyle.mjs';

export default function InvoiceSheet({children,...props}) {
  return <Paper variant="outlined" {...props} className="invoice-sheet" sx={{width:'100%',maxWidth:960,mx:'auto',p:{xs:2,md:4},borderRadius:0,borderColor:'#777',background:'#fff',...props.sx}}><style>{invoiceDocumentCss}</style>{children}</Paper>;
}
