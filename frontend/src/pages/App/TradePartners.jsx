import React,{useCallback,useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import HierarchyPanel from '../../components/HierarchyPanel';
import AppPageContainer from '../../components/AppPageContainer';
import BusinessPartners from './BusinessPartners';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {getUiMessage} from '../../constants/uiMessages';
import {companyIndustryText} from '../../constants/companyIndustries';

export default function TradePartners({initialType='ALL'}){
 const auth=useAuth(),{languageCode}=useLanguage(),location=useLocation();
 const labels=companyIndustryText[languageCode]||companyIndustryText.en;
 const requestedType=location.state?.partnerType||initialType,providerTypes=['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'];
 const [data,setData]=useState({roles:[],rows:[]}),[selected,setSelected]=useState(()=>providerTypes.includes(requestedType)?'SUPPLIER':requestedType);
 const onDirectoryLoaded=useCallback(value=>setData(value),[]);
 useEffect(()=>{setData({roles:[],rows:[]});},[auth.activeOrgId]);
 useEffect(()=>{if(!['ALL','CUSTOMER','SUPPLIER'].includes(selected))setSelected('ALL');},[selected]);
 useEffect(()=>{if(location.state?.partnerType)setSelected(providerTypes.includes(location.state.partnerType)?'SUPPLIER':location.state.partnerType);},[location.key]);
 const items=[{id:'ALL',label:labels.all,count:data.rows.length},...['CUSTOMER','SUPPLIER'].map(role=>({id:role,label:labels[role],count:data.rows.filter(row=>row.relationshipRoles?.includes(role)).length}))];
 const initialPartnerType=auth.activeProfile?.orgType==='SERVICE'?'LOGISTICS_PROVIDER':providerTypes.includes(requestedType)?requestedType:'PROCESS_OUTSOURCING';
 return <AppPageContainer title={getUiMessage('menu.partners','Partners',languageCode)}>
  <HierarchyPanel label={labels.relationship} items={items} selectedId={selected} onSelect={setSelected}>
   <BusinessPartners key={auth.activeOrgId} embedded unified relationship={selected==='ALL'?null:selected} type={initialPartnerType} onDirectoryLoaded={onDirectoryLoaded}/>
  </HierarchyPanel>
 </AppPageContainer>;
}
