import React,{useEffect,useState} from 'react';
import {Alert,Button,Stack,Typography} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {ledgerEvidenceText,ledgerEvidenceErrors} from '../constants/ledgerEvidence';
export default function ExpenseApprovalActions({requestId,version,orgId,languageCode,disabled}){
 const t=ledgerEvidenceText[languageCode]||ledgerEvidenceText.en;
 const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const path=`/expense-requests/${requestId}/approval${buildQueryString({orgId})}`;
 useEffect(()=>{setState(null);setError('');if(!requestId)return;let active=true;requestJSON(path,{skipCache:true}).then(value=>{if(active)setState(value);}).catch(e=>{if(active)setError((ledgerEvidenceErrors[languageCode]||ledgerEvidenceErrors.en)[e.message]||t.errors);});return()=>{active=false;};},[requestId,orgId,version,reload]);
 if(!requestId)return null;
 const approve=async()=>{setBusy(true);setError('');try{await requestJSON(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:state.version})});setReload(n=>n+1);}catch(e){setError(e.message);}finally{setBusy(false);}};
 return <Stack spacing={1}><Typography variant="subtitle2">{t.approval} · {state?.approved?t.approved:t.pending}</Typography>{state?.steps.map(step=><Typography key={step.id} variant="body2">{step.position}. {step.employee.name} — {step.approved?t.approved:t.pending}</Typography>)}{state&&!state.steps.length&&<Alert severity="info">{t.none}</Alert>}<Typography variant="caption">{t.changed}</Typography>{state?.canApprove&&<Button disabled={busy||disabled} onClick={approve}>{t.approve}</Button>}{error&&<Alert severity="error">{error}</Alert>}</Stack>;
}
