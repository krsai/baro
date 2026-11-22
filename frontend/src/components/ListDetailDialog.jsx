import React from 'react';
import {DialogActions,DialogContent,DialogTitle,Stack} from '@mui/material';
import AppDialog from './AppDialog';
import ListDetailLayout from './ListDetailLayout';
import PageSectionHeader from './PageSectionHeader';
import AddActionButton from './AddActionButton';
import DialogDetailPanel from './DialogDetailPanel';
import {ui} from '../theme/ui';

// Shared presentation for lookup/preview and record managers. No implicit selection or save.
export default function ListDetailDialog({title,titleActions,onNew,newLabel,newDisabled=false,search,tools,list,detail,detailTitle,detailActions,detailFooter,frameDetail=false,actions,contentRef,contentProps={},layoutProps={},listProps={},detailProps={},paperRef,slotProps={},maxWidth=false,...props}){
 const split=detail!==null&&detail!==undefined&&detail!==false;
 const paperSlot=ownerState=>{const paper=(typeof slotProps.paper==='function'?slotProps.paper(ownerState):slotProps.paper)||{};return {...paper,ref:paperRef||paper.ref,sx:[{width:maxWidth?undefined:split?ui.dialog.lookupDetailsWidth:ui.dialog.lookupWidth,height:ui.dialog.lookupHeight,maxWidth:maxWidth?undefined:'calc(100% - 32px)'},...(Array.isArray(paper.sx)?paper.sx:[paper.sx])]};};
 return <AppDialog {...props} fullWidth maxWidth={maxWidth} data-list-detail-dialog="true" slotProps={{...slotProps,paper:paperSlot}}>
  <DialogTitle component="div"><PageSectionHeader title={title} titleVariant="h6" actions={<>{titleActions}{onNew&&<AddActionButton showLabel title={newLabel} disabled={newDisabled} onClick={onNew}/>}</>}/></DialogTitle>
  <DialogContent {...contentProps} ref={contentRef} dividers><Stack spacing={2}>
   {tools}{search}
   <ListDetailLayout {...layoutProps} list={<div {...listProps}>{list}</div>} detail={split?<div {...detailProps}>{frameDetail?<DialogDetailPanel title={detailTitle} actions={detailActions} footer={detailFooter}>{detail}</DialogDetailPanel>:detail}</div>:null}/>
  </Stack></DialogContent>
  {actions&&<DialogActions>{actions}</DialogActions>}
 </AppDialog>;
}
