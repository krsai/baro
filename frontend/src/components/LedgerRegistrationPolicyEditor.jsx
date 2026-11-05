import React from 'react';
import {Box,Button,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import {ArrowForward} from '@mui/icons-material';
import {approvalBandText} from '../constants/approvalBands';
import {ledgerRegistrationText} from '../constants/ledgerRegistration';
export default function LedgerRegistrationPolicyEditor({value,onChange,grades=[],languageCode,disabled}){
 const t=ledgerRegistrationText[languageCode]||ledgerRegistrationText.en,b=approvalBandText[languageCode]||approvalBandText.en;
 const edit=(index,patch)=>onChange(value.map((s,i)=>i===index?{...s,...patch}:s));
 return <Paper variant="outlined" sx={{p:2,borderRadius:2}}><Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
 {value.map((stage,index)=><React.Fragment key={index}>{index>0&&<ArrowForward color="disabled"/>}<Box sx={{width:260,maxWidth:'100%'}}><Typography variant="subtitle2" sx={{mb:1}}>{index===value.length-1?b.final:`${b.middle} ${index+1}`}</Typography><Stack spacing={1}>
 <TextField select size="small" label={b.role} value={stage.role} disabled={disabled} onChange={e=>edit(index,{role:e.target.value})}>{['ACCOUNTANT','ADMIN','OPERATOR'].map(role=><MenuItem key={role} value={role}>{b[role]}</MenuItem>)}</TextField>
 <TextField select size="small" label={t.gradeMatch} value={stage.gradeMatch} disabled={disabled} onChange={e=>edit(index,{gradeMatch:e.target.value,...(e.target.value==='ANY'?{gradeId:null}:{})})}>{['ANY','MINIMUM','EXACT'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField>
 {stage.gradeMatch!=='ANY'&&<TextField select size="small" label={b.grade} value={stage.gradeId||''} disabled={disabled} onChange={e=>edit(index,{gradeId:e.target.value})}>{grades.map(g=><MenuItem key={g.id} value={g.id}>{g[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||g.name}</MenuItem>)}</TextField>}
 <Button disabled={disabled||value.length===1} onClick={()=>onChange(value.filter((_,i)=>i!==index))}>{t.remove}</Button></Stack></Box></React.Fragment>)}
 <Button disabled={disabled||value.length>=10} onClick={()=>onChange([...value,{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'}])}>{t.add}</Button>
 </Stack></Paper>;
}
