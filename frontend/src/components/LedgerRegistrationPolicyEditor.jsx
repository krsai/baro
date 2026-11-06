import React,{useRef} from 'react';
import {Box,IconButton,ListSubheader,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import {Add,ArrowForward,Close,DragIndicator} from '@mui/icons-material';
import {DragDropContext,Draggable,Droppable} from '@hello-pangea/dnd';
import {approvalBandText} from '../constants/approvalBands';
import {ledgerRegistrationText} from '../constants/ledgerRegistration';
import {approvalPolicyNodeSx,approvalPolicyConnectorSx} from './approvalPolicyLayout';

export default function LedgerRegistrationPolicyEditor({value,onChange,grades=[],languageCode,disabled}){
 const t=ledgerRegistrationText[languageCode]||ledgerRegistrationText.en,b=approvalBandText[languageCode]||approvalBandText.en;
 const keys=useRef(new WeakMap());
 const stageKey=stage=>{if(!keys.current.has(stage))keys.current.set(stage,crypto.randomUUID());return keys.current.get(stage);};
 const edit=(index,patch)=>onChange(value.map((stage,i)=>i===index?{...stage,...patch}:stage));
 const gradeName=g=>g[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||g.name;
 const insert=index=>{const next=[...value];next.splice(index,0,{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'});onChange(next);};
 const reorder=({source,destination})=>{if(disabled||!destination||source.index===destination.index)return;const next=[...value];next.splice(destination.index,0,next.splice(source.index,1)[0]);onChange(next);};
 return <Paper variant="outlined" data-testid="ledger-registration-policy" sx={{borderRadius:2,overflow:'hidden'}}>
  <Box sx={{px:1.5,py:1,bgcolor:'grey.50',borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{b.line}</Typography></Box>
  <Box sx={{overflowX:'auto',p:.75}}><DragDropContext onDragEnd={reorder}><Droppable droppableId="ledger-registration-stages" direction="horizontal">{provided=><Stack ref={provided.innerRef} {...provided.droppableProps} direction="row" alignItems="center" sx={{width:'max-content',minWidth:'100%'}}>
   <Paper variant="outlined" data-band-drafter sx={approvalPolicyNodeSx}><Stack spacing={.25}><Typography variant="caption" color="text.secondary" sx={{height:18}}>{b.drafter}</Typography><Stack direction="row" spacing={.5}><TextField fullWidth select size="small" value="ALL" disabled slotProps={{select:{'aria-label':b.drafterRole}}}><MenuItem value="ALL">{b.allRoles}</MenuItem></TextField><TextField fullWidth select size="small" value="ALL" disabled slotProps={{select:{'aria-label':b.drafterGrade}}}><MenuItem value="ALL">{b.allGrades}</MenuItem></TextField></Stack></Stack></Paper>
   {value.map((stage,index)=>{const key=stageKey(stage),gradeValue=stage.gradeMatch==='ANY'?'ANY':stage.gradeMatch+':'+(stage.gradeId||''),known=stage.gradeMatch==='ANY'||grades.some(g=>g.id===stage.gradeId);return <Draggable key={key} draggableId={key} index={index} isDragDisabled={disabled}>{drag=><Stack ref={drag.innerRef} {...drag.draggableProps} direction="row" alignItems="center" sx={{flexShrink:0}}>
    <Box data-band-connector sx={approvalPolicyConnectorSx}><ArrowForward sx={{color:'text.disabled',fontSize:16}}/><IconButton size="small" title={b.addMiddle} aria-label={b.addMiddle} disabled={disabled||value.length>=10} color="primary" sx={{position:'absolute',top:44,p:.25}} onClick={()=>insert(index)}><Add sx={{fontSize:16}}/></IconButton></Box>
    <Paper variant="outlined" data-registration-stage={index} data-band-stage={index} data-stage-final={index===value.length-1?'true':undefined} sx={approvalPolicyNodeSx}><Stack spacing={.25}>
     <Stack direction="row" alignItems="center" spacing={.5} sx={{height:18}}><Box {...drag.dragHandleProps} data-stage-drag-handle={index} aria-label={`${b.reorderStage} ${index+1}`} sx={{display:'flex',color:'text.disabled',touchAction:'none'}}><DragIndicator sx={{fontSize:15}}/></Box><Typography variant="caption" color="text.secondary" sx={{flex:1}}>{index===value.length-1?b.final:`${b.middle} ${index+1}`}</Typography>{value.length>1&&<IconButton size="small" aria-label={b.remove} disabled={disabled} sx={{p:.25}} onClick={()=>onChange(value.filter((_,i)=>i!==index))}><Close sx={{fontSize:16}}/></IconButton>}</Stack>
     <Stack direction="row" spacing={.5}>
      <TextField fullWidth select size="small" value={stage.role} disabled={disabled} slotProps={{select:{'aria-label':`${b.role} ${index+1}`}}} onChange={e=>edit(index,{role:e.target.value})}>{['ACCOUNTANT','ADMIN','OPERATOR'].map(role=><MenuItem key={role} value={role}>{b[role]}</MenuItem>)}</TextField>
      <TextField fullWidth select size="small" value={gradeValue} disabled={disabled} slotProps={{select:{'aria-label':`${b.grade} ${index+1}`}}} onChange={e=>{const [gradeMatch,id]=e.target.value.split(':');edit(index,{gradeMatch,gradeId:gradeMatch==='ANY'?null:Number(id)});}}>
       <MenuItem value="ANY">{b.allGrades}</MenuItem>{!known&&<MenuItem value={gradeValue} disabled>{b.selectGrade}</MenuItem>}
       <ListSubheader>{t.EXACT}</ListSubheader>{grades.map(g=><MenuItem key={'EXACT:'+g.id} value={'EXACT:'+g.id}>{gradeName(g)}</MenuItem>)}
       <ListSubheader>{t.MINIMUM}</ListSubheader>{grades.map(g=><MenuItem key={'MINIMUM:'+g.id} value={'MINIMUM:'+g.id}>{gradeName(g)+' '+t.above}</MenuItem>)}
      </TextField>
     </Stack>
    </Stack></Paper>
   </Stack>}</Draggable>;})}{provided.placeholder}
  </Stack>}</Droppable></DragDropContext></Box>
 </Paper>;
}
