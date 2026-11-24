import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Chip,Stack,TextField,Typography} from '@mui/material';
import EntityDetailSection from './EntityDetailSection';
import SearchableSelect from './SearchableSelect';
import AppNotice from './AppNotice';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {shippingOperationText} from '../constants/shippingOperations';
import {humanTextDisplay} from '../utils/humanTextDisplay.mjs';
import {workRoute,workCargo} from '../utils/shippingWorkPresentation.mjs';
import {shippingModeLabel} from '../utils/shippingPresentation';
import {freightText} from '../constants/freight';
import {freightJobEditorText} from '../constants/freightJobEditor';
import {shippingWorkbenchText} from '../constants/shippingWorkbench';
import {shippingRequestDate} from '../utils/shippingPresentation';
import {shippingEditorText} from '../constants/shippingEditor';
import {routeScopeText} from '../constants/freightRouteScope';

const values=job=>Object.fromEntries(['assigneeId','vessel','voyage','etd','eta'].map(key=>[key,job.data[key]??(key==='assigneeId'?null:'')]));
const grid={display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',sm:'repeat(2,minmax(0,1fr))'},gap:2};
export default function ShippingOperations({job,employees,languageCode,busy,formId,onSave,onReload,onDirtyChange,onStateChange,documents}){
 const t=shippingOperationText[languageCode]||shippingOperationText.en,f=freightText[languageCode]||freightText.en,e=freightJobEditorText[languageCode]||freightJobEditorText.en,w=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en,x=shippingEditorText[languageCode]||shippingEditorText.en,r=routeScopeText[languageCode]||routeScopeText.en;
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
  pending.current=pending.current||{version:version.current,requestId:crypto.randomUUID(),fields:Object.fromEntries(Object.entries(value).filter(([key,next])=>next!==baseline.current[key]).map(([key,next])=>[key,['etd','eta'].includes(key)?next||null:next]))};
  try{const saved=await onSave(pending.current);if(live.current){const next=values(saved);baseline.current=next;version.current=saved.version;setValue(next);pending.current=null;setUncertain(false);}}
  catch(e){if(live.current){const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)pending.current=null;setConflict(e.status===409);setError(e.status===409?t.conflict:t.failed);}}
  finally{lock.current=false;if(live.current)setSaving(false);}
 };
 const reload=async()=>{
  if(saving||reloading||uncertain||!onReload)return;setReloading(true);
  const changes=Object.fromEntries(Object.entries(value).filter(([key,next])=>next!==baseline.current[key]));
  try{const latest=await onReload();if(live.current){const next=values(latest);baseline.current=next;version.current=latest.version;setValue({...next,...changes});pending.current=null;setConflict(false);setError(t.review);}}
  catch{if(live.current)setError(t.failed);}finally{if(live.current)setReloading(false);}
 };
 const customer=job.data.generalCustomer?humanTextDisplay(job.data.actualRequesterName,{textCase:'title'}):job.data.customer?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||job.data.customer?.name;
 const source=job.data,route=workRoute(job),hasMaster=job.bills.some(row=>row.kind==='MASTER'),party=role=>source[role+'Party']||job.data[role+'Party'];
 const partyText=role=>{const actual=role==='notify'&&source.notifySameAsConsignee?'consignee':role,p=party(actual);return p?[p.name,p.address,[p.contactName,p.phone,p.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n'):source[actual]||'—';};
 const detail=(label,text)=><Box sx={{minWidth:0}}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text||'—'}</Typography></Box>;
 return <Box component="form" id={formId} onSubmit={save} data-testid="shipping-operations-form"><Stack spacing={2}>
  {error&&<AppNotice severity={error===t.review?'info':'error'} action={conflict&&onReload?<Button disabled={reloading} onClick={reload}>{t.refresh}</Button>:undefined}>{error}</AppNotice>}
  <Stack direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={2}>
   <Box sx={{flex:1,minWidth:160}}>{detail(t.customer,[customer,source.actualRequesterPhone].filter(Boolean).join(' · '))}</Box>{detail(w.summaryDate,shippingRequestDate(job))}<Chip size="small" label={shippingModeLabel(job,languageCode)}/>
  </Stack>
  <EntityDetailSection title={t.parties}><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'repeat(3,minmax(0,1fr))'},gap:2}}>{['shipper','consignee','notify'].map(role=><Box key={role}>{detail(t[role],partyText(role))}</Box>)}</Box></EntityDetailSection>
  <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'repeat(2,minmax(0,1fr))'},gap:2,alignItems:'start'}}>
  <EntityDetailSection title={t.route}><Box sx={grid}>
   {detail(t.pickup,source.routeLocations?.ORIGIN_DOOR||source.origin)}{detail(t.delivery,source.routeLocations?.DESTINATION_DOOR||source.destination)}
   {job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)&&<>{detail(t[route.from.label],route.from.value||t.notSpecified)}{detail(t[route.to.label],route.to.value||t.notSpecified)}</>}
   {source.plannedDate&&detail(e.plannedDate,source.plannedDate)}
   {Object.entries(source.routeLocationDetails||{}).map(([node,location])=><Box key={node}>{detail(r[node]||node,[location.label,location.country,source.routeLocations?.[node],[location.contactName,location.phone,location.email].filter(Boolean).join(' / ')].filter(Boolean).join('\n'))}</Box>)}
  </Box></EntityDetailSection>
  <EntityDetailSection title={t.cargo}><Stack spacing={2}><Box sx={grid}>
   {detail(f.cargo,workCargo(source).join(' · '))}{source.marks&&detail(f.marks,source.marks)}
   {detail(f.freightTerms,[source.freightTerms,source.incoterms].filter(Boolean).join(' / '))}
   {source.hsCode&&detail(x.hsCode,source.hsCode)}
   {source.dangerousGoods&&source.dgClass&&detail(x.dgClass,source.dgClass)}{source.dangerousGoods&&source.unNumber&&detail(x.unNumber,source.unNumber)}
   {source.chargeableWeightKg&&detail(x.chargeableWeightKg,source.chargeableWeightKg)}
   {source.outOfGauge&&detail(x.oog,source.oogDetails)}
   {source.dangerousGoods&&detail(e.dangerousGoods,source.dangerousGoodsDetails||e.dangerousGoods)}
   {source.pickupRequired&&detail(e.pickupRequired,source.pickupAddress||source.origin)}
  </Box>{(source.packages||[]).map((row,index)=><Box key={'pkg-'+index}>{detail(x.packages,[row.quantity,`${row.lengthM} × ${row.widthM} × ${row.heightM} m`].join(' × '))}</Box>)}{(source.outOfGauge?source.oogPackages||[]:[]).map((row,index)=><Box key={'oog-'+index}>{detail(x.oogDimensions,`${row.quantity} × ${row.lengthM} × ${row.widthM} × ${row.heightM} m`)}</Box>)}{source.remark&&detail(f.remark,source.remark)}</Stack></EntityDetailSection>
  </Box>
   <EntityDetailSection title={t.schedule}><Box sx={grid}>
    <Box sx={{gridColumn:{sm:'1 / -1'}}}><SearchableSelect label={t.assignee} languageCode={languageCode} options={employees} value={employees.find(row=>row.id===value.assigneeId)||null} getOptionLabel={row=>row.name} getLookupCode={row=>row.employeeNo||''} isOptionEqualToValue={(a,b)=>a.id===b.id} disabled={blocked} onChange={(_,row)=>patch('assigneeId',row?.id??null)}/></Box>
    {!hasMaster&&job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)&&<><TextField fullWidth size="small" name="vessel" label={job.mode==='AIR'?t.flight:t.vessel} value={value.vessel} disabled={blocked} inputProps={{maxLength:160}} onChange={e=>patch('vessel',e.target.value)}/><TextField fullWidth size="small" name="voyageNumber" label={job.mode==='AIR'?t.flightNumber:t.voyage} value={value.voyage} disabled={blocked} inputProps={{maxLength:100}} onChange={e=>patch('voyage',e.target.value)}/></>}
    {!hasMaster&&['etd','eta'].map(key=><TextField fullWidth size="small" key={key} type="date" label={t[key]} value={value[key]} disabled={blocked} slotProps={{inputLabel:{shrink:true}}} onChange={e=>patch(key,e.target.value)}/>)}
   </Box></EntityDetailSection>
  {documents}
 </Stack></Box>;
}
