import React,{useEffect,useRef,useState} from 'react';
import {Alert,Autocomplete,Box,Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,InputAdornment,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
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
const PAYEE_TEXT={ko:{employee:'직원',search:'지급 대상 코드·이름',save:'저장',currency:'통화'},en:{employee:'Employee',search:'Payee code or name',save:'Save',currency:'Currency'},vi:{employee:'Nhân viên',search:'Mã hoặc tên người nhận',save:'Lưu',currency:'Tiền tệ'}};
export const payeeAccountPath=payee=>payee?.employeeId?`/expense-payees/employees/${payee.employeeId}/bank-accounts`:`/entities/${payee?.id}/bank-accounts`;
const payeeTypeLabel=(payee,languageCode)=>payee.type==='EMPLOYEE'?(PAYEE_TEXT[languageCode]||PAYEE_TEXT.en).employee:getBusinessPartnerTypeLabel(payee.type,languageCode);
const InformationRows=({rows})=><Box component="dl" sx={{m:0,display:'grid',gridTemplateColumns:'minmax(80px, .8fr) minmax(0, 1.5fr)',columnGap:1,rowGap:.5}}>{rows.map(([label,value])=><React.Fragment key={label}><Typography component="dt" variant="caption" color="text.secondary" sx={{pt:.25}}>{label}</Typography><Typography component="dd" variant="body2" sx={{m:0,overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums',userSelect:'text'}}>{value||'—'}</Typography></React.Fragment>)}</Box>;

function PayeeDetails({draft,accounts,busy,error,languageCode,onRetry,onManage,t}){
 const labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,detail=DETAIL_TEXT[languageCode]||DETAIL_TEXT.en,industry=INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en;
 return <Paper variant="outlined" data-testid="payee-details" sx={{minWidth:0,display:'flex',flexDirection:'column',maxHeight:{sm:360},overflow:'hidden'}}>
  <Box sx={{p:1.5,overflowY:'auto',minHeight:0}}><Stack spacing={1.25} divider={<Box sx={{borderBottom:1,borderColor:'divider'}}/>}>
   <Stack spacing={.75}>
    <Typography variant="subtitle2" fontWeight={700} color={draft?'text.primary':'text.secondary'} sx={{overflowWrap:'anywhere'}}>{draft?.name||t.payee}</Typography>
    {draft&&<Box><StatusLabel label={payeeTypeLabel(draft,languageCode)} tone="blue"/></Box>}
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
 const [input,setInput]=useState(''),directRequest=useRef(0);
 const text=PAYEE_TEXT[languageCode]||PAYEE_TEXT.en;
 const display=payee=>[payee?.code,payee?.name].filter(Boolean).join(' · ');
 useEffect(()=>{if(value)setInput(display(value));},[value?.id,value?.code,value?.name]);
 const chooseDirect=async selected=>{
  if(lockSelection&&selected.id!==value?.id)return;
  const key=++directRequest.current,company=orgId;
  setInput(display(selected));onChange(null,[]);
  try{const result=await requestJSON(`${payeeAccountPath(selected)}${buildQueryString({orgId})}`,{skipCache:true});
   if(key!==directRequest.current||scope.current!==company)return;
   if(result.accounts?.length)onChange(selected,result.accounts);
   else{setDraftId(selected.id);setOpen(true);}
  }catch{if(key===directRequest.current&&scope.current===company){setDraftId(selected.id);setOpen(true);}}
 };
 useEffect(()=>{setOpen(false);setProfileOpen(false);setDraftId(null);setAccounts([]);setInput('');directRequest.current++;},[orgId]);
 useEffect(()=>{if(!open||!draftId)return;let alive=true;setBusy(true);setError(false);setAccounts([]);
  setLoadedId(null);
  requestJSON(`${payeeAccountPath(draft)}${buildQueryString({orgId})}`,{skipCache:true}).then(result=>{if(alive){setAccounts(result.accounts||[]);setLoadedId(draftId);}}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[open,draftId,orgId,reload]);
 const rows=options.filter(row=>row.isActive!==false&&normalizeLookupText([row.code,row.name,row.nameKo,row.nameVi,row.contactName,row.contactPhone].filter(Boolean).join(' ')).includes(normalizeLookupText(query)));
 return <>
  <Autocomplete data-testid="expense-payee-button" fullWidth size="small" freeSolo forcePopupIcon={false} disabled={disabled||lockSelection} options={options.filter(row=>row.isActive!==false)} value={value||null} inputValue={input} getOptionLabel={row=>typeof row==='string'?row:display(row)} isOptionEqualToValue={(a,b)=>a.id===b.id}
   filterOptions={(rows,{inputValue})=>rows.filter(row=>normalizeLookupText([row.code,row.name,row.nameKo,row.nameVi].join(' ')).includes(normalizeLookupText(inputValue)))}
   onInputChange={(_,next,reason)=>{if(!['input','clear'].includes(reason))return;setInput(next);const exact=options.filter(row=>row.isActive!==false&&row.code&&normalizeLookupText(row.code)===normalizeLookupText(next));if(exact.length===1)chooseDirect(exact[0]);else if(value){directRequest.current++;onChange(null,[]);}}}
   onChange={(_,selected)=>{if(selected&&typeof selected!=='string')chooseDirect(selected);else if(!selected){directRequest.current++;onChange(null,[]);}}}
   renderOption={(props,row)=>{const {key,...rest}=props;return <Box component="li" key={row.id} {...rest}><Stack spacing={.25}><Typography variant="body2">{display(row)}</Typography><Typography variant="caption" color="text.secondary">{payeeTypeLabel(row,languageCode)}</Typography></Stack></Box>;}}
   renderInput={params=><TextField {...params} label={t.payee} placeholder={text.search} InputProps={{...params.InputProps,endAdornment:<InputAdornment position="end"><IconButton size="small" disabled={disabled} aria-label={t.choosePayee} onClick={()=>{directRequest.current++;setLoadedId(null);setAccounts([]);setDraftId(value?.id||null);setQuery('');setOpen(true);}}><SearchOutlined fontSize="small"/></IconButton></InputAdornment>}}/>}/>
  <Dialog open={open} onClose={()=>setOpen(false)} maxWidth="md" fullWidth slotProps={{paper:{sx:{maxWidth:800}}}} aria-labelledby="expense-payee-title">
   <DialogTitle id="expense-payee-title" sx={{px:2,py:1.5}}>{t.choosePayee}</DialogTitle>
   <DialogContent dividers sx={{p:2}}><Stack spacing={1.5}>
    <TextField autoFocus fullWidth size="small" label={t.search} value={query} onChange={event=>setQuery(event.target.value)}/>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'minmax(0,1fr) minmax(0,1fr)'},gap:1.5}}>
     <TableContainer sx={{maxHeight:360}}><Table size="small" stickyHeader sx={{'& td, & th':{px:1.25,py:.75},'& td:last-child, & th:last-child':{width:64,whiteSpace:'nowrap'},'& td button':{minWidth:40,px:.75,py:.25}}}><TableHead><TableRow><TableCell>{t.payee}</TableCell><TableCell>{lookup.select}</TableCell></TableRow></TableHead><TableBody>
      {rows.map(row=><TableRow key={row.id} hover selected={row.id===draftId}><TableCell><Typography variant="body2">{display(row)}</Typography><Typography variant="caption" color="text.secondary">{payeeTypeLabel(row,languageCode)}</Typography></TableCell><TableCell><Button disabled={lockSelection&&row.id!==value?.id} onClick={()=>setDraftId(row.id)}>{lookup.select}</Button></TableCell></TableRow>)}
      {!rows.length&&<TableRow><TableCell colSpan={2}>{lookup.empty}</TableCell></TableRow>}
     </TableBody></Table></TableContainer>
     <PayeeDetails draft={draft} accounts={accounts} busy={busy} error={error} languageCode={languageCode} t={t} onRetry={()=>setReload(n=>n+1)} onManage={()=>setProfileOpen(true)}/>
    </Box>
   </Stack></DialogContent>
   <DialogActions sx={{px:2,py:1.25}}><Button onClick={()=>setOpen(false)}>{t.cancel}</Button><Button variant="contained" disabled={!draft||loadedId!==draft.id||busy||error||!accounts.length} onClick={()=>{directRequest.current++;onChange(draft,accounts);setOpen(false);}}>{t.apply}</Button></DialogActions>
  </Dialog>
  {draft?.employeeId?<EmployeePayeeBankDialog key={`${orgId}:${draft.id}`} open={profileOpen} onClose={()=>{if(scope.current===orgId)setProfileOpen(false);}} payee={draft} orgId={orgId} languageCode={languageCode} onSaved={account=>{if(scope.current!==orgId)return;setAccounts(current=>current.some(row=>row.id===account.id)?current:[...current,account]);setLoadedId(draft.id);}}/>:draft&&<BusinessPartnerDialog key={`${orgId}:${draft.id}`} open={profileOpen} onClose={()=>setProfileOpen(false)} partner={draft} activeOrgId={orgId} languageCode={languageCode} lockType title={t.information}
    onSaved={saved=>{if(scope.current===orgId)onSaved(saved);}}
    onAccountsChange={rows=>{if(scope.current===orgId){setAccounts(rows);setLoadedId(draft.id);}}}/>}
 </>;
}

function EmployeePayeeBankDialog({open,onClose,payee,orgId,languageCode,onSaved}){
 const t=expenseHeaderActions[languageCode]||expenseHeaderActions.en,labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,text=PAYEE_TEXT[languageCode]||PAYEE_TEXT.en;
 const [form,setForm]=useState({currencyCode:'VND',bankName:payee.bankName||'',accountNumber:payee.bankAccountNumber||'',accountHolder:payee.name||''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const save=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const saved=await requestJSON(`${payeeAccountPath(payee)}${buildQueryString({orgId})}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});onSaved(saved);onClose();}catch{setError(t.error);}finally{lock.current=false;setBusy(false);}};
 return <Dialog open={open} onClose={busy?undefined:onClose} fullWidth maxWidth="xs"><DialogTitle>{payee.name}</DialogTitle><DialogContent dividers><Stack spacing={2}>
  {error&&<Alert severity="error">{error}</Alert>}
  <TextField select label={text.currency} value={form.currencyCode} disabled={busy} onChange={event=>setForm(current=>({...current,currencyCode:event.target.value}))}>{['VND','USD','KRW'].map(code=><MenuItem key={code} value={code}>{code}</MenuItem>)}</TextField>
  {[[labels.bank,'bankName'],[labels.number,'accountNumber'],[labels.holder,'accountHolder']].map(([label,key])=><TextField key={key} required label={label} value={form[key]} disabled={busy} inputProps={{maxLength:200}} onChange={event=>setForm(current=>({...current,[key]:event.target.value}))}/>)}</Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>{t.cancel}</Button><Button variant="contained" disabled={busy||['bankName','accountNumber','accountHolder'].some(key=>!form[key].trim())} onClick={save}>{text.save}</Button></DialogActions></Dialog>;
}
