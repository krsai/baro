import React,{useEffect,useState} from 'react';
import {Button,Table,TableBody,TableCell,TableContainer,TableHead,TableRow} from '@mui/material';
import TableStatusRow from './TableStatusRow';
import {activateOnKeyboard} from '../utils/keyboardPolicy.mjs';
import {ui} from '../theme/ui';

export default function DialogRecordList({rows,columns,getKey=row=>row.id,selectedKey,onSelect,onPreview=onSelect,previewDisabled=false,disabled=false,loading=false,error=false,loaded=true,onRetry,languageCode,...props}){
 const [activeKey,setActiveKey]=useState(null);
 useEffect(()=>setActiveKey(selectedKey??null),[selectedKey]);
 const preview=row=>{if(disabled||previewDisabled||loading||error)return;const key=getKey(row);if(key===activeKey&&key===selectedKey)return;setActiveKey(key);if(key!==selectedKey)onPreview?.(row);};
 return <TableContainer {...props} data-dialog-record-list data-preview-locked={previewDisabled||disabled||loading||error} sx={{maxHeight:{xs:220,sm:ui.dialog.paneMaxHeight},border:1,borderColor:'divider',borderRadius:1,...props.sx}}><Table size="small" stickyHeader data-table-layout="fixed" sx={{tableLayout:'fixed'}}>
  <TableHead><TableRow>{columns.map(column=><TableCell key={column.key} sx={{width:column.width}}>{column.label}</TableCell>)}</TableRow></TableHead>
  <TableBody>{!loading&&!error&&rows.map(row=><TableRow key={getKey(row)} data-record-row data-record-active={getKey(row)===(activeKey??selectedKey)} data-record-ready={getKey(row)===selectedKey} aria-disabled={disabled||undefined} hover selected={getKey(row)===selectedKey} tabIndex={disabled?-1:0} onFocus={()=>preview(row)} onPointerMove={event=>{if(event.pointerType==='mouse')preview(row);}} onKeyDown={event=>!disabled&&activateOnKeyboard(event,()=>onSelect(row))} onClick={event=>{if(!disabled&&!event.target.closest('button,a,input'))onSelect(row);}}>
   {columns.map((column,index)=><TableCell key={column.key} sx={{overflowWrap:'anywhere'}}>{index===0?<Button disabled={disabled} onClick={()=>onSelect(row)} aria-pressed={getKey(row)===selectedKey} sx={{minWidth:0,maxWidth:'100%',p:0,textTransform:'none',textAlign:'left',justifyContent:'flex-start',overflowWrap:'anywhere'}}>{column.value(row)||'—'}</Button>:column.value(row)||'—'}</TableCell>)}
  </TableRow>)}{(loading||error||!rows.length)&&<TableStatusRow colSpan={columns.length} languageCode={languageCode} loading={loading} error={error} loaded={loaded} onRetry={onRetry}/>}</TableBody>
 </Table></TableContainer>;
}
