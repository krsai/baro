import React from 'react';
import {Box} from '@mui/material';
import AppPageContainer from '../../components/AppPageContainer';
import ApprovalDashboardCard from '../../components/ApprovalDashboardCard';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {canAccessPath} from '../../utils/accessControl';
export default function ServiceDashboard(){
 const auth=useAuth(),{activeOrgId,activeProfile}=auth,{languageCode}=useLanguage(),{navigateToPath}=useAppActions();
 return <AppPageContainer title={({ko:'대시보드',en:'Dashboard',vi:'Bảng điều khiển'})[languageCode]||'Dashboard'}><Box sx={{display:'grid',gridTemplateColumns:'minmax(0,1fr)',gap:2}}>
 {['ADMIN','ACCOUNTANT','OPERATOR'].includes(activeProfile?.orgRole)&&canAccessPath('/outsourcing-record',auth)&&<ApprovalDashboardCard orgId={activeOrgId} role={activeProfile.orgRole} languageCode={languageCode} onNavigate={navigateToPath}/>}
 </Box></AppPageContainer>;
}
