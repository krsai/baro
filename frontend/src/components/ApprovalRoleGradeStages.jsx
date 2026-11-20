import React from 'react';
import {Box,IconButton,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import {Add,ArrowForward,Close,DragIndicator} from '@mui/icons-material';
import {DragDropContext,Draggable,Droppable} from '@hello-pangea/dnd';
import {approvalPolicyNodeSx,approvalPolicyConnectorSx} from './approvalPolicyLayout';
import {approvalBandText} from '../constants/approvalBands';

export default function ApprovalRoleGradeStages({stages,grades,onChange,disabled,languageCode}){
 const t=approvalBandText[languageCode]||approvalBandText.en;
 const patch=(index,change)=>onChange(stages.map((stage,i)=>i===index?{...stage,...change}:stage));
 const add=index=>{const next=[...stages];next.splice(index,0,{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'});onChange(next);};
 const reorder=({source,destination})=>{if(disabled||!destination||source.index===destination.index)return;const next=[...stages],moved=next.splice(source.index,1)[0];next.splice(destination.index,0,moved);onChange(next);};
 return <DragDropContext onDragEnd={reorder}><Droppable droppableId="inventory-role-stages" direction="horizontal">{provided=><Stack ref={provided.innerRef} {...provided.droppableProps} direction="row" sx={{flexShrink:0}}>{stages.map((stage,index)=><Draggable key={index} draggableId={'inventory-stage-'+index} index={index} isDragDisabled={disabled}>{drag=><Stack ref={drag.innerRef} {...drag.draggableProps} direction="row" alignItems="center" sx={{flexShrink:0}}>
  <Box sx={approvalPolicyConnectorSx}><ArrowForward sx={{fontSize:16,color:'text.disabled'}}/><IconButton size="small" aria-label={t.addMiddle} disabled={disabled||stages.length>=10} color="primary" sx={{position:'absolute',top:44,p:.25}} onClick={()=>add(index)}><Add sx={{fontSize:16}}/></IconButton></Box>
  <Paper variant="outlined" data-inventory-stage={index} data-stage-final={index===stages.length-1?'true':undefined} sx={approvalPolicyNodeSx}><Stack spacing={.25}>
   <Stack direction="row" alignItems="center" spacing={.5} sx={{height:18}}><Box {...drag.dragHandleProps} aria-label={`${t.reorderStage} ${index+1}`} sx={{display:'flex',color:'text.disabled',touchAction:'none'}}><DragIndicator sx={{fontSize:15}}/></Box><Typography variant="caption" color="text.secondary" sx={{flex:1}}>{index===stages.length-1?t.final:`${t.middle} ${index+1}`}</Typography>{stages.length>1&&<IconButton size="small" aria-label={t.remove} disabled={disabled} sx={{p:.25}} onClick={()=>onChange(stages.filter((_,i)=>i!==index))}><Close sx={{fontSize:16}}/></IconButton>}</Stack>
   <Stack direction="row" spacing={.5}>
    <TextField fullWidth select size="small" value={stage.role} disabled={disabled} onChange={event=>patch(index,{role:event.target.value,...(event.target.value==='ADMIN'?{gradeId:null,gradeMatch:'ANY'}:{})})} slotProps={{select:{inputProps:{'aria-label':`${t.role} ${index+1}`}}}}>{!stage.role&&<MenuItem value="" disabled>—</MenuItem>}{['OPERATOR','ACCOUNTANT','ADMIN'].map(role=><MenuItem key={role} value={role}>{t[role]}</MenuItem>)}</TextField>
    <TextField fullWidth select size="small" value={stage.gradeId||'ANY'} disabled={disabled} onChange={event=>patch(index,{gradeId:event.target.value==='ANY'?null:Number(event.target.value),gradeMatch:event.target.value==='ANY'?'ANY':'MINIMUM'})} slotProps={{select:{inputProps:{'aria-label':`${t.grade} ${index+1}`}}}}><MenuItem value="ANY">{t.allGrades}</MenuItem>{stage.gradeId&&!grades.some(grade=>grade.id===stage.gradeId)&&<MenuItem value={stage.gradeId} disabled>{t.selectGrade}</MenuItem>}{grades.map(grade=><MenuItem key={grade.id} value={grade.id}>{grade[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||grade.name}</MenuItem>)}</TextField>
   </Stack>
  </Stack></Paper>
 </Stack>}</Draggable>)}{provided.placeholder}</Stack>}</Droppable></DragDropContext>;
}
