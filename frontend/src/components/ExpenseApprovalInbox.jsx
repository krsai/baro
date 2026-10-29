import React,{useEffect,useState} from 'react';
import {Alert,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {expenseApprovalActionsText} from '../constants/expenseApprovalActions';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export default function ExpenseApprovalInbox({orgId,languageCode,onOpenRequest}){
 const t=expenseApprovalActionsText[languageCode]||expenseApprovalActionsText.en;
 const [open,setOpen]=useState(false),[rows,setRows]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>subscribeWorkspaceDataChanged(detail=>{if(Number(detail.orgId)===Number(orgId)&&detail.topics?.includes('expense-approvals'))setReload(value=>value+1);}),[orgId]);
 useEffect(()=>{
  if(!open||!orgId)return;let alive=true;const controller=new AbortController();setRows([]);setLoading(true);setError(false);
  requestJSON('/expense-approval-inbox'+buildQueryString({orgId}),{skipCache:true,signal:controller.signal}).then(value=>{if(alive)setRows(value);}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;controller.abort();};
 },[open,orgId,reload]);
 useEffect(()=>setOpen(false),[orgId]);
 return <><Button variant="outlined" onClick={()=>setOpen(true)}>{t.inbox}</Button><Dialog open={open} onClose={()=>setOpen(false)} fullWidth maxWidth="md" aria-labelledby="expense-approval-inbox-title"><DialogTitle id="expense-approval-inbox-title">{t.inbox}</DialogTitle>
  <DialogContent dividers>{loading?<CircularProgress size={24}/>:error?<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.error}</Alert>:!rows.length?<Typography>{t.empty}</Typography>:<TableContainer><Table size="small"><TableHead><TableRow>{[t.number,t.date,t.payee,t.drafter,t.open].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.id} hover><TableCell>{row.managementNumber}</TableCell><TableCell>{row.requestDate}</TableCell><TableCell>{row.payee}</TableCell><TableCell>{row.drafter}</TableCell><TableCell><Button onClick={()=>{setOpen(false);onOpenRequest?.('request',String(row.id));}}>{t.open}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>}</DialogContent>
  <DialogActions><Button onClick={()=>setOpen(false)}>{t.close}</Button></DialogActions></Dialog></>;
}
