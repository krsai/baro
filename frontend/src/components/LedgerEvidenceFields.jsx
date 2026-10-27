import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,Stack,TextField} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {ledgerEvidenceText} from '../constants/ledgerEvidence';
export default function LedgerEvidenceFields({form,change,disabled,orgId,currencyCode,languageCode,detailsOnly=false}){
 const t=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en;
 const [search,setSearch]=useState(''),[items,setItems]=useState([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const generation=useRef(0);useEffect(()=>{generation.current++;setItems([]);setError('');setLoading(false);return()=>{generation.current++;};},[orgId,currencyCode,form.evidenceType]);
 const find=async()=>{const token=++generation.current;setLoading(true);setError('');try{const result=await requestJSON(`/bank-ledger/evidence/expenses${buildQueryString({orgId,currencyCode,search})}`,{skipCache:true});if(token===generation.current)setItems(result.items);}catch{if(token===generation.current){setItems([]);setError(t.errors);}}finally{if(token===generation.current)setLoading(false);}};
 const rows=form.expenseItems||[],edit=(index,patch)=>change('expenseItems',rows.map((row,i)=>i===index?{...row,...patch}:row));
 const switchType=type=>{generation.current++;change('evidenceType',type);change('evidenceNumber','');change('expenseItems',[]);change('bankFee','0');if(type==='INVOICE')change('direction','IN');if(type==='EXPENSE')change('direction','OUT');};
 return <Stack spacing={2}>
  {!detailsOnly&&<TextField select label={t.type} value={form.evidenceType} disabled={disabled} onChange={e=>switchType(e.target.value)}>{['FILE','INVOICE','EXPENSE','ADJUSTMENT'].map(type=><MenuItem key={type} value={type}>{t[type]}</MenuItem>)}</TextField>}
  {!detailsOnly&&['FILE','INVOICE'].includes(form.evidenceType)&&<TextField required label={form.evidenceType==='FILE'?t.reference:t.invoice} value={form.evidenceNumber} disabled={disabled} inputProps={{maxLength:form.evidenceType==='FILE'?500:200}} onChange={e=>change('evidenceNumber',e.target.value)}/>}
  {form.evidenceType==='INVOICE'&&<Alert severity="info">{t.hint}</Alert>}
  {form.evidenceType==='EXPENSE'&&<><Alert severity="info">{t.expenseHint}</Alert><Stack direction="row" spacing={1}><TextField fullWidth label={t.request} value={search} disabled={disabled} onChange={e=>{generation.current++;setLoading(false);setSearch(e.target.value);setItems([]);}}/><Button disabled={disabled||loading||!search.trim()} onClick={find}>{t.find}</Button></Stack>
   {items.map(item=><Button key={item.id} disabled={disabled||rows.some(row=>row.itemId===item.id)||!Number(item.remaining)} onClick={()=>change('expenseItems',[...rows,{itemId:item.id,amount:'',label:`${search} #${item.line} · ${item.description} (${item.remaining} ${currencyCode})`}])}>{t.add}: #{item.line} {item.description} — {item.remaining} {currencyCode}</Button>)}
   {rows.map((row,index)=><Stack key={row.itemId} spacing={1}><TextField label={t.item} value={row.label} InputProps={{readOnly:true}}/><Stack direction="row" spacing={1}><TextField fullWidth required label={t.allocated} value={row.amount} disabled={disabled} inputProps={{inputMode:'decimal'}} onChange={e=>edit(index,{amount:e.target.value})}/><Button disabled={disabled} onClick={()=>change('expenseItems',rows.filter((_,i)=>i!==index))}>{t.remove}</Button></Stack></Stack>)}
   {error&&<Alert severity="error">{error}</Alert>}
  </>}
  {!detailsOnly&&['INVOICE','EXPENSE'].includes(form.evidenceType)&&<TextField required label={t.fee} value={form.bankFee} disabled={disabled} inputProps={{inputMode:'decimal'}} onChange={e=>change('bankFee',e.target.value)}/>}
 </Stack>;
}
