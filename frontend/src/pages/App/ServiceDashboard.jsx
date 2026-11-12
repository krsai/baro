import AccountingAlerts from '../../components/AccountingAlerts';
import DashboardAlertsCard from '../../components/DashboardAlertsCard';
import {accountingAlertText} from '../../constants/accountingAlerts';
import {dashboardAlertText} from '../../constants/dashboardAlerts';
import WorkRequestsCard from '../../components/WorkRequestsCard';
import {workRequestText} from '../../constants/dashboardWorkRequests';
import React from 'react';
import DashboardWidgets from '../../components/DashboardWidgets';
import ApprovalDashboardCard from '../../components/ApprovalDashboardCard';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import {useAppActions} from '../../context/AppContext';
import {canAccessPath} from '../../utils/accessControl';
export default function ServiceDashboard(){
 const auth=useAuth(),{activeOrgId,activeProfile}=auth,{languageCode}=useLanguage(),{navigateToPath,showNotification}=useAppActions();
 const accountingText=accountingAlertText[languageCode]||accountingAlertText.en,a=dashboardAlertText[languageCode]||dashboardAlertText.en;
 const widgets=[
 ...(canAccessPath('/bank-ledger',auth)||canAccessPath('/outsourcing-record',auth)||canAccessPath('/invoices',auth)?[{id:'notifications',defaultTag:'accounting-notifications-v1',label:a.notifications,options:[{id:'accounting-direction',label:accountingText.DIRECTION},{id:'accounting-partner',label:accountingText.PARTNER_INDUSTRY}],content:({settings})=><DashboardAlertsCard languageCode={languageCode} title={a.notifications} text={a} items={[]}><AccountingAlerts key={activeOrgId} orgId={activeOrgId} languageCode={languageCode} onNavigate={navigateToPath} settings={settings} showEmpty/></DashboardAlertsCard>}]:[]),
 {id:"work-requests",newDefault:true,label:(workRequestText[languageCode]||workRequestText.en).title,content:<WorkRequestsCard key={activeOrgId+":"+activeProfile?.employeeId} orgId={activeOrgId} languageCode={languageCode}/>},
 ...(['ADMIN','ACCOUNTANT','OPERATOR'].includes(activeProfile?.orgRole)&&canAccessPath('/outsourcing-record',auth)?[{id:'approvals',label:({ko:'결재 현황',en:'Approvals',vi:'Phê duyệt'})[languageCode]||'Approvals',content:<ApprovalDashboardCard orgId={activeOrgId} role={activeProfile.orgRole} languageCode={languageCode} onNavigate={navigateToPath}/>}]:[]),
 ];
 return <DashboardWidgets title={({ko:'대시보드',en:'Dashboard',vi:'Bảng điều khiển'})[languageCode]||'Dashboard'} widgets={widgets} companyId={activeOrgId} userId={auth.user?.id||activeProfile?.employeeId} languageCode={languageCode} onSaved={message=>showNotification(message,'success')}/>;
}
