import React,{useEffect,useRef,useState} from 'react';
import {Button,Dialog,DialogActions,DialogContent,DialogTitle,Stack,TextField} from '@mui/material';
import CodeItemAttributeFields from './CodeItemAttributeFields';
import ExpenseLookupField from './ExpenseLookupField';
import SaveButton from './SaveButton';
import AppNotice from './AppNotice';
import {usePageDialogs} from './PageDialogProvider';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {materialItemName,materialItemText} from '../constants/materialItems';
import {materialVariantManagementText,variantManagementError} from '../constants/materialVariantManagement';
import {requestJSON,buildQueryString} from '../utils/apiClient';
export default function MaterialVariantEditor({orgId,baseId,row,languageCode,onClose,onSaved}){
 const t=materialItemText[languageCode]||materialItemText.en,m=materialVariantManagementText[languageCode]||materialVariantManagementText.en,dialogs=usePageDialogs();
 const [options,setOptions]=useState(null),[reload,setReload]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attributesBusy,setAttributesBusy]=useState(true);
 const [line,setLine]=useState({key:'variant',itemOwnerOrgId:row?.ownerId??null,itemOwnerSnapshot:row?.attributes.owner??null,itemTypeId:row?.attributes.type?.id??null,itemAttributeSnapshot:{type:row?.attributes.type??null}}),[color,setColor]=useState(row?.attributes.color??null);
 const initial=useRef(JSON.stringify([line,color])),pending=useRef(null),clientKey=useRef(crypto.randomUUID()),live=useRef(true),lock=useRef(false);
 const dirty=JSON.stringify([line,color])!==initial.current;useUnsavedChanges(dirty);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;setError('');requestJSON('/material-items/variant-options'+buildQueryString({orgId,baseId}),{skipCache:true}).then(data=>{if(active)setOptions(data);}).catch(()=>{if(active)setError(m.failed);});return()=>{active=false;};},[orgId,baseId,reload,m.failed]);
 const close=async()=>{if(busy||pending.current)return;if(!dirty||await dialogs.confirm('',{purpose:'discard'}))onClose();};
 const save=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError('');
  pending.current??={clientKey:clientKey.current,baseId,masterId:row?.masterId||options.master.id,revision:row?.revision,ownerId:line.itemOwnerOrgId,typeId:line.itemTypeId??null,colorId:color?.id??null};
  try{await requestJSON('/material-items/variants'+(row?'/'+row.id:'')+buildQueryString({orgId}),{method:row?'PUT':'POST',body:JSON.stringify(pending.current)});if(live.current){pending.current=null;onSaved();}}
  catch(e){if(live.current){if(e.status>=400&&e.status<500)pending.current=null;setError(variantManagementError(e,m));}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 };
 const locked=busy||Boolean(pending.current),invalid=!options||attributesBusy||!line.itemOwnerOrgId||options.fields.type==='REQUIRED'&&!line.itemTypeId||options.fields.color==='REQUIRED'&&!color;
 return <Dialog open fullWidth maxWidth="sm" onClose={close}><DialogTitle>{row?m.edit:m.add}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:2}}>
  {error&&<AppNotice severity="error" action={!options?<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>:undefined}>{error}</AppNotice>}
  <TextField label={t.unit} value={materialItemName(row?.unit||options?.master?.data.unit,languageCode)} slotProps={{input:{readOnly:true},inputLabel:{shrink:true}}}/>
  {options&&<CodeItemAttributeFields context="MATERIAL" orgId={orgId} languageCode={languageCode} code={{baseId,base:{attributeInputs:{owner:'REQUIRED',type:options.fields.type,customer:'HIDDEN'}}}} line={line} onBusyChange={setAttributesBusy} onChange={(_,patch)=>{setError('');setLine(current=>({...current,...patch}));}} disabled={locked}/>}
  {options&&<ExpenseLookupField label={t.color} required={options.fields.color==='REQUIRED'} options={options.colors} value={color} onChange={setColor} disabled={locked} languageCode={languageCode} getCode={value=>value.code} getOptionLabel={value=>[value.code,materialItemName(value,languageCode)].filter(Boolean).join(' · ')} columns={[{key:'code',label:t.code,value:value=>value.code},{key:'name',label:t.color,value:value=>materialItemName(value,languageCode)}]}/>}
 </Stack></DialogContent><DialogActions><Button disabled={locked} onClick={close}>{t.cancel}</Button><SaveButton loading={busy} disabled={!pending.current&&invalid} onClick={save}>{pending.current&&error?t.retry:t.save}</SaveButton></DialogActions></Dialog>;
}
