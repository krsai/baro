import React from 'react';
import {Alert,Box,IconButton,Portal,Snackbar} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import {getCurrentLanguageCode} from '../utils/appLanguage';

export default function NotificationToast({notification,onClose}){
 const severity=notification?.type||'info';
 const closeLabel={ko:'닫기',en:'Close',vi:'Đóng'}[getCurrentLanguageCode()]||'Close';
 return <Portal><Snackbar key={notification?.id||'closed'} open={Boolean(notification)} anchorOrigin={{vertical:'top',horizontal:'center'}} onClose={(_,reason)=>{if(reason!=='clickaway')onClose();}} sx={{top:'16px !important',left:'50% !important',right:'auto !important',transform:'translateX(-50%) !important',maxWidth:'min(640px, calc(100vw - 32px))',width:'max-content'}}>
  <Alert severity={severity} variant="filled" role={severity==='error'||severity==='warning'?'alert':'status'} aria-live={severity==='error'||severity==='warning'?'assertive':'polite'} action={<Box sx={{display:'flex',alignItems:'center',flexWrap:'wrap',gap:.5}}>{notification?.action}<IconButton color="inherit" size="small" aria-label={closeLabel} onClick={onClose}><CloseIcon fontSize="small"/></IconButton></Box>} sx={{width:'100%',boxShadow:3,alignItems:'center',maxHeight:'calc(100dvh - 32px)',overflowY:'auto','& .MuiAlert-message':{whiteSpace:'pre-wrap',overflowWrap:'anywhere',minWidth:0},'& .MuiAlert-action':{flexShrink:0}}}>{notification?.message||''}</Alert>
 </Snackbar></Portal>;
}
