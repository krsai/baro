import {useCallback,useEffect,useState} from 'react';
import {requestJSON} from '../utils/apiClient';
import {getDefaultRoleAccessPolicy} from '../utils/roleAccessPolicyCore.mjs';

// Keep both industry drafts mounted while the administrator changes views.
export default function useIndustryMenuPolicy(enabled){
 const [loaded,setLoaded]=useState(null),[draft,setDraft]=useState({}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 useEffect(()=>{if(!enabled)return;let live=true;setLoading(true);setError('');requestJSON('/system/industry-menu-policy',{skipCache:true}).then(value=>{if(live){setLoaded(value);setDraft(value.subscribers||{});}}).catch(()=>live&&setError('failed')).finally(()=>live&&setLoading(false));return()=>{live=false;};},[enabled,reload]);
 const features=useCallback(type=>draft[type]||[...new Set(['DASHBOARD','BUSINESS',...Object.values(getDefaultRoleAccessPolicy()[type]||{}).flat()])].filter(feature=>loaded?.features.includes(feature)),[draft,loaded]);
 const toggle=(type,feature,checked)=>setDraft(previous=>{const current=previous[type]||features(type);return {...previous,[type]:checked?[...new Set([...current,feature])]:current.filter(value=>value!==feature)};});
 const dirty=!!loaded&&JSON.stringify(draft)!==JSON.stringify(loaded.subscribers||{});
 const save=async()=>{if(!dirty)return;setError('');try{const value=await requestJSON('/system/industry-menu-policy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:loaded.revision,industries:loaded.industries,subscribers:draft})});setLoaded(previous=>({...previous,...value}));setDraft(value.subscribers||{});}catch(e){setError(e.status===409?'conflict':'failed');throw e;}};
 return {loaded,features,toggle,dirty,save,error,loading,reload:()=>setReload(v=>v+1)};
}
