import React from 'react';
import {Paper} from '@mui/material';
import {ThemeProvider} from '@mui/material/styles';
import {appThemes} from '../theme';
import {invoiceDocumentCss} from '../utils/invoiceDocumentStyle.mjs';
const documentVariables=appThemes.standard.components.MuiCssBaseline.styleOverrides[':root'];

export default function InvoiceSheet({children,...props}) {
  return <ThemeProvider theme={appThemes.standard}><Paper variant="outlined" {...props} className="invoice-sheet" sx={{...documentVariables,width:'100%',minWidth:0,p:0,borderRadius:2.5,overflow:'hidden',background:'#fff',...props.sx}}><style>{invoiceDocumentCss}</style>{children}</Paper></ThemeProvider>;
}
