import React from 'react';
import {Typography} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import {ledgerFlowText} from '../constants/ledgerFlow';
import {changeApprovalText} from '../constants/changeApprovals';
import {ledgerFlowEndpoints,selectLedgerEndpoint} from '../utils/ledgerFlow.mjs';
export default function LedgerFlowField({side,row,account,options,languageCode,disabled,onChange}){
 const t=ledgerFlowText[languageCode]||ledgerFlowText.en,c=changeApprovalText[languageCode]||changeApprovalText.en;
 if(row.evidenceType==='ADJUSTMENT')return <Typography variant="body2">—</Typography>;
 const flow=ledgerFlowEndpoints(row,account),own=ledgerFlowEndpoints({...row,direction:'OUT'},account).from;
 const choices=[...(own?[own]:[]),...options.filter(p=>p.kind!=='ACCOUNT'||p.id!==own?.id)];
 const value=flow[side],current=choices.find(p=>p.kind===value?.kind&&p.id===value?.id&&(!value?.currencyCode||p.kind!=='ACCOUNT'||p.currencyCode===value.currencyCode))||value;
 const name=p=>p?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||p?.name||'';
 return <ExpenseLookupField hideLabel required label={t[side]} languageCode={languageCode} options={choices} value={current} disabled={disabled} getOptionKey={p=>p.kind+':'+p.id+(p.kind==='ACCOUNT'?':'+p.currencyCode:'')} getOptionLabel={p=>[p.code||p.employeeNo,name(p),p.kind==='ACCOUNT'?p.currencyCode:null].filter(Boolean).join(' / ')} getCode={p=>p.code||p.employeeNo||name(p)} columns={[{key:'name',label:c.party,value:name},{key:'currency',label:'',value:p=>p.currencyCode},{key:'kind',label:'',value:p=>p.kind==='ACCOUNT'?t.ownAccount:c[p.kind]}]} onChange={value=>onChange(selectLedgerEndpoint(row,account,side,value?{kind:value.kind,id:value.id,name:name(value),code:value.code||value.employeeNo||'',...(value.kind==='ACCOUNT'?{currencyCode:value.currencyCode}:{})}:null))}/>;
}
