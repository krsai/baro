import {useEffect,useRef} from 'react';
// A visibility transition is not a data change. Keep the current request/result
// when hiding a tab, and run only a new scope/filter/event revision on return.
export default function useChangeDrivenEffect(effect,dependencies,{active=true,blocked=false}={}){
 const current=useRef(effect);current.current=effect;
 const previous=useRef(null),cleanup=useRef(null);
 useEffect(()=>{
  if(!active||blocked)return;
  if(previous.current&&previous.current.length===dependencies.length&&dependencies.every((value,index)=>Object.is(value,previous.current[index])))return;
  cleanup.current?.();previous.current=[...dependencies];cleanup.current=current.current();
 },[active,blocked,...dependencies]);
 useEffect(()=>()=>{cleanup.current?.();cleanup.current=null;previous.current=null;},[]);
}
