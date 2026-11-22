import React,{useEffect,useRef,useState} from 'react';
import {Button,DialogActions,DialogContent,DialogTitle,Stack,TextField,Typography,Table,TableHead,TableBody,TableRow,TableCell,TableContainer} from '@mui/material';
import AppDialog from './AppDialog';
import AppNotice from './AppNotice';
import SaveButton from './SaveButton';
import ExpenseLookupField from './ExpenseLookupField';
import TableStatusRow from './TableStatusRow';
import {useAppActions} from '../context/AppContext';
import {usePageDialogs} from './PageDialogProvider';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import {materialItemName,materialItemText} from '../constants/materialItems';
import {inventoryColorText} from '../constants/inventoryColors';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
export default function StockColorDialog({row,orgId,languageCode,onClose,onSaved}){
 const t=materialItemText[languageCode]||materialItemText.en,c=inventoryColorText[languageCode]||inventoryColorText.en;
 const {showNotification}=useAppActions(),dialogs=usePageDialogs();
 const [colors,setColors]=useState(null),[color,setColor]=useState(null),[quantity,setQuantity]=useState(row.quantity),[busy,setBusy]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
 const pending=useRef(null),lock=useRef(false),live=useRef(true),[uncertain,setUncertain]=useState(false);
 const dirty=!!color||quantity!==row.quantity;useUnsavedChanges(dirty||uncertain);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;setColors(null);setError(false);requestJSON('/inventory-entry/options'+buildQueryString({orgId,masterId:row.masterId}),{skipCache:true}).then(data=>{if(active)setColors(data.colors);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[orgId,row.masterId,reload]);
 const close=async()=>{if(!busy&&!uncertain&&(!dirty||await dialogs.confirm('',{purpose:'discard'})))onClose();};
 const save=async()=>{
  if(lock.current)return;lock.current=true;setBusy(true);setError(false);
  pending.current??={clientKey:crypto.randomUUID(),sourceId:row.id,revision:row.revision,colorId:color.id,quantity};
  try{await requestJSON('/inventory-entry/color-transfers'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(pending.current)});pending.current=null;if(live.current){emitWorkspaceDataChanged({orgId,topics:['inventory-stock','inventory-movements']});showNotification(c.saved,'success');onSaved();}}
  catch(e){if(live.current){const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)pending.current=null;setError(true);}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 };
 return <AppDialog open fullWidth maxWidth="sm" onClose={close}><DialogTitle>{c.classify}</DialogTitle><DialogContent><Stack spacing={2}>
  <Typography>{c.note}</Typography>
  {error&&<AppNotice severity="error" action={!colors?<Button onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>:undefined}>{c.failed}</AppNotice>}
  <ExpenseLookupField label={t.color} required options={colors||[]} value={color} onChange={setColor} disabled={busy||uncertain||!colors} languageCode={languageCode} getCode={row=>row.code} getOptionLabel={row=>[row.code,materialItemName(row,languageCode)].filter(Boolean).join(' / ')} columns={[{key:'code',label:t.code,value:row=>row.code},{key:'name',label:t.color,value:row=>materialItemName(row,languageCode)}]}/>
  <TextField label={c.quantity} value={quantity} disabled={busy||uncertain} onChange={e=>setQuantity(e.target.value)} slotProps={{htmlInput:{inputMode:'decimal'}}}/>
 </Stack></DialogContent><DialogActions><Button disabled={busy||uncertain} onClick={close}>{t.cancel}</Button><SaveButton loading={busy} disabled={!pending.current&&(!colors||!color||!/^\d{1,16}(\.\d{1,4})?$/.test(quantity)||Number(quantity)<=0||Number(quantity)>Number(row.quantity))} onClick={save}>{uncertain?t.retry:c.save}</SaveButton></DialogActions></AppDialog>;
}
export function StockColorHistory({orgId,languageCode}){
 const t=materialItemText[languageCode]||materialItemText.en,c=inventoryColorText[languageCode]||inventoryColorText.en;
 const [open,setOpen]=useState(false),[rows,setRows]=useState(null),[error,setError]=useState(false),[reload,setReload]=useState(0);
 useEffect(()=>{if(!open)return;let active=true;setRows(null);setError(false);requestJSON('/inventory-entry/color-transfers'+buildQueryString({orgId}),{skipCache:true}).then(rows=>{if(active)setRows(rows);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[open,orgId,reload]);
 const columns=[{key:'date',label:c.history,value:row=>row.createdAt},{key:'owner',label:t.owner,value:row=>row.attributes.owner?.name},{key:'type',label:t.type,value:row=>materialItemName(row.attributes.type,languageCode)},{key:'color',label:t.color,value:row=>materialItemName(row.attributes.color,languageCode)},{key:'quantity',label:c.quantity,value:row=>row.quantity},{key:'actor',label:t.actions,value:row=>row.actorName}];
 return <><Button onClick={()=>setOpen(true)}>{c.history}</Button><AppDialog open={open} fullWidth maxWidth="md" onClose={()=>setOpen(false)}><DialogTitle>{c.history}</DialogTitle><DialogContent><TableContainer><Table size="small"><TableHead><TableRow>{columns.map(column=><TableCell key={column.key}>{column.label}</TableCell>)}</TableRow></TableHead><TableBody>{rows?.map(row=><TableRow key={row.id}>{columns.map(column=><TableCell key={column.key}>{column.value(row)}</TableCell>)}</TableRow>)}{(!rows||error||!rows.length)&&<TableStatusRow colSpan={columns.length} loading={!rows&&!error} error={error} onRetry={()=>setReload(n=>n+1)} languageCode={languageCode}/>}</TableBody></Table></TableContainer></DialogContent><DialogActions><Button onClick={()=>setOpen(false)}>{t.close}</Button></DialogActions></AppDialog></>;
}
