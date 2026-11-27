import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import InvoiceSheet from './InvoiceSheet';
import {billRouteFields,billFreightFields} from '../utils/billFormLayout.mjs';

// The sample's document regions are shared by Master and House, not rebuilt
// as unrelated cards. Mobile keeps the same reading order without tiny text.
export default function BillDocumentForm({field,numberField,issuerField,masterField,logo,logoActions,logoActionsLabel,containerField,air=false}){
 const region={p:{xs:1.5,md:2},minWidth:0,borderColor:'divider'};
 return <>
  {logoActions&&<Box component="details" sx={{border:1,borderColor:'divider',borderRadius:1,p:1}}><Typography component="summary" sx={{cursor:'pointer'}}>{logoActionsLabel}</Typography><Box sx={{pt:1}}>{logoActions}</Box></Box>}
  <InvoiceSheet data-shipping-bl-form data-bl-document-layout sx={{borderRadius:1}}>
  <Box data-bl-region="identity" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'1fr 1fr'},alignItems:'stretch'}}>
   <Stack data-bl-parties spacing={2} sx={{...region,borderRight:{md:1},borderColor:'divider','& > .MuiTextField-root':{flex:1},'& .MuiInputBase-root':{height:'100%',alignItems:'flex-start'}}}>{['shipper','consignee','notify'].map(key=>field(key,true))}</Stack>
   <Box data-bl-identity sx={{...region,display:'grid',gridTemplateRows:'auto minmax(150px,1fr) auto',gap:2,borderTop:{xs:1,md:0},borderColor:'divider'}}>
    <Box>{numberField}</Box>
    <Stack spacing={2} alignItems="center" justifyContent="center" sx={{py:1,minWidth:0}}>
     {logo&&<Box component="img" alt="BL Issuer Logo" src={logo} sx={{width:'min(100%, 280px)',height:76,objectFit:'contain'}}/>}
     <Typography component="h2" align="center" sx={{fontSize:{xs:18,md:20},fontWeight:700,lineHeight:1.35,letterSpacing:0.3}}>{air?'AIR WAYBILL':'COMBINED TRANSPORT'}{!air&&<><br/>BILL OF LADING</>}</Typography>
    </Stack>
    <Stack spacing={2}>{issuerField}{masterField}</Stack>
   </Box>
  </Box>
  <Box data-bl-region="route" sx={{...region,borderTop:1,borderColor:'divider',display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:1.25}}>{billRouteFields.map(key=>field(key))}</Box>
  {containerField&&<Box data-bl-region="containers" sx={{...region,borderTop:1,borderColor:'divider'}}>{containerField}</Box>}
  <Box data-bl-region="cargo" sx={{...region,borderTop:1,borderColor:'divider',display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'1.2fr 1fr 2.4fr 1fr 1fr'},gap:1.5,alignItems:'start'}}>
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
