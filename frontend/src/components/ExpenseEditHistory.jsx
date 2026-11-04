import React,{useEffect,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import {expenseHistoryText} from '../constants/expenseHistory';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {expenseTotalsByCurrency} from '../utils/expenseRequest.mjs';
import ExpenseRequestView from './ExpenseRequestView';

export default function ExpenseEditHistory({orgId,requestId,version,languageCode,disabled}){
 const t=expenseHistoryText[languageCode]||expenseHistoryText.en;
 const [open,setOpen]=useState(false),[rows,setRows]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(false),[cursor,setCursor]=useState(null),[more,setMore]=useState(false),[reload,setReload]=useState(0),[selected,setSelected]=useState(null);
 useEffect(()=>{setOpen(false);setRows([]);setCursor(null);setSelected(null);setError(false);},[orgId,requestId,version]);
 useEffect(()=>{
  if(!open||!requestId)return;
  let live=true;setLoading(true);setError(false);
  requestJSON(`/expense-request-editor/request/${encodeURIComponent(requestId)}/history${buildQueryString({orgId,...(cursor?{beforeVersion:cursor}:{})})}`,{skipCache:true})
   .then(value=>{if(live){setRows(previous=>cursor?[...previous,...value]:value);setMore(value.length===50);}})
   .catch(()=>{if(live)setError(true);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[open,orgId,requestId,version,cursor,reload]);
 const show=snapshot=>{
  const items=snapshot.costs||snapshot.document?.items||[];
  setSelected({...snapshot.document,items,currencyTotals:expenseTotalsByCurrency(items)});
 };
 return <>
  <Button disabled={disabled||!requestId} onClick={()=>{setRows([]);setCursor(null);setSelected(null);setOpen(true);}}>{t.title}</Button>
  <Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md">
   <DialogTitle>{t.title}</DialogTitle>
   <DialogContent dividers><Stack spacing={2}>
    {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.error}</Alert>}
    {!loading&&!error&&!rows.length&&<Typography>{t.empty}</Typography>}
    {rows.map(row=><Stack key={row.id||row.version} spacing={1} sx={{pb:2,borderBottom:1,borderColor:'divider'}}>
     <Typography variant="subtitle2">{t.version} {row.version} · {row.action==='CREATE'?t.created:t.updated}</Typography>
     <Typography variant="body2">{t.actor}: {row.actor?.name||'—'} · {new Date(row.createdAt).toLocaleString(languageCode)}</Typography>
     <Stack direction="row" spacing={1}>
      {row.beforeSnapshot?.document&&<Button onClick={()=>show(row.beforeSnapshot)}>{t.before}</Button>}
      {row.afterSnapshot?.document&&<Button onClick={()=>show(row.afterSnapshot)}>{t.after}</Button>}
     </Stack>
    </Stack>)}
    {loading&&<CircularProgress size={24}/>}
    {more&&!error&&<Button disabled={loading} onClick={()=>setCursor(rows.at(-1).version)}>{t.more}</Button>}
   </Stack></DialogContent>
   <DialogActions><Button onClick={()=>setOpen(false)}>{t.close}</Button></DialogActions>
  </Dialog>
  <ExpenseRequestView document={selected} languageCode={languageCode} onClose={()=>setSelected(null)}/>
 </>;
}
