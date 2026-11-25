import VolumeInput from './VolumeInput';
import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,DialogActions,DialogContent,DialogTitle,MenuItem,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppDialog from './AppDialog';
import Alert from './AppNotice';
import {useAppActions} from '../context/AppContext';
import EntityDetailSection from './EntityDetailSection';
import InvoiceSheet from './InvoiceSheet';
import InvoiceFormHeader from './InvoiceFormHeader';
import InvoiceDocumentField from './InvoiceDocumentField';
import PageActions from './PageActions';
import SaveButton from './SaveButton';
import TableStatusRow from './TableStatusRow';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingTradeText} from '../constants/shippingTrade';
import {downloadFreightOriginal} from '../utils/freightPrint';
import {formatInvoiceMoney} from '../utils/invoiceItemGrid.mjs';
import {tradeInvoiceAmounts} from '../utils/shippingTradeMath.mjs';
import {shippingEnglishText} from '../utils/shippingEnglish.mjs';
import {shippingTradeHtml} from '../utils/shippingTradePrint.mjs';

const keysFor=kind=>kind==='COMMERCIAL_INVOICE'?['description','hsCode','origin','quantity','unit','unitPrice']:['description','marks','packages','quantity','unit','netWeightKg','grossWeightKg','cbm'];
const blankLine=kind=>Object.fromEntries(keysFor(kind).map(key=>[key,kind==='COMMERCIAL_INVOICE'?'':key==='unit'?'PKG':['quantity','packages','netWeightKg','grossWeightKg','cbm'].includes(key)?'0':'']));
const party=value=>Object.fromEntries(['name','taxId','address','contactName','phone','email'].map(key=>[key,value?.[key]||'']));
const today=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const mimeFor=file=>file.type||({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})[file.name.split('.').pop().toLowerCase()]||'';
export default function ShippingTradeDocuments({job,orgId,languageCode,currencies=[],onDirtyChange,disabled=false}){
 const {showNotification}=useAppActions();
 const t=shippingTradeText[languageCode]||shippingTradeText.en,[kind,setKind]=useState('COMMERCIAL_INVOICE'),[fields,setFields]=useState(null),[rows,setRows]=useState(()=>(job.documents||[]).filter(row=>['COMMERCIAL_INVOICE','PACKING_LIST'].includes(row.kind))),[preview,setPreview]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),pending=useRef(null),lock=useRef(false),alive=useRef(true),fileInput=useRef(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const dirty=!!fields||uncertain;useUnsavedChanges(dirty);
 useEffect(()=>{onDirtyChange?.(dirty||busy||!!preview);return()=>onDirtyChange?.(false);},[dirty,busy,preview,onDirtyChange]);
 useEffect(()=>{if(!dirty&&!busy&&!preview)setRows((job.documents||[]).filter(row=>['COMMERCIAL_INVOICE','PACKING_LIST'].includes(row.kind)));},[job.documents]);
 const blocked=disabled||busy||uncertain;
 const start=()=>setFields({number:'',date:today(),seller:party(job.data.shipperParty),buyer:party(job.data.consigneeParty),currencyCode:'',incoterms:job.data.incoterms||'',paymentTerms:'',remarks:'',lines:[blankLine(kind)]});
 const save=async payload=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  pending.current=pending.current||{clientKey:crypto.randomUUID(),version:job.version,kind,...payload};
  const saved=await requestJSON('/freight/transport-jobs/'+encodeURIComponent(job.id)+'/trade-documents'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(pending.current)});
  if(alive.current){setRows(old=>[saved,...old.filter(row=>row.id!==saved.id)]);setFields(null);setUncertain(false);showNotification(t.saved,'success');if(saved.snapshot.tradeDocument.sourceMode==='FORM')setPreview(saved);}pending.current=null;
 }catch(e){const unknown=!e.status||e.status>=500;if(!unknown)pending.current=null;if(alive.current){setUncertain(unknown);setError(e.message==='SHIPPING_ENGLISH_REQUIRED'?(shippingEnglishText[languageCode]||shippingEnglishText.en):e.message==='SHIPPING_TRADE_DOCUMENT_INVALID'?t.invalid:t.failed);}}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const readFile=async event=>{const selected=event.target.files?.[0];event.target.value='';if(!selected)return;if(selected.size>2*1024*1024||!selected.size){setError(t.fileInvalid);return;}
  setBusy(true);try{const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=reject;reader.readAsDataURL(selected);});await save({sourceMode:'FILE',file:{name:selected.name,mimeType:mimeFor(selected),base64}});}catch{setBusy(false);setError(t.fileInvalid);}};
 const load=async(row,copy=false)=>{if(busy)return;setBusy(true);setError('');try{
  const saved=await requestJSON('/freight/documents/'+encodeURIComponent(row.id)+buildQueryString({orgId}),{skipCache:true}),doc=saved.snapshot.tradeDocument;
  if(!alive.current)return;
  if(doc.sourceMode==='FILE')downloadFreightOriginal(saved);
  else if(copy){const {total,totals,...editable}=doc.fields;setKind(saved.kind);setFields({...editable,lines:doc.fields.lines.map(line=>({...Object.fromEntries(keysFor(saved.kind).map(key=>[key,line[key]||''])),...(line.cbmFormula?{cbmFormula:line.cbmFormula}:{})}))});}
  else setPreview(saved);
 }catch{if(alive.current)setError(t.failed);}finally{if(alive.current)setBusy(false);}};
 const amounts=fields&&kind==='COMMERCIAL_INVOICE'?tradeInvoiceAmounts(fields.lines,fields.currencyCode):null;
 const update=(key,value)=>setFields(old=>({...old,[key]:value}));
 const line=(index,key,value)=>setFields(old=>({...old,lines:old.lines.map((row,i)=>i===index?{...row,[key]:value}:row)}));
 return <EntityDetailSection title={t.title} actions={<Stack direction="row" useFlexGap flexWrap="wrap" gap={1}><TextField select size="small" label={t.kind} value={kind} disabled={blocked||!!fields} onChange={e=>setKind(e.target.value)} slotProps={{select:{SelectDisplayProps:{'aria-label':t.kind,'aria-labelledby':undefined}}}}>{['COMMERCIAL_INVOICE','PACKING_LIST'].map(key=><MenuItem key={key} value={key}>{t[key]}</MenuItem>)}</TextField><Button disabled={blocked||!!fields} onClick={()=>fileInput.current?.click()}>{t.upload}</Button><Button variant="outlined" disabled={blocked||!!fields} onClick={start}>{t.write}</Button></Stack>}>
  <input ref={fileInput} type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.docx" onChange={readFile}/>
  <Stack spacing={2}><Typography variant="caption" color="text.secondary">{t.packingNote} {t.fileLimit}</Typography>{error&&<Alert severity="error">{error}</Alert>}{uncertain&&<PageActions primary={<SaveButton loading={busy} onClick={()=>save()}>{t.retry}</SaveButton>}/>}
  {fields&&<InvoiceSheet data-shipping-trade-form={kind}>
   <InvoiceFormHeader disabled={blocked} title={t[kind]} numberLabel={t.number} dateLabel={t.date} numberPlaceholder="" fields={fields} languageCode={languageCode} onChange={update} currencyControl={kind==='COMMERCIAL_INVOICE'?<TextField select label={t.currency} value={fields.currencyCode} disabled={blocked} onChange={e=>update('currencyCode',e.target.value)} slotProps={{select:{SelectDisplayProps:{'aria-label':t.currency,'aria-labelledby':undefined}}}}>{currencies.map(row=><MenuItem key={row.code} value={row.code}>{row.code}</MenuItem>)}</TextField>:null}/>
   <Box sx={{p:2}}><PageActions secondary={<Typography variant="caption" color="text.secondary" sx={{mr:'auto'}}>{t.notice}</Typography>}><Button disabled={blocked||fields.lines.length>=200} onClick={()=>update('lines',[...fields.lines,blankLine(kind)])}>{t.add}</Button></PageActions></Box>
   <TableContainer><Table size="small" data-table-layout="document" sx={{minWidth:kind==='COMMERCIAL_INVOICE'?800:1000}}><TableHead><TableRow>{keysFor(kind).map(key=><TableCell key={key}>{t[key]}</TableCell>)}{amounts&&<TableCell align="right">{t.amount}</TableCell>}<TableCell/></TableRow></TableHead><TableBody>{fields.lines.map((row,index)=><TableRow key={index} data-trade-line={index}>{keysFor(kind).map(key=><TableCell key={key}>{key==='cbm'?<VolumeInput label={t.cbm} value={row.cbm} formula={row.cbmFormula} quantity={row.packages} languageCode={languageCode} disabled={blocked} onChange={patch=>setFields(old=>({...old,lines:old.lines.map((item,i)=>i===index?{...item,...patch}:item)}))}/>:<TextField fullWidth size="small" required={['description','quantity','unit','unitPrice','packages','netWeightKg','grossWeightKg','cbm'].includes(key)} multiline={key==='description'} maxRows={key==='description'?4:undefined} label={t[key]} value={row[key]} disabled={blocked} onChange={e=>line(index,key,e.target.value)} slotProps={{htmlInput:{maxLength:key==='description'?500:200,...(['quantity','unitPrice','packages','netWeightKg','grossWeightKg','cbm'].includes(key)?{inputMode:'decimal'}:{})}}}/>}</TableCell>)}{amounts&&<TableCell align="right">{formatInvoiceMoney(amounts.amounts[index],fields.currencyCode)}</TableCell>}<TableCell data-table-actions><Button color="error" disabled={blocked||fields.lines.length===1} onClick={()=>update('lines',fields.lines.filter((_,i)=>i!==index))}>{t.remove}</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
   {amounts&&<Typography variant="subtitle2" sx={{p:2,textAlign:'right'}}>{t.total} {formatInvoiceMoney(amounts.total,fields.currencyCode)}</Typography>}
   <Box sx={{p:2,display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2}}>{['incoterms','paymentTerms','remarks'].map(key=><InvoiceDocumentField key={key} appearance="form" label={t[key]} value={fields[key]} disabled={blocked} onChange={e=>update(key,e.target.value)} multiline={key==='remarks'}/>)}</Box>
   <PageActions sx={{p:2}} secondary={<Button disabled={blocked} onClick={()=>{setFields(null);setError('');}}>{t.cancel}</Button>} primary={<SaveButton loading={busy} disabled={uncertain} onClick={()=>save({sourceMode:'FORM',fields})}>{t.save}</SaveButton>}/>
  </InvoiceSheet>}
  <TableContainer><Table size="small"><TableHead><TableRow>{[t.kind,t.source,t.name,t.date,''].map((label,index)=><TableCell key={index}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=>{const mode=row.sourceMode||row.snapshot?.tradeDocument?.sourceMode;return <TableRow key={row.id}><TableCell>{t[row.kind]}</TableCell><TableCell>{t[mode]}</TableCell><TableCell>{row.number}</TableCell><TableCell>{new Date(row.createdAt).toLocaleDateString(languageCode)}</TableCell><TableCell align="right" data-table-actions><Button disabled={busy} onClick={()=>load(row)}>{mode==='FILE'?t.download:t.view}</Button>{mode==='FORM'&&<Button disabled={blocked||!!fields} onClick={()=>load(row,true)}>{t.copy}</Button>}</TableCell></TableRow>;})}{!rows.length&&<TableStatusRow colSpan={5} languageCode={languageCode} message={t.empty}/>}</TableBody></Table></TableContainer></Stack>
  <AppDialog open={!!preview} fullWidth maxWidth="lg" onClose={()=>setPreview(null)}><DialogTitle>{preview?.number}</DialogTitle><DialogContent>{preview&&<iframe title={preview.number} sandbox="" srcDoc={shippingTradeHtml(preview)} style={{width:'100%',height:'65vh',border:0}}/>}</DialogContent><DialogActions><PageActions secondary={<Button onClick={()=>setPreview(null)}>{t.close}</Button>} primary={<Button variant="contained" onClick={()=>{const popup=window.open('','_blank','width=900,height=800');if(!popup){setError(t.failed);return;}popup.opener=null;popup.document.write(shippingTradeHtml(preview));popup.document.close();popup.focus();popup.print();}}>{t.print}</Button>}/></DialogActions></AppDialog>
 </EntityDetailSection>;
}
