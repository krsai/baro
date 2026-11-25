import {RecordInteractionScope, RecordRow, RecordOpenButton} from '../../components/RecordInteraction';

import {formatPageTitle} from '../../utils/pageNaming.mjs';
import Dialog from '../../components/AppDialog';
import {shippingModeKey,shippingModeLabel,shippingRequestDate} from '../../utils/shippingPresentation';
import {shippingEditorText} from '../../constants/shippingEditor';
import {freightJobEditorText} from '../../constants/freightJobEditor';
import FreightJobEditor from '../../components/FreightJobEditor';
import {usePageDialogs} from '../../components/PageDialogProvider';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {Box, Button, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableCell, TableContainer, TableHead, TableRow, TableSortLabel, Typography} from '@mui/material';
import Alert from "../../components/AppNotice";
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
import {freightDocumentHtml,printFreightDocument,downloadFreightOriginal} from '../../utils/freightPrint';
const fields=['plannedDate','hsCode','dgClass','unNumber','origin','destination','shipper','consignee','cargo','quantity','unit','weightKg','cbm','etd','eta','pickupAddress'];
export default function ShippingRequests(){const {activeOrgId,activeOrgType}=useAuth();return activeOrgType==='SERVICE'?<FreightJobs/>:<CustomerRequests key={activeOrgId} orgId={activeOrgId}/>;}
function CustomerRequests({orgId}){
 const dialogs=usePageDialogs();
 const [detailDirty,setDetailDirty]=useState(false);
 const {languageCode}=useLanguage(),t={...(freightJobEditorText[languageCode]||freightJobEditorText.en),...(shippingEditorText[languageCode]||shippingEditorText.en),...(freightText[languageCode]||freightText.en),...(shippingText[languageCode]||shippingText.en)},{showNotification}=useAppActions();
 const [params,setParams]=useSearchParams(),id=params.get('id'),lock=useRef(false),[rows,setRows]=useState([]),[loading,setLoading]=useState(true),[modeSort,setModeSort]=useState(null),[detail,setDetail]=useState(null),[options,setOptions]=useState({customers:[],forwarders:[],self:null}),[form,setForm]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const openForm=value=>setForm(value);
 const [document,setDocument]=useState(null);
 const api=useCallback((path='',body)=>requestJSON('/shipping-requests'+path+buildQueryString({orgId}),{skipCache:true,...(body?{method:'POST',body:JSON.stringify(body)}:{})}),[orgId]);
 useEffect(()=>{let live=true;setDetail(current=>current?.id===id?current:null);setLoading(true);setError('');Promise.all([api(id?'/'+encodeURIComponent(id):''),api('/options')]).then(([value,o])=>{if(live){if(id)setDetail(value);else setRows(value);setOptions(o);}}).catch(()=>live&&setError(t.failed)).finally(()=>live&&setLoading(false));return()=>{live=false;};},[api,id,reload]);
 useShippingRefresh({orgId,blocked:!!form||busy||detailDirty,onRefresh:()=>setReload(v=>v+1)});
 const act=async value=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{const form={...value};const requestData={...form.data};for(const role of ['shipper','consignee','notify'])if(form.data[role+'Party'])requestData[role]=['name','address','contactName','phone','email'].map(key=>form.data[role+'Party'][key]).filter(Boolean).join('\n');form.data=requestData;const result=await api(form.id?'/'+form.id:'',form.id?{action:'EDIT',version:form.version,mode:form.mode,data:form.data}:{clientKey:form.clientKey,forwarderOrgId:form.forwarderOrgId,mode:form.mode,data:form.data});if(!alive.current)return;setForm(null);setParams({id:result.id});setReload(v=>v+1);showNotification(t.saved,'success');return result;}catch(e){if(alive.current)setError(e.message==='SHIPPING_CUSTOMER_MAPPING_REQUIRED'?t.mapping:t.failed);throw e;}finally{lock.current=false;if(alive.current)setBusy(false);}};
 const editorValue=form=>{const self=options.self;const data={...form.data,customerRole:form.data.customerRole||'shipper'};for(const role of ['shipper','consignee','notify'])if(!data[role+'Party']&&data[role])data[role+'Party']={name:data[role].split('\n')[0],address:data[role].split('\n').slice(1).join('\n')};if(!form.id){data.shipperId=self?.id;data.shipperParty=self;data.customerRole='shipper';data.cargoSchemaVersion=1;data.outOfGauge=false;data.notifySameAsConsignee=true;}else if(data[data.customerRole+'Party']?.name===self?.name)data[data.customerRole+'Id']=self?.id;return {...form,customerId:self?.id,forwarderOrgId:form.forwarderOrgId||detail?.ownerOrgId,service:data.transportService||'GENERAL',data:{...data,customer:self,[data.customerRole+'Id']:self?.id}};};
 const visibleRows=modeSort?[...rows].sort((a,b)=>shippingModeKey(a)?.localeCompare(shippingModeKey(b))*(modeSort==='asc'?1:-1)||String(b.createdAt||'').localeCompare(String(a.createdAt||''))):rows;
 const remove=async row=>{
  if(lock.current||busy||!await dialogs.confirm(t.deleteRejectedConfirm))return;lock.current=true;setBusy(true);setError('');
  try{await requestJSON('/shipping-requests/'+encodeURIComponent(row.id)+buildQueryString({orgId}),{method:'DELETE',body:JSON.stringify({version:row.version})});setRows(current=>current.filter(item=>item.id!==row.id));setReload(value=>value+1);showNotification(t.deleted,'success');}
  catch(e){setError(e.message==='SHIPPING_DELETE_BLOCKED'?t.linkedBlocked:e.message==='SHIPPING_ACCESS_DENIED'?t.sourceOwnerOnly:t.failed);}finally{lock.current=false;setBusy(false);}
 };
 const snapshot=(value,title)=><Paper variant="outlined" sx={{p:2}}><Typography variant="h6">{title}</Typography>{value?<Stack spacing={1}><Typography>{t[value.mode]} {'\u00b7'} {t[value.status]}</Typography>{fields.filter(key=>value.data?.[key]&&(!['dgClass','unNumber'].includes(key)||value.data.dangerousGoods)).map(key=><Box key={key}><Typography variant="caption">{t[key]}</Typography><Typography sx={{overflowWrap:'anywhere'}}>{value.data[key]}</Typography></Box>)}{value.data?.containers?.map((row,index)=><Typography key={'container-'+index}>{row.size}'{row.type} × {row.count}</Typography>)}{value.data?.packages?.map((row,index)=><Typography key={'package-'+index}>{row.quantity} × {row.lengthM} × {row.widthM} × {row.heightM} m</Typography>)}</Stack>:<Typography>—</Typography>}</Paper>;
 return <AppPageContainer title={formatPageTitle(t.title,id?'detail':'list',languageCode)} context={detail&&`${detail.number} · ${t[detail.receiptStatus]}`} titleActions={<Stack direction="row" spacing={1}>{id?<><Button disabled={busy} onClick={async()=>{if(!detailDirty||await dialogs.confirm('',{purpose:'discard'}))setParams({});}}>{t.back}</Button></>:<Button variant="contained" disabled={!options.self} onClick={()=>{setError('');openForm({clientKey:crypto.randomUUID(),forwarderOrgId:null,mode:'SEA',data:{quantity:'0',unit:'PKG',weightKg:'0',cbm:'0',workScope:{start:'ORIGIN_DOOR',end:'DESTINATION_DOOR'}}});}}>{t.new}</Button>}</Stack>}>
 <Stack spacing={2}>{error&&!form&&<Alert severity="error">{error}</Alert>}
 {!id?<Paper variant="outlined" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}><TableContainer><Table size="small"><TableHead><TableRow>{['srDate','number','mode','forwarder','receipt','actions'].map(key=><TableCell key={key} data-table-actions={key==='actions'?'':undefined} sortDirection={key==='mode'?modeSort||false:false}>{key==='mode'?<TableSortLabel active={!!modeSort} direction={modeSort||'asc'} onClick={()=>setModeSort(value=>value==='asc'?'desc':'asc')}>{t.mode}</TableSortLabel>:t[key]}</TableCell>)}</TableRow></TableHead><RecordInteractionScope>{visibleRows.map(row=><RecordRow hover key={row.id} data-shipping-row={row.id} data-cancelled={row.receiptStatus==='CANCELLED'}  sx={{cursor:loading?'wait':'pointer'}} recordKey={row.id} onOpen={()=>setParams({id:row.id})} disabled={loading} ><TableCell sx={{whiteSpace:'nowrap'}}>{shippingRequestDate(row)}</TableCell><TableCell><RecordOpenButton disabled={loading} onOpen={()=>setParams({id:row.id})}>{row.number}</RecordOpenButton></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{shippingModeLabel(row,languageCode)}</TableCell><TableCell>{row.company}</TableCell><TableCell><StatusLabel label={t[row.receiptStatus]} tone={shippingStatusTone(row.receiptStatus)}/></TableCell><TableCell data-table-actions onKeyDown={event=>event.stopPropagation()}>{<Button color="error" disabled={busy||loading||row.receiptStatus!=='REJECTED'||row.requestCreatedByOrgId!==orgId} onClick={()=>remove(row)}>{t.deleteRejected}</Button>}</TableCell></RecordRow>)}{(loading||error||!rows.length)&&<TableStatusRow colSpan={6} languageCode={languageCode} loading={loading} error={Boolean(error)} onRetry={()=>setReload(n=>n+1)}/>}</RecordInteractionScope></Table></TableContainer></Paper>:detail&&<><Alert severity="info">{t.pendingOnly}</Alert>{detail.receiptStatus==='PENDING'&&options.self?<FreightJobEditor key={id} embedded customerMode orgId={orgId} saveError={error} t={t} options={{...options,customers:[options.self,...options.customers]}} name={row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||''} initial={editorValue({...detail.request,id:detail.id,version:detail.version})} busy={busy} onDirtyChange={setDetailDirty} onClose={()=>setParams({})} onSave={act}/>:snapshot(detail.request,t.request)}{snapshot(detail.shared,t.shared)}</>}
 {detail?.documents?.map(doc=><Button key={doc.id} sx={{alignSelf:'flex-start'}} onClick={()=>{if(!downloadFreightOriginal(doc.snapshot))setDocument(doc.snapshot);}}>{doc.snapshot.number}</Button>)}
 </Stack>
 <Dialog open={!!document} fullWidth maxWidth="lg" onClose={()=>setDocument(null)}><DialogTitle>{document?.number}</DialogTitle><DialogContent>{document&&<iframe title={document.number} sandbox="" srcDoc={freightDocumentHtml(document,t)} style={{width:'100%',height:620,border:0}}/>}</DialogContent><DialogActions><Button onClick={()=>setDocument(null)}>{t.close}</Button><Button onClick={()=>printFreightDocument(document,t)}>{t.print}</Button></DialogActions></Dialog>
 {form&&<FreightJobEditor key={form.id||form.clientKey} orgId={orgId} customerMode saveError={error} t={t} options={{...options,customers:[...(options.self?[options.self]:[]),...options.customers]}} name={row=>row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||''} initial={editorValue(form)} busy={busy} onClose={()=>setForm(null)} onSave={act}/>}

 </AppPageContainer>;
}
