import React, { useEffect, useState } from 'react';
import {Alert,Box,Button,Checkbox,Typography} from '@mui/material';
import AppPageContainer from '../../../components/AppPageContainer';
import SearchableSelect from '../../../components/SearchableSelect';
import { useAuth } from '../../../context/AuthContext';
import { useAppActions } from '../../../context/AppContext';
import { useLanguage } from '../../../context/LanguageContext';
import { requestJSON, buildQueryString } from '../../../utils/apiClient';
import { invoiceMessages } from '../../../constants/invoiceMessages';
import InvoiceEditor from './InvoiceEditor';
import InvoiceList from './InvoiceList';
import {useLocation} from 'react-router-dom';

export default function InvoiceWorkspace({ view = 'list' } = {}) {
  const { activeOrgId } = useAuth();
  return <InvoiceMenuWorkspace key={activeOrgId || 'none'} activeOrgId={activeOrgId} view={view} />;
}

function InvoiceMenuWorkspace({ activeOrgId, view = 'list' }) {
  const { navigateToPath } = useAppActions();
  const { languageCode } = useLanguage();
  const t = invoiceMessages[languageCode] || invoiceMessages.en;
  if (view === 'editor') {
    return <InvoiceCustomerWorkspace activeOrgId={activeOrgId} onBack={() => navigateToPath('/invoices')} />;
  }
  return <AppPageContainer title={t.title} titleActions={<Button variant="contained" disabled={!activeOrgId} onClick={() => navigateToPath('/invoices/new')}>{t.newInvoice}</Button>}>
    <InvoiceList orgId={activeOrgId} languageCode={languageCode}/>
  </AppPageContainer>;
}

function InvoiceCustomerWorkspace({ activeOrgId, onBack }) {
  const location=useLocation(),revisionId=new URLSearchParams(location.search).get('revision');
  const {languageCode}=useLanguage(),t=invoiceMessages[languageCode]||invoiceMessages.en;
  const [customers,setCustomers]=useState([]),[customer,setCustomer]=useState(null),[customersLoading,setCustomersLoading]=useState(false),[customersError,setCustomersError]=useState(false);
  const [orders,setOrders]=useState([]),[chosen,setChosen]=useState([]),[search,setSearch]=useState(''),[page,setPage]=useState(0),[hasMore,setHasMore]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(false),[reload,setReload]=useState(0);
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
      <SearchableSelect multiple disableCloseOnSelect limitTags={2} label={t.orders} options={[...new Map([...chosen,...orders].map(order=>[order.orderId,order])).values()]} value={chosen} disabled={disabled||!customer} loading={loading} autoSelect={false}
        filterOptions={options=>options.filter(option=>orders.some(order=>order.orderId===option.orderId))} isOptionEqualToValue={(option,value)=>option.orderId===value.orderId} getOptionLabel={option=>option.orderNumber||option.orderId}
        onInputChange={(_event,value,reason)=>{if(reason==='input'||reason==='clear'){setSearch(value);setPage(0);}}}
        onChange={(_event,value)=>requestChange(()=>{setChosen(value);setSearch('');setPage(0);})}
        renderOption={(props,order,{selected})=>{const {key,...rest}=props;return <li key={key} {...rest}><Checkbox size="small" checked={selected} sx={{mr:1,p:.5}}/><Box sx={{flex:1}}><Typography variant="body2">{order.orderNumber}</Typography><Typography variant="caption" color="text.secondary">{order.totalQuantity??'-'} pcs{order.progressPercent==null?'':` ? ${order.progressPercent.toFixed(1)}%`}</Typography></Box></li>;}}
        slotProps={{listbox:{style:{maxHeight:280},onScroll:event=>{const node=event.currentTarget;if(hasMore&&!pendingOrders.current&&node.scrollTop+node.clientHeight>=node.scrollHeight-24){pendingOrders.current=true;setPage(value=>value+1);}}}}}/>
    </Box>
    {(customersError||error)&&<Alert severity="error" action={<Button onClick={()=>setReload(value=>value+1)}>{t.retry}</Button>}>{customersError?t.customersFailed:t.failed}</Alert>}
  </>;
  return <InvoiceEditor key={activeOrgId} orgId={activeOrgId} buyerOrgId={customer?.id} orderIds={orderIds} draftId={revisionId} languageCode={languageCode} onClose={onBack} onIssued={onBack} renderSelection={revisionId?null:renderSelection}/>;
}
