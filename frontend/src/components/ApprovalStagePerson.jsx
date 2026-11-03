import React,{useEffect,useState} from 'react';
import {Box,MenuItem,TextField} from '@mui/material';
import {approvalBandText} from '../constants/approvalBands';
import {approvalLineText} from '../constants/approvalLine';

export default function ApprovalStagePerson({stage,value,onChange,grades=[],languageCode,disabled=false,personLabel}){
 const t=approvalBandText[languageCode]||approvalBandText.en,line=approvalLineText[languageCode]||approvalLineText.en;
 const candidates=stage.candidates||[],role=stage.role||(stage.key==='admin'?'ADMIN':'ACCOUNTANT');
 const [gradeFilter,setGradeFilter]=useState('');
 const scope=stage.key+':'+stage.gradeId+':'+candidates.map(row=>row.id).join(',');
 useEffect(()=>setGradeFilter(''),[scope]);
 const gradeName=grade=>grade?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||grade?.name||'—';
 const fixedGrade=stage.gradeId||null,eligible=gradeFilter?candidates.filter(row=>row.gradeId===gradeFilter):candidates;
 const single=eligible.length===1?eligible[0]:null,chosen=eligible.find(row=>row.id===(value??stage.employeeId))||single;
 const availableGrades=[...new Map(candidates.filter(row=>row.gradeId).map(row=>[row.gradeId,row.grade||grades.find(grade=>grade.id===row.gradeId)])).entries()];
 useEffect(()=>{if(stage.invalid&&single&&value!==single.id)onChange(single.id);},[stage.invalid,single?.id,value]);
 const gradeValue=gradeName(grades.find(row=>row.id===fixedGrade)||candidates.find(row=>row.gradeId===fixedGrade)?.grade||chosen?.grade||availableGrades[0]?.[1]);
 const label=personLabel||line.person;
 return <Box data-approval-person-stage={stage.key} sx={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:1}}>
  <TextField size="small" label={t.role} value={t[role]||role} InputProps={{readOnly:true}}/>
  {fixedGrade||availableGrades.length<=1?<TextField size="small" label={t.grade} value={gradeValue} InputProps={{readOnly:true}}/>:<TextField size="small" select label={t.grade} value={gradeFilter} disabled={disabled} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}} onChange={event=>{const gradeId=event.target.value;setGradeFilter(gradeId);const pool=gradeId?candidates.filter(row=>row.gradeId===gradeId):candidates;onChange(pool.some(row=>row.id===value)?value:pool.length===1?pool[0].id:null);}}><MenuItem value="">{t.allGrades}</MenuItem>{availableGrades.map(([id,grade])=><MenuItem key={id} value={id}>{gradeName(grade)}</MenuItem>)}</TextField>}
  <Box sx={{gridColumn:'1 / -1',minWidth:0}}>
   {single?<TextField fullWidth size="small" id={'expense-stage-'+stage.key} label={label} value={single.name} InputProps={{readOnly:true}}/>:<TextField fullWidth size="small" id={'expense-stage-'+stage.key} select label={label} value={value??stage.employeeId??''} disabled={disabled} error={stage.invalid||!eligible.length} helperText={!eligible.length?line.noCandidates:undefined} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}} onChange={event=>onChange(event.target.value||null)}>
    <MenuItem value="" disabled>{stage.final?line.finalSelect:line.middleSelect}</MenuItem>
    {value&&!eligible.some(row=>row.id===value)&&<MenuItem disabled value={value}>—</MenuItem>}
    {eligible.map(row=><MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
   </TextField>}
  </Box>
 </Box>;
}
