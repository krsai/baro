import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,MenuItem,Stack,TextField,Typography} from '@mui/material';
import EntityDetailSection from './EntityDetailSection';
import SearchableSelect from './SearchableSelect';
import AppNotice from './AppNotice';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {shippingOperationText} from '../constants/shippingOperations';
import {humanTextDisplay} from '../utils/humanTextDisplay.mjs';
import {workRouteSteps} from '../utils/shippingWorkPresentation.mjs';
import {shippingWorkValues as values,shippingWorkData,shippingPackageTotals} from '../utils/shippingWorkData.mjs';
import ShippingCargoRows from './ShippingCargoRows';
import {freightText} from '../constants/freight';
import {freightJobEditorText} from '../constants/freightJobEditor';
import {shippingWorkbenchText} from '../constants/shippingWorkbench';
import {shippingRequestDate} from '../utils/shippingPresentation';
import {shippingEditorText} from '../constants/shippingEditor';

const grid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2};
export default function ShippingOperations({job,employees,languageCode,busy,formId,onSave,onReload,onDirtyChange,onStateChange}){
 const t=shippingOperationText[languageCode]||shippingOperationText.en,f=freightText[languageCode]||freightText.en,e=freightJobEditorText[languageCode]||freightJobEditorText.en,w=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en,x=shippingEditorText[languageCode]||shippingEditorText.en;
 const [value,setValue]=useState(()=>values(job)),baseline=useRef(values(job)),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),pending=useRef(null),lock=useRef(false),live=useRef(true);
 const version=useRef(job.version),[conflict,setConflict]=useState(false),[reloading,setReloading]=useState(false);
 const dirty=JSON.stringify(value)!==JSON.stringify(baseline.current),readOnly=job.receiptStatus!=='ACCEPTED'||job.status==='CANCELLED',blocked=busy||saving||reloading||uncertain||readOnly;
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{onDirtyChange?.(dirty||saving||reloading||uncertain);onStateChange?.({dirty,saving:saving||reloading,uncertain});return()=>onDirtyChange?.(false);},[dirty,saving,reloading,uncertain,onDirtyChange,onStateChange]);
 useEffect(()=>{if(saving||reloading||uncertain)return;const next=values(job);if(!dirty){baseline.current=next;version.current=job.version;setValue(next);}else if(JSON.stringify(next)===JSON.stringify(baseline.current))version.current=job.version;},[job.version]);
 const patch=(key,next)=>setValue(old=>({...old,[key]:next}));
 const save=async event=>{
  event.preventDefault();if(lock.current||readOnly||busy||reloading||!dirty&&!uncertain)return;lock.current=true;setSaving(true);setError('');setConflict(false);
  pending.current=pending.current||{version:version.current,requestId:crypto.randomUUID(),fields:Object.fromEntries(Object.entries(value).filter(([key,next])=>JSON.stringify(next)!==JSON.stringify(baseline.current[key])).map(([key,next])=>[key,['etd','eta','plannedDate'].includes(key)?next||null:next]))};
  try{const saved=await onSave(pending.current);if(live.current){const next=values(saved);baseline.current=next;version.current=saved.version;setValue(next);pending.current=null;setUncertain(false);}}
  catch(e){if(live.current){const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)pending.current=null;setConflict(e.status===409);setError(e.status===409?t.conflict:t.failed);}}
  finally{lock.current=false;if(live.current)setSaving(false);}
 };
 const reload=async()=>{
  if(saving||reloading||uncertain||!onReload)return;setReloading(true);
  const changes=Object.fromEntries(Object.entries(value).filter(([key,next])=>JSON.stringify(next)!==JSON.stringify(baseline.current[key])));
  try{const latest=await onReload();if(live.current){const next=values(latest);baseline.current=next;version.current=latest.version;setValue({...next,...changes});pending.current=null;setConflict(false);setError(t.review);}}
  catch{if(live.current)setError(t.failed);}finally{if(live.current)setReloading(false);}
 };
 const customer=job.data.generalCustomer?humanTextDisplay(job.data.actualRequesterName,{textCase:'title'}):job.data.customer?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||job.data.customer?.name;
 const source=shippingWorkData(job.data),routeSteps=workRouteSteps(job),hasMaster=job.bills.some(row=>row.kind==='MASTER');
 const detail=(label,text)=><Box sx={{minWidth:0}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text||'—'}</Typography></Box>;
 const field=(key,label,multiline=false,minRows=3)=><TextField fullWidth size="small" key={key} name={key==='voyage'?'voyageNumber':key} label={label} value={value[key]??''} disabled={blocked} multiline={multiline} minRows={multiline?minRows:undefined} required={['shipper','consignee','origin','destination'].includes(key)} slotProps={{htmlInput:{'aria-label':label,'data-text-case':key==='incoterms'?'preserve':undefined,maxLength:['cargo','remark'].includes(key)?4000:['shipper','consignee','notify','marks'].includes(key)?2000:['origin','destination','placeOfReceipt','placeOfDelivery'].includes(key)?1000:200}}} onChange={ev=>patch(key,ev.target.value)}/>;
 const date=key=><TextField fullWidth size="small" key={key} name={key} type="date" label={key==='plannedDate'?e.plannedDate:t[key]} value={value[key]||''} disabled={blocked} slotProps={{inputLabel:{shrink:true}}} onChange={ev=>patch(key,ev.target.value)}/>;
 const choice=(key,label,options)=><TextField fullWidth select name={key} label={label} value={value[key]||''} disabled={blocked} onChange={ev=>patch(key,ev.target.value)}><MenuItem value="">—</MenuItem>{[...new Set([...(value[key]?[value[key]]:[]),...options])].map(option=><MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField>;
 const numeric=(key,label)=><TextField fullWidth name={key} label={label} value={value[key]??''} disabled={blocked} slotProps={{htmlInput:{inputMode:'decimal',maxLength:21}}} onChange={ev=>{if(/^\d*(\.\d*)?$/.test(ev.target.value))patch(key,ev.target.value);}}/>;
 const fcl=job.mode==='SEA'&&source.shipmentType==='FCL';
 const packageTotals=shippingPackageTotals(value.packages);
 return <Box component="form" id={formId} onSubmit={save} data-testid="shipping-operations-form">
  {error&&<AppNotice severity={error===t.review?'info':'error'} action={conflict&&onReload?<Button disabled={reloading} onClick={reload}>{t.refresh}</Button>:undefined}>{error}</AppNotice>}
  <Box data-shipping-work-columns sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'minmax(0,2fr) minmax(300px,1fr)'},gap:2,alignItems:'start'}}>
   <Stack spacing={2} data-shipping-work-main sx={{minWidth:0}}>
    <EntityDetailSection title={t.parties}><Stack spacing={2} data-shipping-work-parties>{field('shipper',t.shipper,true)}{field('consignee',t.consignee,true)}{field('notify',t.notify,true)}</Stack></EntityDetailSection>
    <EntityDetailSection title={t.route}><Stack spacing={2} data-shipping-work-route>{routeSteps.map((step,index)=><Box key={step.node} data-shipping-route-step={step.node} sx={{display:'grid',gridTemplateColumns:'24px minmax(0,1fr)',gap:1,alignItems:'start'}}><Box aria-hidden="true" sx={{position:'relative',height:'100%',minHeight:24,pt:'6px','&:after':index<routeSteps.length-1?{content:'""',position:'absolute',top:30,bottom:-22,left:11,borderLeft:1,borderColor:'divider'}:undefined}}><Box sx={{width:24,height:24,border:1,borderColor:'divider',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'text.secondary',fontSize:'0.75rem'}}>{index+1}</Box></Box>{step.field?field(step.field,t[step.label],true,1):<TextField fullWidth size="small" label={t[step.label]} value={step.value||t.notSpecified} multiline minRows={1} slotProps={{input:{readOnly:true},htmlInput:{'aria-label':t[step.label],tabIndex:-1},inputLabel:{shrink:true}}}/>}</Box>)}</Stack></EntityDetailSection>
    <EntityDetailSection title={t.cargo}><Stack spacing={2}>
     <Box data-shipping-cargo-summary sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',sm:'minmax(0,2fr) repeat(4,minmax(0,1fr))'},gap:1,alignItems:'start'}}><Box sx={{gridColumn:{xs:'1 / -1',sm:'auto'},minWidth:0}}>{field('cargo',e.cargo,/[\r\n]/.test(value.cargo||''),1)}</Box>{numeric('quantity',t.packageCount)}{choice('unit',e.unit,['PKG','CTN','PLT','PCS','BAG','BOX','CRATE','DRUM','ROLL'])}{numeric('weightKg',e.weightKg)}{numeric('cbm',e.cbm)}</Box>
     {!fcl&&<Stack spacing={1.5}><Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="subtitle2">{x.packages}</Typography><Button type="button" disabled={blocked||!packageTotals} onClick={()=>setValue(old=>({...old,...packageTotals}))}>{t.applyDimensions}{packageTotals?` · ${packageTotals.quantity} / ${packageTotals.cbm} CBM`:''}</Button></Stack>{value.packages.length?<ShippingCargoRows rows={value.packages} disabled={blocked} express={job.service==='EXPRESS'} onChange={rows=>patch('packages',rows)} t={x} e={e}/>:<Button type="button" variant="outlined" disabled={blocked} onClick={()=>patch('packages',[{quantity:'',lengthM:'',widthM:'',heightM:''}])}>{x.add}</Button>}</Stack>}
     {job.mode==='AIR'&&numeric('chargeableWeightKg',x.chargeableWeightKg)}
     {source.hsCode&&detail(x.hsCode,source.hsCode)}{source.dangerousGoods&&detail(e.dangerousGoods,[source.dgClass,source.unNumber,source.dangerousGoodsDetails].filter(Boolean).join(' · '))}
     {source.outOfGauge&&<Stack spacing={1}>{detail(x.oog,source.oogDetails)}{source.oogPackages?.map((row,index)=><Box key={index}>{detail(x.oogDimensions,`${row.quantity} × ${row.lengthM} × ${row.widthM} × ${row.heightM} m`)}</Box>)}</Stack>}
    </Stack></EntityDetailSection>
   </Stack>
   <Stack spacing={2} data-shipping-work-side>
    <EntityDetailSection title={t.overview}><Stack spacing={2}>{detail(t.customer,customer)}{detail(w.summaryDate,shippingRequestDate(job))}<SearchableSelect label={t.assignee} languageCode={languageCode} options={employees} value={employees.find(row=>row.id===value.assigneeId)||(job.assignee?.id===value.assigneeId?job.assignee:null)} getOptionLabel={row=>row.name} getLookupCode={row=>row.employeeNo||''} isOptionEqualToValue={(a,b)=>a.id===b.id} disabled={blocked} onChange={(_,row)=>patch('assigneeId',row?.id??null)}/></Stack></EntityDetailSection>
    <EntityDetailSection title={t.schedule}><Stack spacing={2}>{date('plannedDate')}{!hasMaster&&<>{job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)&&<>{field('vessel',job.mode==='AIR'?t.flight:t.vessel)}{field('voyage',job.mode==='AIR'?t.flightNumber:t.voyage)}</>}<Box sx={grid}>{date('etd')}{date('eta')}</Box></>}</Stack></EntityDetailSection>
    {fcl&&<EntityDetailSection title={e.containerType}><Box data-shipping-work-containers>{value.containers.length?<ShippingCargoRows rows={value.containers} containers disabled={blocked} onChange={rows=>patch('containers',rows)} t={x} e={e}/>:<Button type="button" variant="outlined" disabled={blocked} onClick={()=>patch('containers',[{size:'',type:'',count:''}])}>{x.add}</Button>}</Box></EntityDetailSection>}
    <EntityDetailSection title={t.terms}><Stack spacing={2}>{choice('incoterms',e.incoterms,['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'])}{field('freightTerms',f.freightTerms)}</Stack></EntityDetailSection>
    <EntityDetailSection title={f.remark}>{field('remark',f.remark,true)}</EntityDetailSection>
   </Stack>
  </Box>
 </Box>;
}
