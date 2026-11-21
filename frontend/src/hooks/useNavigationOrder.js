import {useCallback,useEffect,useRef,useState} from 'react';
import {requestJSON} from '../utils/apiClient';
const listeners=new Set();

export default function useNavigationOrder(enabled,scope='',system=false){
 const readUrl=system?'/system/navigation-order':'/navigation/menu-order';
 const [loaded,setLoaded]=useState(null),[draft,setDraft]=useState({}),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const dirty=!!loaded&&JSON.stringify(draft)!==JSON.stringify(loaded.order),dirtyRef=useRef(dirty),busy=useRef(false),generation=useRef(0),reading=useRef(false);
 dirtyRef.current=dirty;
 const accept=useCallback(value=>{setLoaded(value);setDraft(value.order);setError('');},[]);
 const reload=useCallback(async({discard=false}={})=>{
  if(!enabled||(!discard&&dirtyRef.current)||busy.current||reading.current)return;
  const token=generation.current;reading.current=true;
  setLoading(true);
  try{const value=await requestJSON(readUrl,{skipCache:true,skipGlobalLoading:true});if(token===generation.current&&(discard||!dirtyRef.current)&&!busy.current)accept(value);}catch{if(token===generation.current)setError('failed');}finally{if(token===generation.current){reading.current=false;setLoading(false);}}
 },[enabled,scope,accept,readUrl]);
 useEffect(()=>{
  if(!enabled){setLoaded(null);setDraft({});return;}
  let live=true;generation.current++;reading.current=false;setLoading(true);setLoaded(null);setDraft({});
  requestJSON(readUrl,{skipCache:true,skipGlobalLoading:true}).then(value=>live&&accept(value)).catch(()=>live&&setError('failed')).finally(()=>live&&setLoading(false));
  const receive=value=>{if(live&&!dirtyRef.current&&!busy.current)accept(value);};listeners.add(receive);
  const focus=()=>{if(document.visibilityState==='visible')reload();};
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return()=>{live=false;generation.current++;listeners.delete(receive);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);};
 },[enabled,scope,accept,reload,readUrl]);
 const save=async()=>{
  if(!loaded||!dirty)return;
  const token=generation.current;busy.current=true;
  try{const value=await requestJSON('/system/navigation-order',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:loaded.revision,order:draft})});if(token===generation.current)accept(value);listeners.forEach(listener=>listener(value));}
  catch(e){if(token===generation.current)setError(e.status===409?'conflict':'failed');throw e;}finally{busy.current=false;}
 };
 return {loaded,draft,setDraft,dirty,error,loading,reload,save};
}
