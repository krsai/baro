import React from 'react';
import {Box,Button} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveButton from './SaveButton';
import {ui} from '../theme/ui';

// Destructive action is separated from save; registration and application stay separate scopes.
export default function DialogRecordActions({onDelete,deleteLabel,deleteDisabled=false,onSave,saveLabel,saveDisabled=false,busy=false}){
 return <Box data-dialog-record-actions sx={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:ui.layout.actionGap}}>
  {onDelete?<Button color="error" startIcon={<DeleteOutlineIcon/>} disabled={busy||deleteDisabled} onClick={onDelete}>{deleteLabel}</Button>:<span/>}
  {onSave&&<SaveButton loading={busy} disabled={busy||saveDisabled} onClick={onSave}>{saveLabel}</SaveButton>}
 </Box>;
}
