import React from 'react';
import {Box,Stack,Typography} from '@mui/material';
import InvoiceSheet from './InvoiceSheet';
import {billRouteFields,billFreightFields} from '../utils/billFormLayout.mjs';

// Follow the reference's party/route column and full-width document tables.
export default function BillDocumentForm({field,numberField,issuerField,masterField,logo,logoActions,logoActionsLabel,containerField,air=false,surrenderStatus,onBoardDate}){
 const rule='#233b66',cell={p:1.25,minWidth:0};
 const table={display:'grid',borderTop:1,borderColor:rule};
 const cargoCell={...cell,borderRight:{md:'1px solid '+rule},'&:last-child':{borderRight:0},minHeight:{md:320},'& .MuiTextField-root':{width:'100%'}};
 return <>
  {(masterField||logoActions)&&<Stack spacing={1.5}>
   {masterField&&<Box sx={{maxWidth:{md:440}}}>{masterField}</Box>}
   {logoActions&&<Box component="details" sx={{border:1,borderColor:'divider',borderRadius:1,p:1}}><Typography component="summary" sx={{cursor:'pointer'}}>{logoActionsLabel}</Typography><Box sx={{pt:1}}>{logoActions}</Box></Box>}
  </Stack>}
  <InvoiceSheet data-shipping-bl-form data-bl-document-layout sx={{borderRadius:0,border:0,p:{xs:1,md:2},color:rule,
   '& .MuiInputLabel-root':{position:'static',transform:'none',maxWidth:'100%',whiteSpace:'normal',overflow:'visible',fontSize:10,lineHeight:1.25,mb:0.5,color:rule,textTransform:'uppercase'},
   '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline':{border:0},
   '& .MuiOutlinedInput-root':{borderRadius:0,p:0,minHeight:28,height:'auto',alignItems:'flex-start','&:hover':{bgcolor:'#f6f8fc'},'&.Mui-focused':{bgcolor:'#edf4ff',boxShadow:'inset 0 -2px 0 #2878f5'}},
   '& .MuiInputBase-input':{p:'3px 4px',height:'auto',fontSize:12,lineHeight:1.5},
   '& textarea.MuiInputBase-input':{resize:'none'}
  }}>
   <Box data-bl-region="identity" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'1fr 1fr'},columnGap:{md:3},alignItems:'stretch'}}>
    <Box data-bl-parties sx={{minWidth:0}}>
     <Stack>{['shipper','consignee','notify'].map(key=><Box key={key} sx={{borderTop:'1px solid '+rule,pt:1.75,pb:1.5}}>{field(key,true)}</Box>)}</Stack>
     <Box data-bl-region="route" sx={{...table,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'}}}>{billRouteFields.map(key=><Box key={key} sx={{...cell,px:0.75,pt:1.5,borderBottom:'1px solid '+rule}}>{field(key)}</Box>)}</Box>
    </Box>
    <Stack data-bl-identity spacing={2} sx={{minWidth:0,pt:{xs:2,md:0},pb:2}}>
     <Box sx={{alignSelf:'flex-end',width:{xs:'100%',md:'82%'},border:1,borderColor:rule,p:0.75}}>{numberField}</Box>
     {logo&&<Box component="img" alt="BL Issuer Logo" src={logo} sx={{alignSelf:'center',width:'min(100%, 300px)',height:90,objectFit:'contain'}}/>}
     <Typography component="h2" align="center" sx={{fontWeight:800,lineHeight:1.1,letterSpacing:0.5,fontSize:{xs:22,md:26}}}>
      {!air&&<Box component="span" sx={{display:'block',fontSize:13,letterSpacing:1}}>COMBINED TRANSPORT</Box>}{air?'AIR WAYBILL':'BILL OF LADING'}
     </Typography>
    </Stack>
   </Box>
   {containerField&&<Box data-bl-region="containers" sx={{...cell,borderTop:1,borderColor:rule}}>{containerField}</Box>}
   <Box data-bl-region="cargo" sx={{...table,gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'24fr 10fr 38fr 14fr 14fr'},position:'relative'}}>
    <Box sx={{...cargoCell,gridColumn:{xs:'1 / -1',md:'auto'}}}>{field('marks',true)}</Box>
    <Stack spacing={1} sx={cargoCell}>{field('quantity')}{field('unit')}</Stack>
    <Box sx={{...cargoCell,gridColumn:{xs:'1 / -1',md:'auto'},gridRow:{xs:2,md:'auto'}}}>{field('cargo',true)}</Box>
    <Box sx={cargoCell}>{field('weightKg')}</Box><Box sx={cargoCell}>{field('cbm')}</Box>
    {!air&&(surrenderStatus==='CONFIRMED'||onBoardDate)&&<Stack data-bl-onboard-mark spacing={0.75} sx={{gridColumn:'1 / -1',position:{md:'absolute'},right:{md:0},top:{md:110},width:{md:'28%'},alignSelf:'center',alignItems:'center',zIndex:1,p:1,pointerEvents:'none'}}>
     {surrenderStatus==='CONFIRMED'&&<Typography sx={{fontSize:{xs:20,md:24},fontStyle:'italic',fontWeight:400}}>SURRENDERED</Typography>}
     {onBoardDate&&<Typography align="center" sx={{fontSize:12}}>LOADED ON BOARD<br/>{onBoardDate}</Typography>}
    </Stack>}
   </Box>
   <Box sx={{...cell,borderTop:1,borderColor:rule}}>{field('totalPackagesWords')}</Box>
   <Box data-bl-region="freight" sx={{...table,gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'24fr 16fr 16fr 10fr 17fr 17fr'},}}>{billFreightFields.map(key=><Box key={key} sx={{...cell,minHeight:{md:125},borderRight:'1px solid '+rule,'&:last-child':{borderRight:0}}}>{field(key)}</Box>)}</Box>
   <Box data-bl-region="issue" sx={{...table,gridTemplateColumns:{xs:'minmax(0,1fr)',md:'24fr 36fr 40fr'}}}>
    <Box sx={cell}>{field('freightPayableAt')}</Box><Box sx={cell}>{field('originalCount')}</Box>
    <Box sx={{...cell,display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'1fr 1fr'},gap:1}}>{field('issuePlace')}{field('issueDate')}</Box>
   </Box>
   <Box data-bl-region="delivery" sx={{...table,gridTemplateColumns:{xs:'minmax(0,1fr)',md:'1fr 1fr'},borderBottom:2,borderColor:rule}}>
    <Box sx={cell}>{field('deliveryAgent',true)}</Box>
    <Stack spacing={2} sx={{...cell,justifyContent:'flex-end'}}>{field('onBoardDate')}{issuerField}<Typography align="center" variant="caption">Issuer Signature — Not Executed</Typography></Stack>
   </Box>
  </InvoiceSheet>
 </>;
}
