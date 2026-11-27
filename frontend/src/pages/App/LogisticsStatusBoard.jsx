import {rowActionsText} from '../../constants/rowActions';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {Box,Button,LinearProgress,MenuItem,Paper,Table,TableBody,TableCell,TableContainer,TableHead,TableRow,TextField,Typography} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import {RecordInteractionScope,RecordRow,RecordOpenButton} from '../../components/RecordInteraction';
import AppPageContainer from '../../components/AppPageContainer';
import PageContentStack from '../../components/PageContentStack';
import PageActions from '../../components/PageActions';
import SearchPanel from '../../components/SearchPanel';
import SearchInput from '../../components/SearchInput';
import CompletionFilter from '../../components/CompletionFilter';
import ListPagination from '../../components/ListPagination';
import StatusLabel from '../../components/StatusLabel';
import Alert from '../../components/AppNotice';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {useRequestScopeContext} from '../../context/RequestScopeContext';
import useShippingRefresh from '../../hooks/useShippingRefresh';
import {canAccessPath} from '../../utils/accessControl';
import {buildQueryString,requestJSON} from '../../utils/apiClient';
import {jobText} from '../../constants/freightJobs';
import {shippingText,shippingStatusTone} from '../../constants/shippingRequests';

export const logisticsBoardText={
 ko:{title:'현황판',customer:'고객사',all:'전체 고객',search:'운송번호·고객·화물·비고 검색',shipment:'운송',information:'화물',remark:'비고',status:'상태',delivery:'배송일',empty:'조건에 맞는 운송 업무가 없습니다.',failed:'운송 현황판을 불러오지 못했습니다.',retry:'다시 시도',refresh:'새로고침',open:'운송 업무',IMPORT:'수입',EXPORT:'수출',DOMESTIC:'국내',OTHER:'기타',SEA:'해상',AIR:'항공',ROAD:'육상',EXPRESS:'특송',count:'건'},
 en:{title:'Status Board',customer:'Customer',all:'All Customers',search:'Search Transport, Customer, Cargo Or Remark',shipment:'Shipment',information:'Cargo',remark:'Remark',status:'Status',delivery:'Delivery',empty:'No Transport Jobs Match The Filters.',failed:'Unable To Load The Transport Status Board.',retry:'Retry',refresh:'Refresh',open:'Transport Operations',IMPORT:'Import',EXPORT:'Export',DOMESTIC:'Domestic',OTHER:'Other',SEA:'Sea',AIR:'Air',ROAD:'Road',EXPRESS:'Express',count:'Jobs'},
 vi:{title:'Bảng Tình Hình',customer:'Khách Hàng',all:'Tất Cả Khách Hàng',search:'Tìm Vận Chuyển, Khách Hàng, Hàng Hóa Hoặc Ghi Chú',shipment:'Lô Hàng',information:'Thông Tin Hàng',remark:'Ghi Chú',status:'Trạng Thái',delivery:'Ngày Giao',empty:'Không Có Công Việc Vận Chuyển Phù Hợp.',failed:'Không Thể Tải Bảng Tình Hình Vận Chuyển.',retry:'Thử Lại',refresh:'Làm Mới',open:'Nghiệp Vụ Vận Chuyển',IMPORT:'Nhập Khẩu',EXPORT:'Xuất Khẩu',DOMESTIC:'Nội Địa',OTHER:'Khác',SEA:'Đường Biển',AIR:'Đường Hàng Không',ROAD:'Đường Bộ',EXPRESS:'Chuyển Phát Nhanh',count:'Lô Hàng',actions:rowActionsText.vi},
};
const label=(customer,language)=>customer?.[language==='ko'?'nameKo':language==='vi'?'nameVi':'name']||customer?.name||'—';
const date=value=>value?String(value).slice(0,10):'—';
const amount=value=>value!==null&&value!==''&&Number.isFinite(Number(value))?Number(value).toLocaleString(undefined,{maximumFractionDigits:6}):null;
export const information=row=>{
 const value=(n,u)=>amount(n)!==null?`${amount(n)} ${u}`:'—';
 if(row.service==='EXPRESS'||row.mode==='AIR')return value(row.chargeableWeightKg,'CWT');
 if(row.mode==='ROAD')return value(row.vehicleCount,row.vehicleUnit||'');
 if(row.shipmentType==='LCL')return value(row.cbm,'CBM');
 if(row.containers?.length)return row.containers.map(c=>`${c.count}x${String(c.size).replace(/['′]/g,'')}'${c.type}`).join(', ');
 return row.containerType&&row.containerCount?`${row.containerCount}x${String(row.containerType).replace(/^(20|40|45)['′]?/,"$1'")}`:'—';
};

export default function LogisticsStatusBoard(){const {activeOrgId}=useAuth();return <Board key={activeOrgId} orgId={activeOrgId}/>;}
function Board({orgId}){
 const auth=useAuth(),canOpen=canAccessPath('/shipping',auth);
 const {languageCode}=useLanguage(),t=logisticsBoardText[languageCode]||logisticsBoardText.en,statusText={...(jobText[languageCode]||jobText.en),...(shippingText[languageCode]||shippingText.en)};
 const {navigateToPath}=useAppActions(),{active}=useRequestScopeContext();
 const [search,setSearch]=useState(''),[customerId,setCustomerId]=useState(''),[includeCompleted,setIncludeCompleted]=useState(false),[offset,setOffset]=useState(0),[reload,setReload]=useState(0);
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const requestId=useRef(0),lastAttempt=useRef(0),refresh=useCallback(()=>setReload(v=>v+1),[]);
 useShippingRefresh({orgId,onRefresh:refresh});
 useEffect(()=>{
  if(!active||!orgId)return;const id=++requestId.current;let alive=true;setLoading(true);setError(false);
  const timer=setTimeout(()=>{lastAttempt.current=Date.now();return requestJSON('/logistics-status-reports'+buildQueryString({orgId,search,customerId,includeCompleted,offset}),{skipCache:true})
   .then(value=>{if(alive&&id===requestId.current){if(offset>0&&offset>=value.total){setOffset(Math.max(0,Math.floor((value.total-1)/50)*50));return;}setData(value);}})
   .catch(()=>{if(alive&&id===requestId.current)setError(true);})
   .finally(()=>{if(alive&&id===requestId.current)setLoading(false);});},180);
  return()=>{alive=false;clearTimeout(timer);};
 },[active,orgId,search,customerId,includeCompleted,offset,reload]);
 useEffect(()=>{const onFocus=()=>{if(active&&!loading&&!error&&document.visibilityState==='visible'&&Date.now()-lastAttempt.current>=30000)refresh();};window.addEventListener('focus',onFocus);return()=>window.removeEventListener('focus',onFocus);},[active,loading,error,refresh]);

 const reset=()=>{setSearch('');setCustomerId('');setIncludeCompleted(false);setOffset(0);};
 return <AppPageContainer title={t.title} titleActions={<PageActions><Button startIcon={<RefreshIcon/>} onClick={refresh} disabled={loading}>{t.refresh}</Button></PageActions>}>
  <PageContentStack>
   <SearchPanel search={<SearchInput value={search} onChange={event=>{setSearch(event.target.value);setOffset(0);}} placeholder={t.search}/>}
    filters={<><CompletionFilter include={includeCompleted} onChange={value=>{setIncludeCompleted(value);setOffset(0);}}/><TextField select size="small" label={t.customer} value={customerId} slotProps={{inputLabel:{shrink:true},select:{displayEmpty:true}}} onChange={event=>{setCustomerId(event.target.value);setOffset(0);}}><MenuItem value="">{t.all}</MenuItem>{(data?.customers||[]).map(customer=><MenuItem key={customer.id} value={String(customer.id)}>{label(customer,languageCode)}</MenuItem>)}</TextField></>} onReset={reset}/>
   {error&&<Alert severity="error" action={<Button onClick={refresh}>{t.retry}</Button>}>{t.failed}</Alert>}
   {loading&&<LinearProgress aria-label={t.refresh}/>}
   {!loading&&!error&&data?.rows.length===0&&<Paper variant="outlined" sx={{p:4,textAlign:'center'}}><Typography>{t.empty}</Typography></Paper>}
   <RecordInteractionScope>
   {data?.rows.length>0&&<Box component="section" aria-label={t.title}>
    <TableContainer component={Paper} variant="outlined"><Table size="small" data-table-layout="wide" aria-label={t.title}>
     <TableHead><TableRow>{[t.status,t.customer,'ETD','ETA','DLV',t.information,t.remark].map(title=><TableCell key={title}>{title}</TableCell>)}</TableRow></TableHead>
     <TableBody>{data.rows.map(row=><RecordRow key={row.id} recordKey={row.id} disabled={loading||!canOpen} onOpen={()=>navigateToPath('/shipping/'+encodeURIComponent(row.id))} data-logistics-row={row.id}>
      <TableCell sx={{whiteSpace:'nowrap'}}><StatusLabel label={statusText[row.status==='DRAFT'?'ACCEPTED':row.status]||row.status} tone={shippingStatusTone(row.status)}/></TableCell>
      <TableCell sx={{minWidth:160}}><RecordOpenButton disabled={loading||!canOpen} onOpen={()=>navigateToPath('/shipping/'+encodeURIComponent(row.id))}>{label(row.customer,languageCode)}</RecordOpenButton></TableCell>
      {['etd','eta'].map(key=><TableCell key={key} sx={{whiteSpace:'nowrap'}}>{(row.schedules||[]).map((schedule,index)=><Box key={schedule.id||index}>{date(schedule[key])}{row.schedules.length>1&&<Typography variant="caption" component="div" color="text.secondary">{schedule.number}</Typography>}</Box>)}</TableCell>)}
      <TableCell sx={{whiteSpace:'nowrap'}}>{date(row.deliveryDate)}</TableCell>
      <TableCell sx={{minWidth:140}}>{information({...row,vehicleUnit:languageCode==='ko'?'대':languageCode==='vi'?'Xe':'Vehicles'})}</TableCell>
      <TableCell sx={{minWidth:240,whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{row.remark||'—'}</TableCell>
     </RecordRow>)}</TableBody>
    </Table></TableContainer>
   </Box>}
   </RecordInteractionScope>
   {data&&<ListPagination languageCode={languageCode} previousDisabled={loading||offset===0} nextDisabled={loading||offset+50>=data.total} onPrevious={()=>setOffset(v=>Math.max(0,v-50))} onNext={()=>setOffset(v=>v+50)} leading={<Typography variant="body2">{data.total.toLocaleString()} {t.count}{data.total>0?` · ${offset+1}–${Math.min(offset+50,data.total)}`:''}</Typography>}/>}
  </PageContentStack>
 </AppPageContainer>;
}
