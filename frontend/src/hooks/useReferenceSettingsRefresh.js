import {useEffect,useRef,useState} from 'react';
import {useRequestScopeContext} from '../context/RequestScopeContext';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';
import {REFERENCE_SETTINGS_TOPICS} from '../utils/referenceSettingsEvents.mjs';
// Reference settings have SYSTEM scope; never interpret these notices as company access.
export default function useReferenceSettingsRefresh({onRefresh,blocked=false,enabled=true}) {
 const {active}=useRequestScopeContext();
 const [version,setVersion]=useState(0);
 const handled=useRef(0),latest=useRef(onRefresh);latest.current=onRefresh;
 useEffect(()=>subscribeWorkspaceDataChanged(event=>{
  if(event?.source==='transaction-request'||event?.topics?.some(topic=>[...REFERENCE_SETTINGS_TOPICS,'customers','business-partners'].includes(topic)))setVersion(value=>value+1);
 }),[]);
 useEffect(()=>{
  if(!enabled||!active||blocked||version===handled.current)return;
  handled.current=version;
  void latest.current();
 },[version,active,blocked,enabled]);
}
