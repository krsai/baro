import React, {createContext, useContext, useState} from 'react';
import {Box, Button, IconButton, TableBody, TableRow, Tooltip} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {keyboardAction, openContextMenuFor} from '../utils/keyboardPolicy.mjs';
import {isRecordActionTarget} from '../utils/recordInteraction.mjs';
import {getUiMessage} from '../constants/uiMessages';

const SelectionContext = createContext(null);
export const RecordActionContext = createContext(null);

// One selection per list. The scope never calls an edit/save/navigation action.
export function RecordInteractionScope({as: Component = TableBody, children, ...props}) {
  const [selectedKey, setSelectedKey] = useState(null);
  return <SelectionContext.Provider value={{selectedKey, setSelectedKey}}>
    <Component {...props}>{children}</Component>
  </SelectionContext.Provider>;
}

export function RecordRow({as: Component = TableRow, recordKey, onOpen, disabled = false, children, sx, ...props}) {
  const selection = useContext(SelectionContext);
  const selected = selection?.selectedKey === recordKey;
  const select = () => selection?.setSelectedKey(recordKey);
  return <Component {...props} data-record-interaction="open" data-record-selected={selected || undefined}
    aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
    {...(Component === TableRow ? {selected, 'aria-selected': selected} : {})}
    onClick={event => {
      if (disabled || isRecordActionTarget(event)) return;
      select();
      event.currentTarget.focus({preventScroll: true});
    }}
    onDoubleClick={event => {
      if (!disabled && !isRecordActionTarget(event)) onOpen?.(event);
    }}
    onKeyDown={event => {
      if (disabled || event.repeat || event.target !== event.currentTarget) return;
      if (keyboardAction(event, 'lookup') === 'confirm') {
        event.preventDefault(); event.stopPropagation(); onOpen?.(event);
      } else if (event.key === ' ' && keyboardAction(event, 'segment') === 'confirm') {
        event.preventDefault(); event.stopPropagation(); select();
      }
    }}
    {...(typeof Component === 'string' ? {} : {sx})}><RecordActionContext.Provider value={{onOpen,disabled}}>{children}</RecordActionContext.Provider></Component>;
}

export function RecordText({children,title,sx}){
  return <Box component="span" title={title} sx={sx}>{children}</Box>;
}

// Child actions consume both clicks of a double-click; they never open the row.
export function RecordOpenButton({onOpen, children, sx, iconOnly=false, ...props}) {
  if(iconOnly)return <Tooltip disableInteractive title={props['aria-label']}><span><IconButton size="small" {...props} data-record-action="open" onClick={event=>{event.stopPropagation();if(event.detail<=1)onOpen?.(event);}} onDoubleClick={event=>event.stopPropagation()}><VisibilityOutlinedIcon fontSize="small"/></IconButton></span></Tooltip>;
  return <Button {...props} data-record-action="open" onClick={event => {
    event.stopPropagation();
    if (event.detail <= 1) onOpen?.(event);
  }} onDoubleClick={event => event.stopPropagation()}
    sx={[{p: 0, minWidth: 0, textTransform: 'none', textAlign: 'left', justifyContent: 'flex-start', maxWidth: '100%'}, ...(Array.isArray(sx) ? sx : [sx])]}>{children}</Button>;
}

export function RecordMenuButton({languageCode, label = getUiMessage('common.recordActions', 'Actions', languageCode), onOpenMenu, ...props}) {
  return <Tooltip title={label}><span><IconButton {...props} data-record-action="menu" aria-label={label}
    onPointerDown={event => event.stopPropagation()}
    onKeyDown={event => event.stopPropagation()}
    onDoubleClick={event => event.stopPropagation()}
    onClick={event => {
      event.stopPropagation();
      if (event.detail > 1) return;
      if (onOpenMenu) onOpenMenu(event);
      else {
        const record = event.currentTarget.closest('[data-keyboard-context-menu]');
        if (record) openContextMenuFor(record);
      }
    }}><MoreVertIcon fontSize="small"/></IconButton></span></Tooltip>;
}
