import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import InvoiceSheet from './InvoiceSheet';
import {billRouteFields,billFreightFields} from '../utils/billFormLayout.mjs';

// The sample's document regions are shared by Master and House, not rebuilt
// as unrelated cards. Mobile keeps the same reading order without tiny text.
export default function BillDocumentForm({field,numberField,issuerField,masterField,logo,logoActions,logoActionsLabel,air=false}){
 const region={p:1.25,minWidth:0,borderColor:'divider'};
 return <>
  {logoActions&&<Box component="details" sx={{border:1,borderColor:'divider',borderRadius:1,p:1}}><Typography component="summary" sx={{cursor:'pointer'}}>{logoActionsLabel}</Typography><Box sx={{pt:1}}>{logoActions}</Box></Box>}
  <InvoiceSheet data-shipping-bl-form data-bl-document-layout sx={{borderRadius:1}}>
  <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'1fr 1fr'}}}>
   <Stack spacing={1.5} sx={{...region,borderRight:{md:1},borderColor:'divider'}}>{['shipper','consignee','notify'].map(key=>field(key,true))}</Stack>
   <Stack spacing={1.5} sx={region}>
    {numberField}
    <Box sx={{minHeight:80,display:'flex',justifyContent:'center',alignItems:'center'}}>{logo?<Box component="img" alt="BL Issuer Logo" src={logo} sx={{maxWidth:'100%',maxHeight:100,objectFit:'contain'}}/>:issuerField}</Box>
    {logo&&issuerField}
    <Typography component="h2" align="center" variant="h5">{air?'AIR WAYBILL':'COMBINED TRANSPORT'}{!air&&<><br/>BILL OF LADING</>}</Typography>
    {masterField}
   </Stack>
  </Box>
  <Box data-bl-region="route" sx={{...region,borderTop:1,borderColor:'divider',display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:1.25}}>{billRouteFields.map(key=>field(key))}</Box>
  <Box data-bl-region="cargo" sx={{...region,borderTop:1,borderColor:'divider',display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'1.2fr .8fr 2.4fr 1fr 1fr'},gap:1,alignItems:'start'}}>
   <Box sx={{gridColumn:{xs:'1 / -1',md:'auto'}}}>{field('marks',true)}</Box>
   <Stack spacing={1}>{field('quantity')}{field('unit')}</Stack>
   <Box sx={{gridColumn:{xs:'1 / -1',md:'auto'},gridRow:{xs:2,md:'auto'}}}>{field('cargo',true)}</Box>
   {field('weightKg')}{field('cbm')}
  </Box>
  <Box sx={{...region,borderTop:1,borderColor:'divider'}}>{field('totalPackagesWords')}</Box>
  <Box data-bl-region="freight" sx={{...region,borderTop:1,borderColor:'divider',display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'1.4fr 1fr .8fr .6fr 1fr 1fr'},gap:1}}>{billFreightFields.map(key=>field(key))}</Box>
  <Box sx={{...region,borderTop:1,borderColor:'divider',display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'repeat(4,minmax(0,1fr))'},gap:1}}>{['freightPayableAt','originalCount','issuePlace','issueDate'].map(key=>field(key))}</Box>
  <Box data-bl-region="delivery" sx={{...region,borderTop:1,borderColor:'divider',display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'1fr 1fr'},gap:1.5}}>
   {field('deliveryAgent',true)}<Stack spacing={1}>{field('onBoardDate')}<Typography align="center" variant="caption">Issuer Signature — Not Executed</Typography></Stack>
  </Box>
 </InvoiceSheet></>;
}
