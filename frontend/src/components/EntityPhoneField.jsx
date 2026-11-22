import React,{useLayoutEffect,useRef} from 'react';
import { InputAdornment, TextField } from '@mui/material';
import {splitEntityPhone,phoneInputDisplay,phoneInputValue,phoneExample,phoneInputCountry} from '../utils/entityPhone.mjs';
import {getCurrentLanguageCode} from '../utils/appLanguage';

// Keep the stored international number intact until the user edits it.
export default function EntityPhoneField({country,value,onChange,InputProps,digitsOnly=true,localValue=false,inputRef:externalRef,inputProps,slotProps,languageCode=getCurrentLanguageCode(), ...props}) {
  const inputCountry=country||phoneInputCountry(value),example=phoneExample(inputCountry),{prefix}=splitEntityPhone(value,inputCountry),display=phoneInputDisplay(value,inputCountry);
  const ref=useRef(null),selection=useRef(null);
  const guide=({ko:'숫자만 입력',en:'Enter digits only',vi:'Chỉ nhập số'})[languageCode]||'Enter digits only';
  const change=(typed,caret=typed.length)=>{
    selection.current=typed.slice(0,caret).replace(/\D/g,'').length;
    const next=digitsOnly?phoneInputValue(typed,inputCountry,{localValue}):typed;
    onChange?.({target:{name:props.name,value:next}});
  };
  useLayoutEffect(()=>{const node=ref.current,count=selection.current;if(count===null||document.activeElement!==node)return;selection.current=null;let seen=0,index=0;for(;index<node.value.length&&seen<count;index++)if(/\d/.test(node.value[index]))seen++;node.setSelectionRange(index,index);},[display,value]);
  return <TextField fullWidth size="small" type="tel" {...props} placeholder={props.placeholder||example} value={display}
    inputRef={node=>{ref.current=node;if(typeof externalRef==='function')externalRef(node);else if(externalRef)externalRef.current=node;}}
    inputProps={{...inputProps,pattern:undefined,inputMode:'numeric',title:[guide,example].filter(Boolean).join(' · ')}}
    slotProps={{...slotProps,htmlInput:{...slotProps?.htmlInput,pattern:undefined,inputMode:'numeric',title:[guide,example].filter(Boolean).join(' · ')}}}
    InputProps={{ ...InputProps, startAdornment: prefix ? <InputAdornment position="start">{prefix}</InputAdornment> : undefined }}
    onKeyDown={event=>{
      props.onKeyDown?.(event);if(event.defaultPrevented||props.disabled||props.readOnly||InputProps?.readOnly)return;
      const node=event.target,start=node.selectionStart,end=node.selectionEnd;
      if(start!==end||!['Backspace','Delete'].includes(event.key))return;
      let index=event.key==='Backspace'?start-1:start;
      if(index<0||index>=node.value.length||/\d/.test(node.value[index]))return;
      const step=event.key==='Backspace'?-1:1;
      while(index>=0&&index<node.value.length&&!/\d/.test(node.value[index]))index+=step;
      if(index<0||index>=node.value.length)return;
      event.preventDefault();change(node.value.slice(0,index)+node.value.slice(index+1),event.key==='Backspace'?index:start);
    }} onChange={event=>change(event.target.value,event.target.selectionStart??event.target.value.length)} />;
}
