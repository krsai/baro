import React from 'react';
import DashboardWidgets from '../../components/DashboardWidgets';
import ApprovalDashboardCard from '../../components/ApprovalDashboardCard';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {canAccessPath} from '../../utils/accessControl';
export default function ServiceDashboard(){
 const auth=useAuth(),{activeOrgId,activeProfile}=auth,{languageCode}=useLanguage(),{navigateToPath,showNotification}=useAppActions();
 const widgets=[
 ...(['ADMIN','ACCOUNTANT','OPERATOR'].includes(activeProfile?.orgRole)&&canAccessPath('/outsourcing-record',auth)?[{id:'approvals',label:({ko:'결재 현황',en:'Approvals',vi:'Phê duyệt'})[languageCode]||'Approvals',content:<ApprovalDashboardCard orgId={activeOrgId} role={activeProfile.orgRole} languageCode={languageCode} onNavigate={navigateToPath}/>}]:[]),
 ];
 return <DashboardWidgets title={({ko:'대시보드',en:'Dashboard',vi:'Bảng điều khiển'})[languageCode]||'Dashboard'} widgets={widgets} companyId={activeOrgId} userId={auth.user?.id||activeProfile?.employeeId} languageCode={languageCode} onSaved={message=>showNotification(message,'success')}/>;
}
