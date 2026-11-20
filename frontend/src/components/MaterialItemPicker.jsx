import React,{useEffect,useRef,useState} from 'react';
import {Button,Stack,Typography} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import AppNotice from './AppNotice';
import MaterialVariantEditor from './MaterialVariantEditor';
import {useAuth} from '../context/AuthContext';
import {canAccessPath} from '../utils/accessControl';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {materialItemText,materialItemName,materialItemSpec} from '../constants/materialItems';
export default function MaterialItemPicker({orgId,baseId,context='EXPENSE',value,snapshot,onChange,languageCode,disabled=false,required=true,onBusyChange,selectVariants=false,autoOpen=false}){
 const auth=useAuth(),canRegister=selectVariants&&canAccessPath('/inventory/materials',auth);
 const t=materialItemText[languageCode]||materialItemText.en;
 const [register,setRegister]=useState(false);
 const [state,setState]=useState({key:'',rows:[],busy:false,error:false}),[reload,setReload]=useState(0),key=String(orgId)+':'+baseId+':'+context+':'+selectVariants;
 const currentKey=useRef(key);currentKey.current=key;
 useEffect(()=>{currentKey.current=key;return()=>{currentKey.current=null;};},[key]);
 useEffect(()=>{setRegister(false);},[key]);
 useEffect(()=>{let live=true;if(!orgId||!baseId||disabled){setState({key,rows:[],busy:false,error:false});onBusyChange?.(false);return;}
  setState({key,rows:[],busy:true,error:false});onBusyChange?.(required&&!value);
  requestJSON('/material-items/options'+buildQueryString({orgId,baseId,context,...(selectVariants?{variants:'1'}:{})}),{skipCache:true}).then(rows=>{if(live){setState({key,rows,busy:false,error:false});onBusyChange?.(false);}}).catch(()=>{if(live){setState({key,rows:[],busy:false,error:true});onBusyChange?.(required&&!value);}});
  return()=>{live=false;onBusyChange?.(false);};
 },[key,reload,disabled,onBusyChange]);
 const rows=state.key===key?state.rows:[],selected=rows.find(row=>row.id===value&&(!selectVariants||row.variantId===snapshot?.variantId))||(value&&snapshot?{id:value,variantId:snapshot.variantId,data:snapshot}:null);
 const registered=async saved=>{
  setRegister(false);setState({key,rows,busy:true,error:false});onBusyChange?.(true);
  try{
   const options=await requestJSON('/material-items/options'+buildQueryString({orgId,baseId,context,variants:'1'}),{skipCache:true});
   if(currentKey.current!==key)return;
   setState({key,rows:options,busy:false,error:false});onBusyChange?.(false);
   const created=options.find(row=>row.variantId===saved.id);if(created)onChange(created);
  }catch{if(currentKey.current===key){setState({key,rows:[],busy:false,error:true});onBusyChange?.(required&&!value);}}
 };
 return <Stack spacing={1}><ExpenseLookupField autoOpen={autoOpen&&state.key===key&&!state.busy&&!state.error} onDirectInput={canRegister&&!disabled?()=>setRegister(true):undefined} directInputLabel={t.add} getOptionKey={row=>row.variantId||row.id} label={t.title} required={required} languageCode={languageCode} disabled={disabled||state.busy||state.error||state.key!==key} options={rows} value={selected} getOptionLabel={row=>materialItemName(row,languageCode)} getCode={row=>row.data?.nameEn} columns={[{key:'owner',label:t.owner,value:row=>row.data?.itemOwnerSnapshot?.name||''},{key:'name',label:t.name,value:row=>materialItemName(row,languageCode)},{key:'spec',label:t.spec,value:materialItemSpec},{key:'unit',label:t.unit,value:row=>materialItemName(row.data?.unit,languageCode)}]} onChange={onChange}/>{canRegister&&<Button disabled={disabled||state.busy||state.error} onClick={()=>setRegister(true)}>{t.add}</Button>}{selectVariants&&state.key===key&&!state.busy&&!state.error&&!rows.length&&<Typography color="text.secondary">{t.noItems}</Typography>}{register&&<MaterialVariantEditor {...{orgId,baseId,languageCode}} onClose={()=>setRegister(false)} onSaved={registered}/>}{selected&&<Typography variant="body2">{materialItemSpec(selected)}</Typography>}{state.error&&<AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>}</Stack>;
}
