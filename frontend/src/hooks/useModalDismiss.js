import {useCallback,useEffect,useRef} from 'react';
import {isModalEscape,registerModalDismiss} from '../utils/modalDismiss.mjs';

export default function useModalDismiss({open,rootRef,onClose,disableEscapeKeyDown=false,enabled=true}){
 const latest=useRef(null),pending=useRef(false);
 latest.current={onClose,disableEscapeKeyDown};
 const close=useCallback((event,reason)=>{
  // The fallback has already prevented the browser default. Native MUI calls
  // still need the same repeat/IME guard without disregarding caller locks.
  if(reason==='escapeKeyDown'&&(latest.current.disableEscapeKeyDown||!isModalEscape(event,true)))return;
  if(pending.current||!latest.current.onClose)return;
  pending.current=true;
  try{
   const result=latest.current.onClose(event,reason);
   if(result?.then)return Promise.resolve(result).finally(()=>{pending.current=false;});
   pending.current=false;return result;
  }catch(error){pending.current=false;throw error;}
 },[]);
 useEffect(()=>{
  if(!open||!enabled)return;
  return registerModalDismiss({root:()=>rootRef.current,disabled:()=>latest.current.disableEscapeKeyDown,close},rootRef.current?.ownerDocument||document);
 },[open,enabled,rootRef,close]);
 return close;
}
