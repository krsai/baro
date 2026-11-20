import {canAccessPath} from '../../utils/accessControl';
import InventoryBalanceAlerts from '../../components/InventoryBalanceAlerts';
import {inventoryBalanceText} from '../../constants/inventoryBalanceAlerts';
import {canShowAccountingAlerts,canShowApprovals,canShowInventoryAlerts} from '../../utils/dashboardAccess.mjs';
import AccountingAlerts from '../../components/AccountingAlerts';
import DashboardAlertsCard from '../../components/DashboardAlertsCard';
import {accountingAlertOptions} from '../../constants/accountingAlerts';
import {dashboardAlertText} from '../../constants/dashboardAlerts';
import WorkRequestsCard from '../../components/WorkRequestsCard';
import {workRequestText} from '../../constants/dashboardWorkRequests';
import React from 'react';
import DashboardWidgets from '../../components/DashboardWidgets';
import DashboardRecipientSettings from '../../components/DashboardRecipientSettings';
import useAccountingAlertVisibility from '../../hooks/useAccountingAlertVisibility';
import {dashboardRole} from '../../utils/dashboardAccess.mjs';
import ApprovalDashboardCard from '../../components/ApprovalDashboardCard';
import {useAuth} from '../../context/AuthContext';
import {useLanguage} from '../../context/LanguageContext';
import QueryFeedback from '../../components/QueryFeedback';
import {useAppActions} from '../../context/AppContext';
export default function ServiceDashboard(){
 const auth=useAuth(),{activeOrgId,activeProfile}=auth,{languageCode}=useLanguage(),{navigateToPath,showNotification}=useAppActions();
 const a=dashboardAlertText[languageCode]||dashboardAlertText.en;
 const [companyWidget,setCompanyWidget]=React.useState(null),alertVisibility=useAccountingAlertVisibility(auth),canManageRecipients=dashboardRole(auth)==='ADMIN';
 const showInventoryAlerts=canShowInventoryAlerts(auth);
 const widgets=[
 ...(alertVisibility.show?[{id:'notifications',defaultTag:'accounting-notifications-v1',label:a.notifications,options:canShowAccountingAlerts(auth)?accountingAlertOptions(languageCode):[],content:({settings})=><DashboardAlertsCard languageCode={languageCode} title={a.notifications} text={a} items={[]}><AccountingAlerts key={activeOrgId} orgId={activeOrgId} languageCode={languageCode} onNavigate={navigateToPath} settings={settings} showEmpty/></DashboardAlertsCard>}]:[]),
 ...((alertVisibility.showUncoded||showInventoryAlerts)?[{id:'suspected-errors',defaultTag:alertVisibility.showUncoded?'uncoded-ledger-v1':undefined,label:a.suspected,options:showInventoryAlerts?[{id:'negative-stock',label:(inventoryBalanceText[languageCode]||inventoryBalanceText.en).title}]:[],content:({settings})=><DashboardAlertsCard languageCode={languageCode} title={a.suspected} text={a} items={[]}>
 {showInventoryAlerts&&settings?.['negative-stock']!==false&&<InventoryBalanceAlerts key={'inventory:'+activeOrgId} orgId={activeOrgId} languageCode={languageCode} onNavigate={navigateToPath} canOpenHistory={canAccessPath('/inventory/movements',auth)}/>}
 {alertVisibility.showUncoded&&<AccountingAlerts key={activeOrgId} orgId={activeOrgId} languageCode={languageCode} onNavigate={navigateToPath} alertKinds="UNCODED_LEDGER" showEmpty={!showInventoryAlerts}/>}</DashboardAlertsCard>}]:[]),
 {id:"work-requests",newDefault:true,label:(workRequestText[languageCode]||workRequestText.en).title,content:<WorkRequestsCard key={activeOrgId+":"+activeProfile?.employeeId} orgId={activeOrgId} languageCode={languageCode}/>},
 ...(canShowApprovals(auth)?[{id:'approvals',label:({ko:'결재 현황',en:'Approvals',vi:'Phê duyệt'})[languageCode]||'Approvals',content:<ApprovalDashboardCard orgId={activeOrgId} role={activeProfile.orgRole} languageCode={languageCode} onNavigate={navigateToPath}/>}]:[]),
 ];
 return <DashboardWidgets canManageWidgetSettings={canManageRecipients} onWidgetSettings={widget=>setCompanyWidget({...widget,orgId:activeOrgId})} title={({ko:'대시보드',en:'Dashboard',vi:'Bảng điều khiển'})[languageCode]||'Dashboard'} widgets={widgets} companyId={activeOrgId} userId={auth.user?.id||activeProfile?.employeeId} languageCode={languageCode} onSaved={message=>showNotification(message,'success')}><QueryFeedback error={alertVisibility.error} onRetry={alertVisibility.retry}/>{canManageRecipients&&companyWidget?.orgId===activeOrgId&&<DashboardRecipientSettings key={activeOrgId} orgId={activeOrgId} widget={companyWidget} languageCode={languageCode} onClose={()=>setCompanyWidget(null)}/>}</DashboardWidgets>;
}
