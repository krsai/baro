import React from 'react';
import {Box,Button,Typography} from '@mui/material';
import StatusLabel from './StatusLabel';
import {approvalStepLabels,approvalStepTone} from '../utils/approvalStepState.mjs';

export default function ApprovalLineSummary({cells,languageCode,onClick,disabled,label,testId='approval-line-summary',stagesTestId}){
 const labels=approvalStepLabels[languageCode]||approvalStepLabels.en;
 return <Button variant="text" disabled={disabled} onClick={onClick} aria-label={label} data-testid={testId} sx={{p:0,minWidth:0,maxWidth:'100%',width:'fit-content',textTransform:'none',borderRadius:1}}>
  <Box data-testid={stagesTestId} sx={{display:'flex',flexWrap:'wrap',maxWidth:'100%',width:'fit-content'}}>
   {cells.map(cell=><Box key={cell.key} data-approval-summary-cell sx={{width:150,maxWidth:'100%',minWidth:0,boxSizing:'border-box',p:.75,display:'flex',flexDirection:'column',gap:.25}}>
    <Typography variant="caption" color="text.secondary" title={cell.label} data-approval-summary-title sx={{fontSize:11,textAlign:'center',width:'100%',overflowWrap:'anywhere'}}>{cell.label}</Typography>
    {cell.name==='—'?<Typography variant="body2" color="text.disabled" sx={{textAlign:'center'}}>—</Typography>:<StatusLabel tone={approvalStepTone(cell.status)} label={<><span>{cell.name}</span><span style={{fontSize:10}}>{cell.stateLabel||labels[cell.status]}</span></>} title={cell.description||cell.name} aria-label={cell.description||cell.name} data-approval-state={cell.status} sx={{height:'auto',minHeight:22,borderRadius:.75,width:'100%',minWidth:0,'& .MuiChip-label':{px:.75,py:.25,fontSize:12,display:'flex',flexDirection:'column',gap:.125,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.3}}}/>}
   </Box>)}
  </Box>
 </Button>;
}
