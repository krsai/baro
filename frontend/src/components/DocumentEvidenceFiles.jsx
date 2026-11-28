import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Stack,TextField,Typography} from '@mui/material';
import AppNotice from './AppNotice';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {nasEvidence,evidenceFileName,evidenceAttachmentText,readEvidenceFile,downloadEvidenceFile} from '../utils/evidenceAttachments.mjs';
import AddActionButton from './AddActionButton';
import DeleteActionButton from './DeleteActionButton';
import {documentEvidenceText,normalizeEvidencePath,validDocumentEvidence} from '../utils/documentEvidence.mjs';

export default function DocumentEvidenceFiles({value=[],previous=[],onChange,disabled=false,languageCode,managementNumber,orgId,purpose,onBusyChange}){
 const t=documentEvidenceText[languageCode]||documentEvidenceText.en;
 const a=evidenceAttachmentText[languageCode]||evidenceAttachmentText.en;
 const [storage,setStorage]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[pending,setPending]=useState(null);
 const input=useRef(),live=useRef(''),lock=useRef(false),values=useRef(value);values.current=value;
 const scope=String(orgId||'')+':'+String(purpose||''),generation=useRef({scope,revision:0});if(generation.current.scope!==scope)generation.current={scope,revision:generation.current.revision+1};live.current=scope+'#'+generation.current.revision;
 useEffect(()=>()=>{live.current='';},[]);
 useEffect(()=>{setStorage(null);setPending(null);setError('');setBusy(false);lock.current=false;if(!orgId||!purpose||!onChange)return;let active=true;
  requestJSON('/evidence-attachments/status'+buildQueryString({orgId,purpose}),{skipCache:true}).then(result=>{if(active)setStorage(result);}).catch(()=>{if(active)setStorage({failed:true});});return()=>{active=false;};
 },[scope,retry,Boolean(onChange)]);
 const upload=async submission=>{
  if(lock.current||disabled||!storage?.configured)return;
  const started=live.current;lock.current=started;setBusy(true);setError('');
  try{
   if(values.current.length>=50)throw Object.assign(Error('limit'),{status:400});
   const payload=submission.payload||{clientKey:submission.clientKey,fileName:submission.file.name,contentBase64:await readEvidenceFile(submission.file)};submission={...submission,payload};
   if(live.current!==started)return;
   const saved=await requestJSON('/evidence-attachments'+buildQueryString({orgId,purpose}),{method:'POST',body:JSON.stringify(payload)});
   if(live.current===started){if(!values.current.some(item=>item.path===saved.path))onChange([...values.current,saved]);setPending(null);}
  }catch(e){if(live.current===started){const uncertain=!e.status||e.status>=500;setPending(uncertain?submission:null);setError(e.message==='limit'?a.tooMany:uncertain?a.unknown:['EVIDENCE_FILE_TYPE','EVIDENCE_FILE_SIZE','EVIDENCE_FILE_INVALID'].includes(e.message)?a.invalid:a.failed);}}
  finally{if(lock.current===started)lock.current=false;if(live.current===started)setBusy(false);}
 };
 useEffect(()=>{onBusyChange?.(busy||Boolean(pending));return()=>onBusyChange?.(false);},[busy,pending,onBusyChange]);
 const choose=event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)||!file.size||file.size>5*1024*1024){setError(a.invalid);return;}upload({file,clientKey:crypto.randomUUID()});};
 const download=async item=>{if(lock.current)return;const started=live.current;lock.current=started;setBusy(true);setError('');try{const file=await requestJSON('/evidence-attachments/'+item.path.split('/')[2]+'/content'+buildQueryString({orgId}),{skipCache:true});if(live.current===started)downloadEvidenceFile(file);}catch{if(live.current===started)setError(a.failed);}finally{if(lock.current===started)lock.current=false;if(live.current===started)setBusy(false);}};
 const change=(index,patch)=>onChange(value.map((item,i)=>i===index?{...item,...patch}:item));
 return <Stack spacing={1.5} sx={{p:2,borderBottom:1,borderColor:'divider'}} data-document-evidence>
  <Stack direction="row" alignItems="center" spacing={1} useFlexGap flexWrap="wrap"><Typography fontWeight={600} sx={{flex:1}}>{t.title}{managementNumber?' · '+managementNumber:''}</Typography>{onChange&&<>
   {orgId&&purpose&&<><input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" hidden onChange={choose}/><Button variant="outlined" disabled={disabled||busy||Boolean(pending)||!storage?.configured||value.length>=50} onClick={()=>input.current.click()}>{busy?a.uploading:a.attach}</Button>
    {!storage&&<Typography variant="caption">{a.loading}</Typography>}{storage&&!storage.configured&&!storage.failed&&<Typography variant="caption">{a.notConfigured}</Typography>}
    {storage?.failed&&<AppNotice severity="error" action={<Button disabled={busy} onClick={()=>setRetry(n=>n+1)}>{a.retry}</Button>}>{a.failed}</AppNotice>}</>}
   <AddActionButton showLabel aria-label={t.add} disabled={disabled||busy||Boolean(pending)||value.length>=50} onClick={()=>onChange([...value,{reference:'',path:''}])}/>
  </>}</Stack>
  {error&&<AppNotice severity="error" action={pending?<Button disabled={disabled||busy} onClick={()=>upload(pending)}>{a.retry}</Button>:undefined}>{error}</AppNotice>}
  {value.map((item,index)=><Box key={index} sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr) auto',sm:'minmax(120px,1fr) minmax(0,3fr) auto'},gap:1,alignItems:'start'}}>
   <TextField data-text-case="preserve" size="small" label={t.reference} value={item.reference} disabled={disabled||busy||Boolean(pending)||!onChange} inputProps={{maxLength:500,'data-text-case':'preserve'}} onChange={event=>change(index,{reference:event.target.value})}/>
   {nasEvidence(item)?<Stack direction="row" alignItems="center" spacing={1} sx={{minWidth:0,gridColumn:{xs:1,sm:'auto'},gridRow:{xs:2,sm:'auto'}}}><Typography sx={{overflowWrap:'anywhere',flex:1}}>{evidenceFileName(item)}</Typography><Button disabled={busy||!orgId} onClick={()=>download(item)}>{a.download}</Button></Stack>:<TextField data-text-case="preserve" size="small" label={t.path} value={normalizeEvidencePath(item.path)} disabled={disabled||busy||Boolean(pending)||!onChange} error={Boolean(onChange)&&!validDocumentEvidence([item],previous)} inputProps={{maxLength:500,'data-text-case':'preserve'}} sx={{gridColumn:{xs:1,sm:'auto'},gridRow:{xs:2,sm:'auto'}}} onChange={event=>change(index,{path:normalizeEvidencePath(event.target.value)})}/>}
   {onChange&&<DeleteActionButton aria-label={t.remove} title={t.remove} disabled={disabled||busy||Boolean(pending)} sx={{gridColumn:{xs:2,sm:3},gridRow:{xs:'1 / span 2',sm:'auto'}}} onClick={()=>onChange(value.filter((_,i)=>i!==index))}/>}
  </Box>)}
 </Stack>;
}
