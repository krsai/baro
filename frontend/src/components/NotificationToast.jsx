import React from 'react';
import {Alert,Portal,Snackbar} from '@mui/material';

export default function NotificationToast({notification,onClose}){
 const severity=notification?.type||'info';
 return <Portal><Snackbar key={notification?.id||'closed'} open={Boolean(notification)} anchorOrigin={{vertical:'top',horizontal:'center'}} onClose={(_,reason)=>{if(reason!=='clickaway')onClose();}} sx={{top:'16px !important',left:'50% !important',right:'auto !important',transform:'translateX(-50%) !important',maxWidth:'min(640px, calc(100vw - 32px))',width:'max-content'}}>
  <Alert severity={severity} variant="filled" role={severity==='error'?'alert':'status'} aria-live={severity==='error'?'assertive':'polite'} onClose={onClose} sx={{width:'100%',boxShadow:3,alignItems:'center','& .MuiAlert-message':{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}}>{notification?.message||''}</Alert>
 </Snackbar></Portal>;
}
