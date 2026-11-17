import {useEffect,useState} from 'react';
import {requestJSON,buildQueryString} from '../utils/apiClient';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
export default function usePendingApprovals(orgId,enabled){
 const [result,setResult]=useState(null);
 useEffect(()=>{
  if(!orgId||!enabled){setResult(null);return;}
  let alive=true,sequence=0,running=false,again=false;const controllers=new Set();
  const refresh=async()=>{
   if(document.visibilityState==='hidden')return;if(running){again=true;return;}running=true;
   const run=++sequence,controller=new AbortController();controllers.add(controller);
   try{
    const query=buildQueryString({orgId}),overviewQuery=buildQueryString({orgId,start:'0001-01-01',status:'UNAPPROVED',pageSize:10});
    const values=await Promise.allSettled([requestJSON('/expense-approval-overview'+overviewQuery,{skipCache:true,skipGlobalLoading:true,signal:controller.signal}),requestJSON('/expense-deletion-requests'+query,{skipCache:true,skipGlobalLoading:true,signal:controller.signal}),requestJSON('/change-approval-requests'+query,{skipCache:true,skipGlobalLoading:true,signal:controller.signal})]);
    if(alive&&run===sequence)setResult(previous=>{const counts=values.map((value,index)=>value.status==='fulfilled'?(index===0?Number(value.value.total)||0:Array.isArray(value.value)?value.value.length:0):(previous?.orgId===orgId?previous.counts?.[index]||0:0));return {orgId,counts,count:counts.reduce((sum,value)=>sum+value,0)};});
   }finally{controllers.delete(controller);running=false;if(again&&alive){again=false;void refresh();}}
  };
  refresh();
  const unsubscribe=subscribeWorkspaceDataChanged(event=>{if(Number(event.orgId)===Number(orgId)&&event.topics?.some(topic=>['expense-approvals','expense-requests','change-approvals','bank-ledger'].includes(topic)))refresh();});
  const visible=()=>{if(document.visibilityState!=='hidden')refresh();};window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{alive=false;unsubscribe();window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);controllers.forEach(controller=>controller.abort());};
 },[orgId,enabled]);
 return result?.orgId===orgId?result.count:0;
}
