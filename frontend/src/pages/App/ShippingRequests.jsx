import {shippingEditorText} from '../../constants/shippingEditor';
import {freightJobEditorText} from '../../constants/freightJobEditor';
import FreightJobEditor from '../../components/FreightJobEditor';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Alert,Box,Button,Chip,Dialog,DialogActions,DialogContent,DialogTitle,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,Typography} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useShippingRefresh from '../../hooks/useShippingRefresh';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {shippingText,shippingStatusTone} from '../../constants/shippingRequests';
import TableStatusRow from '../../components/TableStatusRow';
import StatusLabel from '../../components/StatusLabel';
import {freightText} from '../../constants/freight';
import FreightJobs from './FreightJobs';
import {freightDocumentHtml,printFreightDocument} from '../../utils/freightPrint';
const fields=['plannedDate','hsCode','dgClass','unNumber','origin','destination','shipper','consignee','cargo','quantity','unit','weightKg','cbm','etd','eta','pickupAddress'];
export default function ShippingRequests(){const {activeOrgId,activeOrgType}=useAuth();return activeOrgType==='SERVICE'?<FreightJobs/>:<CustomerRequests key={activeOrgId} orgId={activeOrgId}/>;}
function CustomerRequests({orgId}){
 const {languageCode}=useLanguage(),t={...(freightJobEditorText[languageCode]||freightJobEditorText.en),...(shippingEditorText[languageCode]||shippingEditorText.en),...(freightText[languageCode]||freightText.en),...(shippingText[languageCode]||shippingText.en)},{showNotification}=useAppActions();
 const [params,setParams]=useSearchParams(),id=params.get('id'),lock=useRef(false),[rows,setRows]=useState([]),[detail,setDetail]=useState(null),[options,setOptions]=useState({customers:[],forwarders:[],self:null}),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const openForm=value=>setForm(value);
 const [document,setDocument]=useState(null);
 const api=useCallback((path='',body)=>requestJSON('/shipping-requests'+path+buildQueryString({orgId}),{skipCache:true,...(body?{method:'POST',body:JSON.stringify(body)}:{})}),[orgId]);
 useEffect(()=>{let live=true;setDetail(null);Promise.all([api(id?'/'+encodeURIComponent(id):''),api('/options')]).then(([value,o])=>{if(live){if(id)setDetail(value);else setRows(value);setOptions(o);}}).catch(()=>live&&setError(t.failed));return()=>{live=false;};},[api,id,reload]);
 useShippingRefresh({orgId,blocked:!!form||busy,onRefresh:()=>setReload(v=>v+1)});
 const act=async value=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const form={...value};const requestData={...form.data};for(const role of ['shipper','consignee','notify'])if(form.data[role+'Party'])requestData[role]=['name','address','contactName','phone','email'].map(key=>form.data[role+'Party'][key]).filter(Boolean).join('\n');form.data=requestData;const result=await api(form.id?'/'+form.id:'',form.id?{action:'EDIT',version:form.version,mode:form.mode,data:form.data}:{clientKey:form.clientKey,forwarderOrgId:form.forwarderOrgId,mode:form.mode,data:form.data});if(!alive.current)return;setForm(null);setParams({id:result.id});setReload(v=>v+1);showNotification(t.saved,'success');}catch(e){if(alive.current)setError(e.message==='SHIPPING_CUSTOMER_MAPPING_REQUIRED'?t.mapping:t.failed);throw e;}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const editorValue=form=>{const self=options.self;const data={...form.data,customerRole:form.data.customerRole||'shipper'};for(const role of ['shipper','consignee','notify'])if(!data[role+'Party']&&data[role])data[role+'Party']={name:data[role].split('\n')[0],address:data[role].split('\n').slice(1).join('\n')};if(!form.id){data.shipperId=self?.id;data.shipperParty=self;data.customerRole='shipper';data.cargoSchemaVersion=1;data.outOfGauge=false;data.notifySameAsConsignee=true;}else if(data[data.customerRole+'Party']?.name===self?.name)data[data.customerRole+'Id']=self?.id;return {...form,customerId:self?.id,forwarderOrgId:form.forwarderOrgId||detail?.ownerOrgId,service:data.transportService||'GENERAL',data:{...data,customer:self,[data.customerRole+'Id']:self?.id}};};
 const snapshot=(value,title)=><Paper variant="outlined" sx={{p:2}}><Typography variant="h6">{title}</Typography>{value?<Stack spacing={1}><Typography>{t[value.mode]} {'\u00b7'} {t[value.status]}</Typography>{fields.filter(key=>value.data?.[key]&&(!['dgClass','unNumber'].includes(key)||value.data.dangerousGoods)).map(key=><Box key={key}><Typography variant="caption">{t[key]}</Typography><Typography sx={{overflowWrap:'anywhere'}}>{value.data[key]}</Typography></Box>)}{value.data?.containers?.map((row,index)=><Typography key={'container-'+index}>{row.size}'{row.type} × {row.count}</Typography>)}{value.data?.packages?.map((row,index)=><Typography key={'package-'+index}>{row.quantity} × {row.lengthM} × {row.widthM} × {row.heightM} m</Typography>)}</Stack>:<Typography>—</Typography>}</Paper>;
 return <AppPageContainer title={t.title} titleActions={<Stack direction="row" spacing={1}>{id?<><Button onClick={()=>setParams({})}>{t.back}</Button><Button disabled={!options.self||!detail||detail.receiptStatus!=='PENDING'} onClick={()=>{setError('');openForm({...detail.request,id:detail.id,version:detail.version});}}>{t.edit}</Button></>:<Button variant="contained" disabled={!options.self} onClick={()=>{setError('');openForm({clientKey:crypto.randomUUID(),forwarderOrgId:null,mode:'SEA',data:{quantity:'0',unit:'PKG',weightKg:'0',cbm:'0',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'}}});}}>{t.new}</Button>}</Stack>}>
 <Stack spacing={2}>{error&&!form&&<Alert severity="error">{error}</Alert>}
 {!id?<Paper variant="outlined" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}><TableContainer><Table size="small"><TableHead><TableRow>{[t.number,t.forwarder,t.receipt].map(label=><TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow hover key={row.id} data-cancelled={row.receiptStatus==='CANCELLED'}><TableCell><Button sx={{p:0,minWidth:0,justifyContent:'flex-start',textAlign:'left',textTransform:'none'}} onClick={()=>setParams({id:row.id})}>{row.number}</Button></TableCell><TableCell>{row.company}</TableCell><TableCell><StatusLabel label={t[row.receiptStatus]} tone={shippingStatusTone(row.receiptStatus)}/></TableCell></TableRow>)}{!rows.length&&!error&&<TableStatusRow colSpan={3} message={t.empty}/>}</TableBody></Table></TableContainer></Paper>:detail&&<><Chip sx={{alignSelf:'flex-start'}} label={`${detail.number} · ${t[detail.receiptStatus]}`}/><Alert severity="info">{t.pendingOnly}</Alert>{snapshot(detail.request,t.request)}{snapshot(detail.shared,t.shared)}</>}
 {detail?.documents?.map(doc=><Button key={doc.id} sx={{alignSelf:'flex-start'}} onClick={()=>setDocument(doc.snapshot)}>{doc.snapshot.number}</Button>)}
 </Stack>
 <Dialog open={!!document} fullWidth maxWidth="lg" onClose={()=>setDocument(null)}><DialogTitle>{document?.number}</DialogTitle><DialogContent>{document&&<iframe title={document.number} sandbox="" srcDoc={freightDocumentHtml(document,t)} style={{width:'100%',height:620,border:0}}/>}</DialogContent><DialogActions><Button onClick={()=>setDocument(null)}>{t.close}</Button><Button onClick={()=>printFreightDocument(document,t)}>{t.print}</Button></DialogActions></Dialog>
 {form&&<FreightJobEditor key={form.id||form.clientKey} orgId={orgId} customerMode saveError={error} t={t} options={{...options,customers:[...(options.self?[options.self]:[]),...options.customers]}} name={row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||''} initial={editorValue(form)} busy={busy} onClose={()=>setForm(null)} onSave={act}/>}

 </AppPageContainer>;
}
