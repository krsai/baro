import {canAccessPath} from './accessControl.js';
export const dashboardRole=auth=>auth.activeOrgRole||auth.activeProfile?.orgRole||auth.accessProfile?.orgRole||auth.devProfile?.orgRole;
const financeMenu=auth=>['/outsourcing-record','/bank-ledger','/invoices'].some(path=>canAccessPath(path,auth));
export const canShowAccountingAlerts=auth=>['ADMIN','ACCOUNTANT'].includes(dashboardRole(auth))&&financeMenu(auth);
export const canShowApprovals=auth=>['ADMIN','ACCOUNTANT','OPERATOR'].includes(dashboardRole(auth))&&financeMenu(auth);
