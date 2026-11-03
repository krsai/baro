import React,{forwardRef,useImperativeHandle,useState} from 'react';
import {Box,IconButton,MenuItem,Paper,Stack,TextField,ToggleButton,ToggleButtonGroup,Typography} from '@mui/material';
import {Add,ArrowForward,ChevronLeft,ChevronRight,Close,DragIndicator} from '@mui/icons-material';
import {DragDropContext,Draggable,Droppable} from '@hello-pangea/dnd';
import DecimalAmountField from './DecimalAmountField';
import {approvalBandText} from '../constants/approvalBands';
import {approvalBandOrderErrors,boundedApprovalBand,combineApprovalCurrencyRows,defaultApprovalBands,previousApprovalAmount,reflowApprovalBands,reorderApprovalCurrencyBands,replaceApprovalGroup,sameApprovalGroup} from '../utils/approvalBands.mjs';
import {formatEditableDecimal} from '../utils/editableDecimal.mjs';
export const approvalRuleText={
 ko:{OPERATOR:'운영',ACCOUNTANT:'회계',ADMIN:'관리자',error:'금액 구간과 결재자의 보직·직급을 확인해 주세요. 운영 기안에는 회계 결재가 필요합니다.',changed:'다른 관리자가 설정을 변경했습니다. 새로고침 후 다시 확인해 주세요.'},
 en:{OPERATOR:'Operations',ACCOUNTANT:'Accounting',ADMIN:'Administrator',error:'Check amount bands and approver roles and grades. Operations requests require accounting approval.',changed:'Another administrator changed these settings. Reload and review.'},
 vi:{OPERATOR:'Vận hành',ACCOUNTANT:'Kế toán',ADMIN:'Quản trị viên',error:'Kiểm tra khoảng tiền, vai trò và chức danh người duyệt. Đề nghị vận hành cần kế toán duyệt.',changed:'Quản trị viên khác đã thay đổi cài đặt. Tải lại để kiểm tra.'},
};
const currencies=['USD','KRW','VND'];
export default forwardRef(function ApprovalRuleEditor({rules,settings,grades=[],onChange,disabled,languageCode},ref){
 const t=approvalBandText[languageCode]||approvalBandText.en;
 const [role,setRole]=useState('OPERATOR'),[gradeId,setGradeId]=useState(null);
 const groups=currencies.map(currency=>{const group={currency,role,gradeId},stored=rules.filter(row=>sameApprovalGroup(row,group));return {currency,group,stored,rows:stored.length?stored:defaultApprovalBands(settings,grades,group)};});
 const rows=combineApprovalCurrencyRows(groups),orderErrors=approvalBandOrderErrors(rules);
 const gradeName=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.name||'';
 const updateGroup=(base,currency,next,reflow=false)=>{const source=groups.find(group=>group.currency===currency);return replaceApprovalGroup(base,source.group,reflow?reflowApprovalBands(next,currency):next);};
 const updateEntries=(row,change,reflow=false)=>{let next=rules;for(const entry of row.entries){const source=groups.find(group=>group.currency===entry.currency);next=updateGroup(next,entry.currency,source.rows.flatMap((rule,index)=>index===entry.index?change(rule):[rule]),reflow);}onChange(next);};
 const patchStages=(row,stages)=>updateEntries(row,rule=>[{...rule,stages}]);
 const patchStage=(row,position,change)=>patchStages(row,row.stages.map((stage,index)=>position===index?{...stage,...change}:stage));
 const addMiddle=(row,position)=>{const stages=[...row.stages];stages.splice(position,0,{role:'OPERATOR',gradeId:null});patchStages(row,stages);};
 const moveMiddle=(row,position,delta)=>{const stages=[...row.stages];[stages[position],stages[position+delta]]=[stages[position+delta],stages[position]];patchStages(row,stages);};
 const addCondition=()=>{
  if(disabled)return false;let result=rules;
  for(const source of groups){const next=[...source.rows],index=next.findIndex(row=>!boundedApprovalBand(row));
   const stages=next[index<0?Math.max(0,next.length-1):index]?.stages||[{role:role==='OPERATOR'?'ACCOUNTANT':'ADMIN',gradeId:role==='OPERATOR'?grades.find(row=>row.code==='CL2')?.id||null:null}];
   next.splice(index<0?next.length:index,0,{id:crypto.randomUUID(),name:`${source.currency} / ${role}`,drafterRole:role,drafterGradeId:gradeId,currency:source.currency,min:'0',max:'',__bounded:true,stages:stages.map(stage=>({...stage}))});result=updateGroup(result,source.currency,next,true);
  }
  if(result.length>30)return false;onChange(result);return true;
 };
 useImperativeHandle(ref,()=>({addCondition}));
 const roleOptions=['OPERATOR','ACCOUNTANT','ADMIN'].map(value=><MenuItem key={value} value={value}>{t[value]}</MenuItem>);
 const gradeOptions=grades.map(row=><MenuItem key={row.id} value={row.id}>{gradeName(row)}</MenuItem>);
 const nodeSx={width:208,minWidth:208,height:70,boxSizing:'border-box',p:.75,borderRadius:1,bgcolor:'background.paper'};
 const columns='360px minmax(0,1fr)',costColumns='20px repeat(3,minmax(0,1fr)) 18px';
 return <Paper variant="outlined" data-testid="approval-conditions" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}>
  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{p:1.5}}>
   <Typography variant="caption" color="text.secondary">{t.drafter}</Typography>
   <ToggleButtonGroup exclusive size="small" aria-label={t.drafterRole} value={role} disabled={disabled} onChange={(_,next)=>{if(next){setRole(next);setGradeId(null);}}}>{['OPERATOR','ACCOUNTANT','ADMIN'].map(value=><ToggleButton key={value} value={value}>{t[value]}</ToggleButton>)}</ToggleButtonGroup>
   <TextField select size="small" label={t.drafterGrade} value={gradeId||''} disabled={disabled} sx={{width:180,minWidth:0}} onChange={event=>setGradeId(event.target.value||null)} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}}><MenuItem value="">{t.allGrades}</MenuItem>{gradeOptions}</TextField>
  </Stack>
  <Box sx={{overflowX:'auto'}}><Box sx={{minWidth:880}}>
   <Box sx={{display:'grid',gridTemplateColumns:columns,bgcolor:'action.hover',borderTop:1,borderBottom:1,borderColor:'divider'}}>
    <Stack spacing={.25} sx={{px:1,py:.75}}><Typography variant="caption" fontWeight={600}>{t.condition}</Typography><Box sx={{display:'grid',gridTemplateColumns:costColumns,gap:.5}}><Box/>{currencies.map(currency=><Typography key={currency} data-currency-heading={currency} variant="caption" align="center">{currency}</Typography>)}</Box></Stack>
    <Typography variant="subtitle2" sx={{px:1.5,alignSelf:'center'}}>{t.line}</Typography>
   </Box>
   <DragDropContext onDragEnd={({source,destination})=>{if(destination&&!disabled)onChange(reorderApprovalCurrencyBands(rules,groups,rows,source.index,destination.index));}}><Droppable droppableId="approval-bands">{provided=><Box ref={provided.innerRef} {...provided.droppableProps}>
   {rows.map((row,index)=><Draggable key={row.key} draggableId={row.key} index={index} isDragDisabled={disabled||row.entries.some(entry=>!boundedApprovalBand(entry.rule))}>{drag=><Box ref={drag.innerRef} {...drag.draggableProps} data-approval-band={index} sx={{display:'grid',gridTemplateColumns:columns,borderBottom:1,borderColor:'divider',bgcolor:'background.paper'}}>
    <Box sx={{display:'grid',gridTemplateColumns:costColumns,alignItems:'center',gap:.5,px:1,py:.75,borderRight:1,borderColor:'divider'}}>
     <Box {...drag.dragHandleProps} aria-label={`${t.reorder} ${index+1}`} data-band-drag-handle={index} sx={{display:'flex',alignItems:'center',color:'text.disabled',touchAction:'none',cursor:drag.dragHandleProps?'grab':'default'}}><DragIndicator sx={{fontSize:18}}/></Box>
     {currencies.map(currency=>{const entry=row.entries.find(entry=>entry.currency===currency);if(!entry)return <Typography key={currency} align="center" color="text.disabled">—</Typography>;const rule=entry.rule;
      return <Box key={currency} data-cost-currency={currency} sx={{minWidth:0}}>
       {boundedApprovalBand(rule)?<DecimalAmountField size="small" value={rule.max??''} disabled={disabled} error={orderErrors.has(rule.id)} onValueChange={max=>{const source=groups.find(group=>group.currency===currency);onChange(updateGroup(rules,currency,source.rows.map((item,i)=>i===entry.index?{...item,max,__bounded:true}:item),true));}} sx={{'& .MuiInputBase-root':{px:.75},'& input':{px:0,fontSize:12}}} InputProps={{startAdornment:<Typography component="span" sx={{fontSize:12,mr:.5,color:'text.secondary'}}>≤</Typography>}} inputProps={{'aria-label':`${t.amount} ${currency} ${entry.index+1}`,style:{textAlign:'right'}}}/>:<Typography variant="caption" align="right" sx={{display:'block',whiteSpace:'nowrap'}}>{rule.min==='0'?'—':`> ${formatEditableDecimal(previousApprovalAmount(rule.min,currency))}`}</Typography>}
      </Box>;
     })}
     {row.entries.every(entry=>boundedApprovalBand(entry.rule))&&<IconButton size="small" aria-label={t.remove} disabled={disabled} sx={{p:.25}} onClick={()=>updateEntries(row,()=>[],true)}><Close sx={{fontSize:15}}/></IconButton>}
    </Box>
    <Stack direction="row" alignItems="center" spacing={0} sx={{px:1,py:.75,overflowX:'auto',minWidth:0}}>
     <Paper variant="outlined" data-band-drafter sx={{...nodeSx,display:'flex',flexDirection:'column',justifyContent:'center'}}><Typography variant="caption" color="text.secondary">{t.drafter}</Typography><Typography variant="body2" sx={{fontSize:12}}>{t[role]} / {gradeId?gradeName(grades.find(row=>row.id===gradeId)):t.allGrades}</Typography></Paper>
     {row.stages.map((stage,position)=>{const final=position===row.stages.length-1;return <React.Fragment key={position}>
      <Box data-band-connector sx={{width:32,minWidth:32,height:70,position:'relative',display:'flex',justifyContent:'center',alignItems:'center'}}><ArrowForward sx={{color:'text.disabled',fontSize:16}}/><IconButton data-add-middle={index} size="small" title={t.addMiddle} aria-label={t.addMiddle} disabled={disabled||row.stages.length>=10} color="primary" sx={{position:'absolute',top:44,p:.25}} onClick={()=>addMiddle(row,position)}><Add sx={{fontSize:16}}/></IconButton></Box>
      <Paper variant="outlined" data-band-stage={position} data-stage-final={final?'true':undefined} sx={nodeSx}><Stack spacing={.25}>
       <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{height:18}}><Typography variant="caption" color="text.secondary">{final?t.final:`${t.middle} ${position+1}`}</Typography>{!final&&<Stack direction="row"><IconButton size="small" aria-label={t.left} disabled={disabled||!position} sx={{p:.25}} onClick={()=>moveMiddle(row,position,-1)}><ChevronLeft sx={{fontSize:16}}/></IconButton><IconButton size="small" aria-label={t.right} disabled={disabled||position>=row.stages.length-2} sx={{p:.25}} onClick={()=>moveMiddle(row,position,1)}><ChevronRight sx={{fontSize:16}}/></IconButton><IconButton size="small" aria-label={t.remove} disabled={disabled} sx={{p:.25}} onClick={()=>patchStages(row,row.stages.filter((_,i)=>i!==position))}><Close sx={{fontSize:16}}/></IconButton></Stack>}</Stack>
       <Stack direction="row" spacing={.5}>
        <TextField fullWidth select size="small" value={stage.role} disabled={disabled} onChange={event=>patchStage(row,position,{role:event.target.value,...(event.target.value==='ADMIN'?{gradeId:null}:{})})} slotProps={{select:{'aria-label':`${t.role} ${index+1}-${position+1}`}}}>{roleOptions}</TextField>
        <TextField fullWidth select size="small" value={stage.gradeId||''} disabled={disabled} onChange={event=>patchStage(row,position,{gradeId:event.target.value||null})} slotProps={{select:{displayEmpty:true,'aria-label':`${t.grade} ${index+1}-${position+1}`}}}><MenuItem value="">{stage.role==='ADMIN'?t.allGrades:t.selectGrade}</MenuItem>{stage.gradeId&&!grades.some(row=>row.id===stage.gradeId)&&<MenuItem value={stage.gradeId} disabled>{t.selectGrade}</MenuItem>}{gradeOptions}</TextField>
       </Stack>
      </Stack></Paper>
     </React.Fragment>;})}
    </Stack>
   </Box>}</Draggable>)}{provided.placeholder}
   </Box>}</Droppable></DragDropContext>
  </Box></Box>
 </Paper>;
});
