
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Box,Button,Stack,Typography} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ListDetailLayout from './ListDetailLayout';
import DialogRecordList from './DialogRecordList';
import DialogDetailPanel from './DialogDetailPanel';
import DialogRecordActions from './DialogRecordActions';
import {TextField} from '@mui/material';
import PageSectionHeader from './PageSectionHeader';
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
import {billHierarchy,initialBillData} from '../utils/shippingBillData.mjs';

export default function ShippingBills({job,orgId,languageCode,onDirtyChange,onChanged}){
 const t=shippingBillText[languageCode]||shippingBillText.en,dialogs=usePageDialogs();
 const [rows,setRows]=useState(job.bills||[]),[selected,setSelected]=useState(()=>billHierarchy(job.bills||[])[0]?.id||null),[draft,setDraft]=useState(null),[formDirty,setFormDirty]=useState(false),[chargeDirty,setChargeDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dirty=formDirty||chargeDirty,blocked=dirty||busy;
 useEffect(()=>{onDirtyChange?.(blocked);return()=>onDirtyChange?.(false);},[blocked,onDirtyChange]);
 useEffect(()=>{if(!blocked)setRows(job.bills||[]);},[job.bills]);
 const canEdit=job.receiptStatus==='ACCEPTED'&&job.status!=='CANCELLED';
 const [chargeRevision,setChargeRevision]=useState(0);
 const chargesSaved=useCallback(()=>setChargeRevision(value=>value+1),[]);
 const current=draft||rows.find(row=>row.id===selected),parentId=current?.kind==='MASTER'?current.id:current?.masterId;
 const discard=async()=>!dirty||await dialogs.confirm('',{purpose:'discard'});
 const choose=async row=>{if(busy||row.id===selected&&!draft)return;if(!await discard())return;setDraft(null);setSelected(row.id);setError('');};
 const add=async kind=>{if(busy||!await discard())return;const next={id:crypto.randomUUID(),kind,number:'',issuer:'',masterId:kind==='HOUSE'&&rows.some(row=>row.id===parentId&&row.kind==='MASTER')?parentId:null,data:{}};setSelected(null);setDraft(next);setError('');};
 const saved=row=>{setRows(old=>[...old.filter(value=>value.id!==row.id),row]);setSelected(row.id);setDraft(null);onChanged?.();};
 const remove=async row=>{
  if(busy||!canEdit||!await discard()||!await dialogs.confirm(t.remove+' '+row.number+'?'))return;
  setBusy(true);setError('');try{await requestJSON('/freight/transport-jobs/'+job.id+'/bills/'+row.id+buildQueryString({orgId}),{method:'DELETE',body:JSON.stringify({version:row.version})});const next=rows.filter(value=>value.id!==row.id);setRows(next);setSelected(billHierarchy(next)[0]?.id||null);setDraft(null);onChanged?.();}
  catch(e){setError(e.message==='FREIGHT_BILL_HAS_DOCUMENTS'?t.hasDocuments:e.message==='FREIGHT_BILL_HAS_CHARGES'?t.hasCharges:e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.hasHouses:t.failed);}finally{setBusy(false);}
 };
 const markForm=useCallback(value=>setFormDirty(value),[]),markCharges=useCallback(value=>setChargeDirty(value),[]);
 return <Stack spacing={2} data-shipping-bills>
  <PageSectionHeader title={t.documents} titleVariant="subtitle1" actions={canEdit&&<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap"><Button disabled={busy} onClick={()=>add('MASTER')}>{t.newMaster}</Button><Button disabled={busy} onClick={()=>add('HOUSE')}>{t.newHouse}</Button></Stack>}/>
  {error&&<AppNotice severity="error">{error}</AppNotice>}
  <ListDetailLayout listWidth="minmax(220px,280px)" detailWidth="minmax(0,1fr)" list={<DialogRecordList rows={billHierarchy(rows)} selectedKey={selected} onSelect={choose} onPreview={row=>{if(!blocked&&!draft){setSelected(row.id);setError('');}}} previewDisabled={blocked||!!draft} disabled={busy} languageCode={languageCode} columns={[{key:'number',label:t.number,value:row=><Box component="span" sx={{pl:row.depth?2:0}}>{row.kind==='MASTER'?'MBL':'HBL'} · {row.number}{row.unlinked&&<Typography variant="caption" display="block">{t.unlinked}</Typography>}</Box>}]}/>}
   detail={current?<Stack spacing={2}>
    <BillForm key={current.id+':'+(current.version?'saved':'new')} initial={current} rows={rows} job={job} orgId={orgId} languageCode={languageCode} readOnly={!canEdit} disabled={busy} onBusyChange={setBusy} onDirtyChange={markForm} onSaved={saved} onDelete={current.version?()=>remove(current):undefined}/>
    {current.version&&canEdit&&<ShippingChargeDrafts key={current.id} billId={current.id} orgId={orgId} jobId={job.id} languageCode={languageCode} readOnly={false} onDirtyChange={markCharges} refreshKey={job.version+':'+chargeRevision} onSaved={chargesSaved}/>}
   </Stack>:null}/>

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
  if(lock.current||disabled||readOnly)return;if(!value.number.trim()){setError(t.required);return;}
  lock.current=true;setBusy(true);onBusyChange(true);setError('');
  pending.current=pending.current||{id:value.id,kind:value.kind,number:value.number,issuer:value.issuer,masterId:value.masterId,data:value.data,...(value.version?{version:value.version}:{})};
  try{const saved=await requestJSON('/freight/transport-jobs/'+job.id+'/bills'+(value.version?'/'+value.id:'')+buildQueryString({orgId}),{method:value.version?'PUT':'POST',body:JSON.stringify(pending.current)});if(live.current){const next={...value,...saved};setValue(next);setBaseline(next);pending.current=null;setUncertain(false);showNotification(t.saved,'success');onSaved(saved);}}
  catch(e){const unknown=!e.status||e.status>=500;if(!unknown)pending.current=null;if(live.current){setUncertain(unknown);setError(t.failed);}}
  finally{lock.current=false;if(live.current)setBusy(false);onBusyChange(false);}
 };
 const field=(key,multiline=false)=> <TextField fullWidth size="small" key={key} name={key==='voyage'?'voyageNumber':key} label={t[key]||f[key]} value={value.data[key]||''} multiline={multiline} type={['etd','eta','issueDate'].includes(key)?'date':undefined} minRows={multiline?3:undefined} inputProps={{'aria-label':t[key]||f[key],maxLength:key==='cargo'?4000:['shipper','consignee','notify','deliveryAgent','marks'].includes(key)?2000:500}} slotProps={['etd','eta','issueDate'].includes(key)?{inputLabel:{shrink:true}}:undefined} disabled={blocked} onChange={event=>setValue(old=>({...old,data:{...old.data,[key]:event.target.value}}))}/>;
 const grid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'repeat(2,minmax(0,1fr))'},gap:2};
 return <DialogDetailPanel sx={{maxHeight:'none'}} contentProps={{sx:{overflowY:'visible'}}} title={(value.kind==='MASTER'?'MBL':'HBL')+' · '+(value.number||t.title)} footer={<DialogRecordActions busy={busy} onDelete={!readOnly&&!uncertain?onDelete:undefined} deleteDisabled={disabled} deleteLabel={t.remove} onSave={!readOnly?save:undefined} saveLabel={uncertain?t.retry:t.save} saveDisabled={disabled||!uncertain&&value.version&&!dirty}/>}><Stack spacing={2}>
  {error&&<AppNotice severity="error">{error}</AppNotice>}
  <Box sx={grid}><TextField fullWidth size="small" name="billNumber" label={t.number} value={value.number} inputProps={{maxLength:120,'aria-label':t.number}} disabled={blocked} onChange={event=>setValue(old=>({...old,number:event.target.value}))}/><TextField fullWidth size="small" name="companyName" label={t.issuer} value={value.issuer} inputProps={{maxLength:200,'aria-label':t.issuer}} disabled={blocked} onChange={event=>setValue(old=>({...old,issuer:event.target.value}))}/>{value.kind==='HOUSE'&&<SearchableSelect label={t.master} languageCode={languageCode} disabled={blocked} options={rows.filter(row=>row.kind==='MASTER')} value={rows.find(row=>row.id===value.masterId)||null} getOptionLabel={row=>row.number} getLookupCode={row=>row.number} isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={(_,row)=>setValue(old=>({...old,masterId:row?.id||null}))}/>}</Box>
  <Box sx={grid}>{['shipper','consignee','notify'].map(key=>field(key,true))}</Box>
  <EntityDetailSection title={f.transport}><Box sx={grid}>{[...(['SEA','AIR'].includes(job.mode)?['vessel','voyage']:[]),'origin','destination','etd','eta'].map(key=>field(key))}</Box></EntityDetailSection>
  <EntityDetailSection title={f.cargo}><Box sx={grid}>{['marks','cargo'].map(key=>field(key,true))}{['quantity','unit','weightKg','cbm','freightTerms'].map(key=>field(key))}</Box></EntityDetailSection>
 </Stack></DialogDetailPanel>;
}
