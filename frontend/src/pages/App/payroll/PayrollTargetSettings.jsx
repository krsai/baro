import React,{useCallback,useState} from 'react';
import {Box,Button,Dialog,DialogTitle,Tab,Tabs} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ManagementTargetSettings from '../../../components/ManagementTargetSettings';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {managementTargetText} from '../../../constants/managementTargets';
import PayrollSettingsDialog from './PayrollSettingsDialog';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';

const TEXT={
 ko:{title:'대상 설정',employee:'직원 관리',payable:'미지급금 대상',evidence:'급여 지급 연결'},
 en:{title:'Target settings',employee:'Employees',payable:'Payables',evidence:'Salary payment linking'},
 vi:{title:'Cài đặt đối tượng',employee:'Nhân viên',payable:'Công nợ phải trả',evidence:'Liên kết trả lương'},
};
export default function PayrollTargetSettings({orgId,languageCode='en',onSaved,showNotification,disabled=false,initialSearch='',includeEmployees=true}){
 const t=TEXT[languageCode]||TEXT.en,dialogs=usePageDialogs();
 const [open,setOpen]=useState(false),[tab,setTab]=useState(includeEmployees?'EMPLOYEE':'PAYABLE'),[states,setStates]=useState({});
 const employeeState=useCallback(value=>setStates(previous=>({...previous,EMPLOYEE:value})),[]);
 const payableState=useCallback(value=>setStates(previous=>({...previous,PAYABLE:value})),[]);
 const evidenceState=useCallback(value=>setStates(previous=>({...previous,EVIDENCE:value})),[]);
 const locked=Object.values(states).some(state=>state.locked);
 useUnsavedChanges(open&&Object.values(states).some(state=>state.dirty));
 const close=async()=>{
  if(locked)return;
  if(Object.values(states).some(state=>state.dirty)&&!await dialogs.confirm((managementTargetText[languageCode]||managementTargetText.en).discard))return;
  setOpen(false);setStates({});
 };
 return <>
  <Button variant="outlined" startIcon={<SettingsOutlinedIcon/>} disabled={disabled||!orgId} onClick={()=>{setStates({});setTab(includeEmployees?'EMPLOYEE':'PAYABLE');setOpen(true);}}>{t.title}</Button>
  <Dialog open={open} onClose={close} fullWidth maxWidth="lg" aria-labelledby="payroll-target-settings-title">
   <DialogTitle id="payroll-target-settings-title">{t.title}</DialogTitle>
   <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="scrollable" scrollButtons="auto" aria-label={t.title} sx={{px:3,borderBottom:1,borderColor:'divider'}}>
    {includeEmployees&&<Tab id="payroll-target-tab-EMPLOYEE" aria-controls="payroll-target-panel-EMPLOYEE" value="EMPLOYEE" label={t.employee} disabled={locked}/>}
    <Tab id="payroll-target-tab-PAYABLE" aria-controls="payroll-target-panel-PAYABLE" value="PAYABLE" label={t.payable} disabled={locked}/>
    <Tab id="payroll-target-tab-EVIDENCE" aria-controls="payroll-target-panel-EVIDENCE" value="EVIDENCE" label={t.evidence} disabled={locked}/>
   </Tabs>
   {open&&<Box sx={{overflowY:'auto'}}>
    {includeEmployees&&<Box role="tabpanel" id="payroll-target-panel-EMPLOYEE" aria-labelledby="payroll-target-tab-EMPLOYEE" hidden={tab!=='EMPLOYEE'}><PayrollSettingsDialog embedded open orgId={orgId} languageCode={languageCode} onClose={()=>{}} onSaved={onSaved} showNotification={showNotification} onStateChange={employeeState}/></Box>}
    {['PAYABLE','EVIDENCE'].map(kind=><Box key={kind} role="tabpanel" id={'payroll-target-panel-'+kind} aria-labelledby={'payroll-target-tab-'+kind} hidden={tab!==kind}><ManagementTargetSettings embedded open orgId={orgId} languageCode={languageCode} kind={kind} initialSearch={initialSearch} onSaved={onSaved} onStateChange={kind==='PAYABLE'?payableState:evidenceState}/></Box>)}
   </Box>}
  </Dialog>
 </>;
}
