import React from 'react';
import {useLocation} from 'react-router-dom';
import AppPageContainer from '../../components/AppPageContainer';
import BusinessPartners from './BusinessPartners';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {getUiMessage} from '../../constants/uiMessages';
export default function TradePartners({initialType='ALL'}){
 const auth=useAuth(),{languageCode}=useLanguage(),location=useLocation(),requested=location.state?.partnerType||initialType;
 const type=auth.activeProfile?.orgType==='SERVICE'?'LOGISTICS_PROVIDER':['PROCESS_OUTSOURCING','MATERIAL_SUPPLIER','LOGISTICS_PROVIDER'].includes(requested)?requested:'PROCESS_OUTSOURCING';
 return <AppPageContainer title={getUiMessage('menu.partners','Partners',languageCode)}><BusinessPartners key={auth.activeOrgId} embedded unified type={type}/></AppPageContainer>;
}
