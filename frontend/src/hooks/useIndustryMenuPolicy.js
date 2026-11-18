import {useCallback,useEffect,useState} from 'react';
import {requestJSON} from '../utils/apiClient';
import {getDefaultRoleAccessPolicy} from '../utils/roleAccessPolicyCore.mjs';
import {INDUSTRY_SPECIFIC_FEATURES} from '../utils/industryMenuFeatures.mjs';
import {SERVICE_FEATURES} from '../utils/serviceCompany.mjs';
const types=['MANUFACTURER','SERVICE'];
const normalize=value=>({...value,subscribers:Object.fromEntries(types.map(type=>[type,[...new Set([...(value.fullScopeTypes?.includes(type)?[]:value.features.filter(feature=>!INDUSTRY_SPECIFIC_FEATURES.includes(feature))),...(value.subscribers?.[type]||Object.values(getDefaultRoleAccessPolicy()[type]).flat())])].filter(feature=>type==='SERVICE'?SERVICE_FEATURES.includes(feature):feature!=='FREIGHT')]))});
export default function useIndustryMenuPolicy(enabled){
 const [loaded,setLoaded]=useState(null),[draft,setDraft]=useState({}),[error,setError]=useState(''),[loading,setLoading]=useState(true),[reload,setReload]=useState(0);
 useEffect(()=>{if(!enabled)return;let live=true;setLoading(true);setError('');requestJSON('/system/industry-menu-policy',{skipCache:true}).then(value=>{if(live){const normalized=normalize(value);setLoaded(normalized);setDraft(normalized.subscribers);}}).catch(()=>live&&setError('failed')).finally(()=>live&&setLoading(false));return()=>{live=false;};},[enabled,reload]);
 const features=useCallback(type=>draft[type]||[],[draft]);
 const toggle=(type,feature,checked)=>setDraft(previous=>{const current=previous[type]||[];return {...previous,[type]:checked?[...new Set([...current,feature])]:current.filter(value=>value!==feature)};});
 const dirty=!!loaded&&JSON.stringify(draft)!==JSON.stringify(loaded.subscribers);
 const save=async()=>{if(!dirty)return;setError('');try{const value=await requestJSON('/system/industry-menu-policy',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:loaded.revision,industries:loaded.industries,fullScopeTypes:types,subscribers:draft})});setLoaded(previous=>({...previous,...value}));setDraft(value.subscribers||{});}catch(e){setError(e.status===409?'conflict':'failed');throw e;}};
 return {loaded,features,toggle,dirty,save,error,loading,reload:()=>setReload(v=>v+1)};
}
