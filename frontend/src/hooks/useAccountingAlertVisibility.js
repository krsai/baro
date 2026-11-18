import {useEffect,useRef,useState} from 'react';
import {canShowAccountingAlerts,dashboardRole} from '../utils/dashboardAccess.mjs';
import {canAccessPath} from '../utils/accessControl';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';

export default function useAccountingAlertVisibility(auth){
 const {active}=useRequestScopeContext(),orgId=auth.activeOrgId,role=dashboardRole(auth),scope=String(orgId)+':'+String(auth.activeProfile?.employeeId)+':'+role;
 const needsScope=!!orgId&&role==='OPERATOR'&&canAccessPath('/dashboard',auth)&&['/bank-ledger','/outsourcing-record','/invoices'].some(path=>canAccessPath(path,auth));
 const [result,setResult]=useState(null),[error,setError]=useState(false),[reload,setReload]=useState(0),[visible,setVisible]=useState(()=>document.visibilityState!=='hidden');
 const lastAttempt=useRef(0),failed=useRef(false),lastFailedScope=useRef(null);
 useEffect(()=>{const visibility=()=>setVisible(document.visibilityState!=='hidden'),focus=()=>{if(!failed.current&&Date.now()-lastAttempt.current>30000)setReload(n=>n+1);};document.addEventListener('visibilitychange',visibility);window.addEventListener('focus',focus);return()=>{document.removeEventListener('visibilitychange',visibility);window.removeEventListener('focus',focus);};},[]);
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&event.topics?.includes('accounting-alerts'))setReload(n=>n+1);}),[orgId]);
 useEffect(()=>{if(!needsScope||!active||!visible||lastFailedScope.current===scope+':'+reload)return;let live=true;const controller=new AbortController();lastAttempt.current=Date.now();
  // Keep an already mounted widget while scope changes so an open source editor
  // survives. Its list/ack APIs independently enforce the latest recipient rule.
  requestJSON('/dashboard/accounting-alert-scope'+buildQueryString({orgId}),{skipCache:true,skipGlobalLoading:true,signal:controller.signal}).then(value=>{if(live){setResult(current=>({scope,shown:value.handled||current?.scope===scope&&current.shown}));setError(false);failed.current=false;}}).catch(e=>{if(live&&e.name!=='AbortError'){setError(true);failed.current=true;lastFailedScope.current=scope+':'+reload;}});
  return()=>{live=false;controller.abort();};
 },[orgId,scope,needsScope,active,visible,reload]);
 return {show:canShowAccountingAlerts(auth)||needsScope&&result?.scope===scope&&result.shown,error:needsScope&&error,retry:()=>setReload(n=>n+1)};
}
