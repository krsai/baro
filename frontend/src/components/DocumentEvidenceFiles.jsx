import React from 'react';
import {Box,Stack,TextField,Typography} from '@mui/material';
import AddActionButton from './AddActionButton';
import DeleteActionButton from './DeleteActionButton';
import {documentEvidenceText,normalizeEvidencePath,validDocumentEvidence} from '../utils/documentEvidence.mjs';

export default function DocumentEvidenceFiles({value=[],previous=[],onChange,disabled=false,languageCode,managementNumber}){
 const t=documentEvidenceText[languageCode]||documentEvidenceText.en;
 const change=(index,patch)=>onChange(value.map((item,i)=>i===index?{...item,...patch}:item));
 return <Stack spacing={1.5} sx={{p:2,borderBottom:1,borderColor:'divider'}} data-document-evidence>
  <Stack direction="row" alignItems="center" spacing={1}><Typography fontWeight={600} sx={{flex:1}}>{t.title}{managementNumber?' · '+managementNumber:''}</Typography>{onChange&&<AddActionButton showLabel aria-label={t.add} disabled={disabled||value.length>=50} onClick={()=>onChange([...value,{reference:'',path:''}])}/>}</Stack>
  {value.map((item,index)=><Box key={index} sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr) auto',sm:'minmax(120px,1fr) minmax(0,3fr) auto'},gap:1,alignItems:'start'}}>
   <TextField data-text-case="preserve" size="small" label={t.reference} value={item.reference} disabled={disabled||!onChange} inputProps={{maxLength:500,'data-text-case':'preserve'}} onChange={event=>change(index,{reference:event.target.value})}/>
   <TextField data-text-case="preserve" size="small" label={t.path} value={normalizeEvidencePath(item.path)} disabled={disabled||!onChange} error={Boolean(onChange)&&!validDocumentEvidence([item],previous)} inputProps={{maxLength:500,'data-text-case':'preserve'}} sx={{gridColumn:{xs:1,sm:'auto'},gridRow:{xs:2,sm:'auto'}}} onChange={event=>change(index,{path:normalizeEvidencePath(event.target.value)})}/>
   {onChange&&<DeleteActionButton aria-label={t.remove} title={t.remove} disabled={disabled} sx={{gridColumn:{xs:2,sm:3},gridRow:{xs:'1 / span 2',sm:'auto'}}} onClick={()=>onChange(value.filter((_,i)=>i!==index))}/>}
  </Box>)}
 </Stack>;
}
