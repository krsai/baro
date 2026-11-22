import React from 'react';
import {DialogActions,DialogContent,DialogTitle,Stack} from '@mui/material';
import AppDialog from './AppDialog';
import ListDetailLayout from './ListDetailLayout';
import PageSectionHeader from './PageSectionHeader';
import AddActionButton from './AddActionButton';
import DialogDetailPanel from './DialogDetailPanel';
import {ui} from '../theme/ui';
import {keyboardAction} from '../utils/keyboardPolicy.mjs';

// Shared presentation for lookup/preview and record managers. No implicit selection or save.
export default function ListDetailDialog({title,titleActions,onNew,newLabel,newDisabled=false,search,tools,list,detail,detailTitle,detailActions,detailFooter,frameDetail=false,actions,contentRef,contentProps={},layoutProps={},listProps={},detailProps={},paperRef,slotProps={},maxWidth=false,...props}){
 const split=detail!==null&&detail!==undefined&&detail!==false;
 const paperSlot=ownerState=>{const paper=(typeof slotProps.paper==='function'?slotProps.paper(ownerState):slotProps.paper)||{};return {...paper,ref:paperRef||paper.ref,sx:[{width:maxWidth?undefined:split?ui.dialog.lookupDetailsWidth:ui.dialog.lookupWidth,height:ui.dialog.lookupHeight,maxWidth:maxWidth?undefined:'calc(100% - 32px)'},...(Array.isArray(paper.sx)?paper.sx:[paper.sx])]};};
 const navigateRecords=event=>{
  props.onKeyDownCapture?.(event);
  if(event.defaultPrevented||!event.currentTarget.contains(event.target))return;
  const root=event.target.closest('[data-list-detail-dialog]');if(root!==event.currentTarget)return;
  const list=root.querySelector('[data-dialog-record-list]');
  if(!list||list.dataset.previewLocked==='true'||!event.target.closest('[data-record-search],[data-record-row]'))return;
  const action=keyboardAction(event,'lookup-results');if(!['next-option','previous-option','confirm'].includes(action))return;
  const rows=[...list.querySelectorAll('[data-record-row]:not([aria-disabled="true"])')];if(!rows.length)return;
  event.preventDefault();event.stopPropagation();if(event.repeat&&action==='confirm')return;
  const active=rows.findIndex(row=>row.dataset.recordActive==='true');
  if(action!=='confirm'){const next=active<0?(action==='next-option'?0:rows.length-1):Math.max(0,Math.min(rows.length-1,active+(action==='next-option'?1:-1)));rows[next].focus({preventScroll:true});rows[next].scrollIntoView({block:'nearest'});return;}
  if(active<0){rows[0].focus({preventScroll:true});return;}
  if(rows[active].dataset.recordReady!=='true')return;
  const primary=root.querySelector('[data-record-actions] [data-page-primary]');
  if(primary&&!primary.disabled&&primary.getAttribute('aria-disabled')!=='true')primary.click();
 };
 return <AppDialog {...props} onKeyDownCapture={navigateRecords} fullWidth maxWidth={maxWidth} data-list-detail-dialog="true" slotProps={{...slotProps,paper:paperSlot}}>
  <DialogTitle component="div"><PageSectionHeader title={title} titleVariant="h6" actions={<>{titleActions}{onNew&&<AddActionButton showLabel title={newLabel} disabled={newDisabled} onClick={onNew}/>}</>}/></DialogTitle>
  <DialogContent {...contentProps} ref={contentRef} dividers><Stack spacing={2}>
   {tools}{search&&<div data-record-search data-initial-focus-search>{search}</div>}
   <ListDetailLayout {...layoutProps} list={<div {...listProps}>{list}</div>} detail={split?<div {...detailProps}>{frameDetail?<DialogDetailPanel title={detailTitle} actions={detailActions} footer={detailFooter}>{detail}</DialogDetailPanel>:detail}</div>:null}/>
  </Stack></DialogContent>
  {actions&&<DialogActions data-record-actions>{actions}</DialogActions>}
 </AppDialog>;
}
