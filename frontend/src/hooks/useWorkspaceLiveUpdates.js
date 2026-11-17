import {REFERENCE_SETTINGS_TOPICS} from '../utils/referenceSettingsEvents.mjs';
import {useEffect,useRef} from 'react';
import {fetchWorkspaceEvents,clearGetResponseCache} from '../utils/apiClient';
import {emitWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {LIVE_TOPICS,readWorkspaceEvents} from '../utils/workspaceLiveEvents.mjs';
export default function useWorkspaceLiveUpdates(orgId,accessToken){
 const revisions=useRef(new Map());
 useEffect(()=>{
  if(!orgId)return;
  let disposed=false,controller=null,retry=null,attempt=0,batch=null;const topics=new Set();
  const known=revisions.current.get(orgId)||new Map();revisions.current.set(orgId,known);
  const acceptVersions=values=>{for(const [key,value] of Object.entries(values||{}))if(/^\d+$/.test(value)&&(!known.has(key)||BigInt(value)>BigInt(known.get(key))))known.set(key,value);};
  const emit=()=>{batch=null;if(disposed||document.visibilityState==='hidden')return;clearGetResponseCache();emitWorkspaceDataChanged({orgId,topics:[...topics],source:'server-change'});topics.clear();};
  const change=event=>{
   if(!Array.isArray(event.topics))return;
   const referenceOnly=event.orgId===0&&event.topics.every(topic=>REFERENCE_SETTINGS_TOPICS.includes(topic));
   if(orgId==='SYSTEM'?event.orgId!==0:Number(event.orgId)!==Number(orgId)&&!referenceOnly)return;
   acceptVersions(event.versions);
   for(const topic of event.topics)if(LIVE_TOPICS.includes(topic))topics.add(topic);
   if(topics.size&&!batch)batch=setTimeout(emit,200);
  };
  const connect=async()=>{
   if(disposed||controller||document.visibilityState==='hidden')return;
   const current=new AbortController();controller=current;const startedAt=Date.now();let ready=false;
   try{
    const response=await fetchWorkspaceEvents(orgId,current.signal,accessToken);
    await readWorkspaceEvents(response,{signal:current.signal,onReady:snapshot=>{ready=true;const changed=new Set();for(const [key,value] of Object.entries(snapshot?.versions||{})){if(/^\d+$/.test(value)&&known.has(key)&&BigInt(value)>BigInt(known.get(key)))changed.add(key.split(':').at(-1));}acceptVersions(snapshot?.versions);if(changed.size)change({orgId:orgId==='SYSTEM'?0:orgId,topics:[...changed]});},onChange:change});
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
