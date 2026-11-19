import React,{useEffect,useState} from 'react';
import {Button,Stack,Typography} from '@mui/material';
import ExpenseLookupField from './ExpenseLookupField';
import AppNotice from './AppNotice';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {materialItemText,materialItemName,materialItemSpec} from '../constants/materialItems';
export default function MaterialItemPicker({orgId,baseId,context='EXPENSE',value,snapshot,onChange,languageCode,disabled=false,required=true,onBusyChange}){
 const t=materialItemText[languageCode]||materialItemText.en;
 const [state,setState]=useState({key:'',rows:[],busy:false,error:false}),[reload,setReload]=useState(0),key=String(orgId)+':'+baseId+':'+context;
 useEffect(()=>{let live=true;if(!orgId||!baseId||disabled){setState({key,rows:[],busy:false,error:false});onBusyChange?.(false);return;}
  setState({key,rows:[],busy:true,error:false});onBusyChange?.(required&&!value);
  requestJSON('/material-items/options'+buildQueryString({orgId,baseId,context}),{skipCache:true}).then(rows=>{if(live){setState({key,rows,busy:false,error:false});onBusyChange?.(false);}}).catch(()=>{if(live){setState({key,rows:[],busy:false,error:true});onBusyChange?.(required&&!value);}});
  return()=>{live=false;onBusyChange?.(false);};
 },[key,reload,disabled,onBusyChange]);
 const rows=state.key===key?state.rows:[],selected=rows.find(row=>row.id===value)||(value&&snapshot?{id:value,data:snapshot}:null);
 return <Stack spacing={1}><ExpenseLookupField label={t.title} required={required} languageCode={languageCode} disabled={disabled||state.busy||state.error||state.key!==key} options={rows} value={selected} getOptionLabel={row=>materialItemName(row,languageCode)} getCode={row=>row.data?.nameEn} columns={[{key:'owner',label:t.owner,value:row=>row.data?.itemOwnerSnapshot?.name||''},{key:'name',label:t.name,value:row=>materialItemName(row,languageCode)},{key:'spec',label:t.spec,value:materialItemSpec},{key:'unit',label:t.unit,value:row=>materialItemName(row.data?.unit,languageCode)}]} onChange={onChange}/>{selected&&<Typography variant="body2">{materialItemSpec(selected)}</Typography>}{state.error&&<AppNotice severity="error" action={<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</AppNotice>}</Stack>;
}
