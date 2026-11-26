import React,{createContext,useCallback,useContext,useEffect,useId,useRef,useState} from 'react';
import {Box,MenuItem,TextField} from '@mui/material';
import ListPagination from './ListPagination';

const Context=createContext(null);
export function DashboardPaginationHost({children,languageCode}){
 const [entries,setEntries]=useState([]),[selected,setSelected]=useState('');
 const register=useCallback((id,value)=>setEntries(current=>value?(current.some(item=>item.id===id)?current.map(item=>item.id===id?{id,...value}:item):[...current,{id,...value}]):current.filter(item=>item.id!==id)),[]);
 const active=entries.find(item=>item.id===selected)||entries[0];
 return <Context.Provider value={register}>{children}<Box data-dashboard-pagination-footer sx={{flexShrink:0,minHeight:52}}>
  <ListPagination languageCode={languageCode} previousDisabled={!active||active.previousDisabled} nextDisabled={!active||active.nextDisabled} onPrevious={active?.onPrevious} onNext={active?.onNext} leading={entries.length>1?<TextField select size="small" value={active.id} onChange={event=>setSelected(event.target.value)} slotProps={{select:{inputProps:{'aria-label':languageCode==='ko'?'\uBAA9\uB85D':languageCode==='vi'?'Danh S\u00E1ch':'List'}}}} sx={{maxWidth:220}}>{entries.map(item=><MenuItem key={item.id} value={item.id}>{item.label}</MenuItem>)}</TextField>:undefined}/>
 </Box></Context.Provider>;
}
export default function DashboardPagination(props){
 const register=useContext(Context),id=useId(),callbacks=useRef(props);
 callbacks.current=props;
 const {previousDisabled,nextDisabled,label}=props;
 useEffect(()=>{
  if(!register)return;
  register(id,{label,previousDisabled,nextDisabled,onPrevious:()=>callbacks.current.onPrevious?.(),onNext:()=>callbacks.current.onNext?.()});

 },[register,id,label,previousDisabled,nextDisabled]);
 useEffect(()=>()=>register?.(id,null),[register,id]);
 return register?null:<ListPagination {...props}/>;
}
