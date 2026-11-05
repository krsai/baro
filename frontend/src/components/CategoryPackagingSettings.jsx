import React,{useEffect,useState} from 'react';
import {Alert,Button,Paper,Stack,Table,TableBody,TableCell,TableHead,TableRow,TableContainer,Typography} from '@mui/material';
import DecimalAmountField from './DecimalAmountField';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {useAppActions} from '../context/AppContext';
import {useAuth} from '../context/AuthContext';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {revenueCostsText} from '../constants/revenueCosts';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
export default function CategoryPackagingSettings({orgId,languageCode}){
 const t=revenueCostsText[languageCode]||revenueCostsText.en,{showNotification}=useAppActions(),{activeOrgRole}=useAuth();
 const [data,setData]=useState(null),[values,setValues]=useState({}),[error,setError]=useState(false),[busy,setBusy]=useState(false);
 const dirty=Boolean(data)&&JSON.stringify(values)!==JSON.stringify(data.values);useUnsavedChanges(dirty);
 useEffect(()=>{let alive=true;requestJSON('/category-packaging-settings'+buildQueryString({orgId}),{skipCache:true}).then(value=>{if(alive){setData(value);setValues(value.values);}}).catch(()=>alive&&setError(true));return()=>{alive=false;};},[orgId]);
 const save=async()=>{setBusy(true);setError(false);try{const next=await requestJSON('/category-packaging-settings'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify({revision:data.revision,values})});setData(next);setValues(next.values);showNotification(t.saved,'success');emitWorkspaceDataChanged({orgId,source:'category-packaging',topics:['styles','category-packaging']});}catch{setError(true);}finally{setBusy(false);}};
 const valid=Object.values(values).every(value=>value===''||value===null||Number.isFinite(Number(value))&&Number(value)>0&&Number(value)<=100);
 return <Paper id="category-packaging" variant="outlined" sx={{p:2}}><Stack spacing={2}><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="h6">{t.categoryTitle}</Typography><Button variant="contained" disabled={activeOrgRole!=='ADMIN'||!dirty||!valid||busy} onClick={save}>{t.save}</Button></Stack>{error&&<Alert severity="error">{t.failed}</Alert>}<TableContainer><Table size="small"><TableHead><TableRow><TableCell>{t.category}</TableCell><TableCell align="right">{t.volume}</TableCell></TableRow></TableHead><TableBody>{data?.categories.map(row=><TableRow key={row.id}><TableCell>{row[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row.name}</TableCell><TableCell align="right"><DecimalAmountField label={t.volume} value={values[row.id]??''} disabled={busy||activeOrgRole!=='ADMIN'} onValueChange={value=>setValues(previous=>({...previous,[row.id]:value}))} sx={{width:220,'& input':{textAlign:'right'}}} error={values[row.id]!==undefined&&values[row.id]!==''&&!(Number(values[row.id])>0&&Number(values[row.id])<=100)}/></TableCell></TableRow>)}{data&&!data.categories.length&&<TableRow><TableCell colSpan={2}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer></Stack></Paper>;
}
