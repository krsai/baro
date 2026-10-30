import React,{useEffect,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {ledgerEntryText} from '../constants/ledgerEntry';
import {bankLedgerMessages} from '../constants/bankLedgerMessages';
import {formatLedgerMoney} from '../utils/bankLedgerMoney.mjs';
export default function LedgerDocumentPicker({orgId,currencyCode,type,value,disabled,languageCode,onChange}){
 const t=ledgerEntryText[languageCode]||ledgerEntryText.en;
 const [open,setOpen]=useState(false),[search,setSearch]=useState(''),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 useEffect(()=>{setOpen(false);setRows([]);},[orgId,currencyCode,type]);
 useEffect(()=>{setRows([]);setError(false);if(!open||!search.trim()){setBusy(false);return;}let alive=true;const controller=new AbortController();setBusy(true);
  const timer=setTimeout(()=>requestJSON('/bank-ledger/evidence/search'+buildQueryString({orgId,currencyCode,type,search:search.trim()}),{skipCache:true,signal:controller.signal}).then(result=>{if(alive)setRows(result.documents);}).catch(e=>{if(alive&&e.name!=='AbortError')setError(true);}).finally(()=>{if(alive)setBusy(false);}),250);
  return()=>{alive=false;clearTimeout(timer);controller.abort();};
 },[open,search,orgId,currencyCode,type]);
 return <><Button variant="outlined" size="small" startIcon={<SearchOutlined/>} disabled={disabled||!currencyCode} title={value?.reference||t.link} onClick={()=>{setSearch('');setOpen(true);}} sx={{minWidth:0,maxWidth:'100%',justifyContent:'flex-start',color:'text.primary',borderColor:'divider','& .MuiButton-startIcon':{color:'text.secondary'}}}><Typography variant="body2" noWrap>{value?.reference||t.link}</Typography></Button>
 <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md"><DialogTitle>{t.link} · {t[type]}</DialogTitle><DialogContent dividers><Stack spacing={2}><TextField autoFocus fullWidth size="small" label={t.search} value={search} onChange={e=>setSearch(e.target.value)} inputProps={{maxLength:200}}/>{error?<Alert severity="error">{(bankLedgerMessages[languageCode]||bankLedgerMessages.en).failed}</Alert>:busy?<CircularProgress size={22}/>:!search.trim()?<Typography color="text.secondary">{t.searchHint}</Typography>:<TableContainer><Table size="small" sx={{minWidth:550}}><TableHead><TableRow>{[t[type],t.total,t.remaining,''].map((label,index)=><TableCell key={index} align={index===1||index===2?'right':'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.id} hover><TableCell><Typography variant="body2">{row.reference}</Typography><Typography variant="caption" color="text.secondary">{row.payee}</Typography></TableCell><TableCell align="right">{formatLedgerMoney(row.amount,currencyCode)}</TableCell><TableCell align="right">{formatLedgerMoney(row.remaining,currencyCode)}</TableCell><TableCell><Button onClick={()=>{onChange(row);setOpen(false);}}>{t.select}</Button></TableCell></TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={4}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer>}</Stack></DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>{({ko:'취소',en:'Cancel',vi:'Hủy'})[languageCode]||'Cancel'}</Button></DialogActions></Dialog></>;
}
