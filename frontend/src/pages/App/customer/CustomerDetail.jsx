import React from 'react';
import {useLocation,useParams} from 'react-router-dom';
import BusinessPartnerDialog from '../../../components/BusinessPartnerDialog';
import AppPageContainer from '../../../components/AppPageContainer';
import {useAppActions} from '../../../context/AppContext';
import {useAuth} from '../../../context/AuthContext';
import {useLanguage} from '../../../context/LanguageContext';
import {getUiMessage} from '../../../constants/uiMessages';

// Keep bookmarked relationship URLs, while using the same editor as every
// partner menu and expense lookup. Relationship IDs never become entity IDs.
export default function CustomerDetail(){
 const {customerId}=useParams(),location=useLocation(),{activeOrgId}=useAuth(),{languageCode}=useLanguage(),{navigateToPath}=useAppActions();
 const isNew=!customerId||customerId==='new';
 const close=()=>navigateToPath('/customer',{closeTabId:location.pathname,skipUnsavedChangesCheck:true});
 return <AppPageContainer title={getUiMessage('menu.partners','Partners',languageCode)}><BusinessPartnerDialog open activeOrgId={activeOrgId} languageCode={languageCode} relationshipId={isNew?undefined:customerId} onClose={close}/></AppPageContainer>;
}
