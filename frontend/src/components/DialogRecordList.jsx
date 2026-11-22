import React from 'react';
import {Button,Table,TableBody,TableCell,TableContainer,TableHead,TableRow} from '@mui/material';
import TableStatusRow from './TableStatusRow';
import {activateOnKeyboard} from '../utils/keyboardPolicy.mjs';
import {ui} from '../theme/ui';

export default function DialogRecordList({rows,columns,getKey=row=>row.id,selectedKey,onSelect,disabled=false,loading=false,error=false,loaded=true,onRetry,languageCode,...props}){
 return <TableContainer {...props} sx={{maxHeight:{xs:220,sm:ui.dialog.paneMaxHeight},border:1,borderColor:'divider',borderRadius:1,...props.sx}}><Table size="small" stickyHeader data-table-layout="fixed" sx={{tableLayout:'fixed'}}>
  <TableHead><TableRow>{columns.map(column=><TableCell key={column.key} sx={{width:column.width}}>{column.label}</TableCell>)}</TableRow></TableHead>
  <TableBody>{!loading&&!error&&rows.map(row=><TableRow key={getKey(row)} hover selected={getKey(row)===selectedKey} tabIndex={disabled?-1:0} onKeyDown={event=>!disabled&&activateOnKeyboard(event,()=>onSelect(row))} onClick={event=>{if(!disabled&&!event.target.closest('button,a,input'))onSelect(row);}}>
   {columns.map((column,index)=><TableCell key={column.key} sx={{overflowWrap:'anywhere'}}>{index===0?<Button disabled={disabled} onClick={()=>onSelect(row)} aria-pressed={getKey(row)===selectedKey} sx={{minWidth:0,p:0,textTransform:'none',textAlign:'left',justifyContent:'flex-start',overflowWrap:'anywhere'}}>{column.value(row)||'—'}</Button>:column.value(row)||'—'}</TableCell>)}
  </TableRow>)}{(loading||error||!rows.length)&&<TableStatusRow colSpan={columns.length} languageCode={languageCode} loading={loading} error={error} loaded={loaded} onRetry={onRetry}/>}</TableBody>
 </Table></TableContainer>;
}
