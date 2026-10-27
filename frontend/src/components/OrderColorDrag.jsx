import React, {useLayoutEffect, useRef, useState} from 'react';
import {IconButton, TableRow, TableContainer} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {useDraggable, useDroppable} from '@dnd-kit/core';

export function OrderColorDragHandle({id, data, disabled, label}) {
  const drag=useDraggable({id,data,disabled});
  return <IconButton ref={drag.setNodeRef} {...drag.listeners} {...drag.attributes} disabled={disabled} size="small" aria-label={label} title={label} data-order-color-drag sx={{touchAction:'none',flexShrink:0,cursor:disabled?'default':'grab',opacity:drag.isDragging?.5:1}}><DragIndicatorIcon fontSize="small"/></IconButton>;
}

export function OrderColorDropRow({dragId, dragData, dragDisabled, sx, ...props}) {
  const drop=useDroppable({id:dragId,data:dragData,disabled:dragDisabled});
  return <TableRow ref={drop.setNodeRef} {...props} sx={{...sx,...(drop.isOver?{outline:'2px solid',outlineColor:'primary.main',outlineOffset:-2}:{})}}/>;
}

// Keep the order fields visible by scrolling only the item body. Measure the actual workspace,
// so wrapping controls, browser zoom and workspace tabs do not require hardcoded offsets.
export function OrderItemsTableContainer({doubleHeader, sx, children}) {
  const ref=useRef(null),[height,setHeight]=useState(440);
  useLayoutEffect(()=>{
    const node=ref.current;
    const measure=()=>setHeight(Math.max(180,Math.floor(window.innerHeight-node.getBoundingClientRect().top-80)));
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(node.closest('.app-page-content') || node.parentElement);
    window.addEventListener('resize',measure);
    return ()=>{observer.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  return <TableContainer ref={ref} data-order-items-scroll sx={{...sx,maxHeight:height,overflowY:'auto',
    '& thead th':{position:'sticky',top:0,zIndex:3,bgcolor:'background.paper'},
    ...(doubleHeader?{'& thead tr:first-of-type':{height:40},'& thead tr:nth-of-type(2) th':{top:40}}:{})}}>{children}</TableContainer>;
}
