import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {useLocation} from 'react-router-dom';
import {Button,Stack,Dialog,DialogTitle,DialogContent,DialogActions,Tooltip} from '@mui/material';
import DeleteActionButton from '../../../components/DeleteActionButton';
import PartnerDirectory from '../../../components/PartnerDirectory';
import NotificationIndicator from '../../../components/NotificationIndicator';
import {getUiMessage} from '../../../constants/uiMessages';
import {useAppActions} from '../../../context/AppContext';
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {buildQueryString,requestJSON} from '../../../utils/apiClient';
import {resolveCustomerDisplayName} from '../../../utils/appLanguage';
import useWorkspaceRefreshOnEvent from '../../../hooks/useWorkspaceRefreshOnEvent';
import {WORKSPACE_DATA_TOPICS,emitWorkspaceDataChanged} from '../../../utils/workspaceDataEvents';
import {combinePhone,resolveCountryForDisplay} from './customerFormShared';

const CustomerList=({embedded=false})=>{
 const {showNotification,navigateToPath}=useAppActions(),{activeOrgId,activeOrgRole,accessProfile}=useAuth(),{languageCode}=useLanguage(),location=useLocation();
 const canDelete=accessProfile?.systemRole==='SYSTEM_ADMIN'||['ADMIN','OPERATOR','ACCOUNTANT'].includes(activeOrgRole);
 const [deleteTarget,setDeleteTarget]=useState(null),[deleting,setDeleting]=useState(false);
 const deletion={ko:{remove:'삭제',confirm:'이 고객사를 삭제하시겠습니까?',help:'업무 이력이 없는 고객사만 삭제할 수 있습니다.',blocked:'사용 이력이 있는 고객사는 삭제할 수 없습니다.',cancel:'취소',failed:'고객사를 삭제하지 못했습니다.'},en:{remove:'Delete',confirm:'Delete this customer?',help:'Only customers without usage history can be deleted.',blocked:'Customers with usage history cannot be deleted.',cancel:'Cancel',failed:'Could not delete the customer.'},vi:{remove:'Xóa',confirm:'Xóa khách hàng này?',help:'Chỉ có thể xóa khách hàng chưa được sử dụng.',blocked:'Không thể xóa khách hàng đã được sử dụng.',cancel:'Hủy',failed:'Không thể xóa khách hàng.'}}[languageCode]||{remove:'Delete',confirm:'Delete this customer?',help:'Only unused customers can be deleted.',blocked:'Customer has usage history.',cancel:'Cancel',failed:'Could not delete the customer.'};
 const [customers,setCustomers]=useState([]),[loading,setLoading]=useState(true),[queryFailed,setQueryFailed]=useState(false);
 const fetchError=getUiMessage('customerBoard.fetchError','Failed to load customers.',languageCode);
 const fetchCustomers=useCallback(async()=>{
  if(!activeOrgId){setCustomers([]);setLoading(false);return;}
  setLoading(true);setQueryFailed(false);
  try{const data=await requestJSON(`/customers${buildQueryString({orgId:activeOrgId})}`,{skipCache:true});setCustomers(Array.isArray(data)?data:[]);}
  catch(error){setQueryFailed(true);showNotification(error?.message||fetchError,'error');}finally{setLoading(false);}
 },[activeOrgId,fetchError,showNotification]);
 useEffect(()=>{fetchCustomers();},[fetchCustomers]);
 const removeCustomer=async()=>{
  if(!deleteTarget||deleting)return;setDeleting(true);
  try{await requestJSON(`/customers/${deleteTarget.id}${buildQueryString({orgId:activeOrgId})}`,{method:'DELETE'});setDeleteTarget(null);emitWorkspaceDataChanged({orgId:activeOrgId,topics:[WORKSPACE_DATA_TOPICS.CUSTOMERS]});await fetchCustomers();}
  catch(error){showNotification(error?.status===409||error?.message?.includes('PARTNER_HAS_TRANSACTION_HISTORY')?deletion.blocked:deletion.failed,'error');setDeleteTarget(null);}
  finally{setDeleting(false);}
 };
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
  renderActions={customer=><><Button variant="contained" onClick={()=>navigateToPath(`/customer-pricing?customerId=${customer.id}`,{label:pricing})}><Stack direction="row" spacing={.75} alignItems="center"><span>{pricing}</span>{Number(customer.missingSalesPriceStyleCount)>0&&<NotificationIndicator/>}</Stack></Button>{canDelete&&<Tooltip title={customer.hasUsageHistory!==false?deletion.blocked:deletion.remove}><span><DeleteActionButton aria-label={deletion.remove} disabled={deleting||customer.hasUsageHistory!==false} onClick={()=>setDeleteTarget(customer)}/></span></Tooltip>}</>}
 ><Dialog open={Boolean(deleteTarget)} onClose={()=>!deleting&&setDeleteTarget(null)}><DialogTitle>{deletion.confirm}</DialogTitle><DialogContent>{resolveCustomerDisplayName(deleteTarget||{},languageCode)}<p>{deletion.help}</p></DialogContent><DialogActions><Button disabled={deleting} onClick={()=>setDeleteTarget(null)}>{deletion.cancel}</Button><Button color="error" disabled={deleting} onClick={removeCustomer}>{deletion.remove}</Button></DialogActions></Dialog></PartnerDirectory>;
};
export default CustomerList;
