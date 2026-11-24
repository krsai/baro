import {shippingState} from '../../utils/shippingState.mjs';
import AppDialog from '../../components/AppDialog';
import PageActions from '../../components/PageActions';
import SaveButton from '../../components/SaveButton';
import ShippingBills from '../../components/ShippingBills';
import {shippingBillText} from '../../constants/shippingBills';
import {requiresBillHierarchy} from '../../utils/shippingBillData.mjs';
import EntityDetailSection from '../../components/EntityDetailSection';
import ShippingTradeDocuments from '../../components/ShippingTradeDocuments';
import {shippingTradeText} from '../../constants/shippingTrade';
import ShippingWaybillSummary from '../../components/ShippingWaybillSummary';
import ShippingProgress from '../../components/ShippingProgress';
import ShippingDocuments from '../../components/ShippingDocuments';
import {shippingWorkbenchText,openProgress} from '../../constants/shippingWorkbench';
import {activateOnKeyboard} from '../../utils/keyboardPolicy.mjs';
import {formatPageTitle} from '../../utils/pageNaming.mjs';
import ListPagination from '../../components/ListPagination';
import {freightWorkflowText} from '../../constants/freightWorkflow';
import SearchPanel from '../../components/SearchPanel';
import SearchInput from '../../components/SearchInput';
import {shippingModeLabel,shippingRequestDate} from '../../utils/shippingPresentation';
import {shippingEditorText} from '../../constants/shippingEditor';
import {usePageDialogs} from '../../components/PageDialogProvider';
import {freightJobEditorText} from '../../constants/freightJobEditor';
import FreightJobEditor from '../../components/FreightJobEditor';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams,Navigate} from 'react-router-dom';
import {Box,Button,DialogTitle,DialogContent,DialogActions,FormControlLabel,Radio,RadioGroup,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TableSortLabel,Tab,Tabs,TextField,Typography} from '@mui/material';
import Alert from "../../components/AppNotice";
import AppPageContainer from '../../components/AppPageContainer';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useShippingRefresh from '../../hooks/useShippingRefresh';
import {requestJSON,buildQueryString} from '../../utils/apiClient';
import {freightText} from '../../constants/freight';
import {jobText} from '../../constants/freightJobs';
import {shippingText,shippingStatusTone} from '../../constants/shippingRequests';
import TableStatusRow from '../../components/TableStatusRow';
import StatusLabel from '../../components/StatusLabel';
const grid={display:'grid',gridTemplateColumns:{xs:'1fr',sm:'repeat(2,minmax(0,1fr))'},gap:2};
const statuses=['DRAFT','BOOKED','IN_TRANSIT','ARRIVED','DELIVERED','CANCELLED'];
export default function FreightJobs(){const {activeOrgId,activeOrgType}=useAuth();if(activeOrgType!=='SERVICE')return <Navigate to="/shipping" replace/>;return <Jobs key={activeOrgId} orgId={activeOrgId}/>;}
function Jobs({orgId}){
 const dialogs=usePageDialogs();
 const {languageCode}=useLanguage(),t={...(jobText[languageCode]||jobText.en),...(shippingText[languageCode]||shippingText.en),assignee:(freightJobEditorText[languageCode]||freightJobEditorText.en).forwarderAssignee,plannedDate:(freightJobEditorText[languageCode]||freightJobEditorText.en).plannedDate},{showNotification}=useAppActions(),[params,setParams]=useSearchParams(),id=params.get('id');
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[total,setTotal]=useState(0),[offset,setOffset]=useState(0),[sort,setSort]=useState('createdAt'),[sortDirection,setSortDirection]=useState('desc'),[search,setSearch]=useState(''),[detail,setDetail]=useState(null),[options,setOptions]=useState({customers:[],employees:[]}),[edit,setEdit]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const mutationLock=useRef(false),pendingDirectJob=useRef(null);
 const trade=shippingTradeText[languageCode]||shippingTradeText.en;
 const wb=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en;
 const w=freightWorkflowText[languageCode]||freightWorkflowText.en,billLabels=shippingBillText[languageCode]||shippingBillText.en,rawStage=params.get('stage'),stage=['setup','bills','charges'].includes(rawStage)?'bills':rawStage==='documents'?'documents':rawStage==='progress'?'bills':'basic';
 const [source,setSource]=useState(''),[status,setStatus]=useState('');
 const documentLabel=detail?.data.documentSetup?.documentType?w[detail.data.documentSetup.documentType]:null;
 if(documentLabel&&detail.data.documentSetup.documentType!=='BILL_OF_LADING')Object.assign(t,{bills:w.bills,MASTER:'Master '+documentLabel,HOUSE:'House '+documentLabel,billNumber:documentLabel+' #'});
 const [dirtyAreas,setDirtyAreas]=useState({basic:false,progress:false,documents:false,trade:false,charges:false});
 const workflowDirty=Object.values(dirtyAreas).some(Boolean);
 const markBasic=useCallback(value=>setDirtyAreas(old=>old.basic===value?old:{...old,basic:value}),[]);
 const markProgress=useCallback(value=>setDirtyAreas(old=>old.progress===value?old:{...old,progress:value}),[]);
 const markDocuments=useCallback(value=>setDirtyAreas(old=>old.documents===value?old:{...old,documents:value}),[]);
 const markTrade=useCallback(value=>setDirtyAreas(old=>old.trade===value?old:{...old,trade:value}),[]);
 const markCharges=useCallback(value=>setDirtyAreas(old=>old.charges===value?old:{...old,charges:value}),[]);
 const [compositionOpen,setCompositionOpen]=useState(false),[composition,setComposition]=useState('MASTER_HOUSE');
 const openComposition=()=>{setComposition(detail?.data.documentSetup?.composition||(requiresBillHierarchy(detail)?'MASTER_HOUSE':'NONE'));setCompositionOpen(true);};
 const changeStage=async value=>{if(busy)return;if(workflowDirty&&!await dialogs.confirm('',{purpose:'discard'}))return;if(value==='bills'&&requiresBillHierarchy(detail)&&['basic','progress'].includes(stage)&&detail?.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED'){openComposition();return;}setParams({id,...(value!=='basic'?{stage:value}:{})});};
 useEffect(()=>{if(stage==='bills'&&requiresBillHierarchy(detail)&&!detail.data.documentSetup&&detail.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED')openComposition();},[id,stage,detail?.id]);
 useEffect(()=>{if(detail?.receiptStatus==='PENDING'&&stage!=='basic')setParams({id});},[id,stage,detail?.receiptStatus]);
 useEffect(()=>{if(pendingDirectJob.current===id&&detail?.id===id){pendingDirectJob.current=null;if(requiresBillHierarchy(detail))openComposition();else setParams({id,stage:'bills'});}},[id,detail?.id]);
 const requestOpen=!!id&&stage==='basic'&&!compositionOpen;
 const continueRequest=()=>{if(requiresBillHierarchy(detail))openComposition();else setParams({id,stage:'bills'});};
 const form=params.get('form');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const api=useCallback((path='',method='GET',body,query={})=>requestJSON('/freight/transport-jobs'+path+buildQueryString({orgId,...query}),{method,skipCache:true,...(body?{body:JSON.stringify(body)}:{})}),[orgId]);
 const message=e=>e.message==='SHIPPING_DC_SCOPE'?billLabels.dcScope:e.message==='FREIGHT_COMPOSITION_HAS_BILLS'?billLabels.compositionBlocked:e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.hasHouses:e.message==='FREIGHT_MASTER_SCOPE'?t.scope:e.message==='FREIGHT_CHANGED'?t.conflict:t.failed;
 useEffect(()=>{let live=true;Promise.all([requestJSON('/freight/options'+buildQueryString({orgId}),{skipCache:true}),api('/options')]).then(([customers,value])=>live&&setOptions({customers,employees:value.employees,forwarder:value.forwarder,currencies:value.currencies||[]})).catch(e=>live&&setError(message(e)));return()=>{live=false;};},[api,reload,form]);
 useEffect(()=>{let live=true;setError('');setDetail(current=>id&&current?.id===id?current:null);setLoading(true);const timer=setTimeout(()=>{(id?api('/'+id):api('', 'GET',null,{search,offset,sort,sortDirection,source,status})).then(value=>{if(!live)return;if(id)setDetail(value);else{setRows(value.rows);setTotal(value.total);}}).catch(e=>live&&setError(message(e))).finally(()=>live&&setLoading(false));},150);return()=>{live=false;clearTimeout(timer);};},[api,id,search,offset,sort,sortDirection,source,status,reload]);
 useEffect(()=>{if(!id||stage!=='basic')return;let live=true;api('', 'GET',null,{search,offset,sort,sortDirection,source,status}).then(value=>{if(live){setRows(value.rows);setTotal(value.total);}}).catch(e=>live&&setError(message(e)));return()=>{live=false;};},[api,id,stage,search,offset,sort,sortDirection,source,status,reload]);
 const go=value=>setParams(value?{id:value}:{});
 useShippingRefresh({orgId,blocked:!!edit||!!id&&stage==='basic'||busy||workflowDirty||compositionOpen,onRefresh:()=>setReload(value=>value+1)});
 useEffect(()=>{if(params.get('form')==='new')setEdit(current=>current&&!current.id?current:{clientKey:crypto.randomUUID(),mode:'SEA',service:'GENERAL',customerId:null,data:{shipmentType:'FCL',jobType:'OTHER'}});else if(params.get('form')==='edit'&&detail)setParams({id:detail.id});},[params,detail]);

 const mutate=async work=>{if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');try{await work();if(alive.current)setReload(value=>value+1);}catch(e){setError(message(e));throw e;}finally{mutationLock.current=false;setBusy(false);}};
 const receive=async()=>{if(mutationLock.current||workflowDirty||!options.forwarder)return;try{if(detail.receiptStatus==='PENDING')await mutate(async()=>{const saved=await requestJSON('/shipping-requests/'+id+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({action:'ACCEPT',version:detail.version})});setDetail(current=>({...current,receiptStatus:'ACCEPTED',version:saved.version}));});continueRequest();}catch{}};
 const finishComposition=async()=>{if(mutationLock.current)return;try{if(composition!=='NONE'){const documentType=detail.data.documentSetup?.documentType||(detail.service==='EXPRESS'?'WAYBILL':detail.mode==='SEA'?'BILL_OF_LADING':detail.mode==='AIR'?'AIR_WAYBILL':'WAYBILL');if(detail.data.documentSetup?.composition!==composition||detail.data.documentSetup?.documentType!==documentType)await mutate(async()=>{const saved=await api('/'+id+'/document-setup','PUT',{version:detail.version,composition,documentType});setDetail(current=>({...current,...saved,bills:current.bills,documents:current.documents}));});}setCompositionOpen(false);setParams({id,stage:'bills'});}catch{}};
 const name=row=>row?.isShippingGeneralCustomer?(shippingEditorText[languageCode]||shippingEditorText.en).generalCustomer:row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||'—';
 const editorProps={t,options,busy,name,orgId,saveError:error,initial:edit,onClose:()=>{setEdit(null);go(id);},onSave:value=>mutate(async()=>{const saved=await api(value.id?'/'+value.id:'',value.id?'PUT':'POST',value);if(!alive.current)return;setEdit(null);go(saved.id);if(!value.id&&saved.receiptStatus==='ACCEPTED'){pendingDirectJob.current=saved.id;}showNotification(t.saved,'success');})};


 return <AppPageContainer title={formatPageTitle(t.title,id&&stage!=='basic'?'detail':'list',languageCode)} context={detail&&stage!=='basic'&&<Stack component="span" direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center"><Typography component="span" fontWeight={700}>{detail.number}</Typography><StatusLabel label={t[shippingState(detail,{request:stage==='basic'})]} tone={shippingStatusTone(shippingState(detail,{request:stage==='basic'}))}/></Stack>} titleActions={<Stack direction="row" spacing={1}>{(!id||stage==='basic')&&<Button variant="contained" disabled={!options.forwarder||!!id} onClick={()=>setParams({form:'new'})}>{t.new}</Button>}</Stack>}><Stack spacing={2}>
 {error&&<Alert severity="error">{error}</Alert>}
 {id&&!detail&&<Paper variant="outlined"><Table><TableBody><TableStatusRow colSpan={1} languageCode={languageCode} loading={loading} error={Boolean(error)} onRetry={()=>setReload(n=>n+1)}/></TableBody></Table></Paper>}
 {(!id||stage==='basic')?<><SearchPanel onReset={()=>{setSearch('');setSource('');setStatus('');setOffset(0);}} controls={<><TextField select size="small" label={w.source} value={source} onChange={e=>{setSource(e.target.value);setOffset(0);}}>{['','CUSTOMER','FORWARDER'].map(key=><MenuItem key={key} value={key}>{key?w[key]:w.all}</MenuItem>)}</TextField><TextField select size="small" label={t.status} value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}>{['',...statuses].map(key=><MenuItem key={key} value={key}>{key?t[key]:w.all}</MenuItem>)}</TextField></>} search={<SearchInput placeholder={t.search} inputProps={{'aria-label':t.search}} value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>}/><Paper variant="outlined" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}><TableContainer><Table data-table-layout="fixed" size="small" sx={{tableLayout:'fixed',minWidth:960}}><TableHead><TableRow>{['number','srDate','mode','customer','origin','destination','status'].map(key=><TableCell key={key} sx={{width:({number:120,srDate:108,mode:100,customer:150,status:150})[key]}} sortDirection={key==='mode'&&sort==='mode'?sortDirection:false}>{key==='mode'?<TableSortLabel active={sort==='mode'} direction={sort==='mode'?sortDirection:'asc'} onClick={()=>{setOffset(0);setSort('mode');setSortDirection(sort==='mode'&&sortDirection==='asc'?'desc':'asc');}}>{t[key]}</TableSortLabel>:key==='source'?w.source:t[key]}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow hover key={row.id} data-shipping-row={row.id} data-cancelled={row.status==='CANCELLED'} tabIndex={loading?-1:0} sx={{cursor:loading?'wait':'pointer'}} onDoubleClick={()=>{if(!loading)go(row.id);}} onKeyDown={event=>{if(!loading)activateOnKeyboard(event,()=>go(row.id));}}><TableCell><Button disabled={loading} sx={{p:0,minWidth:0,whiteSpace:'nowrap',justifyContent:'flex-start',textAlign:'left',textTransform:'none'}} onClick={event=>{if(event.detail===0)go(row.id);}}>{row.number}</Button></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{shippingRequestDate(row)}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{shippingModeLabel(row,languageCode)}</TableCell><TableCell><span data-truncate-text title={name(row.data.customer)}>{name(row.data.customer)}</span>{row.data.generalCustomer&&<Typography variant="caption" component="span" data-truncate-text title={[row.data.actualRequesterName,row.data.actualRequesterPhone].filter(Boolean).join(' \u00b7 ')}>{[row.data.actualRequesterName,row.data.actualRequesterPhone].filter(Boolean).join(' \u00b7 ')}</Typography>}</TableCell>{['origin','destination'].map(key=><TableCell key={key}><span data-truncate-text title={row.data[key]||''}>{row.data[key]||'\u2014'}</span></TableCell>)}<TableCell><Stack spacing={.5} alignItems="flex-start"><StatusLabel label={t[shippingState(row)]} tone={shippingStatusTone(shippingState(row))}/>{row.receiptStatus==='ACCEPTED'&&openProgress(row).some(task=>task.dueAt&&Date.parse(task.dueAt)<Date.now())&&<Typography variant="caption" color="warning.main">{wb.overdue} {openProgress(row).filter(task=>task.dueAt&&Date.parse(task.dueAt)<Date.now()).length}</Typography>}</Stack></TableCell></TableRow>)}{(loading||error||!rows.length)&&<TableStatusRow colSpan={7} languageCode={languageCode} loading={loading} error={Boolean(error)} onRetry={()=>setReload(n=>n+1)}/>}</TableBody></Table></TableContainer><ListPagination languageCode={languageCode} onPrevious={()=>setOffset(value=>value-50)} onNext={()=>setOffset(value=>value+50)} previousDisabled={!offset||loading} nextDisabled={offset+50>=total||loading} previousLabel={t.previous} nextLabel={t.next}></ListPagination></Paper></>:detail&&<>

 {stage!=='basic'&&<Paper variant="outlined"><Tabs value={stage} variant="scrollable" allowScrollButtonsMobile onChange={(_,value)=>changeStage(value)}>{['bills','documents'].map(key=><Tab key={key} value={key} label={key==='bills'?billLabels.transportDetails:billLabels.documents} disabled={detail.receiptStatus==='PENDING'}/>)}</Tabs></Paper>}
 {stage==='bills'&&<ShippingBills key={id+':bills'} job={detail} orgId={orgId} languageCode={languageCode} onDirtyChange={markCharges} onConfigure={async()=>{if(!workflowDirty||await dialogs.confirm('',{purpose:'discard'}))openComposition();}} onChanged={()=>setReload(value=>value+1)}/>}
 {stage==='bills'&&detail.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED'&&<EntityDetailSection title={trade.progress}><ShippingProgress embedded key={id} job={detail} employees={options.employees} languageCode={languageCode} busy={busy} onDirtyChange={markProgress} onSave={value=>mutate(async()=>{await api('/'+id+'/progress','PUT',value);showNotification(t.saved,'success');})}/></EntityDetailSection>}

 {stage==='documents'&&detail.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED'&&<ShippingTradeDocuments key={id+':trade'} job={detail} orgId={orgId} languageCode={languageCode} currencies={options.currencies||[]} onDirtyChange={markTrade}/>}
 {stage==='documents'&&<ShippingDocuments key={id+':documents'} job={detail} orgId={orgId} languageCode={languageCode} busy={busy} t={t} onDirtyChange={markDocuments}/>}

 </>}

 </Stack>{detail&&requestOpen&&(options.forwarder?<FreightJobEditor key={id} t={t} options={options} busy={busy} name={name} orgId={orgId} saveError={error} initial={detail} onDirtyChange={markBasic} title={billLabels.requestTitle+' \u00b7 '+detail.number} actions={<Button variant="contained" disabled={busy||workflowDirty||detail.status==='CANCELLED'||!['PENDING','ACCEPTED'].includes(detail.receiptStatus)} onClick={receive}>{detail.receiptStatus==='PENDING'?t.accept:requiresBillHierarchy(detail)?billLabels.selectBills:billLabels.transportDetails}</Button>} onClose={()=>go(null)} onSave={async value=>{let saved;await mutate(async()=>{saved=await api('/'+id,'PUT',value);setDetail(current=>({...current,...saved}));showNotification(t.saved,'success');});return saved;}}/>:<AppDialog open fullWidth maxWidth="lg" onClose={()=>go(null)}><DialogTitle>{billLabels.requestTitle}</DialogTitle><DialogContent><ShippingWaybillSummary job={detail} languageCode={languageCode} name={name}/></DialogContent><DialogActions><PageActions secondary={<Button onClick={()=>go(null)}>{t.cancel}</Button>}/></DialogActions></AppDialog>)}{compositionOpen&&detail&&<AppDialog open fullWidth maxWidth="sm" onClose={()=>{if(!busy){setCompositionOpen(false);if(stage==='bills'&&!detail.data.documentSetup&&requiresBillHierarchy(detail))setParams({id});}}}><DialogTitle>{billLabels.selectBills}</DialogTitle><DialogContent><RadioGroup value={composition} onChange={event=>setComposition(event.target.value)}>{(requiresBillHierarchy(detail)?['MASTER_ONLY','MASTER_HOUSE']:['NONE','MASTER_ONLY','MASTER_HOUSE']).map(key=><FormControlLabel key={key} value={key} control={<Radio disabled={busy||key==='NONE'&&!!detail.data.documentSetup||key==='MASTER_ONLY'&&(detail.bills.some(row=>row.kind==='HOUSE')||detail.bills.filter(row=>row.kind==='MASTER').length>1)}/>} label={billLabels[key]}/>)}</RadioGroup>{error&&<Alert severity="error">{error}</Alert>}</DialogContent><DialogActions><PageActions secondary={<Button disabled={busy} onClick={()=>{setCompositionOpen(false);if(stage==='bills'&&!detail.data.documentSetup&&requiresBillHierarchy(detail))setParams({id});}}>{t.cancel}</Button>} primary={<SaveButton loading={busy} onClick={finishComposition}>{billLabels.startBills}</SaveButton>}/></DialogActions></AppDialog>}{edit&&options.forwarder&&<FreightJobEditor key={edit.id||edit.clientKey} {...editorProps}/>}</AppPageContainer>;
}
