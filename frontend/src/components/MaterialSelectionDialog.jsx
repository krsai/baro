import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import MaterialItemPicker from './MaterialItemPicker';
export default forwardRef(function MaterialSelectionDialog({orgId,languageCode},ref){
 const [input,setInput]=useState(null),resolver=useRef(null);
 const finish=value=>{setInput(null);resolver.current?.(value);resolver.current=null;};
 useImperativeHandle(ref,()=>({prepare:value=>new Promise(resolve=>{resolver.current?.(null);resolver.current=resolve;setInput({...value,key:crypto.randomUUID()});})}),[]);
 useEffect(()=>{finish(null);return()=>{resolver.current?.(null);resolver.current=null;};},[orgId]);
 return input?createPortal(<MaterialItemPicker key={input.key} orgId={orgId} baseId={input.baseId} context={input.context} languageCode={languageCode} value={input.value} snapshot={input.snapshot} selectVariants searchOnly autoOpen onCancel={()=>finish(null)} onChange={row=>{if(row)finish(row);}}/>,document.body):null;
});
