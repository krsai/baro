import {REFERENCE_SETTINGS_TOPICS} from '../utils/referenceSettingsEvents.mjs';
import {useEffect} from 'react';
import {fetchWorkspaceEvents,clearGetResponseCache} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {LIVE_TOPICS,readWorkspaceEvents} from '../utils/workspaceLiveEvents.mjs';
export default function useWorkspaceLiveUpdates(orgId,accessToken){
 useEffect(()=>{
  if(!orgId)return;
  let disposed=false,controller=null,retry=null,attempt=0,batch=null,lastResync=0;const topics=new Set();const resyncTopics=orgId==='SYSTEM'?REFERENCE_SETTINGS_TOPICS:LIVE_TOPICS.filter(topic=>!REFERENCE_SETTINGS_TOPICS.includes(topic));
  const emit=()=>{batch=null;if(disposed||document.visibilityState==='hidden')return;clearGetResponseCache();emitWorkspaceDataChanged({orgId,topics:[...topics],source:'server-change'});topics.clear();};
  const change=event=>{
   if((orgId==='SYSTEM'?event.orgId!==0:Number(event.orgId)!==Number(orgId))||!Array.isArray(event.topics))return;
   for(const topic of event.topics)if(LIVE_TOPICS.includes(topic))topics.add(topic);
   if(topics.size&&!batch)batch=setTimeout(emit,200);
  };
  const connect=async()=>{
   if(disposed||controller||document.visibilityState==='hidden')return;
   const current=new AbortController();controller=current;const startedAt=Date.now();let ready=false;
   try{
    const response=await fetchWorkspaceEvents(orgId,current.signal,accessToken);
    await readWorkspaceEvents(response,{signal:current.signal,onReady:()=>{ready=true;lastResync=Date.now();change({orgId:orgId==='SYSTEM'?0:orgId,topics:resyncTopics});},onChange:change});
   }catch(error){if([401,403].includes(error.status))attempt=6;}
   finally{
    if(controller===current)controller=null;
    if(ready&&Date.now()-startedAt>=30000)attempt=0;
    if(!disposed&&!current.signal.aborted&&attempt<6&&document.visibilityState!=='hidden')retry=setTimeout(connect,Math.min(60000,1000*2**attempt++));
   }
  };
  const visible=()=>{clearTimeout(retry);if(document.visibilityState==='hidden'){controller?.abort();controller=null;}else{if(controller&&Date.now()-lastResync>=30000){lastResync=Date.now();change({orgId:orgId==='SYSTEM'?0:orgId,topics:resyncTopics});}void connect();}};
  void connect();window.addEventListener('focus',visible);document.addEventListener('visibilitychange',visible);
  return()=>{disposed=true;controller?.abort();clearTimeout(retry);clearTimeout(batch);window.removeEventListener('focus',visible);document.removeEventListener('visibilitychange',visible);};
 },[orgId,accessToken]);
}
