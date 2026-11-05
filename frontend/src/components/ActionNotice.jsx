import React,{useEffect} from 'react';
import {Alert} from '@mui/material';
import {useAppActions} from '../context/AppContext';

// Completion messages belong to the global toast. Errors and actionable
// notices remain next to the affected form and keep their retry/close actions.
export default function ActionNotice({severity='success',children,eventKey,...props}){
 const {showNotification}=useAppActions();
 useEffect(()=>{if(severity==='success'&&children)showNotification?.(children,'success');},[severity,children,eventKey,showNotification]);
 return severity==='success'?null:<Alert severity={severity} {...props}>{children}</Alert>;
}
