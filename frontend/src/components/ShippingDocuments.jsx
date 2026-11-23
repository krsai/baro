import React,{useEffect,useRef,useState} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Button,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AppDialog from './AppDialog';
import Alert from './AppNotice';
import TableStatusRow from './TableStatusRow';
import PageActions from './PageActions';
import SaveButton from './SaveButton';
import SearchableSelect from './SearchableSelect';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {freightDocumentHtml,printFreightDocument} from '../utils/freightPrint';
import {shippingWorkbenchText} from '../constants/shippingWorkbench';
import {freightText} from '../constants/freight';
import {freightWorkflowText} from '../constants/freightWorkflow';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

export default function ShippingDocuments({job,orgId,languageCode,busy,onDirtyChange}){
 const t=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en,f=freightText[languageCode]||freightText.en,w=freightWorkflowText[languageCode]||freightWorkflowText.en;
 const [fields,setFields]=useState(()=>Object.fromEntries(['vessel','voyage','etd','eta','marks','freightTerms'].map(key=>[key,'']))),fieldBaseline=useRef(JSON.stringify(fields)),fieldsDirty=JSON.stringify(fields)!==fieldBaseline.current;
 const [kind,setKind]=useState('AN'),[billId,setBillId]=useState(null),[copies,setCopies]=useState((job.documents||[]).filter(row=>!['COMMERCIAL_INVOICE','PACKING_LIST'].includes(row.kind))),[preview,setPreview]=useState(null),[error,setError]=useState(false),[working,setWorking]=useState(false),[uncertain,setUncertain]=useState(false),pending=useRef(null),lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useUnsavedChanges(fieldsDirty||uncertain);useEffect(()=>{onDirtyChange?.(fieldsDirty||working||uncertain||!!preview);return()=>onDirtyChange?.(false);},[fieldsDirty,working,uncertain,preview,onDirtyChange]);
 useEffect(()=>{if(!fieldsDirty&&!working&&!uncertain&&!preview){const next=Object.fromEntries(['vessel','voyage','etd','eta','marks','freightTerms'].map(key=>[key,'']));fieldBaseline.current=JSON.stringify(next);setFields(next);setCopies((job.documents||[]).filter(row=>!['COMMERCIAL_INVOICE','PACKING_LIST'].includes(row.kind)));}},[job.version,job.documents]);
 const blocked=busy||working||uncertain,eligible=kind==='HOUSE_DRAFT'?job.bills.filter(row=>row.kind==='HOUSE'):job.bills;
 const create=async()=>{if(lock.current)return;lock.current=true;setWorking(true);setError(false);try{
  pending.current=pending.current||{clientKey:crypto.randomUUID(),version:job.version,kind,billId,fields:Object.fromEntries(Object.entries(fields).filter(([,value])=>value!==''))};
  const saved=await requestJSON('/freight/transport-jobs/'+encodeURIComponent(job.id)+'/documents'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(pending.current)});
  if(alive.current){setCopies(old=>[saved,...old.filter(row=>row.id!==saved.id)]);setPreview(saved);fieldBaseline.current=JSON.stringify(fields);setUncertain(false);}pending.current=null;
 }catch(e){if(alive.current){setError(true);setUncertain(!e.status||e.status>=500);}if(e.status&&e.status<500)pending.current=null;}finally{lock.current=false;if(alive.current)setWorking(false);}};
 const load=async id=>{if(working)return;setWorking(true);setError(false);try{const saved=await requestJSON('/freight/documents/'+encodeURIComponent(id)+buildQueryString({orgId}),{skipCache:true});if(alive.current)setPreview(saved);}catch{if(alive.current)setError(true);}finally{if(alive.current)setWorking(false);}};
 return <Stack spacing={1}>
  <Paper variant="outlined" sx={{p:1.5}}><Stack spacing={1}>
   <Stack direction="row" useFlexGap flexWrap="wrap" gap={1} alignItems="center"><TextField select slotProps={{select:{SelectDisplayProps:{'aria-label':t.documentType,'aria-labelledby':undefined}}}} label={t.documentType} value={kind} disabled={blocked} sx={{minWidth:190}} onChange={e=>{setKind(e.target.value);setBillId(null);}}>{['HOUSE_DRAFT','AN','DO','POD','MANIFEST'].map(key=><MenuItem key={key} value={key}>{key==='HOUSE_DRAFT'?(w[job.data.documentSetup?.documentType]||f.HOUSE_DRAFT):f[key]}</MenuItem>)}</TextField><Stack sx={{minWidth:190,flex:1}}><SearchableSelect label={t.bill} options={eligible} value={eligible.find(row=>row.id===billId)||null} getOptionLabel={row=>row.number} getLookupCode={row=>row.number} isOptionEqualToValue={(a,b)=>a.id===b.id} languageCode={languageCode} disabled={blocked} onChange={(_,row)=>setBillId(row?.id??null)}/></Stack><SaveButton loading={working} disabled={busy||!uncertain&&kind==='HOUSE_DRAFT'&&(!billId)} onClick={create}>{uncertain?t.retry:t.create}</SaveButton></Stack>
   <Accordion disableGutters elevation={0} sx={{border:1,borderColor:'divider','&:before':{display:'none'}}}><AccordionSummary expandIcon={<ExpandMoreIcon/>}><Typography variant="body2">{t.outputFields} <Typography component="span" variant="caption" color="text.secondary">{t.outputOnly}</Typography></Typography></AccordionSummary><AccordionDetails sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(3,minmax(0,1fr))'},gap:1}}>{['vessel','voyage','etd','eta','marks','freightTerms'].map(key=><TextField key={key} type={['etd','eta'].includes(key)?'date':'text'} label={f[key]} value={fields[key]} disabled={blocked} slotProps={{inputLabel:{shrink:true},htmlInput:{maxLength:['etd','eta'].includes(key)?10:500}}} onChange={e=>setFields(old=>({...old,[key]:e.target.value}))}/>)}</AccordionDetails></Accordion>
   <Typography variant="caption" color="text.secondary">{t.copyNote}</Typography>
   {error&&<Alert severity="error">{t.failed}</Alert>}
   <TableContainer><Table size="small"><TableHead><TableRow>{[t.documentType,f.number,f.version,f.date,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{copies.map(row=><TableRow key={row.id}><TableCell>{f[row.kind]}</TableCell><TableCell>{row.number}</TableCell><TableCell>{row.sourceVersion}</TableCell><TableCell>{new Date(row.createdAt).toLocaleDateString(languageCode)}</TableCell><TableCell align="right"><Button disabled={working} onClick={()=>load(row.id)}>{t.preview}</Button></TableCell></TableRow>)}{!copies.length&&<TableStatusRow colSpan={5} languageCode={languageCode} message={t.noDocuments}/>}</TableBody></Table></TableContainer>
  </Stack></Paper>
  <AppDialog open={!!preview} maxWidth="lg" fullWidth onClose={()=>setPreview(null)}><DialogTitle>{preview?.number}</DialogTitle><DialogContent>{preview&&<iframe title={preview.number} sandbox="" srcDoc={freightDocumentHtml(preview,f)} style={{width:'100%',height:'65vh',border:0}}/>}</DialogContent><DialogActions><PageActions secondary={<Button onClick={()=>setPreview(null)}>{t.close}</Button>} primary={<Button variant="contained" onClick={()=>{if(!printFreightDocument(preview,f))setError(true);}}>{t.print}</Button>}/></DialogActions></AppDialog>
 </Stack>;
}
