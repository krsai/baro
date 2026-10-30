import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import BusinessPartnerDialog,{getBusinessPartnerTypeLabel} from './BusinessPartnerDialog';
import {expenseHeaderActions} from '../constants/expenseHeaderActions';
import {EXPENSE_LOOKUP_TEXT} from '../constants/expenseLookup';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {normalizeLookupText} from '../utils/expenseLookup.mjs';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import StatusLabel from './StatusLabel';
import {ENTITY_TEXT} from '../constants/entityProfile';
import {INDUSTRY_TREE_TEXT} from '../constants/industryHierarchy';
import {serviceName} from './OutsourcingServiceDialog';

const DETAIL_TEXT={
 ko:{person:'담당자',phone:'전화',cash:'현금',loading:'계좌 정보를 불러오는 중입니다.'},
 en:{person:'Contact person',phone:'Phone',cash:'Cash',loading:'Loading account information.'},
 vi:{person:'Người liên hệ',phone:'Điện thoại',cash:'Tiền mặt',loading:'Đang tải thông tin tài khoản.'},
};
const InformationRows=({rows})=><Box component="dl" sx={{m:0,display:'grid',gridTemplateColumns:'minmax(80px, .8fr) minmax(0, 1.5fr)',columnGap:1,rowGap:.5}}>{rows.map(([label,value])=><React.Fragment key={label}><Typography component="dt" variant="caption" color="text.secondary" sx={{pt:.25}}>{label}</Typography><Typography component="dd" variant="body2" sx={{m:0,overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums',userSelect:'text'}}>{value||'—'}</Typography></React.Fragment>)}</Box>;

function PayeeDetails({draft,accounts,busy,error,languageCode,onRetry,onManage,t}){
 const labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,detail=DETAIL_TEXT[languageCode]||DETAIL_TEXT.en,industry=INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en;
 return <Paper variant="outlined" data-testid="payee-details" sx={{minWidth:0,display:'flex',flexDirection:'column',maxHeight:{sm:360},overflow:'hidden'}}>
  <Box sx={{p:1.5,overflowY:'auto',minHeight:0}}><Stack spacing={1.25} divider={<Box sx={{borderBottom:1,borderColor:'divider'}}/>}>
   <Stack spacing={.75}>
    <Typography variant="subtitle2" fontWeight={700} color={draft?'text.primary':'text.secondary'} sx={{overflowWrap:'anywhere'}}>{draft?.name||t.payee}</Typography>
    {draft&&<Box><StatusLabel label={getBusinessPartnerTypeLabel(draft.type,languageCode)} tone="blue"/></Box>}
    <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={.5}><Typography variant="caption" color="text.secondary">{industry.industry}</Typography>{draft?.serviceTypes?.length?draft.serviceTypes.map(row=><StatusLabel key={row.id} label={serviceName(row.systemDefault||row,languageCode)||row.code||'—'} tone="gray"/>):<Typography variant="body2" color="text.secondary">—</Typography>}</Stack>
    <InformationRows rows={[[labels.businessNumber,draft?.businessNumber]]}/>
   </Stack>
   <Stack spacing={.75}><Typography variant="subtitle2">{labels.contact}</Typography><InformationRows rows={[[detail.person,draft?.contactName],[detail.phone,draft?.contactPhone],[labels.email,draft?.email],[labels.address,draft?.address]]}/></Stack>
   <Stack spacing={.75} data-testid="payee-accounts">
    <Typography variant="subtitle2">{labels.banks}{draft&&!busy&&!error&&` · ${accounts.length}`}</Typography>
    {!draft?<InformationRows rows={[[labels.bank,null],[labels.number,null],[labels.holder,null]]}/>:busy?<Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={16}/><Typography variant="body2" color="text.secondary">{detail.loading}</Typography></Stack>:error?<Alert severity="error" action={<Button onClick={onRetry}>{t.retry}</Button>}>{t.error}</Alert>:!accounts.length?<Alert severity="warning">{t.noAccount}</Alert>:accounts.map(account=>{
     const cash=account.accountKind==='CASH',currency=account.currency?.code||account.currencyCode||(typeof account.currency==='string'?account.currency:'')||'—';
     return <Box key={account.id} data-testid="payee-account" sx={{p:1,border:1,borderColor:'divider',borderRadius:1,bgcolor:'background.default'}}>
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between" sx={{mb:1}}><Box sx={{minWidth:0}}><Typography variant="body2" fontWeight={600} sx={{overflowWrap:'anywhere'}}>{cash?account.displayName||detail.cash:account.bankName||labels.bank}</Typography>{!cash&&account.displayName&&account.displayName!==account.bankName&&<Typography variant="caption" color="text.secondary">{account.displayName}</Typography>}</Box><StatusLabel label={currency} tone="blue"/></Stack>
      {cash?<StatusLabel label={detail.cash} tone="gray"/>:<InformationRows rows={[[labels.number,account.accountNumber],[labels.holder,account.accountHolder]]}/>}
     </Box>;
    })}
   </Stack>
  </Stack></Box>
  <Box sx={{p:1,borderTop:1,borderColor:'divider'}}><Button size="small" variant="outlined" fullWidth disabled={!draft||busy} onClick={onManage}>{t.information}</Button></Box>
 </Paper>;
}

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
  <Button variant="outlined" disableElevation size="small" startIcon={<SearchOutlined/>} title={value?.name||t.choosePayee} disabled={disabled} onClick={()=>{setDraftId(value?.id||null);setQuery('');setOpen(true);}} aria-label={t.choosePayee} data-testid="expense-payee-button" sx={{width:'100%',height:36,minWidth:0,justifyContent:'flex-start',color:'text.primary',borderColor:'divider',bgcolor:'background.paper',textTransform:'none',overflow:'hidden','& .MuiButton-startIcon':{color:'text.secondary'},'&:hover':{borderColor:'text.secondary',bgcolor:'action.hover'}}}><Typography variant="button" noWrap sx={{minWidth:0}}>{value?.name||t.choosePayee}</Typography></Button>
  <Dialog open={open} onClose={()=>setOpen(false)} maxWidth="md" fullWidth slotProps={{paper:{sx:{maxWidth:800}}}} aria-labelledby="expense-payee-title">
   <DialogTitle id="expense-payee-title" sx={{px:2,py:1.5}}>{t.choosePayee}</DialogTitle>
   <DialogContent dividers sx={{p:2}}><Stack spacing={1.5}>
    <TextField autoFocus fullWidth size="small" label={t.search} value={query} onChange={event=>setQuery(event.target.value)}/>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(0,1fr) minmax(0,1fr)'},gap:1.5}}>
     <TableContainer sx={{maxHeight:360}}><Table size="small" stickyHeader sx={{'& td, & th':{px:1.25,py:.75},'& td:last-child, & th:last-child':{width:64,whiteSpace:'nowrap'},'& td button':{minWidth:40,px:.75,py:.25}}}><TableHead><TableRow><TableCell>{t.payee}</TableCell><TableCell>{lookup.select}</TableCell></TableRow></TableHead><TableBody>
      {rows.map(row=><TableRow key={row.id} hover selected={row.id===draftId}><TableCell><Typography variant="body2">{row.name}</Typography><Typography variant="caption" color="text.secondary">{getBusinessPartnerTypeLabel(row.type,languageCode)}</Typography></TableCell><TableCell><Button disabled={lockSelection&&row.id!==value?.id} onClick={()=>setDraftId(row.id)}>{lookup.select}</Button></TableCell></TableRow>)}
      {!rows.length&&<TableRow><TableCell colSpan={2}>{lookup.empty}</TableCell></TableRow>}
     </TableBody></Table></TableContainer>
     <PayeeDetails draft={draft} accounts={accounts} busy={busy} error={error} languageCode={languageCode} t={t} onRetry={()=>setReload(n=>n+1)} onManage={()=>setProfileOpen(true)}/>
    </Box>
   </Stack></DialogContent>
   <DialogActions sx={{px:2,py:1.25}}><Button onClick={()=>setOpen(false)}>{t.cancel}</Button><Button variant="contained" disabled={!draft||loadedId!==draft.id||busy||error||!accounts.length} onClick={()=>{onChange(draft,accounts);setOpen(false);}}>{t.apply}</Button></DialogActions>
  </Dialog>
  {draft&&<BusinessPartnerDialog key={`${orgId}:${draft.id}`} open={profileOpen} onClose={()=>setProfileOpen(false)} partner={draft} activeOrgId={orgId} languageCode={languageCode} lockType title={t.information}
    onSaved={saved=>{if(scope.current===orgId)onSaved(saved);}}
    onAccountsChange={rows=>{if(scope.current===orgId){setAccounts(rows);setLoadedId(draft.id);}}}/>}
 </>;
}
