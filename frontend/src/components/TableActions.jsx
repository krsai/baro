import React,{useContext} from 'react';
import {Box,TableCell} from '@mui/material';
import {getCurrentLanguageCode} from '../utils/appLanguage';
import {getRowActionsLabel,recordDetailsText} from '../constants/rowActions';
import {RecordActionContext,RecordOpenButton} from './RecordInteraction';

const destructive=node=>React.isValidElement(node)&&(
 node.props['data-row-action']==='delete'||/Delete|Deletion/.test(node.type?.displayName||node.type?.name||'')||
 React.Children.toArray(node.props.children).some(destructive)
);
// DOM and keyboard order follow the visual order. Keep each action's original
// handler, permission, disabled state, tooltip and confirmation intact.
function ordered(children){
 const nodes=React.Children.toArray(children).map(child=>React.isValidElement(child)&&child.props.children?
  React.cloneElement(child,{},Array.isArray(child.props.children)?ordered(child.props.children):ordered(child.props.children)[0]):child);
 return [...nodes.filter(child=>!destructive(child)),...nodes.filter(destructive)];
}
export function RowActions({children,sx}){
 return <Box data-row-actions sx={{display:'flex',alignItems:'center',justifyContent:'flex-end',gap:1,flexWrap:'nowrap',...sx}}>{ordered(children)}</Box>;
}
export function TableActionsHeader({as:Component=TableCell,languageCode,when=true,children,...props}){
 return <Component {...props} data-table-actions={when?'':undefined} align={when&&Component===TableCell?'right':props.align}>{when?getRowActionsLabel(languageCode||getCurrentLanguageCode()):children}</Component>;
}
export function TableActionsCell({as:Component=TableCell,children,languageCode,showOpen=true,...props}){
 const record=useContext(RecordActionContext);
 return <Component {...props} data-table-actions align={Component===TableCell?'right':undefined}><RowActions>
  {showOpen&&record?.onOpen&&<RecordOpenButton iconOnly disabled={record.disabled} onOpen={record.onOpen} aria-label={recordDetailsText[languageCode||getCurrentLanguageCode()]||recordDetailsText.en}/>}
  {children}
 </RowActions></Component>;
}
