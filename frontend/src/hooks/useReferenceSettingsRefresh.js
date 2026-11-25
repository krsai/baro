import {useEffect,useRef,useState} from 'react';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {REFERENCE_SETTINGS_TOPICS} from '../utils/referenceSettingsEvents.mjs';
// Reference settings have SYSTEM scope; never interpret these notices as company access.
export default function useReferenceSettingsRefresh({onRefresh,blocked=false,enabled=true}) {
 const {active}=useRequestScopeContext();
 const [version,setVersion]=useState(0);
 const handled=useRef(0),latest=useRef(null),pump=useRef(null);
 latest.current={onRefresh,enabled,active,blocked,version};
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{
  if(event?.source==='transaction-request'||event?.topics?.some(topic=>[...REFERENCE_SETTINGS_TOPICS.filter(topic=>topic!=='text-acronyms'),'customers','business-partners'].includes(topic)))setVersion(value=>value+1);
 }),[]);
 useEffect(()=>{
  let disposed=false,running=false;
  const refresh=async()=>{
   const state=latest.current;
   if(disposed||running||!state.enabled||!state.active||state.blocked||document.visibilityState==='hidden'||state.version===handled.current)return;
   running=true;
   try{
    const result=await state.onRefresh();
    if(result===false)return;
    if(!disposed)handled.current=state.version;
   }catch{return;}
   finally{running=false;}
   if(!disposed&&latest.current.version!==handled.current)void refresh();
  };
  pump.current=refresh;
  window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
  return()=>{disposed=true;pump.current=null;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
 },[]);
 useEffect(()=>{void pump.current?.();},[version,active,blocked,enabled]);
}
