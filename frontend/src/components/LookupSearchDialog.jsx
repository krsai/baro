import ListDetailLayout from './ListDetailLayout';
import RecordDetails from './RecordDetails';
import React,{useEffect,useRef,useState} from 'react';
import {Button,Checkbox,Dialog,DialogActions,DialogContent,DialogTitle,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import {EXPENSE_LOOKUP_TEXT} from '../constants/expenseLookup';
import {normalizeLookupText} from '../utils/expenseLookup.mjs';
import {advanceFromDialog} from '../utils/formFocus.mjs';
import {keyboardAction} from '../utils/keyboardPolicy.mjs';
import useKeyboardNavigation from '../hooks/useKeyboardNavigation';
import {ui} from '../theme/ui';
const paging={ko:{previous:'이전',next:'다음'},en:{previous:'Previous',next:'Next'},vi:{previous:'Trước',next:'Tiếp'}};
export default function LookupSearchDialog({open,onClose,title,titleActions,query,onQueryChange,options=[],columns=[],getSearchText,filterOptions,getOptionKey=row=>row.id,onSelect,languageCode,details,renderDetails,previewDetails=true,highlightedKey,onHighlight,confirmLabel,onConfirm,confirmDisabled=false,multiple=false,selected=[],getOptionDisabled=()=>false,loading=false,feedback,searchInputRef,searchLabel,searchInputProps,tableMinWidth,searchTools,maxWidth}){
 useKeyboardNavigation();
 const dialogRef=useRef(null),moveRowFocus=useRef(false);
 const t=EXPENSE_LOOKUP_TEXT[languageCode]||EXPENSE_LOOKUP_TEXT.en,p=paging[languageCode]||paging.en;
 const [page,setPage]=useState(0);useEffect(()=>setPage(0),[query,open,options.length]);
 const filtered=filterOptions?filterOptions(options,query):options.filter(row=>normalizeLookupText(getSearchText?getSearchText(row):columns.map(column=>column.value(row)).join(' ')).includes(normalizeLookupText(query))),pages=Math.max(1,Math.ceil(filtered.length/20)),current=Math.min(page,pages-1);
 const [activeKey,setActiveKey]=useState(null),tableRef=useRef(null);
 useEffect(()=>setActiveKey(null),[query,open]);
 const hasDetails=Boolean(details)||Boolean(renderDetails)||(previewDetails&&columns.length>=3);
 const visibleRows=filtered.slice(current*20,current*20+20);
 const previewRow=visibleRows.find(row=>getOptionKey(row)===(activeKey??highlightedKey))||visibleRows[0];
 const preview=details||(open&&previewRow&&!loading?(renderDetails?renderDetails(previewRow):hasDetails?<RecordDetails fields={columns.map(column=>({key:column.key,label:column.label,value:column.value(previewRow)}))}/>:null):null);
 const cursor=filtered.findIndex(row=>getOptionKey(row)===(activeKey??highlightedKey));
 const highlight=row=>{setActiveKey(getOptionKey(row));onHighlight?.(row);};
 const select=row=>{if(row&&!getOptionDisabled(row)){if(!multiple)advanceFromDialog(dialogRef.current);onSelect(row);}};
 const confirm=()=>{if(onConfirm&&!confirmDisabled){advanceFromDialog(dialogRef.current);onConfirm();}};
 const keyboard=event=>{
  // Native row buttons and checkbox Space own their action. In a multiple
  // lookup, Enter confirms the whole draft instead of toggling one row.
  if(event.target.closest('button,a[href]'))return;
  const checkbox=event.target.matches('input[type="checkbox"]'),row=event.target.closest('tbody tr');
  if(checkbox&&!multiple)return;
  const action=keyboardAction(event,multiple?'lookup-multiple-results':'lookup-results');
  if(['next-option','previous-option'].includes(action)&&filtered.length){event.preventDefault();event.stopPropagation();moveRowFocus.current=multiple||Boolean(row);const index=cursor<0?(action==='next-option'?0:filtered.length-1):Math.max(0,Math.min(filtered.length-1,cursor+(action==='next-option'?1:-1)));highlight(filtered[index]);setPage(Math.floor(index/20));}
  else if(action==='toggle-option'&&row&&!checkbox){event.preventDefault();event.stopPropagation();if(!event.repeat)select(cursor>=0?filtered[cursor]:null);}
  else if(action==='confirm'){event.preventDefault();event.stopPropagation();if(!event.repeat){if(multiple)confirm();else select(cursor>=0?filtered[cursor]:filtered.length===1?filtered[0]:null);}}
 };
 useEffect(()=>{const row=tableRef.current?.querySelector('[data-lookup-active="true"]');row?.scrollIntoView({block:'nearest'});if(moveRowFocus.current){moveRowFocus.current=false;row?.focus({preventScroll:true});}},[activeKey,current]);
 return <Dialog data-lookup-dialog="true" open={open} onClose={onClose} fullWidth maxWidth={maxWidth||false} slotProps={{paper:{ref:dialogRef,sx:{width:maxWidth?undefined:hasDetails?ui.dialog.lookupDetailsWidth:ui.dialog.lookupWidth,height:ui.dialog.lookupHeight,maxWidth:maxWidth?undefined:'calc(100% - 32px)',maxHeight:'calc(100% - 32px)',display:'flex',flexDirection:'column'}}}} aria-label={title}><DialogTitle><Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}><span>{title}</span>{titleActions}</Stack></DialogTitle><DialogContent dividers sx={{minHeight:0,flex:1}}><Stack spacing={2}>
  {searchTools}
  <TextField inputRef={searchInputRef} autoFocus onFocus={event=>event.target.select()} fullWidth size="small" label={searchLabel||t.keyword} inputProps={searchInputProps} value={query} onChange={event=>onQueryChange(event.target.value)} onKeyDown={keyboard}/>
  <ListDetailLayout sx={{gap:2}} list={<Stack spacing={1} sx={{minWidth:0}}><TableContainer ref={tableRef} onKeyDown={keyboard} sx={{maxHeight:360,border:1,borderColor:'divider',borderRadius:1}}><Table data-table-layout="fixed" size="small" stickyHeader sx={{minWidth:tableMinWidth,tableLayout:"fixed","& th:last-child, & td:last-child":{width:80,textAlign:"center",boxShadow:"none !important"}}}><TableHead><TableRow>{columns.map(column=><TableCell key={column.key} align={column.align||'left'} sx={{width:column.width,whiteSpace:'nowrap'}}>{column.label}</TableCell>)}<TableCell sx={{width:64}}>{t.select}</TableCell></TableRow></TableHead><TableBody>
   {filtered.slice(current*20,current*20+20).map(row=><TableRow key={getOptionKey(row)} hover tabIndex={getOptionDisabled(row)?-1:0} onFocus={()=>highlight(row)} data-lookup-active={getOptionKey(row)===(activeKey??highlightedKey)} selected={multiple?selected.some(item=>getOptionKey(item)===getOptionKey(row)):getOptionKey(row)===(activeKey??highlightedKey)} onClick={event=>{if(!event.target.closest('button,input,textarea,select,a[href],[role="button"],[role="combobox"]'))event.currentTarget.focus({preventScroll:true});}} onDoubleClick={()=>select(row)}>{columns.map(column=><TableCell key={column.key} align={column.align||'left'} sx={{overflowWrap:'anywhere'}}>{column.render?column.render(row):column.value(row)||'—'}</TableCell>)}<TableCell>{multiple?<Checkbox size="small" slotProps={{input:{'aria-label':columns.map(column=>column.value(row)).filter(value=>typeof value==='string'||typeof value==='number').join(' · ')}}} checked={selected.some(item=>getOptionKey(item)===getOptionKey(row))} disabled={getOptionDisabled(row)} onChange={()=>select(row)}/>:<Button size="small" disabled={getOptionDisabled(row)} onClick={()=>select(row)}>{t.select}</Button>}</TableCell></TableRow>)}
   {(feedback||!filtered.length)&&<TableRow><TableCell colSpan={columns.length+1}>{feedback||(!loading?t.empty:'…')}</TableCell></TableRow>}
   </TableBody></Table></TableContainer><Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end"><Typography variant="caption" sx={{mr:'auto'}}>{filtered.length}</Typography><Button size="small" disabled={current===0} onClick={()=>setPage(current-1)}>{p.previous}</Button><Typography variant="caption">{current+1} / {pages}</Typography><Button size="small" disabled={current+1>=pages} onClick={()=>setPage(current+1)}>{p.next}</Button></Stack></Stack>} detail={preview} detailSx={{maxHeight:440,overflow:'auto'}}/>
 </Stack></DialogContent>{onConfirm&&<DialogActions><Button variant="contained" disabled={confirmDisabled} onClick={confirm}>{confirmLabel||t.select}</Button></DialogActions>}</Dialog>;
}
