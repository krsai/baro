import React,{useEffect,useState} from 'react';
import {Alert,Stack,TextField,Typography} from '@mui/material';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {approvalSettingsText} from '../constants/approvalSettings';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export default function ExpenseApprovalSettings({orgId,languageCode,steps=[],drafter,editing,items=[],sourceKind,sourceId}){
  const t=approvalSettingsText[languageCode]||approvalSettingsText.en;
  const [state,setState]=useState(null),[error,setError]=useState(false),[reload,setReload]=useState(0);
  const [preview,setPreview]=useState(null),[previewError,setPreviewError]=useState('');
  const input=JSON.stringify({items,sourceKind,sourceId});
  useEffect(()=>subscribeWorkspaceDataChanged(detail=>{if(Number(detail.orgId)===Number(orgId)&&detail.topics?.includes('expense-approval-settings'))setReload(n=>n+1);}),[orgId]);
  useEffect(()=>{let active=true;setState(null);setError(false);
    requestJSON(`/expense-approval-settings${buildQueryString({orgId})}`,{skipCache:true}).then(data=>{if(active)setState(data);}).catch(()=>{if(active)setError(true);});
    return()=>{active=false;};
  },[orgId,reload]);
  useEffect(()=>{let active=true;setPreview(null);setPreviewError('');
    const timeout=setTimeout(()=>{requestJSON(`/expense-approval-preview${buildQueryString({orgId})}`,{method:'POST',body:input}).then(value=>{if(active)setPreview(value);}).catch(failure=>{if(active)setPreviewError(failure.details?.error||failure.message);});},250);
    return()=>{active=false;clearTimeout(timeout);};
  },[orgId,input,reload]);
  const ids=preview?.ids||[];
  const names=ids.map(id=>steps.find(step=>step.employeeId===id)?.employee?.name||state?.candidates.find(row=>row.id===id)?.name||t.missing);
  return <Stack spacing={1}>
    <Typography variant="subtitle2">{t.preview}</Typography>
    <Stack direction="row" alignItems="center" spacing={1}>
      <TextField fullWidth size="small" label={t.drafter} value={(editing?drafter:state?.drafter)?.name||''} slotProps={{input:{readOnly:true}}}/>
      <Typography>→</Typography>
      <TextField fullWidth size="small" label={t.approver} value={names.join(' → ')||(preview?t.none:'')} slotProps={{input:{readOnly:true}}}/>
    </Stack>
    {error&&<Alert severity="error">{t.error}</Alert>}
    {preview&&<Typography variant="caption">{t.total}: {preview.policy.totals.map(row=>`${Number(row.amount).toLocaleString()} ${row.currency}`).join(' / ')}</Typography>}
    {previewError&&<Alert severity={['INVALID_PRICE_OR_QUANTITY','INVALID_TRANSACTION_AMOUNT'].includes(previewError)?'info':'warning'}>{previewError==='APPROVAL_CURRENCY_LIMIT_REQUIRED'?t.limitMissing:previewError==='EXPENSE_SELF_APPROVAL'?t.selfError:previewError==='EXPENSE_APPROVER_REQUIRED'?t.missing:t.notReady}</Alert>}
  </Stack>;
}
