import {keyboardAction} from '../utils/keyboardPolicy.mjs';
import React from 'react';
import {Box,IconButton,Stack,Typography} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AccountingInputSettings from './AccountingInputSettings';
import MaterialCodeSettings,{MATERIAL_SETTINGS_TEXT} from './MaterialCodeSettings';
import {EXPENSE_TEXT} from '../constants/expenseTypes';
export default function AccountingInputPanel({value,onChange,onClose,disabled,languageCode,materialEligibilityControlled=false,masterOnly=false}){
 const t=EXPENSE_TEXT[languageCode]||EXPENSE_TEXT.en,title=masterOnly?(MATERIAL_SETTINGS_TEXT[languageCode]||MATERIAL_SETTINGS_TEXT.en).title:t.inputs;
 return <Box component="aside" id="accounting-input-panel" tabIndex={-1} aria-label={title} onKeyDown={event=>{if(keyboardAction(event,'lookup')==='dismiss'){event.stopPropagation();event.preventDefault();onClose();}}} sx={{border:1,borderColor:'divider',borderRadius:1,display:'flex',flexDirection:'column',height:'min(64dvh,680px)',overflow:'hidden',bgcolor:'background.paper',minWidth:0}}>
  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{px:1.5,py:1,borderBottom:1,borderColor:'divider'}}><Typography variant="subtitle2">{title}</Typography><IconButton size="small" aria-label={title} onClick={onClose}><CloseIcon fontSize="small"/></IconButton></Stack>
  {masterOnly?<Box sx={{overflowY:'auto'}}><MaterialCodeSettings value={value} onChange={onChange} languageCode={languageCode} disabled={disabled}/></Box>:<AccountingInputSettings systemDefaults materialEligibilityControlled={materialEligibilityControlled} autoFocus compact value={value} onChange={onChange} languageCode={languageCode} disabled={disabled}/>}
 </Box>;
}
