import ActionNotice from '../../components/ActionNotice';
import LedgerRegistrationPolicyEditor from '../../components/LedgerRegistrationPolicyEditor';
import {Add} from '@mui/icons-material';
import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,MenuItem,Stack,TextField,Typography} from '@mui/material';
import {approvalSubjectText} from '../../constants/approvalSubjects';
import {changeApprovalText} from '../../constants/changeApprovals';
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
 const {languageCode}=useLanguage();
 const t=approvalSettingsText[languageCode]||approvalSettingsText.en,subject=approvalSubjectText[languageCode]||approvalSubjectText.en,actionText=changeApprovalText[languageCode]||changeApprovalText.en;
 const [menu,setMenu]=useState('EXPENSE');
 const drafts=useRef({});
 return <AppPageContainer title={t.title} contentSx={{flex:1,minWidth:0}}>
  <Stack spacing={3} data-testid="approval-settings-page" sx={{width:'100%',maxWidth:'none',minWidth:0,flex:1}}>
   <TextField select size="small" label={subject.label} slotProps={{select:{inputProps:{"aria-label":subject.label}}}} value={menu} onChange={e=>setMenu(e.target.value)} sx={{width:{xs:'100%',sm:320}}}>{['EXPENSE','BANK_LEDGER'].map(key=><MenuItem key={key} value={key}>{actionText[key]}</MenuItem>)}</TextField>
   {['CREATE','UPDATE','DELETE'].map(operation=><ApprovalOperationSettings key={`${menu}:${operation}`} menu={menu} operation={operation} drafts={drafts} />)}
  </Stack>
 </AppPageContainer>;
}

function ApprovalOperationSettings({menu,operation,drafts}){
 const {activeOrgId}=useAuth(),{languageCode}=useLanguage();
 const t=approvalSettingsText[languageCode]||approvalSettingsText.en,band=approvalBandText[languageCode]||approvalBandText.en,messages=approvalRuleText[languageCode]||approvalRuleText.en;
 const actionText=changeApprovalText[languageCode]||changeApprovalText.en;
 const registration=menu==='BANK_LEDGER'&&operation==='CREATE';
 const [data,setData]=useState(null),[form,setForm]=useState(null),[initial,setInitial]=useState(''),[error,setError]=useState(''),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const lock=useRef(false),editor=useRef(null),scope=useRef(''),loadedPath=useRef('');
 useUnsavedChanges(!!form&&JSON.stringify(form)!==initial);
 const path=menu==='EXPENSE'&&operation==='CREATE'?`/expense-approval-settings${buildQueryString({orgId:activeOrgId})}`:`/approval-action-settings${buildQueryString({orgId:activeOrgId,menu,operation})}`;
 scope.current=path;
 if(form&&loadedPath.current===path){if(JSON.stringify(form)!==initial)drafts.current[path]={form,initial};else delete drafts.current[path];}
 useEffect(()=>{let live=true;setData(null);setForm(null);setInitial('');setError('');setSaved(false);
  requestJSON(path,{skipCache:true}).then(value=>{if(live){if(!value?.settings||registration&&!Array.isArray(value.settings.registrationStages))throw new Error('INVALID_APPROVAL_SETTINGS');setData(value);const next={registrationStages:value.settings.registrationStages,kind:'EXPENSE',drafterScope:value.settings.drafterScope||{role:'ALL',gradeId:null},limits:value.settings.limits,rules:value.settings.rules||[],revision:value.settings.revision||0};loadedPath.current=path;setForm(drafts.current[path]?.form||next);setInitial(drafts.current[path]?.initial||JSON.stringify(next));}}).catch(()=>{if(live)setError(t.error);});return()=>{live=false;if(scope.current===path)scope.current='';};
 },[path,reload]);
 const change=rules=>{setForm(current=>({...current,rules}));setSaved(false);setError('');};
 const invalid=form&&(registration?(!form.registrationStages?.length||form.registrationStages.some(s=>s.gradeMatch!=='ANY'&&!s.gradeId)):invalidApprovalBands(form.rules)),disabled=!data?.canEdit||busy;
 const save=async()=>{if(lock.current||!form||invalid)return;lock.current=true;setBusy(true);setError('');setSaved(false);const orgId=activeOrgId,payload={...form,rules:cleanApprovalBands(form.rules)};
  try{await requestJSON(path,{method:'PUT',body:JSON.stringify(payload)});if(scope.current===path){const next={...payload,revision:payload.revision+1};delete drafts.current[path];setForm(next);setInitial(JSON.stringify(next));setSaved(true);emitWorkspaceDataChanged({orgId,topics:['expense-approval-settings']});}}
  catch(failure){if(scope.current===path)setError(failure.message==='APPROVAL_SETTINGS_CHANGED'?messages.changed:messages.error);}finally{lock.current=false;setBusy(false);}
 };
 return <Stack component="section" aria-label={actionText[operation]} data-approval-operation={operation} spacing={2} sx={{minWidth:0}}>
   <Stack direction="row" justifyContent="space-between" alignItems="center">
    <Typography component="h2" variant="h6">{actionText[operation]}</Typography>
    <Button variant="contained" disabled={disabled||!form||invalid} onClick={save}>{t.save}</Button>
   </Stack>
   {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.title}</Button>}>{error}</Alert>}
   {saved&&<ActionNotice severity="success">{t.saved}</ActionNotice>}
   {form&&approvalBandOrderErrors(form.rules).size>0&&<Alert severity="warning">{band.orderError}</Alert>}
   {form&&registration&&<LedgerRegistrationPolicyEditor value={form.registrationStages} grades={data.grades} languageCode={languageCode} disabled={disabled} onChange={registrationStages=>{setForm(current=>({...current,registrationStages}));setSaved(false);}}/>}
   {form&&!registration&&<ApprovalRuleEditor ref={editor} key={path} rules={form.rules} drafterScope={form.drafterScope} onScopeChange={drafterScope=>{setForm(current=>({...current,drafterScope}));setSaved(false);}} settings={{...data.settings,limits:form.limits}} grades={data.grades} onChange={change} disabled={disabled} languageCode={languageCode} headerActions={<Button startIcon={<Add/>} disabled={disabled} sx={{whiteSpace:'nowrap'}} onClick={()=>{if(editor.current?.addCondition()===false)setError(messages.error);}}>{band.addCondition}</Button>}/>}
   {data&&!data.canEdit&&<Alert severity="info">{t.readonly}</Alert>}
 </Stack>;
}
