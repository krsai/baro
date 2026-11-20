import React,{useEffect,useRef,useState} from 'react';
import {Autocomplete,Button,Dialog,DialogActions,DialogContent,DialogTitle,LinearProgress,Stack,TextField} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import SaveButton from './SaveButton';
import AppNotice from './AppNotice';
import {usePageDialogs} from './PageDialogProvider';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {materialItemName,materialItemText} from '../constants/materialItems';
import {materialVariantManagementText,variantManagementError} from '../constants/materialVariantManagement';
import {requestJSON,buildQueryString} from '../utils/apiClient';
const normalized=value=>String(value||'').normalize('NFKC').trim().toLocaleLowerCase();
export default function MaterialVariantEditor({orgId,baseId,row,languageCode,onClose,onSaved,codes}){
 const t=materialItemText[languageCode]||materialItemText.en,m=materialVariantManagementText[languageCode]||materialVariantManagementText.en,dialogs=usePageDialogs();
 const [code,setCode]=useState(codes?.find(item=>item.baseId===baseId)||null),dirty=useRef(false),locked=useRef(false),closeForm=useRef(null);
 const selectedBaseId=codes?code?.baseId:baseId;
 const changeCode=async value=>{if(locked.current)return;if(value?.baseId===code?.baseId)return;if(dirty.current&&!await dialogs.confirm('',{purpose:'discard'}))return;dirty.current=false;setCode(value);};
 const selector=codes?<ExpenseLookupField label={t.code} getOptionKey={value=>value.baseId} options={codes} value={code} onChange={changeCode} languageCode={languageCode} getCode={value=>value.base.code} getOptionLabel={value=>[value.base.code,materialItemName(value.base,languageCode)].filter(Boolean).join(' / ')} columns={[{key:'code',label:t.code,value:value=>value.base.code},{key:'name',label:t.name,value:value=>materialItemName(value.base,languageCode)}]}/>:null;
 return <Dialog open fullWidth maxWidth="sm" onClose={()=>closeForm.current?closeForm.current():onClose()}><DialogTitle>{codes?t.registerMaster:row?m.edit:m.add}</DialogTitle>
 {selectedBaseId?<VariantForm key={selectedBaseId} {...{orgId,baseId:selectedBaseId,row,languageCode,onClose,onSaved,selector,dirty,locked,closeForm}}/>:<><DialogContent><Stack spacing={2} sx={{pt:2}}>{selector}</Stack></DialogContent><DialogActions><Button onClick={onClose}>{t.cancel}</Button><SaveButton disabled>{t.save}</SaveButton></DialogActions></>}
 </Dialog>;
}
function VariantForm({orgId,baseId,row,languageCode,onClose,onSaved,selector,dirty,locked,closeForm}){
 const t=materialItemText[languageCode]||materialItemText.en,m=materialVariantManagementText[languageCode]||materialVariantManagementText.en,dialogs=usePageDialogs();
 const [options,setOptions]=useState(null),[attributes,setAttributes]=useState(null),[reload,setReload]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [owner,setOwner]=useState(row?.attributes.owner||null),[typeText,setTypeText]=useState(materialItemName(row?.attributes.type,languageCode)),[color,setColor]=useState(row?.attributes.color||null);
 const initial=useRef(JSON.stringify([owner,typeText,color])),pending=useRef(null),createdType=useRef(null),clientKey=useRef(crypto.randomUUID()),live=useRef(true),lock=useRef(false);
 const changed=JSON.stringify([owner,typeText,color])!==initial.current;dirty.current=changed;useUnsavedChanges(changed);
 useEffect(()=>{live.current=true;return()=>{live.current=false;closeForm.current=null;};},[]);
 useEffect(()=>{let active=true;setError('');setOptions(null);setAttributes(null);Promise.all([requestJSON('/material-items/variant-options'+buildQueryString({orgId,baseId}),{skipCache:true}),requestJSON('/code-item-options'+buildQueryString({orgId,baseId,context:'MATERIAL'}),{skipCache:true})]).then(([data,attrs])=>{if(active){setOptions(data);setAttributes(attrs);}}).catch(()=>{if(active)setError(m.failed);});return()=>{active=false;};},[orgId,baseId,reload,m.failed]);
 const close=async()=>{if(locked.current)return;if(!changed||await dialogs.confirm('',{purpose:'discard'}))onClose();};closeForm.current=close;
 const typeEnabled=options?.fields.type!=='HIDDEN',colorEnabled=options?.fields.color!=='HIDDEN';
 const save=async()=>{
  if(lock.current)return;lock.current=true;locked.current=true;setBusy(true);setError('');
  try{
   if(!pending.current){
    let typeId=row?.attributes.type?.id??null;
    if(typeEnabled){
     const text=typeText.trim(),existing=(attributes.types||[]).find(value=>['nameEn','nameKo','nameVi'].some(key=>normalized(value[key])===normalized(text)));
     let type=text?(existing||createdType.current):null;
     if(text&&!type){type=await requestJSON('/code-item-types'+buildQueryString({orgId,context:'MATERIAL'}),{method:'POST',body:JSON.stringify({baseId,nameEn:text,nameKo:text,nameVi:text})});createdType.current=type;}
     if(!live.current)return;typeId=type?.id??null;
    }
    pending.current={clientKey:clientKey.current,baseId,masterId:row?.masterId||options.master.id,revision:row?.revision,ownerId:owner.id,typeId,colorId:color?.id??null};
   }
   await requestJSON('/material-items/variants'+(row?'/'+row.id:'')+buildQueryString({orgId}),{method:row?'PUT':'POST',body:JSON.stringify(pending.current)});
   if(live.current){pending.current=null;onSaved();}
  }catch(e){if(live.current){if(e.status>=400&&e.status<500)pending.current=null;setError(variantManagementError(e,m));}}
  finally{lock.current=false;if(live.current){locked.current=Boolean(pending.current);setBusy(false);}}
 };
 const isLocked=busy||Boolean(pending.current),invalid=!options||!attributes||!owner?.id||options.fields.type==='REQUIRED'&&!typeText.trim()||options.fields.color==='REQUIRED'&&!color;
 return <><DialogContent><Stack spacing={2} sx={{pt:2}}>{selector&&React.cloneElement(selector,{disabled:isLocked})}
  {error&&<AppNotice severity="error" action={!options||!attributes?<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>:undefined}>{error}</AppNotice>}
  {!options&&!error&&<LinearProgress/>}
  <TextField label={t.unit} value={materialItemName(row?.unit||options?.master?.data.unit,languageCode)} slotProps={{input:{readOnly:true},inputLabel:{shrink:true}}}/>
  {attributes&&<ExpenseLookupField label={t.owner} required options={attributes.owners} value={owner} onChange={setOwner} disabled={isLocked} languageCode={languageCode} getCode={value=>value.code} getOptionLabel={value=>value[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||value.name||''} columns={[{key:'code',label:t.code,value:value=>value.code},{key:'name',label:t.owner,value:value=>value.name}]}/>}
  {options&&<><Autocomplete freeSolo disabled={isLocked||!typeEnabled||!attributes} options={attributes?.types||[]} getOptionLabel={value=>typeof value==='string'?value:materialItemName(value,languageCode)} inputValue={typeText} onInputChange={(_,value)=>{createdType.current=null;setTypeText(value);}} onChange={(_,value)=>{createdType.current=null;setTypeText(typeof value==='string'?value:materialItemName(value,languageCode));}} renderInput={params=><TextField {...params} label={t.variant} required={options.fields.type==='REQUIRED'} slotProps={{htmlInput:{...params.inputProps,maxLength:100}}}/>}/>
  <ExpenseLookupField label={t.color} required={options.fields.color==='REQUIRED'} options={options.colors} value={color} onChange={setColor} disabled={isLocked||!colorEnabled} languageCode={languageCode} getCode={value=>value.code} getOptionLabel={value=>[value.code,materialItemName(value,languageCode)].filter(Boolean).join(' / ')} columns={[{key:'code',label:t.code,value:value=>value.code},{key:'name',label:t.color,value:value=>materialItemName(value,languageCode)}]}/></>}
 </Stack></DialogContent><DialogActions><Button disabled={isLocked} onClick={close}>{t.cancel}</Button><SaveButton loading={busy} disabled={!pending.current&&invalid} onClick={save}>{pending.current&&error?t.retry:t.save}</SaveButton></DialogActions></>;
}
