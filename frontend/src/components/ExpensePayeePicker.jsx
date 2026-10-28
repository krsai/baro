import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import BusinessPartnerDialog,{getBusinessPartnerTypeLabel} from './BusinessPartnerDialog';
import {expenseHeaderActions} from '../constants/expenseHeaderActions';
import {EXPENSE_LOOKUP_TEXT} from '../constants/expenseLookup';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {normalizeLookupText} from '../utils/expenseLookup.mjs';

export default function ExpensePayeePicker({orgId,languageCode,options,value,disabled,lockSelection,onChange,onSaved}){
 const t=expenseHeaderActions[languageCode]||expenseHeaderActions.en,lookup=EXPENSE_LOOKUP_TEXT[languageCode]||EXPENSE_LOOKUP_TEXT.en;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[draftId,setDraftId]=useState(null),[profileOpen,setProfileOpen]=useState(false),[accounts,setAccounts]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
 const scope=useRef(orgId);scope.current=orgId;
 const draft=options.find(row=>row.id===draftId);
 const [loadedId,setLoadedId]=useState(null);
 useEffect(()=>{setOpen(false);setProfileOpen(false);setDraftId(null);setAccounts([]);},[orgId]);
 useEffect(()=>{if(!open||!draftId)return;let alive=true;setBusy(true);setError(false);setAccounts([]);
  setLoadedId(null);
  requestJSON(`/entities/${draftId}/bank-accounts${buildQueryString({orgId})}`,{skipCache:true}).then(result=>{if(alive){setAccounts(result.accounts||[]);setLoadedId(draftId);}}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[open,draftId,orgId,reload]);
 const rows=options.filter(row=>row.isActive!==false&&normalizeLookupText([row.name,row.nameKo,row.nameVi,row.contactName,row.contactPhone].filter(Boolean).join(' ')).includes(normalizeLookupText(query)));
 return <>
  <Button variant="outlined" disabled={disabled} onClick={()=>{setDraftId(value?.id||null);setQuery('');setOpen(true);}} aria-label={t.choosePayee} data-testid="expense-payee-button" sx={{justifyContent:'flex-start',minWidth:0,minHeight:36,textTransform:'none',overflow:'hidden'}}><Typography noWrap>{value?`${t.payee} · ${value.name}`:t.choosePayee}</Typography></Button>
  <Dialog open={open} onClose={()=>setOpen(false)} maxWidth="md" fullWidth aria-labelledby="expense-payee-title">
   <DialogTitle id="expense-payee-title">{t.choosePayee}</DialogTitle>
   <DialogContent dividers><Stack spacing={2}>
    <TextField autoFocus fullWidth size="small" label={t.search} value={query} onChange={event=>setQuery(event.target.value)}/>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'minmax(0,1.2fr) minmax(0,1fr)'},gap:2}}>
     <TableContainer sx={{maxHeight:380}}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>{t.payee}</TableCell><TableCell>{lookup.select}</TableCell></TableRow></TableHead><TableBody>
      {rows.map(row=><TableRow key={row.id} hover selected={row.id===draftId}><TableCell><Typography variant="body2">{row.name}</Typography><Typography variant="caption" color="text.secondary">{getBusinessPartnerTypeLabel(row.type,languageCode)}</Typography></TableCell><TableCell><Button disabled={lockSelection&&row.id!==value?.id} onClick={()=>setDraftId(row.id)}>{lookup.select}</Button></TableCell></TableRow>)}
      {!rows.length&&<TableRow><TableCell colSpan={2}>{lookup.empty}</TableCell></TableRow>}
     </TableBody></Table></TableContainer>
     {draft&&<Paper variant="outlined" sx={{p:2}}><Stack spacing={1.5}>
      <Typography variant="subtitle1">{draft.name}</Typography>
      <Typography variant="body2" color="text.secondary">{[draft.businessNumber,draft.contactName,draft.contactPhone,draft.email,draft.address].filter(Boolean).join(' · ')}</Typography>
      {error?<Alert severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.error}</Alert>:!busy&&!accounts.length?<Alert severity="warning">{t.noAccount}</Alert>:null}
      {accounts.map(account=><Typography key={account.id} variant="body2">{[account.currency?.code,account.displayName,account.bankName,account.accountNumber,account.accountHolder].filter(Boolean).join(' · ')}</Typography>)}
      <Button variant="outlined" disabled={busy} onClick={()=>setProfileOpen(true)}>{t.information}</Button>
     </Stack></Paper>}
    </Box>
   </Stack></DialogContent>
   <DialogActions><Button onClick={()=>setOpen(false)}>{t.cancel}</Button><Button variant="contained" disabled={!draft||loadedId!==draft.id||busy||error||!accounts.length} onClick={()=>{onChange(draft,accounts);setOpen(false);}}>{t.apply}</Button></DialogActions>
  </Dialog>
  {draft&&<BusinessPartnerDialog key={`${orgId}:${draft.id}`} open={profileOpen} onClose={()=>setProfileOpen(false)} partner={draft} activeOrgId={orgId} languageCode={languageCode} lockType title={t.information}
    onSaved={saved=>{if(scope.current===orgId)onSaved(saved);}}
    onAccountsChange={rows=>{if(scope.current===orgId){setAccounts(rows);setLoadedId(draft.id);}}}/>}
 </>;
}
