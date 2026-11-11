import React from 'react';
import {Typography} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import {ledgerFlowText} from '../constants/ledgerFlow';
import {changeApprovalText} from '../constants/changeApprovals';
import {ledgerFlowEndpoints,selectLedgerFlowEndpoint} from '../utils/ledgerFlow.mjs';
export default function LedgerFlowField({side,row,account,accounts=[],options,languageCode,disabled,onChange}){
 const t=ledgerFlowText[languageCode]||ledgerFlowText.en,c=changeApprovalText[languageCode]||changeApprovalText.en;
 if(row.evidenceType==='ADJUSTMENT')return side!==(row.direction==='OUT'?'from':'to')?<Typography variant="body2">—</Typography>:<ExpenseLookupField hideLabel required label={t.ownAccount} languageCode={languageCode} options={accounts} value={account||null} disabled={disabled} getOptionLabel={a=>[a.displayName||a.bankName,a.currencyCode].filter(Boolean).join(' / ')} columns={[{key:'name',label:t.ownAccount,value:a=>a.displayName||a.bankName}]} onChange={a=>onChange({accountId:a?.id||'',...(account?.currencyCode!==a?.currencyCode?{amount:''}:{})})}/>;
 const flow=ledgerFlowEndpoints(row,account),opposite=flow[side==='from'?'to':'from'];
 const own=accounts.map(a=>({kind:'ACCOUNT',id:a.entityAccountId||String(a.id).replace(/^entity:/,''),code:a.accountNumber||'',name:a.displayName||[a.bankName,a.accountNumber].filter(Boolean).join(' / '),currencyCode:a.currencyCode}));
 const choices=[...own,...options.filter(p=>p.kind!=='ACCOUNT')].filter(p=>!opposite||!(p.kind===opposite.kind&&p.id===opposite.id)&&(opposite.kind==='ACCOUNT'||p.kind==='ACCOUNT'));
 const value=flow[side],current=choices.find(p=>p.kind===value?.kind&&p.id===value?.id&&(!value?.currencyCode||p.kind!=='ACCOUNT'||p.currencyCode===value.currencyCode))||value;
 const name=p=>p?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||p?.name||'';
 return <ExpenseLookupField hideLabel required label={t[side]} languageCode={languageCode} options={choices} value={current} disabled={disabled} getOptionKey={p=>p.kind+':'+p.id+(p.kind==='ACCOUNT'?':'+p.currencyCode:'')} getOptionLabel={p=>[p.code||p.employeeNo,name(p),p.kind==='ACCOUNT'?p.currencyCode:null].filter(Boolean).join(' / ')} getCode={p=>p.code||p.employeeNo||name(p)} columns={[{key:'name',label:c.party,value:name},{key:'currency',label:'',value:p=>p.currencyCode},{key:'kind',label:'',value:p=>p.kind==='ACCOUNT'?t.ownAccount:c[p.kind]}]} onChange={value=>{const patch=selectLedgerFlowEndpoint(row,accounts,side,value?{kind:value.kind,id:value.id,name:name(value),code:value.code||value.employeeNo||'',...(value.kind==='ACCOUNT'?{currencyCode:value.currencyCode}:{})}:null);if(patch)onChange(patch);}}/>;
}
