import React,{useState} from 'react';
import {Box,Button,IconButton,MenuItem,Paper,Stack,Tab,Tabs,TextField,Typography} from '@mui/material';
import {Add,ArrowForward,ChevronLeft,ChevronRight,Close} from '@mui/icons-material';
import DecimalAmountField from './DecimalAmountField';
import {approvalBandText} from '../constants/approvalBands';
import {boundedApprovalBand,defaultApprovalBands,previousApprovalAmount,reflowApprovalBands,replaceApprovalGroup,sameApprovalGroup} from '../utils/approvalBands.mjs';
import {formatEditableDecimal} from '../utils/editableDecimal.mjs';
export const approvalRuleText={
 ko:{OPERATOR:'운영',ACCOUNTANT:'회계',ADMIN:'관리자',error:'금액 구간과 결재자의 역할·직급을 확인해 주세요. 운영 기안에는 회계 결재가 필요합니다.',changed:'다른 관리자가 설정을 변경했습니다. 새로고침 후 다시 확인해 주세요.'},
 en:{OPERATOR:'Operations',ACCOUNTANT:'Accounting',ADMIN:'Administrator',error:'Check amount bands and approver roles and grades. Operations requests require accounting approval.',changed:'Another administrator changed these settings. Reload and review.'},
 vi:{OPERATOR:'Vận hành',ACCOUNTANT:'Kế toán',ADMIN:'Quản trị viên',error:'Kiểm tra khoảng tiền, vai trò và chức danh người duyệt. Đề nghị vận hành cần kế toán duyệt.',changed:'Quản trị viên khác đã thay đổi cài đặt. Tải lại để kiểm tra.'},
};
export default function ApprovalRuleEditor({rules,settings,grades=[],onChange,disabled,languageCode}){
 const t=approvalBandText[languageCode]||approvalBandText.en;
 const [currency,setCurrency]=useState('USD'),[role,setRole]=useState('OPERATOR'),[gradeId,setGradeId]=useState(null);
 const group={currency,role,gradeId},stored=rules.filter(row=>sameApprovalGroup(row,group));
 const rows=stored.length?stored:defaultApprovalBands(settings,grades,group);
 const gradeName=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.name||'';
 const update=(next,reflow=false)=>onChange(replaceApprovalGroup(rules,group,reflow?reflowApprovalBands(next,currency):next));
 const patch=(index,change,reflow=false)=>update(rows.map((row,i)=>index===i?{...row,...change}:row),reflow);
 const patchStage=(index,position,change)=>patch(index,{stages:rows[index].stages.map((stage,i)=>i===position?{...stage,...change}:stage)});
 const addMiddle=index=>{const stages=[...rows[index].stages];stages.splice(Math.max(0,stages.length-1),0,{role:'OPERATOR',gradeId:null});patch(index,{stages});};
 const moveMiddle=(index,position,delta)=>{const stages=[...rows[index].stages];[stages[position],stages[position+delta]]=[stages[position+delta],stages[position]];patch(index,{stages});};
 const addCondition=()=>{
  const next=[...rows],index=next.findIndex(row=>!boundedApprovalBand(row));
  const stage=next[index<0?Math.max(0,next.length-1):index]?.stages?.at(-1)||{role:role==='OPERATOR'?'ACCOUNTANT':'ADMIN',gradeId:role==='OPERATOR'?grades.find(row=>row.code==='CL2')?.id||null:null};
  next.splice(index<0?next.length:index,0,{id:crypto.randomUUID(),name:`${currency} / ${role}`,drafterRole:role,drafterGradeId:gradeId,currency,min:'0',max:'',__bounded:true,stages:[{...stage}]});update(next,true);
 };
 const roleOptions=['OPERATOR','ACCOUNTANT','ADMIN'].map(value=><MenuItem key={value} value={value}>{t[value]}</MenuItem>);
 const gradeOptions=grades.map(row=><MenuItem key={row.id} value={row.id}>{gradeName(row)}</MenuItem>);
 const nodeSx={width:174,minWidth:174,p:1.25,borderRadius:1.5,bgcolor:'background.paper'};
 const arrow=<ArrowForward sx={{color:'text.disabled',fontSize:18,flexShrink:0}}/>;
 return <Paper variant="outlined" data-testid="approval-conditions" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}>
  <Stack direction={{xs:'column',sm:'row'}} spacing={1.5} sx={{p:2}}>
   <TextField select size="small" label={t.drafterRole} value={role} disabled={disabled} sx={{width:{xs:'100%',sm:180}}} onChange={event=>{setRole(event.target.value);setGradeId(null);}}>{roleOptions}</TextField>
   <TextField select size="small" label={t.grade} value={gradeId||''} disabled={disabled} sx={{width:{xs:'100%',sm:200}}} onChange={event=>setGradeId(event.target.value||null)} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}}><MenuItem value="">{t.allGrades}</MenuItem>{gradeOptions}</TextField>
  </Stack>
  <Tabs value={currency} onChange={(_,value)=>setCurrency(value)} variant="scrollable" sx={{px:2,borderBottom:1,borderColor:'divider'}}>{['USD','KRW','VND'].map(value=><Tab key={value} value={value} label={value}/>)}</Tabs>
  <Box sx={{overflowX:'auto'}}><Box sx={{minWidth:740}}>
   <Box sx={{display:'grid',gridTemplateColumns:'240px minmax(0,1fr)',px:2,py:1,bgcolor:'action.hover',borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{t.condition}</Typography><Typography variant="subtitle2">{t.line}</Typography></Box>
   {!rows.length&&<Stack direction="row" spacing={2} alignItems="center" sx={{p:2}}><Typography variant="body2">{t.selfPolicy}</Typography></Stack>}
   {rows.map((row,index)=><Box key={row.id} data-approval-band={index} sx={{display:'grid',gridTemplateColumns:'240px minmax(0,1fr)',borderBottom:1,borderColor:'divider'}}>
    <Stack spacing={.75} justifyContent="center" sx={{px:2,py:2,borderRight:1,borderColor:'divider'}}>
     {boundedApprovalBand(row)?<><Stack direction="row" spacing={1} alignItems="center"><Typography variant="body2">{currency}</Typography><DecimalAmountField size="small" value={row.max??''} disabled={disabled} error={!row.max} onValueChange={max=>patch(index,{max,__bounded:true},true)} inputProps={{'aria-label':`${t.amount} ${currency} ${index+1}`,style:{textAlign:'right'}}} sx={{width:120}}/><Typography variant="body2" sx={{whiteSpace:'nowrap'}}>{t.under}</Typography></Stack>{row.min!=='0'&&<Typography variant="caption" color="text.secondary">{formatEditableDecimal(previousApprovalAmount(row.min,currency))} {t.over}</Typography>}</>:<Typography variant="body2">{row.min==='0'?t.unlimited:`${currency} ${formatEditableDecimal(previousApprovalAmount(row.min,currency))} ${t.over}`}</Typography>}
     {boundedApprovalBand(row)&&<Button size="small" color="inherit" disabled={disabled} sx={{alignSelf:'flex-start',minWidth:0,p:0,fontSize:11}} onClick={()=>update(rows.filter((_,i)=>i!==index),true)}>{t.remove}</Button>}
    </Stack>
    <Stack direction="row" alignItems="center" spacing={1} sx={{p:2,overflowX:'auto',minWidth:0}}>
     <Paper variant="outlined" sx={nodeSx}><Stack spacing={1}><Typography variant="caption" color="text.secondary">{t.drafter}</Typography><Typography variant="body2" sx={{minHeight:36,display:'flex',alignItems:'center'}}>{t[role]} / {gradeId?gradeName(grades.find(row=>row.id===gradeId)):t.allGrades}</Typography></Stack></Paper>
     {row.stages.map((stage,position)=>{const final=position===row.stages.length-1;return <React.Fragment key={position}>
      {final&&<Button data-add-middle={index} size="small" startIcon={<Add/>} disabled={disabled||row.stages.length>=10} sx={{flexShrink:0,width:112,lineHeight:1.4}} onClick={()=>addMiddle(index)}>{t.addMiddle}</Button>}{arrow}
      <Paper variant="outlined" data-band-stage={position} data-stage-final={final?'true':undefined} sx={nodeSx}><Stack spacing={.75}>
       <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{height:24}}><Typography variant="caption" color="text.secondary">{final?t.final:`${t.middle} ${position+1}`}</Typography>{!final&&<Stack direction="row"><IconButton size="small" aria-label={t.left} disabled={disabled||!position} onClick={()=>moveMiddle(index,position,-1)}><ChevronLeft fontSize="inherit"/></IconButton><IconButton size="small" aria-label={t.right} disabled={disabled||position>=row.stages.length-2} onClick={()=>moveMiddle(index,position,1)}><ChevronRight fontSize="inherit"/></IconButton><IconButton size="small" aria-label={t.remove} disabled={disabled} onClick={()=>patch(index,{stages:row.stages.filter((_,i)=>i!==position)})}><Close fontSize="inherit"/></IconButton></Stack>}</Stack>
       <TextField select size="small" value={stage.role} disabled={disabled} onChange={event=>patchStage(index,position,{role:event.target.value,...(event.target.value==='ADMIN'?{gradeId:null}:{})})} slotProps={{select:{'aria-label':`${t.role} ${index+1}-${position+1}`}}}>{roleOptions}</TextField>
       <TextField select size="small" value={stage.gradeId||''} disabled={disabled} error={stage.role!=='ADMIN'&&!stage.gradeId} onChange={event=>patchStage(index,position,{gradeId:event.target.value||null})} slotProps={{select:{displayEmpty:true,'aria-label':`${t.grade} ${index+1}-${position+1}`}}}><MenuItem value="">{stage.role==='ADMIN'?t.allGrades:t.selectGrade}</MenuItem>{stage.gradeId&&!grades.some(row=>row.id===stage.gradeId)&&<MenuItem value={stage.gradeId} disabled>{t.selectGrade}</MenuItem>}{gradeOptions}</TextField>
      </Stack></Paper>
     </React.Fragment>;})}
    </Stack>
   </Box>)}
  </Box></Box>
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:2,py:1.5}}><Button startIcon={<Add/>} disabled={disabled||rules.length-stored.length+rows.length>=30} onClick={addCondition}>{t.addCondition}</Button>{stored.length>0&&rows.at(-1)&&boundedApprovalBand(rows.at(-1))&&<Typography variant="caption" color="text.secondary">{t.fallback}</Typography>}</Stack>
 </Paper>;
}
