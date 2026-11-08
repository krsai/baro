import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import SearchableSelect from '../../components/SearchableSelect';
import FreightRouteScope from '../../components/FreightRouteScope';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
import useShippingRefresh from '../../hooks/useShippingRefresh';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {shippingText} from '../../constants/shippingRequests';
import {freightText} from '../../constants/freight';
import FreightJobs from './FreightJobs';
import {freightDocumentHtml,printFreightDocument} from '../../utils/freightPrint';
const fields=['origin','destination','shipper','consignee','cargo','quantity','unit','weightKg','cbm','etd','eta','pickupAddress'];
export default function ShippingRequests(){const {activeOrgId,activeOrgType}=useAuth();return activeOrgType==='SERVICE'?<FreightJobs/>:<CustomerRequests key={activeOrgId} orgId={activeOrgId}/>;}
function CustomerRequests({orgId}){
 const {languageCode}=useLanguage(),t={...(freightText[languageCode]||freightText.en),...(shippingText[languageCode]||shippingText.en)},{showNotification}=useAppActions();
 const [params,setParams]=useSearchParams(),id=params.get('id'),lock=useRef(false),[rows,setRows]=useState([]),[detail,setDetail]=useState(null),[options,setOptions]=useState([]),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const baseline=useRef(''),alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const openForm=value=>{baseline.current=JSON.stringify(value);setForm(value);};
 useUnsavedChanges(!!form&&JSON.stringify(form)!==baseline.current);
 const [document,setDocument]=useState(null);
 const api=useCallback((path='',body)=>requestJSON('/shipping-requests'+path+buildQueryString({orgId}),{skipCache:true,...(body?{method:'POST',body:JSON.stringify(body)}:{})}),[orgId]);
 useEffect(()=>{let live=true;setDetail(null);Promise.all([api(id?'/'+encodeURIComponent(id):''),api('/options')]).then(([value,o])=>{if(live){if(id)setDetail(value);else setRows(value);setOptions(o.forwarders);}}).catch(()=>live&&setError(t.failed));return()=>{live=false;};},[api,id,reload]);
 useShippingRefresh({orgId,blocked:!!form||busy,onRefresh:()=>setReload(v=>v+1)});
 const act=async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const result=await api(form.id?'/'+form.id:'',form.id?{action:'EDIT',version:form.version,mode:form.mode,data:form.data}:{clientKey:form.clientKey,forwarderOrgId:form.forwarderOrgId,mode:form.mode,data:form.data});if(!alive.current)return;setForm(null);setParams({id:result.id});setReload(v=>v+1);showNotification(t.saved,'success');}catch(e){if(alive.current)setError(e.message==='SHIPPING_CUSTOMER_MAPPING_REQUIRED'?t.mapping:t.failed);}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const snapshot=(value,title)=><Paper variant="outlined" sx={{p:2}}><Typography variant="h6">{title}</Typography>{value?<Stack spacing={1}><Typography>{t[value.mode]} {'\u00b7'} {t[value.status]}</Typography>{fields.filter(key=>value.data?.[key]).map(key=><Box key={key}><Typography variant="caption">{t[key]}</Typography><Typography sx={{overflowWrap:'anywhere'}}>{value.data[key]}</Typography></Box>)}</Stack>:<Typography>—</Typography>}</Paper>;
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1}>{id?<><Button onClick={()=>setParams({})}>{t.back}</Button><Button disabled={!detail||detail.receiptStatus!=='PENDING'} onClick={()=>{setError('');openForm({...detail.request,id:detail.id,version:detail.version});}}>{t.edit}</Button></>:<Button variant="contained" onClick={()=>{setError('');openForm({clientKey:crypto.randomUUID(),forwarderOrgId:null,mode:'SEA',data:{quantity:'0',unit:'PKG',weightKg:'0',cbm:'0',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'}}});}}>{t.new}</Button>}</Stack>}>
 <Stack spacing={2}><Alert severity="info">{t.privacy}</Alert>{error&&!form&&<Alert severity="error">{error}</Alert>}
 {!id?<Paper variant="outlined"><TableContainer><Table size="small"><TableHead><TableRow>{[t.number,t.forwarder,t.receipt].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow key={row.id}><TableCell><Button onClick={()=>setParams({id:row.id})}>{row.number}</Button></TableCell><TableCell>{row.company}</TableCell><TableCell>{t[row.receiptStatus]}</TableCell></TableRow>)}{!rows.length&&<TableRow><TableCell colSpan={3}>{t.empty}</TableCell></TableRow>}</TableBody></Table></TableContainer></Paper>:detail&&<><Chip sx={{alignSelf:'flex-start'}} label={`${detail.number} · ${t[detail.receiptStatus]}`}/><Alert severity="info">{t.pendingOnly}</Alert>{snapshot(detail.request,t.request)}{snapshot(detail.shared,t.shared)}</>}
 {detail?.documents?.map(doc=><Button key={doc.id} sx={{alignSelf:'flex-start'}} onClick={()=>setDocument(doc.snapshot)}>{doc.snapshot.number}</Button>)}
 </Stack>
 <Dialog open={!!document} fullWidth maxWidth="lg" onClose={()=>setDocument(null)}><DialogTitle>{document?.number}</DialogTitle><DialogContent>{document&&<iframe title={document.number} sandbox="" srcDoc={freightDocumentHtml(document,t)} style={{width:'100%',height:620,border:0}}/>}</DialogContent><DialogActions><Button onClick={()=>setDocument(null)}>{t.close}</Button><Button onClick={()=>printFreightDocument(document,t)}>{t.print}</Button></DialogActions></Dialog>
 <Dialog open={!!form} fullWidth maxWidth="md" onClose={()=>!busy&&setForm(null)}><DialogTitle>{form?.id?t.edit:t.new}</DialogTitle><DialogContent>{form&&<Stack spacing={2} sx={{pt:1}}>{error&&<Alert severity="error">{error}</Alert>}{!form.id&&<SearchableSelect label={t.forwarder} options={options} getOptionLabel={row=>row.name} value={options.find(row=>row.id===form.forwarderOrgId)||null} onChange={(_,row)=>setForm(v=>({...v,forwarderOrgId:row?.id||null}))}/>}
 <TextField select label={t.mode} value={form.mode} onChange={e=>setForm(v=>({...v,mode:e.target.value,data:{...v.data,shipmentType:e.target.value==='SEA'?'FCL':e.target.value,workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'}}}))}>{['SEA','AIR','ROAD'].map(mode=><MenuItem key={mode} value={mode}>{t[mode]}</MenuItem>)}</TextField><FreightRouteScope mode={form.mode} value={form.data.workScope} languageCode={languageCode} onChange={value=>setForm(v=>({...v,data:{...v.data,workScope:value}}))}/>
 <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2}}>{fields.map(key=><TextField key={key} label={t[key]} required={['origin','destination','shipper','consignee','cargo'].includes(key)} type={['etd','eta'].includes(key)?'date':'text'} slotProps={{inputLabel:{shrink:true}}} value={form.data[key]||''} onChange={e=>setForm(v=>({...v,data:{...v.data,[key]:e.target.value}}))}/>)}</Box></Stack>}</DialogContent><DialogActions><Button disabled={busy} onClick={()=>setForm(null)}>{t.close}</Button><Button variant="contained" disabled={busy||!form?.id&&!form?.forwarderOrgId} onClick={act}>{t.save}</Button></DialogActions></Dialog>
 </AppPageContainer>;
}
