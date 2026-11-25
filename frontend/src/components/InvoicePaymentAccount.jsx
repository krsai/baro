import React,{useEffect,useState} from 'react';
import {Box,Button,Stack,Typography} from '@mui/material';
import LookupSearchDialog from './LookupSearchDialog';
import {invoicePaymentAccountText} from '../constants/invoicePaymentAccount';
import {paymentAccountRows,paymentAccountSelections,paymentAccountsFields} from '../utils/invoicePaymentAccount.mjs';
import {invoiceUi} from '../constants/invoiceUi';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import AppNotice from './AppNotice';

export default function InvoicePaymentAccount({orgId,fields,accounts=[],languageCode='ko',onChange,readOnly=false,disabled=false}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[pending,setPending]=useState([]);
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const t=invoicePaymentAccountText[languageCode]||invoicePaymentAccountText.en;
 const ui=invoiceUi[languageCode]||invoiceUi.en,selected=paymentAccountSelections(fields);
 useEffect(()=>{if(!open||!orgId)return;let alive=true;const controller=new AbortController();setLoading(true);setFailed(false);setRows([]);requestJSON('/invoices/payment-accounts'+buildQueryString({orgId}),{skipCache:true,signal:controller.signal}).then(value=>{if(!Array.isArray(value))throw new Error('INVOICE_BANK_ACCOUNT_INVALID');if(alive){setRows(value);setPending(current=>current.map(row=>value.find(account=>account.id===row.id)||row));}}).catch(error=>{if(alive&&error.name!=='AbortError')setFailed(true);}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;controller.abort();};},[open,orgId,retry]);
 const candidates=(orgId?rows:accounts).filter(row=>row.isActive!==false&&(!row.accountKind||row.accountKind==='BANK')&&row.accountNumber);
 const options=[...candidates,...pending.filter(row=>!candidates.some(account=>account.id===row.id)).map(row=>({...row,unavailable:true}))];
 const begin=()=>{setLoading(Boolean(orgId));setFailed(false);setRows([]);setSearch('');setPending(selected.map(row=>({id:row.id,...row.snapshot,updatedAt:row.revision})));setOpen(true);};
 return <Box data-testid="invoice-payment-account">
  <Stack data-invoice-bank-actions direction="row" useFlexGap alignItems="center" justifyContent="space-between" gap={1} sx={{mb:selected.length||fields.bank?1.5:0}}><Typography variant="caption" color="text.secondary" sx={{flex:1,minWidth:0}}>{ui.bank}</Typography>{!readOnly&&onChange&&<Button size="small" variant="outlined" disabled={disabled} onClick={begin} sx={{ml:'auto',flexShrink:0}}>{selected.length||fields.bank?t.change:t.select}</Button>}</Stack>
  {selected.length?<Box className="invoice-bank-grid" style={{'--invoice-bank-count':selected.length,'--invoice-bank-tablet-count':Math.min(2,selected.length)}}>{selected.map((account,index)=><Box key={account.id||index} component="dl" className="invoice-bank-card" data-invoice-bank-card>{paymentAccountRows(account.snapshot,languageCode).map(row=><React.Fragment key={row.key}><Typography component="dt" variant="caption" color="text.secondary">{row.label}</Typography><Typography component="dd" variant="body2">{row.value}</Typography></React.Fragment>)}</Box>)}</Box>:fields.bank?<Box className="invoice-bank-lines">{String(fields.bank).split(/\r?\n/).map((line,index)=><Typography className="invoice-bank-line" variant="body2" key={index}>{line}</Typography>)}</Box>:null}
  {!readOnly&&<LookupSearchDialog previewDetails={false} tableMinWidth={680} maxWidth="md" multiple selected={pending} open={open} onClose={()=>setOpen(false)} title={t.title+' ('+pending.length+'/3)'} query={search} onQueryChange={setSearch} searchLabel={t.bankName+' / '+t.accountNumber} languageCode={languageCode} options={failed||loading?[]:options} loading={loading} confirmLabel={t.apply} confirmDisabled={loading||failed||pending.some(row=>!candidates.some(account=>account.id===row.id))} getOptionDisabled={row=>!pending.some(account=>account.id===row.id)&&(row.unavailable||pending.length>=3)} feedback={failed?<AppNotice severity="error" action={<Button onClick={()=>setRetry(value=>value+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>:undefined} columns={['bankName','accountNumber','accountHolder','currencyCode','swiftCode'].map(key=>({key,label:t[key],value:row=>key==='currencyCode'?row.currency?.code||row.currencyCode||'':row[key]||'—'}))} onSelect={account=>setPending(current=>current.some(row=>row.id===account.id)?current.filter(row=>row.id!==account.id):current.length<3?[...current,account]:current)} onConfirm={()=>{onChange(paymentAccountsFields(pending));setOpen(false);}}/>}
 </Box>;
}
