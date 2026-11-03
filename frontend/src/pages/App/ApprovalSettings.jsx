import {Add} from '@mui/icons-material';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,Stack,TextField} from '@mui/material';
import {approvalSubjectText} from '../../constants/approvalSubjects';
import {approvalBandText} from '../../constants/approvalBands';
import ApprovalRuleEditor,{approvalRuleText} from '../../components/ApprovalRuleEditor';
import AppPageContainer from '../../components/AppPageContainer';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {approvalSettingsText} from '../../constants/approvalSettings';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {approvalBandOrderErrors,cleanApprovalBands,invalidApprovalBands} from '../../utils/approvalBands.mjs';

export default function ApprovalSettings(){
 const {activeOrgId}=useAuth(),{languageCode}=useLanguage();
 const t=approvalSettingsText[languageCode]||approvalSettingsText.en,band=approvalBandText[languageCode]||approvalBandText.en,subject=approvalSubjectText[languageCode]||approvalSubjectText.en,messages=approvalRuleText[languageCode]||approvalRuleText.en;
 const [data,setData]=useState(null),[form,setForm]=useState(null),[initial,setInitial]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const lock=useRef(false),editor=useRef(null),scope=useRef(activeOrgId);scope.current=activeOrgId;
 useUnsavedChanges(!!form&&JSON.stringify(form)!==initial);
 const path=`/expense-approval-settings${buildQueryString({orgId:activeOrgId})}`;
 useEffect(()=>{let live=true;setData(null);setForm(null);setInitial('');setError('');setSaved(false);
  requestJSON(path,{skipCache:true}).then(value=>{if(live){setData(value);const next={kind:'EXPENSE',drafterScope:value.settings.drafterScope||{role:'ALL',gradeId:null},limits:value.settings.limits,rules:value.settings.rules||[],revision:value.settings.revision||0};setForm(next);setInitial(JSON.stringify(next));}}).catch(()=>{if(live)setError(t.error);});return()=>{live=false;};
 },[path,reload]);
 const change=rules=>{setForm(current=>({...current,rules}));setSaved(false);setError('');};
 const invalid=form&&invalidApprovalBands(form.rules),disabled=!data?.canEdit||busy;
 const save=async()=>{if(lock.current||!form||invalid)return;lock.current=true;setBusy(true);setError('');setSaved(false);const orgId=activeOrgId,payload={...form,rules:cleanApprovalBands(form.rules)};
  try{await requestJSON(path,{method:'PUT',body:JSON.stringify(payload)});if(scope.current===orgId){const next={...payload,revision:payload.revision+1};setForm(next);setInitial(JSON.stringify(next));setSaved(true);emitWorkspaceDataChanged({orgId,topics:['expense-approval-settings']});}}
  catch(failure){if(scope.current===orgId)setError(failure.message==='APPROVAL_SETTINGS_CHANGED'?messages.changed:messages.error);}finally{lock.current=false;setBusy(false);}
 };
 return <AppPageContainer title={t.title} titleActions={<Button variant="contained" disabled={disabled||!form||invalid} onClick={save}>{t.save}</Button>} contentSx={{flex:1,minWidth:0}}>
  <Stack spacing={2} data-testid="approval-settings-page" sx={{width:'100%',maxWidth:'none',minWidth:0,flex:1}}>
   {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.title}</Button>}>{error}</Alert>}
   {saved&&<Alert severity="success">{t.saved}</Alert>}
   {form&&approvalBandOrderErrors(form.rules).size>0&&<Alert severity="warning">{band.orderError}</Alert>}
   <Stack direction={{xs:'column',sm:'row'}} spacing={2} justifyContent="space-between" alignItems={{sm:'center'}}>
    {data&&<TextField select size="small" label={subject.label} value="EXPENSE" onChange={()=>{}} sx={{width:{xs:'100%',sm:320}}}>{(data.subjects||[{key:'EXPENSE',enabled:true}]).map(row=><MenuItem key={row.key} value={row.key} disabled={!row.enabled}>{subject[row.key]||row.key}</MenuItem>)}</TextField>}
   </Stack>
   {form&&<ApprovalRuleEditor ref={editor} key={activeOrgId} rules={form.rules} drafterScope={form.drafterScope} onScopeChange={drafterScope=>{setForm(current=>({...current,drafterScope}));setSaved(false);}} settings={{...data.settings,limits:form.limits}} grades={data.grades} onChange={change} disabled={disabled} languageCode={languageCode} headerActions={<Button startIcon={<Add/>} disabled={disabled} sx={{whiteSpace:'nowrap'}} onClick={()=>{if(editor.current?.addCondition()===false)setError(messages.error);}}>{band.addCondition}</Button>}/>}
   {data&&!data.canEdit&&<Alert severity="info">{t.readonly}</Alert>}
  </Stack>
 </AppPageContainer>;
}
