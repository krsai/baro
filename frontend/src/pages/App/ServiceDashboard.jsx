import React from 'react';
import {Box} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import ApprovalDashboardCard from '../../components/ApprovalDashboardCard';
import LedgerChangesDashboardCard from '../../components/LedgerChangesDashboardCard';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {canAccessPath} from '../../utils/accessControl';
export default function ServiceDashboard(){
 const auth=useAuth(),{activeOrgId,activeProfile}=auth,{languageCode}=useLanguage(),{navigateToPath}=useAppActions();
 return <AppPageContainer title={({ko:'대시보드',en:'Dashboard',vi:'Bảng điều khiển'})[languageCode]||'Dashboard'}><Box sx={{display:'grid',gridTemplateColumns:{xs:'minmax(0,1fr)',lg:'repeat(2,minmax(0,1fr))'},gap:2}}>
 {['ADMIN','ACCOUNTANT','OPERATOR'].includes(activeProfile?.orgRole)&&canAccessPath('/outsourcing-record',auth)&&<ApprovalDashboardCard orgId={activeOrgId} role={activeProfile.orgRole} languageCode={languageCode} onNavigate={navigateToPath}/>}
 {['ADMIN','ACCOUNTANT'].includes(activeProfile?.orgRole)&&canAccessPath('/bank-ledger',auth)&&<LedgerChangesDashboardCard key={activeOrgId} orgId={activeOrgId} languageCode={languageCode}/>}
 </Box></AppPageContainer>;
}
