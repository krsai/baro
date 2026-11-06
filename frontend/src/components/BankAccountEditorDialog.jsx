import React,{useEffect,useState} from 'react';
import {Alert,Button,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,TextField} from '@mui/material';
import {ENTITY_TEXT} from '../constants/entityProfile';
export const bankAccountEditorText={
 ko:{kind:'구분',BANK:'은행',CASH:'현금',name:'계좌명',cash:'현금 계정에는 은행·계좌번호·예금주를 입력하지 않습니다.',required:'통화와 필수 계좌 정보를 입력해 주세요.'},
 en:{kind:'Type',BANK:'Bank',CASH:'Cash',name:'Account name',cash:'Cash accounts do not have bank, account number or account holder fields.',required:'Select a currency and enter the required account details.'},
 vi:{kind:'Loại',BANK:'Ngân hàng',CASH:'Tiền mặt',name:'Tên tài khoản',cash:'Quỹ tiền mặt không có ngân hàng, số tài khoản hoặc chủ tài khoản.',required:'Chọn tiền tệ và nhập thông tin tài khoản bắt buộc.'}
};
export const validBankAccountDraft=(value,currencyKey='currencyId')=>Boolean(value?.[currencyKey]&&(value.accountKind==='CASH'?value.displayName?.trim():['bankName','accountNumber','accountHolder'].every(key=>value[key]?.trim())));
export default function BankAccountEditorDialog({open,title,value,onChange,onSave,onClose,currencies=[],currencyKey='currencyId',allowCash=true,showName=true,busy=false,disabled=false,error,languageCode='ko',maxLengths={bankName:120,accountNumber:100,accountHolder:160},errorAction}){
 const labels=ENTITY_TEXT[languageCode]||ENTITY_TEXT.en,t=bankAccountEditorText[languageCode]||bankAccountEditorText.en,[invalid,setInvalid]=useState(false),locked=busy||disabled;
 useEffect(()=>setInvalid(false),[open]);
 const change=patch=>{setInvalid(false);onChange({...value,...patch});};
 const submit=()=>{if(!validBankAccountDraft(value,currencyKey)){setInvalid(true);return;}onSave(value);};
 return <Dialog open={open} onClose={busy?undefined:onClose} scroll="paper" fullWidth maxWidth="sm"><DialogTitle>{title}</DialogTitle>
  {(error||invalid)&&<Alert severity="error" sx={{mx:3,mb:1}} action={errorAction}>{error||t.required}</Alert>}
  <DialogContent dividers><Stack spacing={2} sx={{pt:1}}>
   {allowCash&&<TextField select label={t.kind} value={value?.accountKind||'BANK'} disabled={locked} onChange={e=>change({accountKind:e.target.value})}>{['BANK','CASH'].map(kind=><MenuItem key={kind} value={kind}>{t[kind]}</MenuItem>)}</TextField>}
   {showName&&<TextField label={t.name} required={value?.accountKind==='CASH'} value={value?.displayName||''} disabled={locked} inputProps={{maxLength:160}} onChange={e=>change({displayName:e.target.value})}/>}
   <TextField required select label={labels.currency} SelectProps={{'aria-label':labels.currency}} value={value?.[currencyKey]||''} disabled={locked} onChange={e=>change({[currencyKey]:e.target.value})}>{currencies.map(row=><MenuItem key={row.value} value={row.value}>{row.label}</MenuItem>)}</TextField>
   {value?.accountKind!=='CASH'&&['bankName','accountNumber','accountHolder'].map((key,index)=><TextField key={key} required disabled={locked} label={labels[['bank','number','holder'][index]]} value={value?.[key]||''} inputProps={{maxLength:maxLengths[key]}} onChange={e=>change({[key]:e.target.value})}/>)}
   {value?.accountKind==='CASH'&&<Alert severity="info">{t.cash}</Alert>}
  </Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>{labels.cancel}</Button><Button variant="contained" disabled={locked} onClick={submit}>{labels.save}</Button></DialogActions>
 </Dialog>;
}
