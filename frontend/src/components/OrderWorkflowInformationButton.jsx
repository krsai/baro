import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import InformationButton from './InformationButton';
import StatusLabel from './StatusLabel';
import {ORDER_WORKFLOW_KEYS,ORDER_WORKFLOW_TONES,getOrderWorkflowLabel} from '../constants/orderWorkflow.mjs';
import {orderWorkflowInformation} from '../constants/orderWorkflowInformation.mjs';

export default function OrderWorkflowInformationButton({languageCode='en'}){
 return <InformationButton content={orderWorkflowInformation} languageCode={languageCode} renderContent={text=><Stack spacing={2}>
  {ORDER_WORKFLOW_KEYS.map((status,index)=>{
   const label=getOrderWorkflowLabel(status,languageCode),paragraph=text.paragraphs[index],prefix=label+':';
   return <Stack key={status} data-order-workflow-explanation={status} direction={{xs:'column',sm:'row'}} spacing={1.5} alignItems="flex-start">
    <Box sx={{width:{sm:110},flexShrink:0}}><StatusLabel label={label} tone={ORDER_WORKFLOW_TONES[status]}/></Box>
    <Typography variant="body2" sx={{minWidth:0,overflowWrap:'anywhere'}}>{paragraph.startsWith(prefix)?paragraph.slice(prefix.length).trim():paragraph}</Typography>
   </Stack>;
  })}
  {text.paragraphs.slice(ORDER_WORKFLOW_KEYS.length).map((paragraph,index)=><Typography key={index} variant="body2" sx={{overflowWrap:'anywhere'}}>{paragraph}</Typography>)}
 </Stack>}/>;
}
