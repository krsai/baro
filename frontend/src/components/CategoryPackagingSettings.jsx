import VolumeInput from './VolumeInput';
import TableStatusRow from './TableStatusRow';
import React,{useEffect,useState} from 'react';
import {Button,Paper,Stack,Table,TableBody,TableCell,TableHead,TableRow,TableContainer,Typography} from '@mui/material';
import Alert from "./AppNotice";
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {useAppActions} from '../context/AppContext';
import {useAuth} from '../context/AuthContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {revenueCostsText} from '../constants/revenueCosts';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
export default function CategoryPackagingSettings({orgId,languageCode}){
 const t=revenueCostsText[languageCode]||revenueCostsText.en,{showNotification}=useAppActions(),{activeOrgRole}=useAuth();
 const [data,setData]=useState(null),[values,setValues]=useState({}),[formulas,setFormulas]=useState({}),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const dirty=Boolean(data)&&JSON.stringify({values,formulas})!==JSON.stringify({values:data.values,formulas:data.formulas||{}});useUnsavedChanges(dirty);
 useEffect(()=>{let alive=true;requestJSON('/category-packaging-settings'+buildQueryString({orgId}),{skipCache:true}).then(value=>{if(alive){setData(value);setValues(value.values);setFormulas(value.formulas||{});}}).catch(()=>alive&&setError(true));return()=>{alive=false;};},[orgId]);
 const save=async()=>{setBusy(true);setError(false);try{const next=await requestJSON('/category-packaging-settings'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify({revision:data.revision,values,formulas})});setData(next);setValues(next.values);setFormulas(next.formulas||{});showNotification(t.saved,'success');emitWorkspaceDataChanged({orgId,source:'category-packaging',topics:['styles','category-packaging']});}catch{setError(true);}finally{setBusy(false);}};
 const valid=Object.values(values).every(value=>value===''||value===null||Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=100);
 return <Paper id="category-packaging" variant="outlined" sx={{p:2}}><Stack spacing={2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">{t.categoryTitle}</Typography><Button variant="contained" disabled={activeOrgRole!=='ADMIN'||!dirty||!valid||busy} onClick={save}>{t.save}</Button></Stack>{error&&<Alert severity="error">{t.failed}</Alert>}<TableContainer><Table size="small"><TableHead><TableRow><TableCell>{t.category}</TableCell><TableCell align="right">{t.volume}</TableCell></TableRow></TableHead><TableBody>{data?.categories.map(row=><TableRow key={row.id}><TableCell>{row[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row.name}</TableCell><TableCell align="right"><VolumeInput label={t.volume} value={values[row.id]??''} formula={formulas[row.id]||''} name={'category-volume-'+row.id} languageCode={languageCode} disabled={busy||activeOrgRole!=='ADMIN'} onChange={({cbm,cbmFormula})=>{setValues(previous=>({...previous,[row.id]:cbm}));setFormulas(previous=>({...previous,[row.id]:cbmFormula}));}} sx={{width:220,'& input':{textAlign:'right'}}}/></TableCell></TableRow>)}{data&&!data.categories.length&&<TableStatusRow colSpan={2} languageCode={languageCode} state="empty"/>}</TableBody></Table></TableContainer></Stack></Paper>;
}
