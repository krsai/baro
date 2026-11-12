import React from 'react';
import {Box,Checkbox,FormControlLabel,Stack,Typography} from '@mui/material';
import SearchableSelect from './SearchableSelect';
import AddActionButton from './AddActionButton';
import DeleteActionButton from './DeleteActionButton';
import {workTimeText} from '../constants/workTime';

export default function WorkTimeApprovalSettings({form,managers=[],onChange,disabled,languageCode}){
 const t=workTimeText[languageCode]||workTimeText.en;
 const toggle=(key,role)=>onChange({[key]:form[key].includes(role)?form[key].filter(value=>value!==role):[...form[key],role]});
 return <Stack spacing={2} data-testid="work-time-approval-settings">
  <Typography>{t.policyNote}</Typography>
  {['drafterRoles','proxyRoles'].map(key=><Box key={key}><Typography variant="subtitle2">{key==='drafterRoles'?t.draftRoles:t.proxyRoles}</Typography><Stack direction="row" useFlexGap flexWrap="wrap">{(key==='drafterRoles'?['ADMIN','OPERATOR','ACCOUNTANT','WORKER']:['ADMIN','OPERATOR','ACCOUNTANT']).map(role=><FormControlLabel key={role} control={<Checkbox checked={form[key].includes(role)} onChange={()=>toggle(key,role)} disabled={disabled}/>} label={t[role]}/>)}</Stack></Box>)}
  <Typography variant="subtitle2">{t.approvers}</Typography>
  {form.approverIds.map((id,index)=><Stack direction="row" spacing={1} alignItems="center" key={index}><Typography>{index+1}</Typography><SearchableSelect sx={{flex:1,minWidth:0}} label={t.manager} options={managers} value={managers.find(person=>person.id===id)||null} getOptionLabel={person=>person.name} isOptionEqualToValue={(a,b)=>a.id===b.id} getOptionDisabled={person=>form.approverIds.includes(person.id)&&person.id!==id} onChange={(_,person)=>onChange({approverIds:form.approverIds.map((value,i)=>i===index?person?.id||null:value)})} disabled={disabled}/><DeleteActionButton title={t.remove} onClick={()=>onChange({approverIds:form.approverIds.filter((_,i)=>i!==index)})} disabled={disabled}/></Stack>)}
  <AddActionButton title={t.add} onClick={()=>onChange({approverIds:[...form.approverIds,null]})} disabled={disabled||form.approverIds.length>=10}/>
 </Stack>;
}
