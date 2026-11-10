import {invoiceNumber} from '../../../utils/invoiceStyleRows.mjs';
import React, { useEffect, useState } from 'react';
import {Alert,Box,Button,Checkbox,Typography,Dialog,DialogTitle,DialogContent,DialogActions,TextField,Stack} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import InvoicePartyPicker from '../../../components/InvoicePartyPicker';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import InvoiceEditor from './InvoiceEditor';
import GeneralInvoiceEditor from './GeneralInvoiceEditor';
import {generalInvoiceText} from '../../../constants/generalInvoice';
import {MenuItem} from '@mui/material';
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
  if(view==='detail')return <InvoiceList key={invoiceId} orgId={activeOrgId} languageCode={languageCode} invoiceId={invoiceId}/>;
  return <AppPageContainer title={t.title} titleActions={<Button variant="contained" disabled={!activeOrgId} onClick={() => navigateToPath('/invoices/new')}>{t.newInvoice}</Button>}>
    <InvoiceList orgId={activeOrgId} languageCode={languageCode}/>
  </AppPageContainer>;
}

function InvoiceCustomerWorkspace({ activeOrgId, onBack }) {
  const {activeProfile}=useAuth();
  const service=activeProfile?.orgType==='SERVICE';
  const [documentKind,setDocumentKind]=useState(service?'GENERAL':'ORDER');
  const location=useLocation(),revisionId=new URLSearchParams(location.search).get('revision');
  const {languageCode}=useLanguage(),t=invoiceMessages[languageCode]||invoiceMessages.en;
  const general=generalInvoiceText[languageCode]||generalInvoiceText.en;
  const [customers,setCustomers]=useState([]),[customer,setCustomer]=useState(null),[customersLoading,setCustomersLoading]=useState(false),[customersError,setCustomersError]=useState(false);
  const [orders,setOrders]=useState([]),[chosen,setChosen]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
  const [orderModal,setOrderModal]=useState(false),[pendingChosen,setPendingChosen]=useState([]);
  const rateText=languageCode==='ko'?{progress:'진행률',billing:'청구율'}:languageCode==='vi'?{progress:'Tiến độ',billing:'Tỷ lệ lập hóa đơn'}:{progress:'Progress',billing:'Billing rate'};
  const modalText=languageCode==='ko'?{apply:'선택 적용',cancel:'취소',oldest:'오래된 주문부터 표시'}:languageCode==='vi'?{apply:'Áp dụng',cancel:'Hủy',oldest:'Đơn hàng cũ nhất trước'}:{apply:'Apply selection',cancel:'Cancel',oldest:'Oldest orders first'};
  const pendingOrders=React.useRef(false);
  const [resumeKind,setResumeKind]=useState(null),[resumeError,setResumeError]=useState(false);
  useEffect(()=>{
    if(!revisionId)return;let alive=true;setResumeKind(null);setResumeError(false);
    requestJSON('/invoices/drafts/'+encodeURIComponent(revisionId)+buildQueryString({orgId:activeOrgId}),{skipCache:true}).then(row=>{if(alive)setResumeKind(row.content?.documentKind||'ORDER');}).catch(()=>{if(alive)setResumeError(true);});
    return()=>{alive=false;};
  },[activeOrgId,revisionId,reload]);
  const orderIds=React.useMemo(()=>chosen.map(order=>order.orderId),[chosen]);
  useEffect(()=>{
    if(!activeOrgId||revisionId)return;
    let cancelled=false;setCustomersLoading(true);setCustomersError(false);
    requestJSON(`/invoices/customers${buildQueryString({orgId:activeOrgId,documentKind})}`,{skipCache:true})
      .then(data=>{if(!cancelled)setCustomers(data.rows);}).catch(()=>{if(!cancelled)setCustomersError(true);}).finally(()=>{if(!cancelled)setCustomersLoading(false);});
    return ()=>{cancelled=true;};
  },[activeOrgId,revisionId,reload,documentKind]);
  useEffect(()=>{
    if(!customer||revisionId||documentKind==='GENERAL'){setOrders([]);setLoading(false);pendingOrders.current=false;return;}
    let cancelled=false;setLoading(true);pendingOrders.current=true;setError(false);if(!page)setOrders([]);
    const timer=setTimeout(()=>requestJSON(`/invoices/orders${buildQueryString({orgId:activeOrgId,buyerOrgId:customer.id,search,page})}`,{skipCache:true})
      .then(data=>{if(!cancelled){setOrders(previous=>page?[...new Map([...previous,...data.rows].map(order=>[order.orderId,order])).values()]:data.rows);setHasMore(data.hasMore);}})
      .catch(()=>{if(!cancelled)setError(true);}).finally(()=>{if(!cancelled){setLoading(false);pendingOrders.current=false;}}),200);
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[activeOrgId,customer,search,page,revisionId,reload,documentKind]);
  const renderSelection=({requestChange,disabled})=><>
    <TextField select size="small" sx={{width:220,mb:2}} label={general.type} value={documentKind} disabled={disabled} onChange={event=>requestChange(()=>{setDocumentKind(event.target.value);setCustomer(null);setChosen([]);setOrders([]);setCustomers([]);})}><MenuItem value="ORDER" disabled={service}>{general.order}</MenuItem><MenuItem value="GENERAL">{general.general}</MenuItem></TextField>
    <Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',md:'minmax(220px,1fr) minmax(0,2fr)'},gap:2}}>
      <InvoicePartyPicker orgId={activeOrgId} languageCode={languageCode} options={customers} value={customer} disabled={disabled||customersLoading||customersError||!activeOrgId} onChange={value=>{if((value?.id??null)===(customer?.id??null))return;requestChange(()=>{setCustomer(value);setChosen([]);setOrders([]);setSearch('');setPage(0);setHasMore(false);setError(false);});}}/>
      {documentKind==='ORDER'&&<Button variant="outlined" disabled={disabled||!customer} onClick={()=>{setPendingChosen(chosen);setOrderModal(true);setSearch('');setPage(0);}}>{t.orders}{chosen.length ? ': '+chosen.map(order=>order.orderNumber).join(', ') : ''}</Button>}
      <Dialog open={orderModal} onClose={()=>setOrderModal(false)} fullWidth maxWidth="md">
        <DialogTitle>{t.orders}</DialogTitle>
        <DialogContent dividers>
          <TextField fullWidth size="small" label={t.search} value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} sx={{mb:2}}/>
          <Stack spacing={1}>{orders.map(order=>{const selected=pendingChosen.some(row=>row.orderId===order.orderId);return <Button key={order.orderId} variant={selected?'contained':'outlined'} aria-pressed={selected} onClick={()=>setPendingChosen(rows=>selected?rows.filter(row=>row.orderId!==order.orderId):[...rows,order])} sx={{justifyContent:'flex-start',gap:1,flexWrap:'wrap'}}><Checkbox checked={selected} tabIndex={-1} sx={{color:'inherit','&.Mui-checked':{color:'inherit'}}}/>{order.orderNumber} / {invoiceNumber(order.totalQuantity)} PCS<Box component="span" sx={{ml:'auto',fontWeight:400}}>{rateText.progress} {order.progressPercent==null?'—':`${order.progressPercent}%`} · {rateText.billing} {order.billingPercent??0}%</Box></Button>;})}</Stack>
          {!loading&&!orders.length&&<Typography>{t.empty}</Typography>}
          {error&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>}
          {hasMore&&<Button disabled={loading} onClick={()=>setPage(value=>value+1)}>{t.next}</Button>}
        </DialogContent>
        <DialogActions><Button onClick={()=>setOrderModal(false)}>{modalText.cancel}</Button><Button disabled={disabled} onClick={()=>{if(chosen.length===pendingChosen.length&&chosen.every(order=>pendingChosen.some(row=>row.orderId===order.orderId))){setOrderModal(false);return;}requestChange(()=>{setChosen(pendingChosen);setOrderModal(false);});}}>{modalText.apply}</Button></DialogActions>
      </Dialog>
    </Box>
    {(customersError||error)&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{customersError?t.customersFailed:t.failed}</Alert>}
  </>;
  if(revisionId&&!resumeKind)return <AppPageContainer title={t.title}>{resumeError?<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{t.failed}</Alert>:<Typography>{t.loading||'…'}</Typography>}</AppPageContainer>;
  const Editor=(revisionId?resumeKind:documentKind)==='GENERAL'?GeneralInvoiceEditor:InvoiceEditor;
  return <Editor key={activeOrgId+':'+documentKind} orgId={activeOrgId} buyerOrgId={customer?.id} orderIds={orderIds} draftId={revisionId} languageCode={languageCode} onClose={onBack} onIssued={onBack} renderSelection={revisionId?null:renderSelection}/>;
}
