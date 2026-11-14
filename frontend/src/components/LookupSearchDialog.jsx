import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {EXPENSE_LOOKUP_TEXT} from '../constants/expenseLookup';
import {normalizeLookupText} from '../utils/expenseLookup.mjs';
import {advanceFromDialog} from '../utils/formFocus.mjs';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
const paging={ko:{previous:'이전',next:'다음'},en:{previous:'Previous',next:'Next'},vi:{previous:'Trước',next:'Tiếp'}};
export default function LookupSearchDialog({open,onClose,title,query,onQueryChange,options=[],columns=[],getSearchText,filterOptions,getOptionKey=row=>row.id,onSelect,languageCode,details,highlightedKey,onHighlight,confirmLabel,onConfirm,confirmDisabled=false,multiple=false,selected=[],getOptionDisabled=()=>false,loading=false,feedback,searchInputRef,searchLabel,searchInputProps,tableMinWidth,searchTools,maxWidth}){
 useKeyboardNavigation();
 const dialogRef=useRef(null);
 const t=EXPENSE_LOOKUP_TEXT[languageCode]||EXPENSE_LOOKUP_TEXT.en,p=paging[languageCode]||paging.en;
 const [page,setPage]=useState(0);useEffect(()=>setPage(0),[query,open,options.length]);
 const filtered=filterOptions?filterOptions(options,query):options.filter(row=>normalizeLookupText(getSearchText?getSearchText(row):columns.map(column=>column.value(row)).join(' ')).includes(normalizeLookupText(query))),pages=Math.max(1,Math.ceil(filtered.length/20)),current=Math.min(page,pages-1);
 const [activeKey,setActiveKey]=useState(null),tableRef=useRef(null);
 useEffect(()=>setActiveKey(null),[query,open]);
 const cursor=filtered.findIndex(row=>getOptionKey(row)===(activeKey??highlightedKey));
 const highlight=row=>{setActiveKey(getOptionKey(row));onHighlight?.(row);};
 const select=row=>{if(row&&!getOptionDisabled(row)){if(!multiple)advanceFromDialog(dialogRef.current);onSelect(row);}};
 const keyboard=event=>{if(event.nativeEvent?.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
  if(['ArrowDown','ArrowUp'].includes(event.key)&&filtered.length){event.preventDefault();const index=cursor<0?(event.key==='ArrowDown'?0:filtered.length-1):Math.max(0,Math.min(filtered.length-1,cursor+(event.key==='ArrowDown'?1:-1)));highlight(filtered[index]);setPage(Math.floor(index/20));}
  else if(event.key==='Enter'){event.preventDefault();select(cursor>=0?filtered[cursor]:filtered.length===1?filtered[0]:null);}
 };
 useEffect(()=>{tableRef.current?.querySelector('[data-lookup-active="true"]')?.scrollIntoView({block:'nearest'});},[activeKey,current]);
 return <Dialog data-lookup-dialog="true" open={open} onClose={onClose} fullWidth maxWidth={maxWidth||(details?'lg':'md')} slotProps={{paper:{ref:dialogRef}}} aria-label={title}><DialogTitle sx={{px:2.5,py:2}}>{title}</DialogTitle><DialogContent dividers sx={{p:2.5}}><Stack spacing={2}>
  {searchTools}
  <TextField inputRef={searchInputRef} autoFocus onFocus={event=>event.target.select()} fullWidth size="small" label={searchLabel||t.keyword} inputProps={searchInputProps} value={query} onChange={event=>onQueryChange(event.target.value)} onKeyDown={keyboard}/>
  <Box sx={{display:'grid',gridTemplateColumns:details?{xs:'minmax(0,1fr)',md:'minmax(0,1fr) minmax(0,1fr)'}:'minmax(0,1fr)',gap:2,minWidth:0}}>
   <Stack spacing={1} sx={{minWidth:0}}><TableContainer ref={tableRef} onKeyDown={keyboard} sx={{maxHeight:360,border:1,borderColor:'divider',borderRadius:1}}><Table data-table-layout="fixed" size="small" stickyHeader sx={{minWidth:tableMinWidth,tableLayout:"fixed","& th:last-child, & td:last-child":{width:80,textAlign:"center",boxShadow:"none !important"}}}><TableHead><TableRow>{columns.map(column=><TableCell key={column.key} align={column.align||'left'} sx={{width:column.width,whiteSpace:'nowrap'}}>{column.label}</TableCell>)}<TableCell sx={{width:64}}>{t.select}</TableCell></TableRow></TableHead><TableBody>
   {filtered.slice(current*20,current*20+20).map(row=><TableRow key={getOptionKey(row)} hover data-lookup-active={getOptionKey(row)===(activeKey??highlightedKey)} selected={multiple?selected.some(item=>getOptionKey(item)===getOptionKey(row)):getOptionKey(row)===(activeKey??highlightedKey)} onClick={()=>highlight(row)} onDoubleClick={()=>select(row)}>{columns.map(column=><TableCell key={column.key} align={column.align||'left'} sx={{overflowWrap:'anywhere'}}>{column.render?column.render(row):column.value(row)||'—'}</TableCell>)}<TableCell>{multiple?<Checkbox size="small" checked={selected.some(item=>getOptionKey(item)===getOptionKey(row))} disabled={getOptionDisabled(row)} onChange={()=>select(row)}/>:<Button size="small" disabled={getOptionDisabled(row)} onClick={()=>select(row)}>{t.select}</Button>}</TableCell></TableRow>)}
   {(feedback||!filtered.length)&&<TableRow><TableCell colSpan={columns.length+1}>{feedback||(!loading?t.empty:'…')}</TableCell></TableRow>}
   </TableBody></Table></TableContainer><Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end"><Typography variant="caption" sx={{mr:'auto'}}>{filtered.length}</Typography><Button size="small" disabled={current===0} onClick={()=>setPage(current-1)}>{p.previous}</Button><Typography variant="caption">{current+1} / {pages}</Typography><Button size="small" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>{p.next}</Button></Stack></Stack>
   {details&&<Box sx={{minWidth:0,maxHeight:440,overflow:'auto'}}>{details}</Box>}
  </Box>
 </Stack></DialogContent>{onConfirm&&<DialogActions sx={{px:2.5,py:1.5}}><Button variant="contained" disabled={confirmDisabled} onClick={()=>{advanceFromDialog(dialogRef.current);onConfirm();}}>{confirmLabel||t.select}</Button></DialogActions>}</Dialog>;
}
