import React,{forwardRef,useImperativeHandle,useRef,useState} from 'react';
import {Alert,Box,Button,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import {usePageDialogs} from './PageDialogProvider';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {Add,ArrowForward,Close,DragIndicator} from '@mui/icons-material';
import {DragDropContext,Draggable,Droppable} from '@hello-pangea/dnd';
import {approvalPolicyNodeSx,approvalPolicyConnectorSx} from './approvalPolicyLayout';
import DecimalAmountField from './DecimalAmountField';
import {approvalBandText} from '../constants/approvalBands';
import {approvalAmountUnits,approvalBandOrderErrors,boundedApprovalBand,combineApprovalCurrencyRows,defaultApprovalBands,previousApprovalAmount,reflowApprovalBands,reorderApprovalCurrencyBands,reorderApprovalStages,replaceApprovalGroup,sameApprovalGroup} from '../utils/approvalBands.mjs';
import {formatEditableDecimal} from '../utils/editableDecimal.mjs';
export const approvalRuleText={
 ko:{OPERATOR:'운영',ACCOUNTANT:'회계',ADMIN:'관리자',error:'금액 구간과 결재자의 보직·직급을 확인해 주세요. 운영 기안에는 회계 결재가 필요합니다.',changed:'다른 관리자가 설정을 변경했습니다. 새로고침 후 다시 확인해 주세요.'},
 en:{OPERATOR:'Operations',ACCOUNTANT:'Accounting',ADMIN:'Administrator',error:'Check amount bands and approver roles and grades. Operations requests require accounting approval.',changed:'Another administrator changed these settings. Reload and review.'},
 vi:{OPERATOR:'Vận hành',ACCOUNTANT:'Kế toán',ADMIN:'Quản trị viên',error:'Kiểm tra khoảng tiền, vai trò và chức danh người duyệt. Đề nghị vận hành cần kế toán duyệt.',changed:'Quản trị viên khác đã thay đổi cài đặt. Tải lại để kiểm tra.'},
};
const currencies=['USD','KRW','VND'];
export default forwardRef(function ApprovalRuleEditor({rules,settings,grades=[],onChange,disabled,languageCode,drafterScope={role:'ALL',gradeId:null},onScopeChange,headerActions,allowGradeRange=false},ref){
 const t=approvalBandText[languageCode]||approvalBandText.en;
 const dialogs=usePageDialogs(),[conditionDraft,setConditionDraft]=useState(null);
 const conditionsDirty=!!conditionDraft&&JSON.stringify(conditionDraft.values)!==conditionDraft.initial;
 useUnsavedChanges(conditionsDirty);
 const role=drafterScope.role,gradeId=drafterScope.gradeId;
 const setScope=change=>onScopeChange?.({...drafterScope,...change});
 const groups=currencies.map(currency=>{const group={currency,role,gradeId},stored=rules.filter(row=>sameApprovalGroup(row,group));return {currency,group,stored,rows:stored.length?stored:defaultApprovalBands(settings,grades,group)};});
 const rows=combineApprovalCurrencyRows(groups),orderErrors=approvalBandOrderErrors(rules);
 const gradeName=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.name||'';
 const updateGroup=(base,currency,next,reflow=false)=>{const source=groups.find(group=>group.currency===currency);return replaceApprovalGroup(base,source.group,reflow?reflowApprovalBands(next,currency):next);};
 const openConditions=row=>{const values=Object.fromEntries(row.entries.map(entry=>[entry.currency,entry.rule.max??'']));setConditionDraft({row,values,initial:JSON.stringify(values)});};
 const closeConditions=async()=>{if(!conditionsDirty||await dialogs.confirm(t.discardConditions))setConditionDraft(null);};
 const amountSummary=entry=>boundedApprovalBand(entry.rule)?`${entry.currency} ≤ ${formatEditableDecimal(entry.rule.max??'')}`:entry.rule.min==='0'?`${entry.currency} · ${t.noAmountCondition}`:`${entry.currency} > ${formatEditableDecimal(previousApprovalAmount(entry.rule.min,entry.currency))}`;
 let conditionResult=rules,conditionInvalid=false;
 if(conditionDraft){for(const entry of conditionDraft.row.entries){if(!boundedApprovalBand(entry.rule))continue;const max=conditionDraft.values[entry.currency];if(max===(entry.rule.max??''))continue;const source=groups.find(group=>group.currency===entry.currency);if(approvalAmountUnits(max,entry.currency)===null)conditionInvalid=true;conditionResult=updateGroup(conditionResult,entry.currency,source.rows.map((rule,index)=>index===entry.index?{...rule,max,__bounded:true}:rule),true);}conditionInvalid||=approvalBandOrderErrors(conditionResult).size>0;}
 const updateEntries=(row,change,reflow=false)=>{let next=rules;for(const entry of row.entries){const source=groups.find(group=>group.currency===entry.currency);next=updateGroup(next,entry.currency,source.rows.flatMap((rule,index)=>index===entry.index?change(rule):[rule]),reflow);}onChange(next);};
 const patchStages=(row,stages)=>updateEntries(row,rule=>[{...rule,stages}]);
 const patchStage=(row,position,change)=>patchStages(row,row.stages.map((stage,index)=>position===index?{...stage,...change}:stage));
 const addMiddle=(row,position)=>{const stages=[...row.stages];stages.splice(position,0,allowGradeRange?{role:'ACCOUNTANT',gradeId:null,gradeMatch:'ANY'}:{role:'OPERATOR',gradeId:null});patchStages(row,stages);};
 const stageKeys=useRef(new WeakMap());
 const stageKey=stage=>{if(!stageKeys.current.has(stage))stageKeys.current.set(stage,crypto.randomUUID());return stageKeys.current.get(stage);};
 const onDragEnd=({source,destination})=>{
  if(!destination||disabled||source.droppableId!==destination.droppableId)return;
  if(source.droppableId==='approval-bands')onChange(reorderApprovalCurrencyBands(rules,groups,rows,source.index,destination.index));
  else {const row=rows.find(row=>'approval-stages:'+row.key===source.droppableId);if(row)patchStages(row,reorderApprovalStages(row.stages,source.index,destination.index));}
 };
 const addCondition=()=>{
  if(disabled)return false;let result=rules;
  for(const source of groups){const next=[...source.rows],index=next.findIndex(row=>!boundedApprovalBand(row));
   const stages=next[index<0?Math.max(0,next.length-1):index]?.stages||[{role:['ALL','OPERATOR'].includes(role)?'ACCOUNTANT':'ADMIN',gradeId:['ALL','OPERATOR'].includes(role)?grades.find(row=>row.code==='CL2')?.id||null:null}];
   next.splice(index<0?next.length:index,0,{id:crypto.randomUUID(),name:`${source.currency} / ${role}`,drafterRole:role,drafterGradeId:gradeId,currency:source.currency,min:'0',max:'',__bounded:true,stages:stages.map(stage=>({...stage}))});result=updateGroup(result,source.currency,next,true);
  }
  if(result.length>30)return false;onChange(result);return true;
 };
 useImperativeHandle(ref,()=>({addCondition}));
 const roleOptions=['OPERATOR','ACCOUNTANT','ADMIN'].map(value=><MenuItem key={value} value={value}>{t[value]}</MenuItem>);
 const gradeOptions=grades.map(row=><MenuItem key={row.id} value={row.id}>{gradeName(row)}</MenuItem>);
 const nodeSx=approvalPolicyNodeSx;
 const renderDrafter=(preview=false)=><Paper variant="outlined" data-band-drafter={preview?undefined:true} sx={nodeSx}><Stack spacing={.25}><Typography variant="caption" color="text.secondary" sx={{height:18}}>{t.drafter}</Typography><Stack direction="row" spacing={.5}><TextField fullWidth select size="small" value={role} disabled={disabled||preview} onChange={event=>setScope({role:event.target.value})} slotProps={{select:{inputProps:{'aria-label':t.drafterRole}}}}><MenuItem value="ALL">{t.allRoles}</MenuItem>{roleOptions}</TextField><TextField fullWidth select size="small" value={gradeId||''} disabled={disabled||preview} onChange={event=>setScope({gradeId:event.target.value||null})} slotProps={{select:{displayEmpty:true,inputProps:{'aria-label':t.drafterGrade}}}}><MenuItem value="">{t.allGrades}</MenuItem>{gradeOptions}</TextField></Stack></Stack></Paper>;
 const drafterCard=renderDrafter();
 const stageCard=(stage,position,row,index,stageDrag,preview=false)=>{const final=position===row.stages.length-1;return <Paper variant="outlined" data-band-stage={preview?undefined:position} data-condition-stage={preview?position:undefined} data-stage-final={final?'true':undefined} sx={nodeSx}><Stack spacing={.25}>
       <Stack direction="row" alignItems="center" spacing={.5} sx={{height:18}}><Box {...stageDrag?.dragHandleProps} data-stage-drag-handle={preview?undefined:position} aria-label={`${t.reorderStage} ${position+1}`} sx={{display:'flex',color:'text.disabled',touchAction:'none'}}><DragIndicator sx={{fontSize:15}}/></Box><Typography variant="caption" color="text.secondary" sx={{flex:1}}>{final?t.final:`${t.middle} ${position+1}`}</Typography>{!preview&&row.stages.length>1&&<IconButton size="small" aria-label={t.remove} disabled={disabled||preview} sx={{p:.25}} onClick={()=>patchStages(row,row.stages.filter((_,i)=>i!==position))}><Close sx={{fontSize:16}}/></IconButton>}</Stack>
       <Stack direction="row" spacing={.5}>
        <TextField fullWidth select size="small" value={stage.role} disabled={disabled||preview} onChange={event=>patchStage(row,position,{role:event.target.value,...(event.target.value==='ADMIN'?{gradeId:null,...(allowGradeRange?{gradeMatch:'ANY'}:{})}:{})})} slotProps={{select:{'aria-label':`${t.role} ${index+1}-${position+1}`}}}>{roleOptions}</TextField>
        <TextField fullWidth select size="small" value={allowGradeRange?(stage.gradeId||'ANY'):stage.gradeId||''} disabled={disabled||preview} onChange={event=>{const selected=event.target.value;patchStage(row,position,allowGradeRange?{gradeId:selected==='ANY'?null:Number(String(selected).replace('MINIMUM:','')),gradeMatch:selected==='ANY'?'ANY':'MINIMUM'}:{gradeId:selected||null});}} slotProps={{select:{displayEmpty:true,'aria-label':`${t.grade} ${index+1}-${position+1}`}}}><MenuItem value={allowGradeRange?'ANY':''}>{allowGradeRange||stage.role==='ADMIN'?t.allGrades:t.selectGrade}</MenuItem>{stage.gradeId&&!grades.some(row=>row.id===stage.gradeId)&&<MenuItem value={stage.gradeMatch==='MINIMUM'?'MINIMUM:'+stage.gradeId:stage.gradeId} disabled>{t.selectGrade}</MenuItem>}{gradeOptions}</TextField>
       </Stack>
      </Stack></Paper>;};
 const columns={xs:'220px minmax(0,1fr)',md:'280px minmax(0,1fr)'},costColumns='20px minmax(0,1fr) 18px';
 return <Paper variant="outlined" data-testid="approval-conditions" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}>
  <Box sx={{overflowX:'auto'}}><Box sx={{minWidth:0}}>
   <Box data-testid="approval-table-header" sx={{display:'grid',gridTemplateColumns:columns,bgcolor:'action.hover',borderTop:1,borderBottom:1,borderColor:'divider'}}>
    <Box sx={{display:'grid',gridTemplateColumns:costColumns,gap:.5,alignItems:'center',px:1,py:.75}}><Box/><Typography data-condition-heading variant="caption" fontWeight={600}>{t.condition}</Typography><Box/></Box>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{px:1.5,py:.5}}><Typography variant="subtitle2">{t.line}</Typography>{headerActions}</Stack>
   </Box>
   {!rows.length&&<Box sx={{display:'grid',gridTemplateColumns:columns,p:1}}><Box/>{drafterCard}</Box>}
   <DragDropContext onDragEnd={onDragEnd}><Droppable droppableId="approval-bands" type="BANDS">{provided=><Box ref={provided.innerRef} {...provided.droppableProps}>
   {rows.map((row,index)=><Draggable key={row.key} draggableId={row.key} index={index} isDragDisabled={disabled||row.entries.some(entry=>!boundedApprovalBand(entry.rule))}>{drag=><Box ref={drag.innerRef} {...drag.draggableProps} data-approval-band={index} sx={{display:'grid',gridTemplateColumns:columns,borderBottom:1,borderColor:'divider',bgcolor:'background.paper'}}>
    <Box sx={{display:'grid',gridTemplateColumns:costColumns,alignItems:'center',gap:.5,px:1,py:.75,borderRight:1,borderColor:'divider'}}>
     <Box {...drag.dragHandleProps} aria-label={`${t.reorder} ${index+1}`} data-band-drag-handle={index} sx={{display:'flex',alignItems:'center',color:'text.disabled',touchAction:'none',cursor:drag.dragHandleProps?'grab':'default'}}><DragIndicator sx={{fontSize:18}}/></Box>
     <Button data-condition-summary={index} aria-label={t.condition+' '+(index+1)} onClick={()=>openConditions(row)} sx={{minWidth:0,display:'block',textAlign:'left',px:1,py:.75,color:'text.primary',textTransform:'none',border:1,borderColor:'divider',borderRadius:1,'&:hover':{borderColor:'primary.main',bgcolor:'action.hover'}}}>
      {row.entries.every(entry=>!boundedApprovalBand(entry.rule)&&entry.rule.min==='0')?<Typography variant="body2">{t.noAmountCondition}</Typography>:row.entries.map(entry=><Box key={entry.currency} component="span" sx={{display:'grid',gridTemplateColumns:'30px 14px minmax(0,1fr)',gap:.5,alignItems:'baseline',py:.125}}><Typography component="span" variant="caption" color="text.secondary" fontWeight={600}>{entry.currency}</Typography><Typography component="span" variant="body2" color="text.secondary">{boundedApprovalBand(entry.rule)?'\u2264':'>'}</Typography><Typography component="span" variant="body2" sx={{textAlign:'right',fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{formatEditableDecimal(boundedApprovalBand(entry.rule)?entry.rule.max??'':previousApprovalAmount(entry.rule.min,entry.currency))}</Typography></Box>)}
     </Button>
     {row.entries.every(entry=>boundedApprovalBand(entry.rule))&&<IconButton size="small" aria-label={t.remove} disabled={disabled} sx={{p:.25}} onClick={()=>updateEntries(row,()=>[],true)}><Close sx={{fontSize:15}}/></IconButton>}
    </Box>
    <Stack direction="row" alignItems="center" spacing={0} sx={{px:1,py:.75,overflowX:'auto',minWidth:0}}>
     {drafterCard}
     <Droppable droppableId={'approval-stages:'+row.key} type={'STAGES:'+row.key} direction="horizontal">{stagesProvided=><Stack ref={stagesProvided.innerRef} {...stagesProvided.droppableProps} direction="row" sx={{minWidth:0,flexShrink:0}}>
     {row.stages.map((stage,position)=>{const final=position===row.stages.length-1,key=stageKey(stage);return <Draggable key={key} draggableId={row.key+':'+key} index={position} isDragDisabled={disabled}>{stageDrag=><Stack ref={stageDrag.innerRef} {...stageDrag.draggableProps} direction="row" alignItems="center" sx={{flexShrink:0}}>
      <Box data-band-connector sx={approvalPolicyConnectorSx}><ArrowForward sx={{color:'text.disabled',fontSize:16}}/><IconButton data-add-middle={index} size="small" title={t.addMiddle} aria-label={t.addMiddle} disabled={disabled||row.stages.length>=10} color="primary" sx={{position:'absolute',top:44,p:.25}} onClick={()=>addMiddle(row,position)}><Add sx={{fontSize:16}}/></IconButton></Box>
      {stageCard(stage,position,row,index,stageDrag)}
     </Stack>}</Draggable>;})}{stagesProvided.placeholder}
     </Stack>}</Droppable>
    </Stack>
   </Box>}</Draggable>)}{provided.placeholder}
   </Box>}</Droppable></DragDropContext>
  </Box></Box>
 <Dialog open={!!conditionDraft} onClose={closeConditions} fullWidth maxWidth="lg" aria-label={t.conditionDetails}>
  <DialogTitle>{t.conditionDetails}</DialogTitle><DialogContent><Stack spacing={2}>
   <Box data-condition-line sx={{minWidth:0}}><Typography variant="subtitle2" sx={{mb:1}}>{t.line}</Typography><Stack direction="row" alignItems="center" sx={{overflowX:'auto',py:1}}>{renderDrafter(true)}{conditionDraft?.row.stages.map((stage,position)=><React.Fragment key={position}><Box sx={approvalPolicyConnectorSx}><ArrowForward sx={{color:'text.disabled',fontSize:16}}/></Box>{stageCard(stage,position,conditionDraft.row,0,null,true)}</React.Fragment>)}</Stack></Box>
   {conditionDraft?.row.entries.map(entry=><Box key={entry.currency} data-cost-currency={entry.currency}>
    {boundedApprovalBand(entry.rule)?<DecimalAmountField fullWidth currencyCode={entry.currency} size="small" label={t.amount+' · '+entry.currency} value={conditionDraft.values[entry.currency]} disabled={disabled} error={conditionInvalid} onValueChange={max=>setConditionDraft(current=>({...current,values:{...current.values,[entry.currency]:max}}))} InputProps={{startAdornment:<Typography component="span" sx={{mr:1}}>≤</Typography>}} inputProps={{'aria-label':t.amount+' '+entry.currency}}/>:<Typography>{amountSummary(entry)}</Typography>}
   </Box>)}
   {conditionInvalid&&<Alert severity="error">{t.orderError}</Alert>}
  </Stack></DialogContent><DialogActions>{!conditionsDirty&&<Button onClick={()=>setConditionDraft(null)}>{t.apply}</Button>}{conditionsDirty&&<Button variant="contained" disabled={disabled||conditionInvalid} onClick={()=>{onChange(conditionResult);setConditionDraft(null);}}>{t.apply}</Button>}</DialogActions>
 </Dialog>
 </Paper>;
});
