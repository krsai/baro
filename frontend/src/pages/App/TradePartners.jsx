import React,{useCallback,useEffect,useState} from 'react';
import {useLocation} from 'react-router-dom';
import HierarchyPanel from '../../components/HierarchyPanel';
import AppPageContainer from '../../components/AppPageContainer';
import BusinessPartners from './BusinessPartners';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {getUiMessage} from '../../constants/uiMessages';
import {classificationName} from '../../utils/partnerClassification.mjs';

export default function TradePartners({initialType='ALL'}){
 const auth=useAuth(),{languageCode}=useLanguage(),location=useLocation();
 const labels={ko:{type:'거래처 구분',all:'전체 거래처'},en:{type:'Partner category',all:'All partners'},vi:{type:'Nhóm đối tác',all:'Tất cả đối tác'}}[languageCode]||{type:'Partner category',all:'All partners'};
 const [data,setData]=useState({roles:[],rows:[]}),[selected,setSelected]=useState(()=>location.state?.partnerType||initialType);
 const onDirectoryLoaded=useCallback(value=>setData(value),[]);
 useEffect(()=>{setData({roles:[],rows:[]});},[auth.activeOrgId]);
 useEffect(()=>{if(location.state?.partnerType)setSelected(location.state.partnerType);},[location.key]);
 const current=data.roles.find(role=>role.code===selected);
 const items=[{id:'ALL',label:labels.all,count:data.rows.length},...data.roles.map(role=>({id:role.code,label:classificationName(role,languageCode),count:data.rows.filter(row=>row.classification.roleIds.includes(role.id)).length}))];
 const initialPartnerType=['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'].includes(selected)?selected:'PROCESS_OUTSOURCING';
 return <AppPageContainer title={getUiMessage('menu.partners','Partners',languageCode)}>
  <HierarchyPanel label={labels.type} items={items} selectedId={selected} onSelect={setSelected}>
   <BusinessPartners key={auth.activeOrgId} embedded unified category={selected==='ALL'?null:current?.id??-1} type={initialPartnerType} onDirectoryLoaded={onDirectoryLoaded}/>
  </HierarchyPanel>
 </AppPageContainer>;
}
