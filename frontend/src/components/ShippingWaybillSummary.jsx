import React from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Box,Paper,Stack,Typography} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {FreightJobDetails} from './FreightJobEditor';
import {shippingWorkbenchText} from '../constants/shippingWorkbench';
import {freightJobEditorText} from '../constants/freightJobEditor';
import {shippingModeLabel,shippingRequestDate} from '../utils/shippingPresentation';
import {jobText} from '../constants/freightJobs';
import {routeLocations} from '../utils/shippingRoute.mjs';
import {routeNodes,routeScopeText} from '../constants/freightRouteScope';

export default function ShippingWaybillSummary({job,languageCode,name}){
 const t=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en,e=freightJobEditorText[languageCode]||freightJobEditorText.en,r=routeScopeText[languageCode]||routeScopeText.en,d=job.data,locations=routeLocations(d,job.mode);
 const value=(label,text)=><Stack key={label} direction="row" spacing={.75} sx={{minWidth:0}}><Typography variant="caption" color="text.secondary" sx={{whiteSpace:'nowrap'}}>{label}</Typography><Typography variant="body2" noWrap title={text}>{text||'—'}</Typography></Stack>;
 return <Stack spacing={1}>
  <Paper variant="outlined" sx={{p:1.5}}><Stack spacing={1.25}>
   <Stack direction="row" useFlexGap flexWrap="wrap" gap={2}>{value((jobText[languageCode]||jobText.en).customer,name(d.customer))}{value((jobText[languageCode]||jobText.en).mode,shippingModeLabel(job,languageCode))}{value(t.summaryDate,shippingRequestDate(job))}{job.bills?.length>0&&value('Master / House',job.bills.map(bill=>bill.number).join(' / '))}</Stack>
   <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:d.notifySameAsConsignee?'repeat(2,minmax(0,1fr))':'repeat(3,minmax(0,1fr))'},gap:1.5,py:1,borderTop:1,borderBottom:1,borderColor:'divider'}}>{['shipper','consignee',...(!d.notifySameAsConsignee?['notify']:[])].map(role=>{const party=d[role+'Party'],lines=d[role]?.split('\n')||[];return <Box key={role} sx={{minWidth:0}}><Typography variant="caption" color="text.secondary">{e[role]}{role==='consignee'&&d.notifySameAsConsignee?' / NOTIFY':''}</Typography><Typography variant="body2" fontWeight={600} noWrap title={party?.name||lines[0]}>{party?.name||lines[0]||'—'}</Typography><Typography variant="body2" noWrap title={party?.address||lines.slice(1).join(', ')}>{party?.address||lines.slice(1).join(', ')||'—'}</Typography></Box>;})}</Box>
   <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} alignItems="center">{routeNodes(job.mode).filter(node=>locations[node]).map((node,index)=><React.Fragment key={node}>{index>0&&<Typography color="text.secondary">→</Typography>}<Typography variant="body2" title={locations[node]} sx={{maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.routeLocationDetails?.[node]?.label||locations[node]}</Typography></React.Fragment>)}</Stack>
   <Stack direction="row" useFlexGap flexWrap="wrap" gap={2}>{d.cargo&&value(e.cargo,d.cargo)}{d.quantity&&value(e.quantity,[d.quantity,d.unit].filter(Boolean).join(' '))}{d.weightKg&&value(e.weightKg,String(d.weightKg))}{d.cbm&&value(e.cbm,String(d.cbm))}{d.containerCount&&value(e.containerCount,String(d.containerCount))}{d.plannedDate&&value(e.plannedDate,d.plannedDate)}</Stack>
  </Stack></Paper>
  <Accordion disableGutters elevation={0} sx={{border:1,borderColor:'divider',borderRadius:1,'&:before':{display:'none'}}}><AccordionSummary expandIcon={<ExpandMoreIcon/>}><Typography variant="body2">{t.details}</Typography></AccordionSummary><AccordionDetails sx={{p:1}}><FreightJobDetails job={job}/></AccordionDetails></Accordion>
 </Stack>;
}
