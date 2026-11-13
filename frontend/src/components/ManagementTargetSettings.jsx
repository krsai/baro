import React, {useEffect,useRef,useState} from 'react';
import {Alert,Box,Button,Chip,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle,IconButton,ListItemButton,Paper,Stack,TextField,Tooltip,Typography} from '@mui/material';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {DndContext,DragOverlay,PointerSensor,useSensor,useSensors,useDraggable,useDroppable,closestCenter} from '@dnd-kit/core';
import {usePageDialogs} from './PageDialogProvider';
import SaveButton from './SaveButton';
import SearchInput from './SearchInput';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {managementTargetText} from '../constants/managementTargets';
import {payrollManagementText} from '../constants/payrollManagement';
import {useAppActions} from '../context/AppContext';

function TargetPanel({excluded,children}){
 const {setNodeRef,isOver}=useDroppable({id:String(excluded)});
 return <Paper ref={setNodeRef} data-target-group={String(excluded)} variant="outlined" sx={{overflow:'hidden',borderColor:isOver?'primary.main':'divider'}}>{children}</Paper>;
}
function TargetCard({row,disabled,onMove,label,changed,children}){
 const {setNodeRef,listeners,attributes,isDragging}=useDraggable({id:String(row.id),data:{row},disabled});
 return <ListItemButton ref={setNodeRef} disabled={disabled} onClick={()=>onMove(row)} aria-label={label} sx={{border:1,borderColor:changed?'primary.main':'divider',borderRadius:1,mb:1,gap:1,minHeight:64,opacity:isDragging?0.4:1}}>
  <Box component="span" {...attributes} {...listeners} tabIndex={-1} aria-hidden="true" sx={{display:'flex',touchAction:'none',cursor:disabled?'default':'grab',color:'text.disabled'}}><DragIndicatorIcon fontSize="small"/></Box>{children}
 </ListItemButton>;
}

export default function ManagementTargetSettings({orgId,languageCode='en',kind,onSaved,disabled=false,initialSearch='' }){
 const t=managementTargetText[languageCode]||managementTargetText.en,payroll=['PAYABLE','EVIDENCE'].includes(kind),dialogs=usePageDialogs(),{showNotification}=useAppActions();
 const [open,setOpen]=useState(false),[q,setQ]=useState(''),[search,setSearch]=useState(''),[pages,setPages]=useState([0,0]),[lists,setLists]=useState([{rows:[]},{rows:[]}]),[changes,setChanges]=useState({}),[reason,setReason]=useState(''),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loadError,setLoadError]=useState(false),[reload,setReload]=useState(0),[uncertain,setUncertain]=useState(false);
 const request=useRef(null),locked=busy||uncertain,dirty=Object.keys(changes).length>0;
 const [dragged,setDragged]=useState(null),sensors=useSensors(useSensor(PointerSensor,{activationConstraint:{distance:6}}));
 useEffect(()=>{if(q.trim()===search)return;const timer=setTimeout(()=>{setSearch(q.trim());setPages([0,0]);},250);return()=>clearTimeout(timer);},[q,search]);
 useEffect(()=>{
  if(!open||!orgId)return;let live=true;setLoading(true);setLoadError(false);
  Promise.all([false,true].map((excluded,i)=>requestJSON('/management-targets/'+kind+buildQueryString({orgId,excluded,q:search,page:pages[i]}),{forceRefresh:true,skipCache:true}))).then(result=>{if(live)setLists(result);}).catch(()=>{if(live)setLoadError(true);}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[open,orgId,kind,search,pages,reload]);
 const show=()=>{setQ(initialSearch);setSearch(initialSearch);setPages([0,0]);setChanges({});setReason('');setError('');setUncertain(false);request.current=null;setOpen(true);};
 const close=async()=>{if(locked)return;if(dirty&&!await dialogs.confirm(t.discard))return;setOpen(false);};
 const move=row=>{
  if(locked)return;request.current=null;setError('');setChanges(current=>{const next={...current};if(next[row.id])delete next[row.id];else next[row.id]={...row,excluded:!row.excluded,clientKey:crypto.randomUUID()};return next;});
 };
 const save=async()=>{
  if(busy||loading||loadError||!dirty)return;
  request.current??={rows:Object.values(changes).map(({id,revision,snapshotRevision,excluded,clientKey})=>({id,revision,snapshotRevision,excluded,clientKey})),reason};
  setBusy(true);setError('');
  try{
   await requestJSON('/management-targets/'+kind+buildQueryString({orgId}),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(request.current)});
   setChanges({});setUncertain(false);request.current=null;setOpen(false);
   emitWorkspaceDataChanged({orgId,source:payroll?'bank-ledger':'orders',topics:payroll?['bank-ledger','payroll-sources']:['orders','order-shipments','invoice-drafts']});
   onSaved?.();showNotification(t.saved,'success');
  }catch(e){setError(e?.message||'');setUncertain(!e?.status||e.status>=500);}finally{setBusy(false);}
 };
 const errorCode=({SHIPPING_CHANGED:'TARGET_CHANGED',SHIPPING_REASON_REQUIRED:'TARGET_REASON_REQUIRED',SHIPPING_ACCESS_DENIED:'TARGET_ACCESS_DENIED'})[error]||error;
 const errorMessage=t[errorCode]||(payrollManagementText[languageCode]||payrollManagementText.en)[errorCode]||t.saveFailed;
 return <>
  <Tooltip title={t[kind]}><span><IconButton aria-label={t[kind]} disabled={disabled||!orgId} onClick={show}><SettingsOutlinedIcon/></IconButton></span></Tooltip>
  <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby={'target-settings-'+kind}>
   <DialogTitle id={'target-settings-'+kind}>{t[kind]}</DialogTitle>
   <DialogContent><Stack spacing={2} sx={{pt:1}}>
    <Typography variant="body2" color="text.secondary">{t.note} {payroll?t.payrollNote:''}</Typography>
    {error&&<Alert severity="error">{uncertain?t.uncertain:errorMessage}</Alert>}
    {loadError&&<Alert severity="error" action={<Button disabled={locked} onClick={()=>setReload(n=>n+1)}>{t.retry}</Button>}>{t.failed}</Alert>}
    <SearchInput value={q} placeholder={t.search} onChange={e=>setQ(e.target.value)} disabled={locked}/>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={e=>setDragged(e.active.data.current?.row)} onDragCancel={()=>setDragged(null)} onDragEnd={e=>{const row=e.active.data.current?.row;if(row&&e.over&&String(row.excluded)!==String(e.over.id))move(row);setDragged(null);}}><Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2}}>
     {[false,true].map((excluded,index)=>{
      const original=lists[index].rows||[],rows=[...original.filter(row=>!changes[row.id]),...Object.values(changes).filter(row=>row.excluded===excluded&&(!search||[row.title,row.subtitle,row.nameKo,row.nameVi,row.reference].join(' ').toLowerCase().includes(search.toLowerCase())))];
      return <TargetPanel key={index} excluded={excluded}>
       <Typography variant="subtitle2" sx={{p:1.5,bgcolor:'grey.50',borderBottom:1,borderColor:'divider'}}>{excluded?t.excluded:t.included}</Typography>
       <Box sx={{p:1,height:{xs:240,sm:380},overflowY:'auto'}} aria-busy={loading}>
        {loading&&<CircularProgress size={20}/>}
        {!loading&&!rows.length&&<Typography color="text.secondary" variant="body2" sx={{p:1}}>{t.empty}</Typography>}
        {rows.map(row=><TargetCard key={row.id} row={row} disabled={locked||loading||loadError} onMove={move} label={`${row.title} ${excluded?t.included:t.excluded}`} changed={Boolean(changes[row.id])}>
         <Box sx={{flex:1,minWidth:0}}><Stack direction="row" alignItems="center" gap={1}><Typography fontWeight={700} variant="body2">{row.title}</Typography>{changes[row.id]&&<Chip size="small" label={excluded?t.excluded:t.included}/>}</Stack><Typography variant="body2" color="text.secondary" sx={{overflowWrap:'anywhere'}}>{(languageCode==='ko'?row.nameKo:languageCode==='vi'?row.nameVi:row.subtitle)||row.subtitle}{row.reference?' · '+row.reference:''}</Typography></Box>{excluded?<ArrowBackIcon fontSize="small"/>:<ArrowForwardIcon fontSize="small"/>}
        </TargetCard>)}
       </Box>
       <Stack direction="row" justifyContent="flex-end" alignItems="center" sx={{p:1}}><Button disabled={locked||loading||pages[index]===0} onClick={()=>setPages(p=>p.map((n,i)=>i===index?n-1:n))}>{t.previous}</Button><Typography variant="caption">{pages[index]+1}</Typography><Button disabled={locked||loading||!lists[index].hasMore} onClick={()=>setPages(p=>p.map((n,i)=>i===index?n+1:n))}>{t.next}</Button></Stack>
      </TargetPanel>;
     })}
    </Box><DragOverlay zIndex={2000}>{dragged?<Paper variant="outlined" sx={{p:1.5}}><Typography fontWeight={700}>{dragged.title}</Typography><Typography variant="body2">{dragged.subtitle}</Typography></Paper>:null}</DragOverlay></DndContext>
    {!payroll&&<TextField required label={t.reason} value={reason} onChange={e=>{setReason(e.target.value);request.current=null;}} disabled={locked} inputProps={{maxLength:1000}} fullWidth/>}
   </Stack></DialogContent>
   <DialogActions><SaveButton loading={busy} disabled={!dirty||loading||loadError||(!payroll&&!reason.trim())} onClick={save}>{uncertain?t.retry:t.save}</SaveButton></DialogActions>
  </Dialog>
 </>;
}
