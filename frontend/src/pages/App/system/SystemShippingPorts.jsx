import React,{useEffect,useRef,useState} from 'react';
import {Alert,Button,LinearProgress,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Tooltip,Typography} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import DeleteActionButton from '../../../components/DeleteActionButton';
import {usePageDialogs} from '../../../components/PageDialogProvider';
import {useLanguage} from '../../../context/LanguageContext';
import {useAppActions} from '../../../context/AppContext';
import {requestJSON,buildQueryString} from '../../../utils/apiClient';
import {emitWorkspaceDataChanged,WORKSPACE_DATA_TOPICS} from '../../../utils/workspaceDataEvents';
import {systemShippingPortText} from '../../../constants/systemShippingPorts';
import useUnsavedChanges from '../../../hooks/useUnsavedChanges';
import {useRequestScopeContext} from '../../../context/RequestScopeContext';
const api='/system/shipping-ports';
export default function SystemShippingPorts(){
 const {active}=useRequestScopeContext();
 const {languageCode}=useLanguage(),t=systemShippingPortText[languageCode]||systemShippingPortText.en,{showNotification}=useAppActions(),dialogs=usePageDialogs();
 const [query,setQuery]=useState(''),[state,setState]=useState('ALL'),[page,setPage]=useState(0),[rows,setRows]=useState([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[pending,setPending]=useState(null),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const alive=useRef(true),lock=useRef(false);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const locked=busy||!!pending;
 useUnsavedChanges(locked);
 const message=code=>code==='SHIPPING_PORT_IN_USE'?t.blocked:code==='SHIPPING_PORT_CHANGED'||code?.startsWith('STALE_EDIT')?t.changed:t.failed;
 useEffect(()=>{if(!active||lock.current||pending)return;let live=true;setLoading(true);setError('');const timer=setTimeout(()=>{
  requestJSON(api+buildQueryString({q:query,state,page}),{skipCache:true}).then(value=>{if(live){setRows(value.rows);setTotal(value.total);if(page>0&&page*50>=value.total)setPage(Math.max(0,Math.ceil(value.total/50)-1));}}).catch(e=>{if(live){setRows([]);setError(e.message||'FAILED');}}).finally(()=>live&&setLoading(false));
 },180);return()=>{live=false;clearTimeout(timer);};},[query,state,page,reload,active]);
 const change=async request=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{
  await requestJSON(api+'/'+request.code,{method:'PUT',body:JSON.stringify(request.body)});
  if(alive.current){setPending(null);setReload(v=>v+1);showNotification(t.saved,'success');emitWorkspaceDataChanged({topics:[WORKSPACE_DATA_TOPICS.SHIPPING_PORTS],source:'system-shipping-ports'});}
 }catch(e){if(alive.current){setPending(!e.status||e.status>=500?request:null);setError(e.message||'FAILED');}}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const mutate=async(row,action)=>{if(locked)return;if(action==='DELETE'&&!await dialogs.confirm(t.confirmDelete))return;await change({code:row.code,body:{action,version:row.version,clientKey:crypto.randomUUID()}});};
 return <AppPageContainer title={t.title}><Stack spacing={2}><Alert severity="info">{t.hint}</Alert>
 <Stack direction={{xs:'column',sm:'row'}} gap={1}><TextField size="small" fullWidth label={t.search} value={query} disabled={locked} slotProps={{htmlInput:{maxLength:160}}} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><TextField size="small" select label={t.state} value={state} disabled={locked} sx={{minWidth:150}} slotProps={{select:{SelectDisplayProps:{'aria-label':t.state,'aria-labelledby':undefined}}}} onChange={e=>{setState(e.target.value);setPage(0);}}>{['ALL','DELETED'].map(value=><MenuItem key={value} value={value}>{t[value]}</MenuItem>)}</TextField>{!error&&<Button sx={{flexShrink:0}} disabled={locked||loading} onClick={()=>setReload(v=>v+1)}>{t.reload}</Button>}</Stack>
 {error&&<Alert severity="error" action={<Button disabled={busy} onClick={()=>pending?change(pending):setReload(v=>v+1)}>{pending?t.retry:t.reload}</Button>}>{message(error)}</Alert>}
 {loading&&<LinearProgress aria-label={t.loading}/>}
 <Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>{['code','name','country','reference','actions'].map(key=><TableCell key={key}>{t[key]}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.code} data-port-code={row.code}><TableCell>{row.code}</TableCell><TableCell>{row.name}</TableCell><TableCell>{row.country}</TableCell><TableCell>{row.inUse?t.inUse:'—'}</TableCell><TableCell data-table-actions><Stack direction="row" gap={.5}>{row.deletedAt?<Button size="small" disabled={locked||loading} onClick={()=>mutate(row,'RESTORE')}>{t.restore}</Button>:<Tooltip title={row.inUse?t.blocked:t.remove}><span><DeleteActionButton title={t.remove} disabled={locked||loading||row.inUse} onClick={()=>mutate(row,'DELETE')}/></span></Tooltip>}</Stack></TableCell></TableRow>)}{!loading&&!error&&!rows.length&&<TableRow><TableCell colSpan={5}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer>
 <Stack direction="row" alignItems="center" gap={1} sx={{p:1}}><Typography variant="caption" sx={{mr:'auto'}}>{t.total.replace('{count}',String(total))}</Typography><Button disabled={locked||loading||page===0} onClick={()=>setPage(v=>v-1)}>{t.previous}</Button><Typography variant="caption">{page+1} / {Math.max(1,Math.ceil(total/50))}</Typography><Button disabled={locked||loading||(page+1)*50>=total} onClick={()=>setPage(v=>v+1)}>{t.next}</Button></Stack></Paper>
 </Stack></AppPageContainer>;
}
