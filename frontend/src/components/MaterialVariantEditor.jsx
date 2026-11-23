import {inventoryColorText} from '../constants/inventoryColors';
import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import DialogDetailPanel from './DialogDetailPanel';
import DialogRecordActions from './DialogRecordActions';
import RecordDetails from './RecordDetails';
import {rankMaterialCandidates} from '../utils/materialSimilarity.mjs';
import {materialVariantOwner,materialVariantType} from './MaterialVariantRows';
import {materialRegistrationText} from '../constants/materialRegistration';
import React,{useEffect,useRef,useState} from 'react';
import {Button,LinearProgress,Stack,TextField} from '@mui/material';
import Autocomplete from './SearchableSelect';
import ExpenseLookupField from './ExpenseLookupField';
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
 const title=codes?t.registerMaster:row?m.edit:m.add;
 return selectedBaseId?<VariantForm key={selectedBaseId} {...{orgId,baseId:selectedBaseId,row,languageCode,onClose,onSaved,selector,dirty,locked,closeForm,title}}/>:React.cloneElement(selector,{autoOpen:true,searchOnly:true,onSearchClose:onClose});
}
function VariantForm({orgId,baseId,row,languageCode,onClose,onSaved,selector,dirty,locked,closeForm,title}){
 const readOnly=Boolean(row&&(row.used||row.editable===false));
 const t=materialItemText[languageCode]||materialItemText.en,m=materialVariantManagementText[languageCode]||materialVariantManagementText.en,dialogs=usePageDialogs();
 const a=materialRegistrationText[languageCode]||materialRegistrationText.en,c=inventoryColorText[languageCode]||inventoryColorText.en;
 const [preview,setPreview]=useState(null);
 const [registered,setRegistered]=useState(null);
 const [options,setOptions]=useState(null),[attributes,setAttributes]=useState(null),[reload,setReload]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [owner,setOwner]=useState(row?.attributes.owner||null),[typeText,setTypeText]=useState(materialItemName(row?.attributes.type,languageCode)),[color,setColor]=useState(row?.attributes.color||null);
 const initial=useRef(JSON.stringify([owner,typeText,color])),pending=useRef(null),createdType=useRef(null),clientKey=useRef(crypto.randomUUID()),live=useRef(true),lock=useRef(false);
 const changed=JSON.stringify([owner,typeText,color])!==initial.current;dirty.current=changed;useUnsavedChanges(changed);
 useEffect(()=>{live.current=true;return()=>{live.current=false;closeForm.current=null;};},[]);
 useEffect(()=>{let active=true;setError('');setOptions(null);setAttributes(null);Promise.all([requestJSON('/material-items/variant-options'+buildQueryString({orgId,baseId}),{skipCache:true}),requestJSON('/code-item-options'+buildQueryString({orgId,baseId,context:'MATERIAL'}),{skipCache:true})]).then(([data,attrs])=>{if(active){setOptions(data);setAttributes(attrs);}}).catch(()=>{if(active)setError(m.failed);});return()=>{active=false;};},[orgId,baseId,reload,m.failed]);
 useEffect(()=>{if(row)return;let active=true;setRegistered(null);requestJSON('/material-items/variants'+buildQueryString({orgId,baseId}),{skipCache:true}).then(data=>{if(active)setRegistered(data.filter(v=>v.baseId===baseId));}).catch(()=>{if(active)setError(a.failed);});return()=>{active=false;};},[orgId,baseId,reload]);
 const close=async()=>{if(locked.current)return;if(!changed||await dialogs.confirm('',{purpose:'discard'}))onClose();};closeForm.current=close;
 const typeEnabled=options?.fields.type!=='HIDDEN';
 const save=async()=>{
  if(readOnly||lock.current)return;lock.current=true;locked.current=true;setBusy(true);setError('');
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
   const saved=await requestJSON('/material-items/variants'+(row?'/'+row.id:'')+buildQueryString({orgId}),{method:row?'PUT':'POST',body:JSON.stringify(pending.current)});
   if(live.current){pending.current=null;onSaved(saved);}
  }catch(e){if(live.current){if(e.status>=400&&e.status<500)pending.current=null;setError(variantManagementError(e,m));}}
  finally{lock.current=false;if(live.current){locked.current=Boolean(pending.current);setBusy(false);}}
 };
 const isLocked=busy||Boolean(pending.current)||readOnly,invalid=!options||!attributes||!row&&registered===null||!owner?.id||options.fields.type==='REQUIRED'&&!typeText.trim();
 const columns=[{key:'owner',label:t.owner,value:value=>materialVariantOwner(value,languageCode)},{key:'type',label:t.type,value:value=>materialVariantType(value,languageCode)},{key:'unit',label:t.unit,value:value=>materialItemName(value.unit,languageCode)}];
 const actions=readOnly?null:<DialogRecordActions busy={busy} saveDisabled={!pending.current&&invalid} onSave={save} saveLabel={pending.current&&error?t.retry:t.save}/>;
 const form=<Stack spacing={2}>
  {error&&<AppNotice severity="error" action={!options||!attributes||!row&&registered===null?<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>:undefined}>{error}</AppNotice>}
  {!options&&!error&&<LinearProgress/>}
  <TextField label={t.unit} value={materialItemName(row?.unit||options?.master?.data.unit,languageCode)} slotProps={{input:{readOnly:true},inputLabel:{shrink:true}}}/>
  {attributes&&<ExpenseLookupField label={t.owner} required options={attributes.owners} value={owner} onChange={setOwner} disabled={isLocked} languageCode={languageCode} getCode={value=>value.code} getOptionLabel={value=>value[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||value.name||''} columns={[{key:'code',label:t.code,value:value=>value.code},{key:'name',label:t.owner,value:value=>value.name}]}/>}
  {options&&<><Autocomplete freeSolo disabled={isLocked||!typeEnabled||!attributes} options={attributes?.types||[]} getOptionLabel={value=>typeof value==='string'?value:materialItemName(value,languageCode)} inputValue={typeText} onInputChange={(_,value)=>{createdType.current=null;setTypeText(value);}} onChange={(_,value)=>{createdType.current=null;setTypeText(typeof value==='string'?value:materialItemName(value,languageCode));}} renderInput={params=><TextField {...params} label={t.variant} required={options.fields.type==='REQUIRED'} slotProps={{htmlInput:{...params.inputProps,maxLength:100}}}/>}/></>}
 </Stack>;
 return <ListDetailDialog open title={title} slotProps={{paper:{'aria-labelledby':undefined,'aria-label':title}}} onClose={close} maxWidth={row?'sm':false}
  tools={selector&&React.cloneElement(selector,{disabled:isLocked})}
  onNew={!row?()=>setPreview(null):undefined} newLabel={c.new} newDisabled={isLocked}
  list={!row?<DialogRecordList rows={rankMaterialCandidates(registered||[],typeText,owner?.id)} columns={columns} selectedKey={preview?.id} onPreview={setPreview} onSelect={setPreview} disabled={isLocked} loading={registered===null&&!error} error={registered===null&&Boolean(error)} onRetry={()=>setReload(n=>n+1)} languageCode={languageCode}/>:<DialogDetailPanel footer={actions}>{form}</DialogDetailPanel>}
  detail={row?null:preview?<DialogDetailPanel title={a.similar} footer={<Button disabled={isLocked} onClick={()=>setPreview(null)}>{c.clear}</Button>}><RecordDetails framed={false} fields={columns.map(column=>({...column,value:column.value(preview)}))}/></DialogDetailPanel>:<DialogDetailPanel title={m.add} footer={actions}>{form}</DialogDetailPanel>}
  actions={<Button disabled={busy||Boolean(pending.current)} onClick={close}>{t.close}</Button>}/>;
}
