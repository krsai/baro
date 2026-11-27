import LocalizedDateField from './LocalizedDateField';
import VolumeInput from './VolumeInput';
import {parseVolumeInput} from '../utils/volumeFormula.mjs';
import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,MenuItem,Stack,TextField,Typography} from '@mui/material';
import EntityDetailSection from './EntityDetailSection';
import SearchableSelect from './SearchableSelect';
import AppNotice from './AppNotice';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {shippingOperationText} from '../constants/shippingOperations';
import {humanTextDisplay} from '../utils/humanTextDisplay.mjs';
import {workRouteSteps,routeStopText,routeDateComplete} from '../utils/shippingWorkPresentation.mjs';
import {shippingWorkValues as values,shippingWorkData} from '../utils/shippingWorkData.mjs';
import ShippingCargoRows from './ShippingCargoRows';
import {freightJobEditorText} from '../constants/freightJobEditor';
import {shippingWorkbenchText} from '../constants/shippingWorkbench';
import {shippingRequestDate} from '../utils/shippingPresentation';
import {shippingEditorText} from '../constants/shippingEditor';

function RouteAddress({routeName,value,onChange,...props}){
 const [editing,setEditing]=useState(false);
 return <TextField {...props} value={editing?value:routeStopText(routeName,value)} onFocus={()=>setEditing(true)} onBlur={()=>setEditing(false)} onChange={onChange}/>;
}
const localToday=()=>{const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);};
const grid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2};
export default function ShippingOperations({job,employees,customers=[],languageCode,busy,formId,onSave,onReload,onDirtyChange,onStateChange}){
 const t=shippingOperationText[languageCode]||shippingOperationText.en,e=freightJobEditorText[languageCode]||freightJobEditorText.en,w=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en,x=shippingEditorText[languageCode]||shippingEditorText.en;
 const [value,setValue]=useState(()=>values(job)),baseline=useRef(values(job)),[saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),pending=useRef(null),lock=useRef(false),live=useRef(true);
 const [today,setToday]=useState(localToday);
 useEffect(()=>{const refresh=()=>setToday(localToday()),timer=setInterval(refresh,30000);document.addEventListener('visibilitychange',refresh);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',refresh);};},[]);
 const version=useRef(job.version),[conflict,setConflict]=useState(false),[reloading,setReloading]=useState(false);
 const dirty=JSON.stringify(value)!==JSON.stringify(baseline.current),readOnly=job.receiptStatus!=='ACCEPTED'||job.status==='CANCELLED',blocked=busy||saving||reloading||uncertain||readOnly;
 useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{onDirtyChange?.(dirty||saving||reloading||uncertain);onStateChange?.({dirty,saving:saving||reloading,uncertain});return()=>onDirtyChange?.(false);},[dirty,saving,reloading,uncertain,onDirtyChange,onStateChange]);
 useEffect(()=>{if(saving||reloading||uncertain)return;const next=values(job);if(!dirty){baseline.current=next;version.current=job.version;setValue(next);}else if(JSON.stringify(next)===JSON.stringify(baseline.current))version.current=job.version;},[job.version]);
 const patch=(key,next)=>setValue(old=>({...old,[key]:next}));
 const save=async event=>{
  event.preventDefault();if(parseVolumeInput(value.cbmFormula||value.cbm||'')===null){setError(x.volumeInvalid);return;}if(lock.current||readOnly||busy||reloading||!dirty&&!uncertain)return;lock.current=true;setSaving(true);setError('');setConflict(false);
  pending.current=pending.current||{version:version.current,requestId:crypto.randomUUID(),fields:Object.fromEntries(Object.entries(value).filter(([key,next])=>JSON.stringify(next)!==JSON.stringify(baseline.current[key])).map(([key,next])=>[key,(['etd','eta','plannedDate'].includes(key)||key.startsWith('routeDate'))?next||null:next]))};
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
 const selectedCustomer=customers.find(row=>row.id===value.customerId)||(job.data.customer?.id===value.customerId?job.data.customer:null);
 const customer=job.data.generalCustomer?humanTextDisplay(job.data.actualRequesterName,{textCase:'title'}):job.data.customer?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||job.data.customer?.name;
 const source=shippingWorkData(job.data),routeSteps=workRouteSteps(job),hasMaster=job.bills.some(row=>row.kind==='MASTER');
 const completedStops=new Set(routeSteps.filter(step=>routeDateComplete(value[step.node==='ORIGIN_DOOR'?'plannedDate':'routeDate'+step.node]||value[step.node==='ORIGIN_TERMINAL'?'etd':step.node==='DESTINATION_TERMINAL'?'eta':''],today)).map(step=>step.node));
 const detail=(label,text)=><Box sx={{minWidth:0}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text||'—'}</Typography></Box>;
 const field=(key,label,multiline=false,minRows=3)=><TextField fullWidth size="small" key={key} name={key==='voyage'?'voyageNumber':key} label={label} value={value[key]??''} disabled={blocked} multiline={multiline} minRows={multiline?minRows:undefined} required={['shipper','consignee','origin','destination'].includes(key)} slotProps={{htmlInput:{'aria-label':label,'data-text-case':key==='incoterms'?'preserve':undefined,maxLength:['cargo','remark'].includes(key)?4000:['shipper','consignee','notify','marks'].includes(key)?2000:['origin','destination','placeOfReceipt','placeOfDelivery'].includes(key)?1000:200}}} onChange={ev=>patch(key,ev.target.value)}/>;
 const date=(key,label,scheduleKey)=><LocalizedDateField fullWidth size="small" key={key} name={key} type="date" label={label||(key==='plannedDate'?e.plannedDate:t[key])} value={value[key]||value[scheduleKey]||''} disabled={blocked} slotProps={{inputLabel:{shrink:true}}} onChange={ev=>setValue(old=>({...old,[key]:ev.target.value,...(scheduleKey?{[scheduleKey]:ev.target.value}:{})}))}/>;
 const choice=(key,label,options)=><TextField fullWidth select name={key} label={label} value={value[key]||''} disabled={blocked} onChange={ev=>patch(key,ev.target.value)}><MenuItem value="">—</MenuItem>{[...new Set([...(value[key]?[value[key]]:[]),...options])].map(option=><MenuItem key={option} value={option}>{option}</MenuItem>)}</TextField>;
 const numeric=(key,label)=>key==='cbm'?<VolumeInput label={label} value={value.cbm} formula={value.cbmFormula} quantity={value.quantity} languageCode={languageCode} disabled={blocked} onChange={patch=>setValue(old=>({...old,...patch}))}/>:<TextField fullWidth name={key} label={label} value={value[key]??''} disabled={blocked} slotProps={{htmlInput:{inputMode:'decimal',maxLength:21}}} onChange={ev=>{if(/^\d*(\.\d*)?$/.test(ev.target.value))patch(key,ev.target.value);}}/>;
 const fcl=job.mode==='SEA'&&source.shipmentType==='FCL';

 return <Box component="form" id={formId} onSubmit={save} data-testid="shipping-operations-form">
  {error&&<AppNotice severity={error===t.review?'info':'error'} action={conflict&&onReload?<Button disabled={reloading} onClick={reload}>{t.refresh}</Button>:undefined}>{error}</AppNotice>}
  <Box data-shipping-work-columns sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'minmax(0,2fr) minmax(300px,1fr)'},gap:2,alignItems:'start'}}>
   <Stack spacing={2} data-shipping-work-main sx={{minWidth:0}}>
    <EntityDetailSection title={t.parties}><Stack spacing={2} data-shipping-work-parties>{field('shipper',t.shipper,true)}{field('consignee',t.consignee,true)}{field('notify',t.notify,true)}</Stack></EntityDetailSection>
    <EntityDetailSection title={t.route}><Stack spacing={2} data-shipping-work-route>{routeSteps.map((step,index)=><Box key={step.node} data-shipping-route-step={step.node} sx={{display:'grid',gridTemplateColumns:{xs:'24px minmax(0,1fr)',sm:'24px minmax(0,1fr) 170px'},gap:1,alignItems:'start'}}><Box data-route-complete={completedStops.has(step.node)} aria-label={completedStops.has(step.node)?t.routeCompleted:t.routePending} sx={{position:'relative',height:'100%',minHeight:24,pt:'6px','&:after':index<routeSteps.length-1?{content:'""',position:'absolute',top:30,bottom:-22,left:11,borderLeft:1,borderColor:'divider'}:undefined}}><Box sx={{width:24,height:24,border:1,borderColor:completedStops.has(step.node)?'primary.main':'divider',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',bgcolor:completedStops.has(step.node)?'primary.main':'background.paper',color:completedStops.has(step.node)?'primary.contrastText':'text.secondary',fontSize:'0.75rem'}}>{index+1}</Box></Box>{step.field?<RouteAddress fullWidth size="small" routeName={step.name} name={step.field} required label={t[step.label]} value={value[step.field]||''} disabled={blocked} multiline minRows={1} slotProps={{htmlInput:{'aria-label':t[step.label],maxLength:1000,'data-text-case':'preserve'}}} onChange={ev=>patch(step.field,ev.target.value)}/>:<TextField fullWidth size="small" label={t[step.label]} value={routeStopText(step.name,step.value)||t.notSpecified} multiline minRows={1} slotProps={{input:{readOnly:true},htmlInput:{'aria-label':t[step.label],tabIndex:-1},inputLabel:{shrink:true}}}/>}<Box sx={{gridColumn:{xs:2,sm:'auto'},minWidth:0}}>{date(step.node==='ORIGIN_DOOR'?'plannedDate':'routeDate'+step.node,({ORIGIN_DOOR:'CARGO READY',ORIGIN_TERMINAL:'ETD/ATD',DESTINATION_TERMINAL:'ETA/ATA',DESTINATION_DOOR:'DELIVERY'})[step.node],step.node==='ORIGIN_TERMINAL'?'etd':step.node==='DESTINATION_TERMINAL'?'eta':null)}</Box></Box>)}</Stack></EntityDetailSection>
    <EntityDetailSection title={t.cargo}><Stack spacing={2}>
     <Box data-shipping-cargo-summary sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',sm:'minmax(0,2fr) repeat(4,minmax(0,1fr))'},gap:1,alignItems:'start'}}><Box sx={{gridColumn:{xs:'1 / -1',sm:'auto'},minWidth:0}}>{field('cargo',e.cargo,/[\r\n]/.test(value.cargo||''),1)}</Box>{numeric('quantity',t.packageCount)}{choice('unit',e.unit,['PKG','CTN','PLT','PCS','BAG','BOX','CRATE','DRUM','ROLL'])}{numeric('weightKg',e.weightKg)}{numeric('cbm',e.cbm)}</Box>

     {job.mode==='AIR'&&numeric('chargeableWeightKg',x.chargeableWeightKg)}
     {source.hsCode&&detail(x.hsCode,source.hsCode)}{source.dangerousGoods&&detail(e.dangerousGoods,[source.dgClass,source.unNumber,source.dangerousGoodsDetails].filter(Boolean).join(' · '))}
     {source.outOfGauge&&<Stack spacing={1}>{detail(x.oog,source.oogDetails)}{source.oogPackages?.map((row,index)=><Box key={index}>{detail(x.oogDimensions,`${row.quantity} × ${row.lengthM} × ${row.widthM} × ${row.heightM} m`)}</Box>)}</Stack>}
    </Stack></EntityDetailSection>
   </Stack>
   <Stack spacing={2} data-shipping-work-side>
    <EntityDetailSection title={t.overview}><Stack spacing={2}><Box data-shipping-work-summary sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(100px,auto)',gap:2,alignItems:'start'}}>{<Box sx={{minWidth:0}}><SearchableSelect label={t.customer} languageCode={languageCode} options={customers.filter(row=>!row.isShippingGeneralCustomer)} value={selectedCustomer} getOptionLabel={row=>row[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row.name||''} getLookupCode={row=>row.code||''} isOptionEqualToValue={(a,b)=>a.id===b.id} disabled={blocked} textFieldProps={{size:'small',fullWidth:true,required:true}} onChange={(_,row)=>{if(row)patch('customerId',row.id);}}/>{job.data.generalCustomer&&value.customerId===baseline.current.customerId&&<Typography variant="caption">{customer}</Typography>}</Box>}{detail(w.summaryDate,shippingRequestDate(job))}</Box><Box data-shipping-work-assignee><SearchableSelect textFieldProps={{variant:'standard',size:'small',fullWidth:true}} hideCode label={t.assignee} languageCode={languageCode} options={employees} value={employees.find(row=>row.id===value.assigneeId)||(job.assignee?.id===value.assigneeId?job.assignee:null)} getOptionLabel={row=>row.name} getLookupCode={row=>row.employeeNo||''} isOptionEqualToValue={(a,b)=>a.id===b.id} disabled={blocked} onChange={(_,row)=>patch('assigneeId',row?.id??null)}/></Box></Stack></EntityDetailSection>
    {(fcl||!hasMaster&&job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode))&&<EntityDetailSection title={fcl?x.containerSpec:t.schedule}><Stack spacing={2}>
     {!hasMaster&&job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)&&<Box sx={grid}>{field('vessel',job.mode==='AIR'?t.flight:t.vessel)}{field('voyage',job.mode==='AIR'?t.flightNumber:t.voyage)}</Box>}
     {fcl&&<Box data-shipping-work-containers>{value.containers.length?<ShippingCargoRows rows={value.containers} containers disabled={blocked} onChange={rows=>patch('containers',rows)} t={x} e={e}/>:<Button type="button" variant="outlined" disabled={blocked} onClick={()=>patch('containers',[{size:'',type:'',count:''}])}>{x.add}</Button>}</Box>}
    </Stack></EntityDetailSection>}
   </Stack>
  </Box>
 </Box>;
}
