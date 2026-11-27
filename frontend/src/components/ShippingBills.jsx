import {printFreightDocument} from '../utils/freightPrint';
import {shippingWorkbenchText} from '../constants/shippingWorkbench';
import DecimalAmountField from './DecimalAmountField';
import ShippingCargoRows from './ShippingCargoRows';
import {shippingEditorText} from '../constants/shippingEditor';
import BillDocumentForm from './BillDocumentForm';
import AppDialog from './AppDialog';
import {DialogTitle,DialogContent,MenuItem} from '@mui/material';
import {billWorkflowText} from '../constants/billWorkflow';
import {billFormLabels} from '../utils/billFormLayout.mjs';
import VolumeInput from './VolumeInput';

import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Box,Button,Stack,Typography} from '@mui/material';
import ListDetailLayout from './ListDetailLayout';
import DialogRecordList from './DialogRecordList';
import DialogDetailPanel from './DialogDetailPanel';
import DialogRecordActions from './DialogRecordActions';
import {TextField} from '@mui/material';
import SearchableSelect from './SearchableSelect';
import AppNotice from './AppNotice';
import ShippingChargeDrafts from './ShippingChargeDrafts';
import {usePageDialogs} from './PageDialogProvider';
import {useAppActions} from '../context/AppContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingBillText} from '../constants/shippingBills';
import {shippingOperationText} from '../constants/shippingOperations';
import {freightText} from '../constants/freight';
import {billHierarchy,initialBillData} from '../utils/shippingBillData.mjs';

export default function ShippingBills({job,orgId,languageCode,forwarder,branding,onBrandingSaved,partyMode,createHouseAfterMaster=false,onBeginHouse,onBillSaved,onBillSelected,onDirtyChange,onStateChange,onChanged,documentOnly=false,initialBillId,initialKind,initialMasterId}){
 const t=shippingBillText[languageCode]||shippingBillText.en,dialogs=usePageDialogs();
 const [rows,setRows]=useState(job.bills||[]),[selected,setSelected]=useState(()=>initialBillId?(job.bills?.some(row=>row.id===initialBillId)?initialBillId:null):billHierarchy(job.bills||[])[0]?.id||null),[draft,setDraft]=useState(()=>['MASTER','HOUSE'].includes(initialKind)?{id:crypto.randomUUID(),kind:initialKind,partyMode:partyMode==='FORWARDER'?'FORWARDER':'DIRECT',number:'',issuer:'',masterId:initialKind==='HOUSE'&&job.bills.some(row=>row.id===initialMasterId&&row.kind==='MASTER')?initialMasterId:null,data:{}}:null),[formDirty,setFormDirty]=useState(false),[chargeDirty,setChargeDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const houseStarted=useRef(false),autoHouse=useRef(createHouseAfterMaster);const [methodOpen,setMethodOpen]=useState(false);const flow=billWorkflowText[languageCode]||billWorkflowText.en;
 const startAgain=async()=>{if(busy||formState.busy||formState.uncertain||chargeState.uncertain||!await discard())return;setMethodOpen(true);};
 const restart=(kind,mode='DIRECT')=>{autoHouse.current=mode==='FORWARDER';houseStarted.current=false;setSelected(null);setDraft({id:crypto.randomUUID(),kind,partyMode:mode,number:'',issuer:'',masterId:null,data:{}});setMethodOpen(false);};
 const dirty=formDirty||chargeDirty,blocked=dirty||busy;
 const [formState,setFormState]=useState({busy:false,uncertain:false}),[chargeState,setChargeState]=useState({busy:false,uncertain:false});
 const markFormState=useCallback(value=>setFormState(value),[]),markChargeState=useCallback(value=>setChargeState(value),[]);
 useEffect(()=>{onStateChange?.({busy:busy||formState.busy||chargeState.busy,uncertain:formState.uncertain||chargeState.uncertain});return()=>onStateChange?.({busy:false,uncertain:false});},[busy,formState,chargeState,onStateChange]);
 useEffect(()=>{onDirtyChange?.(blocked);return()=>onDirtyChange?.(false);},[blocked,onDirtyChange]);
 useEffect(()=>{if(!blocked)setRows(job.bills||[]);},[job.bills]);
 const canEdit=job.receiptStatus==='ACCEPTED'&&job.status!=='CANCELLED';
 const [chargeRevision,setChargeRevision]=useState(0);
 const chargesSaved=useCallback(()=>setChargeRevision(value=>value+1),[]);
 const current=draft||rows.find(row=>row.id===selected),forwarderPending=current?.kind==='MASTER'&&!current.version&&current.partyMode==='FORWARDER'&&!forwarder?.name;
 const discard=async()=>!dirty||await dialogs.confirm('',{purpose:'discard'});
 const choose=async row=>{if(busy||formState.busy||formState.uncertain||chargeState.busy||chargeState.uncertain||row.id===selected&&!draft)return;if(!await discard())return;setDraft(null);setSelected(row.id);setError('');onBillSelected?.(row);};

 const saved=row=>{setRows(old=>[...old.filter(value=>value.id!==row.id),{...old.find(value=>value.id===row.id),...row}]);if(autoHouse.current&&row.kind==='MASTER'&&!houseStarted.current){houseStarted.current=true;setSelected(null);setDraft({id:crypto.randomUUID(),kind:'HOUSE',number:'',issuer:'',masterId:row.id,data:{}});onBeginHouse?.(row.id,row);}else{setSelected(row.id);setDraft(null);onBillSaved?.(row);}onChanged?.();};
 const remove=async row=>{
  if(busy||!canEdit||!await discard()||!await dialogs.confirm(t.remove+' '+row.number+'?'))return;
  setBusy(true);setError('');try{await requestJSON('/freight/transport-jobs/'+job.id+'/bills/'+row.id+buildQueryString({orgId}),{method:'DELETE',body:JSON.stringify({version:row.version})});const next=rows.filter(value=>value.id!==row.id);setRows(next);setSelected(billHierarchy(next)[0]?.id||null);setDraft(null);onChanged?.();}
  catch(e){setError(e.message==='FREIGHT_BILL_HAS_DOCUMENTS'?t.hasDocuments:e.message==='FREIGHT_BILL_HAS_CHARGES'?t.hasCharges:e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.hasHouses:t.failed);}finally{setBusy(false);}
 };
 const markForm=useCallback(value=>setFormDirty(value),[]),markCharges=useCallback(value=>setChargeDirty(value),[]);
 const pickerRows=rows.filter(row=>row.kind===current?.kind);
 return <Stack spacing={2} data-shipping-bills>
  {error&&<AppNotice severity="error">{error}</AppNotice>}
  {documentOnly&&!draft&&pickerRows.length>1&&<TextField select size="small" data-bl-document-picker label={current.kind==='MASTER'?flow.master:flow.house} value={selected||''} disabled={busy||formState.busy||formState.uncertain||chargeState.busy||chargeState.uncertain} sx={{width:'100%',maxWidth:440}} onChange={e=>{const row=pickerRows.find(item=>item.id===e.target.value);if(row)choose(row);}}>{pickerRows.map(row=><MenuItem key={row.id} value={row.id}>{row.number}{row.kind==='HOUSE'?' · '+(rows.find(master=>master.id===row.masterId)?.number||flow.standalone):''}</MenuItem>)}</TextField>}
  {draft&&canEdit&&<Button disabled={busy||formState.busy||formState.uncertain} sx={{alignSelf:'flex-end'}} onClick={startAgain}>{flow.restart}</Button>}
  {methodOpen&&<AppDialog open fullWidth maxWidth="sm" onClose={()=>setMethodOpen(false)}><DialogTitle>{flow.restart}</DialogTitle><DialogContent><Stack spacing={2}><Button onClick={()=>restart('MASTER')}>{flow.direct}</Button><Button disabled={!forwarder?.name} onClick={()=>restart('MASTER','FORWARDER')}>{flow.combined}</Button><Button onClick={()=>restart('HOUSE')}>{flow.standalone}</Button></Stack></DialogContent></AppDialog>}
  <ListDetailLayout listWidth="minmax(220px,280px)" detailWidth="minmax(0,1fr)" list={!documentOnly&&rows.length>0&&<DialogRecordList rows={billHierarchy(rows)} selectedKey={selected} onSelect={choose} onPreview={row=>{if(!blocked&&!draft){setSelected(row.id);setError('');}}} previewDisabled={blocked||!!draft} disabled={busy} languageCode={languageCode} columns={[{key:'number',label:t.number,value:row=><Box component="span" sx={{pl:row.depth?2:0}}>{row.kind==='MASTER'?flow.master:flow.house} · {row.number}{row.unlinked&&<Typography variant="caption" display="block">{t.unlinked}</Typography>}</Box>}]}/>}
   detail={current?forwarderPending?<AppNotice severity="error" action={<Button onClick={onChanged}>{t.retry}</Button>}>{(shippingOperationText[languageCode]||shippingOperationText.en).forwarderUnavailable}</AppNotice>:<Stack spacing={2}>
    <BillForm key={current.id+':'+(current.version?'saved':'new')} initial={current} rows={rows} job={job} forwarder={forwarder} branding={branding} onBrandingSaved={onBrandingSaved} orgId={orgId} languageCode={languageCode} readOnly={!canEdit} disabled={busy} onBusyChange={setBusy} onDirtyChange={markForm} onStateChange={markFormState} onSaved={saved} onDocumentSaved={onChanged} onDelete={current.version&&(current.kind!=='MASTER'||current.jobId===job.id&&!(current.linkedJobCount>1))?()=>remove(current):undefined}/>
    {current.version&&canEdit&&current.jobId!==job.id&&current.kind==='MASTER'&&<Typography variant="caption" color="text.secondary">{({ko:'MBL 금액은 등록 업무에서 관리합니다.',en:'MBL charges are managed in its source job.',vi:'Chi Phí MBL Được Quản Lý Trong Công Việc Gốc.'})[languageCode]}</Typography>}
    {current.version&&canEdit&&current.jobId===job.id&&<ShippingChargeDrafts key={current.id} billId={current.id} orgId={orgId} jobId={job.id} languageCode={languageCode} readOnly onDirtyChange={markCharges} onStateChange={markChargeState} refreshKey={job.version+':'+chargeRevision} onSaved={chargesSaved}/>}
   </Stack>:null}/>

 </Stack>;
}
function BillForm({initial,rows,job,forwarder,branding,onBrandingSaved,orgId,languageCode,readOnly,disabled,onBusyChange,onDirtyChange,onStateChange,onSaved,onDocumentSaved,onDelete}){
 const t=shippingBillText[languageCode]||shippingBillText.en,f=freightText[languageCode]||freightText.en,dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const flow=billWorkflowText[languageCode]||billWorkflowText.en;
 const fileInput=useRef(null),brandingVersion=useRef(branding?.version||0);
 const operation=shippingOperationText[languageCode]||shippingOperationText.en;
 const fieldLabel=key=>(job.mode==='AIR'?({vessel:operation.flight,voyage:operation.flightNumber,origin:operation.originAirport,destination:operation.destinationAirport})[key]:null)||billFormLabels[key]|| (key==='origin'&&['SEA','AIR'].includes(job.mode)?operation[job.mode==='SEA'?'loadingPort':'originAirport']:key==='destination'&&['SEA','AIR'].includes(job.mode)?operation[job.mode==='SEA'?'dischargePort':'destinationAirport']:key==='vessel'?operation[job.mode==='AIR'?'flight':'vessel']:key==='voyage'?operation[job.mode==='AIR'?'flightNumber':'voyage']:t[key]||f[key]);
 const [baseline,setBaseline]=useState(()=>({...initial,data:initialBillData(job,initial,rows.find(row=>row.id===initial.masterId),{...forwarder,logoDataUrl:branding?.logoDataUrl})}));
 const [value,setValue]=useState(baseline),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[logoUncertain,setLogoUncertain]=useState(false),logoPending=useRef(null),[error,setError]=useState(''),pending=useRef(null),lock=useRef(false),live=useRef(true);
 const [printing,setPrinting]=useState(false),[printUncertain,setPrintUncertain]=useState(false),printPending=useRef(null),printLock=useRef(false);
 const printLabels=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en;
 const dirty=JSON.stringify(value)!==JSON.stringify(baseline),blocked=readOnly||disabled||busy||printing||uncertain||logoUncertain||printUncertain;
 useUnsavedChanges(dirty||uncertain||logoUncertain||printing||printUncertain);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{onDirtyChange?.(dirty||uncertain||logoUncertain||printing||printUncertain);return()=>onDirtyChange?.(false);},[dirty,uncertain,logoUncertain,printing,printUncertain,onDirtyChange]);
 useEffect(()=>{onStateChange?.({busy:busy||printing,uncertain:uncertain||logoUncertain||printUncertain});return()=>onStateChange?.({busy:false,uncertain:false});},[busy,uncertain,logoUncertain,printing,printUncertain,onStateChange]);
 useEffect(()=>{if(!dirty&&!busy&&!uncertain&&initial.version>baseline.version){const next={...initial,data:initialBillData(job,initial,rows.find(row=>row.id===initial.masterId))};setBaseline(next);setValue(next);}},[initial.version]);
 const save=async()=>{
  if(lock.current||disabled||readOnly||logoUncertain||printing||printUncertain)return;if((value.kind==='MASTER'||job.mode!=='SEA')&&!value.number.trim()){setError(t.required);return;}
  lock.current=true;setBusy(true);onBusyChange(true);setError('');
  pending.current=pending.current||{id:value.id,kind:value.kind,number:value.number,issuer:value.issuer,masterId:value.masterId,data:value.data,...(value.version?{version:value.version}:{})};
  try{const saved=await requestJSON('/freight/transport-jobs/'+job.id+'/bills'+(value.version?'/'+value.id:'')+buildQueryString({orgId}),{method:value.version?'PUT':'POST',body:JSON.stringify(pending.current)});if(live.current){const next={...value,...saved};setValue(next);setBaseline(next);pending.current=null;setUncertain(false);showNotification(t.saved,'success');onSaved(saved);}}
  catch(e){const unknown=!e.status||e.status>=500;if(!unknown)pending.current=null;if(live.current){setUncertain(unknown);setError(({FREIGHT_HBL_NUMBER_EXISTS:flow.numberExists,FREIGHT_HBL_NUMBER_IMMUTABLE:flow.immutable,FREIGHT_HBL_NUMBER_EXHAUSTED:flow.numberExhausted,FREIGHT_SURRENDER_CONFIRMATION_REQUIRED:flow.confirmationRequired,FREIGHT_SURRENDER_REASON_REQUIRED:flow.reasonRequired})[e.message]||t.failed);}}
  finally{lock.current=false;if(live.current)setBusy(false);onBusyChange(false);}
 };
 const print=async()=>{
  if(printLock.current||disabled||readOnly||busy||uncertain||logoUncertain||!printPending.current&&(!value.version||dirty))return;
  const popup=window.open('','_blank','width=900,height=800');if(!popup){setError(flow.failed);return;}popup.opener=null;printLock.current=true;setPrinting(true);setError('');
  try{
   if(!printPending.current){const latest=await requestJSON('/freight/transport-jobs/'+job.id+buildQueryString({orgId}),{skipCache:true});const bill=latest.bills?.find(row=>row.id===value.id);if(!bill||bill.version!==value.version)throw new Error('FREIGHT_CHANGED');printPending.current={clientKey:crypto.randomUUID(),version:latest.version,kind:'HOUSE_DRAFT',billId:value.id,billVersion:value.version,fields:{}};}
   const output=await requestJSON('/freight/transport-jobs/'+job.id+'/documents'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(printPending.current)});printPending.current=null;if(!live.current){popup.close();return;}setPrintUncertain(false);printFreightDocument(output,printLabels,popup);onDocumentSaved?.();
  }catch(e){popup.close();if(live.current){const unknown=!!printPending.current&&(!e.status||e.status>=500);setPrintUncertain(unknown);if(!unknown)printPending.current=null;setError(e.message==='FREIGHT_CHANGED'?printLabels.failed:flow.failed);}}
  finally{printLock.current=false;if(live.current)setPrinting(false);}
 };
 const field=(key,multiline=false)=> key==='cbm'?<VolumeInput key={key} label={fieldLabel(key)} value={value.data.cbm} formula={value.data.cbmFormula} quantity={value.data.quantity} languageCode={languageCode} disabled={blocked} onChange={patch=>setValue(old=>({...old,data:{...old.data,...patch}}))}/>:['quantity','weightKg','originalCount'].includes(key)?<DecimalAmountField fullWidth size="small" key={key} name={key} label={fieldLabel(key)} value={value.data[key]??''} disabled={blocked} integerOnly={key==='originalCount'} maxIntegerDigits={key==='originalCount'?2:16} decimalScale={4} onValueChange={next=>setValue(old=>({...old,data:{...old.data,[key]:next}}))}/>:<TextField fullWidth size="small" key={key} name={key==='voyage'?'voyageNumber':key} label={fieldLabel(key)} value={value.data[key]||''} multiline={multiline} type={['etd','eta','issueDate','onBoardDate'].includes(key)?'date':undefined} minRows={multiline?(key==='cargo'||key==='marks'?8:3):undefined} inputProps={{'aria-label':fieldLabel(key),maxLength:key==='cargo'?4000:['shipper','consignee','notify','deliveryAgent','marks'].includes(key)?2000:['originalCount'].includes(key)?2:500}} slotProps={{inputLabel:{shrink:true}}} disabled={blocked} onChange={event=>setValue(old=>({...old,data:{...old.data,[key]:event.target.value}}))}/>;
 const patch=(key,next)=>setValue(old=>({...old,data:{...old.data,[key]:next}}));
 const applyLogo=async logo=>{if(!blocked&&(!value.version||await dialogs.confirm(flow.replaceLogo)))patch('logoDataUrl',logo);};
 const chooseLogo=async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;if(!['image/png','image/jpeg'].includes(file.type)||file.size>200000){setError(flow.badLogo);return;}try{const logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});if(!live.current)return;await applyLogo(logo);}catch{setError(flow.badLogo);}};
 const saveLogo=async()=>{if(readOnly||disabled||busy||printing||printUncertain||uncertain||!branding?.canEdit)return;logoPending.current=logoPending.current||{version:brandingVersion.current,logoDataUrl:value.data.logoDataUrl||''};setBusy(true);onBusyChange(true);try{const saved=await requestJSON('/freight/transport-jobs/bill-branding'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify(logoPending.current)});if(!live.current)return;brandingVersion.current=saved.version;logoPending.current=null;setLogoUncertain(false);onBrandingSaved?.(saved);showNotification(flow.saved,'success');}catch(e){if(!live.current)return;const unknown=!e.status||e.status>=500;setLogoUncertain(unknown);if(!unknown)logoPending.current=null;setError(flow.failed);}finally{if(live.current)setBusy(false);onBusyChange(false);}};
 const grid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'repeat(2,minmax(0,1fr))'},gap:2};
 return <DialogDetailPanel actions={value.kind==='HOUSE'&&job.mode==='SEA'&&!readOnly&&<Button variant="outlined" disabled={disabled||busy||printing||uncertain||logoUncertain||!printUncertain&&(!value.version||dirty)} onClick={print}>{printUncertain?t.retry:printLabels.print}</Button>} sx={{maxHeight:'none'}} contentProps={{sx:{overflowY:'visible'}}} title={(value.kind==='MASTER'?flow.master:flow.house)+' · '+(value.number||t.title)+(value.kind==='MASTER'&&initial.linkedJobCount>1?' · '+initial.linkedJobCount+' '+({ko:'연결 업무',en:'Linked Jobs',vi:'Công Việc Liên Kết'})[languageCode]:'')} footer={<DialogRecordActions busy={busy} onDelete={!readOnly&&!uncertain&&!logoUncertain?onDelete:undefined} deleteDisabled={disabled||printing||printUncertain} deleteLabel={t.remove} onSave={!readOnly?save:undefined} saveLabel={uncertain?t.retry:t.save} saveDisabled={disabled||logoUncertain||printing||printUncertain||!uncertain&&value.version&&!dirty}/>}><Stack spacing={2}>
  {error&&<AppNotice severity="error">{error}</AppNotice>}
  <BillDocumentForm surrenderStatus={value.kind==='HOUSE'?value.data.surrenderStatus:undefined} onBoardDate={value.data.onBoardDate} containerField={job.mode==='SEA'&&job.data.shipmentType==='FCL'&&<Stack spacing={1}>{!(value.data.containers||[]).length&&<Button disabled={blocked} onClick={()=>setValue(old=>({...old,data:{...old.data,containers:[{size:'20',type:'DC',count:'1'}]}}))}>{(shippingEditorText[languageCode]||shippingEditorText.en).add}</Button>}<ShippingCargoRows containers rows={value.data.containers||[]} disabled={blocked} onChange={containers=>setValue(old=>({...old,data:{...old.data,containers}}))} t={shippingEditorText[languageCode]||shippingEditorText.en} e={operation}/></Stack>} field={field} air={job.mode==='AIR'} logoActionsLabel={flow.logo} logo={value.data.logoDataUrl} logoActions={!readOnly&&<Stack direction="row" gap={1} useFlexGap flexWrap="wrap"><input ref={fileInput} type="file" hidden accept="image/png,image/jpeg" onChange={chooseLogo}/><Button disabled={blocked} onClick={()=>fileInput.current.click()}>{flow.logo}</Button>{branding?.logoDataUrl&&<Button disabled={blocked} onClick={()=>applyLogo(branding.logoDataUrl)}>{flow.applyLogo}</Button>}{value.data.logoDataUrl&&<Button disabled={blocked} onClick={()=>applyLogo('')}>{flow.removeLogo}</Button>}{branding?.canEdit&&<Button disabled={readOnly||disabled||busy||printing||printUncertain||uncertain} onClick={saveLogo}>{logoUncertain?t.retry:flow.saveLogo}</Button>}</Stack>}
   numberField={<TextField fullWidth size="small" name="billNumber" label={t.number} value={value.number} placeholder={value.kind==='HOUSE'&&job.mode==='SEA'?flow.autoNumber:undefined} disabled={blocked} slotProps={{inputLabel:{shrink:true},htmlInput:{readOnly:value.kind==='HOUSE'&&(job.mode==='SEA'||value.houseNumberManaged),maxLength:120,'aria-label':t.number,'data-text-case':'preserve'}}} onChange={e=>setValue(old=>({...old,number:e.target.value}))}/>}
   issuerField={<TextField fullWidth size="small" label={t.issuer} value={value.issuer} disabled={blocked} slotProps={{inputLabel:{shrink:true},htmlInput:{maxLength:200}}} onChange={e=>setValue(old=>({...old,issuer:e.target.value}))}/>}
   masterField={value.kind==='HOUSE'&&<SearchableSelect label={flow.master} languageCode={languageCode} disabled={blocked} options={rows.filter(row=>row.kind==='MASTER')} value={rows.find(row=>row.id===value.masterId)||null} getOptionLabel={row=>row.number} getLookupCode={row=>row.number} isOptionEqualToValue={(a,b)=>a.id===b.id} onChange={(_,row)=>setValue(old=>({...old,masterId:row?.id||null}))}/>}/>
  <Box sx={{...grid}}>{['etd','eta'].map(key=>field(key))}</Box>
  {job.mode==='SEA'&&value.kind==='HOUSE'&&<Stack data-bl-surrender spacing={1.5}><Typography component="h3" variant="subtitle1">{flow.release}</Typography><Box sx={grid}>
   <TextField select label={flow.release} value={value.data.releaseType||'ORIGINAL'} disabled={blocked} onChange={e=>patch('releaseType',e.target.value)}><MenuItem value="ORIGINAL">{flow.original}</MenuItem><MenuItem value="SEA_WAYBILL" disabled={!!value.data.surrenderStatus&&value.data.surrenderStatus!=='NONE'}>{flow.waybill}</MenuItem></TextField>
   <TextField select label="Surrender" value={value.data.surrenderStatus||'NONE'} disabled={blocked||value.data.releaseType==='SEA_WAYBILL'} onChange={e=>patch('surrenderStatus',e.target.value)}>{[['NONE',flow.none],['REQUESTED',flow.requested],['CONFIRMED',flow.confirmed]].map(([key,label])=><MenuItem key={key} value={key}>{label}</MenuItem>)}</TextField>
   {value.data.surrenderStatus&&value.data.surrenderStatus!=='NONE'&&<><TextField type="date" label={flow.requestDate} value={value.data.surrenderRequestedAt||''} disabled={blocked} slotProps={{inputLabel:{shrink:true}}} onChange={e=>patch('surrenderRequestedAt',e.target.value)}/><TextField type="date" label={flow.confirmDate} value={value.data.surrenderConfirmedAt||''} disabled={blocked} slotProps={{inputLabel:{shrink:true}}} onChange={e=>patch('surrenderConfirmedAt',e.target.value)}/><TextField label={flow.reference} value={value.data.surrenderReference||''} disabled={blocked} slotProps={{htmlInput:{maxLength:500}}} onChange={e=>patch('surrenderReference',e.target.value)}/></>}
   <TextField label={flow.reason} value={value.data.surrenderReason||''} disabled={blocked} slotProps={{htmlInput:{maxLength:1000}}} onChange={e=>patch('surrenderReason',e.target.value)}/>
  </Box><Typography variant="caption" color="text.secondary">{flow.surrenderNote}</Typography></Stack>}
 </Stack></DialogDetailPanel>;
}
