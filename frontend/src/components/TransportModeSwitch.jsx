import React,{useEffect,useRef,useState} from 'react';
import {ToggleButton,ToggleButtonGroup} from '@mui/material';

export default function TransportModeSwitch({label,options,value,onChange,disabled}){
 const selectedIndex=Math.max(0,options.findIndex(([key])=>key===value));
 const buttons=useRef([]),[focusIndex,setFocusIndex]=useState(selectedIndex);
 useEffect(()=>setFocusIndex(selectedIndex),[selectedIndex]);
 const keyboard=event=>{
  if(disabled||event.nativeEvent?.isComposing||event.ctrlKey||event.altKey||event.metaKey)return;
  const index=buttons.current.indexOf(event.target);
  if(index<0)return;
  if(event.key===' '){event.preventDefault();if(!event.repeat)onChange(options[index][0]);return;}
  const next=event.key==='Home'?0:event.key==='End'?options.length-1:['ArrowRight','ArrowDown'].includes(event.key)?(index+1)%options.length:['ArrowLeft','ArrowUp'].includes(event.key)?(index+options.length-1)%options.length:null;
  if(next==null)return;
  event.preventDefault();setFocusIndex(next);requestAnimationFrame(()=>buttons.current[next]?.focus());
 };
 return <ToggleButtonGroup exclusive role="group" aria-label={label} data-focus-next="group" value={value} disabled={disabled} onChange={(_,next)=>next&&onChange(next)} onKeyDown={keyboard}
  sx={{display:'grid',width:'100%',boxSizing:'border-box',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:.5,
   '& .MuiToggleButtonGroup-grouped':{m:0,minWidth:0,width:'100%',px:1,minHeight:36,whiteSpace:'normal'},
   '& .MuiToggleButtonGroup-grouped:not(:first-of-type)':{ml:0},
   '& .MuiToggleButtonGroup-grouped:last-of-type':{gridColumn:'1 / -1'},
   '@container (min-width: 640px)':{gridTemplateColumns:'repeat(5,minmax(0,1fr))','& .MuiToggleButtonGroup-grouped:last-of-type':{gridColumn:'auto'}}}}>
  {options.map(([key,text],index)=><ToggleButton key={key} ref={node=>{buttons.current[index]=node;}} value={key} data-initial-focus={value===key?'true':undefined} tabIndex={index===focusIndex?0:-1} onFocus={()=>setFocusIndex(index)}>{text}</ToggleButton>)}
 </ToggleButtonGroup>;
}
