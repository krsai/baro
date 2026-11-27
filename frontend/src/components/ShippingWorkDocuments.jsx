import SplitActionTab from './SplitActionTab';
import AddActionButton from './AddActionButton';
import {RecordOpenButton} from './RecordInteraction';
import {billWorkflowText} from '../constants/billWorkflow';
import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,DialogActions,DialogContent,DialogTitle,Stack,Typography} from '@mui/material';
import AppDialog from './AppDialog';
import EntityDetailSection from './EntityDetailSection';
import ListDetailDialog from './ListDetailDialog';
import DialogRecordList from './DialogRecordList';
import RecordDetails from './RecordDetails';
import PageActions from './PageActions';
import SearchInput from './SearchInput';
import AppNotice from './AppNotice';
import {usePageDialogs} from './PageDialogProvider';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {shippingOperationText} from '../constants/shippingOperations';

export default function ShippingWorkDocuments({job,orgId,languageCode,forwarder,compact=false,toolbar=false,actions,onOpen,onCreate,onChanged,onDirtyChange,onReturnDetail,onPanelChange,returnVersion=0,busy=false}){
 const flow=billWorkflowText[languageCode]||billWorkflowText.en;
 const labels=shippingOperationText[languageCode]||shippingOperationText.en,t=job.mode==='AIR'&&job.service!=='EXPRESS'?Object.fromEntries(Object.entries(labels).map(([key,value])=>[key,value.replaceAll('MBL','MAWB').replaceAll('HBL','HAWB').replaceAll('mBL','MAWB').replaceAll('hBL','HAWB').replaceAll('B/L','AWB')])):labels,dialogs=usePageDialogs();
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[rows,setRows]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(false),[reload,setReload]=useState(0),[working,setWorking]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const pending=useRef(null),lock=useRef(false),canEdit=job.receiptStatus==='ACCEPTED'&&job.status!=='CANCELLED',masters=job.bills.filter(row=>row.kind==='MASTER'),houses=job.bills.filter(row=>row.kind==='HOUSE');
 const [panel,setPanel]=useState(null),hasBills=job.service!=='EXPRESS'&&['SEA','AIR'].includes(job.mode)||job.bills.length>0;
 const [creating,setCreating]=useState(null),[houseAfterLink,setHouseAfterLink]=useState(false),[linkedHouseMaster,setLinkedHouseMaster]=useState(null);
 useEffect(()=>{if(linkedHouseMaster&&masters.some(row=>row.id===linkedHouseMaster)){setLinkedHouseMaster(null);onCreate('HOUSE',linkedHouseMaster);}},[job.bills,linkedHouseMaster]);
 const createMaster=mode=>{if(blocked||!canEdit)return;if(mode==='FORWARDER'&&!forwarder?.name){setError(t.forwarderUnavailable);return;}setCreating(null);onCreate('MASTER',null,{partyMode:mode,createHouse:mode==='FORWARDER'});};
 useEffect(()=>{setPanel(null);setCreating(null);setOpen(false);setLinkedHouseMaster(null);setHouseAfterLink(false);},[returnVersion,job.id]);
 useEffect(()=>{onPanelChange?.(panel);},[panel,onPanelChange]);
 const returnDetail=async()=>{if(busy||working||uncertain)return;if(onReturnDetail&&await onReturnDetail()===false)return;setPanel(null);setOpen(false);};
 useEffect(()=>{onDirtyChange?.(working||uncertain);return()=>onDirtyChange?.(false);},[working,uncertain,onDirtyChange]);
 useEffect(()=>{if(!open)return;let live=true;setLoading(true);setLoadError(false);const timer=setTimeout(()=>{requestJSON('/freight/transport-jobs/'+job.id+'/master-bills'+buildQueryString({orgId,q:query}),{skipCache:true}).then(value=>{if(live)setRows(value.rows);}).catch(()=>live&&setLoadError(true)).finally(()=>live&&setLoading(false));},150);return()=>{live=false;clearTimeout(timer);};},[open,query,reload,job.id,orgId]);
 const act=async(row,remove=false)=>{
  if(lock.current||!canEdit||busy)return;
  if(!remove&&houseAfterLink&&row.linked){setOpen(false);setHouseAfterLink(false);onCreate('HOUSE',row.id);return;}
  if(remove&&!pending.current&&!await dialogs.confirm(t.unlinkConfirm.replace('{number}',row.number)))return;
  pending.current=pending.current||{masterId:row.id,remove,body:{version:job.version,requestId:crypto.randomUUID()}};
  const value=pending.current;lock.current=true;setWorking(true);setError('');
  try{await requestJSON('/freight/transport-jobs/'+job.id+'/master-links/'+encodeURIComponent(value.masterId)+buildQueryString({orgId}),{method:value.remove?'DELETE':'POST',body:JSON.stringify(value.body)});pending.current=null;setUncertain(false);setOpen(false);setSelected(null);if(!value.remove&&houseAfterLink){setLinkedHouseMaster(value.masterId);setHouseAfterLink(false);}onChanged?.();}
  catch(e){const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)pending.current=null;setError(e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.unlinkHouses:e.message==='FREIGHT_BILL_HAS_CHARGES'?t.unlinkCharges:e.status===409?t.conflict:t.failed);}
  finally{lock.current=false;setWorking(false);}
 };
 const blocked=busy||working||uncertain;
 const entry=(row,kind)=><Stack key={row.id} direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={1} sx={{py:1,borderBottom:1,borderColor:'divider'}}>
  <Box sx={{flex:1,minWidth:140}}><RecordOpenButton disabled={blocked} onOpen={()=>onOpen(row.id)}>{row.number}</RecordOpenButton><Typography variant="caption" display="block" color="text.secondary">{kind==='MASTER'?[row.issuer,row.linkedJobCount>1?t.sharedCount.replace('{count}',row.linkedJobCount):''].filter(Boolean).join(' · '):row.masterId?masters.find(master=>master.id===row.masterId)?.number:t.standaloneHouse}</Typography></Box>
  {kind==='MASTER'&&<Box sx={{flexBasis:'100%',order:2}}><Typography variant="body2">{[row.data?.vessel,row.data?.voyage].filter(Boolean).join(' · ')}</Typography><Typography variant="caption" color="text.secondary">{[row.data?.etd&&`${t.etd}: ${row.data.etd}`,row.data?.eta&&`${t.eta}: ${row.data.eta}`].filter(Boolean).join(' · ')}</Typography></Box>}
  <RecordOpenButton disabled={blocked} onOpen={()=>onOpen(row.id)}>{t.openDocument}</RecordOpenButton>{kind==='MASTER'&&canEdit&&<AddActionButton disabled={blocked} showLabel title={flow.addHouse} onClick={()=>onCreate('HOUSE',row.id)}/>}{kind==='MASTER'&&canEdit&&<Button type="button" size="small" disabled={blocked} onClick={()=>act(row,true)}>{t.unlink}</Button>}
 </Stack>;
 return <Stack spacing={1.5} data-shipping-work-documents>
  {toolbar&&<Box data-shipping-work-actions sx={{display:'grid',gridTemplateColumns:{xs:'repeat(2,minmax(0,1fr))',sm:`repeat(${hasBills?5:3},minmax(0,1fr))`},gap:1}}>
   <Button type="button" variant={!panel?'contained':'outlined'} disabled={blocked} aria-current={!panel?'page':undefined} onClick={returnDetail}>{t.detail}</Button>
   {hasBills&&['MASTER','HOUSE'].map(kind=><SplitActionTab key={kind} data-bl-tab={kind} selected={panel===kind} disabled={blocked} controls={`shipping-${job.id}-${kind}`} onClick={()=>setPanel(old=>old===kind?null:kind)} addLabel={kind==='MASTER'?flow.addMaster:flow.addHouse} onAdd={canEdit?()=>setCreating(kind):undefined}>{job.mode==='AIR'?(kind==='MASTER'?'MAWB':'HAWB'):(kind==='MASTER'?flow.master:flow.house)} ({kind==='MASTER'?masters.length:houses.length})</SplitActionTab>)}

   {actions}
  </Box>}
  {error&&!open&&<AppNotice severity="error" action={uncertain?<Button onClick={()=>act({id:pending.current.masterId})}>{t.retry}</Button>:undefined}>{error}</AppNotice>}
  <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:compact||toolbar?'minmax(0,1fr)':'repeat(2,minmax(0,1fr))'},gap:toolbar&&!panel?0:2}}>
   {(!toolbar||panel==='MASTER')&&<Box id={`shipping-${job.id}-MASTER`}><EntityDetailSection title={t.masterSection} actions={canEdit&&<Stack direction="row" useFlexGap flexWrap="wrap" gap={1}><Button type="button" disabled={blocked} onClick={()=>{setError('');setHouseAfterLink(false);setOpen(true);}}>{t.linkMaster}</Button><Button type="button" disabled={blocked} onClick={()=>setCreating('MASTER')}>{t.newMaster}</Button></Stack>}>{masters.length?masters.map(row=><Box key={row.id}>{entry(row,'MASTER')}<Box sx={{pl:3}}>{houses.filter(house=>house.masterId===row.id).map(house=>entry(house,'HOUSE'))}</Box></Box>):<Typography variant="body2" color="text.secondary">{t.noMaster}</Typography>}</EntityDetailSection></Box>}
   {(!toolbar||panel==='HOUSE')&&<Box id={`shipping-${job.id}-HOUSE`}><EntityDetailSection title={t.houseSection} actions={canEdit&&<Button type="button" disabled={blocked} onClick={()=>setCreating('HOUSE')}>{t.newHouse}</Button>}>{houses.length?houses.map(row=>entry(row,'HOUSE')):<Typography variant="body2" color="text.secondary">{t.noHouse}</Typography>}</EntityDetailSection></Box>}
  </Box>
  {open&&<ListDetailDialog open maxWidth="lg" title={t.linkMaster} onClose={()=>{if(!working&&!uncertain)setOpen(false);}}
   search={<SearchInput value={query} onChange={e=>setQuery(e.target.value)} label={t.masterSearch}/>}
   list={<DialogRecordList rows={rows} columns={[{key:'number',label:job.mode==='AIR'?'MAWB':'MBL',value:row=>row.number},{key:'issuer',label:t.issuer,value:row=>row.issuer}]} selectedKey={selected?.id} onSelect={setSelected} disabled={blocked} loading={loading} error={loadError} onRetry={()=>setReload(n=>n+1)} languageCode={languageCode}/>}
   detail={<Stack spacing={2}>{selected&&<RecordDetails fields={[{key:'number',label:job.mode==='AIR'?'MAWB':'MBL',value:selected.number},{key:'issuer',label:t.issuer,value:selected.issuer},{key:'vessel',label:t.vessel,value:selected.data.vessel},{key:'voyage',label:t.voyage,value:selected.data.voyage},{key:'etd',label:t.etd,value:selected.data.etd},{key:'eta',label:t.eta,value:selected.data.eta}]}/ >}{error&&<AppNotice severity="error">{error}</AppNotice>}</Stack>}
   actions={<PageActions secondary={<Button disabled={blocked} onClick={()=>setOpen(false)}>{labels.close}</Button>} primary={<Button variant="contained" disabled={working||loading||loadError||!selected||selected.linked&&!houseAfterLink&&!uncertain} onClick={()=>act(selected)}>{uncertain?t.retry:t.link}</Button>}/>}/ >}
  {creating&&<AppDialog open maxWidth="sm" fullWidth onClose={()=>setCreating(null)}><DialogTitle>{creating==='MASTER'?flow.addMaster:flow.addHouse}</DialogTitle><DialogContent><Stack spacing={2} sx={{pt:1}}>{creating==='MASTER'?<><Button variant="outlined" onClick={()=>createMaster('DIRECT')}>{flow.direct}</Button><Button variant="outlined" onClick={()=>createMaster('FORWARDER')}>{flow.combined}</Button></>:<><Button variant="outlined" onClick={()=>{setCreating(null);onCreate('HOUSE');}}>{flow.standalone}</Button><Button variant="outlined" onClick={()=>{setCreating(null);setError('');setSelected(null);setHouseAfterLink(true);setOpen(true);}}>{t.existingMaster}</Button><Button variant="outlined" onClick={()=>createMaster('FORWARDER')}>{t.createMaster}</Button></>}{error&&<AppNotice severity="error">{error}</AppNotice>}</Stack></DialogContent><DialogActions><PageActions secondary={<Button onClick={()=>setCreating(null)}>{labels.close}</Button>}/></DialogActions></AppDialog>}
 </Stack>;
}
