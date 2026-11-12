import React,{useEffect,useState} from 'react';
import {Alert,Button,CircularProgress,Typography} from '@mui/material';
import LookupSearchDialog from './LookupSearchDialog';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {ledgerEntryText} from '../constants/ledgerEntry';
import {bankLedgerMessages} from '../constants/bankLedgerMessages';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
export default function LedgerDocumentPicker({orgId,currencyCode,type,value,disabled,languageCode,onChange,compact=false,direction}){
 const t=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{setOpen(false);setRows([]);},[orgId,currencyCode,type]);
 useEffect(()=>{setRows([]);setError(false);if(!open||!search.trim()){setBusy(false);return;}let alive=true;const controller=new AbortController();setBusy(true);
  const timer=setTimeout(()=>requestJSON('/bank-ledger/evidence/search'+buildQueryString({orgId,currencyCode,type,direction,search:search.trim()}),{skipCache:true,signal:controller.signal}).then(result=>{if(alive)setRows(result.documents);}).catch(e=>{if(alive&&e.name!=='AbortError')setError(true);}).finally(()=>{if(alive)setBusy(false);}),250);
  return()=>{alive=false;clearTimeout(timer);controller.abort();};
 },[open,search,orgId,currencyCode,type,direction]);
 return <><Button variant="outlined" size="small" startIcon={compact?undefined:<SearchOutlined/>} disabled={disabled||!currencyCode} title={value?.reference||t.link} onClick={()=>{setSearch('');setOpen(true);}} sx={{minWidth:0,maxWidth:'100%',justifyContent:'flex-start',color:'text.primary',borderColor:'divider','& .MuiButton-startIcon':{color:'text.secondary'}}}><Typography variant="body2" noWrap>{compact?(value?t.connected:t.unlinked):value?.reference||t.link}</Typography></Button>
 <LookupSearchDialog tableMinWidth={550} open={open&&!disabled} onClose={()=>setOpen(false)} title={t.link+' · '+t[type]} query={search} onQueryChange={setSearch} searchLabel={t.search} searchInputProps={{maxLength:200}} languageCode={languageCode} options={error||busy||!search.trim()?[]:rows} filterOptions={items=>items} loading={busy} feedback={error?<Alert severity="error">{(bankLedgerMessages[languageCode]||bankLedgerMessages.en).failed}</Alert>:busy?<CircularProgress size={22}/>:!search.trim()?t.searchHint:undefined} columns={[{key:'reference',label:t[type],value:row=>row.reference,render:row=><><Typography variant="body2">{row.reference}</Typography><Typography variant="caption" color="text.secondary">{row.payee}</Typography></>},{key:'amount',label:t.total,align:'right',width:130,value:row=>formatLedgerMoney(row.amount,currencyCode)},{key:'remaining',label:t.remaining,align:'right',width:130,value:row=>formatLedgerMoney(row.remaining,currencyCode)}]} onSelect={row=>{onChange(row);setOpen(false);}}/></>;
}
