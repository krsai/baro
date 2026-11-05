import {INVOICE_BANK_TEXT} from '../constants/invoiceBankConfirmation';
import React,{useEffect,useState} from 'react';
import {Alert,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,FormControlLabel,Radio,RadioGroup,Stack,Typography} from '@mui/material';
import {invoiceAccountText} from '../utils/invoiceBankInfo.mjs';
export default function InvoiceBankConfirmation({open,onClose,accounts,currencyCode,currentText,languageCode,onConfirm}){
 const t=INVOICE_BANK_TEXT[languageCode]||INVOICE_BANK_TEXT.en,[selected,setSelected]=useState(''),[checked,setChecked]=useState(false);
 useEffect(()=>{if(!open)return;const matches=accounts.filter(account=>invoiceAccountText(account,currencyCode)===currentText);setSelected(matches.length===1?String(matches[0].id):accounts.length===1?String(accounts[0].id):'');setChecked(false);},[open,accounts,currencyCode,currentText]);
 const account=accounts.find(row=>String(row.id)===selected);
 return <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"><DialogTitle>{t.title} · {currencyCode}</DialogTitle><DialogContent dividers><Stack spacing={2}>
  {accounts.length>1&&<Alert severity="warning">{t.duplicate}</Alert>}
  {currentText&&<Stack spacing={.5}><Typography variant="caption" color="text.secondary">{t.previous}</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{currentText}</Typography></Stack>}
  <RadioGroup value={selected} onChange={event=>{setSelected(event.target.value);setChecked(false);}}>{accounts.map(row=><FormControlLabel key={row.id} value={String(row.id)} control={<Radio/>} label={<Typography variant="body2" sx={{overflowWrap:'anywhere'}}>{invoiceAccountText(row,currencyCode)}</Typography>} sx={{alignItems:'center',py:.5}}/>)}</RadioGroup>
  <FormControlLabel control={<Checkbox checked={checked} disabled={!account} onChange={event=>setChecked(event.target.checked)}/>} label={t.ack}/>
 </Stack></DialogContent><DialogActions><Button onClick={onClose}>{t.cancel}</Button><Button variant="contained" disabled={!account||!checked} onClick={()=>onConfirm(invoiceAccountText(account,currencyCode))}>{t.confirm}</Button></DialogActions></Dialog>;
}
