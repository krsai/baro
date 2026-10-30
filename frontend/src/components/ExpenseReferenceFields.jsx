import React,{useEffect,useMemo,useState} from 'react';
import {Alert,Autocomplete,Box,Checkbox,TextField} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
export default function ExpenseReferenceFields({line,orders,orgId,labels,disabled,production,hiddenOrder,hiddenStyle,onChange,onLoading}){
 const ids=line.linkedOrderIds??(line.workOrderId?[line.workOrderId]:[]);
 const links=line.linkedStyles??(line.styleId?[{workOrderId:line.workOrderId,styleId:line.styleId}]:[]);
 const [state,setState]=useState({key:'',styles:[],loading:false,error:false});
 const key=[...ids].sort((a,b)=>a-b).join(',');
 useEffect(()=>{
  let alive=true;
  if(!ids.length){setState({key,styles:[],loading:false,error:false});return;}
  setState(previous=>({...previous,key,loading:true,error:false}));
  Promise.all(ids.map(workOrderId=>requestJSON('/transaction-request-options'+buildQueryString({orgId,workOrderId}),{skipCache:true}).then(data=>data.styles.map(style=>({...style,workOrderId})))))
   .then(values=>{if(alive)setState({key,styles:values.flat(),loading:false,error:false});})
   .catch(()=>{if(alive)setState({key,styles:[],loading:false,error:true});});
  return()=>{alive=false;};
 },[key,orgId]);
 useEffect(()=>{onLoading?.(state.loading||state.error||state.key!==key);},[state.loading,state.error,state.key,key,onLoading]);
 const availableOrders=useMemo(()=>{
  const result=[...orders];
  for(const ref of line.referenceLinks||[])if(ref.workOrder&&!result.some(order=>order.dbId===ref.workOrderId))result.push({...ref.workOrder,dbId:ref.workOrderId});
  if(line.preservedReferences?.order&&!result.some(order=>order.dbId===line.workOrderId))result.push({...line.preservedReferences.order,dbId:line.workOrderId});
  return result;
 },[orders,line.referenceLinks,line.preservedReferences,line.workOrderId]);
 const availableStyles=useMemo(()=>{
  const result=state.key===key?state.styles:[];
  const retained=(line.referenceLinks||[]).filter(ref=>ref.style).map(ref=>({...ref.style,workOrderId:ref.workOrderId}));
  if(line.preservedReferences?.style)retained.push({...line.preservedReferences.style,workOrderId:line.workOrderId});
  return [...result,...retained.filter(ref=>ids.includes(ref.workOrderId)&&!result.some(style=>style.id===ref.id&&style.workOrderId===ref.workOrderId))];
 },[state,key,line.referenceLinks,line.preservedReferences,line.workOrderId]);
 const apply=(nextIds,nextLinks)=>{
  if(production){if(line.workOrderId&&!nextIds.includes(line.workOrderId))nextIds=[line.workOrderId,...nextIds];if(line.styleId&&!nextLinks.some(ref=>ref.workOrderId===line.workOrderId&&ref.styleId===line.styleId))nextLinks=[{workOrderId:line.workOrderId,styleId:line.styleId},...nextLinks];}
  const primary=nextLinks[0];
  const workOrderId=primary?.workOrderId||nextIds[0]||'',styleId=primary?.styleId||'';
  const primaryChanged=workOrderId!==line.workOrderId||styleId!==line.styleId;
  onChange(line.key,{linkedOrderIds:nextIds,linkedStyles:nextLinks,enabled:{...line.enabled,order:true,style:true},...(!production?{workOrderId,styleId,...(primaryChanged?{styleProcessId:'',styleProcessIds:[],assignmentPlanId:''}:{})}:{})});
 };
 const renderOption=(props,option,{selected})=>{const {key:optionKey,...rest}=props;return <li key={optionKey} {...rest}><Checkbox size="small" checked={selected}/>{option.label}</li>;};
 const orderOptions=availableOrders.map(order=>({...order,label:order.orderNumber||String(order.dbId)}));
 const styleOptions=availableStyles.map(style=>({...style,label:`${style.name} (${style.code}) · ${availableOrders.find(order=>order.dbId===style.workOrderId)?.orderNumber||style.workOrderId}`}));
 return <><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',md:'1fr 1fr'},gap:2}}>
  {!hiddenOrder&&<Autocomplete multiple disableCloseOnSelect size="small" options={orderOptions} value={orderOptions.filter(order=>ids.includes(order.dbId))} disabled={disabled} isOptionEqualToValue={(a,b)=>a.dbId===b.dbId} getOptionLabel={row=>row.label} renderOption={renderOption} onChange={(_,values)=>{const next=values.map(row=>row.dbId);apply(next,links.filter(ref=>next.includes(ref.workOrderId)));}} renderInput={params=><TextField {...params} label={labels.order}/>}/>}
  {!hiddenStyle&&<Autocomplete multiple disableCloseOnSelect size="small" loading={state.loading} options={styleOptions} value={styleOptions.filter(style=>links.some(ref=>ref.workOrderId===style.workOrderId&&ref.styleId===style.id))} disabled={disabled||!ids.length||state.loading} isOptionEqualToValue={(a,b)=>a.id===b.id&&a.workOrderId===b.workOrderId} getOptionLabel={row=>row.label} renderOption={renderOption} onChange={(_,values)=>apply(ids,values.map(row=>({workOrderId:row.workOrderId,styleId:row.id})))} renderInput={params=><TextField {...params} label={labels.style}/>}/>}
 </Box>{state.error&&<Alert severity="error">{labels.loadError}</Alert>}</>;
}
