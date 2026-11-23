import React,{useEffect,useState} from 'react';
import {Box,Button,CircularProgress,Typography} from '@mui/material';
import {API_BASE} from '../utils/apiClient';
import {loadTextAcronyms} from '../utils/textAcronymLoader.mjs';
import {useLanguage} from '../context/LanguageContext';
import {subscribeWorkspaceDataChanged} from '../utils/workspaceDataEvents';

// Load once before editable forms mount. A failed load must never lowercase an
// unknown custom acronym; refreshes update spelling without replacing drafts.
export default function TextAcronymGate({children}){
 const {languageCode}=useLanguage(),[ready,setReady]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
 const t=languageCode==='ko'?{failed:'약어 사전을 불러오지 못했습니다.',retry:'다시 시도'}:languageCode==='vi'?{failed:'Không thể tải từ điển viết tắt.',retry:'Thử lại'}:{failed:'Could not load the acronym dictionary.',retry:'Retry'};
 useEffect(()=>{let live=true;setFailed(false);loadTextAcronyms(API_BASE).then(()=>{if(live)setReady(true);}).catch(()=>{if(live)setFailed(true);});return()=>{live=false;};},[retry]);
 useEffect(()=>{
  if(!ready)return;
  const refresh=()=>{if(document.visibilityState==='visible')void loadTextAcronyms(API_BASE,{force:true}).catch(()=>{});};
  const unsubscribe=subscribeWorkspaceDataChanged(event=>{if(event?.topics?.includes('text-acronyms'))refresh();});
  window.addEventListener('focus',refresh);return()=>{window.removeEventListener('focus',refresh);unsubscribe();};
 },[ready]);
 if(ready)return children;
 return <Box role={failed?'alert':undefined} sx={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:2}}>{failed?<><Typography>{t.failed}</Typography><Button onClick={()=>setRetry(n=>n+1)}>{t.retry}</Button></>:<CircularProgress/>}</Box>;
}
