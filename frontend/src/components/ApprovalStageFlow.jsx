import React from 'react';
import {ArrowForward} from '@mui/icons-material';
import {Paper,Stack,Typography} from '@mui/material';
import ApprovalStagePerson from './ApprovalStagePerson';
import {approvalBandText} from '../constants/approvalBands';
import {approvalLineText} from '../constants/approvalLine';

export default function ApprovalStageFlow({drafter,stages=[],grades=[],languageCode,value={},onChange,disabled}){
 const t=approvalBandText[languageCode]||approvalBandText.en,line=approvalLineText[languageCode]||approvalLineText.en;
 const cardSx={p:1.5,width:240,minWidth:240,alignSelf:'stretch',boxSizing:'border-box'};
 return <Stack data-testid="approval-dialog-flow" direction="row" alignItems="center" sx={{overflowX:'auto',py:1}}>
  <Paper variant="outlined" data-approval-flow-card="drafter" sx={cardSx}><Typography variant="subtitle2" sx={{mb:1.5,textAlign:'center'}}>{t.drafter}</Typography>{drafter&&<ApprovalStagePerson stage={{key:'drafter',role:drafter.orgRole,gradeId:drafter.gradeId,employeeId:drafter.id,candidates:[drafter]}} personLabel={line.name} grades={grades} languageCode={languageCode} disabled onChange={()=>{}}/>}</Paper>
  {stages.map((stage,index)=><React.Fragment key={stage.key}><ArrowForward data-flow-arrow sx={{fontSize:18,width:24,minWidth:24,color:'text.disabled'}}/><Paper variant="outlined" data-approval-flow-card={stage.key} sx={cardSx}><Typography variant="subtitle2" sx={{mb:1.5,textAlign:'center'}}>{index===stages.length-1?t.final:`${t.middle} ${index+1}`}</Typography><ApprovalStagePerson stage={{...stage,final:index===stages.length-1}} personLabel={line.name} value={value?.[stage.key+'EmployeeId']} onChange={employeeId=>onChange(stage.key,employeeId)} grades={grades} languageCode={languageCode} disabled={disabled||stage.key==='final-self'}/></Paper></React.Fragment>)}
 </Stack>;
}
