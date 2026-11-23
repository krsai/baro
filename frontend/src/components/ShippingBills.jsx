import InvoiceSheet from './InvoiceSheet';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Accordion,AccordionDetails,AccordionSummary,Box,Button,Paper,Stack,Typography} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ListDetailLayout from './ListDetailLayout';
import DialogRecordList from './DialogRecordList';
import DialogDetailPanel from './DialogDetailPanel';
import DialogRecordActions from './DialogRecordActions';
import InvoiceDocumentField from './InvoiceDocumentField';
import EntityDetailSection from './EntityDetailSection';
import SearchableSelect from './SearchableSelect';
import AppNotice from './AppNotice';
import ShippingChargeDrafts from './ShippingChargeDrafts';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingBillText} from '../constants/shippingBills';
import {freightText} from '../constants/freight';
import {billHierarchy,initialBillData,requiresBillHierarchy} from '../utils/shippingBillData.mjs';

export default function ShippingBills({job,orgId,languageCode,onDirtyChange,onChanged,onConfigure}){
 const t=shippingBillText[languageCode]||shippingBillText.en,dialogs=usePageDialogs();
 const [rows,setRows]=useState(job.bills||[]),[selected,setSelected]=useState(()=>billHierarchy(job.bills||[])[0]?.id||null),[draft,setDraft]=useState(null),[formDirty,setFormDirty]=useState(false),[chargeDirty,setChargeDirty]=useState(false),[legacyDirty,setLegacyDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dirty=formDirty||chargeDirty||legacyDirty,blocked=dirty||busy;
 useEffect(()=>{onDirtyChange?.(blocked);return()=>onDirtyChange?.(false);},[blocked,onDirtyChange]);
 useEffect(()=>{if(!blocked)setRows(job.bills||[]);},[job.bills]);
 const canEdit=job.receiptStatus==='ACCEPTED'&&job.status!=='CANCELLED';
 const [chargeRevision,setChargeRevision]=useState(0);
 const chargesSaved=useCallback(()=>setChargeRevision(value=>value+1),[]);
 const single=job.data.documentSetup?.composition==='MASTER_ONLY';
 const optional=!requiresBillHierarchy(job),showHierarchy=!optional||!!job.data.documentSetup||rows.length>0;
 useEffect(()=>{if(canEdit&&job.data.documentSetup&&!rows.length&&!draft&&!blocked)setDraft({id:crypto.randomUUID(),kind:'MASTER',number:'',issuer:'',masterId:null,data:{}});},[job.data.documentSetup,rows.length]);
 const current=draft||rows.find(row=>row.id===selected),parentId=current?.kind==='MASTER'?current.id:current?.masterId;
 const discard=async()=>!dirty||await dialogs.confirm('',{purpose:'discard'});
 const choose=async row=>{if(busy||row.id===selected&&!draft)return;if(!await discard())return;setDraft(null);setSelected(row.id);setError('');};
 const add=async kind=>{if(busy||!await discard())return;if(kind==='HOUSE'&&!rows.some(row=>row.id===parentId&&row.kind==='MASTER')){setError(t.noMaster);return;}const next={id:crypto.randomUUID(),kind,number:'',issuer:'',masterId:kind==='HOUSE'?parentId:null,data:{}};setSelected(null);setDraft(next);setError('');};
 const saved=row=>{setRows(old=>[...old.filter(value=>value.id!==row.id),row]);setSelected(row.id);setDraft(!single&&row.kind==='MASTER'&&!rows.some(value=>value.kind==='HOUSE'&&value.masterId===row.id)?{id:crypto.randomUUID(),kind:'HOUSE',number:'',issuer:'',masterId:row.id,data:{}}:null);onChanged?.();};
 const remove=async row=>{
  if(busy||!canEdit||!await discard()||!await dialogs.confirm(t.remove+' '+row.number+'?'))return;
  setBusy(true);setError('');try{await requestJSON('/freight/transport-jobs/'+job.id+'/bills/'+row.id+buildQueryString({orgId}),{method:'DELETE',body:JSON.stringify({version:row.version})});const next=rows.filter(value=>value.id!==row.id);setRows(next);setSelected(billHierarchy(next)[0]?.id||null);setDraft(null);onChanged?.();}
  catch(e){setError(e.message==='FREIGHT_BILL_HAS_CHARGES'?t.hasCharges:e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.hasHouses:t.failed);}finally{setBusy(false);}
 };
 const markForm=useCallback(value=>setFormDirty(value),[]),markCharges=useCallback(value=>setChargeDirty(value),[]);
 return <Stack spacing={2} data-shipping-bills>
  {canEdit&&onConfigure&&(job.service!=='EXPRESS'||showHierarchy)&&<Box sx={{display:'flex',justifyContent:'flex-end'}}><Button disabled={busy||dirty} onClick={onConfigure}>{showHierarchy?t.composition:t.addOptionalBills}</Button></Box>}
  {showHierarchy&&<>
  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" justifyContent="flex-end">{canEdit&&<><Button disabled={busy||single&&rows.some(row=>row.kind==='MASTER')} onClick={()=>add('MASTER')}>{t.newMaster}</Button>{!single&&<Button disabled={busy||!rows.some(row=>row.id===parentId&&row.kind==='MASTER')} onClick={()=>add('HOUSE')}>{t.newHouse}</Button>}</>}</Stack>
  {error&&<AppNotice severity="error">{error}</AppNotice>}
  <ListDetailLayout listWidth="minmax(220px,280px)" detailWidth="minmax(0,1fr)" list={<DialogRecordList rows={billHierarchy(rows)} selectedKey={selected} onSelect={choose} onPreview={row=>{if(!blocked&&!draft){setSelected(row.id);setError('');}}} previewDisabled={blocked||!!draft} disabled={busy} languageCode={languageCode} columns={[{key:'number',label:t.number,value:row=><Box component="span" sx={{pl:row.depth?2:0}}>{row.kind==='MASTER'?'M':'H'} · {row.number}{row.unlinked&&<Typography variant="caption" display="block">{t.unlinked}</Typography>}</Box>}]}/>}
   detail={current?<Stack spacing={2}>
    <BillForm key={current.id+':'+(current.version?'saved':'new')} initial={current} rows={rows} job={job} orgId={orgId} languageCode={languageCode} readOnly={!canEdit} disabled={busy} onBusyChange={setBusy} onDirtyChange={markForm} onSaved={saved} onDelete={current.version?()=>remove(current):undefined}/>
    {current.version&&canEdit&&<ShippingChargeDrafts key={current.id} billId={current.id} orgId={orgId} jobId={job.id} languageCode={languageCode} readOnly={single?current.kind!=='MASTER':current.kind!=='HOUSE'} onDirtyChange={markCharges} refreshKey={job.version+':'+chargeRevision} onSaved={chargesSaved}/>}
   </Stack>:null}/></>}
  {canEdit&&(optional?<ShippingChargeDrafts bills={rows.filter(row=>single?row.kind==='MASTER':row.kind==='HOUSE')} orgId={orgId} jobId={job.id} languageCode={languageCode} onDirtyChange={setLegacyDirty} refreshKey={job.version+':'+chargeRevision} onSaved={chargesSaved}/>:<Accordion disableGutters elevation={0} sx={{border:1,borderColor:'divider','&:before':{display:'none'}}}><AccordionSummary expandIcon={<ExpandMoreIcon/>}><Typography>{t.legacyCharges}</Typography></AccordionSummary><AccordionDetails><ShippingChargeDrafts legacy bills={rows.filter(row=>single?row.kind==='MASTER':row.kind==='HOUSE')} orgId={orgId} jobId={job.id} languageCode={languageCode} onDirtyChange={setLegacyDirty} refreshKey={job.version+':'+chargeRevision} onSaved={chargesSaved}/></AccordionDetails></Accordion>)}
 </Stack>;
}
function BillForm({initial,rows,job,orgId,languageCode,readOnly,disabled,onBusyChange,onDirtyChange,onSaved,onDelete}){
 const t=shippingBillText[languageCode]||shippingBillText.en,f=freightText[languageCode]||freightText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [baseline,setBaseline]=useState(()=>({...initial,data:initialBillData(job,initial,rows.find(row=>row.id===initial.masterId))}));
 const [value,setValue]=useState(baseline),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),pending=useRef(null),lock=useRef(false),live=useRef(true);
 const dirty=JSON.stringify(value)!==JSON.stringify(baseline),blocked=readOnly||disabled||busy||uncertain;
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{onDirtyChange?.(dirty||uncertain);return()=>onDirtyChange?.(false);},[dirty,uncertain,onDirtyChange]);
 useEffect(()=>{if(!dirty&&!busy&&!uncertain&&initial.version>baseline.version){const next={...initial,data:initialBillData(job,initial,rows.find(row=>row.id===initial.masterId))};setBaseline(next);setValue(next);}},[initial.version]);
 const save=async()=>{
  if(lock.current||disabled||readOnly)return;if(!value.number.trim()||value.kind==='HOUSE'&&!value.masterId){setError(t.required);return;}
  lock.current=true;setBusy(true);onBusyChange(true);setError('');
  pending.current=pending.current||{id:value.id,kind:value.kind,number:value.number,issuer:value.issuer,masterId:value.masterId,data:value.data,...(value.version?{version:value.version}:{})};
  try{const saved=await requestJSON('/freight/transport-jobs/'+job.id+'/bills'+(value.version?'/'+value.id:'')+buildQueryString({orgId}),{method:value.version?'PUT':'POST',body:JSON.stringify(pending.current)});if(live.current){const next={...value,...saved};setValue(next);setBaseline(next);pending.current=null;setUncertain(false);showNotification(t.saved,'success');onSaved(saved);}}
  catch(e){const unknown=!e.status||e.status>=500;if(!unknown)pending.current=null;if(live.current){setUncertain(unknown);setError(t.failed);}}
  finally{lock.current=false;if(live.current)setBusy(false);onBusyChange(false);}
 };
 const field=(key,multiline=false)=> <InvoiceDocumentField key={key} name={key==='voyage'?'voyageNumber':key} appearance="form" label={t[key]||f[key]} value={value.data[key]||''} multiline={multiline} type={['etd','eta','issueDate'].includes(key)?'date':undefined} maxLength={key==='cargo'?4000:['shipper','consignee','notify','deliveryAgent','marks'].includes(key)?2000:500} disabled={blocked} onChange={event=>setValue(old=>({...old,data:{...old.data,[key]:event.target.value}}))}/>;
 const grid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'repeat(2,minmax(0,1fr))'},gap:2};
 return <DialogDetailPanel title={value.kind+' · '+(value.number||t.title)} footer={<DialogRecordActions busy={busy} onDelete={!readOnly&&!uncertain?onDelete:undefined} deleteDisabled={disabled} deleteLabel={t.remove} onSave={!readOnly?save:undefined} saveLabel={uncertain?t.retry:t.save} saveDisabled={disabled||!uncertain&&value.version&&!dirty}/>}><InvoiceSheet sx={{p:1.5,border:0,borderRadius:0}}><Stack spacing={2}>
  {error&&<AppNotice severity="error">{error}</AppNotice>}
  <Box sx={grid}><InvoiceDocumentField appearance="form" name="billNumber" label={t.number} value={value.number} maxLength={120} disabled={blocked} onChange={event=>setValue(old=>({...old,number:event.target.value}))}/><InvoiceDocumentField appearance="form" name="companyName" label={t.issuer} value={value.issuer} maxLength={200} disabled={blocked} onChange={event=>setValue(old=>({...old,issuer:event.target.value}))}/>{value.kind==='HOUSE'&&<SearchableSelect label={t.master} languageCode={languageCode} disabled={blocked} options={rows.filter(row=>row.kind==='MASTER')} value={rows.find(row=>row.id===value.masterId)||null} getOptionLabel={row=>row.number} getLookupCode={row=>row.number} isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={(_,row)=>setValue(old=>({...old,masterId:row?.id||null}))}/>}</Box>
  <Box sx={grid}>{['shipper','consignee','notify'].map(key=>field(key,true))}</Box>
  <EntityDetailSection title={f.transport}><Box sx={grid}>{[...(['SEA','AIR'].includes(job.mode)?['vessel','voyage']:[]),'origin','destination','etd','eta'].map(key=>field(key))}</Box></EntityDetailSection>
  <EntityDetailSection title={f.cargo}><Box sx={grid}>{['marks','cargo'].map(key=>field(key,true))}{['quantity','unit','weightKg','cbm','freightTerms'].map(key=>field(key))}</Box></EntityDetailSection>
 </Stack></InvoiceSheet></DialogDetailPanel>;
}
