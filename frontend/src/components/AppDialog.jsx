import React,{forwardRef} from 'react';
import {Dialog} from '@mui/material';

// Common modal entry point. Callers retain close guards, focus, sizing and all mutations.
// Theme owns the shared title/content/footer geometry, including native picker dialogs.
export default forwardRef(function AppDialog({children,fullScreen=false,sx,...props},ref){
 return <Dialog scroll="paper" {...props} fullScreen={fullScreen} sx={[fullScreen&&{'& .MuiDialog-container':{padding:'0 !important'},'& .MuiDialog-paper':{borderRadius:0}},...(Array.isArray(sx)?sx:[sx])]} ref={ref} data-app-dialog="true">{children}</Dialog>;
});
