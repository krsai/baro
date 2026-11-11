import React from 'react';
import {Button,IconButton} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {getLabelPalette} from '../theme/labelPalette';
import {getUiMessage} from '../constants/uiMessages';

export default function AddActionButton({disabled=false,title='',onClick,stopPropagation=false,size='small',showLabel=false,sx,...props}){
 const label=props['aria-label']||title||getUiMessage('common.add','Add');
 if(showLabel)return <Button {...props} type="button" data-table-action="add" size={size} variant="outlined" disabled={disabled} title={title||label} aria-label={label} startIcon={<AddIcon fontSize="small"/>} sx={sx} onClick={event=>{if(stopPropagation)event.stopPropagation();onClick?.(event);}}>{label}</Button>;
 return <IconButton {...props} type="button" data-table-action="add" size={size} color="primary" disabled={disabled} title={title||label} aria-label={label}
  sx={[{color:getLabelPalette('blue').text,'&:hover':{bgcolor:getLabelPalette('blue').background}},...(Array.isArray(sx)?sx:[sx])]}
  onClick={event=>{if(stopPropagation)event.stopPropagation();onClick?.(event);}}><AddIcon fontSize="small"/></IconButton>;
}
