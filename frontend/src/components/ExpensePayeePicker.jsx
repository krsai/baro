import ReadOnlyField from './ReadOnlyField';
import BankAccountEditorDialog from './BankAccountEditorDialog';
import LookupInput from './LookupInput';
import LookupSearchDialog from './LookupSearchDialog';
import {partnerIndustryLabel} from '../utils/partnerIndustry.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,CircularProgress,Paper,Stack,Typography} from '@mui/material';
import BusinessPartnerDialog from './BusinessPartnerDialog';
import {expenseHeaderActions} from '../constants/expenseHeaderActions';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {normalizeLookupText} from '../utils/expenseLookup.mjs';
import SearchOutlined from '@mui/icons-material/SearchOutlined';
import StatusLabel from './StatusLabel';
import {ENTITY_TEXT} from '../constants/entityProfile';
import {INDUSTRY_TREE_TEXT} from '../constants/industryHierarchy';


const DETAIL_TEXT={
 ko:{person:'담당자',phone:'전화',cash:'현금',loading:'계좌 정보를 불러오는 중입니다.'},
 en:{person:'Contact person',phone:'Phone',cash:'Cash',loading:'Loading account information.'},
 vi:{person:'Người liên hệ',phone:'Điện thoại',cash:'Tiền mặt',loading:'Đang tải thông tin tài khoản.'},
};
const PAYEE_TEXT={ko:{employee:'직원',search:'지급 대상 코드·이름',save:'저장',currency:'통화'},en:{employee:'Employee',search:'Payee code or name',save:'Save',currency:'Currency'},vi:{employee:'Nhân viên',search:'Mã hoặc tên người nhận',save:'Lưu',currency:'Tiền tệ'}};
export const payeeAccountPath=payee=>payee?.employeeId?`/expense-payees/employees/${payee.employeeId}/bank-accounts`:`/entities/${payee?.id}/bank-accounts`;
const payeeTypeLabel=(payee,languageCode)=>payee.type==='EMPLOYEE'?(PAYEE_TEXT[languageCode]||PAYEE_TEXT.en).employee:(payee.serviceTypes?.map(row=>partnerIndustryLabel(row.systemDefault||row,languageCode)).filter(Boolean).join(', ')||'');
const InformationRows=({rows})=><Box component="dl" sx={{m:0,display:'grid',gridTemplateColumns:'minmax(80px, .8fr) minmax(0, 1.5fr)',columnGap:1,rowGap:.5}}>{rows.map(([label,value])=><React.Fragment key={label}><Typography component="dt" variant="caption" color="text.secondary" sx={{pt:.25}}>{label}</Typography><Typography component="dd" variant="body2" sx={{m:0,overflowWrap:'anywhere',fontVariantNumeric:'tabular-nums',userSelect:'text'}}>{value||'—'}</Typography></React.Fragment>)}</Box>;

export function PayeeDetails({draft,accounts=[],busy,error,languageCode,onRetry,onManage,t,showAccounts=true}){
 const employee=draft?.type==='EMPLOYEE'||Boolean(draft?.employeeId);
 const labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,detail=DETAIL_TEXT[languageCode]||DETAIL_TEXT.en,industry=INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en;
 return <Paper variant="outlined" data-testid="payee-details" sx={{minWidth:0,display:'flex',flexDirection:'column',maxHeight:{sm:360},overflow:'hidden'}}>
  <Box sx={{p:1.5,overflowY:'auto',minHeight:0}}><Stack spacing={1.25} divider={<Box sx={{borderBottom:1,borderColor:'divider'}}/>}>
   <Stack spacing={.75}>
    <Typography variant="subtitle2" fontWeight={700} color={draft?'text.primary':'text.secondary'} sx={{overflowWrap:'anywhere'}}>{draft?.name||t.payee}</Typography>
    {draft&&<Box><StatusLabel label={payeeTypeLabel(draft,languageCode)} tone="blue"/></Box>}
    {!employee&&<Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={.5}><Typography variant="caption" color="text.secondary">{industry.industry}</Typography>{draft?.serviceTypes?.length?draft.serviceTypes.map(row=><StatusLabel key={row.id} label={partnerIndustryLabel(row.systemDefault||row,languageCode)||row.code||'—'} tone="gray"/>):<Typography variant="body2" color="text.secondary">—</Typography>}</Stack>}
     {!employee&&<InformationRows rows={[[labels.businessNumber,draft?.businessNumber]]}/>}
   </Stack>
    <Stack spacing={.75}><Typography variant="subtitle2">{labels.contact}</Typography><InformationRows rows={employee?[[detail.phone,draft?.contactPhone],[labels.email,draft?.email]]:[[detail.person,draft?.contactName],[detail.phone,draft?.contactPhone],[labels.email,draft?.email],[labels.address,draft?.address]]}/></Stack>
   {showAccounts&&<Stack spacing={.75} data-testid="payee-accounts">
    <Typography variant="subtitle2">{labels.banks}{draft&&!busy&&!error&&` · ${accounts.length}`}</Typography>
    {!draft?<InformationRows rows={[[labels.bank,null],[labels.number,null],[labels.holder,null]]}/>:busy?<Stack direction="row" spacing={1} alignItems="center"><CircularProgress size={16}/><Typography variant="body2" color="text.secondary">{detail.loading}</Typography></Stack>:error?<Alert severity="error" action={<Button onClick={onRetry}>{t.retry}</Button>}>{t.error}</Alert>:!accounts.length?<Alert severity="warning">{t.noAccount}</Alert>:accounts.map(account=>{
     const cash=account.accountKind==='CASH',currency=account.currency?.code||account.currencyCode||(typeof account.currency==='string'?account.currency:'')||'—';
     return <Box key={account.id} data-testid="payee-account" sx={{p:1,border:1,borderColor:'divider',borderRadius:1,bgcolor:'background.default'}}>
      <Stack direction="row" spacing={1} alignItems="flex-start" justifyContent="space-between" sx={{mb:1}}><Box sx={{minWidth:0}}><Typography variant="body2" fontWeight={600} sx={{overflowWrap:'anywhere'}}>{cash?account.displayName||detail.cash:account.bankName||labels.bank}</Typography>{!cash&&account.displayName&&account.displayName!==account.bankName&&<Typography variant="caption" color="text.secondary">{account.displayName}</Typography>}</Box><StatusLabel label={currency} tone="blue"/></Stack>
      {cash?<StatusLabel label={detail.cash} tone="gray"/>:<InformationRows rows={[[labels.number,account.accountNumber],[labels.holder,account.accountHolder]]}/>}
     </Box>;
    })}
   </Stack>}
  </Stack></Box>
   {onManage&&<Box sx={{p:1,borderTop:1,borderColor:'divider'}}><Button size="small" variant="outlined" fullWidth disabled={!draft||busy} onClick={onManage}>{t.information}</Button></Box>}
 </Paper>;
}

export default function ExpensePayeePicker({orgId,languageCode,options,value,disabled,lockSelection,onChange,onSaved,...rootProps}){
 const t=expenseHeaderActions[languageCode]||expenseHeaderActions.en;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[draftId,setDraftId]=useState(null),[profileOpen,setProfileOpen]=useState(false),[accounts,setAccounts]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0),[confirming,setConfirming]=useState(false),[resetKey,setResetKey]=useState(0);
 const scope=useRef(orgId);scope.current=orgId;
 const draft=options.find(row=>row.id===draftId);
 const directRequest=useRef(0);
 const text=PAYEE_TEXT[languageCode]||PAYEE_TEXT.en;
 const display=payee=>[payee?.code,payee?.name].filter(Boolean).join(' · ');
 const chooseDirect=async selected=>{
  if(lockSelection&&selected.id!==value?.id)return;
  const key=++directRequest.current,company=orgId;
  setConfirming(true);
  try{const result=await requestJSON(`${payeeAccountPath(selected)}${buildQueryString({orgId})}`,{skipCache:true});
   if(key!==directRequest.current||scope.current!==company)return;
   if(!result.accounts?.length){openSearch(selected.code||selected.name||'',selected);return false;}
   onChange(selected,result.accounts);return true;
  }catch{if(key===directRequest.current&&scope.current===company)openSearch(selected.code||selected.name||'',selected);return false;}finally{if(key===directRequest.current&&scope.current===company)setConfirming(false);}
 };
 const openSearch=(searchInput='',candidate=value)=>{
  directRequest.current++;setResetKey(n=>n+1);setConfirming(false);setAccounts([]);setDraftId(candidate?.id||null);
  setQuery(value&&normalizeLookupText(searchInput)===normalizeLookupText(display(value))?value.code||value.name||'':searchInput.trim());setOpen(true);
 };
 useEffect(()=>{setOpen(false);setProfileOpen(false);setDraftId(null);setAccounts([]);directRequest.current++;return()=>{directRequest.current++;};},[orgId]);
 useEffect(()=>{if(!open||!draftId)return;let alive=true;setBusy(true);setError(false);setAccounts([]);

  requestJSON(`${payeeAccountPath(draft)}${buildQueryString({orgId})}`,{skipCache:true}).then(result=>{if(alive){setAccounts(result.accounts||[]);}}).catch(()=>{if(alive)setError(true);}).finally(()=>{if(alive)setBusy(false);});
  return()=>{alive=false;};
 },[open,draftId,orgId,reload]);
 return <>
  <Stack {...rootProps} direction="row" spacing={1} alignItems="center" sx={{minWidth:0}}>
   <Box sx={{width:104,flexShrink:0}}><LookupInput resetKey={resetKey} data-testid="expense-payee-button" label={t.payee} required options={options} value={value} disabled={disabled||lockSelection} getLabel={row=>row.code||''} getCode={row=>row.code||''} getValues={row=>[row.name,row.nameEn,row.nameKo,row.nameVi]} onEdit={()=>{directRequest.current++;setConfirming(false);}} onChange={selected=>{if(selected)chooseDirect(selected);else onChange(null,[]);}} onSearch={openSearch} searchLabel={t.choosePayee}/></Box>
   <ReadOnlyField data-testid="expense-payee-name" hideLabel label={({ko:'상호',en:'Company / employee',vi:'Tên đối tác'})[languageCode]||'Company / employee'} value={value?.name||''}/>
  </Stack>
  <LookupSearchDialog open={open} onClose={()=>{directRequest.current++;setResetKey(n=>n+1);setConfirming(false);setOpen(false);}} title={t.choosePayee} query={query} onQueryChange={next=>{directRequest.current++;setConfirming(false);setQuery(next);}} options={options.filter(row=>row.isActive!==false)} languageCode={languageCode} getSearchText={row=>[row.code,row.name,row.nameEn,row.nameKo,row.nameVi,row.contactName,row.contactPhone].filter(Boolean).join(' ')} columns={[{key:'code',label:({ko:'코드',en:'Code',vi:'Mã'})[languageCode]||'Code',width:'20%',value:row=>row.code||''},{key:'name',label:t.payee,width:'44%',value:row=>row.name},{key:'type',label:(INDUSTRY_TREE_TEXT[languageCode]||INDUSTRY_TREE_TEXT.en).industry,width:'22%',value:row=>payeeTypeLabel(row,languageCode)}]} highlightedKey={draftId} onHighlight={row=>{directRequest.current++;setConfirming(false);setDraftId(row.id);}} getOptionDisabled={row=>confirming||lockSelection&&row.id!==value?.id||row.id===draftId&&(busy||error||!accounts.length)} onSelect={async row=>{if(await chooseDirect(row))setOpen(false);}} details={<PayeeDetails draft={draft} accounts={accounts} busy={busy} error={error} languageCode={languageCode} t={t} onRetry={()=>setReload(n=>n+1)} onManage={()=>setProfileOpen(true)}/>}/>
  {draft?.employeeId?<EmployeePayeeBankDialog key={`${orgId}:${draft.id}`} open={profileOpen} onClose={()=>{if(scope.current===orgId)setProfileOpen(false);}} payee={draft} orgId={orgId} languageCode={languageCode} onSaved={account=>{if(scope.current!==orgId)return;setAccounts(current=>current.some(row=>row.id===account.id)?current:[...current,account]);}}/>:draft&&<BusinessPartnerDialog key={`${orgId}:${draft.id}`} open={profileOpen} onClose={()=>setProfileOpen(false)} partner={draft} activeOrgId={orgId} languageCode={languageCode} lockType title={t.information}
    onSaved={saved=>{if(scope.current===orgId)onSaved(saved);}}
    onAccountsChange={rows=>{if(scope.current===orgId){setAccounts(rows);}}}/>}
 </>;
}

function EmployeePayeeBankDialog({open,onClose,payee,orgId,languageCode,onSaved}){
 const t=expenseHeaderActions[languageCode]||expenseHeaderActions.en,labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,text=PAYEE_TEXT[languageCode]||PAYEE_TEXT.en;
 const [form,setForm]=useState({currencyCode:'VND',bankName:payee.bankName||'',accountNumber:payee.bankAccountNumber||'',accountHolder:payee.name||''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false);
 const save=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const saved=await requestJSON(`${payeeAccountPath(payee)}${buildQueryString({orgId})}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});onSaved(saved);onClose();}catch{setError(t.error);}finally{lock.current=false;setBusy(false);}};
 return <BankAccountEditorDialog open={open} title={payee.name} value={form} onChange={setForm} onSave={save} onClose={onClose} currencyKey="currencyCode" currencies={['VND','USD','KRW'].map(code=>({value:code,label:code}))} allowCash={false} showName={false} busy={busy} error={error} languageCode={languageCode} maxLengths={{bankName:200,accountNumber:200,accountHolder:200}}/>;
}
