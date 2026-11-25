import React,{useEffect,useState} from 'react';
import {Box,Button,Typography} from '@mui/material';
import LookupSearchDialog from './LookupSearchDialog';
import {invoicePaymentAccountText} from '../constants/invoicePaymentAccount';
import {paymentAccountRows,paymentAccountFields} from '../utils/invoicePaymentAccount.mjs';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import AppNotice from './AppNotice';

export default function InvoicePaymentAccount({orgId,fields,accounts=[],languageCode='ko',onChange,readOnly=false,disabled=false}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState('');
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const t=invoicePaymentAccountText[languageCode]||invoicePaymentAccountText.en;
 useEffect(()=>{if(!open||!orgId)return;let alive=true;const controller=new AbortController();setLoading(true);setFailed(false);setRows([]);requestJSON('/invoices/payment-accounts'+buildQueryString({orgId}),{skipCache:true,signal:controller.signal}).then(value=>{if(alive)setRows(value);}).catch(error=>{if(alive&&error.name!=='AbortError')setFailed(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;controller.abort();};},[open,orgId,retry]);
 const candidates=(orgId?rows:accounts).filter(row=>row.isActive!==false&&(!row.accountKind||row.accountKind==='BANK')&&row.accountNumber);
 return <Box data-testid="invoice-payment-account">
  {fields.bankAccountSnapshot?<Box component="dl" sx={{display:'grid',gridTemplateColumns:'max-content minmax(0,1fr)',gap:.75,m:0}}>{paymentAccountRows(fields.bankAccountSnapshot,languageCode).map(row=><React.Fragment key={row.key}><Typography component="dt" variant="caption" color="text.secondary">{row.label}</Typography><Typography component="dd" variant="body2" sx={{m:0,overflowWrap:'anywhere'}}>{row.value}</Typography></React.Fragment>)}</Box>:fields.bank?<Box className="invoice-bank-lines">{String(fields.bank).split(/\r?\n/).map((line,index)=><Typography className="invoice-bank-line" variant="body2" key={index}>{line}</Typography>)}</Box>:null}
  {!readOnly&&onChange&&<Button variant="text" disabled={disabled} onClick={()=>{setSearch('');setOpen(true);}} sx={{mt:fields.bank?1:0}}>{fields.bank?t.change:t.select}</Button>}
  {!readOnly&&<LookupSearchDialog open={open} onClose={()=>setOpen(false)} title={t.title} query={search} onQueryChange={setSearch} searchLabel={t.bankName+' / '+t.accountNumber} languageCode={languageCode} options={failed||loading?[]:candidates} loading={loading} feedback={failed?<AppNotice severity="error" action={<Button onClick={()=>setRetry(value=>value+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>:undefined} columns={['bankName','accountNumber','accountHolder','currencyCode','swiftCode'].map(key=>({key,label:t[key],value:row=>key==='currencyCode'?row.currency?.code||row.currencyCode||'':row[key]||'—'}))} onSelect={account=>{onChange(paymentAccountFields(account));setOpen(false);}}/>}
 </Box>;
}
