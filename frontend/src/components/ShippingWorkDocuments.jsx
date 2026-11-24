import React,{useEffect,useRef,useState} from 'react';
import {Box,Button,Stack,Typography} from '@mui/material';
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

export default function ShippingWorkDocuments({job,orgId,languageCode,onOpen,onCreate,onChanged,onDirtyChange,busy=false}){
 const labels=shippingOperationText[languageCode]||shippingOperationText.en,t=job.mode==='AIR'&&job.service!=='EXPRESS'?Object.fromEntries(Object.entries(labels).map(([key,value])=>[key,value.replaceAll('MBL','MAWB').replaceAll('HBL','HAWB')])):labels,dialogs=usePageDialogs();
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[rows,setRows]=useState([]),[selected,setSelected]=useState(null),[loading,setLoading]=useState(false),[loadError,setLoadError]=useState(false),[reload,setReload]=useState(0),[working,setWorking]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('');
 const pending=useRef(null),lock=useRef(false),canEdit=job.receiptStatus==='ACCEPTED'&&job.status!=='CANCELLED',masters=job.bills.filter(row=>row.kind==='MASTER'),houses=job.bills.filter(row=>row.kind==='HOUSE');
 useEffect(()=>{onDirtyChange?.(working||uncertain);return()=>onDirtyChange?.(false);},[working,uncertain,onDirtyChange]);
 useEffect(()=>{if(!open)return;let live=true;setLoading(true);setLoadError(false);const timer=setTimeout(()=>{requestJSON('/freight/transport-jobs/'+job.id+'/master-bills'+buildQueryString({orgId,q:query}),{skipCache:true}).then(value=>{if(live)setRows(value.rows);}).catch(()=>live&&setLoadError(true)).finally(()=>live&&setLoading(false));},150);return()=>{live=false;clearTimeout(timer);};},[open,query,reload,job.id,orgId]);
 const act=async(row,remove=false)=>{
  if(lock.current||!canEdit||busy)return;
  if(remove&&!pending.current&&!await dialogs.confirm(t.unlinkConfirm.replace('{number}',row.number)))return;
  pending.current=pending.current||{masterId:row.id,remove,body:{version:job.version,requestId:crypto.randomUUID()}};
  const value=pending.current;lock.current=true;setWorking(true);setError('');
  try{await requestJSON('/freight/transport-jobs/'+job.id+'/master-links/'+encodeURIComponent(value.masterId)+buildQueryString({orgId}),{method:value.remove?'DELETE':'POST',body:JSON.stringify(value.body)});pending.current=null;setUncertain(false);setOpen(false);setSelected(null);onChanged?.();}
  catch(e){const unknown=!e.status||e.status>=500;setUncertain(unknown);if(!unknown)pending.current=null;setError(e.message==='FREIGHT_MASTER_HAS_HOUSES'?t.unlinkHouses:e.message==='FREIGHT_BILL_HAS_CHARGES'?t.unlinkCharges:e.status===409?t.conflict:t.failed);}
  finally{lock.current=false;setWorking(false);}
 };
 const blocked=busy||working||uncertain;
 const entry=(row,kind)=><Stack key={row.id} direction="row" useFlexGap flexWrap="wrap" alignItems="center" gap={1} sx={{py:1,borderBottom:1,borderColor:'divider'}}>
  <Box sx={{flex:1,minWidth:140}}><Button type="button" disabled={blocked} sx={{p:0,minWidth:0,justifyContent:'flex-start'}} onClick={()=>onOpen(row.id)}>{row.number}</Button><Typography variant="caption" display="block" color="text.secondary">{kind==='MASTER'?[row.issuer,row.linkedJobCount>1?t.sharedCount.replace('{count}',row.linkedJobCount):''].filter(Boolean).join(' · '):row.masterId?masters.find(master=>master.id===row.masterId)?.number:t.standaloneHouse}</Typography></Box>
  {kind==='MASTER'&&<Box sx={{flexBasis:'100%',order:2}}><Typography variant="body2">{[row.data?.vessel,row.data?.voyage].filter(Boolean).join(' · ')}</Typography><Typography variant="caption" color="text.secondary">{[row.data?.etd&&`${t.etd}: ${row.data.etd}`,row.data?.eta&&`${t.eta}: ${row.data.eta}`].filter(Boolean).join(' · ')}</Typography></Box>}
  <Button type="button" size="small" disabled={blocked} onClick={()=>onOpen(row.id)}>{t.openDocument}</Button>{kind==='MASTER'&&canEdit&&<Button type="button" size="small" disabled={blocked} onClick={()=>act(row,true)}>{t.unlink}</Button>}
 </Stack>;
 return <Stack spacing={1.5} data-shipping-work-documents>
  {error&&!open&&<AppNotice severity="error" action={uncertain?<Button onClick={()=>act({id:pending.current.masterId})}>{t.retry}</Button>:undefined}>{error}</AppNotice>}
  <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'repeat(2,minmax(0,1fr))'},gap:2}}>
   <EntityDetailSection title={t.masterSection} actions={canEdit&&<Stack direction="row" useFlexGap flexWrap="wrap" gap={1}><Button type="button" disabled={blocked} onClick={()=>{setError('');setOpen(true);}}>{t.linkMaster}</Button><Button type="button" disabled={blocked} onClick={()=>onCreate('MASTER')}>{t.newMaster}</Button></Stack>}>{masters.length?masters.map(row=>entry(row,'MASTER')):<Typography variant="body2" color="text.secondary">{t.noMaster}</Typography>}</EntityDetailSection>
   <EntityDetailSection title={t.houseSection} actions={canEdit&&<Button type="button" disabled={blocked} onClick={()=>onCreate('HOUSE',masters.length===1?masters[0].id:null)}>{t.newHouse}</Button>}>{houses.length?houses.map(row=>entry(row,'HOUSE')):<Typography variant="body2" color="text.secondary">{t.noHouse}</Typography>}</EntityDetailSection>
  </Box>
  {open&&<ListDetailDialog open maxWidth="lg" title={t.linkMaster} onClose={()=>{if(!working&&!uncertain)setOpen(false);}}
   search={<SearchInput value={query} onChange={e=>setQuery(e.target.value)} label={t.masterSearch}/>}
   list={<DialogRecordList rows={rows} columns={[{key:'number',label:job.mode==='AIR'?'MAWB':'MBL',value:row=>row.number},{key:'issuer',label:t.issuer,value:row=>row.issuer}]} selectedKey={selected?.id} onSelect={setSelected} disabled={blocked} loading={loading} error={loadError} onRetry={()=>setReload(n=>n+1)} languageCode={languageCode}/>}
   detail={<Stack spacing={2}>{selected&&<RecordDetails fields={[{key:'number',label:job.mode==='AIR'?'MAWB':'MBL',value:selected.number},{key:'issuer',label:t.issuer,value:selected.issuer},{key:'vessel',label:t.vessel,value:selected.data.vessel},{key:'voyage',label:t.voyage,value:selected.data.voyage},{key:'etd',label:t.etd,value:selected.data.etd},{key:'eta',label:t.eta,value:selected.data.eta}]}/ >}{error&&<AppNotice severity="error">{error}</AppNotice>}</Stack>}
   actions={<PageActions primary={<Button variant="contained" disabled={working||loading||loadError||!selected||selected.linked&&!uncertain} onClick={()=>act(selected)}>{uncertain?t.retry:t.link}</Button>}/>}/ >}
 </Stack>;
}
