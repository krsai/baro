import {ledgerApprovalBands} from '../../utils/ledgerApprovalBands.mjs';
import {Add} from '@mui/icons-material';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,Stack,TextField,Typography} from '@mui/material';
import {approvalSubjectText} from '../../constants/approvalSubjects';
import {changeApprovalText} from '../../constants/changeApprovals';
import {approvalBandText} from '../../constants/approvalBands';
import ApprovalRuleEditor,{approvalRuleText} from '../../components/ApprovalRuleEditor';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {approvalSettingsText} from '../../constants/approvalSettings';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {approvalBandOrderErrors,cleanApprovalBands,invalidApprovalBands} from '../../utils/approvalBands.mjs';

const operations=['CREATE','UPDATE','DELETE'];
const keyFor=(menu,operation)=>menu+':'+operation;
const registrationFor=(menu,operation)=>menu==='BANK_LEDGER'&&operation==='CREATE';
const formFrom=(settings,registration)=>{
 if(!settings)throw new Error('INVALID_APPROVAL_SETTINGS');
 return {...(registration?{version:2}:{}),kind:registration?'BANK_LEDGER':'EXPENSE',drafterScope:settings.drafterScope||{role:'ALL',gradeId:null},limits:settings.limits,rules:registration?ledgerApprovalBands(settings):settings.rules||[],revision:settings.revision||0};
};
const invalidEntry=entry=>invalidApprovalBands(entry.form.rules,{requireAccountant:!registrationFor(entry.menu,entry.operation)});
const dirtyEntry=entry=>Boolean(entry?.form&&JSON.stringify(entry.form)!==entry.initial);

export default function ApprovalSettings(){const {activeOrgId}=useAuth();return <CompanyApprovalSettings key={activeOrgId} activeOrgId={activeOrgId}/>;}
function CompanyApprovalSettings({activeOrgId}){
 const {languageCode}=useLanguage(),{showNotification}=useAppActions();
 const t=approvalSettingsText[languageCode]||approvalSettingsText.en,subject=approvalSubjectText[languageCode]||approvalSubjectText.en,actionText=changeApprovalText[languageCode]||changeApprovalText.en,messages=approvalRuleText[languageCode]||approvalRuleText.en;
 const [menu,setMenu]=useState('EXPENSE'),[entries,setEntries]=useState({}),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const lock=useRef(false),scope=useRef(activeOrgId),live=useRef(true);scope.current=activeOrgId;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let alive=true;setLoading(true);
  Promise.all(operations.map(async operation=>{
   const key=keyFor(menu,operation),registration=registrationFor(menu,operation),path=menu==='EXPENSE'&&operation==='CREATE'?'/expense-approval-settings'+buildQueryString({orgId:activeOrgId}):'/approval-action-settings'+buildQueryString({orgId:activeOrgId,menu,operation});
   try{const data=await requestJSON(path,{skipCache:true}),form=formFrom(data.settings,registration);if(alive)setEntries(current=>{const previous=current[key];return {...current,[key]:{menu,operation,data,form:dirtyEntry(previous)?previous.form:form,initial:dirtyEntry(previous)?previous.initial:JSON.stringify(form),error:''}};});}
   catch{if(alive)setEntries(current=>({...current,[key]:{...current[key],menu,operation,error:t.error}}));}
  })).finally(()=>{if(alive)setLoading(false);});
  return()=>{alive=false;};
 },[activeOrgId,menu,reload]);
 const dirty=Object.values(entries).filter(dirtyEntry);
 useUnsavedChanges(dirty.length>0);
 const update=(operation,patch)=>{setError('');setEntries(current=>{const key=keyFor(menu,operation),entry=current[key];if(!entry?.form)return current;return {...current,[key]:{...entry,form:{...entry.form,...patch}}};});};
 const disabled=saving||loading,invalid=dirty.some(entry=>invalidEntry(entry)||!entry.data?.canEdit||entry.error);
 const save=async()=>{
  if(lock.current||disabled||!dirty.length||invalid)return;lock.current=true;setSaving(true);setError('');const orgId=activeOrgId;
  const changes=dirty.map(entry=>({menu:entry.menu,operation:entry.operation,settings:{...entry.form,stageAuthorityVersion:1,rules:cleanApprovalBands(entry.form.rules)}}));
  try{const result=await requestJSON('/approval-action-settings/batch'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify({changes})});if(!live.current||scope.current!==orgId)return;
   const expected=new Map(changes.map(row=>[keyFor(row.menu,row.operation),row.settings.revision+1]));
   if(!Array.isArray(result?.saved)||result.saved.length!==changes.length||new Set(result.saved.map(row=>keyFor(row.menu,row.operation))).size!==changes.length||result.saved.some(row=>!expected.has(keyFor(row.menu,row.operation))||expected.get(keyFor(row.menu,row.operation))!==row.settings?.revision))throw new Error('INVALID_APPROVAL_SETTINGS');
   const saved=result.saved.map(row=>({...row,form:formFrom(row.settings,registrationFor(row.menu,row.operation))}));
   setEntries(current=>{const next={...current};for(const row of saved){const key=keyFor(row.menu,row.operation),entry=next[key],form=row.form;next[key]={...entry,data:{...entry.data,settings:{...entry.data.settings,...row.settings}},form,initial:JSON.stringify(form),error:''};}return next;});
   showNotification(t.saved,'success');emitWorkspaceDataChanged({orgId,topics:['expense-approval-settings']});setReload(value=>value+1);
  }catch(failure){if(live.current&&scope.current===orgId)setError(failure.message==='APPROVAL_SETTINGS_CHANGED'?messages.changed:messages.error);}finally{lock.current=false;if(live.current)setSaving(false);}
 };
 return <AppPageContainer title={t.title} titleActions={<SaveButton loading={saving} disabled={disabled||!dirty.length||invalid} onClick={save}>{t.save}</SaveButton>} contentSx={{flex:1,minWidth:0}}>
  <Stack spacing={3} data-testid="approval-settings-page" sx={{width:'100%',maxWidth:'none',minWidth:0,flex:1}}>
   <TextField select size="small" label={subject.label} value={menu} disabled={saving} onChange={event=>{setMenu(event.target.value);setError('');}} sx={{width:{xs:'100%',sm:320}}}>{['EXPENSE','BANK_LEDGER'].map(key=><MenuItem key={key} value={key}>{actionText[key]}</MenuItem>)}</TextField>
   {error&&<Alert severity="error">{error}</Alert>}
   {operations.map(operation=><ApprovalOperationSettings key={keyFor(menu,operation)} entry={entries[keyFor(menu,operation)]} menu={menu} operation={operation} disabled={disabled} onChange={patch=>update(operation,patch)} onReload={()=>setReload(value=>value+1)} languageCode={languageCode}/>)}
  </Stack>
 </AppPageContainer>;
}

function ApprovalOperationSettings({entry,menu,operation,disabled,onChange,onReload,languageCode}){
 const t=approvalSettingsText[languageCode]||approvalSettingsText.en,band=approvalBandText[languageCode]||approvalBandText.en,messages=approvalRuleText[languageCode]||approvalRuleText.en,actions=changeApprovalText[languageCode]||changeApprovalText.en;
 const editor=useRef(null),[editorError,setEditorError]=useState(''),form=entry?.form,data=entry?.data,locked=disabled||!data?.canEdit||!!entry?.error,registration=registrationFor(menu,operation);
 return <Stack component="section" aria-label={actions[operation]} data-approval-operation={operation} spacing={2} sx={{minWidth:0}}>
  <Typography component="h2" variant="h6">{actions[operation]}</Typography>
  {(entry?.error||editorError)&&<Alert severity="error" action={<Button onClick={onReload}>{t.title}</Button>}>{entry?.error||editorError}</Alert>}
  {form&&approvalBandOrderErrors(form.rules).size>0&&<Alert severity="warning">{band.orderError}</Alert>}
  {form&&<ApprovalRuleEditor allowGradeRange ref={editor} rules={form.rules} drafterScope={form.drafterScope} onScopeChange={drafterScope=>onChange({drafterScope})} settings={{...data.settings,limits:form.limits}} grades={data.grades} onChange={rules=>onChange({rules})} disabled={locked} languageCode={languageCode} headerActions={<Button startIcon={<Add/>} disabled={locked} sx={{whiteSpace:'nowrap'}} onClick={()=>{if(editor.current?.addCondition()===false)setEditorError(messages.error);}}>{band.addCondition}</Button>}/>}
  {data&&!data.canEdit&&<Alert severity="info">{t.readonly}</Alert>}
 </Stack>;
}
