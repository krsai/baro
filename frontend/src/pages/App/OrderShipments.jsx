import useWorkspaceRefreshOnEvent from '../../hooks/useWorkspaceRefreshOnEvent';
import {useRequestScopeContext} from '../../context/RequestScopeContext';
import React,{useEffect,useRef,useState} from 'react';
import {useParams} from 'react-router-dom';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,MenuItem,Typography,LinearProgress} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import SaveButton from '../../components/SaveButton';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {emitWorkspaceDataChanged} from '../../utils/workspaceDataEvents';
import {orderShipmentText} from '../../constants/orderShipments';
const today=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Ho_Chi_Minh'});
const label=(row,language)=>row?.[language==='ko'?'nameKo':language==='vi'?'nameVi':'nameEn']||row?.name||row?.code||'—';
const number=value=>Number(value||0).toLocaleString('en-US');
const errorText=(error,t)=>String(error.message).includes('SHIPPING_EXCEEDS_ORDER')?t.exceeds:String(error.message).includes('SHIPPING_CHANGED')?t.changed:String(error.message).includes('SHIPPING_EXCLUDED')?t.excluded:t.failed;
export default function OrderShipments(){const {activeOrgId}=useAuth();const {orderId}=useParams();return <ShipmentWorkspace key={activeOrgId+':'+(orderId||'list')} orgId={activeOrgId} orderId={orderId}/>;}
function ShipmentWorkspace({orgId,orderId}){
 const {languageCode}=useLanguage(),{navigateToPath,showNotification}=useAppActions(),t=orderShipmentText[languageCode]||orderShipmentText.en;
 const [q,setQ]=useState(''),[mode,setMode]=useState('TRACKED'),[page,setPage]=useState(0),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const [values,setValues]=useState({}),[date,setDate]=useState(today),[remark,setRemark]=useState(''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[dialog,setDialog]=useState(null);
 const lock=useRef(false),clientKey=useRef(crypto.randomUUID()),pending=useRef(null),live=useRef(true);
 const dirty=Object.values(values).some(value=>value!=='')||remark!=='';
 useUnsavedChanges(dirty||uncertain);
 const {active:isActive}=useRequestScopeContext();
 useWorkspaceRefreshOnEvent({orgId,topics:['orders','order-shipments'],isActive,isBlocked:dirty||busy||uncertain||!!dialog,onRefresh:()=>setReload(value=>value+1)});
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{let active=true;setLoading(true);setError('');const timer=setTimeout(()=>requestJSON((orderId?'/orders/'+orderId+'/shipments':'/orders/shipments')+buildQueryString({orgId,...(!orderId?{q,mode,page}:{})}),{skipCache:true}).then(result=>{if(active)setData(result);}).catch(e=>{if(active)setError(errorText(e,t));}).finally(()=>{if(active)setLoading(false);}),orderId?0:180);return()=>{active=false;clearTimeout(timer);};},[orgId,orderId,q,mode,page,reload]);
 const edit=(action)=>{if(busy||uncertain)return;clientKey.current=crypto.randomUUID();pending.current=null;action();};
 const changed=()=>{setReload(n=>n+1);emitWorkspaceDataChanged({orgId,source:'order-shipments',topics:['orders','order-shipments']});showNotification(t.saved,'success');};
 const submit=async()=>{
  if(lock.current)return;const lines=(data?.cells||[]).filter(cell=>values[cell.itemId+':'+cell.size]!==undefined&&values[cell.itemId+':'+cell.size]!=='').map(cell=>({itemId:cell.itemId,size:cell.size,quantity:Number(values[cell.itemId+':'+cell.size])}));
  if(!lines.length||lines.some(line=>!Number.isSafeInteger(line.quantity)||line.quantity<=0)||!date){showNotification(t.invalid,'warning');return;}
  if(lines.some(line=>line.quantity>data.cells.find(cell=>cell.itemId===line.itemId&&cell.size===line.size).remaining)){showNotification(t.exceeds,'warning');return;}
  pending.current=pending.current||{clientKey:clientKey.current,shipmentDate:date,remark,lines};lock.current=true;setBusy(true);setError('');
  try{await requestJSON('/orders/'+orderId+'/shipments'+buildQueryString({orgId}),{method:'POST',body:JSON.stringify(pending.current)});if(!live.current)return;setValues({});setRemark('');pending.current=null;clientKey.current=crypto.randomUUID();setUncertain(false);changed();}
  catch(e){if(live.current){const unknown=!e.status||e.status>=500;setUncertain(unknown);setError(unknown?t.uncertain:errorText(e,t));if(!unknown)pending.current=null;}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 };
 const operation=async()=>{
  if(lock.current||!dialog?.reason.trim())return;lock.current=true;setBusy(true);setError('');
  const path='/orders/'+orderId+(dialog.kind==='policy'?'/shipping-policy':'/shipments/'+dialog.shipment.id+'/cancel');
  const body=dialog.kind==='policy'?{excluded:dialog.excluded,reason:dialog.reason,version:data.policy.version,clientKey:dialog.clientKey}:{reason:dialog.reason,version:dialog.shipment.version};
  try{await requestJSON(path+buildQueryString({orgId}),{method:dialog.kind==='policy'?'PUT':'POST',body:JSON.stringify(body)});if(live.current){setDialog(null);setUncertain(false);changed();}}
  catch(e){if(live.current){const unknown=!e.status||e.status>=500;setUncertain(unknown);setError(unknown?t.uncertain:errorText(e,t));}}
  finally{lock.current=false;if(live.current)setBusy(false);}
 };
 const locked=busy||loading||uncertain;
 const excluded=data?.policy?.excluded;
 const sizes=[...new Set((data?.cells||[]).map(cell=>cell.size))];
 const groups=[...new Map((data?.cells||[]).map(cell=>[cell.itemId,cell])).values()];
 const totals=data?.totals;
 return <AppPageContainer title={t.title} titleActions={orderId?<Stack direction="row" spacing={1}><Button disabled={busy||uncertain} onClick={()=>navigateToPath('/order-shipments')}>{t.back}</Button><Button variant="outlined" disabled={locked||dirty||!data} onClick={()=>setDialog({kind:'policy',excluded:!excluded,reason:'',clientKey:crypto.randomUUID()})}>{excluded?t.resume:t.exclude}</Button></Stack>:null}>
  <Stack spacing={2}>
   {loading&&<LinearProgress/>}{error&&<Alert severity="error">{error}</Alert>}
   {!orderId?<>
    <Paper variant="outlined" sx={{p:2}}><Stack direction={{xs:"column",sm:"row"}} spacing={2}><TextField size="small" placeholder={t.search} inputProps={{'aria-label':t.search}} value={q} onChange={event=>{setQ(event.target.value);setPage(0);}} sx={{width:320,maxWidth:"100%"}}/><TextField select size="small" value={mode} onChange={event=>{setMode(event.target.value);setPage(0);}} inputProps={{'aria-label':t.status}} sx={{width:160}}>{['TRACKED','EXCLUDED','ALL'].map(value=><MenuItem key={value} value={value}>{t[value]}</MenuItem>)}</TextField></Stack></Paper>
    <TableContainer component={Paper} variant="outlined"><Table><TableHead><TableRow>{[t.order,t.customer,t.due,t.ordered,t.shipped,t.remaining,t.status,''].map((text,index)=><TableCell key={index} align={index>=3&&index<=5?'right':'left'}>{text}</TableCell>)}</TableRow></TableHead><TableBody>{data?.rows?.map(row=><TableRow key={row.id}><TableCell><Button onClick={()=>navigateToPath('/order-shipments/'+row.id)}>{row.orderNumber}</Button></TableCell><TableCell>{(languageCode==='ko'?row.customerKo:languageCode==='vi'?row.customerVi:row.customer)||row.customer}</TableCell><TableCell>{row.dueDate||'—'}</TableCell><TableCell align="right">{number(row.ordered)}</TableCell><TableCell align="right">{number(row.shipped)}</TableCell><TableCell align="right">{row.excluded?'—':number(row.ordered-row.shipped)}</TableCell><TableCell><Chip size="small" label={row.excluded?t.EXCLUDED:t.TRACKED}/></TableCell><TableCell><Button onClick={()=>navigateToPath('/order-shipments/'+row.id)}>{t.open}</Button></TableCell></TableRow>)}{!loading&&!data?.rows?.length&&<TableRow><TableCell colSpan={8}>{t.empty}</TableCell></TableRow>}</TableBody></Table><Stack direction="row" spacing={1} justifyContent="flex-end" sx={{p:1}}><Button disabled={loading||page===0} onClick={()=>setPage(n=>n-1)}>{t.previous}</Button><Button disabled={loading||(page+1)*20>=(data?.total||0)} onClick={()=>setPage(n=>n+1)}>{t.next}</Button></Stack></TableContainer>
   </>:data&&<>
    <Stack direction="row" alignItems="center" spacing={2}><Typography variant="h6">{data.order.orderNumber}</Typography><Typography>{label(data.order.customerOrg,languageCode)}</Typography><Chip size="small" label={excluded?t.EXCLUDED:t.TRACKED}/></Stack>
    {excluded&&<Alert severity="info">{t.excluded} {data.policy.reason}</Alert>}
    <Stack direction={{xs:"column",sm:"row"}} spacing={2}>{[['ordered',totals.ordered],['shipped',totals.shipped],['remaining',excluded?null:totals.remaining]].map(([name,value])=><Paper key={name} variant="outlined" sx={{p:2,minWidth:{xs:0,sm:160}}}><Typography variant="caption" color="text.secondary">{t[name]}</Typography><Typography variant="h6" align="right">{value===null?'—':number(value)}</Typography></Paper>)}</Stack>
    {!excluded&&<Paper variant="outlined" sx={{overflow:'hidden'}}><Stack direction="row" alignItems="center" spacing={2} useFlexGap sx={{p:2,flexWrap:"wrap"}}><TextField type="date" size="small" label={t.date} value={date} onChange={e=>edit(()=>setDate(e.target.value))} disabled={locked} slotProps={{inputLabel:{shrink:true}}} sx={{width:160}}/><TextField size="small" label={t.remark} value={remark} onChange={e=>edit(()=>setRemark(e.target.value))} disabled={locked} inputProps={{maxLength:2000}} sx={{flex:1,minWidth:150}}/><Typography variant="body2" sx={{whiteSpace:"nowrap"}}>{t.current}: {number(Object.values(values).reduce((sum,value)=>sum+Number(value||0),0))}</Typography><SaveButton onClick={submit} disabled={loading||!data.cells.length||!dirty} loading={busy}>{uncertain?t.retry:t.register}</SaveButton></Stack>
     {groups.length?<TableContainer><Table data-table-layout="wide" size="small"><TableHead><TableRow><TableCell>{t.style}</TableCell><TableCell>{t.color}</TableCell><TableCell>{t.gender}</TableCell>{sizes.map(size=><TableCell key={size} align="right">{size}</TableCell>)}<TableCell align="right">{t.current}</TableCell></TableRow></TableHead><TableBody>{groups.map(group=><TableRow key={group.itemId}><TableCell>{group.style?.code||'—'}</TableCell><TableCell>{label(group.color,languageCode)}</TableCell><TableCell>{t[group.gender]||group.gender||'—'}</TableCell>{sizes.map(size=>{const cell=data.cells.find(c=>c.itemId===group.itemId&&c.size===size),key=group.itemId+':'+size;return <TableCell key={size} align="right">{cell?<Stack alignItems="flex-end" spacing={.5}><Typography variant="caption" color="text.secondary" title={t.quantities}>{number(cell.shipped)} / {number(cell.ordered)}</Typography><TextField size="small" value={values[key]||''} onChange={e=>edit(()=>setValues(current=>({...current,[key]:e.target.value.replace(/[^0-9]/g,'')})))} disabled={locked||cell.remaining<=0} placeholder="0" inputProps={{'aria-label':`${group.style?.code||group.itemId} ${label(group.color,languageCode)} ${t[group.gender]||group.gender||''} ${size} ${t.current}`,inputMode:'numeric',style:{textAlign:'right'},maxLength:10}} sx={{width:88}}/></Stack>:'—'}</TableCell>;})}<TableCell align="right">{number(data.cells.filter(c=>c.itemId===group.itemId).reduce((n,c)=>n+Number(values[c.itemId+':'+c.size]||0),0))}</TableCell></TableRow>)}</TableBody></Table></TableContainer>:<Typography sx={{p:2}}>{t.noCells}</Typography>}
    </Paper>}
    <Paper variant="outlined" sx={{overflow:'hidden'}}><Typography variant="h6" sx={{p:2}}>{t.history}</Typography><TableContainer><Table size="small"><TableHead><TableRow>{[t.date,t.current,t.total,t.remark,t.by,t.status,''].map((text,i)=><TableCell key={i} align={i===2?'right':'left'}>{text}</TableCell>)}</TableRow></TableHead><TableBody>{data.shipments.map(shipment=><TableRow key={shipment.id} data-cancelled={!!shipment.cancelledAt}><TableCell>{shipment.shipmentDate}</TableCell><TableCell>{shipment.lines.map((cell,i)=><Typography key={i} variant="body2">{cell.style?.code||'—'} · {label(cell.color,languageCode)} · {t[cell.gender]||cell.gender||'—'} · {cell.size}: {number(cell.quantity)}</Typography>)}</TableCell><TableCell align="right">{number(shipment.lines.reduce((n,c)=>n+c.quantity,0))}</TableCell><TableCell>{shipment.remark}{shipment.cancelledAt&&<Typography variant="caption" display="block">{shipment.cancellationReason} / {shipment.cancelledByName}</Typography>}</TableCell><TableCell>{shipment.createdByName}</TableCell><TableCell><Chip size="small" label={shipment.cancelledAt?t.cancelled:t.active}/></TableCell><TableCell>{!shipment.cancelledAt&&<Button color="error" disabled={locked||dirty} onClick={()=>setDialog({kind:'cancel',shipment,reason:''})}>{t.cancelShipment}</Button>}</TableCell></TableRow>)}{!data.shipments.length&&<TableRow><TableCell colSpan={7}>{t.noHistory}</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>
    {data.events.length>0&&<Paper variant="outlined" sx={{p:2}}><Typography variant="subtitle2">{t.policyHistory}</Typography>{data.events.map(event=><Typography key={event.id} variant="body2">{new Date(event.createdAt).toLocaleDateString()} · {event.snapshot.excluded?t.EXCLUDED:t.TRACKED} · {event.actorName} · {event.snapshot.reason}</Typography>)}</Paper>}
   </>}
  </Stack>
  <Dialog open={!!dialog} onClose={()=>{if(!busy&&!uncertain)setDialog(null);}} fullWidth maxWidth="sm"><DialogTitle>{dialog?.kind==='policy'?(dialog.excluded?t.excludeTitle:t.resumeTitle):t.cancelTitle}</DialogTitle><DialogContent><Stack spacing={2}>{dialog?.kind==='policy'&&<Typography variant="body2" color="text.secondary">{t.policyNote}</Typography>}{error&&<Alert severity="error">{error}</Alert>}<TextField autoFocus fullWidth required label={t.reason} value={dialog?.reason||''} disabled={busy||uncertain} onChange={e=>setDialog(current=>({...current,reason:e.target.value}))} inputProps={{maxLength:1000}}/></Stack></DialogContent><DialogActions><SaveButton onClick={operation} disabled={!dialog?.reason.trim()} loading={busy}>{uncertain?t.retry:t.confirm}</SaveButton></DialogActions></Dialog>
 </AppPageContainer>;
}
