import React,{useEffect,useId,useRef} from 'react';
import {useAppActions} from '../context/AppContext';
import {noticeIsVisible,subscribeNoticeVisibility} from '../utils/noticeVisibility';

const contentKey=value=>React.Children.toArray(value).map(child=>React.isValidElement(child)?contentKey(child.props.children):String(child??'')).join('');
const actionKey=value=>React.Children.toArray(value).map(child=>React.isValidElement(child)?String(!!child.props.disabled)+actionKey(child.props.children):String(child??'')).join('');
const hasInteractive=value=>React.Children.toArray(value).some(child=>React.isValidElement(child)&&(child.props.onClick||child.props.href||hasInteractive(child.props.children)));

// One global toast path for declarative warnings, errors and action results.
export default function AppNotice({severity='success',children,action,onClose,eventKey}){
 const {showNotification,removeNotification}=useAppActions(),id=useId(),anchor=useRef(null),latest=useRef(null);
 latest.current={children,action,onClose};
 const message=contentKey(children),controls=actionKey([action,children]);
 useEffect(()=>{
  let shown=false;
  const sync=()=>{
   const visible=noticeIsVisible(anchor.current);
   if(visible&&!shown&&message){shown=true;showNotification(latest.current.children,severity,{source:id,dedupeKey:!latest.current.action&&!latest.current.onClose?severity+':'+message:undefined,action:latest.current.action,interactive:hasInteractive(latest.current.children),onClose:()=>latest.current.onClose?.()});}
   else if(!visible&&shown){shown=false;removeNotification?.(id);}
  };
  sync();const unsubscribe=subscribeNoticeVisibility(sync);
  return()=>{unsubscribe();removeNotification?.(id);};
 },[id,message,severity,eventKey,controls,showNotification,removeNotification]);
 return <span ref={anchor} hidden aria-hidden="true" data-app-notice/>;
}
