import React from 'react';
import {Box,IconButton,Stack,Typography} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AccountingInputSettings from './AccountingInputSettings';
import {EXPENSE_TEXT} from '../constants/expenseTypes';
export default function AccountingInputPanel({value,onChange,onClose,disabled,languageCode}){
 const t=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en;
 return <Box component="aside" id="accounting-input-panel" aria-label={t.inputs} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();event.preventDefault();onClose();}}} sx={{border:1,borderColor:'divider',borderRadius:2,overflow:'hidden',bgcolor:'background.paper',minWidth:0}}>
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:2,py:1,borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{t.inputs}</Typography><IconButton autoFocus size="small" aria-label={languageCode==='ko'?'입력 항목 닫기':languageCode==='vi'?'Đóng trường nhập':'Close input settings'} onClick={onClose}><CloseIcon fontSize="small"/></IconButton></Stack>
  <Box sx={{maxHeight:'min(64dvh,640px)',overflowY:'auto',p:1}}><AccountingInputSettings compact value={value} onChange={onChange} languageCode={languageCode} disabled={disabled}/></Box>
 </Box>;
}
