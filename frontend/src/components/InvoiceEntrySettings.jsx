import React from 'react';
import {Box} from '@mui/material';
export default function InvoiceEntrySettings({selection}){
 return selection?<Box data-invoice-entry-settings sx={{p:2,borderBottom:1,borderColor:'divider',minWidth:0}}>{selection}</Box>:null;
}
