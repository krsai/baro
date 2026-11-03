import {approvalSubjectText} from '../../constants/approvalSubjects';
import ApprovalRuleEditor,{approvalRuleText} from '../../components/ApprovalRuleEditor';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {approvalSettingsText} from '../../constants/approvalSettings';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {formatEditableDecimal} from '../../utils/editableDecimal.mjs';

export default function ApprovalSettings(){
 const {activeOrgId}=useAuth(),{languageCode}=useLanguage(),t=approvalSettingsText[languageCode]||approvalSettingsText.en,ruleText=approvalRuleText[languageCode]||approvalRuleText.en;
 const [data,setData]=useState(null),[form,setForm]=useState(null),[initial,setInitial]=useState(''),[error,setError]=useState(false),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const lock=useRef(false),scope=useRef(activeOrgId);scope.current=activeOrgId;
 useUnsavedChanges(!!form&&JSON.stringify(form)!==initial);
 const path=`/expense-approval-settings${buildQueryString({orgId:activeOrgId})}`;
 useEffect(()=>{let active=true;setData(null);setForm(null);setInitial('');setError(false);setSaved(false);
   requestJSON(path,{skipCache:true}).then(value=>{if(active){setData(value);const form={kind:'EXPENSE',limits:value.settings.limits,rules:value.settings.rules||[],revision:value.settings.revision||0};setForm(form);setInitial(JSON.stringify(form));}}).catch(()=>{if(active)setError(true);});
   return()=>{active=false;};
 },[path,reload]);
 const change=patch=>{setForm(current=>({...current,...patch}));setSaved(false);};
 const save=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError(false);setSaved(false);const orgId=activeOrgId;
   try{await requestJSON(path,{method:'PUT',body:JSON.stringify(form)});if(scope.current===orgId){const next={...form,revision:form.revision+1};setForm(next);setInitial(JSON.stringify(next));setSaved(true);emitWorkspaceDataChanged({orgId,topics:['expense-approval-settings']});}}
   catch(error){if(scope.current===orgId)setError(error.message==='APPROVAL_SETTINGS_CHANGED'?ruleText.changed:ruleText.error);}finally{lock.current=false;setBusy(false);}
 };
 const disabled=!data?.canEdit||busy;
 return <AppPageContainer title={t.title}><Stack spacing={2} sx={{maxWidth:1000}}>
   {error&&<Alert severity="error" action={!data?<Button onClick={()=>setReload(n=>n+1)}>{t.title}</Button>:undefined}>{typeof error==='string'?error:t.error}</Alert>}
   {saved&&<Alert severity="success">{t.saved}</Alert>}
   {data&&<TextField select label={(approvalSubjectText[languageCode]||approvalSubjectText.en).label} value="EXPENSE" onChange={()=>{}} sx={{maxWidth:400}}>{(data.subjects||[{key:'EXPENSE',enabled:true}]).map(subject=><MenuItem key={subject.key} value={subject.key} disabled={!subject.enabled}>{(approvalSubjectText[languageCode]||approvalSubjectText.en)[subject.key]||subject.key}</MenuItem>)}</TextField>}
   <Paper variant="outlined" sx={{p:2}}><Stack spacing={2}>
     {form&&<ApprovalRuleEditor subject={data.subject} rules={form.rules} grades={data.grades} onChange={rules=>change({rules})} disabled={disabled} languageCode={languageCode}/>}
     <Typography variant="h6">{t.rules}</Typography>
     {form&&<>
       <TableContainer><Table size="small" sx={{minWidth:620,tableLayout:'fixed'}}>
         <TableHead><TableRow><TableCell sx={{width:160}}/>{['USD','KRW','VND'].map(currency=><TableCell key={currency} align="right">{currency}</TableCell>)}</TableRow></TableHead>
         <TableBody>{['senior','lead'].map(level=><TableRow key={level}>
           <TableCell component="th" scope="row" sx={{whiteSpace:'nowrap'}}>{t[level]}</TableCell>
           {['USD','KRW','VND'].map(currency=><TableCell key={currency} align="right"><TextField fullWidth value={formatEditableDecimal(form.limits[currency][level])} disabled={disabled} onChange={event=>change({limits:{...form.limits,[currency]:{...form.limits[currency],[level]:event.target.value.replace(/,/g,'')}}})} slotProps={{htmlInput:{'aria-label':`${t[level]} ${currency}`,inputMode:currency==='USD'?'decimal':'numeric',style:{textAlign:'right'}}}}/></TableCell>)}
         </TableRow>)}</TableBody>
       </Table></TableContainer>
       <Typography variant="caption">{t.amountHint}</Typography>
       {data.canEdit?<Button variant="contained" disabled={busy} onClick={save}>{t.save}</Button>:<Alert severity="info">{t.readonly}</Alert>}
     </>}
   </Stack></Paper>
 </Stack></AppPageContainer>;
}
