import React, {useCallback,useState} from 'react';
import {Box,Button,Dialog,DialogTitle,Tab,Tabs} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ManagementTargetSettings from '../../../components/ManagementTargetSettings';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {managementTargetText} from '../../../constants/managementTargets';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';

const TEXT={
 ko:{title:'대상 설정',INVOICE:'청구서 대상',SHIPPING:'출고 대상'},
 en:{title:'Target settings',INVOICE:'Invoice targets',SHIPPING:'Shipment targets'},
 vi:{title:'Cài đặt đối tượng',INVOICE:'Đối tượng hóa đơn',SHIPPING:'Đối tượng xuất hàng'},
};

export default function OrderTargetSettings({orgId,languageCode='en',disabled=false,onSaved}){
 const t=TEXT[languageCode]||TEXT.en,dialogs=usePageDialogs();
 const [open,setOpen]=useState(false),[tab,setTab]=useState('INVOICE'),[states,setStates]=useState({});
 const invoiceState=useCallback(value=>setStates(previous=>({...previous,INVOICE:value})),[]);
 const shippingState=useCallback(value=>setStates(previous=>({...previous,SHIPPING:value})),[]);
 const locked=Object.values(states).some(state=>state.locked);
 const dirty=Object.values(states).some(state=>state.dirty);
 useUnsavedChanges(open&&dirty);
 const close=async()=>{
  if(locked)return;
  if(dirty&&!await dialogs.confirm((managementTargetText[languageCode]||managementTargetText.en).discard))return;
  setOpen(false);setStates({});
 };
 return <>
  <Button variant="outlined" startIcon={<SettingsOutlinedIcon/>} disabled={disabled||!orgId} onClick={()=>{setStates({});setTab('INVOICE');setOpen(true);}}>{t.title}</Button>
  <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby="order-target-settings-title">
   <DialogTitle id="order-target-settings-title">{t.title}</DialogTitle>
   <Tabs value={tab} onChange={(_,value)=>setTab(value)} variant="scrollable" scrollButtons="auto" aria-label={t.title} sx={{px:3,borderBottom:1,borderColor:'divider'}}>
    {['INVOICE','SHIPPING'].map(kind=><Tab key={kind} id={'order-target-tab-'+kind} aria-controls={'order-target-panel-'+kind} value={kind} label={t[kind]} disabled={locked}/>)}
   </Tabs>
   {open&&<Box sx={{overflowY:'auto'}}>
    {['INVOICE','SHIPPING'].map(kind=><Box key={kind} role="tabpanel" id={'order-target-panel-'+kind} aria-labelledby={'order-target-tab-'+kind} hidden={tab!==kind}><ManagementTargetSettings embedded open orgId={orgId} languageCode={languageCode} kind={kind} onSaved={onSaved} onStateChange={kind==='INVOICE'?invoiceState:shippingState}/></Box>)}
   </Box>}
  </Dialog>
 </>;
}
