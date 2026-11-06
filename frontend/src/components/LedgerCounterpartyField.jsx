import ExpenseLookupField from './ExpenseLookupField';
import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import {changeApprovalText} from '../constants/changeApprovals';
export default function LedgerCounterpartyField({row,parent,options,account,languageCode,disabled,onChange}){
 const t=changeApprovalText[languageCode]||changeApprovalText.en;
 if(row.entryKind!=='BANK')return <Typography variant="caption">{parent?.document?.payee||parent?.counterparty?.name||'—'}</Typography>;
 if(row.evidenceType==='ADJUSTMENT')return <Typography variant="body2">—</Typography>;
 const choices=options.filter(p=>p.kind!=='ACCOUNT'||p.id!==account?.entityAccountId&&'entity:'+p.id!==account?.id);
 const current=choices.find(p=>p.kind===row.counterparty?.kind&&p.id===row.counterparty?.id)||row.counterparty||null;
 const name=p=>p?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||p?.name||'';
 return <Stack direction="row" spacing={1} alignItems="center" sx={{minWidth:0}}><Box sx={{width:92,flexShrink:0}}><ExpenseLookupField hideLabel required label={t.party} options={choices} value={current} disabled={disabled} languageCode={languageCode} getOptionKey={p=>p.kind+':'+p.id} getOptionLabel={p=>p.code||p.employeeNo||''} getCode={p=>p.code||p.employeeNo||''} onChange={value=>onChange(value?{kind:value.kind,id:value.id,code:value.code||value.employeeNo||'',name:name(value)}:null)} columns={[{key:'code',label:'',value:p=>p.code||p.employeeNo},{key:'name',label:t.party,value:name},{key:'kind',label:'',value:p=>t[p.kind]}]}/></Box><Typography data-testid="ledger-counterparty-name" variant="body2" sx={{minWidth:0,overflowWrap:'anywhere'}}>{name(current)||'\u2014'}</Typography></Stack>;
}
