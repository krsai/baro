import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Button,Stack} from '@mui/material';
import PartnerDirectory from '../../../components/PartnerDirectory';
import NotificationIndicator from '../../../components/NotificationIndicator';
import {getUiMessage} from '../../../constants/uiMessages';
import {useAppActions} from '../../../context/AppContext';
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {buildQueryString,requestJSON} from '../../../utils/apiClient';
import {resolveCustomerDisplayName} from '../../../utils/appLanguage';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import {WORKSPACE_DATA_TOPICS} from '../../../utils/workspaceDataEvents';
import {combinePhone,resolveCountryForDisplay} from './customerFormShared';

const CustomerList=({embedded=false})=>{
 const {showNotification,navigateToPath}=useAppActions(),{activeOrgId}=useAuth(),{languageCode}=useLanguage(),location=useLocation();
 const [customers,setCustomers]=useState([]),[loading,setLoading]=useState(true),[queryFailed,setQueryFailed]=useState(false);
 const fetchError=getUiMessage('customerBoard.fetchError','Failed to load customers.',languageCode);
 const fetchCustomers=useCallback(async()=>{
  if(!activeOrgId){setCustomers([]);setLoading(false);return;}
  setLoading(true);setQueryFailed(false);
  try{const data=await requestJSON(`/customers${buildQueryString({orgId:activeOrgId})}`,{skipCache:true});setCustomers(Array.isArray(data)?data:[]);}
  catch(error){setQueryFailed(true);showNotification(error?.message||fetchError,'error');}finally{setLoading(false);}
 },[activeOrgId,fetchError,showNotification]);
 useEffect(()=>{fetchCustomers();},[fetchCustomers]);
 useWorkspaceRefreshOnEvent({orgId:activeOrgId,topics:[WORKSPACE_DATA_TOPICS.SALES_PRICES,WORKSPACE_DATA_TOPICS.STYLES,WORKSPACE_DATA_TOPICS.CUSTOMERS],isActive:embedded||location.pathname==='/customer',onRefresh:fetchCustomers});
 const pricing={ko:'단가',en:'Pricing',vi:'Đơn giá'}[languageCode]||'Pricing';
 const rows=useMemo(()=>customers.map(customer=>({
  id:customer.id,source:customer,code:customer.code,name:resolveCustomerDisplayName(customer,languageCode),country:resolveCountryForDisplay(customer),
  contactName:customer.manager,phone:customer.phoneNumber?customer.phone||combinePhone(customer.countryCode,customer.phoneNumber):'',email:customer.email,
  registeredAt:customer.registeredAt,isActive:customer.isActive!==false,
  attentionLabel:Number(customer.missingSalesPriceStyleCount)>0?pricing:null,
  searchText:[customer.name,customer.nameKo,customer.nameVi,customer.address].filter(Boolean).join(' '),
 })),[customers,languageCode,pricing]);
 const openDetail=customer=>navigateToPath(`/customer/${customer.id}`,{label:`${getUiMessage('menu.customer','Customer',languageCode)}: ${resolveCustomerDisplayName(customer,languageCode)||customer.code||'-'}`});
 return <PartnerDirectory embedded={embedded} title={getUiMessage('menu.customer','Customers',languageCode)} languageCode={languageCode} rows={rows} loading={loading} error={queryFailed} onRetry={fetchCustomers}
  onAdd={()=>navigateToPath('/customer/new',{label:getUiMessage('customerBoard.addCustomer','Add customer',languageCode)})} onOpen={openDetail}
  renderActions={customer=><Button variant="contained" onClick={()=>navigateToPath(`/customer-pricing?customerId=${customer.id}`,{label:pricing})}><Stack direction="row" spacing={.75} alignItems="center"><span>{pricing}</span>{Number(customer.missingSalesPriceStyleCount)>0&&<NotificationIndicator/>}</Stack></Button>}
 />;
};
export default CustomerList;
