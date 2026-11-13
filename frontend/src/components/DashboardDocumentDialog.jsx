import React,{lazy,Suspense,useCallback} from 'react';
import {Routes,Route,UNSAFE_RouteContext} from 'react-router-dom';
import {Button,CircularProgress,Dialog,DialogActions,DialogContent,DialogTitle} from '@mui/material';
import {AppActionsScope,useAppActions} from '../context/AppContext';
import {PageNamingProvider} from '../context/PageNamingContext';
import {useAuth} from '../context/AuthContext';
import {canAccessPath} from '../utils/accessControl';
import DashboardDocumentBoundary from './DashboardDocumentBoundary';
const Order=lazy(()=>import('../pages/App/Order'));
const Employee=lazy(()=>import('../pages/App/Employee'));
const Partners=lazy(()=>import('../pages/App/TradePartners'));
const Ledger=lazy(()=>import('../pages/App/BankLedgerEntry'));
const Expense=lazy(()=>import('../pages/App/TransactionRequestEntry'));
const Invoice=lazy(()=>import('../pages/App/invoice/InvoiceWorkspace'));
const TEXT={ko:{title:'원본 확인 · 수정',move:'원래 화면으로 이동'},en:{title:'Review · edit source',move:'Open full page'},vi:{title:'Xem · sửa bản gốc',move:'Mở trang đầy đủ'}};
// A dialog renders an absolute source route while /dashboard remains mounted.
// Reset only matched route ancestry; keep the real router, auth and app scopes.
const DOCUMENT_ROUTE_CONTEXT={outlet:null,matches:[],isDataRoute:false};
export default function DashboardDocumentDialog({row,languageCode,onClose,onNavigate}){
 const actions=useAppActions(),auth=useAuth(),t=TEXT[languageCode]||TEXT.en;
 const close=useCallback(()=>{if(actions.confirmDiscardUnsavedChanges())onClose();},[actions,onClose]);
 const navigate=useCallback((path,options)=>{if(options?.skipUnsavedChangesCheck){onClose();return;}if(!actions.confirmDiscardUnsavedChanges())return;if(['/bank-ledger','/outsourcing-record','/invoices'].includes(path)){onClose();return;}onClose();onNavigate(path,options);},[actions,onClose,onNavigate]);
 if(!row||!canAccessPath(row.path,auth))return null;
 return <Dialog open onClose={close} fullWidth maxWidth="xl"><DialogTitle>{t.title}</DialogTitle><DialogContent dividers sx={{
  '& .app-page':{minHeight:0},
  '& .app-page > .app-page-layout':{px:0,pb:0,minHeight:0},
  '& .app-page-header':{pt:0,bgcolor:'background.paper'},
 }}><PageNamingProvider path={row.path}><AppActionsScope navigateToPath={navigate}><DashboardDocumentBoundary key={row.path} languageCode={languageCode} onReload={()=>{if(actions.confirmDiscardUnsavedChanges())window.location.reload();}}><Suspense fallback={<CircularProgress size={24}/>}><UNSAFE_RouteContext.Provider value={DOCUMENT_ROUTE_CONTEXT}><Routes location={row.path}><Route path="/order" element={<Order/>}/><Route path="/employee" element={<Employee/>}/><Route path="/customer" element={<Partners initialType="CUSTOMER"/>}/><Route path="/bank-ledger/edit/:entryId" element={<Ledger/>}/><Route path="/outsourcing-record/edit/:sourceKind/:sourceId" element={<Expense/>}/><Route path="/invoices/:invoiceId" element={<Invoice view="detail"/>}/></Routes></UNSAFE_RouteContext.Provider></Suspense></DashboardDocumentBoundary></AppActionsScope></PageNamingProvider></DialogContent><DialogActions><Button onClick={()=>{if(actions.confirmDiscardUnsavedChanges()){onClose();onNavigate(row.path);}}}>{t.move}</Button></DialogActions></Dialog>;
}
