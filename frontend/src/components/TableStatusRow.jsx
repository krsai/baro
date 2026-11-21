import React from 'react';
import { Button, CircularProgress, Stack, TableCell, TableRow } from '@mui/material';
import {ui} from '../theme/ui';
import { useLanguage } from '../context/LanguageContext';
import { QUERY_TEXT } from './QueryFeedback';

const StatusContent = ({ languageCode, colSpan, message, children, state:explicitState, loading=false, error=false, loaded=true, onRetry, sx = {}, ...rowProps }) => {
  const state=explicitState||(loading?'loading':error?'error':loaded?'empty':'idle');
  const text = QUERY_TEXT[languageCode] || QUERY_TEXT.en;
  return (
    <TableRow {...rowProps} data-table-status={state}>
      <TableCell
        colSpan={colSpan}
        sx={{ textAlign:'center',verticalAlign:'middle',color:state==='error'?'error.main':'text.secondary',height:ui.table.statusHeight,p:2,fontSize:ui.table.fontSize,...sx }}
      >
        <Stack role={state === 'error' ? 'alert' : 'status'} spacing={1} alignItems="center" justifyContent="center" sx={{minHeight:ui.table.statusHeight-32}}>
          {state==='loading'&&<CircularProgress size={18} aria-hidden="true"/>}
          <div>{children??message??text[state]}</div>
          {state === 'error' && onRetry && <Button size="small" onClick={onRetry}>{text.retry}</Button>}
        </Stack>
      </TableCell>
    </TableRow>
  );
};

const ContextStatusRow=props=>{const {languageCode}=useLanguage();return <StatusContent {...props} languageCode={languageCode}/>;};
export default function TableStatusRow(props){
  return props.languageCode?<StatusContent {...props}/>:<ContextStatusRow {...props}/>;
}
