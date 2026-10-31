import {invoiceDetailText} from '../../../constants/invoiceDetail';
import React, { useEffect, useState } from 'react';
import {Alert,Box,Button,Checkbox,Typography,Dialog,DialogTitle,DialogContent,DialogActions,TextField,Stack} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchableSelect from '../../../components/SearchableSelect';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import InvoiceEditor from './InvoiceEditor';
import InvoiceList from './InvoiceList';
import {useLocation,useParams} from 'react-router-dom';

export default function InvoiceWorkspace({ view = 'list' } = {}) {
  const { activeOrgId } = useAuth();
  return <InvoiceMenuWorkspace key={activeOrgId || 'none'} activeOrgId={activeOrgId} view={view} />;
}

function InvoiceMenuWorkspace({ activeOrgId, view = 'list' }) {
  const { navigateToPath } = useAppActions();
  const { languageCode } = useLanguage();
  const t = invoiceMessages[languageCode] || invoiceMessages.en;
  const {invoiceId}=useParams();
  if (view === 'editor') {
    return <InvoiceCustomerWorkspace activeOrgId={activeOrgId} onBack={() => navigateToPath('/invoices')} />;
  }
  if(view==='detail')return <AppPageContainer title={(invoiceDetailText[languageCode]||invoiceDetailText.en).title}><InvoiceList orgId={activeOrgId} languageCode={languageCode} invoiceId={invoiceId}/></AppPageContainer>;
  return <AppPageContainer title={t.title} titleActions={<Button variant="contained" disabled={!activeOrgId} onClick={() => navigateToPath('/invoices/new')}>{t.newInvoice}</Button>}>
    <InvoiceList orgId={activeOrgId} languageCode={languageCode}/>
  </AppPageContainer>;
}

function InvoiceCustomerWorkspace({ activeOrgId, onBack }) {
  const location=useLocation(),revisionId=new URLSearchParams(location.search).get('revision');
  const {languageCode}=useLanguage(),t=invoiceMessages[languageCode]||invoiceMessages.en;
  const [customers,setCustomers]=useState([]),[customer,setCustomer]=useState(null),[customersLoading,setCustomersLoading]=useState(false),[customersError,setCustomersError]=useState(false);
  const [orders,setOrders]=useState([]),[chosen,setChosen]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
  const [orderModal,setOrderModal]=useState(false),[pendingChosen,setPendingChosen]=useState([]);
  const rateText=languageCode==='ko'?{progress:'진행률',billing:'청구율'}:languageCode==='vi'?{progress:'Tiến độ',billing:'Tỷ lệ lập hóa đơn'}:{progress:'Progress',billing:'Billing rate'};
  const modalText=languageCode==='ko'?{apply:'선택 적용',cancel:'취소',oldest:'오래된 주문부터 표시'}:languageCode==='vi'?{apply:'Áp dụng',cancel:'Hủy',oldest:'Đơn hàng cũ nhất trước'}:{apply:'Apply selection',cancel:'Cancel',oldest:'Oldest orders first'};
  const pendingOrders=React.useRef(false);
  const orderIds=React.useMemo(()=>chosen.map(order=>order.orderId),[chosen]);
  useEffect(()=>{
    if(!activeOrgId||revisionId)return;
    let cancelled=false;setCustomersLoading(true);setCustomersError(false);
    requestJSON(`/invoices/customers${buildQueryString({orgId:activeOrgId})}`,{skipCache:true})
      .then(data=>{if(!cancelled)setCustomers(data.rows);}).catch(()=>{if(!cancelled)setCustomersError(true);}).finally(()=>{if(!cancelled)setCustomersLoading(false);});
    return ()=>{cancelled=true;};
  },[activeOrgId,revisionId,reload]);
  useEffect(()=>{
    if(!customer||revisionId){setOrders([]);setLoading(false);pendingOrders.current=false;return;}
    let cancelled=false;setLoading(true);pendingOrders.current=true;setError(false);if(!page)setOrders([]);
    const timer=setTimeout(()=>requestJSON(`/invoices/orders${buildQueryString({orgId:activeOrgId,buyerOrgId:customer.id,search,page})}`,{skipCache:true})
      .then(data=>{if(!cancelled){setOrders(previous=>page?[...new Map([...previous,...data.rows].map(order=>[order.orderId,order])).values()]:data.rows);setHasMore(data.hasMore);}})
      .catch(()=>{if(!cancelled)setError(true);}).finally(()=>{if(!cancelled){setLoading(false);pendingOrders.current=false;}}),200);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[activeOrgId,customer,search,page,revisionId,reload]);
  const renderSelection=({requestChange,disabled})=><>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'minmax(220px,1fr) minmax(0,2fr)'},gap:2}}>
      <SearchableSelect label={t.customer} options={customers} value={customer} loading={customersLoading} disabled={disabled||!activeOrgId} autoSelect={false}
        isOptionEqualToValue={(option,value)=>option.id===value.id} getOptionLabel={option=>(languageCode==='ko'?option.nameKo:languageCode==='vi'?option.nameVi:option.name)||option.name||''} noOptionsText={t.noCustomers}
        onChange={(_event,value)=>{if((value?.id??null)===(customer?.id??null))return;requestChange(()=>{setCustomer(value);setChosen([]);setOrders([]);setSearch('');setPage(0);setHasMore(false);setError(false);});}}/>
      <Button variant="outlined" disabled={disabled||!customer} onClick={()=>{setPendingChosen(chosen);setOrderModal(true);setSearch('');setPage(0);}}>{t.orders}{chosen.length ? ': '+chosen.map(order=>order.orderNumber).join(', ') : ''}</Button>
      <Dialog open={orderModal} onClose={()=>setOrderModal(false)} fullWidth maxWidth="md">
        <DialogTitle>{t.orders}<Typography variant="caption" display="block">{modalText.oldest}</Typography></DialogTitle>
        <DialogContent dividers>
          <TextField fullWidth size="small" label={t.search} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} sx={{mb:2}}/>
          <Stack spacing={1}>{orders.map(order=>{const selected=pendingChosen.some(row=>row.orderId===order.orderId);return <Button key={order.orderId} variant={selected?'contained':'outlined'} aria-pressed={selected} onClick={()=>setPendingChosen(rows=>selected?rows.filter(row=>row.orderId!==order.orderId):[...rows,order])} sx={{justifyContent:'flex-start',gap:1,flexWrap:'wrap'}}><Checkbox checked={selected} tabIndex={-1} sx={{color:'inherit','&.Mui-checked':{color:'inherit'}}}/>{order.orderNumber} / {order.totalQuantity??'-'} PCS<Box component="span" sx={{ml:'auto',fontWeight:400}}>{rateText.progress} {order.progressPercent==null?'—':`${order.progressPercent}%`} · {rateText.billing} {order.billingPercent??0}%</Box></Button>;})}</Stack>
          {!loading&&!orders.length&&<Typography>{t.empty}</Typography>}
          {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>}
          {hasMore&&<Button disabled={loading} onClick={()=>setPage(value=>value+1)}>{t.next}</Button>}
        </DialogContent>
        <DialogActions><Button onClick={()=>setOrderModal(false)}>{modalText.cancel}</Button><Button disabled={disabled} onClick={()=>{if(chosen.length===pendingChosen.length&&chosen.every(order=>pendingChosen.some(row=>row.orderId===order.orderId))){setOrderModal(false);return;}requestChange(()=>{setChosen(pendingChosen);setOrderModal(false);});}}>{modalText.apply}</Button></DialogActions>
      </Dialog>
    </Box>
    {(customersError||error)&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{customersError?t.customersFailed:t.failed}</Alert>}
  </>;
  return <InvoiceEditor key={activeOrgId} orgId={activeOrgId} buyerOrgId={customer?.id} orderIds={orderIds} draftId={revisionId} languageCode={languageCode} onClose={onBack} onIssued={onBack} renderSelection={revisionId?null:renderSelection}/>;
}
