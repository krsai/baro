import React from 'react';
import {Box,Button,Typography} from '@mui/material';
import StatusLabel from './StatusLabel';
import {approvalStepLabels,approvalStepTone} from '../utils/approvalStepState.mjs';

export default function ApprovalLineSummary({cells,languageCode,onClick,disabled,label,testId='approval-line-summary',stagesTestId,readOnly=false}){
 const Root=readOnly?Box:Button;
 const labels=approvalStepLabels[languageCode]||approvalStepLabels.en;
 return <Root {...(!readOnly?{variant:'text',disabled,onClick}:{})} aria-label={label} data-testid={testId} sx={{p:0,minWidth:0,maxWidth:cells.length*174,width:'100%',textTransform:'none',borderRadius:1}}>
  <Box data-testid={stagesTestId} sx={{display:'grid',gridTemplateRows:'auto auto',gridTemplateColumns:`repeat(${cells.length},minmax(0,1fr))`,maxWidth:'100%',width:'100%'}}>
   {cells.map(cell=><Box key={cell.key} data-approval-summary-cell sx={{width:'100%',maxWidth:'100%',minWidth:0,boxSizing:'border-box',p:.75,display:'grid',gridTemplateRows:'subgrid',gridRow:'span 2',gap:.25}}>
    <Typography variant="caption" color="text.secondary" title={cell.label} data-approval-summary-title sx={{fontSize:11,textAlign:'center',width:'100%',overflowWrap:'anywhere'}}>{cell.label}</Typography>
    {cell.name==='—'?<Typography variant="body2" color="text.disabled" sx={{textAlign:'center',minHeight:40,flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>—</Typography>:<StatusLabel tone={approvalStepTone(cell.status)} label={<><span>{cell.name}</span><span style={{fontSize:10}}>{cell.stateLabel||labels[cell.status]}</span></>} title={cell.description||cell.name} aria-label={cell.description||cell.name} data-approval-state={cell.status} sx={{height:'auto',minHeight:40,flex:1,borderRadius:.75,width:'100%',minWidth:0,'& .MuiChip-label':{px:1,py:.5,fontSize:12,display:'flex',flexDirection:'column',gap:.125,whiteSpace:'normal',overflowWrap:'anywhere',lineHeight:1.3}}}/>}
   </Box>)}
  </Box>
 </Root>;
}
