import React from 'react';
import {Box,Stack} from '@mui/material';
import {billRouteFields,billFreightFields} from '../utils/billFormLayout.mjs';

// Follow the reference's party/route column and full-width document tables.
export default function BillDocumentForm({field,numberField,issuerField,masterField,logo,logoActions,logoLabel,containerField}){
 const cell={minWidth:0},table={display:'grid',gap:2,minWidth:0};
 const cargoCell={...cell,display:'flex',flexDirection:'column',
  '& > .MuiTextField-root':{width:'100%',flex:{md:1}},
  '& .MuiInputBase-root':{flex:{md:1},height:{md:'auto'},alignItems:{md:'flex-start'}},
 };
 return <>
  {masterField&&<Stack spacing={1.5}>
   {masterField&&<Box sx={{maxWidth:{md:440}}}>{masterField}</Box>}
  </Stack>}
  <Stack data-shipping-bl-form data-bl-document-layout spacing={2}>
   <Box data-bl-region="identity" sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'1fr 1fr'},gap:2,alignItems:'start'}}>
    <Box data-bl-parties sx={{minWidth:0}}>
     <Stack spacing={2}>{['shipper','consignee','notify'].map(key=><Box key={key} sx={cell}>{field(key,true)}</Box>)}</Stack>
     <Box data-bl-region="route" sx={{...table,mt:2,gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'}}}>{billRouteFields.map(key=><Box key={key} sx={{...cell}}>{field(key)}</Box>)}</Box>
    </Box>
    <Stack data-bl-identity spacing={2} sx={cell}><Box data-bl-number sx={{'& .MuiInputBase-input':{textAlign:'right'}}}>{numberField}</Box><Stack data-bl-logo spacing={1} alignItems="center">
     {logo&&<Box component="img" alt={logoLabel} src={logo} sx={{width:{xs:280,md:360},maxWidth:'100%',height:{xs:96,md:120},objectFit:'contain'}}/>}
     {logoActions}
    </Stack></Stack>
   </Box>
   <Stack data-bl-cargo-group spacing={1}>
    <Box data-bl-region="cargo" sx={{...table,gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'24fr 10fr 38fr 14fr 14fr'},alignItems:{xs:'start',md:'stretch'}}}>
     <Box data-bl-cargo-cell="marks" sx={{...cargoCell,gridColumn:{xs:'1 / -1',md:'auto'}}}>{field('marks',true)}</Box>
     <Stack data-bl-cargo-cell="quantity" spacing={1} sx={{...cargoCell,'& > .MuiTextField-root:last-child':{flex:'0 0 auto','& .MuiInputBase-root':{height:'auto'}}}}>{field('quantity')}{field('unit')}</Stack>
     <Box data-bl-cargo-cell="cargo" sx={{...cargoCell,gridColumn:{xs:'1 / -1',md:'auto'},gridRow:{xs:2,md:'auto'}}}>{field('cargo',true)}</Box>
     <Box data-bl-cargo-cell="weightKg" sx={cargoCell}>{field('weightKg')}</Box><Box data-bl-cargo-cell="cbm" sx={cargoCell}>{field('cbm')}</Box>
    </Box>
    {containerField&&<Box data-bl-region="containers" sx={cell}>{containerField}</Box>}
   </Stack>
   <Box sx={{...cell}}>{field('totalPackagesWords')}</Box>
   <Box data-bl-region="freight" sx={{...table,gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',md:'24fr 16fr 16fr 10fr 17fr 17fr'},}}>{billFreightFields.map(key=><Box key={key} sx={{...cell}}>{field(key)}</Box>)}</Box>
   <Box data-bl-region="issue" sx={{...table,gridTemplateColumns:{xs:'minmax(0,1fr)',md:'24fr 36fr 40fr'}}}>
    <Box sx={cell}>{field('freightPayableAt')}</Box><Box sx={cell}>{field('originalCount')}</Box>
    <Box sx={{...cell,display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'1fr 1fr'},gap:1}}>{field('issuePlace')}{field('issueDate')}</Box>
   </Box>
   <Box data-bl-region="delivery" sx={{...table,gridTemplateColumns:{xs:'minmax(0,1fr)',md:'1fr 1fr'}}}>
    <Box sx={cell}>{field('deliveryAgent',true)}</Box>
    <Stack spacing={2} sx={{...cell,justifyContent:'flex-end'}}>{field('onBoardDate')}{issuerField}</Stack>
   </Box>
  </Stack>
 </>;
}
