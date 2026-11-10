import React from 'react';
import {IconButton} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {getLabelPalette} from '../theme/labelPalette';
import {getUiMessage} from '../constants/uiMessages';

export default function AddActionButton({disabled=false,title='',onClick,stopPropagation=false,size='small',sx,...props}){
 const label=props['aria-label']||title||getUiMessage('common.add','Add');
 return <IconButton {...props} type="button" data-table-action="add" size={size} color="primary" disabled={disabled} title={title||label} aria-label={label}
  sx={[{color:getLabelPalette('blue').text,'&:hover':{bgcolor:getLabelPalette('blue').background}},...(Array.isArray(sx)?sx:[sx])]}
  onClick={event=>{if(stopPropagation)event.stopPropagation();onClick?.(event);}}><AddIcon fontSize="small"/></IconButton>;
}
