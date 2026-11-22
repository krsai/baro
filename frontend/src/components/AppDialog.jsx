import React,{forwardRef,useCallback,useRef} from 'react';
import {Dialog} from '@mui/material';
import useModalDismiss from '../hooks/useModalDismiss';

// Common modal entry point. Callers retain close guards, focus, sizing and all mutations.
// Theme owns the shared title/content/footer geometry, including native picker dialogs.
export default forwardRef(function AppDialog({children,fullScreen=false,sx,open,onClose,disableEscapeKeyDown=false,...props},ref){
 const root=useRef(null),close=useModalDismiss({open,rootRef:root,onClose,disableEscapeKeyDown});
 const setRef=useCallback(node=>{root.current=node;if(typeof ref==='function')ref(node);else if(ref)ref.current=node;},[ref]);
 return <Dialog scroll="paper" {...props} open={open} onClose={close} disableEscapeKeyDown={disableEscapeKeyDown} fullScreen={fullScreen} sx={[fullScreen&&{'& .MuiDialog-container':{padding:'0 !important'},'& .MuiDialog-paper':{borderRadius:0}},...(Array.isArray(sx)?sx:[sx])]} ref={setRef} data-app-dialog="true">{children}</Dialog>;
});
