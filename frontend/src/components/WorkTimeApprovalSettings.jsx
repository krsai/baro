import React from 'react';
import {Alert,Box,Button,Checkbox,FormControlLabel,Paper,Stack,Typography} from '@mui/material';
import {Add,ArrowForward} from '@mui/icons-material';
import {approvalPolicyNodeSx,approvalPolicyConnectorSx} from './approvalPolicyLayout';
import {approvalBandText} from '../constants/approvalBands';
import SearchableSelect from './SearchableSelect';
import AddActionButton from './AddActionButton';
import DeleteActionButton from './DeleteActionButton';
import {workTimeText} from '../constants/workTime';

export default function WorkTimeApprovalSettings({form,managers=[],onChange,disabled,languageCode}){
 const t=workTimeText[languageCode]||workTimeText.en;
 const b=approvalBandText[languageCode]||approvalBandText.en;
 const toggle=(key,role)=>onChange({[key]:form[key].includes(role)?form[key].filter(value=>value!==role):[...form[key],role]});
 return <Stack spacing={2} data-testid="work-time-approval-settings">
  <Paper variant="outlined" sx={{borderRadius:2,overflow:'hidden',minWidth:0}}>
   <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:2,py:.5,bgcolor:'action.hover',borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{t.approvers}</Typography><Button startIcon={<Add/>} onClick={()=>onChange({approverIds:[...form.approverIds,null]})} disabled={disabled||form.approverIds.length>=10}>{t.add}</Button></Stack>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'320px minmax(0,1fr)'}}}>
    <Stack spacing={2} sx={{p:2,bgcolor:'action.hover',borderRight:{md:1},borderBottom:{xs:1,md:0},borderColor:'divider'}}>
     {['drafterRoles','proxyRoles'].map(key=><Box key={key}><Typography variant="subtitle2">{key==='drafterRoles'?t.draftRoles:t.proxyRoles}</Typography><Stack direction="row" useFlexGap flexWrap="wrap">{(key==='drafterRoles'?['ADMIN','OPERATOR','ACCOUNTANT','WORKER']:['ADMIN','OPERATOR','ACCOUNTANT']).map(role=><FormControlLabel sx={{m:0,mr:1}} key={role} control={<Checkbox checked={form[key].includes(role)} onChange={()=>toggle(key,role)} disabled={disabled}/>} label={t[role]}/>)}</Stack></Box>)}
    </Stack>
    <Stack direction="row" alignItems="center" sx={{p:1.5,minWidth:0,overflowX:'auto'}}>
     <Paper variant="outlined" sx={{...approvalPolicyNodeSx,display:'flex',alignItems:'center'}}><Typography variant="subtitle2">{b.drafter}</Typography></Paper>
     {form.approverIds.map((id,index)=><React.Fragment key={index}><Box sx={approvalPolicyConnectorSx}><ArrowForward sx={{fontSize:16,color:'text.disabled'}}/></Box><Paper variant="outlined" data-work-time-stage={index} sx={approvalPolicyNodeSx}><Stack spacing={.25}><Stack direction="row" alignItems="center" sx={{height:18}}><Typography variant="caption" color="text.secondary" sx={{flex:1}}>{index===form.approverIds.length-1?b.final:`${b.middle} ${index+1}`}</Typography><DeleteActionButton title={t.remove} onClick={()=>onChange({approverIds:form.approverIds.filter((_,i)=>i!==index)})} disabled={disabled}/></Stack><SearchableSelect fullWidth label={t.manager} options={managers} value={managers.find(person=>person.id===id)||null} getOptionLabel={person=>person.name} isOptionEqualToValue={(a,b)=>a.id===b.id} getOptionDisabled={person=>form.approverIds.includes(person.id)&&person.id!==id} onChange={(_,person)=>onChange({approverIds:form.approverIds.map((value,i)=>i===index?person?.id||null:value)})} disabled={disabled}/></Stack></Paper></React.Fragment>)}
     {!form.approverIds.length&&<Box sx={{ml:2}}><AddActionButton title={t.add} onClick={()=>onChange({approverIds:[null]})} disabled={disabled}/></Box>}
    </Stack>
   </Box>
  </Paper>
  <Alert severity="info" role="note">{t.policyNote}</Alert>
 </Stack>;
}
