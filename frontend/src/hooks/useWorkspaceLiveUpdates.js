import {REFERENCE_SETTINGS_TOPICS} from '../utils/referenceSettingsEvents.mjs';
import {useEffect,useRef} from 'react';
import {fetchWorkspaceEvents,clearGetResponseCache} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {LIVE_TOPICS,readWorkspaceEvents} from '../utils/workspaceLiveEvents.mjs';
export default function useWorkspaceLiveUpdates(orgId,accessToken){
 const revisions=useRef(new Map());
 useEffect(()=>{
  if(!orgId)return;
  let disposed=false,controller=null,retry=null,attempt=0,batch=null,unscopedOrders=false;
  const topics=new Set(),orderIds=new Set(),pendingVersions=new Map();
  const known=revisions.current.get(orgId)||new Map();revisions.current.set(orgId,known);
  const emit=()=>{
   batch=null;if(disposed||document.visibilityState==='hidden')return;
   clearGetResponseCache();
   emitWorkspaceDataChanged({orgId,topics:[...topics],orderIds:unscopedOrders?[]:[...orderIds],source:'server-change'});
   for(const [key,value] of pendingVersions)known.set(key,value);
   pendingVersions.clear();
   topics.clear();orderIds.clear();unscopedOrders=false;
  };
  const change=event=>{
   if(!Array.isArray(event.topics))return;
   const referenceOnly=event.orgId===0&&event.topics.every(topic=>REFERENCE_SETTINGS_TOPICS.includes(topic));
   if(orgId==='SYSTEM'?event.orgId!==0:Number(event.orgId)!==Number(orgId)&&!referenceOnly)return;
   for(const [key,value] of Object.entries(event.versions||{})){
    const previous=pendingVersions.get(key)??known.get(key);
    if(/^\d+$/.test(value)&&(previous===undefined||BigInt(value)>BigInt(previous)))pendingVersions.set(key,value);
   }
   if(event.topics.includes('order-records')){
    if(typeof event.orderId==='string'&&event.orderId)orderIds.add(event.orderId);
    else unscopedOrders=true;
   }
   for(const topic of event.topics)if(LIVE_TOPICS.includes(topic))topics.add(topic);
   if(topics.size&&!batch)batch=setTimeout(emit,200);
  };
  const connect=async()=>{
   if(disposed||controller||document.visibilityState==='hidden')return;
   const current=new AbortController();controller=current;const startedAt=Date.now();let ready=false;
   try{
    const response=await fetchWorkspaceEvents(orgId,current.signal,accessToken);
    await readWorkspaceEvents(response,{signal:current.signal,onReady:snapshot=>{
     ready=true;
     const changed={};
     for(const [key,value] of Object.entries(snapshot?.versions||{})){
      if(!/^\d+$/.test(value))continue;
      const previous=pendingVersions.get(key)??known.get(key);
      if(previous===undefined)known.set(key,value);
      else if(BigInt(value)>BigInt(previous))changed[key]=value;
     }
     if(Object.keys(changed).length)change({orgId:orgId==='SYSTEM'?0:orgId,topics:[...new Set(Object.keys(changed).map(key=>key.split(':').at(-1)))],versions:changed});
    },onChange:change});
   }catch(error){if([401,403].includes(error.status))attempt=6;}
   finally{
    if(controller===current)controller=null;
    if(ready&&Date.now()-startedAt>=30000)attempt=0;
    if(!disposed&&!current.signal.aborted&&attempt<6&&document.visibilityState!=='hidden')retry=setTimeout(connect,Math.min(60000,1000*2**attempt++));
   }
  };
  const visible=()=>{clearTimeout(retry);if(document.visibilityState==='hidden'){controller?.abort();controller=null;}else{if(topics.size&&!batch)batch=setTimeout(emit,200);void connect();}};
  void connect();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;controller?.abort();clearTimeout(retry);clearTimeout(batch);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[orgId,accessToken]);
}
