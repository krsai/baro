import React,{useEffect,useState,useRef} from 'react';
import {Button,Dialog,DialogTitle,DialogContent,DialogActions,Stack} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import LocalizedNameFields from './LocalizedNameFields';
import AppNotice from './AppNotice';
import {ITEM_ATTRIBUTE_TEXT} from '../constants/itemAttributes';
import {serviceName} from './OutsourcingServiceDialog';
import {requestJSON,buildQueryString} from '../utils/apiClient';

export default function CodeItemAttributeFields({line,code,orgId,languageCode,disabled,onChange,onBusyChange,validationAttempt}){
 const t=ITEM_ATTRIBUTE_TEXT[languageCode]||ITEM_ATTRIBUTE_TEXT.en;
 const [options,setOptions]=useState(null),[failed,setFailed]=useState(false),[reload,setReload]=useState(0),[draft,setDraft]=useState(null),[saving,setSaving]=useState(false),[saveError,setSaveError]=useState(false);
 const fields=['owner','customer','type'].filter(key=>(code.base?.attributeInputs?.[key]??'HIDDEN')!=='HIDDEN'||line[key==='owner'?'itemOwnerOrgId':key==='customer'?'itemCustomerId':'itemTypeId']);
 const baseId=code.baseId;
 const scope=useRef({key:'',mounted:true});scope.current.key=String(orgId)+':'+baseId;
 useEffect(()=>{scope.current.mounted=true;return()=>{scope.current.mounted=false;};},[]);
 useEffect(()=>{
  let alive=true;setOptions(null);setFailed(false);setDraft(null);setSaveError(false);setSaving(false);
  if(!fields.length||disabled){onBusyChange(false);return()=>{alive=false;};}
  onBusyChange(true);
  requestJSON(`/code-item-options${buildQueryString({orgId,baseId})}`,{skipCache:true}).then(data=>{if(alive){setOptions(data);onBusyChange(false);}}).catch(()=>{if(alive){setFailed(true);onBusyChange(true);}});
  return()=>{alive=false;onBusyChange(false);};
 },[orgId,baseId,reload,disabled,Boolean(fields.length),onBusyChange]);
 const save=async()=>{
  const savingScope=scope.current.key;
  setSaving(true);setSaveError(false);
  try{const type=await requestJSON(`/code-item-types${buildQueryString({orgId})}`,{method:'POST',body:JSON.stringify({...draft,baseId})});if(!scope.current.mounted||scope.current.key!==savingScope)return;setOptions(previous=>({...previous,types:[...(previous?.types||[]).filter(row=>row.id!==type.id),type]}));onChange(line.key,{itemTypeId:type.id,itemAttributeSnapshot:{...line.itemAttributeSnapshot,type}});setDraft(null);}
  catch{if(scope.current.mounted&&scope.current.key===savingScope)setSaveError(true);}finally{if(scope.current.mounted&&scope.current.key===savingScope)setSaving(false);}
 };
 return <>
 {fields.map(key=>{
  const field=key==='owner'?'itemOwnerOrgId':key==='customer'?'itemCustomerId':'itemTypeId',required=code.base?.attributeInputs?.[key]==='REQUIRED';
  const rows=options?.[key==='owner'?'owners':key==='customer'?'customers':'types']||[],stored=key==='owner'?line.itemOwnerSnapshot:line.itemAttributeSnapshot?.[key];
  const display=row=>key!=='type'?(row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||''):serviceName(row,languageCode);
  return <Stack key={key} spacing={.5}><ExpenseLookupField label={t[key]} required={required} error={validationAttempt>0&&required&&!line[field]} disabled={disabled||!options||failed||saving} languageCode={languageCode} options={rows} value={rows.find(row=>row.id===line[field])||(stored?.id===line[field]?stored:null)} getOptionLabel={display} columns={[...(key!=='type'?[{key:'code',label:t.code,value:row=>row.code}]:[]),{key:'name',label:t[key],value:display}]} onChange={row=>onChange(line.key,{[field]:row?.id||null,...(key==='owner'?{itemOwnerSnapshot:row}:{itemAttributeSnapshot:{...line.itemAttributeSnapshot,[key]:row}})})}/>{key==='type'&&!disabled&&<Button size="small" disabled={!options||failed||saving} onClick={()=>{setDraft({nameEn:'',nameKo:'',nameVi:''});setSaveError(false);}}>{t.addType}</Button>}</Stack>;
 })}
 {failed&&<AppNotice severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.loadError}</AppNotice>}
 <Dialog open={Boolean(draft)} onClose={()=>!saving&&setDraft(null)} fullWidth maxWidth="sm"><DialogTitle>{t.addType}</DialogTitle><DialogContent>{saveError&&<AppNotice severity="error">{t.saveError}</AppNotice>}<LocalizedNameFields required value={draft} onChange={(key,value)=>setDraft(previous=>({...previous,[key]:value}))} languageCode={languageCode} disabled={saving} autoFocus/></DialogContent><DialogActions><Button disabled={saving} onClick={()=>setDraft(null)}>{t.cancel}</Button><Button variant="contained" disabled={saving||![draft?.nameEn,draft?.nameKo,draft?.nameVi].every(value=>value?.trim())} onClick={save}>{t.save}</Button></DialogActions></Dialog>
 </>;
}
