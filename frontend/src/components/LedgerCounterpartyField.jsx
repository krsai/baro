import React from 'react';
import {Autocomplete,TextField,Typography,createFilterOptions} from '@mui/material';
import {changeApprovalText} from '../constants/changeApprovals';
export default function LedgerCounterpartyField({row,parent,options,account,languageCode,disabled,onChange}){
 const t=changeApprovalText[languageCode]||changeApprovalText.en;
 if(row.entryKind!=='BANK')return <Typography variant="caption">{parent?.document?.payee||parent?.counterparty?.name||'—'}</Typography>;
 if(row.evidenceType==='ADJUSTMENT')return <Typography variant="body2">—</Typography>;
 if(row.evidenceType!=='FILE')return <Typography variant="body2" aria-label={t.party} sx={{overflowWrap:'anywhere'}}>{row.document?.payee||row.counterparty?.name||'—'}</Typography>;
 const choices=options.filter(p=>p.kind!=='ACCOUNT'||p.id!==account?.entityAccountId&&'entity:'+p.id!==account?.id);
 const current=choices.find(p=>p.kind===row.counterparty?.kind&&p.id===row.counterparty?.id)||row.counterparty||null;
 const name=p=>p?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||p?.name||'';
 return <Autocomplete fullWidth size="small" options={choices} value={current} disabled={disabled} groupBy={p=>t[p.kind]} getOptionLabel={name} isOptionEqualToValue={(a,b)=>a.kind===b.kind&&a.id===b.id} filterOptions={createFilterOptions({stringify:p=>[p.name,p.nameKo,p.nameVi,p.code,p.employeeNo].filter(Boolean).join(' ')})} onChange={(_,value)=>onChange(value?{kind:value.kind,id:value.id,name:name(value)}:null)} renderInput={params=><TextField {...params} required inputProps={{...params.inputProps,'aria-label':t.party}}/>}/>;
}
