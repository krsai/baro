import Dialog from '../../../components/AppDialog';
import React,{useCallback,useState} from 'react';
import {Box,DialogTitle} from '@mui/material';
import ManagementTargetSettings from '../../../components/ManagementTargetSettings';
import PageSettingsButton from '../../../components/PageSettingsButton';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {managementTargetText} from '../../../constants/managementTargets';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';

const TEXT={
 ko:{title:'급여 AP 대상 설정'},
 en:{title:'Payroll AP settings'},
 vi:{title:'Thiết lập khoản phải trả lương'},
};
export default function PayrollTargetSettings({orgId,languageCode='en',onSaved,disabled=false,initialSearch=''}){
 const t=TEXT[languageCode]||TEXT.en,dialogs=usePageDialogs();
 const [open,setOpen]=useState(false),[state,setState]=useState({});
 const evidenceState=useCallback(value=>setState(value),[]);
 const locked=state.locked;
 useUnsavedChanges(open&&state.dirty);
 const close=async()=>{
  if(locked)return;
  if(state.dirty&&!await dialogs.confirm((managementTargetText[languageCode]||managementTargetText.en).discard,{purpose:'discard'}))return;
  setOpen(false);setState({});
 };
 return <>
  <PageSettingsButton label={t.title} disabled={disabled||!orgId} onClick={()=>{setState({});setOpen(true);}}/>
  <Dialog open={open} onClose={close} fullWidth maxWidth="lg" aria-labelledby="payroll-target-settings-title">
   <DialogTitle id="payroll-target-settings-title">{t.title}</DialogTitle>
   {open&&<Box sx={{overflowY:'auto'}}>
    <ManagementTargetSettings embedded open orgId={orgId} languageCode={languageCode} kind="EVIDENCE" initialSearch={initialSearch} onSaved={onSaved} onStateChange={evidenceState}/>
   </Box>}
  </Dialog>
 </>;
}
