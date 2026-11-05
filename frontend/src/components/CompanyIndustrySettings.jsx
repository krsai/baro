import ActionNotice from './ActionNotice';
﻿import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,CircularProgress,Stack} from '@mui/material';
import PartnerClassificationFields from './PartnerClassificationFields';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {classificationComplete,classificationPayload,PARTNER_CLASSIFICATION_TEXT} from '../utils/partnerClassification.mjs';
import {companyIndustryText} from '../constants/companyIndustries';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import useUnsavedChanges from '../hooks/useUnsavedChanges';

export default function CompanyIndustrySettings({orgId,languageCode}){return <Settings key={orgId} orgId={orgId} languageCode={languageCode}/>;}
export function Settings({orgId,languageCode}){
 const t=companyIndustryText[languageCode]||companyIndustryText.en,[value,setValue]=useState(null),[classification,setClassification]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0),[saved,setSaved]=useState(false),live=useRef(true),locked=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;const controller=new AbortController();setValue(null);setReady(false);setError('');requestJSON('/company-industries'+buildQueryString({orgId}),{skipCache:true,signal:controller.signal}).then(profile=>{if(active){setValue(profile);setClassification(profile.classification);}}).catch(e=>{if(active&&e.name!=='AbortError')setError(t.error);});return()=>{active=false;controller.abort();};},[orgId,reload,t]);
 const dirty=!!value&&JSON.stringify(classificationPayload(classification))!==JSON.stringify(classificationPayload(value.classification));useUnsavedChanges(dirty);
 const save=async()=>{if(locked.current||!value?.canEdit||!ready)return;if(!classificationComplete(classification)){setError((PARTNER_CLASSIFICATION_TEXT[languageCode]||PARTNER_CLASSIFICATION_TEXT.en).required);return;}locked.current=true;setBusy(true);setError('');setSaved(false);try{const next=await requestJSON('/company-industries'+buildQueryString({orgId}),{method:'PUT',body:JSON.stringify({classification:classificationPayload(classification)})});if(live.current){setValue(next);setClassification(next.classification);setSaved(true);emitWorkspaceDataChanged({orgId,source:'company-industries',topics:['company-industries','partner-classifications','transaction-codes','business-partners','accounting-codes','customers']});}}catch(e){if(live.current)setError(String(e.message).includes('CHANGED')?t.changed:t.error);}finally{locked.current=false;if(live.current)setBusy(false);}};
 return <Stack spacing={2} data-testid="company-industry-settings">{error&&<Alert severity="error" action={<Button disabled={busy} onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{error}</Alert>}{saved&&<ActionNotice severity="success">{t.saved}</ActionNotice>}{!value&&!error?<CircularProgress size={20}/>:value&&<><PartnerClassificationFields value={classification} onChange={next=>{setClassification(next);setSaved(false);}} orgId={orgId} disabled={busy||!value.canEdit} languageCode={languageCode} onReady={setReady}/>{value.canEdit&&<Stack direction="row" justifyContent="flex-end"><Button variant="contained" disabled={busy||!dirty||!ready} onClick={save}>{t.save}</Button></Stack>}</>}</Stack>;
}
