import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,Paper,Stack,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {approvalSettingsText} from '../../constants/approvalSettings';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {formatEditableDecimal} from '../../utils/editableDecimal.mjs';

export default function ApprovalSettings(){
 const {activeOrgId}=useAuth(),{languageCode}=useLanguage(),t=approvalSettingsText[languageCode]||approvalSettingsText.en;
 const [data,setData]=useState(null),[form,setForm]=useState(null),[initial,setInitial]=useState(''),[error,setError]=useState(false),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const lock=useRef(false),scope=useRef(activeOrgId);scope.current=activeOrgId;
 useUnsavedChanges(!!form&&JSON.stringify(form)!==initial);
 const path=`/expense-approval-settings${buildQueryString({orgId:activeOrgId})}`;
 useEffect(()=>{let active=true;setData(null);setForm(null);setInitial('');setError(false);setSaved(false);
   requestJSON(path,{skipCache:true}).then(value=>{if(active){setData(value);setForm(value.settings);setInitial(JSON.stringify(value.settings));}}).catch(()=>{if(active)setError(true);});
   return()=>{active=false;};
 },[path,reload]);
 const change=patch=>{setForm(current=>({...current,...patch}));setSaved(false);};
 const save=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError(false);setSaved(false);const orgId=activeOrgId;
   try{await requestJSON(path,{method:'PUT',body:JSON.stringify(form)});if(scope.current===orgId){setInitial(JSON.stringify(form));setSaved(true);emitWorkspaceDataChanged({orgId,topics:['expense-approval-settings']});}}
   catch{if(scope.current===orgId)setError(true);}finally{lock.current=false;setBusy(false);}
 };
 const disabled=!data?.canEdit||busy;
 const gradeName=row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'nameEn']||row?.name;
 const employeeSelect=(level)=>{
   const id=form[`${level}EmployeeId`]||'',rows=data.candidates.filter(row=>level==='admin'?row.orgRole==='ADMIN':row.orgRole==='ACCOUNTANT'&&row.gradeId===form[`${level}GradeId`]);
   return <TextField fullWidth select id={`approval-${level}-employee`} name={`${level}EmployeeId`} label={t.approver} value={id} disabled={disabled} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true,renderValue:selected=>rows.find(row=>row.id===selected)?.name||(selected||level==='admin'?t.missing:t.vacant)}}} onChange={event=>change({[`${level}EmployeeId`]:event.target.value?Number(event.target.value):null})}>
     {level!=='admin'&&<MenuItem value="">{t.vacant}</MenuItem>}
     {id&&!rows.some(row=>row.id===id)&&<MenuItem value={id} disabled>{t.missing}</MenuItem>}
     {rows.map(row=><MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
   </TextField>;
 };
 return <AppPageContainer title={t.title}><Stack spacing={2} sx={{maxWidth:1000}}>
   {error&&<Alert severity="error" action={!data?<Button onClick={()=>setReload(n=>n+1)}>{t.title}</Button>:undefined}>{t.error}</Alert>}
   {saved&&<Alert severity="success">{t.saved}</Alert>}
   <Paper variant="outlined" sx={{p:2}}><Stack spacing={2}>
     <Typography variant="h6">{t.rules}</Typography><Typography>{t.hint}</Typography><Typography color="text.secondary">{t.self}</Typography>
     <TextField label={t.drafter} value={data?.drafter.name||''} slotProps={{input:{readOnly:true}}}/>
     {form&&['senior','lead'].map(level=><Paper key={level} variant="outlined" sx={{p:2}}><Stack spacing={2}>
       <Typography variant="subtitle1">{t[level]}</Typography>
       <Stack direction={{xs:'column',md:'row'}} spacing={2}>
         <TextField fullWidth select label={t.grade} value={form[`${level}GradeId`]||''} disabled={disabled} onChange={event=>change({[`${level}GradeId`]:event.target.value?Number(event.target.value):null,[`${level}EmployeeId`]:null})}>
           <MenuItem value="">{t.vacant}</MenuItem>{data.grades.map(row=><MenuItem key={row.id} value={row.id}>{gradeName(row)}</MenuItem>)}
         </TextField>{employeeSelect(level)}
       </Stack>
     </Stack></Paper>)}
     {form&&<><Typography variant="subtitle1">{t.admin} · {t.over}</Typography>{employeeSelect('admin')}
       {['VND','USD','KRW'].map(currency=><Stack key={currency} direction={{xs:'column',sm:'row'}} spacing={2} alignItems="center"><Typography sx={{minWidth:40}}>{currency}</Typography>{['senior','lead'].map(level=><TextField key={level} fullWidth label={`${t[level]} · ${t.limit} (${currency})`} value={formatEditableDecimal(form.limits[currency][level])} disabled={disabled} onChange={event=>change({limits:{...form.limits,[currency]:{...form.limits[currency],[level]:event.target.value.replace(/,/g,'')}}})} slotProps={{htmlInput:{inputMode:currency==='USD'?'decimal':'numeric'}}}/>)}</Stack>)}
       <Typography variant="caption">{t.amountHint}</Typography>
       {data.canEdit?<Button variant="contained" disabled={busy||!form.adminEmployeeId} onClick={save}>{t.save}</Button>:<Alert severity="info">{t.readonly}</Alert>}
     </>}
   </Stack></Paper>
 </Stack></AppPageContainer>;
}
