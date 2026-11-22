import EntityDetailSection from '../../components/EntityDetailSection';
import ShippingTradeDocuments from '../../components/ShippingTradeDocuments';
import {shippingTradeText} from '../../constants/shippingTrade';
import ShippingWaybillSummary from '../../components/ShippingWaybillSummary';
import ShippingProgress from '../../components/ShippingProgress';
import ShippingDocuments from '../../components/ShippingDocuments';
import {shippingWorkbenchText,openProgress} from '../../constants/shippingWorkbench';
import {activateOnKeyboard} from '../../utils/keyboardPolicy.mjs';
import {formatPageTitle} from '../../utils/pageNaming.mjs';
import Dialog from '../../components/AppDialog';
import ListPagination from '../../components/ListPagination';
import {freightWorkflowText} from '../../constants/freightWorkflow';
import SaveButton from '../../components/SaveButton';
import SearchPanel from '../../components/SearchPanel';
import SearchInput from '../../components/SearchInput';
import {shippingModeLabel,shippingRequestDate} from '../../utils/shippingPresentation';
import {shippingEditorText} from '../../constants/shippingEditor';
import {usePageDialogs} from '../../components/PageDialogProvider';
import {freightJobEditorText} from '../../constants/freightJobEditor';
import FreightJobEditor from '../../components/FreightJobEditor';
import ShippingChargeDrafts from '../../components/ShippingChargeDrafts';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {useSearchParams,Navigate} from 'react-router-dom';
import {Box,Button,DialogActions,DialogContent,DialogTitle,MenuItem,Paper,Stack,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TableSortLabel,Tab,Tabs,TextField,Typography} from '@mui/material';
import Alert from "../../components/AppNotice";
import AppPageContainer from '../../components/AppPageContainer';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import useUnsavedChanges from '../../hooks/useUnsavedChanges';
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
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[total,setTotal]=useState(0),[offset,setOffset]=useState(0),[sort,setSort]=useState('createdAt'),[sortDirection,setSortDirection]=useState('desc'),[search,setSearch]=useState(''),[detail,setDetail]=useState(null),[options,setOptions]=useState({customers:[],employees:[]}),[edit,setEdit]=useState(null),[bill,setBill]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const mutationLock=useRef(false);
 const trade=shippingTradeText[languageCode]||shippingTradeText.en;
 const wb=shippingWorkbenchText[languageCode]||shippingWorkbenchText.en;
 const w=freightWorkflowText[languageCode]||freightWorkflowText.en,stage=['documents','progress','setup','bills','charges'].includes(params.get('stage'))?params.get('stage'):'basic';
 const [source,setSource]=useState(''),[status,setStatus]=useState('');
 const documentLabel=detail?.data.documentSetup?.documentType?w[detail.data.documentSetup.documentType]:null;
 if(documentLabel&&detail.data.documentSetup.documentType!=='BILL_OF_LADING')Object.assign(t,{bills:w.bills,MASTER:'Master '+documentLabel,HOUSE:'House '+documentLabel,billNumber:documentLabel+' #'});
 const [dirtyAreas,setDirtyAreas]=useState({progress:false,documents:false,trade:false,charges:false});
 const workflowDirty=Object.values(dirtyAreas).some(Boolean);
 const markProgress=useCallback(value=>setDirtyAreas(old=>old.progress===value?old:{...old,progress:value}),[]);
 const markDocuments=useCallback(value=>setDirtyAreas(old=>old.documents===value?old:{...old,documents:value}),[]);
 const markTrade=useCallback(value=>setDirtyAreas(old=>old.trade===value?old:{...old,trade:value}),[]);
 const markCharges=useCallback(value=>setDirtyAreas(old=>old.charges===value?old:{...old,charges:value}),[]);
 const changeStage=async value=>{if(busy)return;if(workflowDirty&&!await dialogs.confirm('',{purpose:'discard'}))return;setParams({id,...(value!=='basic'?{stage:value}:{})});};
 const form=params.get('form');
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const api=useCallback((path='',method='GET',body,query={})=>requestJSON('/freight/transport-jobs'+path+buildQueryString({orgId,...query}),{method,skipCache:true,...(body?{body:JSON.stringify(body)}:{})}),[orgId]);
 const message=e=>e.message==='FREIGHT_COMPOSITION_HAS_BILLS'?w.protected:e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.hasHouses:e.message==='FREIGHT_MASTER_SCOPE'?t.scope:e.message==='FREIGHT_CHANGED'?t.conflict:t.failed;
 useEffect(()=>{let live=true;Promise.all([requestJSON('/freight/options'+buildQueryString({orgId}),{skipCache:true}),api('/options')]).then(([customers,value])=>live&&setOptions({customers,employees:value.employees,forwarder:value.forwarder,currencies:value.currencies||[]})).catch(e=>live&&setError(message(e)));return()=>{live=false;};},[api,reload,form]);
 useEffect(()=>{let live=true;setError('');setDetail(current=>id&&current?.id===id?current:null);setLoading(true);const timer=setTimeout(()=>{(id?api('/'+id):api('', 'GET',null,{search,offset,sort,sortDirection,source,status})).then(value=>{if(!live)return;if(id)setDetail(value);else{setRows(value.rows);setTotal(value.total);}}).catch(e=>live&&setError(message(e))).finally(()=>live&&setLoading(false));},150);return()=>{live=false;clearTimeout(timer);};},[api,id,search,offset,sort,sortDirection,source,status,reload]);
 const go=value=>setParams(value?{id:value}:{});
 useShippingRefresh({orgId,blocked:!!edit||!!bill||busy||workflowDirty,onRefresh:()=>setReload(value=>value+1)});
 useEffect(()=>{if(params.get('form')==='new')setEdit(current=>current&&!current.id?current:{clientKey:crypto.randomUUID(),mode:'SEA',service:'GENERAL',customerId:null,data:{shipmentType:'FCL',jobType:'OTHER'}});else if(params.get('form')==='edit'&&detail)setEdit(current=>current?.id===detail.id?current:{...detail,clientKey:crypto.randomUUID()});},[params,detail]);

 const mutate=async work=>{if(mutationLock.current)return;mutationLock.current=true;setBusy(true);setError('');try{await work();if(alive.current)setReload(value=>value+1);}catch(e){setError(message(e));throw e;}finally{mutationLock.current=false;setBusy(false);}};
 const masters=detail?.bills.filter(row=>row.kind==='MASTER')||[],houses=detail?.bills.filter(row=>row.kind==='HOUSE')||[];
 const name=row=>row?.isShippingGeneralCustomer?(shippingEditorText[languageCode]||shippingEditorText.en).generalCustomer:row?.[languageCode==='ko'?'nameKo':languageCode==='vi'?'nameVi':'name']||row?.name||'—';
 const editorProps={t,options,busy,name,orgId,saveError:error,initial:edit,onClose:()=>{setEdit(null);go(id);},onSave:value=>mutate(async()=>{const saved=await api(value.id?'/'+value.id:'',value.id?'PUT':'POST',value);if(!alive.current)return;setEdit(null);go(saved.id);showNotification(t.saved,'success');})};


 return <AppPageContainer title={formatPageTitle(t.title,id?'detail':'list',languageCode)} context={detail&&<Stack component="span" direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center"><Typography component="span" fontWeight={700}>{detail.number}</Typography><StatusLabel label={t[detail.status]} tone={shippingStatusTone(detail.status)}/><StatusLabel label={t[detail.receiptStatus||'ACCEPTED']} tone={shippingStatusTone(detail.receiptStatus||'ACCEPTED')}/></Stack>} titleActions={<Stack direction="row" spacing={1}>{id?<><Button disabled={busy} onClick={async()=>{if(!workflowDirty||await dialogs.confirm('',{purpose:'discard'}))go(null);}}>{t.back}</Button>{detail&&(detail.receiptStatus==='PENDING'?<Button variant="contained" disabled={busy} onClick={()=>mutate(async()=>{await requestJSON('/shipping-requests/'+id+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({action:'ACCEPT',version:detail.version})});showNotification(t.saved,'success');}).catch(()=>{})}>{t.accept}</Button>:<><Button disabled={busy} onClick={()=>mutate(async()=>{await requestJSON('/shipping-requests/'+id+buildQueryString({orgId}),{method:'POST',body:JSON.stringify({action:'PUBLISH',version:detail.version})});showNotification(t.saved,'success');}).catch(()=>{})}>{t.share}</Button></>)}<Button variant="contained" disabled={!detail||!options.forwarder} onClick={async()=>{if(!workflowDirty||await dialogs.confirm('',{purpose:'discard'}))setParams({id,form:'edit'});}}>{t.edit}</Button></>:<Button variant="contained" disabled={!options.forwarder} onClick={()=>setParams({form:'new'})}>{t.new}</Button>}</Stack>}><Stack spacing={2}>
 {error&&<Alert severity="error">{error}</Alert>}
 {id&&!detail&&<Paper variant="outlined"><Table><TableBody><TableStatusRow colSpan={1} languageCode={languageCode} loading={loading} error={Boolean(error)} onRetry={()=>setReload(n=>n+1)}/></TableBody></Table></Paper>}
 {!id?<><SearchPanel onReset={()=>{setSearch('');setSource('');setStatus('');setOffset(0);}} controls={<><TextField select size="small" label={w.source} value={source} onChange={e=>{setSource(e.target.value);setOffset(0);}}>{['','CUSTOMER','FORWARDER'].map(key=><MenuItem key={key} value={key}>{key?w[key]:w.all}</MenuItem>)}</TextField><TextField select size="small" label={t.status} value={status} onChange={e=>{setStatus(e.target.value);setOffset(0);}}>{['',...statuses].map(key=><MenuItem key={key} value={key}>{key?t[key]:w.all}</MenuItem>)}</TextField></>} search={<SearchInput placeholder={t.search} inputProps={{'aria-label':t.search}} value={search} onChange={e=>{setSearch(e.target.value);setOffset(0);}}/>}/><Paper variant="outlined" sx={{width:'100%',minWidth:0,overflow:'hidden',borderRadius:2}}><TableContainer><Table data-table-layout="fixed" size="small" sx={{tableLayout:'fixed',minWidth:960}}><TableHead><TableRow>{['number','srDate','mode','customer','origin','destination','status'].map(key=><TableCell key={key} sx={{width:({number:120,srDate:108,mode:100,customer:150,status:150})[key]}} sortDirection={key==='mode'&&sort==='mode'?sortDirection:false}>{key==='mode'?<TableSortLabel active={sort==='mode'} direction={sort==='mode'?sortDirection:'asc'} onClick={()=>{setOffset(0);setSort('mode');setSortDirection(sort==='mode'&&sortDirection==='asc'?'desc':'asc');}}>{t[key]}</TableSortLabel>:key==='source'?w.source:t[key]}</TableCell>)}</TableRow></TableHead><TableBody>{rows.map(row=><TableRow hover key={row.id} data-shipping-row={row.id} data-cancelled={row.status==='CANCELLED'} tabIndex={loading?-1:0} sx={{cursor:loading?'wait':'pointer'}} onClick={event=>{if(!loading&&!event.target.closest('button,a,input'))go(row.id);}} onKeyDown={event=>{if(!loading)activateOnKeyboard(event,()=>go(row.id));}}><TableCell><Button disabled={loading} sx={{p:0,minWidth:0,whiteSpace:'nowrap',justifyContent:'flex-start',textAlign:'left',textTransform:'none'}} onClick={()=>go(row.id)}>{row.number}</Button></TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{shippingRequestDate(row)}</TableCell><TableCell sx={{whiteSpace:'nowrap'}}>{shippingModeLabel(row,languageCode)}</TableCell><TableCell><span data-truncate-text title={name(row.data.customer)}>{name(row.data.customer)}</span>{row.data.generalCustomer&&<Typography variant="caption" component="span" data-truncate-text title={[row.data.actualRequesterName,row.data.actualRequesterPhone].filter(Boolean).join(' \u00b7 ')}>{[row.data.actualRequesterName,row.data.actualRequesterPhone].filter(Boolean).join(' \u00b7 ')}</Typography>}</TableCell>{['origin','destination'].map(key=><TableCell key={key}><span data-truncate-text title={row.data[key]||''}>{row.data[key]||'\u2014'}</span></TableCell>)}<TableCell><Stack spacing={.5} alignItems="flex-start"><StatusLabel label={t[row.status]} tone={shippingStatusTone(row.status)}/>{openProgress(row).some(task=>task.dueAt&&Date.parse(task.dueAt)<Date.now())&&<Typography variant="caption" color="warning.main">{wb.overdue} {openProgress(row).filter(task=>task.dueAt&&Date.parse(task.dueAt)<Date.now()).length}</Typography>}{row.receiptStatus==='PENDING'&&<StatusLabel label={t.PENDING} tone={shippingStatusTone('PENDING')}/>}</Stack></TableCell></TableRow>)}{(loading||error||!rows.length)&&<TableStatusRow colSpan={7} languageCode={languageCode} loading={loading} error={Boolean(error)} onRetry={()=>setReload(n=>n+1)}/>}</TableBody></Table></TableContainer><ListPagination languageCode={languageCode} onPrevious={()=>setOffset(value=>value-50)} onNext={()=>setOffset(value=>value+50)} previousDisabled={!offset||loading} nextDisabled={offset+50>=total||loading} previousLabel={t.previous} nextLabel={t.next}></ListPagination></Paper></>:detail&&<>

 <Paper variant="outlined"><Tabs value={['basic','progress'].includes(stage)?'basic':'documents'} variant="scrollable" allowScrollButtonsMobile onChange={(_,value)=>changeStage(value)}>{['basic','documents'].map(key=><Tab key={key} value={key} label={trade[key==='basic'?'work':'documents']} disabled={key!=='basic'&&(detail.receiptStatus==='PENDING'||detail.status==='CANCELLED')}/>)}</Tabs></Paper>
 {['basic','progress'].includes(stage)&&<ShippingWaybillSummary job={detail} languageCode={languageCode} name={name}/>}
 {['basic','progress'].includes(stage)&&detail.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED'&&<EntityDetailSection title={trade.progress}><ShippingProgress embedded key={id} job={detail} employees={options.employees} languageCode={languageCode} busy={busy} onDirtyChange={markProgress} onSave={value=>mutate(async()=>{await api('/'+id+'/progress','PUT',value);showNotification(t.saved,'success');})}/></EntityDetailSection>}

 {!['basic','progress'].includes(stage)&&detail.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED'&&<ShippingTradeDocuments key={id+':trade'} job={detail} orgId={orgId} languageCode={languageCode} currencies={options.currencies||[]} onDirtyChange={markTrade}/>}
 {!['basic','progress'].includes(stage)&&<ShippingDocuments key={id+':documents'} job={detail} orgId={orgId} languageCode={languageCode} busy={busy} t={t} onDirtyChange={markDocuments} onEditBill={setBill} onRemoveBill={row=>{if(busy)return;dialogs.confirm(t.removeConfirm).then(confirmed=>confirmed&&mutate(async()=>{await api('/'+id+'/bills/'+row.id,'DELETE',{version:row.version});showNotification(t.deleted,'success');}).catch(()=>{}));}} onSaveSetup={value=>mutate(async()=>{await api('/'+id+'/document-setup','PUT',value);showNotification(t.saved,'success');})}/>}
 {!['basic','progress'].includes(stage)&&detail.receiptStatus==='ACCEPTED'&&detail.status!=='CANCELLED'&&<ShippingChargeDrafts key={id+':charges'} orgId={orgId} jobId={id} languageCode={languageCode} refreshKey={reload} onDirtyChange={markCharges}/>}
 </>}
 {bill&&<BillEditor {...{t,busy,masters}} initial={bill} bills={detail.bills} onClose={()=>setBill(null)} onSave={value=>mutate(async()=>{await api('/'+id+'/bills'+(value.version?'/'+value.id:''),value.version?'PUT':'POST',value);if(!alive.current)return;setBill(null);showNotification(t.saved,'success');})}/>}
 </Stack>{edit&&options.forwarder&&<FreightJobEditor key={edit.id||edit.clientKey} {...editorProps}/>}</AppPageContainer>;
}
function BillEditor({t,initial,bills,masters,busy,onSave,onClose}){
 const [value,setValue]=useState(initial),[failed,setFailed]=useState(false);useUnsavedChanges(JSON.stringify(value)!==JSON.stringify(initial));
 const duplicate=bills.some(row=>row.id!==value.id&&row.kind===value.kind&&row.number.trim().toLowerCase()===value.number.trim().toLowerCase()&&row.issuer.trim().toLowerCase()===value.issuer.trim().toLowerCase());
 return <Dialog open fullWidth maxWidth="sm" onClose={()=>!busy&&onClose()}><DialogTitle>{t[value.kind]}</DialogTitle><DialogContent><Stack spacing={2}>{failed&&<Alert severity="error">{t.failed}</Alert>}{duplicate&&<Alert severity="warning">{t.duplicate}</Alert>}{['number','issuer'].map(key=><TextField key={key} required={key==='number'} label={key==='number'?t.billNumber:t.issuer} value={value[key]} onChange={e=>setValue(v=>({...v,[key]:e.target.value}))}/>)}{value.kind==='HOUSE'&&<TextField id="job-bill-master" select slotProps={{select:{SelectDisplayProps:{'aria-label':t.master,'aria-labelledby':undefined}}}} label={t.master} value={value.masterId||''} onChange={e=>setValue(v=>({...v,masterId:e.target.value||null}))}><MenuItem value="">{t.unlink}</MenuItem>{masters.map(row=><MenuItem key={row.id} value={row.id}>{row.number}{row.issuer?' · '+row.issuer:''}</MenuItem>)}</TextField>}</Stack></DialogContent><DialogActions><Button disabled={busy} onClick={onClose}>{t.cancel}</Button><SaveButton loading={busy} disabled={!value.number.trim()} onClick={()=>onSave(value).catch(()=>setFailed(true))}>{t.save}</SaveButton></DialogActions></Dialog>;
}
