import {RecordInteractionScope, RecordRow, RecordOpenButton} from '../../components/RecordInteraction';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {shippingState} from '../../utils/shippingState.mjs';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import AppDialog from '../../components/AppDialog';
import PageActions from '../../components/PageActions';
import SaveButton from '../../components/SaveButton';
import ShippingWorkDocuments from '../../components/ShippingWorkDocuments';
import ShippingOperations from '../../components/ShippingOperations';
import {shippingOperationText} from '../../constants/shippingOperations';
import ShippingBills from '../../components/ShippingBills';
import {shippingBillText} from '../../constants/shippingBills';
import ShippingJobCharges from '../../components/ShippingJobCharges';
import ShippingTradeDocuments from '../../components/ShippingTradeDocuments';
import ShippingWaybillSummary from '../../components/ShippingWaybillSummary';
import ShippingDocuments from '../../components/ShippingDocuments';


import {formatPageTitle} from '../../utils/pageNaming.mjs';
import ListPagination from '../../components/ListPagination';
import {freightWorkflowText} from '../../constants/freightWorkflow';
import SearchPanel from '../../components/SearchPanel';
import SearchInput from '../../components/SearchInput';
import {shippingModeLabel,shippingRequestDate,shippingEndpointLabel} from '../../utils/shippingPresentation';
import {shippingEditorText} from '../../constants/shippingEditor';
import {usePageDialogs} from '../../components/PageDialogProvider';
import {freightJobEditorText} from '../../constants/freightJobEditor';
import FreightJobEditor,{FreightJobDetails} from '../../components/FreightJobEditor';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams,useParams,Navigate} from 'react-router-dom';
import {Box,Button,IconButton,Tooltip,DialogTitle,DialogContent,DialogActions,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TableSortLabel,TextField,Typography} from '@mui/material';
import Alert from "../../components/AppNotice";
import AppPageContainer from '../../components/AppPageContainer';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {useRequestScopeContext} from '../../context/RequestScopeContext';
import useShippingRefresh from '../../hooks/useShippingRefresh';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {freightText} from '../../constants/freight';
import {jobText} from '../../constants/freightJobs';
import {shippingText,shippingStatusTone} from '../../constants/shippingRequests';
import TableStatusRow from '../../components/TableStatusRow';
import StatusLabel from '../../components/StatusLabel';
const grid={display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2};
const statuses=['PENDING','ACCEPTED','REJECTED','BOOKED','IN_TRANSIT','ARRIVED','DELIVERED','CANCELLED'];
export default function FreightJobs(){const {activeOrgId,activeOrgType}=useAuth();if(activeOrgType!=='SERVICE')return <Navigate to="/shipping" replace/>;return <Jobs key={activeOrgId} orgId={activeOrgId}/>;}
function Jobs({orgId}){
 const dialogs=usePageDialogs();
 const {languageCode}=useLanguage(),t={...(jobText[languageCode]||jobText.en),...(shippingText[languageCode]||shippingText.en),assignee:(freightJobEditorText[languageCode]||freightJobEditorText.en).forwarderAssignee,plannedDate:(freightJobEditorText[languageCode]||freightJobEditorText.en).plannedDate},{showNotification,navigateToPath,openTab,closeTab}=useAppActions(),[routeParams,setParams]=useSearchParams(),{jobId}=useParams(),{active}=useRequestScopeContext();
 const paramsRef=useRef(routeParams);if(active)paramsRef.current=routeParams;const params=paramsRef.current,id=jobId||params.get('id');
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[total,setTotal]=useState(0),[offset,setOffset]=useState(0),[sort,setSort]=useState('createdAt'),[sortDirection,setSortDirection]=useState('desc'),[search,setSearch]=useState(''),[detail,setDetail]=useState(null),[options,setOptions]=useState({customers:[],employees:[]}),[edit,setEdit]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const mutationLock=useRef(false);
 const [srId,setSrId]=useState(null),[srRecord,setSrRecord]=useState(null),[srLoading,setSrLoading]=useState(false),[srError,setSrError]=useState(false),[srRetry,setSrRetry]=useState(0);
 const op=shippingOperationText[languageCode]||shippingOperationText.en;
 const [workState,setWorkState]=useState({dirty:false,saving:false,uncertain:false});
 const [billState,setBillState]=useState({busy:false,uncertain:false});
 const markBillState=useCallback(value=>setBillState(old=>old.busy===value.busy&&old.uncertain===value.uncertain?old:value),[]);
 const [chargeState,setChargeState]=useState({busy:false,uncertain:false});
 const markChargeState=useCallback(value=>setChargeState(old=>old.busy===value.busy&&old.uncertain===value.uncertain?old:value),[]);
 const markWorkState=useCallback(value=>setWorkState(old=>old.dirty===value.dirty&&old.saving===value.saving&&old.uncertain===value.uncertain?old:value),[]);

 const w=freightWorkflowText[languageCode]||freightWorkflowText.en,billLabels=shippingBillText[languageCode]||shippingBillText.en,rawStage=params.get('stage'),stage=jobId?'bills':'basic',documentsOpen=!!jobId&&rawStage==='documents';
 const billEditorOpen=documentsOpen&&!!(params.get('billId')||params.get('newBill'));
 const [returnVersion,setReturnVersion]=useState(0);
 const [chargesOpen,setChargesOpen]=useState(rawStage==='charges');
 const [source,setSource]=useState(''),[status,setStatus]=useState('');
 const documentLabel=detail?.data.documentSetup?.documentType?w[detail.data.documentSetup.documentType]:null;
 if(documentLabel&&detail.data.documentSetup.documentType!=='BILL_OF_LADING')Object.assign(t,{bills:w.bills,MASTER:'Master '+documentLabel,HOUSE:'House '+documentLabel,billNumber:documentLabel+' #'});
 const [dirtyAreas,setDirtyAreas]=useState({basic:false,documents:false,trade:false,charges:false,copies:false,masterLink:false});
 const workflowDirty=Object.values(dirtyAreas).some(Boolean);
 const markMasterLink=useCallback(value=>setDirtyAreas(old=>old.masterLink===value?old:{...old,masterLink:value}),[]);
 const markBasic=useCallback(value=>setDirtyAreas(old=>old.basic===value?old:{...old,basic:value}),[]);
 const markDocuments=useCallback(value=>setDirtyAreas(old=>old.documents===value?old:{...old,documents:value}),[]);
 const markTrade=useCallback(value=>setDirtyAreas(old=>old.trade===value?old:{...old,trade:value}),[]);
 const markCopies=useCallback(value=>setDirtyAreas(old=>old.copies===value?old:{...old,copies:value}),[]);
 const markCharges=useCallback(value=>setDirtyAreas(old=>old.charges===value?old:{...old,charges:value}),[]);
 const returnToDetail=async()=>{
  if(busy||billState.busy||billState.uncertain||chargeState.busy||chargeState.uncertain||dirtyAreas.masterLink)return false;
  if((dirtyAreas.documents||dirtyAreas.trade||dirtyAreas.copies||dirtyAreas.charges)&&!await dialogs.confirm('',{purpose:'discard'}))return false;
  setChargesOpen(false);setReturnVersion(value=>value+1);
  if(documentsOpen||rawStage==='charges')setParams({});
  return true;
 };
 const changeStage=async (value,billId,newBill,masterId,creation)=>{if(busy)return;if((dirtyAreas.documents||dirtyAreas.trade||dirtyAreas.copies)&&!await dialogs.confirm('',{purpose:'discard'}))return;setParams({...(!jobId?{id}:{}),...(value!=='basic'?{stage:value}:{}),...(billId?{billId}:{}),...(newBill?{newBill}:{}),...(masterId?{masterId}:{}),...(creation?.partyMode?{partyMode:creation.partyMode}:{}),...(creation?.createHouse?{createHouse:'1'}:{})});};
 useEffect(()=>{if(active&&detail?.receiptStatus==='PENDING'&&stage!=='basic')setParams({...(!jobId?{id}:{}),stage:'basic'});},[active,id,stage,detail?.receiptStatus]);
 useEffect(()=>{if(active&&id&&detail?.id===id&&['ACCEPTED','REJECTED'].includes(detail?.receiptStatus)&&!jobId)continueRequest();},[active,id,jobId,detail?.receiptStatus]);
 const requestOpen=!!id&&stage==='basic'&&detail?.receiptStatus==='PENDING';
 const openDetailTab=value=>{if(!jobId){paramsRef.current=new URLSearchParams();setDetail(null);setParams({},{replace:true});openTab?.({id:'/shipping',path:'/shipping',label:formatPageTitle(t.title,'list',languageCode)},{updateOnly:true});}navigateToPath('/shipping/'+encodeURIComponent(value));};
 const continueRequest=()=>{if(jobId){setParams({stage:'bills'});return;}openDetailTab(id);};
 const form=params.get('form');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const api=useCallback((path='',method='GET',body,query={})=>requestJSON('/freight/transport-jobs'+path+buildQueryString({orgId,...query}),{method,skipCache:true,...(body?{body:JSON.stringify(body)}:{})}),[orgId]);
 useEffect(()=>{let live=true;setSrRecord(null);setSrError(false);setSrLoading(Boolean(srId));if(srId)api('/'+encodeURIComponent(srId)).then(row=>{if(live)setSrRecord(row);}).catch(()=>{if(live)setSrError(true);}).finally(()=>{if(live)setSrLoading(false);});return()=>{live=false;};},[api,srId,srRetry]);
 const message=e=>['SHIPPING_REJECT_BLOCKED','SHIPPING_DELETE_BLOCKED'].includes(e.message)?t.linkedBlocked:e.message==='SHIPPING_ACCESS_DENIED'?t.sourceOwnerOnly:e.message==='SHIPPING_DC_SCOPE'?billLabels.dcScope:e.message==='FREIGHT_COMPOSITION_HAS_BILLS'?billLabels.compositionBlocked:e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.hasHouses:e.message==='FREIGHT_MASTER_SCOPE'?t.scope:e.message==='FREIGHT_CHANGED'?t.conflict:t.failed;
 useEffect(()=>{let live=true;Promise.all([requestJSON('/freight/options'+buildQueryString({orgId}),{skipCache:true}),api('/options')]).then(([customers,value])=>live&&setOptions({customers,employees:value.employees,forwarder:value.forwarder,billBranding:value.billBranding,currencies:value.currencies||[]})).catch(e=>live&&setError(message(e)));return()=>{live=false;};},[api,reload,form]);
 const listVisible=!id||stage==='basic';
 const [detailLoading,setDetailLoading]=useState(!!id);
 useEffect(()=>{if(!listVisible)return;let live=true;setError('');setLoading(true);const timer=setTimeout(()=>{api('', 'GET',null,{search,offset,sort,sortDirection,source,status}).then(value=>{if(live){setRows(value.rows);setTotal(value.total);}}).catch(e=>live&&setError(message(e))).finally(()=>live&&setLoading(false));},150);return()=>{live=false;clearTimeout(timer);};},[api,listVisible,search,offset,sort,sortDirection,source,status,reload]);
 useEffect(()=>{let live=true;setError('');setDetail(current=>id&&current?.id===id?current:null);setDetailLoading(!!id);if(id)api('/'+id).then(value=>{if(live)setDetail(value);}).catch(e=>live&&setError(message(e))).finally(()=>live&&setDetailLoading(false));return()=>{live=false;};},[api,id,reload]);
 const go=value=>{if(value&&['ACCEPTED','REJECTED'].includes(rows.find(row=>row.id===value)?.receiptStatus)){openDetailTab(value);return;}if(jobId&&!value){navigateToPath('/shipping');return;}setParams(value?{id:value}:{});};
 useShippingRefresh({orgId,blocked:!!srId||!!edit||!!id&&stage==='basic'||busy||workflowDirty,onRefresh:()=>setReload(value=>value+1)});
 useEffect(()=>{if(params.get('form')==='new')setEdit(current=>current&&!current.id?current:{clientKey:crypto.randomUUID(),mode:'SEA',service:'GENERAL',customerId:null,data:{shipmentType:'FCL',jobType:'OTHER'}});else if(params.get('form')==='edit'&&detail)setParams({id:detail.id});},[params,detail]);

 const mutate=async (work,reportError=true)=>{if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');try{await work();if(alive.current)setReload(value=>value+1);}catch(e){if(reportError)setError(message(e));throw e;}finally{mutationLock.current=false;setBusy(false);}};
 const receive=async()=>{if(mutationLock.current||workflowDirty||!options.forwarder)return;try{if(detail.receiptStatus==='PENDING')await mutate(async()=>{const saved=await requestJSON('/shipping-requests/'+id+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({action:'ACCEPT',version:detail.version})});setDetail(current=>({...current,receiptStatus:'ACCEPTED',version:saved.version}));});continueRequest();}catch{}};
 const reject=async()=>{
  if(busy||workState.saving||workState.uncertain||billState.busy||billState.uncertain||chargeState.busy||chargeState.uncertain||workflowDirty||!await dialogs.confirm(detail.number+'\n'+t.rejectConfirm))return;
  try{await mutate(async()=>{const saved=await requestJSON('/shipping-requests/'+id+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({action:'REJECT',version:detail.version})});setDetail(current=>({...current,...saved,receiptStatus:'REJECTED'}));showNotification(t.saved,'success');});}catch{}
 };
 const remove=async row=>{
  if(busy||!await dialogs.confirm(t.deleteRejectedConfirm))return;
  try{await mutate(async()=>{await requestJSON('/shipping-requests/'+encodeURIComponent(row.id)+buildQueryString({orgId}),{method:'DELETE',body:JSON.stringify({version:row.version})});setRows(current=>current.filter(item=>item.id!==row.id));closeTab?.('/shipping/'+row.id);showNotification(t.deleted,'success');});}catch{}
 };
 const name=row=>row?.isShippingGeneralCustomer?(shippingEditorText[languageCode]||shippingEditorText.en).generalCustomer:row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||'—';
 const editorProps={t,options,busy,name,orgId,saveError:error,initial:edit,onClose:()=>{setEdit(null);go(id);},onSave:value=>mutate(async()=>{const saved=await api(value.id?'/'+value.id:'',value.id?'PUT':'POST',value);if(!alive.current)return;setEdit(null);if(saved.receiptStatus==='ACCEPTED')openDetailTab(saved.id);else go(saved.id);showNotification(t.saved,'success');})};


 return <AppPageContainer stickyFooter footer={detail&&stage==='bills'&&detail.receiptStatus==='ACCEPTED'&&<Button fullWidth variant="outlined" color="error" data-shipping-reject disabled={busy||workflowDirty||workState.saving||workState.uncertain||billState.busy||billState.uncertain||chargeState.busy||chargeState.uncertain} onClick={reject}>{t.reject}</Button>} title={id&&stage!=='basic'?op.title:formatPageTitle(t.title,'list',languageCode)} context={detail&&stage!=='basic'&&<Stack component="span" direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center"><Typography component="span" fontWeight={700}>{detail.number}</Typography><StatusLabel label={t[shippingState(detail,{request:stage==='basic'})]} tone={shippingStatusTone(shippingState(detail,{request:stage==='basic'}))}/></Stack>} titleActions={<Stack direction="row" spacing={1}>{(!id||stage==='basic')&&<Button variant="contained" disabled={!options.forwarder||!!id} onClick={()=>setParams({form:'new'})}>{t.new}</Button>}{detail&&stage==='bills'&&<SaveButton type="submit" form={'shipping-operation-'+id} loading={workState.saving} disabled={busy||detail.receiptStatus!=='ACCEPTED'||dirtyAreas.masterLink||detail.status==='CANCELLED'||!workState.dirty&&!workState.uncertain}>{workState.uncertain?op.retry:op.save}</SaveButton>}</Stack>}><Stack spacing={2}>
 {error&&<Alert severity="error">{error}</Alert>}
 {id&&!detail&&<AppDialog open fullWidth maxWidth="lg" onClose={()=>go(null)}><DialogTitle>{billLabels.requestTitle}</DialogTitle><DialogContent><Table><TableBody><TableStatusRow colSpan={1} languageCode={languageCode} loading={detailLoading} error={Boolean(error)} onRetry={()=>setReload(n=>n+1)}/></TableBody></Table></DialogContent></AppDialog>}
 {(!id||stage==='basic')?<><SearchPanel onReset={()=>{setSearch('');setSource('');setStatus('');setOffset(0);}} controls={<><TextField select size="small" label={w.source} value={source} onChange={e=>{setSource(e.target.value);setOffset(0);}}>{['','CUSTOMER','FORWARDER'].map(key=><MenuItem key={key} value={key}>{key?w[key]:w.all}</MenuItem>)}</TextField><TextField select size="small" label={t.status} value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}>{['',...statuses].map(key=><MenuItem key={key} value={key}>{key?t[key]:w.all}</MenuItem>)}</TextField></>} search={<SearchInput placeholder={t.search} inputProps={{'aria-label':t.search}} value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>}/><Paper variant="outlined" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}><TableContainer><Table data-table-layout="fixed" size="small" sx={{tableLayout:'fixed',minWidth:960}}><TableHead><TableRow>{['srDate','number','mode','customer','origin','destination','status','sr'].map(key=><TableCell key={key} data-table-actions={key==='sr'?'':undefined} sx={{width:({number:120,srDate:108,mode:100,customer:150,status:150,sr:112})[key]}} sortDirection={key==='mode'&&sort==='mode'?sortDirection:false}>{key==='sr'?t.actions:key==='mode'?<TableSortLabel active={sort==='mode'} direction={sort==='mode'?sortDirection:'asc'} onClick={()=>{setOffset(0);setSort('mode');setSortDirection(sort==='mode'&&sortDirection==='asc'?'desc':'asc');}}>{t[key]}</TableSortLabel>:key==='source'?w.source:t[key]}</TableCell>)}</TableRow></TableHead><RecordInteractionScope>{rows.map(row=><RecordRow hover key={row.id} data-shipping-row={row.id} data-cancelled={row.status==='CANCELLED'}  sx={{cursor:loading?'wait':'pointer'}} recordKey={row.id} onOpen={()=>{if(!loading)go(row.id);}} disabled={loading} ><TableCell sx={{whiteSpace:'nowrap'}}>{shippingRequestDate(row)}</TableCell><TableCell><RecordOpenButton disabled={loading} onOpen={()=>go(row.id)}>{row.number}</RecordOpenButton></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{shippingModeLabel(row,languageCode)}</TableCell><TableCell><span data-truncate-text title={name(row.data.customer)}>{name(row.data.customer)}</span>{row.data.generalCustomer&&<Typography variant="caption" component="span" data-truncate-text title={[row.data.actualRequesterName,row.data.actualRequesterPhone].filter(Boolean).join(' \u00b7 ')}>{[row.data.actualRequesterName,row.data.actualRequesterPhone].filter(Boolean).join(' \u00b7 ')}</Typography>}</TableCell>{['origin','destination'].map(key=><TableCell key={key}><span data-truncate-text title={row.data[key]||''}>{shippingEndpointLabel(row,key)}</span></TableCell>)}<TableCell><Stack spacing={.5} alignItems="flex-start"><StatusLabel label={t[shippingState(row)]} tone={shippingStatusTone(shippingState(row))}/></Stack></TableCell><TableCell data-table-actions onDoubleClick={event=>event.stopPropagation()} onKeyDown={event=>event.stopPropagation()}><Tooltip title={op.viewSr}><span><IconButton color="primary" size="small" type="button" disabled={loading} aria-label={op.viewSr+' \u00b7 '+row.number} onClick={event=>{event.stopPropagation();setSrRecord(null);setSrError(false);setSrLoading(true);setSrId(row.id);}}><DescriptionOutlinedIcon fontSize="small"/></IconButton></span></Tooltip>{<Tooltip title={t.deleteRejected}><span><IconButton color="error" size="small" disabled={busy||loading||row.receiptStatus!=='REJECTED'||(row.requestCreatedByOrgId??row.orgId)!==orgId} aria-label={t.deleteRejected+' '+row.number} onClick={event=>{event.stopPropagation();remove(row);}}><DeleteOutlineIcon fontSize="small"/></IconButton></span></Tooltip>}</TableCell></RecordRow>)}{(loading||!id&&error||!rows.length)&&<TableStatusRow colSpan={8} languageCode={languageCode} loading={loading} error={!id&&Boolean(error)} onRetry={()=>setReload(n=>n+1)}/>}</RecordInteractionScope></Table></TableContainer><ListPagination languageCode={languageCode} onPrevious={()=>setOffset(value=>value-50)} onNext={()=>setOffset(value=>value+50)} previousDisabled={!offset||loading} nextDisabled={offset+50>=total||loading} previousLabel={t.previous} nextLabel={t.next}></ListPagination></Paper></>:detail&&<>

 <Stack spacing={2} data-shipping-workspace>
 <ShippingWorkDocuments toolbar forwarder={options.forwarder} onReturnDetail={returnToDetail} returnVersion={returnVersion} job={detail} orgId={orgId} languageCode={languageCode} busy={busy} onDirtyChange={markMasterLink} onOpen={billId=>changeStage('documents',billId)} onCreate={(kind,masterId,creation)=>changeStage('documents',null,kind,masterId,creation)} onChanged={()=>setReload(n=>n+1)} actions={<><Button type="button" variant="outlined" disabled={busy||detail.receiptStatus!=='ACCEPTED'} onClick={()=>setChargesOpen(true)}>{op.arAp}</Button><Button type="button" variant="outlined" disabled={busy} onClick={()=>changeStage('documents')}>{billLabels.documents}</Button></>}/>
 {stage==='bills'&&<ShippingOperations key={id+':work'} job={detail} employees={options.employees} customers={options.customers} languageCode={languageCode} busy={busy} formId={'shipping-operation-'+id} onDirtyChange={markBasic} onStateChange={markWorkState} onReload={async()=>{const latest=await api('/'+id);setDetail(latest);return latest;}} onSave={async value=>{let saved;await mutate(async()=>{saved=await api('/'+id+'/operation-details','PUT',value);setDetail(current=>({...current,...saved}));showNotification(op.saved,'success');},false);return saved;}}/>}
 {detail.receiptStatus==='ACCEPTED'&&chargesOpen&&<ShippingJobCharges key={id+':charges'} open orgId={orgId} job={detail} languageCode={languageCode} onClose={()=>setChargesOpen(false)}/>}
 <AppDialog open={documentsOpen} fullWidth maxWidth="xl" onClose={returnToDetail}><DialogTitle><Stack direction="row" alignItems="center" justifyContent="space-between" gap={2}><Typography component="span" variant="inherit">{billEditorOpen?(detail.mode==='AIR'?'AWB':'B/L'):billLabels.documents}</Typography><Button disabled={busy||billState.busy||billState.uncertain} onClick={returnToDetail}>{op.returnDetail}</Button></Stack></DialogTitle><DialogContent dividers><Stack spacing={2}>
 {documentsOpen&&<ShippingBills key={id+':attachments'} forwarder={options.forwarder} branding={options.billBranding} onBrandingSaved={value=>setOptions(old=>({...old,billBranding:{...old.billBranding,...value}}))} partyMode={params.get('partyMode')} createHouseAfterMaster={params.get('createHouse')==='1'} onBeginHouse={masterId=>setParams({stage:'documents',newBill:'HOUSE',masterId})} job={detail} initialBillId={params.get('billId')} initialKind={params.get('newBill')} initialMasterId={params.get('masterId')} orgId={orgId} languageCode={languageCode} onDirtyChange={markDocuments} onStateChange={markBillState} onChanged={()=>setReload(value=>value+1)}/>}

 {documentsOpen&&!billEditorOpen&&detail.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED'&&<ShippingTradeDocuments key={id+':trade'} job={detail} orgId={orgId} languageCode={languageCode} currencies={options.currencies||[]} onDirtyChange={markTrade}/>}
 {documentsOpen&&!billEditorOpen&&<ShippingDocuments key={id+':documents'} job={detail} orgId={orgId} languageCode={languageCode} busy={busy} t={t} onDirtyChange={markCopies}/>}

 </Stack></DialogContent><DialogActions><PageActions secondary={<Button disabled={busy} onClick={returnToDetail}>{op.close}</Button>}/></DialogActions></AppDialog></Stack>
 </>}

 </Stack><AppDialog open={Boolean(srId)} fullWidth maxWidth="lg" onClose={()=>setSrId(null)}><DialogTitle>{op.viewSr}{srRecord?' \u00b7 '+srRecord.number:''}</DialogTitle><DialogContent dividers>{srLoading||srError?<Table><TableBody><TableStatusRow colSpan={1} languageCode={languageCode} loading={srLoading} error={srError} onRetry={()=>setSrRetry(value=>value+1)}/></TableBody></Table>:srRecord?.requestSnapshot?.data?<FreightJobDetails job={{...srRecord,...srRecord.requestSnapshot,data:srRecord.requestSnapshot.data}}/>:srRecord&&<Table><TableBody><TableStatusRow colSpan={1} languageCode={languageCode} state="empty" message={op.srUnavailable}/></TableBody></Table>}</DialogContent><DialogActions><PageActions secondary={<Button onClick={()=>setSrId(null)}>{op.close}</Button>}/></DialogActions></AppDialog>{detail&&requestOpen&&(options.forwarder?<FreightJobEditor key={id} t={t} options={options} busy={busy} name={name} orgId={orgId} saveError={error} initial={detail} onDirtyChange={markBasic} title={billLabels.requestTitle+' \u00b7 '+detail.number} actions={<Button variant="contained" disabled={busy||workflowDirty||detail.status==='CANCELLED'||!['PENDING','ACCEPTED'].includes(detail.receiptStatus)} onClick={receive}>{billLabels.receiveTransport}</Button>} onClose={()=>go(null)} onSave={async value=>{let saved;await mutate(async()=>{saved=await api('/'+id,'PUT',value);setDetail(current=>({...current,...saved}));showNotification(t.saved,'success');});return saved;}}/>:<AppDialog open fullWidth maxWidth="lg" onClose={()=>go(null)}><DialogTitle>{billLabels.requestTitle}</DialogTitle><DialogContent><ShippingWaybillSummary job={detail} languageCode={languageCode} name={name}/></DialogContent><DialogActions><PageActions secondary={<Button onClick={()=>go(null)}>{t.cancel}</Button>}/></DialogActions></AppDialog>)}{edit&&options.forwarder&&<FreightJobEditor key={edit.id||edit.clientKey} {...editorProps}/>}</AppPageContainer>;
}
